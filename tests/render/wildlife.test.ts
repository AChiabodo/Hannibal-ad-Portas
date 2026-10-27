import { describe, expect, it } from 'vitest';
import { createFog, eyeOf, refreshVision } from '../../src/sim/fog';
import { generateMap, TERRAIN, terrainAt } from '../../src/sim/map';
import { wildlifeOf, visibleWildlife, wildlifeSprite } from '../../src/render/wildlife';

describe('decorative wildlife', () => {
  it('is reproducible for a seed and does not modify the map', () => {
    const map = generateMap(21);
    const before = Uint8Array.from(map.terrain);
    const first = wildlifeOf(map, 21);
    expect(first.length).toBeGreaterThan(0);
    expect(wildlifeOf(map, 21)).toEqual(first);
    for (const animal of first) {
      expect(terrainAt(map, animal.x, animal.y)).toBe(animal.kind === 'boar' ? TERRAIN.forest : TERRAIN.plain);
      expect(wildlifeSprite(animal.kind).pixels.some((channel, index) => index % 4 === 3 && channel > 0)).toBe(true);
    }
    expect(map.terrain).toEqual(before);
  });

  it('shows animals only when their tile is currently visible', () => {
    const map = generateMap(21);
    const animals = wildlifeOf(map, 21);
    const animal = animals[0];
    expect(animal).toBeDefined();
    if (animal === undefined) return;
    const fog = createFog();
    expect(visibleWildlife(animals, fog, 0)).toEqual([]);
    refreshVision(fog, map, [eyeOf(animal, 0)]);
    expect(visibleWildlife(animals, fog, 0).some((shown) => shown.id === animal.id)).toBe(true);
    const start = visibleWildlife(animals, fog, 0).find((shown) => shown.id === animal.id);
    const later = visibleWildlife(animals, fog, 18).find((shown) => shown.id === animal.id);
    expect(start?.pixelX).not.toBe(later?.pixelX);
    refreshVision(fog, map, []);
    expect(visibleWildlife(animals, fog, 0)).toEqual([]);
  });
});
