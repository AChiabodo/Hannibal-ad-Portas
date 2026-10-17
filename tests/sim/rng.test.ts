import { describe, expect, it } from 'vitest';
import { MAX_SEED, makeRng, rngFromState, type Rng } from '../../src/sim/rng';

function words(rng: Rng, count: number): number[] {
  return Array.from({ length: count }, () => rng.nextUint32());
}

describe('the seeded random source', () => {
  it('follows sfc32, checked against a vector worked by hand', () => {
    // sfc32(a, b, c, d): t = a + b + d; d = d + 1; a = b ^ (b >>> 9);
    // b = c + (c << 3); c = rotateLeft(c, 21) + t; the draw is t.
    //
    // From a = 1, b = 2, c = 3, d = 4:
    //   t = 1 + 2 + 4 = 7, then a = 2, b = 3 + 24 = 27,
    //   c = rotateLeft(3, 21) + 7 = 6291456 + 7 = 6291463
    //   t = 2 + 27 + 5 = 34, then a = 27, b = 6291463 + 50331704 = 56623167,
    //   c = rotateLeft(6291463, 21) + 34 = 14680064 + 3072 + 34 = 14683170
    //   t = 27 + 56623167 + 6 = 56623200
    expect(words(rngFromState({ a: 1, b: 2, c: 3, d: 4 }), 3)).toEqual([7, 34, 56623200]);
  });

  it('produces the same stream from the same seed', () => {
    expect(words(makeRng(2026), 8)).toEqual(words(makeRng(2026), 8));
  });

  it('produces a different stream from a different seed', () => {
    expect(words(makeRng(1), 8)).not.toEqual(words(makeRng(2), 8));
  });

  it('records the stream seed zero produces, so the algorithm cannot drift quietly', () => {
    // Recorded once, from an implementation checked against the vector above.
    // A change here changes every replay of seed 0, which is a decision to take
    // in the open rather than a refactor to make by accident (ADR-0006).
    expect(words(makeRng(0), 4)).toEqual([3875131784, 589085353, 1400908032, 2447029337]);
  });

  it('resumes exactly from a snapshot of its cursor', () => {
    const stream = makeRng(4242);
    words(stream, 5);
    const snapshot = { ...stream.state };

    const expected = words(stream, 3);

    expect(words(rngFromState(snapshot), 3)).toEqual(expected);
  });

  it('draws whole integers within the range it is given', () => {
    const rng = makeRng(7);

    for (let draw = 0; draw < 200; draw += 1) {
      const value = rng.nextInt(3, 9);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(3);
      expect(value).toBeLessThanOrEqual(9);
    }

    expect(rng.nextBelow(1)).toBe(0);
    expect(rng.nextInt(5, 5)).toBe(5);
    expect(rng.nextBelow(2 ** 32)).toBeLessThan(2 ** 32);
  });

  it('refuses a bound it cannot draw within', () => {
    const rng = makeRng(1);

    expect(() => rng.nextBelow(0)).toThrow(/bound/);
    expect(() => rng.nextBelow(2.5)).toThrow(/bound/);
    expect(() => rng.nextBelow(2 ** 32 + 1)).toThrow(/bound/);
    expect(() => rng.nextInt(5, 4)).toThrow(/range/);
  });

  it('refuses a seed that is not an unsigned 32-bit integer', () => {
    for (const seed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_SEED + 1]) {
      expect(() => makeRng(seed)).toThrow(/seed/);
    }

    expect(() => makeRng(0)).not.toThrow();
    expect(() => makeRng(MAX_SEED)).not.toThrow();
  });
});
