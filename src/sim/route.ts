/**
 * The way across the theatre, and what crossing it costs (PLAN §4, C1).
 *
 * A Squad is ordered to a tile; what it needs is the cheapest sequence of tiles
 * to walk to get there, or a reason why there is none. That is `findRoute`, and
 * it is A* over the 160×160 grid, four-connected, with the terrain's cost as its
 * edge weight — which is the plan's decision, taken when a dozen Squads on one
 * theatre were known to be the whole demand for pathfinding.
 *
 * Three things about it are the whole point of the module, and each is a
 * sentence the tests hold to:
 *
 * - **Water is not crossed.** A river is not an expensive tile but a wall, and a
 *   route never enters one; a ford is how the water is crossed, and it costs
 *   time rather than being forbidden.
 * - **A route is priced in the walker's own pace.** Every type marches at a
 *   `speed` (`content/squads.ts`): a tile costs the terrain's own ticks divided
 *   by the pace and rounded up, so a horse does not merely walk a footsoldier's
 *   road faster — the search that chose the road chose it *for the horse*, and a
 *   cache remembers one route per pace rather than pretending all walkers are
 *   alike.
 * - **The same question has the same answer.** Every number here is an integer,
 *   the heuristic is the Manhattan distance times the cheapest tile there is —
 *   admissible and consistent, so a tile taken out of the frontier is settled —
 *   and ties are broken by the order tiles were queued, never by a hash order
 *   or a heap's internal arrangement. Two runs of the same Match therefore walk
 *   the same route, tile for tile, which is what the state hash needs
 *   (ADR-0006).
 * - **A route worked out once is not worked out again.** `createRouteCache`
 *   remembers what it computed for a theatre, so a Squad re-ordered to a tile it
 *   was already sent to — and a second Squad setting out from the same ground —
 *   costs a lookup rather than a search. The memory belongs to the theatre it
 *   was made on, is bounded, and is derived rather than state: it never enters
 *   `MatchState`, so a hash cannot depend on whether a route was remembered.
 *
 * What the memory does *not* do is answer a dozen Squads ordered to one tile
 * from a dozen different tiles with one search: the way depends on where it sets
 * out from, and the structure that answers all of them at once — a field of
 * distances rooted at the destination, which nobody has to search again — is the
 * flow field the plan deliberately does not buy at this scale (PLAN §4). A dozen
 * Squads are a dozen corridor searches, which `movement.test.ts` measures; a
 * thousand would be the ticket to revisit it.
 *
 * Nothing here decides anything: a route is not an order, and refusing one is
 * not a rule of the game. `movement.ts` is where a Squad is told, and where the
 * reason a route was refused is kept.
 */
import {
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRAIN,
  TILE_COUNT,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type Site,
  type Terrain,
} from './map.ts';

/**
 * How many ticks a Squad spends entering a tile of each terrain: the whole of
 * C1's movement cost, in one table.
 *
 * The pace is set by plain ground at four ticks a tile — a Squad crosses open
 * country at two and a half tiles a second, and the theatre end to end in about
 * forty seconds of Match time — and every other terrain is a multiple of it: a
 * road halves it, farm ground is a little slower, hill and forest double it,
 * and a ford is the slowest crossing there is, because fording disorders as
 * well as wets. What a Squad does with the disorder is C3's question; here it
 * is time.
 *
 * The table is the same one the search weighs edges with, so a route is chosen
 * by the time it takes and not by a second opinion about what is quick. Hill
 * and forest cost the same on purpose: the hills are a slow climb and the
 * forests are a slow tangle, and neither is the place a route wants to be.
 *
 * A river has no entry: it is not crossed at all, and `moveCost` refuses to
 * price it rather than pretending it is expensive.
 */
const MOVE_COST: Readonly<Record<Exclude<Terrain, typeof TERRAIN.river>, number>> = {
  [TERRAIN.road]: 2,
  [TERRAIN.plain]: 4,
  [TERRAIN.farmland]: 5,
  [TERRAIN.hill]: 8,
  [TERRAIN.forest]: 8,
  [TERRAIN.ford]: 10,
};

