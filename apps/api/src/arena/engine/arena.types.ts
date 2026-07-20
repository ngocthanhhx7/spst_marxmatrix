export type ArenaPhase =
  | 'lobby'
  | 'countdown'
  | 'decision_open'
  | 'decision_locked'
  | 'round_resolution'
  | 'crisis_event'
  | 'round_result'
  | 'game_over';

export type CrisisType =
  | 'overproduction'
  | 'cloud_price_increase'
  | 'ai_automation_breakthrough'
  | 'skilled_labor_shortage'
  | 'credit_tightening'
  | 'labor_movement';

export interface ArenaPlayer {
  readonly id: string;
  readonly name: string;
}

export interface ArenaDecisionInput {
  readonly round: number;
  readonly expectedStateVersion: number;
  readonly hiringChange: number;
  readonly wageAdjustment: number;
  readonly automationInvestment: number;
  readonly price: number;
  readonly qualityMarketingInvestment: number;
  readonly inventoryTarget: number;
}

export interface CompanyState {
  readonly playerId: string;
  readonly name: string;
  readonly cash: number;
  readonly capitalStock: number;
  readonly workers: number;
  readonly wageRate: number;
  readonly automationLevel: number;
  readonly productivity: number;
  readonly reputation: number;
  readonly marketShare: number;
  readonly price: number;
  readonly inventory: number;
  readonly debt: number;
  readonly constantCapital: number;
  readonly variableCapital: number;
  readonly surplusValue: number;
  readonly bankrupt: boolean;
}

export interface ArenaState {
  readonly stateVersion: number;
  readonly randomSeed: string;
  readonly round: number;
  readonly phase: ArenaPhase;
  readonly deadlineAt: string | null;
  readonly companies: readonly CompanyState[];
  readonly decisions: Readonly<Record<string, ArenaDecisionInput>>;
  readonly crisis: CrisisType | null;
  readonly eventSequence: number;
}

export interface ArenaEvent {
  readonly sequence: number;
  readonly round: number;
  readonly type: string;
  readonly playerId?: string;
  readonly crisis?: CrisisType;
  readonly payload?: Readonly<Record<string, number | string | boolean | null>>;
}

export interface ArenaTransition {
  readonly state: ArenaState;
  readonly events: readonly ArenaEvent[];
}

export class ArenaEngineError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ArenaEngineError';
  }
}

export const neutralDecision = (
  round: number,
  expectedStateVersion: number,
  price: number,
  inventoryTarget: number
): ArenaDecisionInput => ({
  round,
  expectedStateVersion,
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 0,
  price,
  qualityMarketingInvestment: 0,
  inventoryTarget
});
