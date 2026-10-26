/**
 * The moving half of a Squad, and the Commands that move it (PLAN §4, C1).
 *
 * A Squad is one entity, and B6 left it deliberately in two halves: `economy.ts`
 * says of its own `Squad` that "where it stands, how many men are left in it and
 * how strong it fights are the map's and combat's (C1, C3)" and keeps the type,
 * the home, the morale and the Payroll. This module is the half that walks: it
 * reads and writes the `Block` every Squad carries — its tile, its shape, its
 * facing and its route — and it is what `economyMatchRules` calls on a tick.
 *
 * Four Commands are obeyed here, and they are the four that are about moving:
 *
 * - `move` and `attackMove` allocate nearby distinct arrivals for a group and
 *   plan routes to them (docs/COMMANDS.md). A single Squad uses the named Tile.
 *   An Attack-move is a move: what a Squad meets on the way and what it does
 *   about it is combat, which is C3's, and a march that stopped to fight would
 *   be C3's too.
 * - `hold` stops where the Squad stands and forgets the route.
 * - `formation` sets the shape the Squad holds, which is a property of the Squad
 *   (ADR-0004) rather than of anybody arranging men.
 *
 * Everything else in the vocabulary is left alone here: `garrison`, `build`,
 * `recruit`, `assault`, `blockade` and `group` belong to the modules that own
 * them — `build` and `recruit` are the economy's, `assault`, `blockade` and
 * `garrison` the Siege's (`siege.ts`), and all of them are applied beside this
 * — and a rule that quietly half-implemented one of them would be worse than one
 * that does nothing at all. `attack` and `withdraw` are combat's and are applied
 * beside this too (`combat.ts`), because closing with an enemy and falling back
 * are one rule and not two. A Command naming a Squad the
 * Faction does not own is ignored for the same reason: the seam guarantees the
 * *Command* came from the right Player, and this is where the Squad is asked
 * whether it belongs to them.
 *
 * ## Refusing an order, and what "cleanly" means
 *
 * A Squad ordered to a tile no way reaches does not walk towards it, does not
 * half-walk towards it, and does not forget what it was already doing: it keeps
 * the route it had, and remembers why the new order could not be taken. That
 * reason is state (`refused`, a `route.ts` code), because it is what a Player is
 * shown — "Acque profonde" rather than a Squad that ignores a click — and
 * `observeEconomy` reports it in words. The next move Command that *is* taken
 * clears it: the field answers "why is this Squad not doing what I just told it
 * to", and a Squad doing as it was told does not need one.
 *
 * ## Determinism, and the one thing that is not state
 *
 * Movement draws nothing from the Match's random source, so a tick of it is a
 * function of the world and the Commands alone; the tests replay the same march
 * and compare the whole world's hash. The routes a Squad walks are *derived*
 * rather than state — the cache in `route.ts` holds them and the Squad holds the
 * copy it is walking — so whether a route happened to be remembered cannot
 * change a hash, and a replay that reads a cache the first run did not have
 * still walks the same tiles.
 *
 * The cache itself is the one piece of machinery here that outlives a tick, and
 * it is a memo and nothing more: `routeCacheFor` keeps one per theatre, keyed by
 * the map object, holding the answer a pure search already gave. It is
 * deliberately not inside `Economy` — state may not hold a `Map`, and the
 * canonical form would refuse it — and it is deliberately invisible: a Match
 * that found its routes cheaply and one that found them slowly are the same
 * Match, hash for hash.
 */
import { squadTypeCode, squadTypeOf } from '../content/index.ts';
import { formationShape } from '../content/formation.ts';
import type { Command, Formation } from './command.ts';
import type { Economy, Squad } from './economy.ts';
import { factionCode, type Faction, type FactionCode } from './faction.ts';
import {
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type Site,
} from './map.ts';
import {
  createRouteCache,
  NO_REFUSAL,
  paceCost,
  refusalCode,
  type RouteCache,
  type PassageCheck,
} from './route.ts';
import { canOccupy, clearFieldBody, crossingPerimeter, hasPhysicalSpace, physicalSignature, refreshPhysicalSpace } from './settlement-space.ts';
import { requestDeparture } from './settlement-access.ts';
import { prepareTraffic, trafficStep } from './settlement-traffic.ts';
import {
  FACING,
  facingCode,
  FIELD,
  formationCode,
  formationOf,
  isRouting,
  standingAt,
  type Block,
  type Facing,
} from './squad.ts';