/** The cheapest tile there is, at the pace of a man on foot: the search's heuristic counts in it. */
const CHEAPEST_TILE = Math.min(...Object.values(MOVE_COST));

/**
 * How many ticks a Squad spends entering a tile of this terrain.
 *
 * @throws RangeError when the terrain is water, which no Squad enters and no
 *   route crosses — a caller that asks is a caller that has already gone wrong.
 */
export function moveCost(terrain: Terrain): number {
  if (terrain === TERRAIN.river) {
    throw new RangeError('a river is not crossed: a tile of open water has no cost to enter');
  }

  return MOVE_COST[terrain];
}

/**
 * How many ticks a Squad of a given pace spends entering a tile of this terrain.
 *
 * The terrain's own cost divided by the pace and rounded up, so the pace is a
 * whole number of tiles' worth of ground per tile's cost and never a float in
 * state: a road costs a horse one tick, plain ground two, a ford five. `moveCost`
 * and `paceCost` are the two halves of one table, and the search weighs a route
 * with the second so that a fast Squad is routed by the time *it* would take.
 *
 * @throws RangeError when the pace is not a whole number of at least one, or the
 *   terrain is water.
 */
export function paceCost(terrain: Terrain, pace: number): number {
  return Math.ceil(moveCost(terrain) / requirePace(pace));
}

/** A pace a Squad can march at, refusing the numbers that are not one. */
function requirePace(pace: number): number {
  if (!Number.isInteger(pace) || pace < 1) {
    throw new RangeError(`a pace is a whole number of tiles at least one, got ${String(pace)}`);
  }

  return pace;
}

/**
 * Why a route was refused, in the words an Observation carries.
 *
 * A route can name an off-map Tile, water or land that nothing reaches. Group
 * allocation can additionally exhaust separated arrival positions near its
 * target: `no-space` is assigned by movement, never by the route search.
 */
export type RouteRefusal = 'off-map' | 'water' | 'unreachable' | 'no-space' | 'garrison-full' | 'garrison-type';

/**
 * The refusals in code order: what state holds, spelled out.
 *
 * A Squad remembers why its last order was refused (`squad.ts`), and state holds
 * integers (ADR-0006), so a word has to have a number. The list is the order
 * the numbers are, the way `RESOURCE_KINDS` is for resources, so the words and
 * the codes cannot drift apart.
 */
export const ROUTE_REFUSALS: readonly RouteRefusal[] = ['off-map', 'water', 'unreachable', 'no-space', 'garrison-full', 'garrison-type'];

/** The code a Squad holds when its last order was taken: not a refusal at all. */
export const NO_REFUSAL = -1;

/** The number a refusal is held as. @throws RangeError when the value is not one of the refusals. */
export function refusalCode(reason: RouteRefusal): number {
  const code = ROUTE_REFUSALS.indexOf(reason);
  if (code < 0) throw new RangeError(`${String(reason)} is not a route refusal`);

  return code;
}

/** The refusal a number names, or `null` when it is `NO_REFUSAL`. @throws RangeError on any other number. */
export function refusalOf(code: number): RouteRefusal | null {
  if (code === NO_REFUSAL) return null;

  const reason = ROUTE_REFUSALS[code];
  if (reason === undefined) throw new RangeError(`${String(code)} is not a route refusal`);

  return reason;
}

/**
 * What a search answered: the tiles to enter, or why it cannot be done.
 *
 * `steps` holds the tiles a Squad enters *after* the one it is standing on, in
 * order, so a route to the tile it is already on is a route of no steps — which
 * is what "you are there" looks like as a route. Every step is a tile of the
 * map, always walkable, and always four-adjacent to the one before it.
 */
export type Route =
  | { readonly kind: 'route'; readonly steps: readonly number[] }
  | { readonly kind: 'refused'; readonly reason: RouteRefusal };

