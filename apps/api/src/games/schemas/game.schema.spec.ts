import { model, Types } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { defaultArenaConfig } from '../../arena/engine/arena.config.js';
import { GameSchema } from './game.schema.js';

describe('Game schema persistence contract', () => {
  it('preserves an empty decisions record in a newly started game snapshot', () => {
    const GameModel = model('GameSchemaPersistenceContract', GameSchema);
    const game = new GameModel({
      roomId: new Types.ObjectId(),
      config: defaultArenaConfig,
      snapshot: {
        stateVersion: 1,
        randomSeed: 'seed',
        round: 1,
        phase: 'countdown',
        deadlineAt: new Date().toISOString(),
        companies: [],
        decisions: {},
        crisis: null,
        eventSequence: 1
      },
      stateVersion: 1,
      eventSequence: 1,
      pendingEvents: [],
      appliedIdempotencyKeys: []
    });

    expect(game.toObject()).toMatchObject({ snapshot: { decisions: {} } });
  });
});
