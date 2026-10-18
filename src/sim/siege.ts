/**
 * Siege: walls, the Roman ram, the assault and the blockade (PLAN §4, ADR-0008,
 * ticket C5).
 *
 * A Siege is the contest over a settlement, and there are two of them — never
 * one procedure with different numbers. An **Assault** is fast and expensive: it
 * works the walls under fire and breaks the gate with a **ram**, which is built
 * on the spot, which only Rome can build, and which the garrison can destroy.
 * A **Blockade** is slow and cheap in lives: it cuts the settlement's supply, so
 * the granary empties, the people starve, the garrison's nerve goes, and the town
 * opens its gates — unless the besieged Faction's field army comes to break it.
 *
 * ## Walls and gates are structures, and each takes its own damage
 *
 * A walled settlement is not one pool of health. It is a **gate** and four
 * **wall sections**, each with its own hit points, and a **breach** is any one
 * of them broken. The ram pounds the gate; the men under the walls work at a
 * wall too, at about a third of the speed. That is what makes "an assault
 * without a breach is possible but punishing, and never the obvious choice" a
 * rule rather than a wish: an assault can be issued before anything is broken,
 * and the walls cost the men under them in lives and nerve every round until the
 * ram is at work. Waiting for the breach is the sane order of business, and a
 * broken ram pays for itself in blood.
 *
 * Walls do not repair: a place that has been stormed once is weaker the second
 * time, which is the record of the first and one more reason a failed assault is
 * a real loss.
 *
 * Only a Stronghold is walled. A **minor settlement** is open, and open ground is
 * taken by *holding its centre*: a Squad standing on its tile, uncontested, for
 * `CAPTURE_HOLDS` checks. Nothing is razed in v1 — taking a settlement takes its
 * people, its works and its stocks intact.
 *
 * ## A garrison is a posture, not a second army
 *
 * A Squad told to `garrison` stands at its settlement's centre but is *inside*
 * the walls: `combat.ts`'s contact rules skip it (`squad.ts`'s `Block.garrison`),
 * because the wall, not the man, is what an enemy at the gate is facing. So the
 * fight over a breach is the same exchange as any other fight — the men who came
 * over the wall against the men who man it (`combat.ts`'s `woundsOf`) — and a
 * garrison that breaks **surrenders** rather than running out through the enemy.
 * Only a walled settlement can be garrisoned: an open one is held in the field.
 *
 * ## Two clocks, and no random source
 *
 * An assault round is `ASSAULT_TICKS` (a second), a capture check is
 * `CAPTURE_TICKS`, and a blockade does its work at the **Season** boundary like
 * every other strategic system (ADR-0010). Both cadences are `tick % n`, so
 * neither needs an accumulator in state and a replay cannot drift off them.
 * Nothing here draws from the Match's random source: a Siege is a pure function
 * of the world, so a replay reproduces it (ADR-0006).
 *
 * ## The dice this ticket loads, and where the escape hatch is
 *
 * ADR-0008 made the asymmetry the historical one: Carthage has no siege engine
 * and therefore cannot assault at all, and the plan's largest balance risk is
 * that a Blockade that is too slow leaves Carthage unable to win. `canAssault`
 * is the whole of that decision in code — the escape hatch the ADR decided in
 * advance ("give Carthage a ram") is that one function returning `true` for both
 * Factions, and nothing else in this module would have to move.
 *
 * ## Wired into one Match
 *
 * `siegeMatchRules` is the economy Match plus a Siege: the siege's Commands are
 * applied first, the economy's whole tick runs with the blockaded settlements
 * cut out of production (`stepEconomyWorld` takes the predicate), the assault
 * rounds and capture checks resolve, and the Season boundary starves whatever is
 * still blockaded. `siegeMatchOutcome` is where a Match first ends sooner than
 * its bound: the fall of a Stronghold, and the reason it fell.
 */
import { stockAt } from '../content/index.ts';
import { TICK_HZ } from './clock.ts';
import type { Command, SiegePath } from './command.ts';
import { BREAKING_MORALE, woundsOf } from './combat.ts';
import type { MatchSetup, VictoryReason } from './driver.ts';
import {
  economyMatchRules,
  observeEconomy,
  stepEconomyWorld,
  type EconomyVisible,
  type EconomyWorld,
} from './economy-match.ts';
import { UNOWNED, type Economy, type Settlement, type Squad, type Supplied } from './economy.ts';
import { factionCode, factionOf, type Faction } from './faction.ts';
import { RESOURCE, type MapGrid, type Site } from './map.ts';
import type { MatchRules } from './match.ts';
import { goalOf, orderedSquads, orderSquadTo, routeCacheFor } from './movement.ts';
import { recordCasualties, type Fallen } from './residue.ts';
import { NO_REFUSAL, type RouteCache } from './route.ts';
import {
  FACINGS,
  facingCode,
  FIELD,
  frontage,
  isRouting,
  ROUTING,
  type Facing,
} from './squad.ts';

/** What a fortification is made of: an opening to break, or a stretch of wall. */
export const STRUCTURE = {
  gate: 0,
  wall: 1,
} as const;

/** A piece of a settlement's fortification. */
export type StructureKind = keyof typeof STRUCTURE;

