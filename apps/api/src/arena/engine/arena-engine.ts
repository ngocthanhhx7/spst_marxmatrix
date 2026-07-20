import { defaultArenaConfig, type ArenaConfig } from './arena.config.js';
import { acquireBankruptCompany } from './acquisition-rules.js';
import { selectCrisis } from './crisis-rules.js';
import { validateDecision } from './decision-rules.js';
import { resolveCompanies } from './round-resolver.js';
import {
  ArenaEngineError,
  type ArenaDecisionInput,
  type ArenaEvent,
  type ArenaPlayer,
  type ArenaState,
  type ArenaTransition,
  type CompanyState,
  neutralDecision
} from './arena.types.js';

export type { ArenaPlayer } from './arena.types.js';

const deepFreeze = <T>(value: T): T => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return value;
};

const toIsoDeadline = (epochMilliseconds: number): string => {
  const date = new Date(epochMilliseconds);
  if (!Number.isFinite(date.getTime()))
    throw new ArenaEngineError(
      'INVALID_SERVER_TIME',
      'Server time is outside the supported range.'
    );
  return date.toISOString();
};

const deadlineEpoch = (deadlineAt: string | null): number => {
  if (deadlineAt === null)
    throw new ArenaEngineError('DEADLINE_NOT_SET', 'The server-owned deadline is not set.');
  const value = Date.parse(deadlineAt);
  if (!Number.isFinite(value))
    throw new ArenaEngineError('INVALID_DEADLINE', 'The server-owned deadline is invalid.');
  return value;
};

const event = (
  state: ArenaState,
  offset: number,
  type: string,
  details: Omit<ArenaEvent, 'sequence' | 'round' | 'type'> = {}
): ArenaEvent => ({
  sequence: state.eventSequence + offset,
  round: state.round,
  type,
  ...details
});

const withEvents = (
  state: ArenaState,
  patch: Partial<ArenaState>,
  events: readonly ArenaEvent[]
): ArenaTransition => ({
  state: deepFreeze({
    ...state,
    ...patch,
    stateVersion: state.stateVersion + 1,
    eventSequence: state.eventSequence + events.length
  }),
  events: deepFreeze(events.map((item) => ({ ...item })))
});

const assertConfiguration = (config: ArenaConfig): void => {
  for (const [name, value] of Object.entries(config)) {
    if (!Number.isFinite(value))
      throw new ArenaEngineError('INVALID_GAME_CONFIG', `${name} must be finite.`);
  }
  if (
    !Number.isInteger(config.maxRounds) ||
    config.maxRounds < 1 ||
    !Number.isInteger(config.minPlayers) ||
    config.minPlayers < 1 ||
    !Number.isInteger(config.maxPlayers) ||
    config.maxPlayers < config.minPlayers
  )
    throw new ArenaEngineError('INVALID_GAME_CONFIG', 'Round and player bounds are invalid.');
  if (config.countdownMs < 0 || config.decisionDeadlineMs <= 0)
    throw new ArenaEngineError('INVALID_GAME_CONFIG', 'Server deadlines must be positive.');
  const ratios: readonly (keyof ArenaConfig)[] = [
    'capitalDepreciationRate',
    'inventoryHoldingCostRate',
    'interestRate',
    'reputationDecayRate',
    'reputationAttractivenessWeight',
    'priceAttractivenessWeight',
    'marketShareSmoothing',
    'crisisProbability',
    'acquisitionCapitalShare',
    'acquisitionWorkerShare',
    'acquisitionMarketShare',
    'acquisitionInventoryShare',
    'acquisitionCapitalRecoveryRate',
    'acquisitionInventoryRecoveryRate',
    'acquisitionDebtDiscountRate'
  ];
  for (const name of ratios) {
    const value = config[name];
    if (value < 0 || value > 1)
      throw new ArenaEngineError('INVALID_GAME_CONFIG', `${name} must be between zero and one.`);
  }
  if (
    config.automationCostPerLevel <= 0 ||
    config.reputationInvestmentScale <= 0 ||
    config.maximumDebt < 0
  )
    throw new ArenaEngineError('INVALID_GAME_CONFIG', 'Economic divisors and limits are invalid.');
};

export class ArenaEngine {
  readonly config: Readonly<ArenaConfig>;

  constructor(config: ArenaConfig = defaultArenaConfig) {
    assertConfiguration(config);
    this.config = Object.freeze({ ...config });
  }

