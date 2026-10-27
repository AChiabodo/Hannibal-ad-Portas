/**
 * The invariants a generated map has to satisfy, as checkers (ticket B1).
 *
 * The theatre is organic rather than mirrored, so its fairness is not a shape
 * the generator can be read for — it is a set of statements about the map that
 * comes out. This module is those statements, written against the map and not
 * against the code that made it: every checker reads the finished grid, so a
 * change to a pass that quietly breaks the world fails here rather than in a
 * Match three game-years in.
 *
 * They live beside the tests rather than in `src/sim/map.ts` for that reason.
 * The module under test generates; what a map must be is the contract it is
 * held to, and the plan says as much: "invariants that tests assert" (§6). The
 * property test in `map-seeds.test.ts` runs `mapProblems` over a thousand
 * seeds; `map.test.ts` walks the same checkers one acceptance criterion at a
 * time, so a failure names the invariant that broke.
 */
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_SETTLEMENTS,
  MIN_FORDS_PER_RIVER,
  MIN_SETTLEMENTS,
  MIN_STRONGHOLD_DISTANCE,
  RESOURCE,
  RESOURCE_KINDS,
  RESOURCE_TOLERANCE_PERCENT,
  TERRAIN,
  TILE_COUNT,
  halfOf,
  isTerrain,
  isWalkable,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type ResourceKind,
  type Site,
  type Terrain,
} from '../../src/sim/map';
import { settlementGroundProblems } from './map-ground-invariants';

/** The name of a terrain, for a failure a reader can act on. */
const TERRAIN_NAMES: Readonly<Record<Terrain, string>> = {
  [TERRAIN.plain]: 'plain',
  [TERRAIN.hill]: 'hill',
  [TERRAIN.forest]: 'forest',
  [TERRAIN.farmland]: 'farmland',
  [TERRAIN.river]: 'river',
  [TERRAIN.ford]: 'ford',
  [TERRAIN.road]: 'road',
};

/** The name of a resource, for a failure a reader can act on. */
const RESOURCE_NAMES: Readonly<Record<ResourceKind, string>> = {
  [RESOURCE.grain]: 'grain',
  [RESOURCE.timber]: 'timber',
  [RESOURCE.stone]: 'stone',
  [RESOURCE.iron]: 'iron',
};

/** Every problem a map has, in words: an empty list is a map that holds up. */
export function mapProblems(map: MapGrid): readonly string[] {
  return [
    ...terrainProblems(map),
    ...strongholdProblems(map),
    ...settlementProblems(map),
    ...connectivityProblems(map),
    ...riverProblems(map),
    ...resourceProblems(map),
    ...roadProblems(map),
    ...settlementGroundProblems(map),
  ];
}

/** The grid is the size the plan fixes, and holds terrains and nothing else. */
export function terrainProblems(map: MapGrid): readonly string[] {
  if (map.terrain.length !== TILE_COUNT) {
    return [`the grid holds ${map.terrain.length} tiles, not ${TILE_COUNT}`];
  }

  for (let index = 0; index < TILE_COUNT; index += 1) {
    const here = terrainOf(map, index);
    if (!isTerrain(here)) {
      return [`the tile at (${tileX(index)}, ${tileY(index)}) holds ${here}, which is not a terrain`];
    }
  }

  return [];
}

/** Two Strongholds, far enough apart to be two Factions' homes rather than one map's. */
export function strongholdProblems(map: MapGrid): readonly string[] {
  const [rome, carthage] = map.strongholds;
  const squared = distanceSquared(rome, carthage);

  if (squared < MIN_STRONGHOLD_DISTANCE * MIN_STRONGHOLD_DISTANCE) {
    return [
      `the Strongholds at (${rome.x}, ${rome.y}) and (${carthage.x}, ${carthage.y}) stand ` +
        `${wholeTilesApart(squared)} tiles apart, nearer than the ${MIN_STRONGHOLD_DISTANCE} the contract states`,
    ];
  }

  return [];
}

/** The stated number of capturable minor settlements, each on a tile of its own. */
export function settlementProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];
  const count = map.settlements.length;

  if (count < MIN_SETTLEMENTS || count > MAX_SETTLEMENTS) {
    problems.push(
      `the map carries ${count} minor settlements, outside the ${MIN_SETTLEMENTS} to ${MAX_SETTLEMENTS} it should`,
    );
  }

  const [rome, carthage] = map.strongholds;
  const taken = new Set([tileIndex(rome.x, rome.y), tileIndex(carthage.x, carthage.y)]);

  for (const site of map.settlements) {
    const tile = tileIndex(site.x, site.y);
    if (taken.has(tile)) {
      problems.push(`a minor settlement stands at (${site.x}, ${site.y}), on someone else's tile`);
    }
    taken.add(tile);
  }

  return problems;
}