/**
 * The cheapest way from one tile to another, or why there is none.
 *
 * @param pace The whole number of tiles' worth of ground the walker covers for
 *   the cost of one; `1` is a man on foot. A route is searched in the walker's
 *   own pace, so the way a horse is given is the quickest way for a horse.
 * @throws RangeError when the tile it sets out from is not a walkable tile of
 *   this map, or the pace is not a whole number of at least one: a route starts
 *   where a Squad stands, and a Squad stands on land.
 */
export type PassageCheck = (x: number, y: number, fromX?: number, fromY?: number) => boolean;

export function findRoute(map: MapGrid, from: Site, to: Site, pace = 1, canEnter?: PassageCheck): Route {
  requirePace(pace);

  const start = tileOf(from);
  if (start < 0 || !isWalkable(terrainAt(map, from.x, from.y))) {
    throw new RangeError(
      `a route cannot set out from (${String(from.x)}, ${String(from.y)}): no Squad stands there`,
    );
  }

  const goal = tileOf(to);
  if (goal < 0) return { kind: 'refused', reason: 'off-map' };
  if (!isWalkable(terrainAt(map, to.x, to.y))) return { kind: 'refused', reason: 'water' };
  if (canEnter !== undefined && !canEnter(to.x, to.y)) return { kind: 'refused', reason: 'unreachable' };
  if (goal === start) return { kind: 'route', steps: [] };

  const steps = search(map, start, goal, pace, canEnter);

  return steps === null ? { kind: 'refused', reason: 'unreachable' } : { kind: 'route', steps };
}

/** The tile a site names, or -1 when it names none: off the map, or not a whole tile. */
function tileOf(site: Site): number {
  if (!Number.isInteger(site.x) || !Number.isInteger(site.y)) return -1;
  if (site.x < 0 || site.y < 0 || site.x >= MAP_WIDTH || site.y >= MAP_HEIGHT) return -1;

  return tileIndex(site.x, site.y);
}

/**
 * A* from one tile to another: the tiles to enter, in order, or `null` when no
 * way reaches.
 *
 * The frontier is a binary heap of tiles ordered by `cost + estimate`, and ties
 * are broken by the order tiles were queued in — a number that only ever grows —
 * so the heap's shape can never decide which of two equally short routes comes
 * back. A tile is settled when it leaves the frontier, which is correct because
 * the heuristic never overestimates: the cheapest a step can cost *this walker*
 * is the road's ticks divided by its pace, so no tile behind the one in hand can
 * be reached more cheaply.
 */
function search(map: MapGrid, start: number, goal: number, pace: number, canEnter?: PassageCheck): number[] | null {
  const cost = new Int32Array(TILE_COUNT).fill(-1);
  const cameFrom = new Int32Array(TILE_COUNT).fill(-1);
  const estimate = new Int32Array(TILE_COUNT).fill(-1);
  const arrival = new Int32Array(TILE_COUNT).fill(-1);
  const settled = new Uint8Array(TILE_COUNT);
  const frontier: number[] = [];
  // The cheapest a step can cost *this* walker, which is the road's own ticks
  // divided by its pace: the heuristic never overestimates a horse by counting
  // in a footsoldier's pace.
  const cheapest = Math.ceil(CHEAPEST_TILE / pace);
  let arrivals = 0;

  cost[start] = 0;
  estimate[start] = stepsBetween(start, goal) * cheapest;
  arrival[start] = 0;
  frontier.push(start);

  while (frontier.length > 0) {
    const tile = takeNearest(frontier, estimate, arrival);
    if (tile === goal) return walkBack(cameFrom, start, goal);
    if (settled[tile] === 1) continue;
    settled[tile] = 1;

    const reached = cost[tile] as number;

    for (const neighbour of neighboursOf(tile)) {
      if (settled[neighbour] === 1) continue;

      const ground = terrainAt(map, tileX(neighbour), tileY(neighbour));
      if (!isWalkable(ground)) continue;
      if (canEnter !== undefined && !canEnter(tileX(neighbour), tileY(neighbour), tileX(tile), tileY(tile))) continue;

      const through = reached + paceCost(ground, pace);
      const known = cost[neighbour] as number;
      if (known >= 0 && known <= through) continue;

      cost[neighbour] = through;
      cameFrom[neighbour] = tile;
      estimate[neighbour] = through + stepsBetween(neighbour, goal) * cheapest;
      arrival[neighbour] = arrivals;
      arrivals += 1;
      push(frontier, neighbour, estimate, arrival);
    }
  }

  return null;
}