/** Where a Squad is mustered onto the map, and what it is when it stands there. */
export interface Placement {
  /** The Faction that owns it. */
  readonly faction: Faction;

  /** The id of a Squad type from the content table (C4), e.g. `hastati`. */
  readonly squadType: string;

  /** The tile to stand it on. */
  readonly x: number;

  /** The tile to stand it on, downwards. */
  readonly y: number;

  /**
   * The men it is raised with: its type's largest size unless a caller says
   * otherwise.
   *
   * A scenario is not a purchase — it does not pay, and it is not held to the
   * roster's offer — but it is held to the type's own ceiling, because a Squad
   * of more men than its type can hold is a Squad no rule could have produced.
   * The default is the full-strength body the type is counted as.
   */
  readonly men?: number;

  /** The shape it holds: a line unless a caller says otherwise. */
  readonly formation?: Formation;

  /** The way it faces: south unless a caller says otherwise, since the first step it takes turns it anyway. */
  readonly facing?: Facing;
}

/**
 * Stands a Squad of a type up on the map, outside the economy's recruitment.
 *
 * Where an army really comes from is recruitment: a settlement pays for it, its
 * tier gates it and its people are what raise it (B6, `recruit`). This is the
 * other way in, and it is for scenarios — a test that wants twelve Squads on a
 * painted theatre, and the CLI's `march` Match, which is a harness and not the
 * game — so that what they place is a real Squad of a real type, with the morale
 * and the Payroll its type gives it, rather than a shape someone invented.
 *
 * The Squad belongs to the first settlement its Faction holds, which at the
 * opening of a Match is its Stronghold: that is the home Payroll and desertion
 * speak of.
 *
 * @returns the Squad, which is already in `economy.squads` and is the object the
 *   rules will move — a caller that keeps it can read where it has got to.
 * @throws RangeError when the tile is not on the map, is water, the type is not
 *   one the Faction can raise, or `men` is not a size that type can hold. A Squad
 *   nobody asked for that cannot exist is better refused where it was asked for
 *   than discovered by a renderer.
 */
export function musterSquad(economy: Economy, map: MapGrid, placement: Placement): Squad {
  const code = squadTypeCode(placement.squadType);
  const type = code === undefined ? undefined : squadTypeOf(code);
  if (type === undefined) {
    throw new RangeError(`"${placement.squadType}" is not a Squad type the content table knows`);
  }
  if (type.faction !== placement.faction) {
    throw new RangeError(`a ${placement.faction} Faction cannot muster a Squad of ${type.id}`);
  }
  if (!isTile(placement.x, placement.y)) {
    throw new RangeError(
      `a Squad stands on a tile of the theatre, and (${String(placement.x)}, ${String(placement.y)}) is not one`,
    );
  }
  if (!isWalkable(terrainAt(map, placement.x, placement.y))) {
    throw new RangeError(
      `(${String(placement.x)}, ${String(placement.y)}) is water, and no Squad stands on water`,
    );
  }

  const home = economy.settlements.find((settlement) => settlement.owner === factionCode(placement.faction));
  if (home === undefined) {
    throw new RangeError(`the ${placement.faction} Faction holds no settlement to raise a Squad from`);
  }

  const men = placement.men ?? type.strength;
  if (!Number.isInteger(men) || men < 1 || men > type.strength) {
    throw new RangeError(
      `a Squad of ${String(men)} is not a size a ${type.id} can be mustered at: 1 to ${String(type.strength)} men`,
    );
  }

  const squad: Squad = {
    ...standingAt(placement.x, placement.y, men, type.ammunition),
    id: economy.nextSquadId,
    owner: factionCode(placement.faction),
    type: code as number,
    capacity: men,
    home: home.id,
    morale: type.morale,
    unpaid: 0,
  };

  if (placement.formation !== undefined) squad.formation = formationCode(placement.formation);
  if (placement.facing !== undefined) squad.facing = facingCode(placement.facing);

  economy.nextSquadId += 1;
  economy.squads.push(squad);

  return squad;
}

