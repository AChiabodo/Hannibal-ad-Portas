import { describe, expect, it } from 'vitest';
import { landscapeDetail } from '../../src/art/landscape-details';

describe('procedural landscape details', () => {
  it('draws distinct tree variants and seasonal snow without external assets', () => {
    const spring = landscapeDetail('tree', 'spring', 0);
    const other = landscapeDetail('tree', 'spring', 1);
    const winter = landscapeDetail('tree', 'winter', 0);
    expect(spring.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    expect(other.pixels).not.toEqual(spring.pixels);
    expect(winter.pixels).not.toEqual(spring.pixels);
    expect(landscapeDetail('tree', 'spring', 0).pixels).toEqual(spring.pixels);
  });

  it('draws distinct seasonal bushes with reproducible shapes', () => {
    const spring = landscapeDetail('bush', 'spring', 0);
    const autumn = landscapeDetail('bush', 'autumn', 0);
    const winter = landscapeDetail('bush', 'winter', 0);
    const other = landscapeDetail('bush', 'spring', 1);
    const tree = landscapeDetail('tree', 'spring', 0);
    expect(spring.pixels.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
    expect(other.pixels).not.toEqual(spring.pixels);
    expect(tree.pixels).not.toEqual(spring.pixels);
    expect(autumn.pixels).not.toEqual(spring.pixels);
    expect(winter.pixels).not.toEqual(spring.pixels);
    expect(landscapeDetail('bush', 'spring', 0).pixels).toEqual(spring.pixels);
  });
});
