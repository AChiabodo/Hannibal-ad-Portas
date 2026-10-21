/**
 * The Matches the command line can play, by name: which rules each name selects.
 *
 * The word is "rules" and not "scenario": these are the `MatchRules` the command
 * plays, and the glossary reserves "scenario" for something a Match is not
 * (GLOSSARY: Match, whose _Avoid_ list includes it).
 *
 * This is a harness concern, not game content, which is why it lives here and
 * not under `sim/`: the world the game will have is built by B1 to C5, and
 * nothing in this file is part of it. What a name is for is one small thing —
 * to hand the driver a Match the CLI can play, so that CI can record the state
 * hash it ends on and fail when that hash moves (ADR-0003, ADR-0006).
 *
 * Each name is a Match, and each is a gate. The **economy** Match is the one the
 * command plays by default: B1's theatre, B5's clock and B6's economy in one world, so the seed,
 * the tick loop, the calendar and the settlements are exercised together and the
 * golden hash moves when any of them does. The **seasons** Match is the clock on
 * its own, kept as the narrower gate it has always been. The **fog** Match is
 * B4's: B1's theatre and both Factions' memory of it in one world, so the gate
 * covers the map in state and the fog that filters an Observation (ADR-0013).
 * The **empty** Match draws nothing and advances nothing: its hash is the seed
 * expanded, the clock at the bound and the world it started with — a real proof
 * that `xmur3`'s expansion, the canonical form and the hash are portable across
 * machines, and no proof at all about the draw loop, which is where `Math.imul`,
 * `| 0` and `>>> 0` live and where an implementation that disagreed between
 * engines would hide (A5 review, F5). The **drawing** Match below draws on every
 * tick, so the same gate covers `sfc32` itself. The **march** Match is C1 and
 * C3's: a dozen Squads of two types, ordered across a theatre where they meet and
 * fight. The **roster** Match is C4's: every type of both rosters, elephants
 * included, so one headless run covers the whole of both — and a change to a
 * type's strength, morale, arm or pace moves its hash. The **attrition** Match
 * is C6's: two armies in the field through the Seasons, one of them under a
 * Roman camp, so the hash covers the Territory they are inferred to stand in,
 * what a Season outside it costs them and what a camp saves them. The
 * **assault** and **blockade** Matches are C5's, each a whole Match won headless
 * by one path of the Siege.
 *
 * The rules here hold integers only, for the ordinary reason: they are
 * authoritative state, `serializeState` accepts nothing else, and the hash is
 * what CI compares (ADR-0006).
 *
 * The three Matches have different worlds and different visibilities, so the
 * table below holds a function per name and not a `MatchSetup`: each entry
 * plays *its own* Match, in the only types that Match has, and one common type
 * would have to be a lie about one of them.
 */
import {
  economyMatchOutcome,
  economyMatchRules,
  emptyMatchOutcome,
  emptyMatchRules,
  factionOf,
  fogMatchOutcome,
  fogMatchRules,
  garrison,
  idleController,
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  move,
  musterSquad,
  observeEconomy,
  observeEmptyMatch,
  observeFogMatch,
  observeSeasonMatch,
  observeSiege,
  assault,
  blockade,
  build,
  CAMP_RADIUS,
  replayCommands,
  runMatch,
  scriptedController,
  seasonMatchOutcome,
  seasonMatchRules,
  siegeMatchOutcome,
  siegeMatchRules,
  createSiegeWorld,
  settlementIdAt,
  terrainAt,
  type Command,
  type CommandLog,
  type EconomyVisible,
  type EconomyWorld,
  type EmptyMatchVisible,
  type EmptyMatchWorld,
  type Faction,
  type FogMatchVisible,
  type FogMatchWorld,
  type MapGrid,
  type MatchResult,
  type MatchRules,
  type MatchRun,
  type MatchSetup,
  type Outcome,
  type Players,
  type ReplayResult,
  type SeasonMatchVisible,
  type SeasonMatchWorld,
  type SiegePath,
  type SiegeVisible,
  type SiegeWorld,
  type Site,
} from '../sim/index.ts';
import { squadTypesOf } from '../content/index.ts';
import { playAiMatchAt } from './ai-match.ts';
import type { DifficultyName } from '../ai/difficulty.ts';

