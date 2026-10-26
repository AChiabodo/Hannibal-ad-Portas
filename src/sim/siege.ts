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
import { bearingOf, figuresOf, stockAt, squadTypeOf } from '../content/index.ts';
import { fortificationHp, garrisonCapacity } from '../content/fortifications.ts';
import { bindSiegeSpace, siteRect, invalidateSpace, canOccupy, occupiedGround, squadGround, coreOf } from './settlement-space.ts';
import { containsTile, settlementLayout, intersects, type GroundRect } from '../content/settlement-layout.ts';
import { perimeterDistance, outsideCore, insideCore, rectDistance } from './settlement-siege-geometry.ts';
import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import { advanceGarrisonJourneys, requestGarrison } from './settlement-access.ts';
import { TICK_HZ } from './clock.ts';
import type { Command, SiegePath } from './command.ts';
import { bearing, BREAKING_MORALE, woundsOf } from './combat.ts';
import type { MatchSetup, VictoryReason } from './driver.ts';
import {
  economyMatchRules,
  eyesOfEconomy,
  observeEconomy,
  stepEconomyWorld,
  type EconomyVisible,
  type EconomyWorld,
  type VisibleSquad,
} from './economy-match.ts';
import { UNOWNED, type Economy, type Settlement, type Squad, type Supplied } from './economy.ts';
import { factionCode, factionOf, type Faction } from './faction.ts';
import { createFogs, eyeCovers, viewOf, type Fog, type FogView } from './fog.ts';
import { refreshSiegeFog, siegeContacts, type KnownContact } from './siege-fog.ts';
import { settlementAppearances } from './settlement-knowledge.ts';
import { RESOURCE, type MapGrid, type Site } from './map.ts';
import type { MatchRules } from './match.ts';
import { goalOf, orderedSquads, orderSquadTo, routeCacheFor } from './movement.ts';
import { recordCasualties, type Fallen } from './residue.ts';
import type { RouteCache } from './route.ts';
import {
  FACINGS,
  facingCode,
  facingOf,
  formationOf,
  FIELD,
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

/**
 * How much damage the men at the walls do to them in one round of escalade, for
 * a full body of `ESCALADE_BEARING`.
 *
 * Working a wall is a *body's* work and not a Squad's: `escaladeDamage` reads the
 * whole besieging force, so splitting it into more Squads neither speeds the work
 * up nor puts a second crew on a second stretch of it — and a lone Squad's
 * handful of men no longer chips a wall as fast as an army.
 */
export const ESCALADE_DAMAGE = 3;

/** The bearing whose escalade is worth the whole of `ESCALADE_DAMAGE`: a full line. */
export const ESCALADE_BEARING = 120;

/**
 * How many men the walls cost a besieging body of `ESCALADE_BEARING` in a round
 * it is under them, without a ram: one man for every twenty-four brought.
 *
 * A rate and not a count: each Squad pays its own men's share (`wallLoss`), so
 * five 24-man bodies pay exactly what one 120-man body pays — the walls are as
 * dangerous to a body of men as they are to the body those men could have been.
 * One man per twenty-four is what makes that exact: the smallest real size is
 * twenty-four, so no legal body has its share floored away, and the largest pays
 * five men a round for standing under a wall without a ram.
 */
export const WALL_ASSAULT_LOSS = 5;

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

/**
 * How much bearing it takes on the walls to take one point off the ram in a
 * round: sixteen, so a 48-man body of spearmen works three points off it a round
 * and a 120-man body seven.
 *
 * Bearing and not files, for #66's reason: the files a garrison stands in
 * saturate at twelve, so counting them let a Player put four 24-man Squads behind
 * a gate and defend it five times as well as the one 96-man body they add up to.
 * Sixteen is chosen so the shipped numbers do not move: four Carthaginian 48-man
 * bodies still break a ram in five rounds and one still takes twenty
 * (ADR-0028).
 */
export const RAM_BEARING_PER_BLOW = 16;

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
 * How much harder a ring that outweighs the garrison starves it, at most.
 *
 * A blockade is a body of men against a body of men, so the Season it costs is
 * scaled by how many times the besiegers' bearing outweighs the garrison's
 * (`blockadePressure`): a ring that is a match for the walls starves them at the
 * rate `BLOCKADE_GRAIN_LOSS` and its neighbours state, and one that outweighs
 * them starves them twice as fast. It is capped at two because a town eats at the
 * rate of the people in it, however many men are camped outside the gate, and it
 * never falls below one because a ring that is *thinner* than the garrison still
 * cuts the roads.
 */
export const BLOCKADE_PRESSURE_CAP = 2;

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
  /** Last Tier applied to these structures, so growth preserves existing damage. */
  tier?: number;
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
  readonly fog: Readonly<Record<Faction, Fog>>;
  /** The walls, the rams and the two ways of taking a settlement. */
  readonly siege: Siege;
}

