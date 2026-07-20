import { describe, expect, it } from 'vitest';
import { SeededRandom } from './seeded-rng.js';

describe('SeededRandom', () => {
  it('repeats an identical finite sequence for the same seed', () => {
    const left = new SeededRandom('repeatable');
    const right = new SeededRandom('repeatable');
    const leftValues = Array.from({ length: 20 }, () => left.next());
    const rightValues = Array.from({ length: 20 }, () => right.next());
    expect(leftValues).toEqual(rightValues);
    expect(leftValues.every((value) => value >= 0 && value < 1 && Number.isFinite(value))).toBe(
      true
    );
  });

  it('uses the exclusive integer bound', () => {
    const random = new SeededRandom('bounded');
    expect(
      Array.from({ length: 50 }, () => random.integer(6)).every((value) => value >= 0 && value < 6)
    ).toBe(true);
  });
});
