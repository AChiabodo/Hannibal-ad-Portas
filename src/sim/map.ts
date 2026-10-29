/**
 * The map: a whole theatre, described by a seed (PLAN §4, ticket B1).
 *
 * `generateMap(seed)` is a pure function of the seed — no wall clock, no global
 * generator, no engine — so a Match that begins on it replays exactly
 * (ADR-0006). It returns a 160×160 grid of 16×16 tiles carrying terrain types,
 * rivers crossed by fords, resource nodes of grain, timber, stone and iron, six to
 * eight capturable minor settlements, a Stronghold for each Faction, and roads
 * that join the nodes to one another.
 *
 * The theatre is **organic, not mirrored**: the two halves do not carry the
 * same hills in the same places, and no pass reflects one side onto the other.
 * Fairness is therefore not a symmetry baked in at generation time; it is a set
 * of invariants the generator satisfies on purpose, and
 * `tests/sim/map-invariants.ts` is where they are asserted — over a thousand
 * seeds, so a change that breaks the world fails a test instead of failing a
 * Match three game-years in:
 *
 * - the same seed always produces the same map, tile for tile;
 * - the land is **one landmass**, and every Stronghold, settlement and resource
 *   node stands on it, so everything on the map is reachable from everywhere;
 * - each half of the theatre holds, per resource, a node total within
 *   `RESOURCE_TOLERANCE_PERCENT` of the other half's — the halves being the two
 *   sides of the perpendicular bisector of the two Strongholds, which is what
 *   `halfOf` answers;
 * - substantial rivers carry at least `MIN_FORDS_PER_RIVER` fords, and may
 *   begin or end inland or flow into a lake;
 * - the two Strongholds stand at least `MIN_STRONGHOLD_DISTANCE` tiles apart;
 * - the roads join every settlement and every resource node to the network, and
 *   the network to the Strongholds, over tiles a Squad can walk on.
 *
 * What is *not* an invariant is the look of the thing: which hill stands where,
 * how a river wiggles, where the forests grew. Those change with the seed and
 * with every change to the generator, which is exactly what a map nobody drew
 * is for.
 *
 * The work happens in passes, and the order is the design: the land first,
 * then complete settlement grounds, then water around them, resources and the
 * roads that join them, and finally a repair pass that fords whatever water still parts
 * the land. Every pass draws from the seed's own stream, so the map is a
 * function of the seed and of nothing else — and every number it writes down is
 * an integer, because the map is authoritative state and `serializeState`
 * refuses anything else (ADR-0006).
 */
import { makeRng, type Rng } from './rng.ts';
import { barbarianCampSites, type BarbarianCampSite } from './barbarian-camp-sites.ts';
import { containsTile, settlementLayout, turnRect, type GroundRect } from '../content/settlement-layout.ts';

/** The map's width in tiles, allowing full settlement grounds (ADR-0030). */
export const MAP_WIDTH = 160;

/** The map's height in tiles, allowing full settlement grounds (ADR-0030). */
export const MAP_HEIGHT = 160;

/** The side of a tile in pixels, for whoever draws the map later (B3). */
export const TILE_SIZE = 16;

/** How many tiles the map holds, which is also the length of its terrain grid. */
export const TILE_COUNT = MAP_WIDTH * MAP_HEIGHT;

/**
 * The terrains a tile can be, as the integers state holds.
 *
 * A word would read better and would not survive `serializeState`, which refuses
 * strings in state (ADR-0006); so the terrain is a number, the numbers are
 * stated once here, and a report or a dump turns them back into words.
 *
 * `river` is the only terrain a Squad may not stand on. `ford` is a river tile
 * one may cross — it carries the river's own gameplay meaning, the disorder of
 * fording in the water — and `road` is the only terrain that exists because
 * something built it rather than because the land is like that.
 */
export const TERRAIN = {
  plain: 0,
  hill: 1,
  forest: 2,
  farmland: 3,
  river: 4,
  ford: 5,
  road: 6,
  lake: 7,
  marsh: 8,
  bridge: 9,
} as const;

/** One of the terrains a tile can be (GLOSSARY: Terrain). */
export type Terrain = (typeof TERRAIN)[keyof typeof TERRAIN];

/**
 * The four resources of the economy, as the integers state holds: grain feeds,
 * timber builds, stone and iron arm.
 *
 * The order is the order a report lists them in, and it is written down once,
 * in `RESOURCE_KINDS`, because several passes of the generator walk the four.
 */
export const RESOURCE = {
  grain: 0,
  timber: 1,
  stone: 2,
  iron: 3,
} as const;

/** One of the four resources a node can hold. */
export type ResourceKind = (typeof RESOURCE)[keyof typeof RESOURCE];

/** The four resources, in the order a report, a dump or a pass walks them. */
export const RESOURCE_KINDS: readonly ResourceKind[] = [
  RESOURCE.grain,
  RESOURCE.timber,
  RESOURCE.stone,
  RESOURCE.iron,
];

/**
 * How far apart the two Strongholds must stand, in tiles.
 *
 * The generator never has to check it: each Stronghold is drawn from its own
 * end of the theatre, far enough in that the tile distance between the two
 * regions is larger than this. The invariant is stated and asserted anyway,
 * because the distance is the thing the two Factions' opening minutes rest on,
 * and a later change to where the regions lie should have to fail a test.
 */
export const MIN_STRONGHOLD_DISTANCE = 56;

/**
 * How many fords every river carries at least.
 *
 * Two, so that a river with one ford is not a river with a chokepoint to camp:
 * one ford can be watched, two have to be divided between. Fords are also added
 * wherever a road fords water, and wherever the repair pass needs one, so a
 * river usually carries more than this.
 */
export const MIN_FORDS_PER_RIVER = 2;

/** The fewest minor settlements a map carries. */
export const MIN_SETTLEMENTS = 6;

/** The most minor settlements a map carries. */
export const MAX_SETTLEMENTS = 8;

/**
 * How far the two halves of the theatre may differ, per resource, in percent.
 *
 * Per resource and not in total, because grain does not stand in for iron: a
 * half with twice the iron and half the grain is not a balanced half. The two
 * halves are given the same number of nodes of each kind by construction, and
 * the quantity a node holds is drawn from a range narrow enough that the
 * totals stay inside this tolerance even when every draw falls the other way —
 * so the assertion is what keeps a later change to those ranges honest rather
 * than what discovers the balance.
 */
export const RESOURCE_TOLERANCE_PERCENT = 20;

/**
 * Which Faction's half of the theatre a tile lies in.
 *
 * The halves are not the map's left and right: they are the two sides of the
 * perpendicular bisector of the two Strongholds, which is the territory each
 * Faction starts nearest to. Index 0 is Rome's and 1 Carthage's, the order
 * `FACTIONS` keeps — a Faction is a word and state holds integers, so the index
 * is the name a map can carry.
 */
export type Half = 0 | 1;

/** Where something stands, in tiles: a Stronghold, a minor settlement, a resource node. */
export interface Site {
  readonly x: number;
  readonly y: number;
}

