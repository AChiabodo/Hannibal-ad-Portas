import { describe, expect, it } from 'vitest';
import { generateMap, halfOf, MAP_HEIGHT, MAP_WIDTH, TERRAIN, terrainAt } from '../../src/sim/map';

describe('barbarian camp placement', () => {
  it('reproducibly places camps away from settlements and balances both halves', () => {
    const totals = new Set<number>();
    for (let seed = 0; seed < 32; seed += 1) {
      const map = generateMap(seed);
      const camps = map.barbarianCamps ?? [];
      expect(generateMap(seed).barbarianCamps).toEqual(camps);
      totals.add(camps.length);
      expect(camps.length).toBeGreaterThanOrEqual(2);
      const halves = [0, 0];
      for (const camp of camps) {
        halves[halfOf(map, camp.x, camp.y)]! += 1;
        expect(camp.x).toBeGreaterThanOrEqual(2);
        expect(camp.y).toBeGreaterThanOrEqual(2);
        expect(camp.x).toBeLessThan(MAP_WIDTH - 2);
        expect(camp.y).toBeLessThan(MAP_HEIGHT - 2);
        expect(camp.variant).toBeGreaterThanOrEqual(0);
        expect(camp.variant).toBeLessThan(3);
        for (const site of [...map.strongholds, ...map.settlements]) {
          expect(Math.max(Math.abs(camp.x - site.x), Math.abs(camp.y - site.y))).toBeGreaterThan(14);
        }
        for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
          expect([TERRAIN.river, TERRAIN.ford, TERRAIN.road]).not.toContain(terrainAt(map, camp.x + dx, camp.y + dy));
        }
      }
      expect(halves[0]).toBe(halves[1]);
    }
    expect(totals.size).toBeGreaterThan(1);
  }, 30000);
});

