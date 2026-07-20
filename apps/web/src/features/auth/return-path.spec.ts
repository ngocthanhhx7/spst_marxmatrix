import { describe, expect, it } from 'vitest';
import { getSafeReturnPath } from './return-path.js';

describe('getSafeReturnPath', () => {
  it('keeps an internal Scanner path', () => {
    expect(getSafeReturnPath({ from: '/scanner/new' })).toBe('/scanner/new');
  });

  it.each([
    undefined,
    null,
    { from: undefined },
    { from: 'https://attacker.test' },
    { from: '//attacker.test' },
    { from: '/\\attacker.test' },
    { from: 'scanner/new' },
    { from: '/scanner/new\nnext' }
  ])('falls back for unsafe route state %#', (state) => {
    expect(getSafeReturnPath(state)).toBe('/dashboard');
  });
});