/** A resource node: one kind of resource, standing on one tile, in one quantity. */
export interface ResourceNode extends Site {
  /** Which resource it is of. */
  readonly kind: ResourceKind;
  /** How much of it is there, in the units the economy counts. */
  readonly amount: number;
}

/**
 * A river: the ordered tiles from its source to its mouth, including any
 * tiles where it meets a lake.
 *
 * A ford appears in the grid's terrain, not in this list: the ford is still the
 * river's tile — a ford is part of the river — and which of a river's tiles
 * carry one is a question about the terrain grid.
 */
export interface River {
  readonly tiles: readonly number[];
}

/**
 * A road: the tiles it crosses, its two endpoints included, in the order it was
 * laid.
 *
 * `from` and `to` are the endpoints as tile indices — the feature tiles the
 * road joins — so the road network is a graph a caller can walk without
 * re-deriving it from the longer list.
 */
export interface Road {
  readonly from: number;
  readonly to: number;
  readonly tiles: readonly number[];
}

/** The whole theatre a seed describes. */
export interface MapGrid {
  /** Neutral camps generated at the start; optional for legacy fixture maps. */
  readonly barbarianCamps?: readonly BarbarianCampSite[];
  /**
   * The terrain of every tile, row-major: the cell at `tileIndex(x, y)`.
   *
   * A typed array rather than an array of numbers because the map is state and
   * the hash walks it: nine thousand cells as a plain array would be readable
   * and would serialize four times as long, for no gain (ADR-0006).
   */
  readonly terrain: Uint8Array;

  /**
   * The two Strongholds: index 0 is Rome's, index 1 Carthage's.
   *
   * A pair rather than a list, because a Match has exactly two Factions and
   * each has exactly one Stronghold — the halves of the theatre are defined by
   * these two tiles and by nothing else (`halfOf`).
   */
  readonly strongholds: readonly [Site, Site];

  /** The capturable minor settlements, six to eight of them. */
  readonly settlements: readonly Site[];

  /** The rivers, one or two, with endpoints at an edge or inland. */
  readonly rivers: readonly River[];

  /** Every resource node on the map, of all four kinds. */
  readonly resources: readonly ResourceNode[];

  /** The roads that join the settlements and resource nodes to one another. */
  readonly roads: readonly Road[];
}

/**
 * Generates the theatre a seed describes.
 *
 * Pure: the same seed produces the same map, tile for tile, on every engine
 * (ADR-0006), and nothing outside the argument is read while it is built.
 *
 * @throws RangeError when the seed is not an unsigned 32-bit integer, refused
 *   by the random source before a tile is laid.
 * @throws Error when a pass finds nowhere to put something, or the land cannot
 *   be joined after all. Neither is reachable on any seed the property test
 *   walks, and both say so loudly rather than describing a broken map.
 */
export function generateMap(seed: number): MapGrid {
  const rng = makeRng(seed);
  const terrain = new Uint8Array(TILE_COUNT);
  terrain.fill(TERRAIN.plain);

  growPatches(terrain, rng, new Uint32Array(TILE_COUNT));
  const strongholds = chooseStrongholds(terrain, rng);
  const halves = halfTiles(strongholds);
  const settlements = chooseSettlements(terrain, rng, strongholds, halves, seed);
  const reservations = siteReservations([...strongholds, ...settlements]);
  const rivers = carveRivers(terrain, rng, reservations.grounds);
  plantFords(terrain, rng, rivers);
  growWetlands(terrain, rng, reservations.grounds, rivers);
  spreadFarmland(terrain, rng, [...strongholds, ...settlements]);
  const lakeMargin = lakeShoreMask(terrain);
  for (let index = 0; index < TILE_COUNT; index += 1) {
    if (lakeMargin[index] === 1) reservations.resources[index] = 1;
  }
  const resources = placeResources(terrain, rng, halves, [...strongholds, ...settlements], reservations.resources);
  const roadObstacles = Uint8Array.from(reservations.structures, (blocked, index) =>
    blocked === 1 || lakeMargin[index] === 1 ? 1 : 0);
  const roads = carveRoads(terrain, rng, [...strongholds, ...settlements, ...resources], roadObstacles);
  joinLand(terrain, rivers);
  buildRoadBridge(terrain, roads, rivers);

  const map = { terrain, strongholds, settlements, rivers, resources, roads };
  return { ...map, barbarianCamps: barbarianCampSites(map, seed) };
}

/** Keep roads and resource sites one tile from lake water so a crossing has room for a column. */
function lakeShoreMask(terrain: Uint8Array): Uint8Array {
  const mask = new Uint8Array(TILE_COUNT);
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (terrain[tileIndex(x, y)] !== TERRAIN.lake) continue;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT) mask[tileIndex(nx, ny)] = 1;
      }
    }
  }
  return mask;
}

/**
 * The flat index of a tile, row-major: `y * MAP_WIDTH + x`.
 *
 * No bounds check: the arithmetic is the contract, and every pass of the
 * generator calls this in a loop over the map. A tile read from the grid with
 * an index outside it is a `RangeError` from `terrainAt`, which is the accessor
 * a caller outside the module should be using.
 */
export function tileIndex(x: number, y: number): number {
  return y * MAP_WIDTH + x;
}

/** The x of a tile, from the flat index `tileIndex` writes. */
export function tileX(index: number): number {
  return index % MAP_WIDTH;
}

/** The y of a tile, from the flat index `tileIndex` writes. */
export function tileY(index: number): number {
  return Math.floor(index / MAP_WIDTH);
}

/**
 * The terrain of one tile.
 *
 * @throws RangeError when the coordinates are not whole tiles inside the map,
 *   or the grid holds something that is not a terrain — which only a bug in
 *   the generator could have written.
 */
export function terrainAt(map: MapGrid, x: number, y: number): Terrain {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) {
    throw new RangeError(`a tile must be inside the map, got (${String(x)}, ${String(y)})`);
  }

  const found = map.terrain[tileIndex(x, y)];
  if (found === undefined || !isTerrain(found)) {
    throw new RangeError(`the tile at (${String(x)}, ${String(y)}) holds no terrain`);
  }

  return found;
}

/** Whether an integer is a terrain this map knows: a cell of the grid, or a constant. */
export function isTerrain(value: number): value is Terrain {
  return (
    value === TERRAIN.plain ||
    value === TERRAIN.hill ||
    value === TERRAIN.forest ||
    value === TERRAIN.farmland ||
    value === TERRAIN.river ||
    value === TERRAIN.ford ||
    value === TERRAIN.road ||
    value === TERRAIN.lake ||
    value === TERRAIN.marsh ||
    value === TERRAIN.bridge
  );
}

/**
 * Whether a Squad may stand on a terrain: everything but open water.
 *
 * A ford is walkable — that is what a ford is for — and so is every other
 * terrain. Reachability on the map therefore means "not stopped by a river",
 * which is the question the invariant about one landmass asks.
 */
export function isWalkable(terrain: number): boolean {
  return terrain !== TERRAIN.river && terrain !== TERRAIN.lake;
}

/**
 * Which Faction's half of the theatre a tile lies in.
 *
 * The tile goes to the nearer Stronghold, and a tile exactly halfway goes to
 * Rome's: a tie has to break one way, and the same way on every engine.
 */