/** The words a structure is reported with, in code order. */
export const STRUCTURE_KINDS: readonly StructureKind[] = ['gate', 'wall'];

/** How many stretches of wall stand round a walled settlement: one to a side. */
export const WALL_SECTIONS = 4;

/** What a wall section takes before it is broken, and the assault has a breach. */
export const WALL_HP = 60;

/** What a gate takes before it is broken: the strongest single piece of the wall. */
export const GATE_HP = 120;

/** How much damage the men at the walls do to them in one round of escalade. */
export const ESCALADE_DAMAGE = 3;

/** How many men the walls cost each besieging Squad in a round it is under them. */
export const WALL_ASSAULT_LOSS = 4;

/** How much nerve the walls cost each besieging Squad in a round it is under them. */
export const WALL_SHOCK = 1;

/** How many ticks an assault round takes: a second at the 10 Hz clock. */
export const ASSAULT_TICKS = TICK_HZ;

/** How many ticks have to pass between two checks of who is holding a centre. */
export const CAPTURE_TICKS = 50;

/** How many capture checks a Faction has to hold a centre before it has taken it. */
export const CAPTURE_HOLDS = 3;

/** How close a Squad has to be to a settlement to besiege it: tiles, Chebyshev. */
export const SIEGE_RADIUS = 1;

/** How close a field army has to come to break a blockade: tiles, Chebyshev. */
export const RELIEF_RADIUS = 3;

/** What laying a ram down costs the besieging Faction, from its one treasury. */
export const RAM_COST = 15;

/** What a ram takes before the garrison has broken it. */
export const RAM_HP = 60;

/** How many ticks the ram takes to build, once it is paid for: six seconds of Match time. */
export const RAM_BUILD_TICKS = 60;

/** What the ram takes off a gate in one round once it is built. */
export const RAM_DAMAGE = 15;

/** How many files of garrison it takes to break one point of the ram in a round. */
export const RAM_FILES_PER_BLOW = 4;

/**
 * How much grain a blockade costs a settlement each Season, on top of what it
 * eats: the fields it cannot work, and the stores the besiegers spoil.
 *
 * With `STARTING_STOCKS.grain` this empties a Stronghold's granary in about three
 * Seasons, which is what makes a Blockade *slow* next to an Assault's minute and
 * still inside a game year — the balance question the ADR leaves to F1, with the
 * numbers in one place for it to move.
 */
export const BLOCKADE_GRAIN_LOSS = 6;

/** How many of its people a settlement loses to a Season of blockade. */
export const BLOCKADE_POPULATION_LOSS = 2;

/**
 * How much nerve a Season of blockade costs the garrison inside.
 *
 * Four, and not three, because a paid garrison recovers a point a Season
 * (`chargePayroll`): a garrison the besieged Faction can still pay holds out a
 * Season longer than one it cannot, which is a decision rather than a rounding.
 */
export const BLOCKADE_MORALE_LOSS = 4;

/** The path a Siege is following, as state holds it. */
export const SIEGE = {
  none: 0,
  assault: 1,
  blockade: 2,
} as const;

/** One way of taking a settlement, as a number state holds. */
export type SiegeCode = (typeof SIEGE)[keyof typeof SIEGE];

/** One piece of a settlement's fortification, with what is left of it. */
export interface Structure {
  /** The kind it is, as a `STRUCTURE` code: the gate or a stretch of wall. */
  readonly kind: number;

  /** Which side of the settlement it stands on, as a `FACING` code. */
  readonly side: number;

  /** What is left of it: at 0 it is broken, and a broken structure is a breach. */
  hp: number;
}

/**
 * One settlement's Siege: its fortification, who is at it, and how far they have
 * got.
 *
 * One front per settlement, in the economy's own order, so a front is found by
 * the id a Command names and nothing has to be searched for. Everything here is
 * integer state — no `null`, no word — for the ordinary reason (ADR-0006), which
 * is why "nobody is besieging it" is `UNOWNED` and "no ram" is a ram of no hit
 * points.
 */
export interface Front {
  /** The settlement this front is about: the economy's own id. */
  readonly settlement: number;

  /** Its fortification, in the order a blow falls on it: empty for an open settlement. */
  readonly structures: Structure[];

  /** The Faction besieging it, or `UNOWNED` when nobody is (C5). */
  besieger: number;

  /** Which path of the Siege it is, as a `SIEGE` code. */
  path: number;

  /** What is left of the ram, or 0 when there is none. */
  ram: number;

  /** Ticks left before the ram is built: 0 when it is built, or there is none. */
  ramTicks: number;

  /** The Faction holding its centre, or `UNOWNED`: what `hold` is counting for. */
  holder: number;

  /** Capture checks in a row the holder has held the centre. */
  hold: number;

  /** The Faction that took it, or `UNOWNED` while it stands. */
  taken: number;

  /** How it was taken, as a `SIEGE` code: what the reason for the Match names. */
  takenPath: number;
}

/** Everything a Match's Sieges own: one front per settlement, and which are Strongholds. */
export interface Siege {
  /** One front per settlement, indexed by the economy's own settlement id. */
  readonly fronts: readonly Front[];

  /** The settlements that are Strongholds: whose fall ends the Match, in `FACTIONS` order. */
  readonly strongholds: readonly number[];
}