/**
 * The land is one landmass, and everything standing on it can be walked to.
 *
 * One landmass is the whole of reachability on this map: water is the only
 * terrain that stops a Squad, so if the walkable tiles are one piece then every
 * settlement, resource node and Stronghold on them can be reached from every other.
 * The features are still checked one by one, because "the land is connected"
 * and "the thing I care about is on the land" are two different ways for a map
 * to be broken.
 */
export function connectivityProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];
  const { labels, count } = landmasses(map);

  if (count !== 1) problems.push(`the land is ${count} pieces, not the one landmass a Match needs`);

  const [rome] = map.strongholds;
  const home = labelAt(labels, rome.x, rome.y);
  if (home < 0) problems.push(`Rome's Stronghold at (${rome.x}, ${rome.y}) does not stand on land`);

  const walkable = (what: string, site: Site): void => {
    const label = labelAt(labels, site.x, site.y);

    if (label < 0) problems.push(`${what} at (${site.x}, ${site.y}) does not stand on land`);
    else if (label !== home) {
      problems.push(`${what} at (${site.x}, ${site.y}) cannot be walked to from Rome's Stronghold`);
    }
  };

  for (const site of map.settlements) walkable('a minor settlement', site);
  for (const node of map.resources) walkable(`the ${RESOURCE_NAMES[node.kind]} node`, node);

  return problems;
}

/** Every river crosses the map, and carries at least the stated minimum of fords a Squad can cross. */
export function riverProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];

  if (map.rivers.length === 0) problems.push('the theatre has no river at all');

  // A river running edge to edge is load-bearing rather than pretty: a river
  // that stopped inside the map could seal a pocket of land off, and the repair
  // pass that fords whatever water still parts the land relies on every river
  // crossing the whole map, so that following it always reaches another
  // landmass. It is also the shape every planted ford and every road was drawn
  // against, so a generator that changed it should have to fail a test.

  for (const [index, river] of map.rivers.entries()) {
    const fords = river.tiles.filter((tile) => terrainOf(map, tile) === TERRAIN.ford);

    for (const tile of fords) {
      if (dryNeighbours(map, tile) < 2) {
        problems.push(
          `the ford at (${tileX(tile)}, ${tileY(tile)}) on river ${index} strands a Squad: ` +
            'fewer than two of the tiles beside it are walkable',
        );
      }
    }

    const crossable = fords.filter((tile) => isStraightFord(map, tile)).length;
    if (crossable < MIN_FORDS_PER_RIVER) {
      problems.push(
        `river ${index} has ${crossable} fords a Squad can cross, fewer than the ` +
          `${MIN_FORDS_PER_RIVER} the contract states`,
      );
    }

    for (const tile of river.tiles) {
      const here = terrainOf(map, tile);
      if (here !== TERRAIN.river && here !== TERRAIN.ford) {
        const name = isTerrain(here) ? TERRAIN_NAMES[here] : String(here);
        problems.push(
          `river ${index} runs through a ${name} tile at (${tileX(tile)}, ${tileY(tile)}), ` +
            'which is not water and not a ford',
        );
      }
    }

    for (let step = 1; step < river.tiles.length; step += 1) {
      const previous = river.tiles[step - 1];
      const tile = river.tiles[step];
      if (previous === undefined || tile === undefined) continue;

      const steps = Math.abs(tileX(previous) - tileX(tile)) + Math.abs(tileY(previous) - tileY(tile));
      if (steps !== 1) {
        problems.push(`river ${index} jumps from one tile to a tile that does not touch it at step ${step}`);
      }
    }

    const source = river.tiles[0];
    const mouth = river.tiles.at(-1);
    if (source !== undefined && mouth !== undefined && !crossesTheMap(source, mouth)) {
      problems.push(`river ${index} does not run from one edge of the map to the other`);
    }
  }

  return problems;
}

/** Every resource appears, and the two halves of the theatre hold the same amount of each. */
export function resourceProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];
  const taken = new Set<number>();

  for (const node of map.resources) {
    const tile = tileIndex(node.x, node.y);
    if (taken.has(tile)) problems.push(`two resource nodes stand on the tile at (${node.x}, ${node.y})`);
    if (node.amount <= 0) problems.push(`the node at (${node.x}, ${node.y}) holds ${node.amount} of its resource`);
    taken.add(tile);
  }

  for (const kind of RESOURCE_KINDS) {
    if (!map.resources.some((node) => node.kind === kind)) problems.push(`no ${RESOURCE_NAMES[kind]} is on the map`);
  }

  const [rome, carthage] = resourceTotals(map);

  for (const kind of RESOURCE_KINDS) {
    const mine = rome[kind] ?? 0;
    const theirs = carthage[kind] ?? 0;
    const larger = Math.max(mine, theirs);

    if (Math.abs(mine - theirs) * 100 > RESOURCE_TOLERANCE_PERCENT * larger) {
      const apart = larger === 0 ? 0 : Math.round((Math.abs(mine - theirs) * 100) / larger);
      problems.push(
        `the halves are ${apart}% apart on ${RESOURCE_NAMES[kind]} — ${mine} against ${theirs} — ` +
          `further than the ${RESOURCE_TOLERANCE_PERCENT}% the contract allows`,
      );
    }
  }

  return problems;
}