export function halfOf(map: MapGrid, x: number, y: number): Half {
  const [rome, carthage] = map.strongholds;
  return halfBetween(rome, carthage, x, y);
}

/** How much of each resource one half of the theatre holds, by kind. */
export type ResourceTotals = Readonly<Record<ResourceKind, number>>;

/**
 * How much of each resource each half of the theatre holds.
 *
 * Indexed by `Half`, so the two entries read side by side: the first is Rome's
 * half, the second Carthage's. This is the quantity the resource-balance
 * invariant is stated over and what a dump prints, which is why it belongs to
 * the map rather than beside either reader — and why it goes through `halfOf`
 * rather than comparing x to half the map's width: the halves are the two sides
 * of the line between the Strongholds, not the map's left and right.
 */
export function resourceTotals(map: MapGrid): readonly [ResourceTotals, ResourceTotals] {
  const rome = noResources();
  const carthage = noResources();

  for (const node of map.resources) {
    const totals = halfOf(map, node.x, node.y) === 0 ? rome : carthage;
    totals[node.kind] += node.amount;
  }

  return [rome, carthage];
}

/** The totals of a half nothing has been counted in yet. */
function noResources(): Record<ResourceKind, number> {
  return { [RESOURCE.grain]: 0, [RESOURCE.timber]: 0, [RESOURCE.stone]: 0, [RESOURCE.iron]: 0 };
}

/** How large a patch of hill or forest grows, in tiles. */
const PATCH_MIN = 60;
const PATCH_MAX = 140;

/** How many patches of each kind of terrain each side of the map is sown with. */
const PATCHES_PER_SIDE = 3;

/** One tile in from every edge: a river's banks are its neighbours, and it wants two. */
const RIVER_MARGIN = 1;

/** The most fords a river is given before roads and repairs add their own. */
const MAX_PLANTED_FORDS = 3;

/** How far a Stronghold stays from its own end of the theatre, in tiles. */
const STRONGHOLD_INSET = 15;

/** How far a Stronghold reaches in from that end: the two regions never come close. */
const STRONGHOLD_EDGE = 24;

/** How far apart two settlements, or a settlement and a Stronghold, must stand. */
const SETTLEMENT_SPACING = 27;

/** Maximum straight-grid march to an opening opportunity for each Faction. */
const OPENING_SETTLEMENT_DISTANCE = 48;

/** How large a patch of farmland grows around a settlement, in tiles. */
const FARMLAND_MIN = 30;
const FARMLAND_MAX = 70;