/** One piece of a fortification, as the Faction that can see it reads it. */
export interface VisibleStructure {
  readonly maxHp?: number;
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
  readonly garrisonMen?: number;
  readonly garrisonCapacity?: number;
}

/** What a Faction may know of a Siege: its own walls, and the ones it is at. */
export interface SiegeVisible extends EconomyVisible {
  readonly appearances?: readonly ObservedSettlement[];
  readonly fog: FogView;
  readonly contacts: readonly KnownContact[];
  /** Enemy field Squads currently in ordinary vision, with no private economic or combat facts. */
  readonly enemies: readonly {
    readonly id: number; readonly type: string; readonly x: number; readonly y: number;
    /** Present on canonical Observations; omitted by older external scenario fixtures. No private condition or orders. */
    readonly appearance?: Pick<VisibleSquad, 'men' | 'capacity' | 'figures' | 'formation' | 'facing'>;
  }[];
  /** The fronts this Faction holds, is besieging, or has an eye on (ADR-0020). */
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

  return bindSiegeSpace(map, {
    fronts: economy.settlements.map((settlement) => {
      const side = strongholds.indexOf(settlement.id);
      const gateSide = side === 0 ? sideToward(rome, carthage) : sideToward(carthage, rome);

      return frontOf(settlement, side >= 0 ? gateSide : undefined);
    }),
    strongholds,
  });
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
  for (const front of world.siege.fronts) {
    const tier = world.economy.settlements[front.settlement]?.tier ?? 1;
    const previous = front.tier ?? 1;
    if (tier === previous) continue;
    for (const structure of front.structures) {
      const gate = structure.kind === STRUCTURE.gate;
      if (structure.hp > 0) structure.hp = Math.ceil(structure.hp * fortificationHp(tier, gate) / fortificationHp(previous, gate));
    }
    front.tier = tier;
  }
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
    const besiegers = besiegersOf(world, front);
    if (besiegers.length === 0) {
      if (!onTheWay(world, front, settlement)) stand(front);
      continue;
    }

    starve(world, front, settlement, besiegers);
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

    advanceGarrisonJourneys(world, (squad, target) => orderSquadTo(world.map, squad, target, routes, true));

    besiege(world, tick);

    // One Season of blockade for every boundary the clock crossed — normally one,
    // and more only for a step that had a catch-up to make.
    for (let crossed = 0; crossed < changes.length; crossed += 1) starveBlockades(world);
    refreshSiegeFog(world, tick + 1);
  },
};

/** Opens the Siege world a seed describes: the economy's Match with its walls. */
export function createSiegeWorld(seed: number): SiegeWorld {
  const world = economyMatchRules.createWorld(seed);

  const complete = { ...world, siege: createSiege(world.map, world.economy), fog: createFogs() };
  refreshSiegeFog(complete, 0);
  return complete;
}

/**
 * What a Faction may see of a Siege: the fronts of the settlements it holds, of
 * the ones it is besieging, and of the ones one of its own eyes covers — and no
 * fourth kind (ADR-0020).
 *
 * A wall is not a secret from the men in front of it or the men behind it, and
 * neither is the ram either of them built; a Stronghold nobody has marched on is
 * another Faction's business, and is not in the projection at all. An open
 * settlement is no exception: no wall to keep a secret is not a licence to skip
 * an eye, because a front read for free would be knowledge the fog beside it
 * never recorded. The garrison is reported as a count rather than a list of ids:
 * what is on the walls is visible, but which Squads a Faction keeps is in that
 * Faction's own `squads`.
 */