/**
 * Obeys the Commands of one tick that are about moving.
 *
 * `routes` is the theatre's cache of routes (`route.ts`), handed in rather than
 * held here so that the one place that decides what a Squad was told is also the
 * one place that asks how to get there — and so that a test can count what an
 * order cost. Nothing is drawn from the Match's random source, and nothing here
 * depends on the order the Commands arrive in beyond the ordinary one: a later
 * order replaces an earlier one, which is what a Player clicking twice means.
 */
export function applyMovementCommands(
  economy: Economy,
  map: MapGrid,
  commands: readonly Command[],
  routes: RouteCache,
): void {
  for (const command of commands) {
    const owner = factionCode(command.faction);

    switch (command.kind) {
      case 'move':
      case 'attackMove':
        orderGroupTo(map, orderedSquads(economy, owner, command.squads), command, routes);
        break;

      case 'hold':
        for (const squad of orderedSquads(economy, owner, command.squads)) standDown(squad);
        break;

      case 'formation':
        for (const squad of orderedSquads(economy, owner, command.squads)) {
          const requested = formationCode(command.formation);
          if (canOccupy(map, squad, squad.x, squad.y, requested) && clearFieldBody(map, squad, squad.x, squad.y, requested)) {
            squad.formation = requested;
            delete squad.marchFormation;
          } else squad.marchFormation = requested;
        }
        break;

      // Every other Command belongs to a module that owns it: `attack` and
      // `withdraw` are combat's, `build` and `recruit` the economy's, `assault`,
      // `blockade` and `garrison` the Siege's, and `group` the Player's — each
      // applied beside this one, in the same tick.
      default:
        break;
    }
  }
}

/**
 * Arrival only: routes can overlap in transit. IDs decide allocation, then
 * distance to the click, north before south and west before east break ties.
 * A bounded twelve-Tile neighbourhood keeps the click meaningful. Only its
 * connected landmass is considered; no fallback sends a Squad across water.
 */
function orderGroupTo(map: MapGrid, squads: readonly Squad[], to: Site, routes: RouteCache): void {
  if (squads.length <= 1 || !isTile(to.x, to.y) || !isWalkable(terrainAt(map, to.x, to.y))) {
    for (const squad of squads) orderSquadTo(map, squad, to, routes);
    return;
  }

  const connected = connectedTo(map, to);
  const candidates: Site[] = [];
  for (let y = Math.max(0, to.y - 12); y <= Math.min(MAP_HEIGHT - 1, to.y + 12); y += 1) {
    for (let x = Math.max(0, to.x - 12); x <= Math.min(MAP_WIDTH - 1, to.x + 12); x += 1) {
      if (connected.has(tileIndex(x, y))) candidates.push({ x, y });
    }
  }
  const distance = (site: Site): number => (site.x - to.x) * (site.x - to.x) + (site.y - to.y) * (site.y - to.y);
  candidates.sort((a, b) => distance(a) - distance(b) || a.y - b.y || a.x - b.x);
  const assigned: { readonly site: Site; readonly radius: number }[] = [];
  for (const squad of [...squads].sort((a, b) => a.id - b.id)) {
    if (!connected.has(tileIndex(squad.x, squad.y))) {
      squad.refused = refusalCode('unreachable');
      continue;
    }
    const type = squadTypeOf(squad.type);
    const shape = formationShape(type?.figures ?? squad.capacity, formationOf(squad.formation));
    // One Tile per three files/ranks plus clearance. This is rule geometry,
    // independent of Figure pixels, and conservative for every arrival facing.
    const radius = Math.ceil(Math.max(shape.files, shape.ranks) / 6) + 1;
    const site = candidates.find((candidate) =>
      (!hasPhysicalSpace(map) || passageCheck(map, squad)(candidate.x, candidate.y)) && assigned.every((other) =>
        Math.max(Math.abs(candidate.x - other.site.x), Math.abs(candidate.y - other.site.y)) >= radius + other.radius));
    if (site === undefined) {
      squad.refused = refusalCode('no-space');
      continue;
    }
    orderSquadTo(map, squad, site, routes);
    assigned.push({ site, radius });
  }
}