/** A rectangle of the map, in tile coordinates, both ends included. */
interface Region {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** The western and eastern ends of the theatre, where the terrain is sown. */
const WEST: Region = { minX: 0, minY: 0, maxX: MAP_WIDTH / 2 - 1, maxY: MAP_HEIGHT - 1 };
const EAST: Region = { minX: MAP_WIDTH / 2, minY: 0, maxX: MAP_WIDTH - 1, maxY: MAP_HEIGHT - 1 };

/** The end of the theatre Rome's Stronghold is drawn from. */
const ROME_END: Region = {
  minX: STRONGHOLD_INSET,
  minY: STRONGHOLD_INSET,
  maxX: STRONGHOLD_EDGE,
  maxY: MAP_HEIGHT - 1 - STRONGHOLD_INSET,
};

/** The end of the theatre Carthage's Stronghold is drawn from: never near Rome's. */
const CARTHAGE_END: Region = {
  minX: MAP_WIDTH - 1 - STRONGHOLD_EDGE,
  minY: STRONGHOLD_INSET,
  maxX: MAP_WIDTH - 1 - STRONGHOLD_INSET,
  maxY: MAP_HEIGHT - 1 - STRONGHOLD_INSET,
};

/** What a resource node of one kind is like: where it stands, how large, how many per half. */
interface NodeKind {
  /** The terrains a node of this kind prefers, in the order the map reads them. */
  readonly terrain: readonly Terrain[];
  /** The smallest and largest quantity a node of it holds, in the units the economy counts. */
  readonly min: number;
  readonly max: number;
  /** How many nodes of it each half of the theatre is given. */
  readonly perHalf: number;
}

/**
 * The four kinds of node, keyed by resource.
 *
 * The ranges are what makes the balance assertion true: each half gets the same
 * number of nodes of a kind, and the largest quantity one holds is at most
 * `RESOURCE_TOLERANCE_PERCENT` above the smallest — 24 against 20, 18 against
 * 15, 12 against 10, 9 against 8 — so no arrangement of the draws can put the
 * halves further apart than the tolerance. Widening one of these ranges is
 * therefore a decision with a test attached.
 */
const NODES_BY_KIND: Readonly<Record<ResourceKind, NodeKind>> = {
  [RESOURCE.grain]: { terrain: [TERRAIN.farmland, TERRAIN.plain], min: 20, max: 24, perHalf: 3 },
  [RESOURCE.timber]: { terrain: [TERRAIN.forest], min: 15, max: 18, perHalf: 3 },
  [RESOURCE.stone]: { terrain: [TERRAIN.hill], min: 10, max: 12, perHalf: 2 },
  [RESOURCE.iron]: { terrain: [TERRAIN.hill], min: 8, max: 9, perHalf: 2 },
};

/**
 * Sows hills and forests, patch by patch, on both sides of the map.
 *
 * Both sides and not the map at large, so that neither half can come up short
 * of the terrain its nodes need: stone and iron stand on hills and timber in
 * forests, and a half with no hills is a half whose iron would have to be put
 * somewhere the map does not have. The patches themselves are grown from a
 * random tile in random directions, so the two sides are sown alike and look
 * nothing like each other.
 */
function growPatches(terrain: Uint8Array, rng: Rng, marks: Uint32Array): void {
  let mark = 0;

  for (const side of [WEST, EAST]) {
    for (const patchTerrain of [TERRAIN.hill, TERRAIN.forest]) {
      for (let patch = 0; patch < PATCHES_PER_SIDE; patch += 1) {
        mark += 1;
        const size = PATCH_MIN + rng.nextBelow(PATCH_MAX - PATCH_MIN + 1);
        growBlob(terrain, rng, marks, mark, randomTileIn(side, rng), patchTerrain, size);
      }
    }
  }
}

/**
 * Grows one patch of terrain from a tile, in a random walk outwards.
 *
 * The frontier is a bag rather than a queue: a tile is taken out of it at
 * random and its neighbours dropped in, which is a breadth-first search that
 * forgot which way it was going. The shape that comes out is irregular, and a
 * patch is never a disc or a square — the reason it is worth the randomness at
 * all.
 *
 * `marks` is the caller's scratch array and `mark` this patch's own number, so
 * membership costs one comparison and no allocation. A patch grows over any of
 * the four terrains the land is made of and nothing else, which is the rule that
 * stops the farmland grown later from burying a ford (`isOpenTerrain`).
 */
function growBlob(
  terrain: Uint8Array,
  rng: Rng,
  marks: Uint32Array,
  mark: number,
  start: number,
  sown: Terrain,
  size: number,
): void {
  const frontier: number[] = [start];
  marks[start] = mark;
  terrain[start] = sown;
  let grown = 1;

  while (grown < size && frontier.length > 0) {
    const chosen = rng.nextBelow(frontier.length);
    const index = elementAt(frontier, chosen);

    // The drawn tile leaves the bag, and the last tile takes its place before it
    // does: swapping after popping would put the drawn tile back when it was the
    // last one, and a bag that never shrinks is a loop that never ends.
    frontier[chosen] = elementAt(frontier, frontier.length - 1);
    frontier.pop();

    const x = tileX(index);
    const y = tileY(index);
    if (x > 0) grown += spreadBlob(terrain, marks, mark, frontier, index - 1, sown);
    if (x < MAP_WIDTH - 1) grown += spreadBlob(terrain, marks, mark, frontier, index + 1, sown);
    if (y > 0) grown += spreadBlob(terrain, marks, mark, frontier, index - MAP_WIDTH, sown);
    if (y < MAP_HEIGHT - 1) grown += spreadBlob(terrain, marks, mark, frontier, index + MAP_WIDTH, sown);
  }
}

/** Grows a patch onto one neighbour, unless the patch has been there or the terrain cannot be sown. */
function spreadBlob(
  terrain: Uint8Array,
  marks: Uint32Array,
  mark: number,
  frontier: number[],
  index: number,
  sown: Terrain,
): number {
  if (marks[index] === mark) return 0;
  if (!isOpenTerrain(elementAt(terrain, index))) return 0;

  marks[index] = mark;
  terrain[index] = sown;
  frontier.push(index);
  return 1;
}

/** A tile drawn uniformly from a region. */
function randomTileIn(region: Region, rng: Rng): number {
  const x = region.minX + rng.nextBelow(region.maxX - region.minX + 1);
  const y = region.minY + rng.nextBelow(region.maxY - region.minY + 1);

  return tileIndex(x, y);
}

/**
 * Cuts one or two rivers through the ground.
 *
 * Two rivers are always one across and one down, so they cross — and a map
 * where the water has to be crossed twice, in two directions, is the harder
 * case for the land to survive, which is why it is worth generating. A single
 * river runs whichever way the draw says.
 */
function carveRivers(terrain: Uint8Array, rng: Rng, grounds: Uint8Array): River[] {
  const count = 1 + rng.nextBelow(2);
  const firstIsVertical = rng.nextBelow(2) === 0;
  const rivers: River[] = [];

  for (let index = 0; index < count; index += 1) {
    rivers.push(carveRiver(terrain, rng, index === 0 ? firstIsVertical : !firstIsVertical, grounds));
  }

  return rivers;
}

/** Inland lakes and their wet banks, kept clear of water, sites and map edges. */
function growWetlands(terrain: Uint8Array, rng: Rng, grounds: Uint8Array, rivers: readonly River[]): void {
  const count = rng.nextBelow(3);
  for (let lake = 0; lake < count; lake += 1) {
    const rx = 4 + rng.nextBelow(4);
    const ry = 4 + rng.nextBelow(4);
    const radius = rx * rx * ry * ry;
    const endpoints = rivers.flatMap((river) => [river.tiles[0], river.tiles.at(-1)])
      .filter((tile): tile is number => tile !== undefined && tileX(tile) >= rx + 3 &&
        tileX(tile) < MAP_WIDTH - rx - 3 && tileY(tile) >= ry + 3 && tileY(tile) < MAP_HEIGHT - ry - 3);
    const attached = endpoints.length > 0 && rng.nextBelow(2) === 0 ? draw(rng, endpoints) : undefined;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const x = attached !== undefined && attempt === 0 ? tileX(attached) : rx + 3 + rng.nextBelow(MAP_WIDTH - 2 * rx - 6);
      const y = attached !== undefined && attempt === 0 ? tileY(attached) : ry + 3 + rng.nextBelow(MAP_HEIGHT - 2 * ry - 6);
      const joinsRiver = attached !== undefined && attempt === 0;
      let clear = true;
      for (let dy = -ry - 2; dy <= ry + 2 && clear; dy += 1) {
        for (let dx = -rx - 2; dx <= rx + 2; dx += 1) {
          const tile = tileIndex(x + dx, y + dy);
          const here = terrain[tile];
          if (grounds[tile] === 1 || here === TERRAIN.ford || here === TERRAIN.lake ||
            (here === TERRAIN.river && !joinsRiver)) { clear = false; break; }
        }
      }
      if (!clear) continue;
      for (let dy = -ry - 2; dy <= ry + 2; dy += 1) {
        for (let dx = -rx - 2; dx <= rx + 2; dx += 1) {
          const tile = tileIndex(x + dx, y + dy);
          const measure = dx * dx * ry * ry + dy * dy * rx * rx;
          if (measure <= radius) terrain[tile] = TERRAIN.lake;
          else if (terrain[tile] !== TERRAIN.river && measure <= radius + radius / 2 && rng.nextBelow(3) !== 0) {
            terrain[tile] = TERRAIN.marsh;
          }
        }
      }
      break;
    }
  }
}

/**
 * Carves one substantial river with endpoints at an edge or inland.
 *
 * Seeded waypoints divide the journey into four reaches. Each reach uses a
 * four-connected path around reserved settlement grounds, so no future roof
 * or courtyard appears over water and a diagonal gap never breaks the river.
 *
 * The banks are kept in from the map's edges, so every tile of the water except
 * its first and last has land beside it — which is what makes a ford a crossing
 * rather than a tile at the edge of the world.
 */
function carveRiver(terrain: Uint8Array, rng: Rng, vertical: boolean, grounds: Uint8Array): River {
  const span = vertical ? MAP_WIDTH : MAP_HEIGHT;
  const far = vertical ? MAP_HEIGHT : MAP_WIDTH;
  const start = rng.nextBelow(2) === 0 ? 0 : 12 + rng.nextBelow(16);
  const end = far - 1 - (rng.nextBelow(2) === 0 ? 0 : 12 + rng.nextBelow(16));
  let across = RIVER_MARGIN + rng.nextBelow(span - 2 * RIVER_MARGIN);
  const forbidden = grounds.slice();
  for (let along = 0; along < far; along += 1) {
    forbidden[vertical ? tileIndex(0, along) : tileIndex(along, 0)] = 1;
    forbidden[vertical ? tileIndex(span - 1, along) : tileIndex(along, span - 1)] = 1;
  }
  const waypoints: number[] = [];
  for (let part = 0; part <= 4; part += 1) {
    const along = start + Math.floor((part * (end - start)) / 4);
    across = Math.max(RIVER_MARGIN, Math.min(span - 1 - RIVER_MARGIN, across + rng.nextInt(-8, 8)));
    const candidates: number[] = [];
    let nearest = span;
    for (let candidate = RIVER_MARGIN; candidate < span - RIVER_MARGIN; candidate += 1) {
      const tile = vertical ? tileIndex(candidate, along) : tileIndex(along, candidate);
      if (forbidden[tile] === 1) continue;
      const distance = Math.abs(candidate - across);
      if (distance < nearest) { nearest = distance; candidates.length = 0; }
      if (distance === nearest) candidates.push(tile);
    }
    waypoints.push(draw(rng, candidates));
  }
  const first = waypoints[0];
  if (first === undefined) throw new Error('a river needs a source');
  const tiles = [first];
  for (const to of waypoints.slice(1)) {
    const from = tiles.at(-1);
    if (from === undefined) throw new Error('a river lost its previous reach');
    tiles.push(...groundPath(from, to, forbidden, rng.nextUint32()).slice(1));
  }
  for (const tile of tiles) terrain[tile] = TERRAIN.river;
  return { tiles };
}

