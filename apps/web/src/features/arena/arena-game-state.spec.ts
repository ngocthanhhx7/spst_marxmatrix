import { describe, expect, it } from 'vitest';
import {
  appendArenaEvent,
  orderedArenaEvents,
  remainingDecisionSeconds
} from './arena-game-state.js';

const event = (sequence: number) => ({
  id: `event-${sequence}`,
  gameId: '507f1f77bcf86cd799439011',
  sequence,
  type: 'decision_accepted',
  round: 1,
  playerId: null,
  createdAt: '2026-07-20T00:00:00.000Z',
  payload: {}
});

describe('arena game state', () => {
  it('keeps replay events deterministic and ignores a duplicate realtime event', () => {
    expect(orderedArenaEvents([event(3), event(1), event(2)])).toEqual([
      event(1),
      event(2),
      event(3)
    ]);
    expect(appendArenaEvent([event(1), event(3)], event(3))).toEqual([event(1), event(3)]);
  });

  it('reports a non-negative server deadline countdown', () => {
    expect(
      remainingDecisionSeconds('2026-07-20T00:00:12.000Z', new Date('2026-07-20T00:00:00.000Z'))
    ).toBe(12);
    expect(
      remainingDecisionSeconds('2026-07-20T00:00:00.000Z', new Date('2026-07-20T00:00:04.000Z'))
    ).toBe(0);
  });
});
