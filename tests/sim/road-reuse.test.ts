import { expect, it } from 'vitest';
import { generateMap, MAP_WIDTH, tileX, tileY } from '../../src/sim/map';

it('reuses existing road segments when equivalent shortest routes are available', () => {
  const map = generateMap(7);
  const seen = new Set<number>();
  let reused = 0;
  let beside = 0;
  for (const road of map.roads) {
    for (const tile of road.tiles) {
      if (seen.has(tile)) reused += 1;
      else if ([tile - MAP_WIDTH, tile + MAP_WIDTH, tile - 1, tile + 1].some((neighbor) =>
        seen.has(neighbor) && Math.abs(tileX(neighbor) - tileX(tile)) + Math.abs(tileY(neighbor) - tileY(tile)) === 1)) beside += 1;
    }
    for (const tile of road.tiles) seen.add(tile);
  }
  // On this seed the earlier equal-length choices left 30 tiles immediately
  // beside the network and reused only 59; the junctions now use existing roads.
  expect(reused).toBeGreaterThan(59);
  expect(beside).toBeLessThan(30);
});
