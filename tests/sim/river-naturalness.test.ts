import { describe, expect, it } from 'vitest';
import { generateMap, tileIndex } from '../../src/sim/map';

/** Describe one river's traversed graph; other rivers may share its nodes. */
function shape(tiles: readonly number[]): { branches: number; cycles: number } {
  const nodes = new Set(tiles);
  const edges = new Set<string>();
  const degree = new Map<number, number>();
  for (let i = 1; i < tiles.length; i += 1) {
    const a = tiles[i - 1]!;
    const b = tiles[i]!;
    const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
    if (edges.has(key)) continue;
    edges.add(key);
    degree.set(a, (degree.get(a) ?? 0) + 1);
    degree.set(b, (degree.get(b) ?? 0) + 1);
  }
  return { branches: [...degree.values()].filter((value) => value > 2).length,
    cycles: edges.size - nodes.size + 1 };
}

describe('river shape', () => {
  it('accepts a confluence shared by two different simple rivers', () => {
    const horizontal = [tileIndex(10, 11), tileIndex(11, 11), tileIndex(12, 11)];
    const vertical = [tileIndex(11, 10), tileIndex(11, 11), tileIndex(11, 12)];
    expect(horizontal.some((tile) => vertical.includes(tile))).toBe(true);
    expect([shape(horizontal), shape(vertical)]).toEqual([
      { branches: 0, cycles: 0 }, { branches: 0, cycles: 0 },
    ]);
  });

  it('does not generate rivers that turn back into spurious branches or loops', () => {
    const issues = [9, 231].flatMap((seed) => generateMap(seed).rivers.flatMap((river, index) => {
      const result = shape(river.tiles);
      return result.branches > 0 || result.cycles > 0 ? [{ seed, index, ...result }] : [];
    }));
    expect(issues).toEqual([]);
  });

  it('does not extend seed 581 into a ten-tile blind tongue of water', () => {
    const map = generateMap(581);
    const river = map.rivers[1]!;
    expect(river.tiles).toContain(tileIndex(122, 58));
    expect(river.tiles).toContain(tileIndex(123, 58));
    expect(river.tiles).not.toContain(tileIndex(122, 67));
    expect(river.tiles).not.toContain(tileIndex(123, 67));
  });

  it('retains a compact bend and a confluence between distinct rivers', () => {
    const compact = generateMap(4).rivers[1]!.tiles;
    const start = compact.indexOf(tileIndex(36, 11));
    expect(start).toBeGreaterThanOrEqual(0);
    expect(compact.slice(start, start + 4)).toEqual([
      tileIndex(36, 11), tileIndex(36, 12), tileIndex(37, 12), tileIndex(37, 11),
    ]);
    const rivers = generateMap(31).rivers;
    for (const x of [122, 123, 124, 125, 126, 127, 128]) {
      expect(rivers[0]!.tiles).toContain(tileIndex(x, 39));
      expect(rivers[1]!.tiles).toContain(tileIndex(x, 39));
    }
  });
});