/**
 * What the rules own in the drawing Match: integers, and nothing else.
 *
 * Every field is a draw's own output, put in state rather than discarded, so
 * the hash is a function of what the generator produced: a draw that quietly
 * stopped happening would move the hash rather than pass unnoticed. There is
 * no counter of ticks here, because the cursor already says how far the stream
 * has been read and `MatchState.tick` says how long the Match has run.
 */
export interface DrawsWorld {
  /** The last whole word drawn: the output of `nextUint32`, an integer in [0, 2^32). */
  word: number;

  /** The last digit drawn, in [0, 9]: `nextInt`, which goes through the unbiased rejection path. */
  digit: number;

  /** The digits added up as they arrive, so the world carries arithmetic the draws fed. */
  total: number;
}

/**
 * What a Faction may see of it: the same three numbers, and nothing else.
 *
 * A type of its own rather than the world's, because an Observation is not
 * Match state and must never become it (`sim/observation.ts`): the projection
 * below is what a Controller may read, so it says so even where there is
 * nothing to hide.
 */
interface DrawsVisible {
  readonly word: number;
  readonly digit: number;
  readonly total: number;
}

/**
 * The rules of the drawing Match: draw from the Match's random source twice on
 * every tick and remember what came out. No Commands matter, because nothing in
 * this world can be commanded; the tick's whole work is the draws.
 *
 * Both draw paths are exercised deliberately. `nextUint32` is the loop itself,
 * where `Math.imul`, `| 0` and `>>> 0` live; `nextInt(0, 9)` is the rejection
 * loop in `nextBelow`, a second way for the same words to reach state. A Match
 * that drew through only one of them would leave the other ungated.
 */
export const drawsRules: MatchRules<DrawsWorld, Command> = {
  // A world nobody has drawn in yet. The seed is already in the Match's clock
  // and cursor, where the hash covers it (ADR-0006), so it is not repeated here.
  createWorld: () => ({ word: 0, digit: 0, total: 0 }),

  step: (world, rng) => {
    world.word = rng.nextUint32();
    world.digit = rng.nextInt(0, 9);
    world.total += world.digit;
  },
};

/**
 * What a Faction may see of the drawing Match: the three numbers the rules own,
 * projected field by field.
 *
 * Field by field rather than by handing the world over, because a projection
 * that aliases the world is exactly the hole the seam exists to close — a
 * Controller handed it could write authoritative state with no Command and no
 * log (A5 review, F2). Nothing here decides anything, so there is nobody to
 * leak to today; a harness that models the wrong shape is still the wrong shape
 * to copy from tomorrow.
 */
const observeDraws: MatchSetup<DrawsWorld, DrawsVisible>['observe'] = (world) => ({
  word: world.word,
  digit: world.digit,
  total: world.total,
});

/**
 * A drawing Match never decides anything either: nothing in this world can be
 * lost, so it ends by the bound its caller set, exactly as the empty one does.
 */
const drawsOutcome: MatchSetup<DrawsWorld, DrawsVisible>['outcome'] = () => null;

/** The two Players every harness Match runs on: Controllers that watch and decide nothing. */
function idlePlayers<Visible>(): Players<Visible> {
  return [
    { faction: 'rome', controller: idleController<Visible>() },
    { faction: 'carthage', controller: idleController<Visible>() },
  ];
}

