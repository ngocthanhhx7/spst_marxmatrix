import type { ArenaConfig } from './arena.config.js';
import { ArenaEngineError, type ArenaDecisionInput } from './arena.types.js';

const assertFinite = (value: number, code: string): void => {
  if (!Number.isFinite(value)) throw new ArenaEngineError(code, 'Decision values must be finite.');
};

const assertBetween = (value: number, minimum: number, maximum: number, code: string): void => {
  assertFinite(value, code);
  if (value < minimum || value > maximum)
    throw new ArenaEngineError(code, `Decision value must be between ${minimum} and ${maximum}.`);
};

export const validateDecision = (decision: ArenaDecisionInput, config: ArenaConfig): void => {
  if (!Number.isInteger(decision.round) || decision.round < 1)
    throw new ArenaEngineError('INVALID_ROUND', 'Decision round must be a positive integer.');
  if (!Number.isInteger(decision.expectedStateVersion) || decision.expectedStateVersion < 0)
    throw new ArenaEngineError(
      'INVALID_STATE_VERSION',
      'Expected state version must be a non-negative integer.'
    );
  assertBetween(
    decision.hiringChange,
    config.minimumHiringChange,
    config.maximumHiringChange,
    'INVALID_HIRING_CHANGE'
  );
  if (!Number.isInteger(decision.hiringChange))
    throw new ArenaEngineError('INVALID_HIRING_CHANGE', 'Hiring change must be an integer.');
  assertBetween(
    decision.wageAdjustment,
    config.minimumWageAdjustment,
    config.maximumWageAdjustment,
    'INVALID_WAGE_ADJUSTMENT'
  );
  assertBetween(
    decision.automationInvestment,
    0,
    config.maximumAutomationInvestment,
    'INVALID_AUTOMATION_INVESTMENT'
  );
  assertBetween(decision.price, config.minimumPrice, config.maximumPrice, 'INVALID_PRICE');
  assertBetween(
    decision.qualityMarketingInvestment,
    0,
    config.maximumQualityMarketingInvestment,
    'INVALID_QUALITY_MARKETING_INVESTMENT'
  );
  assertBetween(
    decision.inventoryTarget,
    0,
    config.maximumInventoryTarget,
    'INVALID_INVENTORY_TARGET'
  );
};
