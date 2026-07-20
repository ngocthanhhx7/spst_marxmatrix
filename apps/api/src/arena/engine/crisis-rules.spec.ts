import { describe, expect, it } from 'vitest';
import { defaultArenaConfig } from './arena.config.js';
import { crisisTypes, modifiersForCrisis, selectCrisis } from './crisis-rules.js';

describe('crisis rules', () => {
  it('defines a tested, deterministic modifier for every configured crisis', () => {
    expect(modifiersForCrisis('overproduction', defaultArenaConfig).demandMultiplier).toBe(
      defaultArenaConfig.overproductionDemandMultiplier
    );
    expect(modifiersForCrisis('cloud_price_increase', defaultArenaConfig).inputCostMultiplier).toBe(
      defaultArenaConfig.cloudPriceInputCostMultiplier
    );
    expect(
      modifiersForCrisis('ai_automation_breakthrough', defaultArenaConfig).productivityMultiplier
    ).toBe(defaultArenaConfig.automationBreakthroughProductivityMultiplier);
    expect(modifiersForCrisis('skilled_labor_shortage', defaultArenaConfig).wageMultiplier).toBe(
      defaultArenaConfig.skilledLaborWageMultiplier
    );
    expect(modifiersForCrisis('credit_tightening', defaultArenaConfig).interestMultiplier).toBe(
      defaultArenaConfig.creditTighteningInterestMultiplier
    );
    expect(modifiersForCrisis('labor_movement', defaultArenaConfig).wageMultiplier).toBe(
      defaultArenaConfig.laborMovementWageMultiplier
    );
  });

  it('selects the same crisis for the same seed and round and honors disabled crises', () => {
    const forced = { ...defaultArenaConfig, crisisProbability: 1 };
    expect(selectCrisis('same', 4, forced)).toBe(selectCrisis('same', 4, forced));
    expect(crisisTypes).toContain(selectCrisis('same', 4, forced));
    expect(selectCrisis('same', 4, { ...forced, crisisProbability: 0 })).toBeNull();
  });
});
