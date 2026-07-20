import { describe, expect, it, vi } from 'vitest';
import { Types } from 'mongoose';
import { defaultArenaConfig } from '../arena/engine/arena.config.js';
import { GamesController } from './games.controller.js';

describe('GamesController realtime recovery contract', () => {
  it('broadcasts the authoritative snapshot and newly durable events after a REST decision', async () => {
    const gameId = new Types.ObjectId();
    const roomId = new Types.ObjectId();
    const game = {
      _id: gameId,
      roomId,
      config: defaultArenaConfig,
      snapshot: {
        id: new Types.ObjectId().toString(),
        stateVersion: 6,
        round: 2,
        phase: 'decision_locked',
        deadlineAt: new Date(Date.now() + 10_000).toISOString(),
        companies: [],
        randomSeed: 'seed',
        decisions: {},
        crisis: null,
        eventSequence: 2
      }
    };
    const events = [2, 1].map((sequence) => ({
      _id: new Types.ObjectId(),
      gameId,
      sequence,
      type: `event_${sequence}`,
      round: 2,
      playerId: null,
      createdAt: new Date(`2026-07-20T00:00:0${sequence}.000Z`),
      payload: { sequence }
    }));
    const games = {
      submitDecision: vi.fn().mockResolvedValue(game),
      eventsFor: vi.fn().mockResolvedValue(events)
    };
    const realtime = { publishGame: vi.fn() };
    const controller = new GamesController(games as never, realtime as never);
    const user = {
      id: new Types.ObjectId().toString(),
      email: 'player@example.test',
      role: 'student' as const
    };

    const response = await controller.decision(user, gameId.toString(), {} as never);

    expect(response).toMatchObject({ id: gameId.toString(), stateVersion: 6, eventSequence: 2 });
    expect(games.eventsFor).toHaveBeenCalledWith(gameId.toString(), user.id, 0);
    expect(realtime.publishGame).toHaveBeenCalledWith(
      response,
      expect.arrayContaining([
        expect.objectContaining({ sequence: 1 }),
        expect.objectContaining({ sequence: 2 })
      ])
    );
  });
});
