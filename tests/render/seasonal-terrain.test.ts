import { describe, expect, it } from 'vitest';
import { generateMap, TERRAIN, terrainAt, MAP_WIDTH, MAP_HEIGHT } from '../../src/sim/map';
import { renderTerrain, tilePixel } from '../../src/render/terrain';
import { pixelAt } from '../../src/art/pixel-buffer';
import { createHash } from 'node:crypto';
import { landscapeDetail } from '../../src/art/landscape-details';
import type { PixelBuffer } from '../../src/art/pixel-buffer';

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
    const spring = renderTerrain(map, 'spring', 11);
    const winter = renderTerrain(map, 'winter', 11);
    for (const point of [road, node]) {
      const at = tilePixel(point.x, point.y);
      expect(pixelAt(winter, at.x + 8, at.y + 8)).toEqual(pixelAt(spring, at.x + 8, at.y + 8));
    }
  });

  it('draws reproducible landscape details that vary with the presentation seed', () => {
    const map = generateMap(11);
    const fingerprint = (seed: number): string => createHash('sha256')
      .update(renderTerrain(map, 'spring', seed).pixels).digest('hex');
    expect(fingerprint(11)).toBe(fingerprint(11));
    expect(fingerprint(12)).not.toBe(fingerprint(11));
  });

  it('places seasonal bush sprites on the same ground without changing the map', () => {
    const map = generateMap(11);
    const before = Uint8Array.from(map.terrain);
    const spring = renderTerrain(map, 'spring', 11);
    const winter = renderTerrain(map, 'winter', 11);
    const containsSprite = (frame: PixelBuffer, sprite: PixelBuffer, x: number, y: number): boolean => {
      for (let sy = 0; sy < sprite.height; sy += 1) for (let sx = 0; sx < sprite.width; sx += 1) {
        const source = (sy * sprite.width + sx) * 4;
        if (sprite.pixels[source + 3] === 0) continue;
        const dest = ((y + sy) * frame.width + x + sx) * 4;
        for (let channel = 0; channel < 4; channel += 1)
          if (sprite.pixels[source + channel] !== frame.pixels[dest + channel]) return false;
      }
      return true;
    };
    let found = false;
    for (let y = 0; y < MAP_HEIGHT && !found; y += 1) for (let x = 0; x < MAP_WIDTH && !found; x += 1) {
      if (terrainAt(map, x, y) !== TERRAIN.plain) continue;
      const at = tilePixel(x, y);
      for (let variant = 0; variant < 3; variant += 1) {
        if (containsSprite(spring, landscapeDetail('bush', 'spring', variant), at.x + 3, at.y + 2) &&
          containsSprite(winter, landscapeDetail('bush', 'winter', variant), at.x + 3, at.y + 2)) {
          found = true;
          break;
        }
      }
    }
    expect(found).toBe(true);
    expect(map.terrain).toEqual(before);
  });

  it('keeps lake water recognizable through seasonal changes', () => {
    const map = Array.from({ length: 20 }, (_, seed) => generateMap(seed))
      .find((candidate) => candidate.terrain.includes(TERRAIN.lake));
    expect(map).toBeDefined();
    if (map === undefined) return;
    const lake = map.terrain.indexOf(TERRAIN.lake);
    const at = tilePixel(lake % MAP_WIDTH, Math.floor(lake / MAP_WIDTH));
    expect(pixelAt(renderTerrain(map, 'winter', 4), at.x + 8, at.y + 8))
      .toEqual(pixelAt(renderTerrain(map, 'spring', 4), at.x + 8, at.y + 8));
  });

  it('keeps bridge pixels clear through seasonal changes', () => {
    const map = Array.from({ length: 20 }, (_, seed) => generateMap(seed))
      .find((candidate) => candidate.terrain.includes(TERRAIN.bridge));
    expect(map).toBeDefined();
    if (map === undefined) return;
    const bridge = map.terrain.indexOf(TERRAIN.bridge);
    const at = tilePixel(bridge % MAP_WIDTH, Math.floor(bridge / MAP_WIDTH));
    expect(pixelAt(renderTerrain(map, 'winter', 4), at.x + 8, at.y + 8))
      .toEqual(pixelAt(renderTerrain(map, 'spring', 4), at.x + 8, at.y + 8));
  });
});
