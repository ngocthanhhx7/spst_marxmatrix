import type { ArenaConfig } from './arena.config.js';
import type { CrisisType } from './arena.types.js';
import { SeededRandom } from './seeded-rng.js';

export const crisisTypes: readonly CrisisType[] = [
  'overproduction',
  'cloud_price_increase',
  'ai_automation_breakthrough',
  'skilled_labor_shortage',
  'credit_tightening',
  'labor_movement'
] as const;

export interface RoundModifiers {
  readonly demandMultiplier: number;
  readonly inputCostMultiplier: number;
  readonly productivityMultiplier: number;
  readonly wageMultiplier: number;
  readonly interestMultiplier: number;
}

export const neutralRoundModifiers: Readonly<RoundModifiers> = Object.freeze({
  demandMultiplier: 1,
  inputCostMultiplier: 1,
  productivityMultiplier: 1,
  wageMultiplier: 1,
  interestMultiplier: 1
});

export const modifiersForCrisis = (
  crisis: CrisisType | null,
  config: ArenaConfig
): RoundModifiers => {
  switch (crisis) {
    case 'overproduction':
      return { ...neutralRoundModifiers, demandMultiplier: config.overproductionDemandMultiplier };
    case 'cloud_price_increase':
      return {
        ...neutralRoundModifiers,
        inputCostMultiplier: config.cloudPriceInputCostMultiplier
      };
    case 'ai_automation_breakthrough':
      return {
        ...neutralRoundModifiers,
        productivityMultiplier: config.automationBreakthroughProductivityMultiplier
      };
    case 'skilled_labor_shortage':
      return { ...neutralRoundModifiers, wageMultiplier: config.skilledLaborWageMultiplier };
    case 'credit_tightening':
      return {
        ...neutralRoundModifiers,
        interestMultiplier: config.creditTighteningInterestMultiplier
      };
    case 'labor_movement':
      return { ...neutralRoundModifiers, wageMultiplier: config.laborMovementWageMultiplier };
    case null:
      return { ...neutralRoundModifiers };
  }
};

export const selectCrisis = (
  randomSeed: string,
  round: number,
  config: ArenaConfig
): CrisisType | null => {
  const random = new SeededRandom(`${randomSeed}:round:${round}:crisis`);
  if (random.next() >= config.crisisProbability) return null;
  return crisisTypes[random.integer(crisisTypes.length)] ?? null;
};
