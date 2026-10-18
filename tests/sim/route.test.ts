/**
 * The way across the theatre, one acceptance criterion at a time (ticket C1).
 *
 * Five things are being asked here, and each is asked where it can be read off
 * a picture rather than believed: what a tile costs to cross, what a route is
 * made of, what a refusal says, that a search answers the same way twice, and
 * that a route already computed is not computed again.
 *
 * The worked examples are painted by hand (`test-map.ts`) and the cost of a
 * route is compared against an independent relaxation (`route-invariants.ts`),
 * so the pathfinder is never the thing that says the pathfinder is right.
 */
import { describe, expect, it } from 'vitest';
import {
  generateMap,
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRAIN,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type Site,
} from '../../src/sim/map';
import { createRouteCache, findRoute, moveCost } from '../../src/sim/route';
import { costOf, neighboursOf, shortestCost } from './route-invariants';
import { at, paintedMap, repeated } from './test-map';

/** A wall of open water, from one edge of the theatre to the other. */
function waterWall(column: number): MapGrid {
  return paintedMap(repeated(MAP_HEIGHT, `${'.'.repeat(column)}~.`));
}

/** The steps of a route a search found; a refusal here is a failure with a reason. */
function stepsOf(map: MapGrid, from: Site, to: Site): readonly number[] {
  const route = findRoute(map, from, to);
  if (route.kind === 'refused') throw new Error(`the search refused: ${route.reason}`);

  return route.steps;
}

/** The reason a route was refused, or `null` when one was found. */
function refusalOf(map: MapGrid, from: Site, to: Site): string | null {
  const route = findRoute(map, from, to);
  return route.kind === 'refused' ? route.reason : null;
}

/** Tiles written as the sites a reader can see. */
function tiles(...sites: readonly Site[]): readonly number[] {
  return sites.map((site) => tileIndex(site.x, site.y));
}

describe('what crossing a tile costs a Squad', () => {
  it('charges a road the least, plain and farmland the ordinary pace, and hill and forest double', () => {
    expect(moveCost(TERRAIN.road)).toBeLessThan(moveCost(TERRAIN.plain));
    expect(moveCost(TERRAIN.plain)).toBeLessThan(moveCost(TERRAIN.hill));
    expect(moveCost(TERRAIN.hill)).toBe(moveCost(TERRAIN.forest));
    expect(moveCost(TERRAIN.farmland)).toBeGreaterThanOrEqual(moveCost(TERRAIN.plain));
  });

  it('makes fording the slowest crossing there is, because a ford disorders as well as wets', () => {
    for (const terrain of [TERRAIN.plain, TERRAIN.hill, TERRAIN.forest, TERRAIN.road]) {
      expect(moveCost(TERRAIN.ford)).toBeGreaterThan(moveCost(terrain));
    }
  });

  it('prices every crossing in whole ticks of at least one, so a route is a length of time', () => {
    for (const terrain of [
      TERRAIN.plain,
      TERRAIN.hill,
      TERRAIN.forest,
      TERRAIN.farmland,
      TERRAIN.ford,
      TERRAIN.road,
    ]) {
      expect(Number.isInteger(moveCost(terrain))).toBe(true);
      expect(moveCost(terrain)).toBeGreaterThanOrEqual(1);
    }
  });

  it('refuses to price water: a river is not slow, it is not crossed', () => {
    expect(() => moveCost(TERRAIN.river)).toThrow(RangeError);
  });
});

