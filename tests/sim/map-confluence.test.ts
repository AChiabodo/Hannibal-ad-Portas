import { expect, it } from 'vitest';
import { generateMap, TERRAIN } from '../../src/sim/map';

it('places a crossing on each substantial branch of a confluence across 1000 seeds', () => {
  const missing: string[] = [];
  let branches = 0;
  for (let seed = 0; seed < 1000; seed += 1) {
    const map = generateMap(seed);
    for (const [index, river] of map.rivers.entries()) {
      const shared = new Set(map.rivers.flatMap((other, otherIndex) => otherIndex === index ? [] : other.tiles));
      if (!river.tiles.some((tile) => shared.has(tile))) continue;
      let start = 0;
      for (let end = 0; end <= river.tiles.length; end += 1) {
        if (end < river.tiles.length && !shared.has(river.tiles[end]!)) continue;
        const branch = river.tiles.slice(start, end);
        if (branch.length >= 20) {
          branches += 1;
          if (!branch.some((tile) => map.terrain[tile] === TERRAIN.ford || map.terrain[tile] === TERRAIN.bridge)) {
            missing.push(`seed ${String(seed)}, river ${String(index)}, branch ${String(start)}–${String(end)}`);
          }
        }
        start = end + 1;
      }
    }
  }
  expect(branches).toBeGreaterThan(0);
  expect(missing).toEqual([]);
}, 60000);
