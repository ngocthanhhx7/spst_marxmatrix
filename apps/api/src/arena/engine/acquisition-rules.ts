import type { ArenaConfig } from './arena.config.js';
import { ArenaEngineError, type CompanyState } from './arena.types.js';

export interface AcquisitionResult {
  readonly acquirer: CompanyState;
  readonly target: CompanyState;
  readonly price: number;
}

const rounded = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

const assertFiniteCompany = (company: CompanyState): void => {
  for (const [field, value] of Object.entries(company)) {
    if (typeof value === 'number' && !Number.isFinite(value))
      throw new ArenaEngineError(
        'NON_FINITE_GAME_STATE',
        `Company ${company.playerId} has a non-finite ${field}.`
      );
  }
};

const assertFiniteResult = (result: AcquisitionResult): AcquisitionResult => {
  assertFiniteCompany(result.acquirer);
  assertFiniteCompany(result.target);
  if (!Number.isFinite(result.price))
    throw new ArenaEngineError('NON_FINITE_GAME_STATE', 'Acquisition price must be finite.');
  return result;
};

export const acquisitionPrice = (target: CompanyState, config: ArenaConfig): number => {
  assertFiniteCompany(target);
  if (!target.bankrupt)
    throw new ArenaEngineError(
      'ACQUISITION_TARGET_NOT_BANKRUPT',
      'Only a bankrupt company can be acquired.'
    );
  return rounded(
    Math.max(
      0,
      target.capitalStock * config.acquisitionCapitalRecoveryRate +
        target.inventory * config.acquisitionInventoryRecoveryRate -
        target.debt * config.acquisitionDebtDiscountRate
    )
  );
};

export const acquireBankruptCompany = (
  acquirer: CompanyState,
  target: CompanyState,
  config: ArenaConfig
): AcquisitionResult => {
  assertFiniteCompany(acquirer);
  assertFiniteCompany(target);
  if (acquirer.bankrupt)
    throw new ArenaEngineError(
      'ACQUIRER_BANKRUPT',
      'A bankrupt company cannot acquire another company.'
    );
  if (acquirer.playerId === target.playerId)
    throw new ArenaEngineError('SELF_ACQUISITION', 'A company cannot acquire itself.');
  const price = acquisitionPrice(target, config);
  if (acquirer.cash < price)
    throw new ArenaEngineError(
      'INSUFFICIENT_ACQUISITION_CASH',
      'The acquirer lacks sufficient cash.'
    );

  const capitalTransfer = target.capitalStock * config.acquisitionCapitalShare;
  const workerTransfer = Math.floor(target.workers * config.acquisitionWorkerShare);
  const shareTransfer = target.marketShare * config.acquisitionMarketShare;
  const inventoryTransfer = target.inventory * config.acquisitionInventoryShare;

  return assertFiniteResult({
    price,
    acquirer: {
      ...acquirer,
      cash: rounded(acquirer.cash - price),
      capitalStock: rounded(acquirer.capitalStock + capitalTransfer),
      workers: acquirer.workers + workerTransfer,
      marketShare: rounded(Math.min(1, acquirer.marketShare + shareTransfer)),
      inventory: rounded(acquirer.inventory + inventoryTransfer)
    },
    target: {
      ...target,
      capitalStock: rounded(target.capitalStock - capitalTransfer),
      workers: target.workers - workerTransfer,
      marketShare: rounded(target.marketShare - shareTransfer),
      inventory: rounded(target.inventory - inventoryTransfer)
    }
  });
};
