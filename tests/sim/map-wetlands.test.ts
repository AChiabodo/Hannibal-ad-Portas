import { describe, expect, it } from 'vitest';
import { materialTile } from '../../src/art/terrain';
import { MATERIAL_OF_TERRAIN } from '../../src/render/terrain';
import { generateMap, isWalkable, TERRAIN, tileX, tileY } from '../../src/sim/map';
import { findRoute, moveCost } from '../../src/sim/route';
import { blockedTile } from '../../src/sim/settlement-space';

describe('lakes and marshes', () => {
  it('generates water to go around and walkable, slower marsh in the landscape', () => {
    const maps = Array.from({ length: 20 }, (_, seed) => generateMap(seed));
    expect(maps.some((map) => map.terrain.includes(TERRAIN.lake))).toBe(true);
    expect(maps.some((map) => map.terrain.includes(TERRAIN.marsh))).toBe(true);
    expect(isWalkable(TERRAIN.lake)).toBe(false);
    expect(isWalkable(TERRAIN.marsh)).toBe(true);
    expect(moveCost(TERRAIN.marsh)).toBeGreaterThan(moveCost(TERRAIN.plain));
    expect(() => moveCost(TERRAIN.lake)).toThrow(RangeError);
  });

  it('gives both terrains a procedural material', () => {
    expect(materialTile(MATERIAL_OF_TERRAIN[TERRAIN.lake]).width).toBeGreaterThan(0);
    expect(materialTile(MATERIAL_OF_TERRAIN[TERRAIN.marsh]).width).toBeGreaterThan(0);
    expect(MATERIAL_OF_TERRAIN[TERRAIN.lake]).not.toBe(MATERIAL_OF_TERRAIN[TERRAIN.marsh]);
  });

  it('refuses to march into a lake in both the route and physical-space checks', () => {
    const map = Array.from({ length: 20 }, (_, seed) => generateMap(seed))
      .find((candidate) => candidate.terrain.includes(TERRAIN.lake));
    expect(map).toBeDefined();
    if (map === undefined) return;
    const lake = map.terrain.indexOf(TERRAIN.lake);
    const target = { x: tileX(lake), y: tileY(lake) };
    expect(findRoute(map, map.strongholds[0], target)).toEqual({ kind: 'refused', reason: 'water' });
    expect(blockedTile(map, 0, target.x, target.y)).toBe(true);
  });
});