/**
 * Plants the fords every river is crossed by, spread along its length.
 *
 * A ford is planted only where the river can be crossed *straight over*: a tile
 * with two opposite neighbours already dry. That single test rules out the two tiles
 * that would be fords in name only — the ones beside a turn, where the river is
 * two tiles wide and stepping in gets you no further than the middle, and the
 * ones beside where two rivers meet, where every neighbour is water and a ford
 * would be a stepping stone with nowhere to step from.
 *
 * Evenly spread rather than drawn at random, so that two fords are never
 * neighbours: a pair of fords side by side is a single ford with extra steps,
 * and the point of a second ford is a second way across. The spacing is also
 * what keeps a ford on each side of where two rivers meet, which is most of
 * what keeps the four quarters of such a map walkable to one another.
 */
function plantFords(terrain: Uint8Array, rng: Rng, rivers: readonly River[]): void {
  for (const river of rivers) {
    const fords = river.tiles.filter((tile) => isStraightFord(terrain, tile));
    if (fords.length === 0) throw new Error('a river with no straight tile has nowhere to be forded');

    const count = MIN_FORDS_PER_RIVER + rng.nextBelow(MAX_PLANTED_FORDS - MIN_FORDS_PER_RIVER + 1);

    for (let ford = 1; ford <= count; ford += 1) {
      const at = Math.floor((ford * fords.length) / (count + 1));
      widenCrossing(terrain, elementAt(fords, at));
    }
  }
  // A confluence divides each river into separate barriers. Evenly spaced
  // crossings for the whole river can all land on one side of the junction.
  for (const [index, river] of rivers.entries()) {
    const shared = new Set(rivers.flatMap((other, otherIndex) => otherIndex === index ? [] : other.tiles));
    if (!river.tiles.some((tile) => shared.has(tile))) continue;
    let start = 0;
    for (let end = 0; end <= river.tiles.length; end += 1) {
      if (end < river.tiles.length && !shared.has(river.tiles[end]!)) continue;
      const reach = river.tiles.slice(start, end);
      if (reach.length >= 20 && !reach.some((tile) => terrain[tile] === TERRAIN.ford)) {
        const candidates = reach.filter((tile) => terrain[tile] === TERRAIN.river && isStraightFord(terrain, tile));
        if (candidates.length > 0) widenCrossing(terrain, elementAt(candidates, Math.floor(candidates.length / 2)));
      }
      start = end + 1;
    }
  }
}

/** Whether a river tile can be crossed straight over: two opposite neighbours are already dry. */
function isStraightFord(terrain: Uint8Array, tile: number): boolean {
  const x = tileX(tile);
  const y = tileY(tile);
  const west = x > 0 && isWalkable(elementAt(terrain, tile - 1));
  const east = x < MAP_WIDTH - 1 && isWalkable(elementAt(terrain, tile + 1));
  const north = y > 0 && isWalkable(elementAt(terrain, tile - MAP_WIDTH));
  const south = y < MAP_HEIGHT - 1 && isWalkable(elementAt(terrain, tile + MAP_WIDTH));

  return (west && east) || (north && south);
}

/**
 * Draws the two Strongholds, one from each end of the theatre.
 *
 * The regions are what makes `MIN_STRONGHOLD_DISTANCE` true without a rejection
 * loop: Rome's is at most 24 tiles in from the western edge and Carthage's at
 * least 135 from it, so the two are never nearer than 111 tiles however the draws
 * fall — and no amount of retrying would be as easy to read as the arithmetic.
 * The invariant the ticket states asks for fewer than that, which is the point:
 * the margin is deliberate.
 */
function chooseStrongholds(terrain: Uint8Array, rng: Rng): readonly [Site, Site] {
  return [strongholdIn(terrain, rng, ROME_END), strongholdIn(terrain, rng, CARTHAGE_END)];
}

/** A Stronghold drawn from one end of the theatre, on land that will carry it. */
function strongholdIn(terrain: Uint8Array, rng: Rng, region: Region): Site {
  const candidates: number[] = [];

  for (let y = region.minY; y <= region.maxY; y += 1) {
    for (let x = region.minX; x <= region.maxX; x += 1) {
      const index = tileIndex(x, y);
      if (isDryLand(terrain, index)) candidates.push(index);
    }
  }

  return siteOf(draw(rng, candidates));
}

/**
 * Draws minor settlements spread between the two halves and apart from each
 * other, with an opening opportunity near each Stronghold.
 *
 * The spacing is a mask rather than a distance test per candidate: placing a
 * settlement blocks the tiles around it, and a tile that is blocked is skipped
 * on the next pass in one comparison. It also puts the two Strongholds' own
 * surroundings out of bounds for the same reason — a minor settlement in the
 * shadow of a Stronghold is a settlement the Stronghold simply owns.
 */
function chooseSettlements(
  terrain: Uint8Array,
  rng: Rng,
  strongholds: readonly [Site, Site],
  halves: Uint8Array,
  seed: number,
): Site[] {
  const [rome, carthage] = strongholds;
  const count = MIN_SETTLEMENTS + rng.nextBelow(MAX_SETTLEMENTS - MIN_SETTLEMENTS + 1);
  // An odd number must not always give Rome the extra opportunity. A separate
  // seeded stream keeps the opening pair and all earlier draws unchanged.
  const extraHalf = makeRng((seed ^ 0x761ab291) >>> 0).nextBelow(2) as Half;
  const settlements: Site[] = [];
  const blocked = new Uint8Array(TILE_COUNT);

  blockAround(blocked, rome.x, rome.y);
  blockAround(blocked, carthage.x, carthage.y);

  for (let placed = 0; placed < count; placed += 1) {
    const half: Half = count % 2 === 1 && placed === count - 1 ? extraHalf : placed % 2 === 0 ? 0 : 1;
    const candidates: number[] = [];

    for (let y = STRONGHOLD_INSET; y < MAP_HEIGHT - STRONGHOLD_INSET; y += 1) {
      for (let x = STRONGHOLD_INSET; x < MAP_WIDTH - STRONGHOLD_INSET; x += 1) {
        const index = tileIndex(x, y);
        if (blocked[index] === 1) continue;
        if (!isDryLand(terrain, index)) continue;
        if (halves[index] !== half) continue;
        const home = strongholds[half];
        if (placed < 2 && manhattan(siteOf(index), home) > OPENING_SETTLEMENT_DISTANCE) continue;
        candidates.push(index);
      }
    }

    const site = siteOf(draw(rng, candidates));
    settlements.push(site);
    blockAround(blocked, site.x, site.y);
  }

  return settlements;
}