/** The four tiles a Squad can step to, in the order the search considers them: north, east, south, west. */
function neighboursOf(tile: number): readonly number[] {
  const x = tileX(tile);
  const y = tileY(tile);
  const around: number[] = [];

  if (y > 0) around.push(tile - MAP_WIDTH);
  if (x < MAP_WIDTH - 1) around.push(tile + 1);
  if (y < MAP_HEIGHT - 1) around.push(tile + MAP_WIDTH);
  if (x > 0) around.push(tile - 1);

  return around;
}

/** How many steps apart two tiles are, counting only orthogonal steps. */
function stepsBetween(from: number, to: number): number {
  return Math.abs(tileX(from) - tileX(to)) + Math.abs(tileY(from) - tileY(to));
}

/** Takes the nearest tile off the frontier, leaving the heap a heap. */
function takeNearest(heap: number[], estimate: Int32Array, arrival: Int32Array): number {
  const nearest = elementAt(heap, 0);
  const last = heap.pop();

  if (last !== undefined && heap.length > 0) {
    heap[0] = last;
    siftDown(heap, 0, estimate, arrival);
  }

  return nearest;
}

/** Puts a tile on the frontier, where its score says it belongs. */
function push(heap: number[], tile: number, estimate: Int32Array, arrival: Int32Array): void {
  heap.push(tile);
  let at = heap.length - 1;

  while (at > 0) {
    const above = (at - 1) >> 1;
    if (!nearer(elementAt(heap, at), elementAt(heap, above), estimate, arrival)) break;

    swap(heap, at, above);
    at = above;
  }
}

/** Restores the heap below an index whose score has just grown. */
function siftDown(heap: number[], from: number, estimate: Int32Array, arrival: Int32Array): void {
  let at = from;

  for (;;) {
    const left = at * 2 + 1;
    const right = left + 1;
    let nearest = at;

    if (left < heap.length && nearer(elementAt(heap, left), elementAt(heap, nearest), estimate, arrival)) {
      nearest = left;
    }
    if (right < heap.length && nearer(elementAt(heap, right), elementAt(heap, nearest), estimate, arrival)) {
      nearest = right;
    }
    if (nearest === at) return;

    swap(heap, at, nearest);
    at = nearest;
  }
}

/**
 * Which of two frontier tiles comes first: the one with the smaller score, and
 * of two equal scores the one that was queued first.
 *
 * The score is what the search is for, and the queue order is what makes a tie
 * a decision rather than an accident: two shortest routes of the same length are
 * both right, and two runs of a Match have to pick the same one.
 */
function nearer(one: number, other: number, estimate: Int32Array, arrival: Int32Array): boolean {
  const oneScore = estimate[one] as number;
  const otherScore = estimate[other] as number;

  return oneScore === otherScore ? (arrival[one] as number) < (arrival[other] as number) : oneScore < otherScore;
}

/** Swaps two tiles on the frontier. */
function swap(heap: number[], one: number, other: number): void {
  const held = elementAt(heap, one);
  heap[one] = elementAt(heap, other);
  heap[other] = held;
}

/** The tiles from the start to the goal, the start left out, nearest first. */
function walkBack(cameFrom: Int32Array, start: number, goal: number): number[] {
  const steps: number[] = [];
  let tile = goal;

  while (tile !== start) {
    steps.push(tile);
    tile = cameFrom[tile] as number;

    if (tile < 0) throw new Error('the search found a way that does not start where it set out');
  }

  steps.reverse();
  return steps;
}

/**
 * The element at an index the caller knows is inside a list.
 *
 * `noUncheckedIndexedAccess` makes every indexed read `T | undefined`, which is
 * the right default for a grid a caller reads from outside; inside the heap an
 * index is in range by construction, and this says so once instead of a branch
 * at every read. It throws rather than returning `undefined`, so a wrong index
 * is a loud failure rather than a tile that quietly vanishes from the frontier.
 */
