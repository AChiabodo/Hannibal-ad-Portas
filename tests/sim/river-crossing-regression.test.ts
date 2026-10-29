import { describe, expect, it } from 'vitest';
import { generateMap, MAP_HEIGHT, TERRAIN, tileIndex } from '../../src/sim/map';
import { riverProblems } from './map-invariants';

describe('distinct river crossings', () => {
  it('does not count the same crossing twice when a river path turns back over it', () => {
    const base = generateMap(0);
    const terrain = new Uint8Array(base.terrain.length).fill(TERRAIN.plain);
    const tiles = Array.from({ length: MAP_HEIGHT }, (_, y) => tileIndex(30, y));
    for (const tile of tiles) terrain[tile] = TERRAIN.river;
    terrain[tileIndex(30, 80)] = TERRAIN.ford;
    const river = [...tiles.slice(0, 81), tiles[79]!, ...tiles.slice(80)];
    const map = { ...base, terrain, rivers: [{ tiles: river }] };

    expect(riverProblems(map)).toContain('river 0 has fewer than two distinct crossings');
  });

  it('treats crossing tiles joined beside the river path as one crossing', () => {
    const base = generateMap(0);
    const terrain = new Uint8Array(base.terrain.length).fill(TERRAIN.plain);
    const tiles = Array.from({ length: MAP_HEIGHT }, (_, y) => tileIndex(30, y));
    for (const tile of tiles) terrain[tile] = TERRAIN.river;
    for (const y of [80, 82]) terrain[tileIndex(30, y)] = TERRAIN.ford;
    for (const y of [80, 81, 82]) terrain[tileIndex(29, y)] = TERRAIN.ford;
    const map = { ...base, terrain, rivers: [{ tiles }] };

    expect(riverProblems(map)).toContain('river 0 has fewer than two distinct crossings');
    terrain[tileIndex(29, 81)] = TERRAIN.plain;
    expect(riverProblems(map)).not.toContain('river 0 has fewer than two distinct crossings');
  });
});