/** Puts the tiles around a site out of bounds for anything else that needs space. */
function blockAround(blocked: Uint8Array, x: number, y: number): void {
  for (let dy = -SETTLEMENT_SPACING; dy <= SETTLEMENT_SPACING; dy += 1) {
    for (let dx = -SETTLEMENT_SPACING; dx <= SETTLEMENT_SPACING; dx += 1) {
      const aroundX = x + dx;
      const aroundY = y + dy;
      if (aroundX < 0 || aroundY < 0 || aroundX >= MAP_WIDTH || aroundY >= MAP_HEIGHT) continue;
      blocked[tileIndex(aroundX, aroundY)] = 1;
    }
  }
}

/** Reserve the final site before water is routed, without changing its land capacity. */
function reservedGrounds(sites: readonly Site[]): Uint8Array {
  const reserved = new Uint8Array(TILE_COUNT);
  const grounds = settlementLayout('stronghold').grounds;
  for (const site of sites) {
    for (let y = site.y + grounds.y; y < site.y + grounds.y + grounds.height; y += 1) {
      for (let x = site.x + grounds.x; x < site.x + grounds.x + grounds.width; x += 1) {
        reserved[tileIndex(x, y)] = 1;
      }
    }
  }
  return reserved;
}

/** Future roofs/walls and always-free civic ground are reserved independently. */
function siteReservations(sites: readonly Site[]): { readonly structures: Uint8Array; readonly resources: Uint8Array; readonly grounds: Uint8Array } {
  const structures = new Uint8Array(TILE_COUNT);
  const grounds = reservedGrounds(sites);
  const publicGround: GroundRect[] = [];
  for (const [id, site] of sites.entries()) {
    const plan = settlementLayout(id < 2 ? 'stronghold' : 'settlement');
    const other = sites[id === 0 ? 1 : 0];
    const dx = (other?.x ?? site.x) - site.x;
    const dy = (other?.y ?? site.y) - site.y;
    const side = id >= 2 ? 2 : Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 1 : 3 : dy >= 0 ? 2 : 0;
    const at = (rect: GroundRect): GroundRect => {
      const turned = turnRect(rect, side);
      return { ...turned, x: site.x + turned.x, y: site.y + turned.y };
    };
    for (const lot of plan.lots) markRect(structures, at(lot));
    markRect(structures, at(plan.landmark));
    if (id < 2) {
      const core = at(plan.core);
      const gate = at(plan.gate);
      for (let y = core.y; y < core.y + core.height; y += 1) {
        for (let x = core.x; x < core.x + core.width; x += 1) {
          if (containsTile(gate, x, y)) continue;
          if (x === core.x || y === core.y || x === core.x + core.width - 1 || y === core.y + core.height - 1) {
            structures[tileIndex(x, y)] = 1;
          }
        }
      }
    }
    publicGround.push(at(plan.capture), at(plan.muster), at({ ...plan.assembly, width: 1, height: 1 }),
      at({ x: -1, y: 4, width: 3, height: 11 }));
    if (id < 2) {
      // The first outside queue position is ten Tiles from the centre. Its
      // seven-Tile column tail needs dry ground beyond the final site grounds.
      markRect(grounds, at({ x: -3, y: 8, width: 7, height: 10 }));
      publicGround.push(at({ x: -1, y: 8, width: 3, height: 10 }));
    }
  }
  const resources = structures.slice();
  for (const area of publicGround) markRect(resources, area);
  // A landmark can enclose a small yard between future houses and walls.
  // Such a yard is not a resource site: its road must remain reachable even
  // after every planned building exists. Reuse the terrain flood for this mask.
  const access = new Int32Array(TILE_COUNT);
  labelLand(Uint8Array.from(structures, (blocked) => blocked === 1 ? TERRAIN.river : TERRAIN.plain), access, []);
  for (let tile = 0; tile < TILE_COUNT; tile += 1) if (access[tile] !== access[0]) resources[tile] = 1;
  return { structures, resources, grounds };
}

function markRect(mask: Uint8Array, rect: GroundRect): void {
  for (let y = Math.max(0, rect.y); y < Math.min(MAP_HEIGHT, rect.y + rect.height); y += 1) {
    for (let x = Math.max(0, rect.x); x < Math.min(MAP_WIDTH, rect.x + rect.width); x += 1) mask[tileIndex(x, y)] = 1;
  }
}

/** Four-connected seeded paths around fixed grounds; the seed only breaks equal-distance ties. */
function groundPath(from: number, to: number, forbidden: Uint8Array, salt: number, existing?: Uint8Array): number[] {
  const parent = new Int32Array(TILE_COUNT).fill(-2);
  const distance = new Int32Array(TILE_COUNT).fill(-1);
  const reuse = new Int32Array(TILE_COUNT);
  const queue = new Int32Array(TILE_COUNT);
  parent[from] = -1;
  distance[from] = 0;
  queue[0] = from;
  let head = 0;
  let tail = 1;
  while (head < tail && (existing !== undefined || parent[to] === -2)) {
    const tile = queue[head];
    head += 1;
    if (tile === undefined) continue;
    if (tile === to) break;
    const x = tileX(tile);
    const y = tileY(tile);
    const rotation = (Math.imul(tile ^ salt, 0x45d9f3b) >>> 16) & 3;
    for (let step = 0; step < 4; step += 1) {
      const direction = (rotation + step) & 3;
      const nx = x + (direction === 1 ? 1 : direction === 3 ? -1 : 0);
      const ny = y + (direction === 2 ? 1 : direction === 0 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
      const next = tileIndex(nx, ny);
      if (forbidden[next] === 1) continue;
      const nextDistance = (distance[tile] ?? 0) + 1;
      const nextReuse = (reuse[tile] ?? 0) + (existing?.[next] === 1 ? 1 : 0);
      if (parent[next] !== -2) {
        if (existing !== undefined && distance[next] === nextDistance && nextReuse > (reuse[next] ?? 0)) {
          parent[next] = tile;
          reuse[next] = nextReuse;
        }
        continue;
      }
      parent[next] = tile;
      distance[next] = nextDistance;
      reuse[next] = nextReuse;
      queue[tail] = next;
      tail += 1;
    }
  }
  if (parent[to] === -2) throw new Error('reserved settlement grounds leave no connected path');
  const path: number[] = [];
  let tile = to;
  while (tile >= 0) {
    path.push(tile);
    tile = parent[tile] ?? -1;
  }
  return path.reverse();
}

/**
 * Spreads farmland around every settlement, Strongholds included.
 *
 * Farmland is the one terrain that exists because somebody worked it, so it
 * belongs where the people are: a patch grown out from each settlement, over the
 * the terrain that is there, so a settlement sits in a landscape rather than on
 * a single tile of it. It is also where grain prefers to stand.
 */
function spreadFarmland(terrain: Uint8Array, rng: Rng, sites: readonly Site[]): void {
  const marks = new Uint32Array(TILE_COUNT);
  let mark = 0;

  for (const site of sites) {
    mark += 1;
    const size = FARMLAND_MIN + rng.nextBelow(FARMLAND_MAX - FARMLAND_MIN + 1);
    growBlob(terrain, rng, marks, mark, tileIndex(site.x, site.y), TERRAIN.farmland, size);
  }
}

/**
 * Places the resource nodes, each half of the theatre given the same number of each
 * kind.
 *
 * Same number per kind per half is the whole of the balance: with equal counts
 * and a range narrower than the tolerance, no draw can put the halves further
 * apart than `RESOURCE_TOLERANCE_PERCENT`, however the amounts fall. The kinds
 * are placed in `RESOURCE_KINDS` order, so a seed's nodes are a function of
 * the seed and not of anything a caller passes in.
 */
function placeResources(
  terrain: Uint8Array,
  rng: Rng,
  halves: Uint8Array,
  sites: readonly Site[],
  reserved: Uint8Array,
): ResourceNode[] {
  const resources: ResourceNode[] = [];
  const taken = reserved.slice();

  for (const site of sites) taken[tileIndex(site.x, site.y)] = 1;

  for (const kind of RESOURCE_KINDS) {
    const nodeKind = NODES_BY_KIND[kind];

    for (const half of [0, 1] as const) {
      const candidates = nodeTiles(terrain, nodeKind, halves, taken, half);

      for (let placed = 0; placed < nodeKind.perHalf; placed += 1) {
        const tile = draw(rng, candidates);
        const site = siteOf(tile);
        taken[tile] = 1;
        const quantity = nodeKind.min + rng.nextBelow(nodeKind.max - nodeKind.min + 1);
        resources.push({ ...site, kind, amount: quantity });
      }
    }
  }

  return resources;
}

/**
 * Every tile one half of the theatre offers a resource node of a kind.
 *
 * The terrains the kind prefers come first, and a half that cannot supply that
 * many of them makes up the rest from whatever dry land it has: the invariant
 * is that a half gets its nodes, and a half whose hills the rivers and the
 * farmland took is a half that should still be able to mine. A tile that
 * already holds something is left out of the list rather than drawn and
 * rejected, so a node is never sited on top of a settlement or another node.
 */
function nodeTiles(
  terrain: Uint8Array,
  nodeKind: NodeKind,
  halves: Uint8Array,
  taken: Uint8Array,
  half: Half,
): number[] {
  const preferred: number[] = [];
  const anywhere: number[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const index = tileIndex(x, y);
      if (taken[index] === 1) continue;
      if (!isDryLand(terrain, index)) continue;
      if (halves[index] !== half) continue;

      const here = elementAt(terrain, index);
      if (isTerrain(here) && nodeKind.terrain.includes(here)) preferred.push(index);
      else anywhere.push(index);
    }
  }

  return preferred.length >= nodeKind.perHalf ? preferred : [...preferred, ...anywhere];
}