/** Derived reachability, never state: the terrain is the only transit obstacle. */
function connectedTo(map: MapGrid, site: Site): ReadonlySet<number> {
  const reached = new Set([tileIndex(site.x, site.y)]);
  const queue = [site];
  for (let at = 0; at < queue.length; at += 1) {
    const current = queue[at] as Site;
    for (const next of [{ x: current.x, y: current.y - 1 }, { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y + 1 }, { x: current.x - 1, y: current.y }]) {
      if (!isTile(next.x, next.y) || !isWalkable(terrainAt(map, next.x, next.y))) continue;
      const tile = tileIndex(next.x, next.y);
      if (reached.has(tile)) continue;
      reached.add(tile);
      queue.push(next);
    }
  }
  return reached;
}

/**
 * Moves every Squad one step along its route, once the tile it is about to cross
 * has been paid for.
 *
 * The clock is the Squad's own: `wait` counts the ticks left before it enters
 * the next tile, and what it holds is the *cost of that tile* — set when a route
 * is planned, kept by a re-aim that still enters it, and set again after every
 * step. So a route takes exactly the ticks it was costed at, tile for tile, and
 * the search that chose it chose the quickest way in the same currency: a Squad
 * that walked round a hill to save eight ticks a tile arrives eight ticks a tile
 * sooner for it. A Squad with nowhere left to walk has nothing to pay, and
 * stands.
 *
 * Physical accesses register arrivals before the loop. Their integer tickets
 * determine passage order; other field bodies can keep a passage waiting.
 */
export function march(economy: Economy, map: MapGrid): void {
  refreshPhysicalSpace(map);
  prepareTraffic(economy, map, (squad, target) => orderSquadTo(map, squad, target, routeCacheFor(map), true));
  for (const squad of economy.squads) {
    if (squad.marchFormation !== undefined && !accessColumn(squad) && !crossingPerimeter(map, squad) &&
      canOccupy(map, squad, squad.x, squad.y, squad.marchFormation) && clearFieldBody(map, squad, squad.x, squad.y, squad.marchFormation)) {
      squad.formation = squad.marchFormation;
      delete squad.marchFormation;
    }
    if (squad.steps.length === 0) {
      squad.wait = 0;
      continue;
    }

    const next = squad.steps[0];
    if (next === undefined) continue;
    // A queued body can back away or sidestep without rotating through a
    // neighbour. Its normal facing resumes after it has cleared the lane.
    const yielding = squad.access?.yielding === 1;
    const direction = yielding ? squad.facing : facingOfStep(tileIndex(squad.x, squad.y), next);
    const pose = yielding && canOccupy(map, squad, tileX(next), tileY(next)) ? { formation: squad.formation, facing: squad.facing } :
      passagePose(map, squad, tileX(next), tileY(next), direction);
    if (pose === undefined) {
      const target = goalOf(squad);
      squad.steps = [];
      squad.wait = 0;
      if (target !== null) orderSquadTo(map, squad, target, routeCacheFor(map));
      continue;
    }
    const { formation, facing } = pose;
    if (!trafficStep(economy, map, squad, tileX(next), tileY(next), formation, facing)) continue;
    useMarchFormation(squad, formation);
    squad.facing = facing;

    if (squad.wait > 0) {
      squad.wait -= 1;
      if (squad.wait > 0) continue;
    }

    takeStep(map, squad);
  }
}

/**
 * The tile a Squad is still walking to, or `null` when it has nowhere left to
 * walk: what an Observation reports as its goal, and what a UI marks on the map.
 */
export function goalOf(squad: Block): Site | null {
  if (squad.access?.yielding) return { x: squad.access.goalX, y: squad.access.goalY };
  if (squad.garrisonJourney?.phase === 3 && squad.garrison !== FIELD) {
    return { x: squad.garrisonJourney.goalX, y: squad.garrisonJourney.goalY };
  }
  const last = squad.steps.at(-1);

  return last === undefined ? null : { x: tileX(last), y: tileY(last) };
}

