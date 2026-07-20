export interface ArenaConfig {
  readonly maxRounds: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  readonly countdownMs: number;
  readonly decisionDeadlineMs: number;
  readonly startingCash: number;
  readonly startingCapitalStock: number;
  readonly startingWorkers: number;
  readonly startingWageRate: number;
  readonly startingAutomationLevel: number;
  readonly startingProductivity: number;
  readonly startingReputation: number;
  readonly startingPrice: number;
  readonly startingInventory: number;
  readonly startingDebt: number;
  readonly minimumWageRate: number;
  readonly minimumPrice: number;
  readonly maximumPrice: number;
  readonly minimumHiringChange: number;
  readonly maximumHiringChange: number;
  readonly minimumWageAdjustment: number;
  readonly maximumWageAdjustment: number;
  readonly maximumAutomationInvestment: number;
  readonly maximumQualityMarketingInvestment: number;
  readonly maximumInventoryTarget: number;
  readonly automationCostPerLevel: number;
  readonly automationProductivityGain: number;
  readonly baseDemandPerCompany: number;
  readonly inputCostPerUnit: number;
  readonly capitalDepreciationRate: number;
  readonly inventoryHoldingCostRate: number;
  readonly interestRate: number;
  readonly maximumDebt: number;
  readonly reputationDecayRate: number;
  readonly reputationInvestmentScale: number;
  readonly reputationAttractivenessWeight: number;
  readonly priceAttractivenessWeight: number;
  readonly marketShareSmoothing: number;
  readonly crisisProbability: number;
  readonly overproductionDemandMultiplier: number;
  readonly cloudPriceInputCostMultiplier: number;
  readonly automationBreakthroughProductivityMultiplier: number;
  readonly skilledLaborWageMultiplier: number;
  readonly creditTighteningInterestMultiplier: number;
  readonly laborMovementWageMultiplier: number;
  readonly acquisitionCapitalShare: number;
  readonly acquisitionWorkerShare: number;
  readonly acquisitionMarketShare: number;
  readonly acquisitionInventoryShare: number;
  readonly acquisitionCapitalRecoveryRate: number;
  readonly acquisitionInventoryRecoveryRate: number;
  readonly acquisitionDebtDiscountRate: number;
}

export const defaultArenaConfig: Readonly<ArenaConfig> = Object.freeze({
  maxRounds: 8,
  minPlayers: 4,
  maxPlayers: 8,
  countdownMs: 3_000,
  decisionDeadlineMs: 25_000,
  startingCash: 1_000,
  startingCapitalStock: 500,
  startingWorkers: 20,
  startingWageRate: 10,
  startingAutomationLevel: 0,
  startingProductivity: 1,
  startingReputation: 0.5,
  startingPrice: 20,
  startingInventory: 0,
  startingDebt: 0,
  minimumWageRate: 1,
  minimumPrice: 1,
  maximumPrice: 1_000,
  minimumHiringChange: -20,
  maximumHiringChange: 50,
  minimumWageAdjustment: -0.5,
  maximumWageAdjustment: 1,
  maximumAutomationInvestment: 1_000,
  maximumQualityMarketingInvestment: 1_000,
  maximumInventoryTarget: 10_000,
  automationCostPerLevel: 100,
  automationProductivityGain: 0.2,
  baseDemandPerCompany: 30,
  inputCostPerUnit: 3,
  capitalDepreciationRate: 0.02,
  inventoryHoldingCostRate: 0.05,
  interestRate: 0.02,
  maximumDebt: 2_000,
  reputationDecayRate: 0.02,
  reputationInvestmentScale: 100,
  reputationAttractivenessWeight: 0.5,
  priceAttractivenessWeight: 0.5,
  marketShareSmoothing: 0.5,
  crisisProbability: 0.35,
  overproductionDemandMultiplier: 0.65,
  cloudPriceInputCostMultiplier: 1.4,
  automationBreakthroughProductivityMultiplier: 1.2,
  skilledLaborWageMultiplier: 1.15,
  creditTighteningInterestMultiplier: 2,
  laborMovementWageMultiplier: 1.1,
  acquisitionCapitalShare: 0.5,
  acquisitionWorkerShare: 0.5,
  acquisitionMarketShare: 0.5,
  acquisitionInventoryShare: 0.5,
  acquisitionCapitalRecoveryRate: 0.3,
  acquisitionInventoryRecoveryRate: 0.2,
  acquisitionDebtDiscountRate: 0.1
});