/** The world `siegeMatchRules` plays: the economy's Match, with its fortifications beside it. */
export interface SiegeWorld extends EconomyWorld {
  /** The walls, the rams and the two ways of taking a settlement. */
  readonly siege: Siege;
}

/** One piece of a fortification, as the Faction that can see it reads it. */
export interface VisibleStructure {
  /** Whether it is the gate or a stretch of wall. */
  readonly kind: StructureKind;

  /** Which side of the settlement it stands on. */
  readonly side: Facing;

  /** What is left of it. */
  readonly hp: number;

  /** Whether it is still standing: a broken structure is a breach. */
  readonly standing: boolean;
}

/** The ram at a Siege, as the besieger reads it. */
export interface VisibleRam {
  /** What is left of it. */
  readonly hp: number;

  /** Ticks left before it is built: 0 when it is built. */
  readonly remaining: number;

  /** Whether it is built and battering the gate. */
  readonly built: boolean;
}

/** One front, as a Faction that holds it or is besieging it reads it. */
export interface VisibleFront {
  /** The settlement it is about. */
  readonly settlement: number;

  /** Its fortification, in the order a blow falls on it. */
  readonly structures: readonly VisibleStructure[];

  /** Whether any piece of it is broken. */
  readonly breached: boolean;

  /** Which path of the Siege is being followed, or `null` when there is none. */
  readonly siege: SiegePath | null;

  /** The Faction besieging it, or `null`. */
  readonly besieger: Faction | null;

  /** The ram at the walls, or `null` when there is none. */
  readonly ram: VisibleRam | null;

  /** Capture checks the holder has held the centre. */
  readonly hold: number;

  /** How many Squads are garrisoning it. */
  readonly garrison: number;
}

/** What a Faction may know of a Siege: its own walls, and the ones it is at. */
export interface SiegeVisible extends EconomyVisible {
  /** The fronts this Faction holds or is besieging. */
  readonly fronts: readonly VisibleFront[];
}

/**
 * Opens the Sieges of the settlements a map laid down.
 *
 * Every settlement gets a front; only a Stronghold gets a fortification, and its
 * gate faces the other Faction's Stronghold — the direction an enemy has to come
 * from — while its four wall sections stand one to a side. Pure in the map and
 * the economy, which are pure in the seed, so two Matches on a seed open the same
 * walls with the same hit points.
 */
export function createSiege(map: MapGrid, economy: Economy): Siege {
  const strongholds = map.strongholds.map((site) => settlementIdAt(economy, site));
  const [rome, carthage] = map.strongholds;

  return {
    fronts: economy.settlements.map((settlement) => {
      const side = strongholds.indexOf(settlement.id);
      const gateSide = side === 0 ? sideToward(rome, carthage) : sideToward(carthage, rome);

      return frontOf(settlement, side >= 0 ? gateSide : undefined);
    }),
    strongholds,
  };
}

/**
 * Whether a Faction may assault a settlement at all.
 *
 * Rome's alone: the ram is a Roman engine, and Carthage has none (ADR-0008). This
 * is the plan's single largest balance risk written as one function, and the
 * escape hatch the ADR decides in advance — "give Carthage a ram" — is this
 * predicate, not a scattering of numbers.
 */
export function canAssault(faction: Faction): boolean {
  return faction === 'rome';
}

/** The front of one settlement, or `undefined` when no front has it. */
export function frontAt(siege: Siege, settlement: number): Front | undefined {
  return siege.fronts.find((front) => front.settlement === settlement);
}

/** Whether a settlement is walled: it has a fortification to break. */
export function isWalled(front: Front): boolean {
  return front.structures.length > 0;
}

/** Whether a front has been breached: any one of its structures is broken. */
export function breached(front: Front): boolean {
  return front.structures.some((structure) => structure.hp <= 0);
}

/** The gate of a front, or `undefined` for an open settlement. */
export function gateOf(front: Front): Structure | undefined {
  return front.structures.find((structure) => structure.kind === STRUCTURE.gate);
}

/** The Squads garrisoning one settlement, in the economy's own order. */
export function garrisonOf(economy: Economy, settlement: number): readonly Squad[] {
  return economy.squads.filter((squad) => squad.garrison === settlement);
}

/**
 * Whether a settlement's supply is cut by a Blockade, and it therefore produces
 * nothing: the predicate `economy.ts`'s `produceSeason` and `harvest` are given.
 */
export function isBlockaded(siege: Siege, settlement: Settlement): boolean {
  const front = frontAt(siege, settlement.id);
  if (front === undefined) return false;
  if (front.path !== SIEGE.blockade) return false;

  return front.besieger !== UNOWNED && front.besieger !== settlement.owner;
}

/** The supplied predicate a Match with a Siege runs its economy with. */
export function suppliedBy(siege: Siege): Supplied {
  return (settlement) => !isBlockaded(siege, settlement);
}