/**
 * The routes worked out on one theatre, kept for as long as that theatre is.
 *
 * A memo keyed by the map object, so two Matches are two memories and no
 * theatre is ever answered with another's route. It holds nothing a hash can
 * see: `route.ts` says what a cache is, and this is only where the Match keeps
 * one. A map that goes out of scope takes its memory with it, which is why the
 * key is a `WeakMap` and not a `Map` that a long tournament would fill up.
 */
const ROUTES = new WeakMap<MapGrid, RouteCache>();

/** The cache of routes this theatre's searches are remembered in, made the first time it is asked for. */
export function routeCacheFor(map: MapGrid): RouteCache {
  const known = ROUTES.get(map);
  if (known !== undefined) return known;

  const cache = createRouteCache(map);
  ROUTES.set(map, cache);

  return cache;
}

/**
 * Puts a Squad on the road to a tile, or tells it why it cannot go.
 *
 * An order to the tile a Squad is already walking to is not a new order at all:
 * the route it is on is the route it would be given again, so it keeps it and
 * nothing is searched for. That is what makes repeating an order — a Player
 * clicking twice, an AI re-issuing its objective every tick — cost nothing and
 * change nothing, and it is the reason the steps are kept on the Squad at all.
 *
 * An order to a *different* tile is a new route, and it is searched for; what it
 * is not is a new step timer. A route that still enters the tile the Squad is
 * already paying for keeps the ticks already spent on it, because what entering
 * a tile costs does not depend on where the Squad goes after it. That is what
 * makes re-aiming different from repeating: an AI updating its goal every tick,
 * or a player moving the goalpost one tile at a time, is obeyed without costing
 * the Squad a step it had already paid for. Only a route that enters a different
 * tile — or none at all — is charged from the beginning.
 *
 * Foundations, ownership changes and new Breaches can change a planned way.
 * March validates each next footprint and searches again when ground changes.
 *
 * A refused order leaves the Squad exactly as it was — its route, its waiting
 * and its place — and records the reason on it. That is the whole of "does not
 * leave the Squad stranded mid-motion": the Squad was going somewhere, and it
 * still is.
 *
 * Exported because an order does not always arrive as a Command. C3's rout and
 * its `withdraw` both send a Squad to ground it did not choose — the nearest
 * friendly settlement — and they are the same order a Player's click is, so they
 * come through here rather than growing a second way to move a block that would
 * forget what a refusal is.
 */
export function orderSquadTo(map: MapGrid, squad: Squad, to: Site, routes: RouteCache, preserveJourney = false): void {
  refreshPhysicalSpace(map);
  const destination = squad.steps.at(-1);

  if (destination !== undefined && destination === tileOf(to)) {
    squad.refused = NO_REFUSAL;
    return;
  }

  const route = routes.route({ x: squad.x, y: squad.y }, to, paceOf(squad),
    hasPhysicalSpace(map) ? passageCheck(map, squad) : undefined,
    hasPhysicalSpace(map) ? `${physicalSignature(map)}:${squad.owner}:${squad.capacity}:${squad.marchFormation ?? squad.formation}:${squad.facing}` : '');

  if (route.kind === 'refused') {
    squad.refused = refusalCode(route.reason);
    return;
  }
  if (squad.garrison !== FIELD && !preserveJourney) {
    requestDeparture(squad, to);
    return;
  }
  if (!preserveJourney) {
    delete squad.garrisonJourney;
    if (squad.access?.active === 1) {
      squad.access.goalX = to.x;
      squad.access.goalY = to.y;
      squad.access.yielding = 0;
    } else delete squad.access;
  }

  // The route is the Squad's own copy: a Squad walks its steps, and the cache
  // must not be walked away by whoever asked for it second. Turning to face the
  // way it is about to go happens here rather than at the first step, so a Squad
  // ordered across the map turns on the tick it is told and not four ticks
  // later — and the block does it as one piece, without disturbing a man.
  const payingFor = squad.steps[0];
  const firstStep = route.steps[0];
  if (firstStep !== undefined && hasPhysicalSpace(map)) {
    const facing = facingOfStep(tileIndex(squad.x, squad.y), firstStep);
    const pose = passagePose(map, squad, tileX(firstStep), tileY(firstStep), facing);
    if (pose === undefined) { squad.refused = refusalCode('unreachable'); return; }
    const { formation } = pose;
    if (clearFieldBody(map, squad, squad.x, squad.y, formation, facing)) useMarchFormation(squad, formation);
  }

  squad.steps = [...route.steps];
  squad.refused = NO_REFUSAL;
  // An order puts a garrison back in the field: a Squad inside a settlement that
  // is told to march is told to come out of it (C5). A refused order above
  // changed nothing, so it did not take the Squad out of anything either.
  squad.garrison = FIELD;
  if (firstStep === undefined || (canOccupy(map, squad, squad.x, squad.y, squad.formation,
    facingOfStep(tileIndex(squad.x, squad.y), firstStep)) && clearFieldBody(map, squad, squad.x, squad.y, squad.formation,
    facingOfStep(tileIndex(squad.x, squad.y), firstStep)))) faceTheWay(squad);

  // Only a route entering a different tile re-prices the step.
  if (payingFor === undefined || payingFor !== firstStep) squad.wait = costAhead(map, squad);
}