/**
 * Lays the roads that join the settlements and resource nodes to one another.
 *
 * Each opening settlement first receives a direct road to its Stronghold. The
 * remaining components are then joined by the nearest pair of features. This
 * keeps an opening march short even when a river lies between the two sites.
 */
function carveRoads(terrain: Uint8Array, rng: Rng, sites: readonly Site[], forbidden: Uint8Array): Road[] {
  const roads: Road[] = [];
  const existing = new Uint8Array(TILE_COUNT);
  const component = sites.map((_, index) => index);
  const join = (a: number, b: number): void => {
    const first = elementAt(component, a);
    const second = elementAt(component, b);
    const road = layRoad(terrain, rng, elementAt(sites, a), elementAt(sites, b), forbidden, existing);
    roads.push(road);
    for (const tile of road.tiles) existing[tile] = 1;
    for (let index = 0; index < component.length; index += 1) {
      if (component[index] === second) component[index] = first;
    }
  };
  if (sites.length >= 4) {
    join(0, 2);
    join(1, 3);
  }
  while (new Set(component).size > 1) {
    let bestA = -1;
    let bestB = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let a = 0; a < sites.length; a += 1) {
      for (let b = a + 1; b < sites.length; b += 1) {
        if (component[a] === component[b]) continue;
        const distance = manhattan(elementAt(sites, a), elementAt(sites, b));
        if (distance < bestDistance) { bestA = a; bestB = b; bestDistance = distance; }
      }
    }
    if (bestA < 0 || bestB < 0) throw new Error('the road network could not connect every feature');
    join(bestA, bestB);
  }

  return roads;
}

/**
 * Lays one road between two sites around their future roofs and walls.
 * Seeded tie breaking varies equal-length paths; the Stronghold's sole opening
 * forces its roads through the Gate. Endpoints are included as evidence that
 * both features really are joined.
 */
function layRoad(terrain: Uint8Array, rng: Rng, from: Site, to: Site, forbidden: Uint8Array, existing: Uint8Array): Road {
  const start = tileIndex(from.x, from.y);
  const end = tileIndex(to.x, to.y);
  const tiles = groundPath(start, end, forbidden, rng.nextUint32(), existing);
  for (const tile of tiles) layRoadTile(terrain, tile);
  return { from: start, to: end, tiles };
}

/**
 * Lays the road across one tile.
 *
 * A river tile becomes a ford: a road that crosses water crosses it at a
 * ford, which is both what a road would do and a second way across the river
 * for free. Terrain the road can be laid over becomes road; a ford or another
 * road is already a way through and is left as it is.
 */
function layRoadTile(terrain: Uint8Array, tile: number): void {
  const here = elementAt(terrain, tile);

  if (here === TERRAIN.river || here === TERRAIN.ford) {
    widenCrossing(terrain, tile);
    return;
  }
  if (isOpenTerrain(here) || here === TERRAIN.marsh) terrain[tile] = TERRAIN.road;
}

/** A crossing carries the whole marching column, not only its centre Tile. */
function widenCrossing(terrain: Uint8Array, tile: number): void {
  const atX = tileX(tile);
  const atY = tileY(tile);
  for (let y = Math.max(0, atY - 2); y <= Math.min(MAP_HEIGHT - 1, atY + 2); y += 1) {
    for (let x = Math.max(0, atX - 2); x <= Math.min(MAP_WIDTH - 1, atX + 2); x += 1) {
      const index = tileIndex(x, y);
      if (terrain[index] === TERRAIN.river) terrain[index] = TERRAIN.ford;
    }
  }
}

/** Turn one primary-road crossing into a bridge while retaining other fords. */
function buildRoadBridge(terrain: Uint8Array, roads: readonly Road[], rivers: readonly River[]): void {
  for (const road of roads.slice(0, 2)) {
    for (const tile of road.tiles) {
      if (terrain[tile] !== TERRAIN.ford) continue;
      const x = tileX(tile);
      const y = tileY(tile);
      const remains = rivers.every((river) => river.tiles.filter((part) => terrain[part] === TERRAIN.ford &&
        Math.max(Math.abs(tileX(part) - x), Math.abs(tileY(part) - y)) > 2).length >= MIN_FORDS_PER_RIVER);
      if (!remains) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= MAP_WIDTH || ny >= MAP_HEIGHT) continue;
        const part = tileIndex(nx, ny);
        if (terrain[part] === TERRAIN.ford) terrain[part] = TERRAIN.bridge;
      }
      return;
    }
  }
}