/** The roads join every settlement and resource node to one another and to the Strongholds. */
export function roadProblems(map: MapGrid): readonly string[] {
  const problems: string[] = [];
  const endpoints = new Set<number>();

  for (const road of map.roads) {
    endpoints.add(road.from);
    endpoints.add(road.to);

    if (road.tiles[0] !== road.from) {
      problems.push(`a road starting at (${tileX(road.from)}, ${tileY(road.from)}) begins somewhere else`);
    }
    if (road.tiles.at(-1) !== road.to) {
      problems.push(`a road ending at (${tileX(road.to)}, ${tileY(road.to)}) arrives somewhere else`);
    }

    for (const tile of road.tiles) {
      if (!isWalkable(terrainOf(map, tile))) {
        problems.push(`a road crosses water at (${tileX(tile)}, ${tileY(tile)})`);
      }
    }

    for (let step = 1; step < road.tiles.length; step += 1) {
      const previous = road.tiles[step - 1];
      const tile = road.tiles[step];
      if (previous === undefined || tile === undefined) continue;

      const steps = Math.abs(tileX(previous) - tileX(tile)) + Math.abs(tileY(previous) - tileY(tile));
      if (steps !== 1) problems.push(`a road jumps from one tile to a tile that does not touch it at step ${step}`);
    }
  }

  for (const site of map.settlements) {
    if (!endpoints.has(tileIndex(site.x, site.y))) {
      problems.push(`the settlement at (${site.x}, ${site.y}) has no road to it`);
    }
  }
  for (const node of map.resources) {
    if (!endpoints.has(tileIndex(node.x, node.y))) {
      problems.push(`the ${RESOURCE_NAMES[node.kind]} node at (${node.x}, ${node.y}) has no road to it`);
    }
  }

  const reached = roadNetworkFromStrongholds(map);

  for (const site of map.settlements) {
    if (!reached.has(tileIndex(site.x, site.y))) {
      problems.push(`the settlement at (${site.x}, ${site.y}) cannot be reached by road from a Stronghold`);
    }
  }
  for (const node of map.resources) {
    if (!reached.has(tileIndex(node.x, node.y))) {
      problems.push(`the ${RESOURCE_NAMES[node.kind]} node at (${node.x}, ${node.y}) cannot be reached by road`);
    }
  }

  return problems;
}

/**
 * How much of each resource each half of the theatre holds.
 *
 * Indexed by `RESOURCE_KINDS`, so the two entries read side by side: the first
 * is Rome's half, the second Carthage's, which is what `halfOf` answers. The
 * halves are not the map's left and right — they are the two sides of the
 * perpendicular bisector of the two Strongholds — so the sum is taken through
 * `halfOf` rather than by comparing x to half the width.
 *
 * Worked out here rather than imported from `map.ts`, which has the same
 * function for the CLI's dump to print: the quantity the balance invariant is
 * stated over is the map's own data, and an assertion that read it back through
 * the code it is asserting would be asserting that code against itself.
 */
export function resourceTotals(map: MapGrid): readonly [readonly number[], readonly number[]] {
  const rome: number[] = RESOURCE_KINDS.map(() => 0);
  const carthage: number[] = RESOURCE_KINDS.map(() => 0);

  for (const node of map.resources) {
    const totals = halfOf(map, node.x, node.y) === 0 ? rome : carthage;
    totals[node.kind] = (totals[node.kind] ?? 0) + node.amount;
  }

  return [rome, carthage];
}

/** The landmass each walkable tile belongs to, and how many there are. */
export interface Landmasses {
  /** The landmass each tile belongs to by flat index: -1 for water. */
  readonly labels: Int32Array;
  /** How many landmasses the walkable tiles form. */
  readonly count: number;
}

/**
 * Numbers every landmass on a map, four neighbours at a time.
 *
 * Written out here rather than borrowed from the generator, so that the thing
 * asserted is the map and not the code that made it: a flood fill is four lines
 * and the independence is worth more than the four lines.
 */