/** Stops a Squad where it stands, and forgets where it was going. */
function standDown(squad: Squad): void {
  delete squad.garrisonJourney;
  delete squad.access;
  squad.steps = [];
  squad.wait = 0;
  squad.refused = NO_REFUSAL;
}

/**
 * The Squads a Command names that are this Faction's and still in good order.
 *
 * A routed Squad is running for its own walls and is driven by nobody: there is
 * no manual rallying and no micro-recovery in this game (C3's out of scope, and
 * ADR-0004's point), so the hand that got it broken does not get to walk it out of
 * trouble either. `combat.ts`'s `run` is what moves it.
 *
 * Shared with `combat.ts`, which asks the same question of its two Commands: one
 * definition of "this order is obeyed", so the movement's orders and the fight's
 * cannot come to disagree about a running Squad.
 */
export function orderedSquads(economy: Economy, owner: FactionCode, ids: readonly number[]): readonly Squad[] {
  return ownedSquads(economy, owner, ids).filter((squad) => !isRouting(squad));
}

/**
 * The Squads of a Command's list that the Faction actually owns, in the economy's
 * own order.
 *
 * The seam guarantees the *Command* came from the right Player; this is where-
 * ever a rule asks the Squads themselves whether they belong to them, so that a
 * Command naming an enemy Squad — or one that has already left the field —
 * quietly orders nobody instead of reaching across the line.
 */
export function ownedSquads(economy: Economy, owner: FactionCode, ids: readonly number[]): readonly Squad[] {
  return economy.squads.filter((squad) => squad.owner === owner && ids.includes(squad.id));
}

/**
 * Takes one step along a Squad's route: onto the next tile, facing the way it
 * will go from there.
 *
 * What the step leaves behind is the cost of the tile *after* the one entered —
 * which is the cost of the step it has just taken, already paid, put back for
 * the one it is about to take.
 */
function takeStep(map: MapGrid, squad: Squad): void {
  const entering = squad.steps.shift();
  if (entering === undefined) return;

  squad.x = tileX(entering);
  squad.y = tileY(entering);
  squad.wait = costAhead(map, squad);
}

function passageFormation(map: MapGrid, squad: Squad, x: number, y: number, facing: number): number | undefined {
  const wanted = accessColumn(squad) ? 1 : squad.marchFormation ?? squad.formation;
  const face = facing;
  if ((wanted === 1 || !crossingPerimeter(map, squad, x, y, wanted, face)) && canOccupy(map, squad, x, y, wanted, face) && canOccupy(map, squad, squad.x, squad.y, wanted, face) &&
    (wanted === squad.formation || !crossingPerimeter(map, squad))) return wanted;
  if (canOccupy(map, squad, x, y, 1, face) && canOccupy(map, squad, squad.x, squad.y, 1, face)) return 1;
  return undefined;
}