/**
 * Obeys the three Commands that are about a Siege: `assault`, `blockade` and
 * `garrison`, and reports whether the world honoured each.
 *
 * A Command the Siege cannot honour changes nothing and answers `false`: an
 * Assault by Carthage (ADR-0008), a settlement the Faction already holds, a
 * Blockade of open ground nobody holds, an Assault on an *open* settlement —
 * which is taken by holding its centre rather than stormed — a garrison in a
 * settlement with no walls, or a garrison by a Faction that does not hold it.
 * Silently is the rule the whole vocabulary follows (see `applyEconomyCommand`):
 * refusing loudly is whoever shows a Player why, and C5 must not invent a
 * message the interface cannot say. Answering `false` is what lets the tickets
 * that do show it — and the tests — tell an order that landed from one that did
 * not.
 *
 * An Assault and a Blockade are alternatives, not stages: whichever is issued
 * last is the path the Siege follows, and the other is dropped.
 */
export function applySiegeCommand(world: SiegeWorld, command: Command, routes: RouteCache): boolean {
  switch (command.kind) {
    case 'assault':
      return laySiege(world, command.settlement, command.faction, command.squads, SIEGE.assault, routes);
    case 'blockade':
      return laySiege(world, command.settlement, command.faction, command.squads, SIEGE.blockade, routes);
    case 'garrison':
      return takeUpGarrison(world, command.settlement, command.faction, command.squads);
    default:
      return false;
  }
}

/**
 * One tick of a Siege: the assault rounds, the reliefs, and the capture checks.
 *
 * Called after the economy's tick, so the round is fought on the ground the
 * Squads have actually reached this tick, and so a blockade's Season work — which
 * runs inside the economy's tick — has already happened.
 */
export function besiege(world: SiegeWorld, tick: number): void {
  for (const front of world.siege.fronts) resolveFront(world, front, tick);

  if (tick % CAPTURE_TICKS === 0) captureRound(world);
}

/**
 * One Season of every Blockade that is still standing: the granary empties, the
 * people leave or starve, the garrison's nerve goes, and a town with no grain
 * and no men on its walls opens its gates.
 *
 * Called once per boundary `stepEconomyWorld` reports, after the economy has done
 * its own Season work, so a blockaded settlement has already eaten what it had
 * before the Siege takes the rest.
 */
export function starveBlockades(world: SiegeWorld): void {
  for (const front of world.siege.fronts) {
    if (front.path !== SIEGE.blockade) continue;

    const settlement = world.economy.settlements[front.settlement];
    if (settlement === undefined) continue;
    if (front.besieger === UNOWNED || settlement.owner === front.besieger) continue;

    // A relieving army lifts the Blockade rather than starving beside it, so the
    // Season is the last moment the ring can still be closed.
    if (relieved(world, settlement)) {
      stand(front);
      continue;
    }

    // And a ring nobody is standing in is not a ring: the besiegers may have been
    // broken or marched off since the last tick of the Siege. An army still on
    // the road starves nothing, but the order it was given stands.
    if (besiegersOf(world, front).length === 0) {
      if (!onTheWay(world, front, settlement)) stand(front);
      continue;
    }

    starve(world, front, settlement);
  }
}

/**
 * The Siege's own Match: the economy's tick, the Siege's Commands, its rounds and
 * its Seasons, in that order.
 *
 * The Commands are applied before the economy's tick so that an order to assault,
 * to blockade or to garrison takes effect on the tick it is given, exactly as a
 * `move` does; the economy's whole tick then runs with blockaded settlements cut
 * out of its production; the assault rounds and capture checks resolve on the
 * ground those orders produced; and the Season boundaries the economy reports
 * starve whatever is still blockaded.
 */
export const siegeMatchRules: MatchRules<SiegeWorld, Command> = {
  createWorld: (seed) => createSiegeWorld(seed),

  step: (world, _rng, tick, commands) => {
    const routes = routeCacheFor(world.map);

    for (const command of commands) applySiegeCommand(world, command, routes);

    const changes = stepEconomyWorld(world, tick, commands, suppliedBy(world.siege));

    besiege(world, tick);

    // One Season of blockade for every boundary the clock crossed — normally one,
    // and more only for a step that had a catch-up to make.
    for (let crossed = 0; crossed < changes.length; crossed += 1) starveBlockades(world);
  },
};

/** Opens the Siege world a seed describes: the economy's Match with its walls. */
export function createSiegeWorld(seed: number): SiegeWorld {
  const world = economyMatchRules.createWorld(seed);

  return { ...world, siege: createSiege(world.map, world.economy) };
}

/**
 * What a Faction may see of a Siege: the fronts of the settlements it holds and
 * of the ones it is besieging, and no third kind.
 *
 * A wall is not a secret from the men in front of it or the men behind it, and
 * neither is the ram either of them built; a Stronghold nobody has marched on is
 * another Faction's business, and is not in the projection at all. The garrison is
 * reported as a count rather than a list of ids: what is on the walls is visible,
 * but which Squads a Faction keeps is in that Faction's own `squads`.
 */
export const observeSiege: MatchSetup<SiegeWorld, SiegeVisible>['observe'] = (world, faction) => {
  const seen = observeEconomy(world, faction);
  const owner = factionCode(faction);

  return {
    ...seen,
    fronts: world.siege.fronts
      .filter((front) => {
        const settlement = world.economy.settlements[front.settlement];
        if (settlement === undefined) return false;

        // An open settlement has no wall to keep a secret: anyone may see that
        // the village is standing there, and whether anybody is inside it.
        return settlement.owner === owner || front.besieger === owner || !isWalled(front);
      })
      .map((front) => visibleFront(world.economy, front)),
  };
};

