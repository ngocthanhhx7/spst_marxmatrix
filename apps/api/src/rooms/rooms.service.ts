import { InjectModel } from '@nestjs/mongoose';
import { Injectable } from '@nestjs/common';
import { gameConfigSchema, type GameConfig } from '@marxmatrix/contracts';
import { Model, Types } from 'mongoose';
import { DomainError } from '../common/domain-error.js';
import { defaultArenaConfig } from '../arena/engine/arena.config.js';
import { Room, type RoomDocument } from './schemas/room.schema.js';

const ROOM_TTL_MS = 2 * 60 * 60 * 1000;
const objectId = (value: string): Types.ObjectId => {
  if (!Types.ObjectId.isValid(value))
    throw new DomainError('ROOM_NOT_FOUND', 'Room was not found.', 404);
  return new Types.ObjectId(value);
};

@Injectable()
export class RoomsService {
  public constructor(@InjectModel(Room.name) private readonly rooms: Model<Room>) {}

  async create(
    ownerId: string,
    displayName: string,
    config?: { [K in keyof GameConfig]?: GameConfig[K] | undefined }
  ): Promise<RoomDocument> {
    const now = new Date();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        return await this.rooms.create({
          code: this.code(),
          hostId: objectId(ownerId),
          players: [
            { userId: objectId(ownerId), displayName: this.name(displayName), isBot: false }
          ],
          readyPlayerIds: [],
          phase: 'lobby',
          config: gameConfigSchema.parse({ ...defaultArenaConfig, ...config }),
          stateVersion: 0,
          expiresAt: new Date(now.getTime() + ROOM_TTL_MS)
        });
      } catch (error: unknown) {
        if (
          !(error instanceof Error) ||
          !('code' in error) ||
          (error as { code?: number }).code !== 11000
        )
          throw error;
      }
    }
    throw new DomainError('ROOM_CODE_UNAVAILABLE', 'Could not allocate a room code.', 503);
  }

  async getForPlayer(code: string, userId: string): Promise<RoomDocument> {
    const room = await this.rooms
      .findOne({ code: code.toUpperCase(), 'players.userId': objectId(userId) })
      .exec();
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room was not found.', 404);
    return room;
  }

  async join(code: string, userId: string, displayName: string): Promise<RoomDocument> {
    const normalized = code.toUpperCase();
    const userObjectId = objectId(userId);
    const existing = await this.rooms
      .findOne({ code: normalized, 'players.userId': userObjectId })
      .exec();
    if (existing) return existing;
    const room = await this.rooms.findOne({ code: normalized }).exec();
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room was not found.', 404);
    if (room.phase !== 'lobby')
      throw new DomainError('ROOM_ALREADY_STARTED', 'The room has already started.', 409);
    if (room.players.length >= room.config.maxPlayers)
      throw new DomainError('ROOM_FULL', 'The room is full.', 409);
    const joined = await this.rooms
      .findOneAndUpdate(
        {
          _id: room._id,
          phase: 'lobby',
          stateVersion: room.stateVersion,
          'players.userId': { $ne: userObjectId },
          $expr: { $lt: [{ $size: '$players' }, room.config.maxPlayers] }
        },
        {
          $push: {
            players: { userId: userObjectId, displayName: this.name(displayName), isBot: false }
          },
          $inc: { stateVersion: 1 },
          $set: { expiresAt: new Date(Date.now() + ROOM_TTL_MS) }
        },
        { returnDocument: 'after' }
      )
      .exec();
    if (joined) return joined;
    return this.join(normalized, userId, displayName);
  }

  async leave(code: string, userId: string): Promise<RoomDocument | null> {
    const room = await this.getForPlayer(code, userId);
    if (room.phase !== 'lobby')
      throw new DomainError(
        'ROOM_ALREADY_STARTED',
        'Players cannot leave after the game starts.',
        409
      );
    const userObjectId = objectId(userId);
    if (room.hostId.equals(userObjectId)) {
      const deleted = await this.rooms
        .deleteOne({ _id: room._id, hostId: userObjectId, phase: 'lobby' })
        .exec();
      if (deleted.deletedCount === 0) {
        const current = await this.rooms.findById(room._id).exec();
        if (current?.phase === 'started')
          throw new DomainError(
            'ROOM_ALREADY_STARTED',
            'Players cannot leave after the game starts.',
            409
          );
        if (current !== null)
          throw new DomainError(
            'ROOM_STATE_CONFLICT',
            'The room changed before the host could leave.',
            409
          );
      }
      return null;
    }
    const updated = await this.rooms
      .findOneAndUpdate(
        { _id: room._id, phase: 'lobby', 'players.userId': userObjectId },
        {
          $pull: { players: { userId: userObjectId }, readyPlayerIds: userObjectId },
          $inc: { stateVersion: 1 }
        },
        { returnDocument: 'after' }
      )
      .exec();
    if (updated) return updated;
    const current = await this.rooms.findById(room._id).exec();
    if (current?.phase === 'started')
      throw new DomainError(
        'ROOM_ALREADY_STARTED',
        'Players cannot leave after the game starts.',
        409
      );
    throw new DomainError(
      'ROOM_STATE_CONFLICT',
      'The room changed before the player could leave.',
      409
    );
  }

  async setReady(
    code: string,
    userId: string,
    expectedStateVersion: number
  ): Promise<RoomDocument> {
    const room = await this.getForPlayer(code, userId);
    const player = objectId(userId);
    if (room.phase !== 'lobby')
      throw new DomainError('ROOM_ALREADY_STARTED', 'The room has already started.', 409);
    const updated = await this.rooms
      .findOneAndUpdate(
        {
          _id: room._id,
          phase: 'lobby',
          stateVersion: expectedStateVersion,
          readyPlayerIds: { $ne: player }
        },
        { $addToSet: { readyPlayerIds: player }, $inc: { stateVersion: 1 } },
        { returnDocument: 'after' }
      )
      .exec();
    if (updated) return updated;
    throw new DomainError(
      'STALE_STATE_VERSION',
      'The room changed before readiness was saved.',
      409
    );
  }

  async addDemoBot(code: string, ownerId: string): Promise<RoomDocument> {
    const room = await this.getForPlayer(code, ownerId);
    if (!room.hostId.equals(objectId(ownerId)))
      throw new DomainError('HOST_REQUIRED', 'Only the host can add a demo bot.', 403);
    if (room.phase !== 'lobby')
      throw new DomainError('ROOM_ALREADY_STARTED', 'The room has already started.', 409);
    if (room.players.length >= room.config.maxPlayers)
      throw new DomainError('ROOM_FULL', 'The room is full.', 409);
    const botId = new Types.ObjectId();
    const updated = await this.rooms
      .findOneAndUpdate(
        { _id: room._id, phase: 'lobby', stateVersion: room.stateVersion },
        {
          $push: {
            players: {
              userId: botId,
              displayName: `Demo Bot ${room.players.filter((p) => p.isBot).length + 1}`,
              isBot: true
            },
            readyPlayerIds: botId
          },
          $inc: { stateVersion: 1 }
        },
        { returnDocument: 'after' }
      )
      .exec();
    if (updated) return updated;
    return this.addDemoBot(code, ownerId);
  }

  async start(code: string, ownerId: string, expectedStateVersion: number): Promise<RoomDocument> {
    const room = await this.getForPlayer(code, ownerId);
    if (!room.hostId.equals(objectId(ownerId)))
      throw new DomainError('HOST_REQUIRED', 'Only the host can start the room.', 403);
    if (room.phase === 'started') return room;
    const ready = new Set(room.readyPlayerIds.map(String));
    if (
      room.players.length < room.config.minPlayers ||
      room.players.some((player) => !ready.has(String(player.userId)))
    )
      throw new DomainError(
        'PLAYERS_NOT_READY',
        'Every player must be ready before starting.',
        409
      );
    const started = await this.rooms
      .findOneAndUpdate(
        {
          _id: room._id,
          hostId: objectId(ownerId),
          phase: 'lobby',
          stateVersion: expectedStateVersion
        },
        { $set: { phase: 'started', expiresAt: null }, $inc: { stateVersion: 1 } },
        { returnDocument: 'after' }
      )
      .exec();
    if (!started)
      throw new DomainError('STALE_STATE_VERSION', 'The room changed before it could start.', 409);
    return started;
  }

  private code(): string {
    return Array.from(
      { length: 6 },
      () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]
    ).join('');
  }
  private name(value: string): string {
    const name = value.trim();
    if (!name) throw new DomainError('INVALID_DISPLAY_NAME', 'A display name is required.', 400);
    return name.slice(0, 100);
  }
}
