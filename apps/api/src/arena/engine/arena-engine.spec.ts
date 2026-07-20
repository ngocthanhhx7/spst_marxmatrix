import { describe, expect, it } from 'vitest';
import { ArenaEngine, type ArenaPlayer } from './arena-engine.js';
import { defaultArenaConfig } from './arena.config.js';
import type { ArenaDecisionInput, ArenaState } from './arena.types.js';

const players: readonly ArenaPlayer[] = [
  { id: 'player-a', name: 'Alpha' },
  { id: 'player-b', name: 'Beta' }
];

const engine = new ArenaEngine({
  ...defaultArenaConfig,
  minPlayers: 2,
  maxPlayers: 2,
  countdownMs: 100,
  decisionDeadlineMs: 1_000,
  maxRounds: 2,
  crisisProbability: 1
});

const openRound = (seed = 'seed'): ArenaState => {
  const countdown = engine.start(engine.createInitialState(seed, players, 0), 0).state;
  return engine.advance(countdown, 100).state;
};

const decision = (
  state: ArenaState,
  overrides: Partial<ArenaDecisionInput> = {}
): ArenaDecisionInput => ({
  round: state.round,
  expectedStateVersion: state.stateVersion,
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 0,
  price: 20,
  qualityMarketingInvestment: 0,
  inventoryTarget: 30,
  ...overrides
});

const deadline = (state: ArenaState): number => Date.parse(state.deadlineAt ?? 'invalid');

describe('ArenaEngine', () => {
  it('produces identical snapshots and events for identical seeds and decisions', () => {
    const left = openRound('same-seed');
    const right = openRound('same-seed');
    const leftSubmitted = engine.submitDecision(left, 'player-a', decision(left), 101).state;
    const rightSubmitted = engine.submitDecision(right, 'player-a', decision(right), 101).state;

    expect(engine.resolveRound(leftSubmitted, 1_100)).toEqual(
      engine.resolveRound(rightSubmitted, 1_100)
    );
  });

  it('moves through the exact server-owned lifecycle and stops at the round limit', () => {
    const initial = engine.createInitialState('lifecycle', players, 0);
    expect(initial.phase).toBe('lobby');
    const countdown = engine.start(initial, 0).state;
    expect(countdown).toMatchObject({
      phase: 'countdown',
      deadlineAt: '1970-01-01T00:00:00.100Z'
    });
    const opened = engine.advance(countdown, 100).state;
    expect(opened).toMatchObject({
      phase: 'decision_open',
      round: 1,
      deadlineAt: '1970-01-01T00:00:01.100Z'
    });
    const locked = engine.advance(opened, 1_100).state;
    expect(locked.phase).toBe('decision_locked');
    const resolution = engine.advance(locked, 1_100).state;
    expect(resolution.phase).toBe('round_resolution');
    const crisis = engine.advance(resolution, 1_100).state;
    expect(crisis.phase).toBe('crisis_event');
    const result = engine.advance(crisis, 1_100).state;
    expect(result.phase).toBe('round_result');
    const roundTwo = engine.advance(result, 1_100).state;
    expect(roundTwo).toMatchObject({ phase: 'decision_open', round: 2 });
    expect(engine.resolveRound(roundTwo, deadline(roundTwo)).state.phase).toBe('game_over');
  });

  it('accepts decisions only while the server-owned deadline remains open', () => {
    const opened = openRound('deadline');
    expect(() =>
      engine.submitDecision(opened, 'player-a', decision(opened), deadline(opened))
    ).toThrow(expect.objectContaining({ code: 'DECISION_DEADLINE_EXPIRED' }));
  });

  it('rejects decisions outside configured bounds', () => {
    const opened = openRound('bounded');
    expect(() =>
      engine.submitDecision(opened, 'player-a', decision(opened, { wageAdjustment: 2 }), 101)
    ).toThrow(expect.objectContaining({ code: 'INVALID_WAGE_ADJUSTMENT' }));
  });

  it('uses neutral decisions for players who do not submit before resolution', () => {
    const opened = openRound('neutral');
    const resolved = engine.resolveRound(opened, deadline(opened));
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'neutral_decision_applied', playerId: 'player-a' })
    );
    expect(resolved.events).toContainEqual(
      expect.objectContaining({ type: 'neutral_decision_applied', playerId: 'player-b' })
    );
  });

  it.each([
    ['stale version', { expectedStateVersion: 0 }, 'STALE_STATE_VERSION'],
    ['wrong round', { round: 2 }, 'WRONG_ROUND']
  ])('rejects a %s decision', (_name, partial, code) => {
    const opened = openRound('rejection');
    expect(() => engine.submitDecision(opened, 'player-a', decision(opened, partial), 101)).toThrow(
      expect.objectContaining({ code })
    );
  });

  it('rejects non-finite configuration before any game can start', () => {
    expect(
      () => new ArenaEngine({ ...defaultArenaConfig, startingCash: Number.POSITIVE_INFINITY })
    ).toThrow(expect.objectContaining({ code: 'INVALID_GAME_CONFIG' }));
  });

  it('deep-freezes snapshots, nested companies, decisions and events at runtime', () => {
    const opened = openRound('immutable');
    const transition = engine.submitDecision(opened, 'player-a', decision(opened), 101);
    expect(Object.isFrozen(opened)).toBe(true);
    expect(Object.isFrozen(opened.companies)).toBe(true);
    expect(Object.isFrozen(opened.companies[0])).toBe(true);
    expect(Object.isFrozen(transition.state.decisions)).toBe(true);
    expect(Object.isFrozen(transition.events)).toBe(true);
    expect(() => {
      (opened.companies[0] as { cash: number }).cash = -1;
    }).toThrow(TypeError);
  });

  it('integrates deterministic bankrupt-company acquisition before game over', () => {
    const initial = engine.createInitialState('acquisition', players, 0);
    const roundResult: ArenaState = {
      ...initial,
      stateVersion: 9,
      phase: 'round_result',
      companies: [
        { ...initial.companies[0]!, cash: 1_000, marketShare: 0.8 },
        {
          ...initial.companies[1]!,
          cash: 0,
          capitalStock: 200,
          workers: 10,
          marketShare: 0.2,
          inventory: 50,
          debt: 100,
          bankrupt: true
        }
      ]
    };
    const acquired = engine.acquire(roundResult, 'player-a', 'player-b', 9);
    expect(acquired.events).toContainEqual(
      expect.objectContaining({
        type: 'company_acquired',
        playerId: 'player-a',
        payload: { targetId: 'player-b', price: 60 }
      })
    );
    expect(acquired.state.companies[0]).toMatchObject({ cash: 940, capitalStock: 600 });
    expect(acquired.state.companies[1]).toMatchObject({ bankrupt: true, capitalStock: 100 });
  });
});