/**
 * The verdict of a Match whose world has a Siege in it.
 *
 * The fall of a Stronghold ends it — that is the plan's first ending, and the
 * reason names the Stronghold and the path that took it. The second ending the
 * plan names is a Faction with neither settlements nor Squads left, which no
 * Stronghold has to fall for; it is checked after the Stronghold so that the more
 * specific reason wins when both are true at once.
 */
export const siegeMatchOutcome: MatchSetup<SiegeWorld, SiegeVisible>['outcome'] = (world) => {
  const fallen = takenStronghold(world.siege);
  if (fallen !== undefined) {
    const winner = factionOf(fallen.taken);

    return { kind: 'victory', winner, reason: strongholdReason(fallen) };
  }

  const beaten = beatenFaction(world.economy);
  if (beaten !== undefined) {
    return {
      kind: 'victory',
      winner: factionOf(beaten === 0 ? 1 : 0),
      reason: { kind: 'annihilation' },
    };
  }

  return null;
};

/** A front at the opening of a Match: its walls if it is a Stronghold, and nobody at them. */
function frontOf(settlement: Settlement, gateSide: Facing | undefined): Front {
  return {
    settlement: settlement.id,
    structures: gateSide === undefined ? [] : fortifications(gateSide),
    besieger: UNOWNED,
    path: SIEGE.none,
    ram: 0,
    ramTicks: 0,
    holder: UNOWNED,
    hold: 0,
    taken: UNOWNED,
    takenPath: SIEGE.none,
  };
}

/** A gate and four stretches of wall, one to a side, all standing. */
function fortifications(gateSide: Facing): Structure[] {
  return [
    { kind: STRUCTURE.gate, side: facingCode(gateSide), hp: GATE_HP },
    ...FACINGS.map((side) => ({ kind: STRUCTURE.wall, side: facingCode(side), hp: WALL_HP })),
  ];
}

/** The id of the settlement standing on a site: how a Stronghold is found in the economy. */
export function settlementIdAt(economy: Economy, site: Site): number {
  const settlement = economy.settlements.find(
    (candidate) => candidate.x === site.x && candidate.y === site.y,
  );
  if (settlement === undefined) {
    throw new RangeError(`no settlement stands at (${String(site.x)}, ${String(site.y)})`);
  }

  return settlement.id;
}

/** Which side of `from` a Stronghold at `to` lies on: the way an enemy comes from. */
function sideToward(from: Site, to: Site): Facing {
  const across = to.x - from.x;
  const down = to.y - from.y;

  if (Math.abs(across) >= Math.abs(down)) return across >= 0 ? 'east' : 'west';

  return down >= 0 ? 'south' : 'north';
}

/** Puts an army at a settlement's walls on one of the two paths of a Siege. */
function laySiege(
  world: SiegeWorld,
  settlementId: number,
  faction: Faction,
  ids: readonly number[],
  path: SiegeCode,
  routes: RouteCache,
): boolean {
  const front = frontAt(world.siege, settlementId);
  const settlement = world.economy.settlements[settlementId];
  if (front === undefined || settlement === undefined) return false;

  const owner = factionCode(faction);
  if (settlement.owner === owner) return false;
  if (path === SIEGE.assault && !canAssault(faction)) return false;
  // An open settlement is not stormed: there is no wall to break, and holding
  // its centre is the whole of taking it.
  if (path === SIEGE.assault && !isWalled(front)) return false;
  // Nothing to starve in ground nobody holds: an open settlement nobody has taken
  // is taken by standing on it, not by cutting supply it does not use.
  if (path === SIEGE.blockade && settlement.owner === UNOWNED) return false;

  const squads = orderedSquads(world.economy, owner, ids);
  if (squads.length === 0) return false;

  for (const squad of squads) {
    orderSquadTo(world.map, squad, { x: settlement.x, y: settlement.y }, routes);
  }

  front.besieger = owner;
  front.path = path;

  return true;
}

/** Puts Squads inside a walled settlement its Faction holds, off the field. */
function takeUpGarrison(
  world: SiegeWorld,
  settlementId: number,
  faction: Faction,
  ids: readonly number[],
): boolean {
  const front = frontAt(world.siege, settlementId);
  const settlement = world.economy.settlements[settlementId];
  if (front === undefined || settlement === undefined) return false;
  if (settlement.owner !== factionCode(faction)) return false;
  // A garrison mans walls, and an open settlement has none: an open one is held
  // in the field, by the Squads standing on its centre.
  if (!isWalled(front)) return false;

  let garrisoned = false;

  for (const squad of orderedSquads(world.economy, factionCode(faction), ids)) {
    if (!inReach(squad, settlement, SIEGE_RADIUS)) continue;

    squad.garrison = settlement.id;
    squad.x = settlement.x;
    squad.y = settlement.y;
    squad.steps = [];
    squad.wait = 0;
    squad.refused = NO_REFUSAL;
    garrisoned = true;
  }

  return garrisoned;
}

