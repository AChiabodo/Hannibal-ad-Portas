import { describe, expect, it } from 'vitest';
import { requireTickCount } from '../../src/sim/ticks';

describe('a count of ticks', () => {
  it('accepts a whole number at or above the floor it is given', () => {
    expect(requireTickCount(0, 'ticks', 0)).toBe(0);
    expect(requireTickCount(3, 'ticks', 0)).toBe(3);
    expect(requireTickCount(1200, 'ticks', 0)).toBe(1200);
    expect(requireTickCount(1, 'everyTicks', 1)).toBe(1);
  });

  it('refuses a fraction of a tick, a negative, and a count under the floor', () => {
    for (const value of [1.5, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => requireTickCount(value, 'ticks', 0)).toThrow(
        /ticks must be a whole number of ticks, 0 or more/,
      );
    }

    expect(() => requireTickCount(0, 'everyTicks', 1)).toThrow(/everyTicks/);
  });

  it('refuses a count no Match could ever reach, so a bound stays a bound', () => {
    for (const value of [Number.MAX_SAFE_INTEGER + 1, 2 ** 53]) {
      expect(() => requireTickCount(value, 'ticks', 0)).toThrow(/whole number of ticks/);
    }

    expect(requireTickCount(Number.MAX_SAFE_INTEGER, 'ticks', 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
});
