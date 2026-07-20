import { describe, expect, it } from 'vitest';
import { defaultArenaConfig } from './arena.config.js';
import { validateDecision } from './decision-rules.js';
import type { ArenaDecisionInput } from './arena.types.js';

const valid: ArenaDecisionInput = {
  round: 1,
  expectedStateVersion: 1,
  hiringChange: 0,
  wageAdjustment: 0,
  automationInvestment: 0,
  price: 20,
  qualityMarketingInvestment: 0,
  inventoryTarget: 20
};

describe('validateDecision', () => {
  it('accepts every configured boundary exactly', () => {
    expect(() =>
      validateDecision(
        {
          ...valid,
          hiringChange: defaultArenaConfig.maximumHiringChange,
          wageAdjustment: defaultArenaConfig.minimumWageAdjustment,
          automationInvestment: defaultArenaConfig.maximumAutomationInvestment,
          price: defaultArenaConfig.maximumPrice,
          qualityMarketingInvestment: defaultArenaConfig.maximumQualityMarketingInvestment,
          inventoryTarget: defaultArenaConfig.maximumInventoryTarget
        },
        defaultArenaConfig
      )
    ).not.toThrow();
  });

  it.each([
    ['hiringChange', 0.5, 'INVALID_HIRING_CHANGE'],
    ['automationInvestment', -1, 'INVALID_AUTOMATION_INVESTMENT'],
    ['price', 0, 'INVALID_PRICE'],
    ['qualityMarketingInvestment', Number.NaN, 'INVALID_QUALITY_MARKETING_INVESTMENT'],
    ['inventoryTarget', Number.POSITIVE_INFINITY, 'INVALID_INVENTORY_TARGET']
  ] as const)('rejects invalid %s', (field, value, code) => {
    expect(() => validateDecision({ ...valid, [field]: value }, defaultArenaConfig)).toThrow(
      expect.objectContaining({ code })
    );
  });
});