/** One front's tick: whether the Siege still stands, and what it does about it. */
function resolveFront(world: SiegeWorld, front: Front, tick: number): void {
  if (front.besieger === UNOWNED) return;

  const settlement = world.economy.settlements[front.settlement];
  if (settlement === undefined) return;

  if (settlement.owner === front.besieger) {
    stand(front);
    return;
  }

  const besiegers = besiegersOf(world, front);
  // Nobody is at the walls any more: the Siege is over — unless the army that
  // was ordered to lay it is still on the road, in which case the order stands.
  if (besiegers.length === 0) {
    if (!onTheWay(world, front, settlement)) stand(front);
    return;
  }

  if (front.path === SIEGE.blockade && relieved(world, settlement)) {
    stand(front);
    return;
  }

  if (front.path === SIEGE.assault && tick % ASSAULT_TICKS === 0) {
    assaultRound(world, front, besiegers, tick);
  }
}

/** Lifts a Siege: nobody is besieging, so the path, the ram and the count are gone. */
function stand(front: Front): void {
  front.besieger = UNOWNED;
  front.path = SIEGE.none;
  front.ram = 0;
  front.ramTicks = 0;
  front.holder = UNOWNED;
  front.hold = 0;
}

/** The Faction's field Squads close enough to a settlement to be at its walls. */
function besiegersOf(world: SiegeWorld, front: Front): readonly Squad[] {
  const settlement = world.economy.settlements[front.settlement];
  if (settlement === undefined || front.besieger === UNOWNED) return [];

  return world.economy.squads.filter(
    (squad) =>
      squad.owner === front.besieger &&
      squad.garrison === FIELD &&
      !isRouting(squad) &&
      inReach(squad, settlement, SIEGE_RADIUS),
  );
}

/**
 * Whether the army a Siege was ordered with is still marching to it.
 *
 * An `assault` or a `blockade` names the Squads and the place, and the Squads
 * may have a way to walk first: the order is to go there and do it, not only to
 * do it if already there. A Siege whose besiegers are neither at the walls nor
 * on the road to them is a Siege nobody is conducting, and it lapses.
 */
function onTheWay(world: SiegeWorld, front: Front, settlement: Settlement): boolean {
  if (front.besieger === UNOWNED) return false;

  return world.economy.squads.some((squad) => {
    if (squad.owner !== front.besieger || squad.garrison !== FIELD || isRouting(squad)) return false;

    const goal = goalOf(squad);

    return goal !== null && goal.x === settlement.x && goal.y === settlement.y;
  });
}

/**
 * Whether the besieged Faction's field army has come to break a Blockade.
 *
 * A *field* army, and not the garrison: the men inside are the ones being
 * starved, and only men outside the ring can threaten it. Presence is enough —
 * an army in the field within `RELIEF_RADIUS` of the place is an army the
 * besiegers have to answer, and the fight it starts is `combat.ts`'s when it
 * closes.
 */
function relieved(world: SiegeWorld, settlement: Settlement): boolean {
  if (settlement.owner === UNOWNED) return false;

  return world.economy.squads.some(
    (squad) =>
      squad.owner === settlement.owner &&
      squad.garrison === FIELD &&
      !isRouting(squad) &&
      inReach(squad, settlement, RELIEF_RADIUS),
  );
}

/** One round of an Assault: the ram, the walls, the price of standing under them. */
function assaultRound(
  world: SiegeWorld,
  front: Front,
  besiegers: readonly Squad[],
  tick: number,
): void {
  if (!breached(front)) {
    if (layRamIfNeeded(world, front)) {
      // The ram is being built: the men who are building it are under the walls.
    } else if (front.ramTicks > 0) {
      front.ramTicks = Math.max(0, front.ramTicks - ASSAULT_TICKS);
    } else {
      batter(world, front);
    }

    // The walls are worked at whether the ram is up or not; the men are worked
    // at until it is, because a ram is what shields an assault.
    chipWall(front);
    if (!rammed(front)) punish(world, besiegers, tick);
  }

  if (breached(front)) storm(world, front, besiegers, tick);
}

/**
 * Lays a ram down on the spot, if the besieging Faction can pay for one.
 *
 * Built where the army is, not wherever it was recruited: paying for it out of
 * the Faction's one treasury (rather than a settlement's stock) is what "on the
 * spot" costs, and it is why a long siege is expensive in denarii as well as in
 * men. A ram the garrison has broken is laid again the same way if the Faction
 * can still pay for it.
 */
function layRamIfNeeded(world: SiegeWorld, front: Front): boolean {
  if (front.ram > 0 || front.ramTicks > 0) return false;

  const available = world.economy.treasuries[front.besieger] ?? 0;
  if (available < RAM_COST) return false;

  world.economy.treasuries[front.besieger] = available - RAM_COST;
  front.ram = RAM_HP;
  front.ramTicks = RAM_BUILD_TICKS;

  return true;
}

/** Whether a ram is built and at work: the round the men under the wall are shielded. */
function rammed(front: Front): boolean {
  return front.ram > 0 && front.ramTicks === 0;
}

/** The built ram's round: it takes the gate down, and the garrison takes it apart. */
function batter(world: SiegeWorld, front: Front): void {
  const gate = gateOf(front);
  if (gate === undefined || front.ram <= 0) return;

  gate.hp = Math.max(0, gate.hp - RAM_DAMAGE);
  front.ram = Math.max(0, front.ram - ramDefence(world, front));
}