/** A rigid body can back away before a safe turn; it never cuts its tail through terrain. */
function passagePose(map: MapGrid, squad: Squad, x: number, y: number, facing: number): { formation: number; facing: number } | undefined {
  const forward = passageFormation(map, squad, x, y, facing);
  if (forward !== undefined) return { formation: forward, facing };
  const formation = accessColumn(squad) || crossingPerimeter(map, squad) ||
    crossingPerimeter(map, squad, x, y) ? 1 : squad.formation;
  if (canOccupy(map, squad, squad.x, squad.y, formation, squad.facing) && canOccupy(map, squad, x, y, formation, squad.facing))
    return { formation, facing: squad.facing };
  return undefined;
}

function useMarchFormation(squad: Squad, formation: number): void {
  if (squad.formation !== formation && squad.marchFormation === undefined) squad.marchFormation = squad.formation;
  squad.formation = formation;
}

function passageCheck(map: MapGrid, squad: Squad): PassageCheck {
  return (x, y, fromX, fromY) => {
    const faces = fromX === undefined || fromY === undefined ? [0, 1, 2, 3] :
      [y < fromY ? 0 : x > fromX ? 1 : y > fromY ? 2 : 3, squad.facing];
    const wanted = accessColumn(squad) ? 1 : squad.marchFormation ?? squad.formation;
    return faces.some((facing) => [wanted, 1].some((formation) =>
      canOccupy(map, squad, x, y, formation, facing) &&
      (fromX === undefined || fromY === undefined || canOccupy(map, squad, fromX, fromY, formation, facing))));
  };
}

function accessColumn(squad: Squad): boolean {
  const journey = squad.garrisonJourney;
  return journey !== undefined && journey.fromOutside === 1 && (journey.phase === 0 || journey.phase === 2);
}

/**
 * Turns a Squad to face the tile it is about to enter.
 *
 * The facing is the way a Squad is *going*, not the way it came: an order turns
 * the block on the tick it is given, and a route that bends turns it at the
 * bend. A Squad with nowhere left to walk keeps the way it last faced, which is
 * the way it arrived.
 */
function faceTheWay(squad: Squad): void {
  const next = squad.steps[0];
  if (next === undefined) return;

  squad.facing = facingOfStep(tileIndex(squad.x, squad.y), next);
}

/**
 * How many ticks the Squad must wait before entering the next tile of its route:
 * what that tile costs *at its own pace*, or nothing at all when the route is
 * walked.
 *
 * The terrain's cost is the ground's, and the pace is the type's, so a horse and
 * a man ordered across the same plain pay different ticks for it — which is the
 * whole of what a type's `pace` means (`content/squads.ts`).
 */
function costAhead(map: MapGrid, squad: Squad): number {
  const next = squad.steps[0];

  return next === undefined ? 0 : paceCost(terrainAt(map, tileX(next), tileY(next)), paceOf(squad));
}

/**
 * The pace a Squad marches at: its type's `pace`, or the footsoldier's one when
 * the code names no type at all.
 *
 * The fallback is deliberately the slowest pace there is: a Squad the content
 * table cannot name is a Squad whose type went wrong, and walking it at a
 * horse's pace would be this module inventing an answer for content that is
 * missing.
 */
export function paceOf(squad: { readonly type: number }): number {
  return squadTypeOf(squad.type)?.pace ?? 1;
}

/** The way a Squad faces after stepping from one tile to the next. */
function facingOfStep(from: number, to: number): number {
  const across = tileX(to) - tileX(from);
  const down = tileY(to) - tileY(from);

  if (down < 0) return FACING.north;
  if (down > 0) return FACING.south;

  return across > 0 ? FACING.east : FACING.west;
}

/** Whether a pair of numbers addresses a tile of the theatre. */
function isTile(x: number, y: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT
  );
}

/** The tile a site names, or -1 when it names none: the map's own flat indices. */
function tileOf(site: Site): number {
  return isTile(site.x, site.y) ? tileIndex(site.x, site.y) : -1;
}