export function landmasses(map: MapGrid): Landmasses {
  const labels = new Int32Array(TILE_COUNT).fill(-1);
  const queue: number[] = [];
  let count = 0;

  for (let start = 0; start < TILE_COUNT; start += 1) {
    const known = labels[start];
    if (known !== undefined && known >= 0) continue;
    if (!isWalkable(terrainOf(map, start))) continue;

    const label = count;
    count += 1;
    labels[start] = label;
    queue.length = 0;
    queue.push(start);

    while (queue.length > 0) {
      const index = queue.pop();
      if (index === undefined) break;

      const x = tileX(index);
      const y = tileY(index);
      if (x > 0) flood(map, labels, index - 1, label, queue);
      if (x < MAP_WIDTH - 1) flood(map, labels, index + 1, label, queue);
      if (y > 0) flood(map, labels, index - MAP_WIDTH, label, queue);
      if (y < MAP_HEIGHT - 1) flood(map, labels, index + MAP_WIDTH, label, queue);
    }
  }

  return { labels, count };
}

/** The tiles the road network joins to the two Strongholds, walking its roads as edges. */
function roadNetworkFromStrongholds(map: MapGrid): ReadonlySet<number> {
  const edges = new Map<number, number[]>();
  const connect = (from: number, to: number): void => {
    const known = edges.get(from);
    if (known === undefined) edges.set(from, [to]);
    else known.push(to);
  };

  for (const road of map.roads) {
    connect(road.from, road.to);
    connect(road.to, road.from);
  }

  const [rome, carthage] = map.strongholds;
  const reached = new Set([tileIndex(rome.x, rome.y), tileIndex(carthage.x, carthage.y)]);
  const queue = [...reached];

  while (queue.length > 0) {
    const tile = queue.pop();
    if (tile === undefined) break;

    for (const next of edges.get(tile) ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }

  return reached;
}

/** Adds a neighbouring walkable tile to a flood, unless it has been reached already. */
function flood(map: MapGrid, labels: Int32Array, index: number, label: number, queue: number[]): void {
  const known = labels[index];
  if (known !== undefined && known >= 0) return;
  if (!isWalkable(terrainOf(map, index))) return;

  labels[index] = label;
  queue.push(index);
}

/** The landmass a tile lies on, or -1 when it is water or off the map. */
function labelAt(labels: Int32Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return -1;

  const label = labels[tileIndex(x, y)];
  return label === undefined ? -1 : label;
}

/** The terrain of a tile by flat index; the grid is exactly `TILE_COUNT` cells. */
function terrainOf(map: MapGrid, index: number): number {
  return map.terrain[index] ?? TERRAIN.river;
}

/** The squared distance between two sites, which is exact integer arithmetic. */
function distanceSquared(from: Site, to: Site): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  return dx * dx + dy * dy;
}

/**
 * Failure message helper: a squared distance in whole tiles, floored so it never
 * overstates how far apart two things are.
 */
function wholeTilesApart(squared: number): number {
  return Math.floor(Math.sqrt(squared));
}

/** Whether a ford can be crossed straight over: two opposite neighbours are dry. */
function isStraightFord(map: MapGrid, tile: number): boolean {
  const x = tileX(tile);
  const y = tileY(tile);
  const west = x > 0 && isWalkable(terrainOf(map, tile - 1));
  const east = x < MAP_WIDTH - 1 && isWalkable(terrainOf(map, tile + 1));
  const north = y > 0 && isWalkable(terrainOf(map, tile - MAP_HEIGHT));
  const south = y < MAP_HEIGHT - 1 && isWalkable(terrainOf(map, tile + MAP_WIDTH));

  return (west && east) || (north && south);
}

/** How many of the tiles beside one a Squad could step onto. */
function dryNeighbours(map: MapGrid, tile: number): number {
  const x = tileX(tile);
  const y = tileY(tile);
  const around = [
    x > 0 ? terrainOf(map, tile - 1) : TERRAIN.river,
    x < MAP_WIDTH - 1 ? terrainOf(map, tile + 1) : TERRAIN.river,
    y > 0 ? terrainOf(map, tile - MAP_WIDTH) : TERRAIN.river,
    y < MAP_HEIGHT - 1 ? terrainOf(map, tile + MAP_WIDTH) : TERRAIN.river,
  ];

  return around.filter((beside) => isWalkable(beside)).length;
}

/** Whether a river runs from one edge of the map to the opposite one. */
function crossesTheMap(source: number, mouth: number): boolean {
  const downTheMap = tileY(source) === 0 && tileY(mouth) === MAP_HEIGHT - 1;
  const acrossTheMap = tileX(source) === 0 && tileX(mouth) === MAP_WIDTH - 1;

  return downTheMap || acrossTheMap;
}
