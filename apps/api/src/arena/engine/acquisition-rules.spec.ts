import { describe, expect, it } from 'vitest';
import { acquireBankruptCompany, acquisitionPrice } from './acquisition-rules.js';
import { defaultArenaConfig } from './arena.config.js';
import type { CompanyState } from './arena.types.js';

const company = (playerId: string, bankrupt: boolean): CompanyState => ({
  playerId,
  name: playerId,
  cash: bankrupt ? 0 : 1_000,
  capitalStock: bankrupt ? 200 : 500,
  workers: bankrupt ? 10 : 20,
  wageRate: 10,
  automationLevel: 0,
  productivity: 1,
  reputation: 0.5,
  marketShare: bankrupt ? 0.2 : 0.8,
  price: 20,
  inventory: bankrupt ? 50 : 0,
  debt: bankrupt ? 100 : 0,
  constantCapital: 0,
  variableCapital: 0,
  surplusValue: 0,
  bankrupt
});

describe('acquisition rules', () => {
  it('uses the configured deterministic price and transfers only configured asset shares', () => {
    const acquirer = company('buyer', false);
    const target = company('target', true);
    expect(acquisitionPrice(target, defaultArenaConfig)).toBe(60);
    const result = acquireBankruptCompany(acquirer, target, defaultArenaConfig);
    expect(result.price).toBe(60);
    expect(result.acquirer).toMatchObject({
      cash: 940,
      capitalStock: 600,
      workers: 25,
      marketShare: 0.9,
      inventory: 25
    });
    expect(result.target).toMatchObject({
      bankrupt: true,
      capitalStock: 100,
      workers: 5,
      marketShare: 0.1,
      inventory: 25
    });
  });

  it('rejects acquisition of a solvent company', () => {
    expect(() =>
      acquireBankruptCompany(company('buyer', false), company('target', false), defaultArenaConfig)
    ).toThrow(expect.objectContaining({ code: 'ACQUISITION_TARGET_NOT_BANKRUPT' }));
  });

  it('rejects non-finite inputs and never returns a poisoned snapshot', () => {
    expect(() =>
      acquireBankruptCompany(
        { ...company('buyer', false), cash: Number.NaN },
        company('target', true),
        defaultArenaConfig
      )
    ).toThrow(expect.objectContaining({ code: 'NON_FINITE_GAME_STATE' }));
  });
});
