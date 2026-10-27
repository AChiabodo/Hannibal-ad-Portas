import { describe, expect, it } from 'vitest';
import { generateMap, TERRAIN, terrainAt, MAP_WIDTH, MAP_HEIGHT } from '../../src/sim/map';
import { renderTerrain, tilePixel } from '../../src/render/terrain';
import { pixelAt } from '../../src/art/pixel-buffer';

describe('seasonal terrain presentation', () => {
  it('changes the appearance of the same plain in autumn and winter without changing the map', () => {
    const map = generateMap(11);
    const before = Uint8Array.from(map.terrain);
    let point = { x: 0, y: 0 };
    for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
      for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
        if (terrainAt(map, x, y) === TERRAIN.plain) { point = { x, y }; break; }
      }
      if (point.x !== 0) break;
    }
    const at = tilePixel(point.x, point.y);
    const spring = pixelAt(renderTerrain(map, 'spring'), at.x + 4, at.y + 4);
    const autumn = pixelAt(renderTerrain(map, 'autumn'), at.x + 4, at.y + 4);
    const winter = pixelAt(renderTerrain(map, 'winter'), at.x + 4, at.y + 4);
    expect(autumn).not.toEqual(spring);
    expect(winter).not.toEqual(spring);
    expect(map.terrain).toEqual(before);
  });

  it('keeps a road and its resource marker legible in winter', () => {
    const map = generateMap(11);
    const roadIndex = map.terrain.findIndex((terrain) => terrain === TERRAIN.road);
    const road = { x: roadIndex % MAP_WIDTH, y: Math.floor(roadIndex / MAP_WIDTH) };
    const node = map.resources[0];
    expect(roadIndex).toBeGreaterThanOrEqual(0);
    expect(node).toBeDefined();
    if (roadIndex < 0 || node === undefined) return;
    const spring = renderTerrain(map, 'spring');
    const winter = renderTerrain(map, 'winter');
    for (const point of [road, node]) {
      const at = tilePixel(point.x, point.y);
      expect(pixelAt(winter, at.x + 8, at.y + 8)).toEqual(pixelAt(spring, at.x + 8, at.y + 8));
    }
  });
});
