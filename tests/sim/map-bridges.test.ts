import { describe, expect, it } from 'vitest';
import { generateMap, TERRAIN } from '../../src/sim/map';
import { moveCost } from '../../src/sim/route';

describe('road bridges', () => {
  it('generates a crossing that has the movement cost of a road', () => {
    const maps = Array.from({ length: 30 }, (_, seed) => generateMap(seed));
    expect(maps.some((map) => map.terrain.includes(TERRAIN.bridge))).toBe(true);
    expect(moveCost(TERRAIN.bridge)).toBe(moveCost(TERRAIN.road));
    expect(moveCost(TERRAIN.bridge)).toBeLessThan(moveCost(TERRAIN.ford));
  });
});