  createInitialState(randomSeed: string, players: readonly ArenaPlayer[], now: number): ArenaState {
    if (randomSeed.trim().length === 0)
      throw new ArenaEngineError('INVALID_RANDOM_SEED', 'A non-empty random seed is required.');
    if (!Number.isFinite(now))
      throw new ArenaEngineError('INVALID_SERVER_TIME', 'Server time must be finite.');
    if (players.length < this.config.minPlayers || players.length > this.config.maxPlayers)
      throw new ArenaEngineError(
        'INVALID_PLAYER_COUNT',
        `Player count must be between ${this.config.minPlayers} and ${this.config.maxPlayers}.`
      );
    const identifiers = new Set(players.map((player) => player.id));
    if (
      identifiers.size !== players.length ||
      players.some((player) => !player.id || !player.name.trim())
    )
      throw new ArenaEngineError(
        'INVALID_PLAYERS',
        'Players must have unique IDs and non-empty names.'
      );

    const marketShare = 1 / players.length;
    const companies: readonly CompanyState[] = players.map((player) => ({
      playerId: player.id,
      name: player.name,
      cash: this.config.startingCash,
      capitalStock: this.config.startingCapitalStock,
      workers: this.config.startingWorkers,
      wageRate: this.config.startingWageRate,
      automationLevel: this.config.startingAutomationLevel,
      productivity: this.config.startingProductivity,
      reputation: this.config.startingReputation,
      marketShare,
      price: this.config.startingPrice,
      inventory: this.config.startingInventory,
      debt: this.config.startingDebt,
      constantCapital: this.config.startingCapitalStock,
      variableCapital: this.config.startingWorkers * this.config.startingWageRate,
      surplusValue: 0,
      bankrupt: false
    }));
    return deepFreeze({
      stateVersion: 0,
      randomSeed,
      round: 1,
      phase: 'lobby',
      deadlineAt: null,
      companies,
      decisions: {},
      crisis: null,
      eventSequence: 0
    });
  }

  start(state: ArenaState, now: number): ArenaTransition {
    this.assertPhase(state, 'lobby');
    this.assertTime(now);
    const events = [event(state, 1, 'game_started')];
    return withEvents(
      state,
      { phase: 'countdown', deadlineAt: toIsoDeadline(now + this.config.countdownMs) },
      events
    );
  }

  submitDecision(
    state: ArenaState,
    playerId: string,
    decision: ArenaDecisionInput,
    now: number
  ): ArenaTransition {
    this.assertPhase(state, 'decision_open');
    this.assertTime(now);
    if (now >= deadlineEpoch(state.deadlineAt))
      throw new ArenaEngineError(
        'DECISION_DEADLINE_EXPIRED',
        'The server-owned decision deadline has expired.'
      );
    if (decision.expectedStateVersion !== state.stateVersion)
      throw new ArenaEngineError(
        'STALE_STATE_VERSION',
        'The decision targets a stale state version.'
      );
    if (decision.round !== state.round)
      throw new ArenaEngineError('WRONG_ROUND', 'The decision targets a different round.');
    const company = state.companies.find((candidate) => candidate.playerId === playerId);
    if (!company || company.bankrupt)
      throw new ArenaEngineError('PLAYER_NOT_ACTIVE', 'The player has no active company.');
    if (state.decisions[playerId])
      throw new ArenaEngineError(
        'DECISION_ALREADY_SUBMITTED',
        'A decision already exists for this round.'
      );
    validateDecision(decision, this.config);
    const events = [event(state, 1, 'decision_accepted', { playerId })];
    return withEvents(
      state,
      { decisions: { ...state.decisions, [playerId]: { ...decision } } },
      events
    );
  }

  acquire(
    state: ArenaState,
    acquirerId: string,
    targetId: string,
    expectedStateVersion: number
  ): ArenaTransition {
    this.assertPhase(state, 'round_result');
    if (expectedStateVersion !== state.stateVersion)
      throw new ArenaEngineError(
        'STALE_STATE_VERSION',
        'The acquisition targets a stale state version.'
      );
    const acquirer = state.companies.find((company) => company.playerId === acquirerId);
    const target = state.companies.find((company) => company.playerId === targetId);
    if (!acquirer || !target)
      throw new ArenaEngineError('COMPANY_NOT_FOUND', 'An acquisition company was not found.');
    const result = acquireBankruptCompany(acquirer, target, this.config);
    const companies = state.companies.map((company) => {
      if (company.playerId === acquirerId) return result.acquirer;
      if (company.playerId === targetId) return result.target;
      return company;
    });
    const events = [
      event(state, 1, 'company_acquired', {
        playerId: acquirerId,
        payload: { targetId, price: result.price }
      })
    ];
    return withEvents(state, { companies }, events);
  }