/** Plays the economy Match: B1's theatre, B5's clock and B6's settlements in one world. */
function playEconomy(seed: number, ticks: number): MatchRun {
  return runMatch<EconomyWorld, EconomyVisible>({
    seed,
    rules: economyMatchRules,
    observe: observeEconomy,
    outcome: economyMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/** Plays the Match on the strategic clock: the calendar is the world, and the bound ends it. */
function playSeasons(seed: number, ticks: number): MatchRun {
  return runMatch<SeasonMatchWorld, SeasonMatchVisible>({
    seed,
    rules: seasonMatchRules,
    observe: observeSeasonMatch,
    outcome: seasonMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/** Plays the empty Match: no systems, no draws, and the tick bound is what ends it. */
function playEmpty(seed: number, ticks: number): MatchRun {
  return runMatch<EmptyMatchWorld, EmptyMatchVisible>({
    seed,
    rules: emptyMatchRules,
    observe: observeEmptyMatch,
    outcome: emptyMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/**
 * Plays the fog Match: B1's theatre and B4's two fogs, which is the first Match
 * whose world holds the map in state.
 *
 * Nothing stands on the map yet, so nothing happens on a tick but the visibility
 * pass — and the golden hash CI records is what makes "the fog is state" a fact:
 * the map, and what each Faction has seen of it, are inside the hash, so a change
 * to either moves it (ADR-0006, ADR-0013).
 */
function playFog(seed: number, ticks: number): MatchRun {
  return runMatch<FogMatchWorld, FogMatchVisible>({
    seed,
    rules: fogMatchRules,
    observe: observeFogMatch,
    outcome: fogMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/** Plays the drawing Match: the same driver, onto a world whose rules draw on every tick. */
function playDraws(seed: number, ticks: number): MatchRun {
  return runMatch<DrawsWorld, DrawsVisible>({
    seed,
    rules: drawsRules,
    observe: observeDraws,
    outcome: drawsOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/**
 * The force each Faction puts in the field for the march Match.
 *
 * The two forces bring the **same men** and a different number of Squads: two
 * full Roman lines of 120 against five Carthaginian bodies of 48, two hundred and
 * forty a side. Before #66 the two rosters' blocks were counted as equal however
 * many men stood in them, and six a side was a fair fight; with a blow read off
 * the men brought to bear (`sim/combat.ts`) six 48-man bodies against six 120-man
 * ones is 288 men against 720, and the Match is a walkover that tests nothing.
 * Seven Squads of two types is what the same two hundred and forty men look like
 * now, and the fight the golden hash gates is a real one (ADR-0028).
 */
const MARCH_FORCES: Readonly<Record<Faction, { readonly squadType: string; readonly men: number; readonly squads: number }>> = {
  rome: { squadType: 'hastati', men: 120, squads: 2 },
  carthage: { squadType: 'libyan-spear', men: 48, squads: 5 },
};

/** How far from its Stronghold a Faction's Squads are stood up, in tiles. */
const MARCH_SPREAD = 4;

/** The tick both Factions are ordered on: the first, so the whole run is the march. */
const MARCH_TICK = 0;

/**
 * The world the march Match begins on: the seed's theatre and economy, with both
 * Factions' forces mustered near their own Strongholds.
 *
 * Exported because it is what the harness Match is made of, and what a test
 * reads to see that the Squads it orders across the theatre are two bodies of
 * two hundred and forty men, standing on ground they can walk off — and that they
 * are real Squads of real types and real sizes, whose Payroll and morale ride
 * with them as they go.
 *
 * @throws Error when the theatre has nowhere near a Stronghold to stand a force
 *   up — which no generated map is, and which is worth saying rather than
 *   quietly fielding fewer Squads than the Match is about.
 */
export function marchWorld(seed: number): EconomyWorld {
  const world = economyMatchRules.createWorld(seed);

  for (const side of marchSides(world.map)) {
    const force = MARCH_FORCES[side.faction];

    for (const site of groundNear(world.map, side.from, force.squads)) {
      musterSquad(world.economy, world.map, {
        faction: side.faction,
        squadType: force.squadType,
        men: force.men,
        x: site.x,
        y: site.y,
      });
    }
  }

  return world;
}

/**
 * The march Match's rules: the economy's own tick, on the world the march musters
 * onto the seed's theatre.
 *
 * A value of its own, and built from the seed rather than from a world in hand,
 * because a replay has no world in hand: it is handed a seed and a log, and the
 * theatre the log was played on is the one this builds from that seed (E2).
 */
const marchRules = rulesOn(marchWorld, economyMatchRules);

/**
 * The Commands the march Match is played by: one `move` a Faction, on the first
 * tick, sending every Squad it owns to the other Faction's Stronghold.
 *
 * One Command a Faction rather than one a Squad, because the vocabulary names a
 * list of Squads for exactly this reason, and because it is the shape a Player's
 * order really has. The destination is a tile: what a Stronghold means is C5's.
 */
export function marchLog(world: EconomyWorld): CommandLog<Command> {
  return marchSides(world.map).map(({ faction, to }) => ({
    tick: MARCH_TICK,
    command: move(faction, squadIdsOf(world, faction), to.x, to.y),
  }));
}

/**
 * Plays the march Match: the economy's own rules on the economy's own world, a
 * dozen Squads mustered onto it, and the orders that send them across it.
 *
 * Nothing here is a rule: it is `musterSquad` and two `move` Commands, played
 * through the same driver a human and an AI use. What the hash it ends on covers
 * is therefore the whole of C1 in one number — the map in state, the routes
 * worked out over it, the terrain costs walked, the turns taken — with the
 * economy's half of every Squad beside it. Since C3 the two forces meet in the
 * middle of that theatre, so the same hash covers the fight as well: the
 * survivors are the men who got through, and each of them still ends the March
 * near the Stronghold it was ordered to, at its allocated arrival (#68).
 */
function playMarch(seed: number, ticks: number): MatchRun {
  const log: CommandLog<Command> = marchLog(marchWorld(seed));

  return runMatch<EconomyWorld, EconomyVisible>({
    seed,
    rules: marchRules,
    observe: observeEconomy,
    outcome: economyMatchOutcome,
    players: [
      { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
      { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
    ],
    ticks,
  });
}

/**
 * The world the roster Match begins on: every type of both rosters, mustered on
 * its own Faction's ground.
 *
 * The march Match fields a dozen Squads of one type each; this one fields the
 * nine types of the two rosters, so a single headless run exercises every arm,
 * every strength, every morale and both paces — the elephant included, which is
 * the only Squad in the Match drawn as one figure. Exported because it is what
 * the harness Match is made of, and what a test reads to see that both rosters
 * are on the field.
 *
 * @throws Error when the theatre has nowhere near a Stronghold for a roster to
 *   stand on — which no generated map is, and which is worth saying rather than
 *   quietly fielding half a roster.
 */
export function rosterWorld(seed: number): EconomyWorld {
  const world = economyMatchRules.createWorld(seed);

  for (const side of marchSides(world.map)) {
    const types = squadTypesOf(side.faction);
    const tiles = groundNear(world.map, side.from, types.length);

    types.forEach((type, index) => {
      const site = tiles[index];
      if (site === undefined) return;

      musterSquad(world.economy, world.map, {
        faction: side.faction,
        squadType: type.id,
        x: site.x,
        y: site.y,
      });
    });
  }

  return world;
}

/** The roster Match's rules: the same economy tick, on a theatre holding both rosters. */
const rosterRules = rulesOn(rosterWorld, economyMatchRules);

/**
 * Plays the roster Match: the economy's own rules on a theatre with both
 * rosters on it, and the orders that send them across it.
 *
 * The Commands are the march Match's own (`marchLog`): one `move` a Faction,
 * naming every Squad it owns, to the other Faction's Stronghold. What the hash it
 * ends on covers is therefore every type's place in the fight as well as its
 * march — which arm it carries, how many men it is counted as, how fast it
 * walks — so a change to a roster's numbers moves this Match and has to be a
 * decision in review (ADR-0006).
 */
function playRoster(seed: number, ticks: number): MatchRun {
  const log: CommandLog<Command> = marchLog(rosterWorld(seed));

  return runMatch<EconomyWorld, EconomyVisible>({
    seed,
    rules: rosterRules,
    observe: observeEconomy,
    outcome: economyMatchOutcome,
    players: [
      { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
      { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
    ],
    ticks,
  });
}

/**
 * One Faction's share of the march Match: the Stronghold it sets out from, and
 * the one it marches on.
 */
interface MarchSide {
  /** The Faction whose share this is. */
  readonly faction: Faction;

  /** Its own Stronghold: where its Squads are mustered. */
  readonly from: Site;

  /** The other Faction's Stronghold: where its Squads are ordered to. */
  readonly to: Site;
}

/**
 * The two Factions of the march Match, each with the Stronghold it starts at and
 * the one it marches on.
 *
 * One list, read twice — once to muster the forces and once to write the
 * Commands — so that the two cannot come apart. Mustering each force at the
 * Stronghold the *other* one marches on is the failure that rules out: it leaves
 * every Squad in the Match walking the eight tiles to the doorstep it started
 * next to, and arriving, and looking for all the world like a march.
 */
function marchSides(map: MapGrid): readonly MarchSide[] {
  const [rome, carthage] = map.strongholds;

  return [
    { faction: 'rome', from: rome, to: carthage },
    { faction: 'carthage', from: carthage, to: rome },
  ];
}

/** The ids of every Squad a Faction owns, in the order the economy holds them. */
function squadIdsOf(world: EconomyWorld, faction: Faction): readonly number[] {
  return world.economy.squads
    .filter((squad) => factionOf(squad.owner) === faction)
    .map((squad) => squad.id);
}

/**
 * Walkable tiles around a site, in the order the map reads them, up to `count`.
 *
 * A square around the Stronghold rather than a spiral or a ring, because the
 * only thing being asked is that the force stands on land near where its
 * Stronghold is, and a reading order that a reader can hold in their head is
 * worth more here than a tidier shape.
 */
function groundNear(map: MapGrid, site: Site, count: number, spread = MARCH_SPREAD): readonly Site[] {
  const ground: Site[] = [];

  for (let y = site.y - spread; y <= site.y + spread; y += 1) {
    for (let x = site.x - spread; x <= site.x + spread; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      if (!isWalkable(terrainAt(map, x, y))) continue;
      if (ground.length === count) return ground;

      ground.push({ x, y });
    }
  }

  if (ground.length < count) {
    throw new Error(`the theatre has only ${String(ground.length)} tiles near a Stronghold to stand a force on`);
  }

  return ground;
}

/**
 * The type each Faction's army in the Attrition Match is made of: the tier-1
 * line on its own roster, so neither side is the stronger by its arms.
 */
const ATTRITION_TYPES: Readonly<Record<Faction, string>> = {
  rome: 'hastati',
  carthage: 'libyan-spear',
};

/** The tick the Attrition Match's one order is given on: the first, so the camp is begun at once. */
const ATTRITION_TICK = 0;

/** How far round the midpoint of the two Strongholds the open field is looked for, in tiles. */
const FIELD_SPREAD = 4;

/**
 * The world the Attrition Match begins on: a Roman army in the ground its camp
 * will cover, and a Carthaginian one in the open field between the Strongholds,
 * which is nobody's country (C6).
 *
 * The two armies are the whole of the Match, and the point of it is that they end
 * it differently: the Roman one winters under a camp and the Carthaginian one
 * does not, because Carthage can neither raise a Castrum nor make a camp of
 * anything else. Both are mustered rather than recruited, as the harness
 * everywhere musters them — the Seasons of economy before a tier-1 settlement
 * could pay for a line of hastati are not what this Match is about.
 *
 * @throws Error when the theatre has nowhere near a Stronghold, or near the
 *   midpoint of the two, to stand a force on — which no generated map is, and
 *   which is worth saying rather than quietly fielding fewer armies than the
 *   Match is about.
 */
export function attritionWorld(seed: number): EconomyWorld {
  const world = economyMatchRules.createWorld(seed);
  const [rome, carthage] = world.map.strongholds;

  // One tile inside the camp's own reach, and in Rome's country: a Squad holding
  // position there is what a Castrum is for.
  const inCampGround = groundNear(world.map, rome, 1, CAMP_RADIUS)[0];
  const inTheField = groundNear(world.map, midpoint(rome, carthage), 1, FIELD_SPREAD)[0];
  if (inCampGround === undefined || inTheField === undefined) {
    throw new Error('the theatre has nowhere to stand the two armies of the Attrition Match');
  }

  musterSquad(world.economy, world.map, {
    faction: 'rome',
    squadType: ATTRITION_TYPES.rome,
    x: inCampGround.x,
    y: inCampGround.y,
  });
  musterSquad(world.economy, world.map, {
    faction: 'carthage',
    squadType: ATTRITION_TYPES.carthage,
    x: inTheField.x,
    y: inTheField.y,
  });

  return world;
}

/** The Attrition Match's rules: the economy tick, on the two armies' own ground. */
const attritionRules = rulesOn(attritionWorld, economyMatchRules);

/**
 * The Commands the Attrition Match is played by: Rome raises the camp it winters in.
 *
 * One order, and Rome's own: the Castrum is raised through the `build` Command
 * every Player builds with, paid for out of the settlement's stock and standing
 * once its labour has counted its ticks down — so the camp the Match turns on is
 * a real building and not one the harness put there.
 */
export function attritionLog(world: EconomyWorld): CommandLog<Command> {
  const [rome] = world.map.strongholds;

  return [{ tick: ATTRITION_TICK, command: build('rome', settlementIdAt(world.economy, rome), 'castrum') }];
}

/**
 * Plays the Attrition Match: the economy's own rules, two armies in the field,
 * and the Seasons that charge them for standing where they stand.
 *
 * Nothing here is a rule either. What the hash it ends on covers is C6 in one
 * number: the Territory each army is inferred to be in or out of, the men a
 * Season outside it costs and the winter that costs more, the quarters a camp in
 * a Faction's own ground gives an army in the open, and Rome's alone being the
 * one that has them (ADR-0005, ADR-0006).
 */
function playAttrition(seed: number, ticks: number): MatchRun {
  const log = attritionLog(attritionWorld(seed));

  return runMatch<EconomyWorld, EconomyVisible>({
    seed,
    rules: attritionRules,
    observe: observeEconomy,
    outcome: economyMatchOutcome,
    players: [
      { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
      { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
    ],
    ticks,
  });
}

/** The tile between two sites: where an army stands in nobody's country (C6). */
function midpoint(from: Site, to: Site): Site {
  return { x: Math.floor((from.x + to.x) / 2), y: Math.floor((from.y + to.y) / 2) };
}

/**
 * How many Squads Rome puts at the walls in a Siege Match: enough to storm a
 * breach, and few enough that Payroll does not empty the treasury before the
 * walls come down.
 */
const SIEGE_SQUADS = 3;

/** The type Rome's army is made of: the steady line, which is what stands a siege. */
const SIEGE_TYPE = 'principes';

/** The type Carthage mans its walls with. */
const GARRISON_TYPE = 'libyan-spear';

/** The tick a Siege Match's orders are given on: the first, so the whole run is the siege. */
const SIEGE_TICK = 0;

/**
 * The world a Siege Match begins on: a Roman army at Carthage's gate, and a
 * Carthaginian garrison inside.
 *
 * Both forces are mustered rather than recruited, which is what the harness
 * does everywhere: the point of the Match is the siege, not the twelve Seasons
 * of economy that would otherwise have to pass before a tier-2 army could be
 * raised. What is *not* faked is the Siege: the garrison goes in through the
 * `garrison` Command and the army storms through `assault` or starves through
 * `blockade`, all of them in the log and all of them through the same rules a
 * Player's Commands go through.
 *
 * @throws Error when the theatre has fewer walkable tiles at Carthage's walls
 *   than the army needs — which no generated map is, and which is worth saying
 *   rather than quietly fielding a smaller army than the Match is about.
 */
export function siegeWorld(seed: number): SiegeWorld {
  const world = createSiegeWorld(seed);
  const [, carthage] = world.map.strongholds;

  for (const site of wallsOf(world.map, carthage, SIEGE_SQUADS)) {
    musterSquad(world.economy, world.map, {
      faction: 'rome',
      squadType: SIEGE_TYPE,
      x: site.x,
      y: site.y,
    });
  }

  musterSquad(world.economy, world.map, {
    faction: 'carthage',
    squadType: GARRISON_TYPE,
    x: carthage.x,
    y: carthage.y,
  });

  return world;
}

/** The Siege harness Matches' rules: the siege tick, on the army at Carthage's gate. */
const siegeHarnessRules = rulesOn(siegeWorld, siegeMatchRules);

/**
 * The Commands a Siege Match is played by: Carthage mans its walls, and Rome lays
 * one of the two Sieges against its Stronghold.
 *
 * The two orders are one list read once, so the garrison and the army cannot
 * come to disagree about which settlement is being fought over.
 */
export function siegeLog(world: SiegeWorld, path: SiegePath): CommandLog<Command> {
  const [, carthage] = world.map.strongholds;
  const target = settlementIdAt(world.economy, carthage);

  const orders: Command[] = [
    garrison('carthage', squadIdsOf(world, 'carthage'), target),
    path === 'assault'
      ? assault('rome', squadIdsOf(world, 'rome'), target)
      : blockade('rome', squadIdsOf(world, 'rome'), target),
  ];

  return orders.map((command) => ({ tick: SIEGE_TICK, command }));
}

/**
 * Plays a Siege Match to its end: one of the two paths of the Siege, and the
 * Stronghold's fall that ends the Match (`siegeMatchOutcome`).
 *
 * The bound is the caller's, but the Match is expected to decide before it: a
 * harness whose golden hash is the fall of a Stronghold is a harness that proves
 * a whole Match can be won headless, which is the ticket's last criterion.
 */
function playSiege(seed: number, ticks: number, path: SiegePath): MatchRun {
  const log = siegeLog(siegeWorld(seed), path);

  return runMatch<SiegeWorld, SiegeVisible>({
    seed,
    rules: siegeHarnessRules,
    observe: observeSiege,
    outcome: siegeMatchOutcome,
    players: [
      { faction: 'rome', controller: scriptedController<SiegeVisible>(log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(log) },
    ],
    ticks,
  });
}

/**
 * Plays the bare theatre: the map, the economy, the Squads and the Siege on it,
 * with nobody commanding either side.
 *
 * This is the Match the external-agent harness plays (`agent.ts` hands it the
 * same `siegeMatchRules` and puts the process and the AI or an idle Player on
 * the two Factions), so it is the one a record made over the protocol names: a
 * replay of an agent's Match needs the rules, not the Players, and the Players
 * an agent's Match ran on are not in its log (E2).
 */
function playSiegeTheatre(seed: number, ticks: number): MatchRun {
  return runMatch<SiegeWorld, SiegeVisible>({
    seed,
    rules: siegeMatchRules,
    observe: observeSiege,
    outcome: siegeMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/**
 * Walkable tiles at a Stronghold's walls: the ring a tile deep, in reading order.
 *
 * The square `groundNear` gives, less the centre: a besieging army has to be
 * *at* the walls — `SIEGE_RADIUS` is one tile — for the Siege to be laid at all,
 * and the centre tile is where the garrison stands.
 */
function wallsOf(map: MapGrid, site: Site, count: number): readonly Site[] {
  const ring = groundNear(map, site, count + 1, 1).filter(
    (tile) => tile.x !== site.x || tile.y !== site.y,
  );

  if (ring.length < count) {
    throw new Error(
      `the theatre has only ${String(ring.length)} tiles at a Stronghold's walls to stand a force on`,
    );
  }

  return ring.slice(0, count);
}

/**
 * The names `--rules` accepts, in the order `--help` lists them.
 *
 * Where `RulesName` is read from, and where the menu's order comes from: the
 * table below is checked against this list in both directions, so a name with
 * no rules, or rules under a name nobody can type, is a type error rather than
 * a use that fails at whatever hour CI runs. `DEFAULT_RULES` spells `economy` a
 * second time, and its type is this list's, so the two cannot disagree.
 */
export const RULES_NAMES = [
  'ai',
  'economy',
  'seasons',
  'empty',
  'fog',
  'draws',
  'march',
  'roster',
  'siege',
  'assault',
  'blockade',
  'attrition',
] as const;

/** A name `--rules` accepts, which is also the only thing the table below is keyed by. */
export type RulesName = (typeof RULES_NAMES)[number];

/**
 * A recorded Match, as the rules of one name replay it (E2).
 *
 * What a record holds and a replay needs: the seed, the Commands that were
 * applied and the tick they were applied on, how many ticks the Match ran, and
 * how often to fingerprint it. Nothing about who decided — a replay has no
 * Controllers, and the log is the whole of what they contributed (E2).
 */
export interface ReplayRequest {
  readonly seed: number;
  readonly log: CommandLog<Command>;
  /** How many ticks the Match ran: the tick it ended on. */
  readonly ticks: number;
  /** Hash every this many ticks. Default: every tick. */
  readonly everyTicks?: number;
}

/**
 * What replaying one name produced: the checkpoints, and how its own rules say the
 * Match ended.
 *
 * The ending is narrowed from `ReplayResult`'s because a name always has a verdict
 * to offer — every Match in the table is played by an `outcome` — and a replay
 * that reported "I did not ask" would leave a record's ending unchecked, which is
 * the one thing a record exists to have checked (E2).
 */
export interface MatchReplay extends ReplayResult {
  readonly ending: MatchResult;
}

/** What the table holds for one name: the line `--help` prints, and the Match it plays. */
interface RulesEntry {
  /** One line for `--help`, in the same words the menu and the refusal use. */
  readonly description: string;

  /**
   * Plays this Match from a seed for a bound, through the one driver everything
   * else plays through.
   *
   * A run, not a `MatchSetup`: what a caller wants from a name is the run's
   * result, its log and, above all, the hash CI records. The bound always
   * terminates the Match, so this always returns.
   *
   * The difficulty is the one name that has an AI to name it for: with `ai` it
   * picks the level both Controllers play at, and with every other name it is
   * absent because the flag is refused there. So a Match of a tournament can be
   * played again at the level the tournament played it at (E3).
   */
  readonly play: (seed: number, ticks: number, difficulty?: DifficultyName) => MatchRun;

  /**
   * Re-enacts a log of this Match from its seed, hashing it at checkpoints.
   *
   * The other half of a name, and the one that has to be a `MatchRules` rather
   * than a set of Players: a record is replayed with no Controllers at all. It is
   * a function per name because a name is not only rules — the march, roster and
   * attrition Matches muster their armies onto the seed's theatre — and a replay
   * that started from the bare economy world would part from its record at tick
   * zero.
   */
  readonly replay: (request: ReplayRequest) => MatchReplay;
}

/**
 * The replay one Match's rules give, as the table wants it.
 *
 * `replayCommands` rather than `replay`, because a log read back off disk is a
 * log that arrived from outside a Match: nothing has said its entries are
 * Commands until the vocabulary has read them (see `sim/replay.ts`).
 *
 * The verdict comes along with the rules and is not optional, because a Match is
 * its rules *and* how they end it: a rule can change when a Match is decided
 * without moving a number in the world, and a replay that only compared hashes
 * would call that run a reproduction.
 */
function replayer<World>(
  rules: MatchRules<World, Command>,
  outcome: (world: World) => Outcome | null,
): RulesEntry['replay'] {
  return (request) => {
    const replayed = replayCommands({ ...request, rules, outcome });

    return { ...replayed, ending: replayed.ending ?? { kind: 'clock', tick: replayed.ticks } };
  };
}

/**
 * One Match's rules, on a world a harness builds rather than the bare one the
 * name's own rules create — the march, roster and attrition Matches muster their
 * armies onto the seed's theatre before the first tick.
 *
 * A helper rather than four object literals because the replay half of E2 needs
 * the same world the play half used, built from the same seed: a record whose
 * replay started from the bare economy world would part from it at tick zero.
 */
function rulesOn<World>(
  createWorld: (seed: number) => World,
  of: MatchRules<World, Command>,
): MatchRules<World, Command> {
  return { createWorld, step: of.step };
}

/**
 * What each name plays, keyed by the name that selects it: one name, one Match,
 * so a name `--rules` accepts and a Match `playMatch` can play cannot disagree.
 */
export const RULES = {
  ai: {
    description: 'two AI Controllers — economy, field, scouting and siege — with scored decision logs',
    play: playAiMatchAt,
    replay: replayer(siegeMatchRules, siegeMatchOutcome),
  },
  economy: {
    description: 'the Match on the theatre and the economy: map, seasons, settlements, Payroll',
    play: playEconomy,
    replay: replayer(economyMatchRules, economyMatchOutcome),
  },

  seasons: {
    description: 'the Match on the strategic clock: seasons advance, and the bound ends it',
    play: playSeasons,
    replay: replayer(seasonMatchRules, seasonMatchOutcome),
  },

  empty: {
    description: 'the Match with no systems in it: the bound ends it',
    play: playEmpty,
    replay: replayer(emptyMatchRules, emptyMatchOutcome),
  },

  fog: {
    description: "B1's theatre and B4's two fogs: the map and what each Faction knows, in state",
    play: playFog,
    replay: replayer(fogMatchRules, fogMatchOutcome),
  },

  draws: {
    description: 'a Match whose rules draw every tick, so CI gates the draw loop',
    play: playDraws,
    replay: replayer(drawsRules, drawsOutcome),
  },

  march: {
    description: 'a dozen Squads on the theatre, each Faction ordered across it',
    play: playMarch,
    replay: replayer(marchRules, economyMatchOutcome),
  },

  roster: {
    description: 'both rosters on the theatre, elephants included, sent at each other',
    play: playRoster,
    replay: replayer(rosterRules, economyMatchOutcome),
  },

  siege: {
    description: 'the bare theatre under a Siege, with nobody commanding: what the agent harness plays',
    play: playSiegeTheatre,
    replay: replayer(siegeMatchRules, siegeMatchOutcome),
  },

  assault: {
    description: "a Roman army storms Carthage's Stronghold with the ram, and the Match is won",
    play: (seed: number, ticks: number) => playSiege(seed, ticks, 'assault'),
    replay: replayer(siegeHarnessRules, siegeMatchOutcome),
  },

  blockade: {
    description: "Carthage's Stronghold is starved into surrender, and the Match is won",
    play: (seed: number, ticks: number) => playSiege(seed, ticks, 'blockade'),
    replay: replayer(siegeHarnessRules, siegeMatchOutcome),
  },

  attrition: {
    description: 'two armies in the field through the Seasons, and only one of them in a camp',
    play: playAttrition,
    replay: replayer(attritionRules, economyMatchOutcome),
  },
} as const satisfies Readonly<Record<RulesName, RulesEntry>>;

/** The Match played when the command line names no rules. */
export const DEFAULT_RULES: RulesName = 'economy';

/** Whether a string names a Match this command can play: what the CLI asks before refusing one. */
export function isRulesName(value: string): value is RulesName {
  return Object.hasOwn(RULES, value);
}
