/**
 * What a generated map must be, one acceptance criterion at a time (ticket B1).
 *
 * The map is organic, so its fairness cannot be read off its shape; it is a set
 * of statements about the map that comes out, and every test here is one of
 * them. The checkers live in `map-invariants.ts`, written against the finished
 * grid rather than against the generator, and `map-seeds.test.ts` runs the same
 * set over a thousand seeds.
 *
 * The sample here is small on purpose — a dozen seeds, so a broken invariant
 * says which one it is in seconds — and the thousand-seed property test is where
 * the contract is held to the number the ticket asks for.
 */
import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { findRoute } from '../../src/sim/route';
import {
  generateMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE_KINDS,
  TILE_COUNT,
  isTerrain,
  type MapGrid,
} from '../../src/sim/map';
import {
  connectivityProblems,
  mapProblems,
  resourceProblems,
  riverProblems,
  roadProblems,
  settlementProblems,
  strongholdProblems,
  terrainProblems,
} from './map-invariants';

/** The seeds the per-criterion tests walk: the first dozen, which is fast and varied. */
const SEEDS = Array.from({ length: 12 }, (_, seed) => seed);

/** Every problem these seeds produce, each tagged with the seed that produced it. */
function problemsOver(seeds: readonly number[], check: (map: MapGrid) => readonly string[]): string[] {
  return seeds.flatMap((seed) =>
    check(generateMap(seed)).map((problem) => `seed ${String(seed)}: ${problem}`),
  );
}

describe('a map nobody drew', () => {
  it('is a full theatre of tiles, every one of them a terrain the map knows', () => {
    expect(problemsOver(SEEDS, terrainProblems)).toEqual([]);

    const map = generateMap(1);
    expect(map.terrain.length).toBe(TILE_COUNT);
    expect(MAP_WIDTH * MAP_HEIGHT).toBe(TILE_COUNT);
    expect(map.terrain.every((ground) => isTerrain(ground))).toBe(true);
  });

  it('is the same map every time the same seed is generated, and another map on another seed', () => {
    for (const seed of SEEDS) {
      expect(hashState(generateMap(seed))).toBe(hashState(generateMap(seed)));
    }

    const hashes = new Set(SEEDS.map((seed) => hashState(generateMap(seed))));
    expect(hashes.size).toBe(SEEDS.length);
  });

  it('refuses a seed the random source refuses, rather than drawing a map from it', () => {
    for (const seed of [-1, 1.5, Number.NaN, 0x1_0000_0000]) {
      expect(() => generateMap(seed)).toThrow(RangeError);
    }
  });
});

describe('the fairness the theatre is held to', () => {
  it('leaves the land in one piece, with every settlement and resource node walkable from the Strongholds', () => {
    expect(problemsOver(SEEDS, connectivityProblems)).toEqual([]);
  });

  it('sets the two Strongholds at least the stated minimum distance apart', () => {
    expect(problemsOver(SEEDS, strongholdProblems)).toEqual([]);
  });

  it('carries six to eight capturable minor settlements, each on a tile of its own', () => {
    expect(problemsOver(SEEDS, settlementProblems)).toEqual([]);
    expect(SEEDS.every((seed) => generateMap(seed).settlements.length >= 6)).toBe(true);
    expect(SEEDS.some((seed) => generateMap(seed).settlements.length > 6)).toBe(true);
  });

  it('gives each Stronghold a neutral settlement within a short opening march', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const map = generateMap(seed);
      for (const stronghold of map.strongholds) {
        const nearest = Math.min(...map.settlements.map((site) =>
          Math.abs(site.x - stronghold.x) + Math.abs(site.y - stronghold.y)));
        expect(nearest, `seed ${String(seed)}`).toBeLessThanOrEqual(48);
        const nearby = map.settlements.filter((site) =>
          Math.abs(site.x - stronghold.x) + Math.abs(site.y - stronghold.y) <= 48);
        const marchLengths = nearby.flatMap((site) => {
          const route = findRoute(map, stronghold, site);
          return route.kind === 'route' ? [route.steps.length] : [];
        });
        expect(Math.min(...marchLengths), `seed ${String(seed)}`).toBeLessThanOrEqual(80);
      }
    }
  });

  it('crosses every river with at least the stated minimum of fords, and runs it edge to edge', () => {
    expect(problemsOver(SEEDS, riverProblems)).toEqual([]);
  });

  it('keeps the two halves within the stated tolerance, resource by resource', () => {
    expect(problemsOver(SEEDS, resourceProblems)).toEqual([]);
  });

  it('gives the map all four resources, whatever the seed', () => {
    for (const seed of SEEDS) {
      const kinds = new Set(generateMap(seed).resources.map((node) => node.kind));
      expect([...kinds].sort()).toEqual([...RESOURCE_KINDS].sort());
    }
  });

  it('generates roads as paths joining the nodes, and joining them to the Strongholds', () => {
    expect(problemsOver(SEEDS, roadProblems)).toEqual([]);
  });

  it('holds every invariant at once, on every seed of the sample', () => {
    expect(problemsOver(SEEDS, mapProblems)).toEqual([]);
  });
});