/**
 * Fords whatever water still parts the land, until the land is one landmass.
 *
 * Some rivers cut the land into pieces; the fords planted along them and the ones the roads made are
 * meant to join those pieces, and this pass is the promise that it happened.
 * Every river tile that touches two different landmasses is a place a ford
 * would join them, and the first such tile is taken; the pass then looks again,
 * because joining two pieces can leave a third still on its own. Each turn of
 * the loop turns a river tile into a ford and never back, so the loop ends.
 *
 * @throws Error when the land is still parted and no river tile touches two
 *   landmasses — a generator error rather than a playable map.
 */
function joinLand(terrain: Uint8Array, rivers: readonly River[]): void {
  const labels = new Int32Array(TILE_COUNT);
  const queue: number[] = [];

  for (;;) {
    if (labelLand(terrain, labels, queue) <= 1) return;

    const ford = fordBetweenLandmasses(terrain, labels, rivers);
    if (ford < 0) throw new Error('the rivers parted the land and nothing on them can join it again');

    widenCrossing(terrain, ford);
  }
}

/**
 * Numbers every landmass on the map: -1 for water, a counter for the rest.
 *
 * A flood fill over the walkable tiles, four neighbours at a time — the
 * adjacency a Squad moves by, and the one the invariant means. Every wall on
 * this map is water, so this is also the answer to "can a Squad walk from here
 * to there".
 */
function labelLand(terrain: Uint8Array, labels: Int32Array, queue: number[]): number {
  labels.fill(-1);
  let landmasses = 0;

  for (let start = 0; start < TILE_COUNT; start += 1) {
    const known = labels[start];
    if (known !== undefined && known >= 0) continue;
    if (!isWalkable(elementAt(terrain, start))) continue;

    const label = landmasses;
    landmasses += 1;
    labels[start] = label;
    queue.length = 0;
    queue.push(start);

    while (queue.length > 0) {
      const index = queue.pop();
      if (index === undefined) break;

      const x = tileX(index);
      const y = tileY(index);
      if (x > 0) floodInto(labels, terrain, index - 1, label, queue);
      if (x < MAP_WIDTH - 1) floodInto(labels, terrain, index + 1, label, queue);
      if (y > 0) floodInto(labels, terrain, index - MAP_WIDTH, label, queue);
      if (y < MAP_HEIGHT - 1) floodInto(labels, terrain, index + MAP_WIDTH, label, queue);
    }
  }

  return landmasses;
}

/** Adds a neighbouring walkable tile to the flood, unless it has been reached already. */
function floodInto(labels: Int32Array, terrain: Uint8Array, index: number, label: number, queue: number[]): void {
  const known = labels[index];
  if (known !== undefined && known >= 0) return;
  if (!isWalkable(elementAt(terrain, index))) return;

  labels[index] = label;
  queue.push(index);
}

/**
 * A river tile that touches two different landmasses, and would join them as a
 * ford — or -1 when there is no such tile.
 */
function fordBetweenLandmasses(terrain: Uint8Array, labels: Int32Array, rivers: readonly River[]): number {
  for (const river of rivers) {
    for (const tile of river.tiles) {
      if (elementAt(terrain, tile) !== TERRAIN.river) continue;

      const x = tileX(tile);
      const y = tileY(tile);
      const around = [
        labelAt(labels, terrain, x - 1, y),
        labelAt(labels, terrain, x, y - 1),
        labelAt(labels, terrain, x + 1, y),
        labelAt(labels, terrain, x, y + 1),
      ].filter((label) => label >= 0);

      const first = around[0];
      if (first !== undefined && around.some((label) => label !== first)) return tile;
    }
  }

  return -1;
}

/** The landmass a tile belongs to, or -1 when it is water or off the map. */
function labelAt(labels: Int32Array, terrain: Uint8Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return -1;

  const index = tileIndex(x, y);
  if (!isWalkable(elementAt(terrain, index))) return -1;

  const label = labels[index];
  return label === undefined ? -1 : label;
}

/** Whether a tile can carry something built on it: dry land, and not a ford. */
function isDryLand(terrain: Uint8Array, index: number): boolean {
  const here = elementAt(terrain, index);
  return here !== TERRAIN.river && here !== TERRAIN.ford && here !== TERRAIN.lake;
}

/**
 * Whether a terrain is one of the four the land itself is made of — plain,
 * hill, forest, farmland — rather than water, a ford or a road.
 *
 * What a patch may be sown over and a road may be laid on. A ford is the one
 * that matters: farmland is spread after the fords are planted, and a patch
 * that grew over one would quietly take a river's way across away.
 */
function isOpenTerrain(terrain: number): boolean {
  return (
    terrain === TERRAIN.plain ||
    terrain === TERRAIN.hill ||
    terrain === TERRAIN.forest ||
    terrain === TERRAIN.farmland
  );
}

/** A site from a tile index. */
function siteOf(index: number): Site {
  return { x: tileX(index), y: tileY(index) };
}

/** The squared distance between two tiles: integers, so the comparison is exact. */
function distanceSquared(from: Site, to: Site): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;

  return dx * dx + dy * dy;
}

/** How many tiles apart two sites are, counting only orthogonal steps. */
function manhattan(from: Site, to: Site): number {
  return Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
}

/** Which half a tile lies in, from the two Strongholds that define them. */
function halfBetween(rome: Site, carthage: Site, x: number, y: number): Half {
  const here = { x, y };
  return distanceSquared(here, rome) <= distanceSquared(here, carthage) ? 0 : 1;
}

/**
 * The half of every tile, worked out once.
 *
 * The passes that place settlements and resource nodes ask the question thousands of
 * times — every tile of the map, for each of them — and the answer does not
 * change: the Strongholds are chosen before any of them run. Working it out once
 * is both the cheaper way and the clearer one, because the halves are then one
 * fact about the map rather than a comparison repeated in four loops.
 */
function halfTiles(strongholds: readonly [Site, Site]): Uint8Array {
  const [rome, carthage] = strongholds;
  const halves = new Uint8Array(TILE_COUNT);

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      halves[tileIndex(x, y)] = halfBetween(rome, carthage, x, y);
    }
  }

  return halves;
}

/**
 * The element at an index the caller knows is inside the list.
 *
 * `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, which is
 * the right default for a grid a caller reads from outside; inside the
 * generator an index is in range by construction, and this says so once instead
 * of a branch at every read. It throws rather than returning `undefined`, so a
 * wrong index is a loud failure instead of a silently skipped tile.
 */
function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const found = items[index];
  if (found === undefined) {
    throw new RangeError(`there is no element ${String(index)} in a list of ${String(items.length)}`);
  }

  return found;
}

/**
 * Takes one tile out of a list at random, and out of the list.
 *
 * Drawing and removing in one place is what stops two things from being sited
 * on the same tile: the list is the tiles still free, and taking one leaves it
 * ready for the next draw. A caller that draws more tiles than a list holds has
 * a region the map cannot fill, and is told so rather than given `undefined`.
 */
function draw(rng: Rng, candidates: number[]): number {
  if (candidates.length === 0) {
    throw new Error('there is nowhere left on the map to put it');
  }

  const chosen = rng.nextBelow(candidates.length);
  const index = elementAt(candidates, chosen);
  candidates[chosen] = elementAt(candidates, candidates.length - 1);
  candidates.pop();

  return index;
}