export const observeSiege: MatchSetup<SiegeWorld, SiegeVisible>['observe'] = (world, faction) => {
  const seen = observeEconomy(world, faction);
  const owner = factionCode(faction);
  const eyes = eyesOfEconomy(world, faction);

  return {
    ...seen,
    appearances: settlementAppearances(world.fog[faction]),
    fog: viewOf(world.fog[faction]),
    contacts: siegeContacts(world, faction),
    enemies: world.economy.squads
      .filter((squad) => squad.owner !== owner && squad.garrison === FIELD && eyes.some((eye) => eyeCovers(eye, squad)))
      .map((squad) => {
        const type = squadTypeOf(squad.type);
        return { id: squad.id, type: type?.id ?? 'unknown', x: squad.x, y: squad.y,
          appearance: { men: squad.strength, capacity: squad.capacity,
            figures: type === undefined ? squad.strength : figuresOf(type, squad.strength),
            formation: formationOf(squad.formation), facing: facingOf(squad.facing) } };
      }),
    fronts: world.siege.fronts
      .filter((front) => {
        const settlement = world.economy.settlements[front.settlement];
        if (settlement === undefined) return false;

        return settlement.owner === owner || front.besieger === owner ||
          eyes.some((eye) => eyeCovers(eye, settlement));
      })
      .map((front) => filteredFront(world, front, owner, eyes)),
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
    tier: settlement.tier,
    settlement: settlement.id,
    structures: gateSide === undefined ? [] : fortifications(gateSide, settlement.tier),
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
function fortifications(gateSide: Facing, tier = 1): Structure[] {
  return [
    { kind: STRUCTURE.gate, side: facingCode(gateSide), hp: fortificationHp(tier, true) },
    ...FACINGS.map((side) => ({ kind: STRUCTURE.wall, side: facingCode(side), hp: fortificationHp(tier, false) })),
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

  const reserved: GroundRect[] = [];
  let accepted = false;
  for (const squad of squads) {
    const target = path === SIEGE.assault && breached(front) ? { x: settlement.x, y: settlement.y } :
      siegePosition(world, settlement, squad, reserved);
    if (target !== undefined) {
      orderSquadTo(world.map, squad, target, routes);
      if (squad.refused !== -1) continue;
      reserved.push(squadGround(squad, target.x, target.y));
      accepted = true;
    }
  }
  if (!accepted) return false;

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
  return requestGarrison(world, settlementId, factionCode(faction), ids,
    (squad, target) => orderSquadTo(world.map, squad, target, routeCacheFor(world.map), true));
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
      (front.path === SIEGE.assault && breached(front) && insideCore(world.economy, settlement, squad) ||
        outsideCore(world.economy, settlement, squad) && perimeterDistance(world.economy, settlement, squad) <= SIEGE_RADIUS),
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

    if (goal === null) return false;
    const body = squadGround(squad, goal.x, goal.y);
    const core = coreOf(world.economy, settlement);
    return !intersects(core, body) && rectDistance(core, body) <= SIEGE_RADIUS ||
      front.path === SIEGE.assault && breached(front) && containsTile(core, goal.x, goal.y);
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

  const relief = world.economy.squads.filter(
    (squad) =>
      squad.owner === settlement.owner &&
      squad.garrison === FIELD &&
      !isRouting(squad) &&
      outsideCore(world.economy, settlement, squad) && perimeterDistance(world.economy, settlement, squad) <= RELIEF_RADIUS,
  );
  const front = frontAt(world.siege, settlement.id);
  return front !== undefined && forceOf(relief) > forceOf(besiegersOf(world, front));
}

/** Distinct exterior destinations keep a siege army off roofs, walls and other bodies. */
function siegePosition(world: SiegeWorld, site: Settlement, squad: Squad, reserved: readonly GroundRect[]): Site | undefined {
  if (outsideCore(world.economy, site, squad) && perimeterDistance(world.economy, site, squad) <= SIEGE_RADIUS) return squad;
  const core = coreOf(world.economy, site);
  const options: Site[] = [];
  for (let y = site.y - 16; y <= site.y + 16; y += 1) {
    for (let x = site.x - 16; x <= site.x + 16; x += 1) {
      const body = squadGround(squad, x, y);
      if (intersects(core, body) || rectDistance(core, body) > SIEGE_RADIUS ||
        !canOccupy(world.map, squad, x, y) || occupiedGround(world.economy, body, squad.id) ||
        reserved.some((other) => intersects(body, other))) continue;
      options.push({ x, y });
    }
  }
  return options.sort((a, b) => Math.max(Math.abs(a.x - squad.x), Math.abs(a.y - squad.y)) -
    Math.max(Math.abs(b.x - squad.x), Math.abs(b.y - squad.y)) || a.y - b.y || a.x - b.x)[0];
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
    chipWall(front, besiegers);
    if (!rammed(front)) punish(world, besiegers, tick);
  }

  if (breached(front)) {
    const site = world.economy.settlements[front.settlement];
    if (site === undefined) return;
    for (const squad of besiegers) {
      if (!insideCore(world.economy, site, squad) && goalOf(squad) === null)
        orderSquadTo(world.map, squad, site, routeCacheFor(world.map));
    }
    storm(world, front, besiegers.filter((squad) => insideCore(world.economy, site, squad)), tick);
  }
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

  return Math.max(1, Math.floor(forceOf(garrison) / RAM_BEARING_PER_BLOW));
}

/**
 * The escalade's round: the first stretch of wall still standing is worked at.
 *
 * The damage is the besieging force's, capped at what one full body of men can
 * do to a wall in a round (`escaladeDamage`): ten thousand men do not bring a
 * wall down ten times faster than a thousand, because only so many can stand at
 * it, and one man does not bring it down at a line's speed.
 */
function chipWall(front: Front, besiegers: readonly Squad[]): void {
  const wall = front.structures.find(
    (structure) => structure.kind === STRUCTURE.wall && structure.hp > 0,
  );
  if (wall === undefined) return;

  wall.hp = Math.max(0, wall.hp - escaladeDamage(besiegers));
}

/** What a body of men works off a wall in one round: its share of a full line's, capped at it. */
export function escaladeDamage(besiegers: readonly Squad[]): number {
  const force = forceOf(besiegers);

  return Math.max(1, Math.min(ESCALADE_DAMAGE, Math.floor((force * ESCALADE_DAMAGE) / ESCALADE_BEARING)));
}

/**
 * What the walls cost one besieging Squad in a round: its own men's share of a
 * full line's.
 *
 * Counted on the men the body was **raised** with and not on the men still
 * standing, which is the difference between the walls and a fight: a fight is
 * two bodies wearing each other down, and a wall is a wall. A body that has been
 * bled by the wall does not become safer to stand under, and counting survivors
 * would have made a 120-man body pay five, four, four, four… while the five
 * 24-man bodies that add up to it paid one each — the same men, paying different
 * blood for the same wall.
 */
export function wallLoss(squad: Squad): number {
  const type = squadTypeOf(squad.type);
  // The men it was raised with, and not its survivors: see above.
  const raised = type === undefined ? squad.capacity : bearingOf(type, squad.capacity);

  return Math.max(1, Math.floor((raised * WALL_ASSAULT_LOSS) / ESCALADE_BEARING));
}

/** The whole force of a body of Squads: the one reading every Siege rule is counted from. */
export function forceOf(squads: readonly Squad[]): number {
  return squads.reduce((total, squad) => total + bearing(squad), 0);
}

/** What standing under a wall costs the men doing it: men, and nerve. */
function punish(world: SiegeWorld, besiegers: readonly Squad[], tick: number): void {
  const fallen: Fallen[] = [];

  for (const squad of besiegers) {
    const before = squad.strength;

    squad.strength = Math.max(0, squad.strength - wallLoss(squad));
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
    if (holder === UNOWNED || !openTo(front) || garrisonOf(world.economy, settlement.id).some((squad) => !isRouting(squad))) {
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

/**
 * The Faction holding a settlement's centre, by force, or `UNOWNED`.
 *
 * Holding is a question about **men on the tile** and not about how they are
 * divided: the bearing each Faction has standing there is added up, the larger
 * body holds the place, and an even contest holds nothing. Two Factions on the
 * centre with nothing to choose between them is a fight for it and nobody has
 * it; a 120-man body against a 24-man one has it outright, which is what "the
 * weaker contingent is brushed aside" means and what a count of Squads could not
 * say. A body of nobody still takes an undefended centre — the one thing a small
 * contingent is good for.
 */
function holderOf(economy: Economy, settlement: Settlement): number {
  const force = new Map<number, number>();
  let present = 0;

  for (const squad of economy.squads) {
    if (squad.garrison !== FIELD || isRouting(squad)) continue;
    const square = siteRect(economy, settlement, settlementLayout(settlement.id < 2 ? 'stronghold' : 'settlement').capture);
    if (!containsTile(square, squad.x, squad.y)) continue;

    present += 1;
    force.set(squad.owner, (force.get(squad.owner) ?? 0) + bearing(squad));
  }

  if (present === 0) return UNOWNED;

  // The larger body holds the ground; the economy's own order breaks a tie by id.
  const ranked = [...force].sort(([one, left], [other, right]) => right - left || one - other);
  const best = ranked[0];
  if (best === undefined) return UNOWNED;

  const [owner, strongest] = best;
  // A tie is a contest: nobody holds the ground being fought over. And a
  // Faction's own army standing in its own settlement is not taking it.
  const shared = ranked.filter(([, other]) => other === strongest).length > 1;
  if (shared || owner === settlement.owner) return UNOWNED;

  return owner;
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
  const previous = settlement.owner;
  settlement.origin ??= previous === 1 ? 1 : 0;
  for (const work of settlement.works) work.origin ??= settlement.origin;
  settlement.owner = taker;
  world.economy.pending = world.economy.pending?.filter((order) => order.settlement !== settlement.id || order.owner !== previous) ?? [];
  invalidateSpace(world.economy);
  world.economy.squads = world.economy.squads.filter((squad) => squad.garrison !== settlement.id);

  stand(front);
  front.taken = taker;
  front.takenPath = path;
}

/**
 * One Season of a Blockade: the granary empties, the people go, and the garrison's
 * nerve — all at the rate the ring's force buys (`blockadePressure`).
 */
function starve(world: SiegeWorld, front: Front, settlement: Settlement, besiegers: readonly Squad[]): void {
  const pressure = blockadePressure(world.economy, settlement, besiegers);
  const grain = Math.max(0, stockAt(settlement.stocks, RESOURCE.grain) - BLOCKADE_GRAIN_LOSS * pressure);
  settlement.stocks[RESOURCE.grain] = grain;
  settlement.population = Math.max(1, settlement.population - BLOCKADE_POPULATION_LOSS * pressure);

  for (const squad of garrisonOf(world.economy, settlement.id)) {
    squad.morale = Math.max(BREAKING_MORALE, squad.morale - BLOCKADE_MORALE_LOSS * pressure);
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

/**
 * How hard a ring starves the place it is round: the besiegers' bearing against
 * the garrison's, in whole multiples and inside `BLOCKADE_PRESSURE_CAP`.
 *
 * An empty wall has no garrison to outweigh, and a ring that outweighs nobody
 * starves the town at the stated rate and no faster: the men inside are the ones
 * who eat, and there is no faster way to empty a granary than the people who were
 * going to empty it anyway.
 */
export function blockadePressure(
  economy: Economy,
  settlement: Settlement,
  besiegers: readonly Squad[],
): number {
  const held = forceOf(garrisonOf(economy, settlement.id));
  if (held <= 0) return 1;

  return Math.min(BLOCKADE_PRESSURE_CAP, Math.max(1, Math.floor(forceOf(besiegers) / held)));
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
      maxHp: fortificationHp(front.tier ?? 1, structure.kind === STRUCTURE.gate),
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
    garrisonMen: garrisonOf(economy, front.settlement).reduce((men, squad) => men + squad.strength, 0),
    garrisonCapacity: garrisonCapacity(economy.settlements[front.settlement]?.tier ?? 1),
  };
}

/** Seeing one wall cannot reveal a breach, ram or defenders on the opposite side. */
function filteredFront(world: SiegeWorld, front: Front, owner: number, eyes: ReturnType<typeof eyesOfEconomy>): VisibleFront {
  const full = visibleFront(world.economy, front);
  const site = world.economy.settlements[front.settlement];
  if (site === undefined || site.owner === owner) return full;
  const sees = (x: number, y: number) => eyes.some((eye) => eyeCovers(eye, { x, y }));
  const structures = full.structures.filter((structure) => {
    const side = FACINGS.indexOf(structure.side);
    for (let tangent = -7; tangent <= 7; tangent += 1) {
      if (structure.kind === 'gate' && Math.abs(tangent) > 1) continue;
      const x = site.x + (side === 1 ? 7 : side === 3 ? -7 : tangent);
      const y = site.y + (side === 0 ? -7 : side === 2 ? 7 : tangent);
      if (sees(x, y)) return true;
    }
    return false;
  });
  const ramRect = siteRect(world.economy, site, { x: -1, y: 9, width: 3, height: 2 });
  let ramSeen = false;
  for (let y = ramRect.y; y < ramRect.y + ramRect.height; y += 1)
    for (let x = ramRect.x; x < ramRect.x + ramRect.width; x += 1) ramSeen ||= sees(x, y);
  const { garrisonMen: _men, garrisonCapacity: _capacity, ...publicFront } = full;
  return { ...publicFront, structures, breached: structures.some((structure) => !structure.standing),
    ram: ramSeen ? full.ram : null, hold: sees(site.x, site.y) ? full.hold : 0,
    garrison: structures.length > 0 && full.garrison > 0 ? 1 : 0 };
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