  advance(state: ArenaState, now: number): ArenaTransition {
    this.assertTime(now);
    switch (state.phase) {
      case 'lobby':
        throw new ArenaEngineError('GAME_NOT_STARTED', 'Start the game before advancing it.');
      case 'countdown': {
        this.assertDeadlineReached(state, now);
        const events = [event(state, 1, 'round_started')];
        return withEvents(
          state,
          {
            phase: 'decision_open',
            deadlineAt: toIsoDeadline(now + this.config.decisionDeadlineMs),
            decisions: {},
            crisis: null
          },
          events
        );
      }
      case 'decision_open': {
        const active = state.companies.filter((company) => !company.bankrupt);
        const allSubmitted = active.every((company) => state.decisions[company.playerId]);
        if (!allSubmitted && now < deadlineEpoch(state.deadlineAt))
          throw new ArenaEngineError('DECISION_WINDOW_OPEN', 'The decision window is still open.');
        const completedDecisions: Record<string, ArenaDecisionInput> = { ...state.decisions };
        const events: ArenaEvent[] = [];
        for (const company of active) {
          if (completedDecisions[company.playerId]) continue;
          completedDecisions[company.playerId] = neutralDecision(
            state.round,
            state.stateVersion,
            company.price,
            company.inventory + this.config.baseDemandPerCompany
          );
          events.push(
            event(state, events.length + 1, 'neutral_decision_applied', {
              playerId: company.playerId
            })
          );
        }
        events.push(event(state, events.length + 1, 'decision_locked'));
        return withEvents(
          state,
          { phase: 'decision_locked', deadlineAt: null, decisions: completedDecisions },
          events
        );
      }
      case 'decision_locked': {
        const events = [event(state, 1, 'round_resolution_started')];
        return withEvents(state, { phase: 'round_resolution' }, events);
      }
      case 'round_resolution': {
        const crisis = selectCrisis(state.randomSeed, state.round, this.config);
        const companies = resolveCompanies(state.companies, state.decisions, crisis, this.config);
        const events: ArenaEvent[] = [];
        for (const company of companies) {
          const previous = state.companies.find(
            (candidate) => candidate.playerId === company.playerId
          );
          if (company.bankrupt && previous && !previous.bankrupt)
            events.push(
              event(state, events.length + 1, 'company_bankrupt', {
                playerId: company.playerId
              })
            );
        }
        return withEvents(state, { phase: 'crisis_event', companies, crisis }, events);
      }
      case 'crisis_event': {
        const events = [
          state.crisis
            ? event(state, 1, 'crisis_triggered', { crisis: state.crisis })
            : event(state, 1, 'no_crisis')
        ];
        return withEvents(state, { phase: 'round_result' }, events);
      }
      case 'round_result': {
        const activeCompanies = state.companies.filter((company) => !company.bankrupt);
        const finished = state.round >= this.config.maxRounds || activeCompanies.length <= 1;
        const events = [
          event(state, 1, 'round_resolved'),
          ...(finished ? [event(state, 2, 'game_finished')] : [])
        ];
        return withEvents(
          state,
          finished
            ? { phase: 'game_over', deadlineAt: null }
            : {
                phase: 'decision_open',
                round: state.round + 1,
                deadlineAt: toIsoDeadline(now + this.config.decisionDeadlineMs),
                decisions: {},
                crisis: null
              },
          events
        );
      }
      case 'game_over':
        throw new ArenaEngineError('GAME_ALREADY_FINISHED', 'The game is already finished.');
    }
  }

  resolveRound(state: ArenaState, now: number): ArenaTransition {
    let current = state;
    const events: ArenaEvent[] = [];
    for (let step = 0; step < 5; step += 1) {
      if (
        current.phase === 'decision_open' &&
        current.deadlineAt !== null &&
        now < deadlineEpoch(current.deadlineAt)
      ) {
        const active = current.companies.filter((company) => !company.bankrupt);
        if (!active.every((company) => current.decisions[company.playerId]))
          throw new ArenaEngineError('DECISION_WINDOW_OPEN', 'The decision window is still open.');
      }
      const transition = this.advance(current, now);
      current = transition.state;
      events.push(...transition.events);
      if (current.phase === 'decision_open' || current.phase === 'game_over')
        return deepFreeze({ state: current, events: [...events] });
    }
    throw new ArenaEngineError(
      'INVALID_LIFECYCLE',
      'Round resolution did not reach a stable phase.'
    );
  }

  private assertPhase(state: ArenaState, phase: ArenaState['phase']): void {
    if (state.phase !== phase)
      throw new ArenaEngineError(
        'INVALID_GAME_PHASE',
        `Expected ${phase}, received ${state.phase}.`
      );
  }

  private assertTime(now: number): void {
    if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime()))
      throw new ArenaEngineError('INVALID_SERVER_TIME', 'Server time must be finite.');
  }

  private assertDeadlineReached(state: ArenaState, now: number): void {
    if (now < deadlineEpoch(state.deadlineAt))
      throw new ArenaEngineError(
        'DEADLINE_NOT_REACHED',
        'The server-owned deadline is not reached.'
      );
  }
}
