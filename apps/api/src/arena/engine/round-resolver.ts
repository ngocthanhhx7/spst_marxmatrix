import type { ArenaConfig } from './arena.config.js';
import { modifiersForCrisis } from './crisis-rules.js';
import {
  ArenaEngineError,
  type ArenaDecisionInput,
  type CompanyState,
  type CrisisType,
  neutralDecision
} from './arena.types.js';

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const rounded = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const assertFiniteCompany = (company: CompanyState): CompanyState => {
  for (const [field, value] of Object.entries(company)) {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new ArenaEngineError(
        'NON_FINITE_GAME_STATE',
        `Company ${company.playerId} has a non-finite ${field}.`
      );
  }
  return company;
};

interface ProvisionalCompany {
  readonly company: CompanyState;
  readonly decision: ArenaDecisionInput;
  readonly workers: number;
  readonly wageRate: number;
  readonly automationLevel: number;
  readonly productivity: number;
  readonly reputation: number;
  readonly capitalStock: number;
  readonly production: number;
  readonly availableInventory: number;
  readonly attractiveness: number;
}

export const resolveCompanies = (
  companies: readonly CompanyState[],
  decisions: Readonly<Record<string, ArenaDecisionInput>>,
  crisis: CrisisType | null,
  config: ArenaConfig
): readonly CompanyState[] => {
  const modifiers = modifiersForCrisis(crisis, config);
  const active = companies.filter((company) => !company.bankrupt);
  if (active.length === 0) return companies.map((company) => ({ ...company }));

  const referencePrice =
    active.reduce(
      (sum, company) => sum + (decisions[company.playerId]?.price ?? company.price),
      0
    ) / active.length;

  const provisional: ProvisionalCompany[] = companies.map((company) => {
    if (company.bankrupt)
      return {
        company,
        decision: neutralDecision(1, 0, company.price, company.inventory),
        workers: 0,
        wageRate: company.wageRate,
        automationLevel: company.automationLevel,
        productivity: company.productivity,
        reputation: company.reputation,
        capitalStock: company.capitalStock,
        production: 0,
        availableInventory: company.inventory,
        attractiveness: 0
      };

    const decision =
      decisions[company.playerId] ??
      neutralDecision(1, 0, company.price, company.inventory + config.baseDemandPerCompany);
    const workers = Math.max(0, company.workers + decision.hiringChange);
    const wageRate = Math.max(
      config.minimumWageRate,
      company.wageRate * (1 + decision.wageAdjustment)
    );
    const automationLevel =
      company.automationLevel + decision.automationInvestment / config.automationCostPerLevel;
    const productivity =
      (config.startingProductivity + automationLevel * config.automationProductivityGain) *
      modifiers.productivityMultiplier;
    const reputation = clamp(
      company.reputation * (1 - config.reputationDecayRate) +
        decision.qualityMarketingInvestment / config.reputationInvestmentScale,
      0,
      1
    );
    const depreciation = company.capitalStock * config.capitalDepreciationRate;
    const capitalStock = Math.max(
      0,
      company.capitalStock - depreciation + decision.automationInvestment
    );
    const productionCapacity = workers * productivity;
    const requestedProduction = Math.max(0, decision.inventoryTarget - company.inventory);
    const production = Math.min(productionCapacity, requestedProduction);
    const availableInventory = company.inventory + production;
    const priceSignal = referencePrice / Math.max(config.minimumPrice, decision.price);
    const attractiveness = Math.max(
      Number.EPSILON,
      config.reputationAttractivenessWeight * (0.5 + reputation) +
        config.priceAttractivenessWeight * priceSignal
    );
    return {
      company,
      decision,
      workers,
      wageRate,
      automationLevel,
      productivity,
      reputation,
      capitalStock,
      production,
      availableInventory,
      attractiveness
    };
  });

  const attractivenessTotal = provisional.reduce((sum, item) => sum + item.attractiveness, 0);
  const smoothedShares = provisional.map((item) => {
    if (item.company.bankrupt) return 0;
    const rawShare = item.attractiveness / attractivenessTotal;
    return (
      item.company.marketShare * (1 - config.marketShareSmoothing) +
      rawShare * config.marketShareSmoothing
    );
  });
  const shareTotal = smoothedShares.reduce((sum, share) => sum + share, 0);
  const totalDemand = config.baseDemandPerCompany * active.length * modifiers.demandMultiplier;

  return provisional.map((item, index) => {
    if (item.company.bankrupt)
      return assertFiniteCompany({ ...item.company, marketShare: 0, workers: 0 });

    const marketShare =
      shareTotal === 0 ? 1 / active.length : (smoothedShares[index] ?? 0) / shareTotal;
    const unitsSold = Math.min(item.availableInventory, totalDemand * marketShare);
    const revenue = unitsSold * item.decision.price;
    const depreciation = item.company.capitalStock * config.capitalDepreciationRate;
    const inputCost = item.production * config.inputCostPerUnit * modifiers.inputCostMultiplier;
    const constantCapital = depreciation + inputCost + item.decision.automationInvestment;
    const variableCapital = item.workers * item.wageRate * modifiers.wageMultiplier;
    const holdingCost = (item.availableInventory - unitsSold) * config.inventoryHoldingCostRate;
    const interest = item.company.debt * config.interestRate * modifiers.interestMultiplier;
    const surplusValue =
      revenue -
      constantCapital -
      variableCapital -
      item.decision.qualityMarketingInvestment -
      holdingCost -
      interest;
    let cash = item.company.cash + surplusValue;
    let debt = item.company.debt;
    if (cash < 0) {
      debt += -cash;
      cash = 0;
    } else if (debt > 0) {
      const repayment = Math.min(debt, cash * 0.25);
      cash -= repayment;
      debt -= repayment;
    }
    const bankrupt = debt > config.maximumDebt;

    return assertFiniteCompany({
      playerId: item.company.playerId,
      name: item.company.name,
      cash: rounded(cash),
      capitalStock: rounded(item.capitalStock),
      workers: item.workers,
      wageRate: rounded(item.wageRate),
      automationLevel: rounded(item.automationLevel),
      productivity: rounded(item.productivity),
      reputation: rounded(item.reputation),
      marketShare: rounded(marketShare),
      price: rounded(item.decision.price),
      inventory: rounded(item.availableInventory - unitsSold),
      debt: rounded(debt),
      constantCapital: rounded(constantCapital),
      variableCapital: rounded(variableCapital),
      surplusValue: rounded(surplusValue),
      bankrupt
    });
  });
};
