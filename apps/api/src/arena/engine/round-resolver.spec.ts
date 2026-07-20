import { describe, expect, it } from 'vitest';
import { defaultArenaConfig } from './arena.config.js';
import type { ArenaDecisionInput, CompanyState, CrisisType } from './arena.types.js';
import { resolveCompanies } from './round-resolver.js';

const companies: readonly CompanyState[] = [
  {
    playerId: 'a',
    name: 'Alpha',
    cash: 1_000,
    capitalStock: 500,
    workers: 10,
    wageRate: 10,
    automationLevel: 0,
    productivity: 1,
    reputation: 0.5,
    marketShare: 0.5,
    price: 20,
    inventory: 0,
    debt: 0,
    constantCapital: 500,
    variableCapital: 100,
    surplusValue: 0,
    bankrupt: false
  },
  {
    playerId: 'b',
    name: 'Beta',
    cash: 1_000,
    capitalStock: 500,
    workers: 10,
    wageRate: 10,
    automationLevel: 0,
    productivity: 1,
    reputation: 0.5,
    marketShare: 0.5,
    price: 20,
    inventory: 0,
    debt: 0,
    constantCapital: 500,
    variableCapital: 100,
    surplusValue: 0,
    bankrupt: false
  }
];

const baseDecision = (overrides: Partial<ArenaDecisionInput> = {}): ArenaDecisionInput => ({
  round: 1,
  expectedStateVersion: 1,
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 100,
  price: 20,
  qualityMarketingInvestment: 0,
  inventoryTarget: 10,
  ...overrides
});

const resolve = (crisis: CrisisType | null = null, companyOverrides: Partial<CompanyState> = {}) =>
  resolveCompanies(
    [{ ...companies[0]!, ...companyOverrides }, companies[1]!],
    { a: baseDecision(), b: baseDecision() },
    crisis,
    defaultArenaConfig
  );

describe('resolveCompanies', () => {
  it('calculates capital, labor, productivity, inventory, c, v and m deterministically', () => {
    const [alpha] = resolve();
    expect(alpha).toMatchObject({
      cash: 960,
      capitalStock: 590,
      workers: 10,
      wageRate: 10,
      automationLevel: 1,
      productivity: 1.2,
      marketShare: 0.5,
      inventory: 0,
      debt: 0,
      constantCapital: 140,
      variableCapital: 100,
      surplusValue: -40,
      bankrupt: false
    });
  });

  it('normalizes market share and rewards lower prices without trusting a client calculation', () => {
    const result = resolveCompanies(
      companies,
      { a: baseDecision({ price: 10 }), b: baseDecision({ price: 30 }) },
      null,
      defaultArenaConfig
    );
    expect(result[0]!.marketShare).toBeGreaterThan(result[1]!.marketShare);
    expect(result.reduce((sum, company) => sum + company.marketShare, 0)).toBeCloseTo(1, 5);
  });

  it('uses the post-decision workforce for wage cost, cash and variable capital', () => {
    const [alpha] = resolveCompanies(
      companies,
      { a: baseDecision({ hiringChange: 5 }), b: baseDecision() },
      null,
      defaultArenaConfig
    );
    expect(alpha).toMatchObject({
      workers: 15,
      variableCapital: 150,
      surplusValue: -90,
      cash: 910
    });
  });

  it.each([
    ['overproduction', 'inventory'],
    ['cloud_price_increase', 'constantCapital'],
    ['ai_automation_breakthrough', 'productivity'],
    ['skilled_labor_shortage', 'variableCapital'],
    ['credit_tightening', 'surplusValue'],
    ['labor_movement', 'variableCapital']
  ] as const)('applies the %s crisis through the economic resolver', (crisis, field) => {
    const companyOverrides =
      crisis === 'credit_tightening'
        ? { debt: 100 }
        : crisis === 'overproduction'
          ? { inventory: 30 }
          : {};
    const normal = resolve(null, companyOverrides)[0]!;
    const affected = resolve(crisis, companyOverrides)[0]!;
    expect(affected[field]).not.toBe(normal[field]);
  });

  it('converts cash shortfalls to debt and marks debt beyond the configured limit bankrupt', () => {
    const result = resolveCompanies(
      [{ ...companies[0]!, cash: 0, debt: defaultArenaConfig.maximumDebt - 1 }],
      {
        a: baseDecision({
          automationInvestment: 0,
          price: 1,
          qualityMarketingInvestment: defaultArenaConfig.maximumQualityMarketingInvestment,
          inventoryTarget: 10
        })
      },
      null,
      defaultArenaConfig
    );
    expect(result[0]).toMatchObject({ cash: 0, bankrupt: true });
    expect(result[0]!.debt).toBeGreaterThan(defaultArenaConfig.maximumDebt);
  });

  it('rejects non-finite official state instead of persisting it', () => {
    expect(() => resolve(null, { cash: Number.NaN })).toThrow(
      expect.objectContaining({ code: 'NON_FINITE_GAME_STATE' })
    );
  });
});
