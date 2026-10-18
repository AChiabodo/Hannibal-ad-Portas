/**
 * What a way across the theatre must be, asked in ways the pathfinder is not
 * written in (ticket C1).
 *
 * The oracle here is deliberately a *worse* algorithm than the one it checks:
 * it relaxes costs through a plain queue, with no heuristic and no priority, so
 * "the route costs what the shortest way costs" is a statement from outside the
 * thing it is about rather than the pathfinder asserting itself. It is slow —
 * hundreds of thousands of relaxations for a 96×96 theatre — which is why it
 * checks a dozen tiles and not a thousand seeds.
 */
import {
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_COUNT,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type Site,
} from '../../src/sim/map';
import { moveCost } from '../../src/sim/route';

/**
 * The cheapest a Squad can cross the theatre from one tile to another, by
 * relaxation rather than by search: `Number.POSITIVE_INFINITY` when no way
 * reaches.
 *
 * @throws RangeError when either end is not a tile of this theatre.
 */
export function shortestCost(map: MapGrid, from: Site, to: Site): number {
  const start = requireTile(map, from);
  const goal = requireTile(map, to);
  const dist = new Int32Array(TILE_COUNT);
  dist.fill(-1);
  dist[start] = 0;

  const queue: number[] = [start];
  let head = 0;

  while (head < queue.length) {
    const tile = queue[head] as number;
    head += 1;
    const reached = dist[tile] ?? -1;

    for (const neighbour of neighboursOf(tile)) {
      if (!isWalkable(terrainAt(map, tileX(neighbour), tileY(neighbour)))) continue;

      const here = reached + moveCost(terrainAt(map, tileX(neighbour), tileY(neighbour)));
      const known = dist[neighbour] ?? -1;
      if (known >= 0 && known <= here) continue;

      dist[neighbour] = here;
      queue.push(neighbour);
    }
  }

  return dist[goal] === -1 ? Number.POSITIVE_INFINITY : (dist[goal] as number);
}

/**
 * What a route costs a Squad: the terrain of every tile entered, added up.
 *
 * Read off the tiles rather than taken from the search, so a route that is the
 * right length in the wrong place cannot pass the comparison.
 */
export function costOf(map: MapGrid, steps: readonly number[]): number {
  return steps.reduce((total, tile) => total + moveCost(terrainAt(map, tileX(tile), tileY(tile))), 0);
}

/** The four tiles a Squad can step to, clipped to the map. */
export function neighboursOf(tile: number): readonly number[] {
  const x = tileX(tile);
  const y = tileY(tile);
  const around: number[] = [];

  if (y > 0) around.push(tile - MAP_WIDTH);
  if (x < MAP_WIDTH - 1) around.push(tile + 1);
  if (y < MAP_HEIGHT - 1) around.push(tile + MAP_WIDTH);
  if (x > 0) around.push(tile - 1);

  return around;
}

/** A tile of this theatre, or a loud refusal. */
function requireTile(map: MapGrid, site: Site): number {
  if (!isTile(site)) throw new RangeError(`(${String(site.x)}, ${String(site.y)}) is not a tile of the map`);
  if (!isWalkable(terrainAt(map, site.x, site.y))) {
    throw new RangeError(`(${String(site.x)}, ${String(site.y)}) is water, and no Squad stands on water`);
  }

  return tileIndex(site.x, site.y);
}

/** Whether a site is inside the grid, as whole tiles. */
function isTile(site: Site): boolean {
  return (
    Number.isInteger(site.x) &&
    Number.isInteger(site.y) &&
    site.x >= 0 &&
    site.y >= 0 &&
    site.x < MAP_WIDTH &&
    site.y < MAP_HEIGHT
  );
}