function elementAt<T>(items: ArrayLike<T>, index: number): T {
  const found = items[index];
  if (found === undefined) {
    throw new RangeError(`there is no element ${String(index)} in a list of ${String(items.length)}`);
  }

  return found;
}

/**
 * Routes already worked out on one theatre, so that asking twice is cheap.
 *
 * A cache belongs to the map it was made for and to nothing else: the map does
 * not change while a Match is played, so a route keyed by its two ends cannot go
 * stale. It remembers a bounded number of routes and forgets the one it has not
 * been asked about for longest, which is the right thing to forget — the orders
 * a Player repeats are the ones near the front of their mind.
 *
 * What it hands back is a copy. A route is walked by whoever asked for it — a
 * Squad's remaining steps *are* the route it was given — and a memory that a
 * caller could write through would be a memory that answered differently the
 * second time.
 */
export interface RouteCache {
  /**
   * The way from one tile to another at a walker's pace: searched for once, and
   * looked up after that. One route is remembered per pace, because a horse's
   * quickest way is not always a footsoldier's.
   */
  route(from: Site, to: Site, pace?: number, canEnter?: PassageCheck, context?: string): Route;

  /** How many searches it has run: what "remembered rather than recomputed" is counted by. */
  readonly searches: number;

  /** How many times it answered out of memory instead. */
  readonly hits: number;

  /** How many routes it is holding. */
  readonly size: number;
}

/** How many routes a cache remembers unless a caller says otherwise. */
export const ROUTE_CACHE_LIMIT = 64;

/**
 * A cache of routes on one theatre.
 *
 * @throws RangeError when the limit is not a whole number of routes of at least
 *   one — a cache that remembers nothing would search on every order, which is
 *   exactly what it exists to avoid.
 */
export function createRouteCache(map: MapGrid, limit: number = ROUTE_CACHE_LIMIT): RouteCache {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`a route cache remembers a whole number of routes, one or more, got ${String(limit)}`);
  }

  const routes = new Map<string, Route>();
  let searches = 0;
  let hits = 0;

  return {
    route(from: Site, to: Site, pace = 1, canEnter?: PassageCheck, context = ''): Route {
      const base = routeKey(from, to, pace);
      const key = base === null ? null : `${context}/${base}`;

      // A tile that is not on the map is refused without a search and without a
      // memory: there is nothing to work out, and nothing worth remembering.
      if (key === null) return findRoute(map, from, to, pace, canEnter);

      const remembered = routes.get(key);
      if (remembered !== undefined) {
        hits += 1;
        // Asked about again, so it is the least likely to be forgotten next.
        routes.delete(key);
        routes.set(key, remembered);

        return copyOf(remembered);
      }

      searches += 1;
      const route = findRoute(map, from, to, pace, canEnter);
      routes.set(key, route);
      if (routes.size > limit) forgetOldest(routes);

      return copyOf(route);
    },

    get searches(): number {
      return searches;
    },

    get hits(): number {
      return hits;
    },

    get size(): number {
      return routes.size;
    },
  };
}

/**
 * The key two tiles are remembered under at a pace, or `null` when either end is
 * not a tile of the map.
 *
 * The pace is part of the key: two walkers of the same ground may take different
 * ways, so remembering one answer for both would answer the second walker with
 * the first walker's route.
 */
function routeKey(from: Site, to: Site, pace: number): string | null {
  const start = tileOf(from);
  const goal = tileOf(to);

  return start < 0 || goal < 0 ? null : `${String(pace)}:${String(start)}:${String(goal)}`;
}

/** A route of the caller's own, so walking it cannot spoil what was remembered. */
function copyOf(route: Route): Route {
  return route.kind === 'route' ? { kind: 'route', steps: [...route.steps] } : route;
}

/** Forgets the route the cache has gone longest without being asked about. */
function forgetOldest(routes: Map<string, Route>): void {
  const oldest = routes.keys().next();

  if (!oldest.done) routes.delete(oldest.value);
}