describe('the way from one tile to another', () => {
  it('is no steps at all when a Squad is sent to the tile it is standing on', () => {
    expect(stepsOf(paintedMap([]), at(3, 3), at(3, 3))).toEqual([]);
  });

  it('is one step onto the neighbouring tile it was sent to', () => {
    expect(stepsOf(paintedMap([]), at(3, 3), at(3, 4))).toEqual(tiles(at(3, 4)));
    expect(stepsOf(paintedMap([]), at(3, 3), at(4, 3))).toEqual(tiles(at(4, 3)));
  });

  it('walks the road round the hill rather than the hill straight through, because it is cheaper', () => {
    // Six tiles from end to end: three hills in a row on the straight line, and a
    // road along the tile above it. The road costs 2 a tile and the last step 4;
    // the hills cost 8 each and the last step 4. The way round is the way.
    const map = paintedMap(['-----', '.^^^.']);

    expect(stepsOf(map, at(0, 1), at(4, 1))).toEqual(
      tiles(at(0, 0), at(1, 0), at(2, 0), at(3, 0), at(4, 0), at(4, 1)),
    );
  });

  it('walks through the one ford in a river rather than across the water', () => {
    const map = paintedMap([
      '....~...',
      '....~...',
      '....=...',
      '....~...',
      '....~...',
    ], 0, 4);

    const steps = stepsOf(map, at(1, 6), at(7, 6));

    expect(steps).toContain(tileIndex(4, 6));
    for (const step of steps) expect(isWalkable(terrainAt(map, tileX(step), tileY(step)))).toBe(true);
  });

  it('costs what the shortest way costs, on a theatre nobody drew', () => {
    for (const seed of [1, 2, 3, 7, 11, 42]) {
      const map = generateMap(seed);
      const [rome, carthage] = map.strongholds;

      const steps = stepsOf(map, rome, carthage);

      expect(costOf(map, steps)).toBe(shortestCost(map, rome, carthage));
    }
  });

  it('is a walk: every step beside the one before it, and it ends where it was sent', () => {
    const map = generateMap(7);
    const [rome, carthage] = map.strongholds;
    const steps = stepsOf(map, rome, carthage);

    expect(steps.length).toBeGreaterThan(0);
    expect(steps.at(-1)).toBe(tileIndex(carthage.x, carthage.y));

    let previous = tileIndex(rome.x, rome.y);
    for (const step of steps) {
      expect(neighboursOf(previous)).toContain(step);
      expect(isWalkable(terrainAt(map, tileX(step), tileY(step)))).toBe(true);
      previous = step;
    }
  });

  it('never visits the same tile twice, which a shortest way never has to', () => {
    const map = generateMap(3);
    const [rome, carthage] = map.strongholds;
    const steps = stepsOf(map, rome, carthage);

    expect(new Set(steps).size).toBe(steps.length);
  });

  it('costs the steps it must take when the ground is plain, and no more', () => {
    const map = paintedMap([]);
    const steps = stepsOf(map, at(2, 2), at(9, 6));

    // Seven tiles across and four down: eleven steps, whatever order they come
    // in, and plain ground is the only price there is to pay on this theatre.
    expect(steps.length).toBe(11);
    expect(costOf(map, steps)).toBe(11 * moveCost(TERRAIN.plain));
  });

  it('answers the same way every time: the same theatre, the same ends, the same route', () => {
    const map = generateMap(5);
    const [rome, carthage] = map.strongholds;

    expect(findRoute(map, rome, carthage)).toEqual(findRoute(map, rome, carthage));
  });
});

describe('a tile no way reaches', () => {
  it('is refused for the water it is, and says so', () => {
    const map = paintedMap(['..~..']);

    expect(refusalOf(map, at(0, 0), at(2, 0))).toBe('water');
  });

  it('is refused for standing off the map, and says so', () => {
    const map = paintedMap([]);

    expect(refusalOf(map, at(0, 0), at(MAP_WIDTH, 0))).toBe('off-map');
    expect(refusalOf(map, at(0, 0), at(0, -1))).toBe('off-map');
    expect(refusalOf(map, at(0, 0), at(0, MAP_HEIGHT))).toBe('off-map');
  });

  it('is refused as unreachable when a wall of water parts the land and no ford crosses it', () => {
    const map = waterWall(4);

    expect(refusalOf(map, at(1, 1), at(7, 1))).toBe('unreachable');
    expect(refusalOf(map, at(7, 1), at(1, 1))).toBe('unreachable');
  });

  it('is reachable again the moment one tile of the wall is a ford', () => {
    const map = waterWall(4);
    map.terrain[tileIndex(4, 40)] = TERRAIN.ford;

    expect(refusalOf(map, at(1, 1), at(7, 1))).toBeNull();
  });

  it('refuses to set out from water or from off the map, which no Squad can be doing', () => {
    const map = waterWall(4);

    expect(() => findRoute(map, at(4, 1), at(7, 1))).toThrow(RangeError);
    expect(() => findRoute(map, at(-1, 1), at(7, 1))).toThrow(RangeError);
    expect(() => findRoute(map, at(1.5, 1), at(7, 1))).toThrow(RangeError);
  });
});

