import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { arenaDecisionSchema, type ArenaDecision } from '@marxmatrix/contracts';
import { createHash } from 'node:crypto';
import { DomainError } from '../common/domain-error.js';
import { ArenaEngine } from '../arena/engine/arena-engine.js';
import { ArenaEngineError, type ArenaEvent } from '../arena/engine/arena.types.js';
import { Room } from '../rooms/schemas/room.schema.js';
import { Game, type GameDocument, type PendingGameEvent } from './schemas/game.schema.js';
import { GameEvent, type GameEventDocument } from './schemas/game-event.schema.js';

const id = (value: string, code = 'GAME_NOT_FOUND'): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value)) throw new DomainError(code, 'Game was not found.', 404);
  return new Types.ObjectId(value);
};

@Injectable()
export class GamesService {
  public constructor(
    @InjectModel(Game.name) private readonly games: Model<Game>,
    @InjectModel(GameEvent.name) private readonly events: Model<GameEvent>,
    @InjectModel(Room.name) private readonly rooms: Model<Room>
  ) {}

  async createForStartedRoom(roomId: string): Promise<GameDocument> {
    const room = await this.rooms.findById(id(roomId, 'ROOM_NOT_FOUND')).exec();
    if (!room || room.phase !== 'started')
      throw new DomainError('ROOM_NOT_FOUND', 'Room was not found.', 404);
    const existing = await this.games.findOne({ roomId: room._id }).exec();
    if (existing) {
      await this.flushPendingEvents(existing._id);
      return (await this.games.findById(existing._id).exec()) ?? existing;
    }
    const engine = new ArenaEngine(room.config);
    const initial = engine.createInitialState(
      new Types.ObjectId().toHexString(),
      room.players.map((player) => ({ id: String(player.userId), name: player.displayName })),
      Date.now()
    );
    const transition = engine.start(initial, Date.now());
    try {
      const game = await this.games.create({
        roomId: room._id,
        config: room.config,
        snapshot: transition.state,
        stateVersion: transition.state.stateVersion,
        eventSequence: transition.state.eventSequence,
        appliedIdempotencyKeys: [],
        pendingEvents: this.outbox(transition.events)
      });
      await this.flushPendingEvents(game._id);
      return (await this.games.findById(game._id).exec()) ?? game;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        const game = await this.games.findOne({ roomId: room._id }).exec();
        if (game) {
          await this.flushPendingEvents(game._id);
          return (await this.games.findById(game._id).exec()) ?? game;
        }
      }
      throw error;
    }
  }

  async get(gameId: string, userId: string): Promise<GameDocument> {
    const game = await this.games.findById(id(gameId)).exec();
    if (!game) throw new DomainError('GAME_NOT_FOUND', 'Game was not found.', 404);
    await this.assertPlayer(game.roomId, userId);
    await this.flushPendingEvents(game._id);
    const current = (await this.games.findById(game._id).exec()) ?? game;
    const deadline =
      current.snapshot.deadlineAt === null ? Number.NaN : Date.parse(current.snapshot.deadlineAt);
    const now = Date.now();
    if (
      Number.isFinite(deadline) &&
      deadline <= now &&
      ['countdown', 'decision_open'].includes(current.snapshot.phase)
    )
      return this.recoverOverdue(gameId, now);
    return current;
  }

  async eventsFor(gameId: string, userId: string, after = 0): Promise<GameEventDocument[]> {
    const game = await this.get(gameId, userId);
    return this.events
      .find({ gameId: game._id, sequence: { $gt: after } })
      .sort({ sequence: 1 })
      .exec();
  }

  async replay(gameId: string, userId: string) {
    const game = await this.get(gameId, userId);
    return {
      game,
      events: await this.events.find({ gameId: game._id }).sort({ sequence: 1 }).exec()
    };
  }

  async submitDecision(
    gameId: string,
    userId: string,
    decision: ArenaDecision
  ): Promise<GameDocument> {
    const game = await this.get(gameId, userId);
    if (decision.gameId !== gameId)
      throw new DomainError('GAME_ID_MISMATCH', 'Decision targets a different game.', 400);
    if (game.appliedIdempotencyKeys.includes(decision.idempotencyKey)) return game;
    const engine = new ArenaEngine(game.config);
    let transition;
    try {
      transition = engine.submitDecision(game.snapshot, userId, decision, Date.now());
    } catch (error) {
      throw this.engineError(error);
    }
    const updated = await this.games
      .findOneAndUpdate(
        {
          _id: game._id,
          stateVersion: game.stateVersion,
          appliedIdempotencyKeys: { $ne: decision.idempotencyKey }
        },
        {
          $set: {
            snapshot: transition.state,
            stateVersion: transition.state.stateVersion,
            eventSequence: transition.state.eventSequence
          },
          $addToSet: { appliedIdempotencyKeys: decision.idempotencyKey },
          $push: {
            pendingEvents: { $each: this.outbox(transition.events, decision.idempotencyKey) }
          }
        },
        { returnDocument: 'after' }
      )
      .exec();
    if (!updated) {
      const persisted = await this.games.findById(game._id).exec();
      if (persisted?.appliedIdempotencyKeys.includes(decision.idempotencyKey)) {
        await this.flushPendingEvents(persisted._id);
        return (await this.games.findById(persisted._id).exec()) ?? persisted;
      }
      throw new DomainError(
        'STALE_STATE_VERSION',
        'The game changed before the decision was saved.',
        409
      );
    }
    await this.flushPendingEvents(updated._id);
    return (await this.games.findById(updated._id).exec()) ?? updated;
  }

  async recoverOverdue(gameId: string, now = Date.now()): Promise<GameDocument> {
    const game = await this.games.findById(id(gameId)).exec();
    if (!game) throw new DomainError('GAME_NOT_FOUND', 'Game was not found.', 404);
    await this.flushPendingEvents(game._id);
    const durableGame = (await this.games.findById(game._id).exec()) ?? game;
    const engine = new ArenaEngine(durableGame.config);
    let transition;
    try {
      transition = engine.resolveRound(durableGame.snapshot, now);
    } catch (error) {
      throw this.engineError(error);
    }
    const updated = await this.games
      .findOneAndUpdate(
        { _id: durableGame._id, stateVersion: durableGame.stateVersion },
        {
          $set: {
            snapshot: transition.state,
            stateVersion: transition.state.stateVersion,
            eventSequence: transition.state.eventSequence
          },
          $push: { pendingEvents: { $each: this.outbox(transition.events) } }
        },
        { returnDocument: 'after' }
      )
      .exec();
    if (!updated)
      throw new DomainError('STALE_STATE_VERSION', 'The game changed during recovery.', 409);
    await this.flushPendingEvents(updated._id);
    return (await this.games.findById(updated._id).exec()) ?? updated;
  }

  async submitBotDecisions(gameId: string): Promise<GameDocument> {
    let current = await this.games.findById(id(gameId)).exec();
    if (!current) throw new DomainError('GAME_NOT_FOUND', 'Game was not found.', 404);
    const room = await this.rooms.findById(current.roomId).exec();
    if (!room) throw new DomainError('GAME_NOT_FOUND', 'Game was not found.', 404);
    const botIds = room.players
      .filter((player) => player.isBot)
      .map((player) => String(player.userId))
      .sort();
    for (const botId of botIds) {
      current = (await this.games.findById(current._id).exec()) ?? current;
      if (current.snapshot.decisions[botId] !== undefined) continue;
      const company = current.snapshot.companies.find((candidate) => candidate.playerId === botId);
      if (!company || company.bankrupt) continue;
      const config = current.config;
      const decision = arenaDecisionSchema.parse({
        gameId,
        idempotencyKey: this.botIdempotencyKey(gameId, current.snapshot.round, botId),
        round: current.snapshot.round,
        expectedStateVersion: current.stateVersion,
        hiringChange: Math.min(config.maximumHiringChange, Math.max(config.minimumHiringChange, 0)),
        wageAdjustment: Math.min(
          config.maximumWageAdjustment,
          Math.max(config.minimumWageAdjustment, 0)
        ),
        automationInvestment: 0,
        price: Math.min(config.maximumPrice, Math.max(config.minimumPrice, company.price)),
        qualityMarketingInvestment: 0,
        inventoryTarget: Math.min(
          config.maximumInventoryTarget,
          Math.max(0, company.inventory + config.baseDemandPerCompany)
        )
      });
      current = await this.submitDecision(gameId, botId, decision);
    }
    return current;
  }

  private async assertPlayer(roomId: Types.ObjectId, userId: string): Promise<void> {
    const room = await this.rooms
      .findOne({ _id: roomId, 'players.userId': id(userId, 'ROOM_NOT_FOUND') })
      .exec();
    if (!room) throw new DomainError('GAME_NOT_FOUND', 'Game was not found.', 404);
  }
  async flushPendingEvents(gameId: string | Types.ObjectId): Promise<void> {
    const gameObjectId = typeof gameId === 'string' ? id(gameId) : gameId;
    const game = await this.games.findById(gameObjectId).lean().exec();
    const pending = game?.pendingEvents ?? [];
    if (pending.length === 0) return;
    try {
      await this.events.bulkWrite(
        pending.map((event) => ({
          updateOne: {
            filter: { gameId: gameObjectId, sequence: event.sequence },
            update: {
              $setOnInsert: {
                gameId: gameObjectId,
                sequence: event.sequence,
                type: event.type,
                round: event.round,
                playerId: event.playerId,
                idempotencyKey: event.idempotencyKey,
                payload: event.payload,
                createdAt: event.createdAt
              }
            },
            upsert: true
          }
        })),
        { ordered: false }
      );
    } catch {
      // Some unordered upserts may have succeeded. The query below is authoritative.
    }
    const persisted = await this.events
      .find({ gameId: gameObjectId, sequence: { $in: pending.map((event) => event.sequence) } })
      .select({ sequence: 1, _id: 0 })
      .lean()
      .exec();
    const sequences = persisted.map((event) => event.sequence);
    if (sequences.length > 0)
      await this.games
        .updateOne(
          { _id: gameObjectId },
          { $pull: { pendingEvents: { sequence: { $in: sequences } } } }
        )
        .exec();
  }
  private outbox(events: readonly ArenaEvent[], idempotencyKey?: string): PendingGameEvent[] {
    const createdAt = new Date();
    return events.map((event) => ({
      sequence: event.sequence,
      type: event.type,
      round: event.round,
      playerId:
        event.playerId && Types.ObjectId.isValid(event.playerId) ? id(event.playerId) : null,
      idempotencyKey: event.type === 'decision_accepted' ? (idempotencyKey ?? null) : null,
      payload: {
        ...(event.payload ?? {}),
        ...(event.crisis === undefined ? {} : { crisis: event.crisis })
      },
      createdAt
    }));
  }
  private botIdempotencyKey(gameId: string, round: number, botId: string): string {
    const hash = createHash('sha256').update(`${gameId}:${round}:${botId}`).digest('hex');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  }
  private engineError(error: unknown): DomainError {
    if (error instanceof ArenaEngineError) return new DomainError(error.code, error.message, 409);
    throw error;
  }
}