/**
 * What the garrison does to a ram in one round: the files it can reach it with.
 *
 * The ram is vulnerable or the Assault has no decision in it, and the number it
 * is vulnerable to is the size of the garrison: one Squad's twelve files take
 * twenty rounds to break a ram, and the gate needs eight, so a ram survives a
 * lone Squad — but three Squads break it in seven rounds and the gate stands.
 */
function ramDefence(world: SiegeWorld, front: Front): number {
  const garrison = garrisonOf(world.economy, front.settlement).filter((squad) => !isRouting(squad));
  if (garrison.length === 0) return 0;

  const files = garrison.reduce((total, squad) => total + frontage(squad), 0);

  return Math.max(1, Math.floor(files / RAM_FILES_PER_BLOW));
}

/** The escalade's round: the first stretch of wall still standing is worked at. */
function chipWall(front: Front): void {
  const wall = front.structures.find(
    (structure) => structure.kind === STRUCTURE.wall && structure.hp > 0,
  );
  if (wall === undefined) return;

  wall.hp = Math.max(0, wall.hp - ESCALADE_DAMAGE);
}

/** What standing under a wall costs the men doing it: men, and nerve. */
function punish(world: SiegeWorld, besiegers: readonly Squad[], tick: number): void {
  const fallen: Fallen[] = [];

  for (const squad of besiegers) {
    const before = squad.strength;

    squad.strength = Math.max(0, squad.strength - WALL_ASSAULT_LOSS);
    squad.morale = Math.max(BREAKING_MORALE, squad.morale - WALL_SHOCK);
    if (squad.morale <= BREAKING_MORALE) squad.routing = ROUTING.routed;

    const lost = before - squad.strength;
    if (lost > 0) {
      fallen.push({ x: squad.x, y: squad.y, owner: squad.owner, type: squad.type, men: lost });
    }
  }

  if (fallen.length > 0) recordCasualties(world.economy, fallen, tick);
  world.economy.squads = world.economy.squads.filter((squad) => squad.strength > 0);
}

/**
 * The storm through a breach: the men who came over the wall against the men who
 * man it, as one round of the same exchange any two Squads in contact fight.
 *
 * The differences from an open field are exactly two, and both are the wall. A
 * garrison that breaks **surrenders** — it has nowhere to run that is not
 * through the enemy — so it leaves the list instead of routing. And an attacker
 * that breaks is routed like any other, because it has a country behind it.
 */
function storm(world: SiegeWorld, front: Front, besiegers: readonly Squad[], tick: number): void {
  const defenders = garrisonOf(world.economy, front.settlement).filter((squad) => !isRouting(squad));
  if (defenders.length === 0 || besiegers.length === 0) return;

  const pairs = besiegers.flatMap((attacker) =>
    defenders.map((defender) => [attacker, defender] as const),
  );
  const wounds = woundsOf(pairs, world.map);
  const fallen: Fallen[] = [];

  for (const squad of [...besiegers, ...defenders]) {
    const wound = wounds.get(squad);
    if (wound === undefined) continue;

    const before = squad.strength;
    const breaking = squad.morale - wound.morale <= BREAKING_MORALE;
    const defending = defenders.includes(squad);

    squad.morale = Math.max(BREAKING_MORALE, squad.morale - wound.morale);

    if (defending && breaking) {
      squad.strength = 0;
    } else {
      squad.strength = Math.max(breaking ? 1 : 0, squad.strength - wound.men);
      if (breaking) squad.routing = ROUTING.routed;
    }

    const lost = before - squad.strength;
    if (lost > 0) {
      fallen.push({ x: squad.x, y: squad.y, owner: squad.owner, type: squad.type, men: lost });
    }
  }

  if (fallen.length > 0) recordCasualties(world.economy, fallen, tick);
  world.economy.squads = world.economy.squads.filter((squad) => squad.strength > 0);
}

/**
 * A capture check: whether the Faction holding a settlement's centre has held it
 * long enough to have taken it.
 *
 * Holding means standing on the centre tile with the field, uncontested, and the
 * count is continuous: a Faction that loses the tile — or whose enemy arrives on
 * it — starts again from nothing. A walled settlement is only open to this once
 * it has been breached; an open one has no such gate, which is the whole of "a
 * minor settlement is captured by holding its centre".
 */
function captureRound(world: SiegeWorld): void {
  for (const front of world.siege.fronts) {
    const settlement = world.economy.settlements[front.settlement];
    if (settlement === undefined) continue;

    const holder = holderOf(world.economy, settlement);
    if (holder === UNOWNED || !openTo(front)) {
      front.holder = UNOWNED;
      front.hold = 0;
      continue;
    }

    if (front.holder !== holder) {
      front.holder = holder;
      front.hold = 0;
    }

    front.hold += 1;
    if (front.hold < CAPTURE_HOLDS) continue;

    take(world, front, settlement, holder, breached(front) ? SIEGE.assault : SIEGE.none);
  }
}

