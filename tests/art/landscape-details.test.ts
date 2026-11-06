import { describe, expect, it } from 'vitest';
import { landscapeDetail } from '../../src/art/landscape-details';
import { RAMPS, shadeAt } from '../../src/art/palette';

describe('procedural landscape details', () => {
  it.each(['tree', 'rock', 'bush'] as const)('has three distinct %s silhouettes rather than recoloured duplicates', (kind) => {
    const silhouettes = [0, 1, 2].map((variant) => [...landscapeDetail(kind, 'spring', variant).pixels]
      .filter((_value, index) => index % 4 === 3).join(','));
    expect(new Set(silhouettes).size).toBe(3);
  });

  it('drops deciduous foliage in winter while keeping the evergreen and snow', () => {
    const leaf = shadeAt(RAMPS.olive, 3);
    const snow = shadeAt(RAMPS.stone, 6);
    const contains = (buffer: ReturnType<typeof landscapeDetail>, colour: readonly number[]) => {
      for (let index = 0; index < buffer.pixels.length; index += 4)
        if (colour.every((channel, component) => buffer.pixels[index + component] === channel)) return true;
      return false;
    };
    expect(contains(landscapeDetail('tree', 'spring', 0), leaf)).toBe(true);
    expect(contains(landscapeDetail('tree', 'winter', 0), leaf)).toBe(false);
    expect(contains(landscapeDetail('tree', 'winter', 1), leaf)).toBe(true);
    for (const variant of [1, 2]) expect(contains(landscapeDetail('tree', 'autumn', variant), leaf)).toBe(true);
    for (const kind of ['tree', 'rock', 'bush'] as const)
      for (const variant of [0, 1, 2]) expect(contains(landscapeDetail(kind, 'winter', variant), snow), `${kind} ${variant}`).toBe(true);
  });

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
