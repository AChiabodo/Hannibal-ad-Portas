import { describe, expect, it } from 'vitest';
import { distance } from '../../src/ai/site.ts';

describe('the planning Site', () => {
  it('measures Chebyshev: a diagonal costs one tile, as movement does', () => {
    expect(distance({ x: 4, y: 9 }, { x: 4, y: 9 })).toBe(0);
    expect(distance({ x: 0, y: 0 }, { x: 4, y: 0 })).toBe(4);
    expect(distance({ x: 0, y: 0 }, { x: 0, y: 4 })).toBe(4);
    expect(distance({ x: 1, y: 2 }, { x: 5, y: 5 })).toBe(4);
  });

  it('is symmetric, so two policies cannot disagree about who is in reach of whom', () => {
    const a = { x: 3, y: 7 };
    const b = { x: 10, y: 2 };
    expect(distance(a, b)).toBe(distance(b, a));
  });
});