describe('routes a theatre has already worked out', () => {
  it('answers a second order to the same place from memory, rather than searching again', () => {
    const map = generateMap(1);
    const [rome, carthage] = map.strongholds;
    const cache = createRouteCache(map);

    const first = cache.route(rome, carthage);
    const second = cache.route(rome, carthage);

    expect(second).toEqual(first);
    expect(cache.searches).toBe(1);
    expect(cache.hits).toBe(1);
  });

  it('hands back what the search itself would, so reuse is not a second answer', () => {
    const map = generateMap(2);
    const [rome, carthage] = map.strongholds;

    expect(createRouteCache(map).route(rome, carthage)).toEqual(findRoute(map, rome, carthage));
  });

  it('searches again for a different start, and remembers that one too', () => {
    const map = paintedMap([]);
    const cache = createRouteCache(map);

    cache.route(at(0, 0), at(9, 9));
    cache.route(at(1, 0), at(9, 9));

    expect(cache.searches).toBe(2);
    expect(cache.route(at(0, 0), at(9, 9))).toEqual(findRoute(map, at(0, 0), at(9, 9)));
    expect(cache.hits).toBe(1);
  });

  it('remembers a refusal as well as a route: an unreachable tile is not searched for twice', () => {
    const map = waterWall(4);
    const cache = createRouteCache(map);

    expect(cache.route(at(1, 1), at(7, 1))).toEqual({ kind: 'refused', reason: 'unreachable' });
    expect(cache.route(at(1, 1), at(7, 1))).toEqual({ kind: 'refused', reason: 'unreachable' });
    expect(cache.searches).toBe(1);
    expect(cache.hits).toBe(1);
  });

  it('does not spend a search on a tile that is not on the map: there is nothing to work out', () => {
    const cache = createRouteCache(paintedMap([]));

    expect(cache.route(at(0, 0), at(MAP_WIDTH, 0))).toEqual({ kind: 'refused', reason: 'off-map' });
    expect(cache.searches).toBe(0);
    expect(cache.size).toBe(0);
  });

  it('remembers a limited number, and forgets the oldest rather than growing without end', () => {
    const map = paintedMap([]);
    const cache = createRouteCache(map, 2);

    cache.route(at(0, 0), at(9, 9));
    cache.route(at(0, 0), at(9, 8));
    cache.route(at(0, 0), at(9, 7));
    expect(cache.size).toBe(2);

    // The oldest was forgotten, so asking for it again costs a search — and
    // still answers with the same route, which is what makes forgetting safe.
    expect(cache.route(at(0, 0), at(9, 9))).toEqual(findRoute(map, at(0, 0), at(9, 9)));
    expect(cache.searches).toBe(4);
    expect(cache.size).toBe(2);
  });

  it('hands out a route of its own, so a caller that walks it cannot spoil the memory', () => {
    const map = paintedMap([]);
    const cache = createRouteCache(map);
    const first = cache.route(at(0, 0), at(4, 0));
    expect(first.kind).toBe('route');

    if (first.kind === 'route') (first.steps as number[]).push(tileIndex(9, 9));

    expect(cache.route(at(0, 0), at(4, 0))).toEqual(findRoute(map, at(0, 0), at(4, 0)));
  });

  it('refuses a limit that is not a whole number of routes', () => {
    const map = paintedMap([]);

    expect(() => createRouteCache(map, 0)).toThrow(RangeError);
    expect(() => createRouteCache(map, 1.5)).toThrow(RangeError);
  });
});
