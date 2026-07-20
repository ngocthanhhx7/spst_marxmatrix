import { describe, expect, it, vi } from 'vitest';
import { arenaDecisionSchema, gameEventSchema } from '@marxmatrix/contracts';
import { Types } from 'mongoose';
import { GameEventSchema } from './schemas/game-event.schema.js';
import { GameSchema } from './schemas/game.schema.js';
import { GamesService } from './games.service.js';
import { defaultArenaConfig } from '../arena/engine/arena.config.js';

describe('Game event persistence contract', () => {
  it('makes a game event sequence unique and ordered', () => {
    expect(GameEventSchema.indexes()).toContainEqual([
      { gameId: 1, sequence: 1 },
      { unique: true }
    ]);
  });

  it('stores a durable event outbox in the same game document as the snapshot', () => {
    expect(GameSchema.path('pendingEvents')).toBeDefined();
  });

  it('exposes event round, player and crisis payload through the shared contract', () => {
    const parsed = gameEventSchema.parse({
      id: new Types.ObjectId().toString(),
      gameId: new Types.ObjectId().toString(),
      sequence: 2,
      type: 'crisis_triggered',
      round: 3,
      playerId: null,
      createdAt: new Date().toISOString(),
      payload: { crisis: 'credit_tightening' }
    });
    expect(parsed).toMatchObject({
      round: 3,
      playerId: null,
      payload: { crisis: 'credit_tightening' }
    });
  });

  it('flushes pending events with idempotent unordered upserts and clears only persisted sequences', async () => {
    const gameId = new Types.ObjectId();
    const pending = [
      {
        sequence: 4,
        type: 'crisis_triggered',
        round: 2,
        playerId: null,
        idempotencyKey: null,
        payload: { crisis: 'credit_tightening' },
        createdAt: new Date()
      }
    ];
    const pull = vi.fn().mockReturnValue({ exec: () => Promise.resolve() });
    const bulkWrite = vi.fn().mockResolvedValue(undefined);
    const service = new GamesService(
      {
        findById: vi.fn().mockReturnValue({
          lean: () => ({ exec: () => Promise.resolve({ _id: gameId, pendingEvents: pending }) })
        }),
        updateOne: pull
      } as never,
      {
        bulkWrite,
        find: vi.fn().mockReturnValue({
          select: () => ({ lean: () => ({ exec: () => Promise.resolve([{ sequence: 4 }]) }) })
        })
      } as never,
      {} as never
    );
    await service.flushPendingEvents(gameId.toString());
    const call = bulkWrite.mock.calls[0] as unknown as [
      Array<{
        updateOne: { filter: { gameId: Types.ObjectId; sequence: number }; upsert: boolean };
      }>,
      { ordered: boolean }
    ];
    expect(call[0][0]?.updateOne.filter).toEqual({ gameId, sequence: 4 });
    expect(call[0][0]?.updateOne.upsert).toBe(true);
    expect(call[1]).toEqual({ ordered: false });
    expect(pull).toHaveBeenCalledWith(
      { _id: gameId },
      { $pull: { pendingEvents: { sequence: { $in: [4] } } } }
    );
  });

  it('keeps failed outbox entries durable and a new service instance flushes them after reload', async () => {
    const gameId = new Types.ObjectId();
    const now = new Date();
    const pending = [4, 5].map((sequence) => ({
      sequence,
      type: `event_${sequence}`,
      round: 2,
      playerId: null,
      idempotencyKey: null,
      payload: {},
      createdAt: now
    }));
    const firstPull = vi.fn().mockReturnValue({ exec: () => Promise.resolve() });
    const first = new GamesService(
      {
        findById: vi.fn().mockReturnValue({
          lean: () => ({ exec: () => Promise.resolve({ _id: gameId, pendingEvents: pending }) })
        }),
        updateOne: firstPull
      } as never,
      {
        bulkWrite: vi.fn().mockRejectedValue(new Error('partial bulk failure')),
        find: vi.fn().mockReturnValue({
          select: () => ({ lean: () => ({ exec: () => Promise.resolve([{ sequence: 4 }]) }) })
        })
      } as never,
      {} as never
    );
    await first.flushPendingEvents(gameId);
    expect(firstPull).toHaveBeenCalledWith(
      { _id: gameId },
      { $pull: { pendingEvents: { sequence: { $in: [4] } } } }
    );

    const secondPull = vi.fn().mockReturnValue({ exec: () => Promise.resolve() });
    const secondBulk = vi.fn().mockResolvedValue(undefined);
    const reloaded = new GamesService(
      {
        findById: vi.fn().mockReturnValue({
          lean: () => ({
            exec: () => Promise.resolve({ _id: gameId, pendingEvents: [pending[1]] })
          })
        }),
        updateOne: secondPull
      } as never,
      {
        bulkWrite: secondBulk,
        find: vi.fn().mockReturnValue({
          select: () => ({ lean: () => ({ exec: () => Promise.resolve([{ sequence: 5 }]) }) })
        })
      } as never,
      {} as never
    );
    await reloaded.flushPendingEvents(gameId);
    expect(secondBulk).toHaveBeenCalledOnce();
    expect(secondPull).toHaveBeenCalledWith(
      { _id: gameId },
      { $pull: { pendingEvents: { sequence: { $in: [5] } } } }
    );
  });

  it('builds deterministic bot decisions through the shared decision contract and public submission path', async () => {
    const gameId = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const botId = new Types.ObjectId();
    const config = {
      ...defaultArenaConfig,
      minimumHiringChange: 2,
      maximumHiringChange: 3,
      minimumWageAdjustment: 0.1,
      maximumWageAdjustment: 0.2,
      minimumPrice: 25,
      maximumPrice: 30,
      maximumInventoryTarget: 10
    };
    const game = {
      _id: gameId,
      roomId,
      config,
      stateVersion: 7,
      snapshot: {
        stateVersion: 7,
        round: 2,
        phase: 'decision_open',
        deadlineAt: new Date(Date.now() + 10_000).toISOString(),
        randomSeed: 'seed',
        eventSequence: 4,
        crisis: null,
        decisions: {},
        companies: [
          {
            playerId: botId.toString(),
            name: 'Bot',
            cash: 1000,
            capitalStock: 500,
            workers: 20,
            wageRate: 10,
            automationLevel: 0,
            productivity: 1,
            reputation: 0.5,
            marketShare: 1,
            price: 20,
            inventory: 5,
            debt: 0,
            constantCapital: 500,
            variableCapital: 200,
            surplusValue: 0,
            bankrupt: false
          }
        ]
      },
      appliedIdempotencyKeys: [],
      pendingEvents: []
    };
    const service = new GamesService(
      { findById: vi.fn().mockReturnValue({ exec: () => Promise.resolve(game) }) } as never,
      {} as never,
      {
        findById: vi.fn().mockReturnValue({
          exec: () =>
            Promise.resolve({ players: [{ userId: botId, displayName: 'Bot', isBot: true }] })
        })
      } as never
    );
    const submit = vi.spyOn(service, 'submitDecision').mockResolvedValue(game as never);
    await service.submitBotDecisions(gameId.toString());
    await service.submitBotDecisions(gameId.toString());
    const first = arenaDecisionSchema.parse(submit.mock.calls[0]?.[2]);
    const second = arenaDecisionSchema.parse(submit.mock.calls[1]?.[2]);
    expect(first.idempotencyKey).toBe(second.idempotencyKey);
    expect(first).toMatchObject({
      gameId: gameId.toString(),
      round: 2,
      expectedStateVersion: 7,
      hiringChange: 2,
      wageAdjustment: 0.1,
      price: 25,
      inventoryTarget: 10
    });
  });

  it('recovers an expired server deadline before returning a game snapshot', async () => {
    const gameId = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const userId = new Types.ObjectId();
    const expired = {
      _id: gameId,
      roomId,
      snapshot: {
        phase: 'countdown',
        deadlineAt: new Date(Date.now() - 1_000).toISOString()
      }
    };
    const advanced = {
      ...expired,
      snapshot: {
        phase: 'decision_open',
        deadlineAt: new Date(Date.now() + 25_000).toISOString()
      }
    };
    const service = new GamesService(
      {
        findById: vi.fn().mockReturnValue({ exec: () => Promise.resolve(expired) })
      } as never,
      {} as never,
      {
        findOne: vi.fn().mockReturnValue({ exec: () => Promise.resolve({ _id: roomId }) })
      } as never
    );
    vi.spyOn(service, 'flushPendingEvents').mockResolvedValue();
    const recover = vi.spyOn(service, 'recoverOverdue').mockResolvedValue(advanced as never);

    const result = await service.get(gameId.toString(), userId.toString());

    expect(recover).toHaveBeenCalledWith(gameId.toString(), expect.any(Number));
    expect(result).toBe(advanced);
  });
});