/** The Faction whose field Squads alone hold a settlement's centre, or `UNOWNED`. */
function holderOf(economy: Economy, settlement: Settlement): number {
  let holder = UNOWNED;

  for (const squad of economy.squads) {
    if (squad.garrison !== FIELD || isRouting(squad)) continue;
    if (squad.x !== settlement.x || squad.y !== settlement.y) continue;

    // Two Factions on the centre is a fight for it, and nobody is holding it.
    if (holder !== UNOWNED && holder !== squad.owner) return UNOWNED;
    holder = squad.owner;
  }

  // A Faction's own army standing in its own settlement is not taking it.
  return holder === settlement.owner ? UNOWNED : holder;
}

/** Whether a settlement can be taken by holding its centre at all. */
function openTo(front: Front): boolean {
  return !isWalled(front) || breached(front);
}

/**
 * Takes a settlement: the owner changes, and nothing is razed.
 *
 * Its people, its works and its stocks stay — "nothing is razed in v1" is the
 * ticket's own rule, and it is also what makes taking a settlement worth doing.
 * What does not survive is the garrison of the Faction that held it: the men
 * inside are the ones who surrendered.
 */
function take(
  world: SiegeWorld,
  front: Front,
  settlement: Settlement,
  taker: number,
  path: SiegeCode,
): void {
  settlement.owner = taker;
  world.economy.squads = world.economy.squads.filter((squad) => squad.garrison !== settlement.id);

  stand(front);
  front.taken = taker;
  front.takenPath = path;
}

/** One Season of a Blockade: the granary empties, the people go, and the garrison's nerve. */
function starve(world: SiegeWorld, front: Front, settlement: Settlement): void {
  const grain = Math.max(0, stockAt(settlement.stocks, RESOURCE.grain) - BLOCKADE_GRAIN_LOSS);
  settlement.stocks[RESOURCE.grain] = grain;
  settlement.population = Math.max(1, settlement.population - BLOCKADE_POPULATION_LOSS);

  for (const squad of garrisonOf(world.economy, settlement.id)) {
    squad.morale = Math.max(BREAKING_MORALE, squad.morale - BLOCKADE_MORALE_LOSS);
  }

  // A garrison whose nerve has gone is not a garrison: it slips away in the
  // night, and the walls are left to the people who are still hungry.
  world.economy.squads = world.economy.squads.filter(
    (squad) => squad.garrison !== settlement.id || squad.morale > BREAKING_MORALE,
  );

  const empty = stockAt(settlement.stocks, RESOURCE.grain) === 0;
  if (empty && garrisonOf(world.economy, settlement.id).length === 0) {
    take(world, front, settlement, front.besieger, SIEGE.blockade);
  }
}

/** The front of a Stronghold that has fallen, or `undefined` while both stand. */
function takenStronghold(siege: Siege): Front | undefined {
  for (const id of siege.strongholds) {
    const front = siege.fronts[id];
    if (front !== undefined && front.taken !== UNOWNED) return front;
  }

  return undefined;
}

/** Why a Stronghold's fall ended the Match: which one, and which path took it. */
function strongholdReason(front: Front): VictoryReason {
  return {
    kind: 'stronghold',
    stronghold: front.settlement,
    path: front.takenPath === SIEGE.blockade ? 'blockade' : 'assault',
  };
}

/** The Faction with neither settlements nor Squads left, or `undefined` while both have both. */
function beatenFaction(economy: Economy): number | undefined {
  return [0, 1].find(
    (owner) =>
      !economy.settlements.some((settlement) => settlement.owner === owner) &&
      !economy.squads.some((squad) => squad.owner === owner),
  );
}

/** One front, as its holder or its besieger reads it. */
function visibleFront(economy: Economy, front: Front): VisibleFront {
  return {
    settlement: front.settlement,
    structures: front.structures.map((structure) => ({
      kind: structureKindOf(structure.kind),
      side: facingOfSide(structure.side),
      hp: structure.hp,
      standing: structure.hp > 0,
    })),
    breached: breached(front),
    siege: front.path === SIEGE.none ? null : pathOf(front.path),
    besieger: front.besieger === UNOWNED ? null : factionOf(front.besieger),
    ram: front.ram > 0 || front.ramTicks > 0
      ? { hp: front.ram, remaining: front.ramTicks, built: front.ramTicks === 0 }
      : null,
    hold: front.hold,
    garrison: garrisonOf(economy, front.settlement).length,
  };
}

/** The word for a structure code. @throws RangeError when it names none. */
function structureKindOf(code: number): StructureKind {
  const kind = STRUCTURE_KINDS[code];
  if (kind === undefined) throw new RangeError(`${String(code)} is not a structure a settlement has`);

  return kind;
}

/** The word for a Siege code. @throws RangeError when it names none, or names none at all. */
function pathOf(code: number): SiegePath {
  if (code === SIEGE.assault) return 'assault';
  if (code === SIEGE.blockade) return 'blockade';

  throw new RangeError(`${String(code)} is not a path of a Siege`);
}

/** The facing a side code names, refused loudly rather than reported as `undefined`. */
function facingOfSide(code: number): Facing {
  const side = FACINGS[code];
  if (side === undefined) throw new RangeError(`${String(code)} is not a side of a settlement`);

  return side;
}

/** Whether a Squad is within `radius` tiles of a settlement, counting Chebyshev. */
function inReach(squad: Site, settlement: Site, radius: number): boolean {
  return (
    Math.max(Math.abs(squad.x - settlement.x), Math.abs(squad.y - settlement.y)) <= radius
  );
}
