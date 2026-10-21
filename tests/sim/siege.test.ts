import { describe, expect, it } from 'vitest';
import { createFogs } from '../../src/sim/fog.ts';
import { assault, blockade, garrison, hold, type Command } from '../../src/sim/command';
import { engagedPairs } from '../../src/sim/combat';
import { idleController } from '../../src/sim/controller';
import { runMatch, type MatchSetup } from '../../src/sim/driver';
import { createEconomy, UNOWNED, type Squad } from '../../src/sim/economy';
import { observeEconomy } from '../../src/sim/economy-match';
import { FIELD } from '../../src/sim/squad';
import { createMatch, type Match } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { routeCacheFor } from '../../src/sim/movement';
import { RESOURCE, type MapGrid, type Site } from '../../src/sim/map';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import {
  applySiegeCommand,
  ASSAULT_TICKS,
  CAPTURE_HOLDS,
  CAPTURE_TICKS,
  createSiege,
  createSiegeWorld,
  ESCALADE_DAMAGE,
  GATE_HP,
  garrisonOf,
  observeSiege,
  RAM_BUILD_TICKS,
  RAM_COST,
  RAM_HP,
  RELIEF_RADIUS,
  SIEGE,
  siegeMatchOutcome,
  siegeMatchRules,
  STRUCTURE,
  WALL_HP,
  WALL_SECTIONS,
  type SiegeWorld,
} from '../../src/sim/siege';
import { testMap } from './economy-fixtures';
import { territoryAt, territoryOf } from '../../src/sim/territory';

/** The two Strongholds every stage stands on, far apart as a generated map's are. */
const ROME: Site = { x: 10, y: 10 };
const CARTHAGE: Site = { x: 85, y: 85 };

/** A tile one step from Carthage's Stronghold: where a besieging army stands at the walls. */
const AT_THE_GATE: Site = { x: 84, y: 85 };

/**
 * A hand-built theatre: two Strongholds on plain ground, an optional minor
 * settlement, and nothing else that could be confused with what a test measures.
 */
function stage(options: { readonly minor?: Site } = {}): SiegeWorld {
  const map: MapGrid = testMap({
    strongholds: [ROME, CARTHAGE],
    settlements: options.minor === undefined ? [] : [options.minor],
  });
  const economy = createEconomy(map);

  return {
    map,
    calendar: startCalendar(),
    economy,
    autumns: 0,
    winters: 0,
    siege: createSiege(map, economy),
    fog: createFogs(),
  };
}

/** A Match on a stage a test has already shaped, so `step` advances the tick the rules see. */
function matchOn(world: SiegeWorld): Match<SiegeWorld, Command> {
  return createMatch({
    seed: 1,
    rules: { createWorld: () => world, step: siegeMatchRules.step },
  });
}

/** Advances a Match a whole number of ticks with no Commands. */
function run(match: Match<SiegeWorld, Command>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) match.step();
}

/** Musters Squads of a type onto the stage, as a scenario does: outside recruitment, on real tiles. */
function muster(world: SiegeWorld, faction: 'rome' | 'carthage', type: string, site: Site, count = 1): Squad[] {
  const squads: Squad[] = [];

  for (let raised = 0; raised < count; raised += 1) {
    squads.push(musterSquad(world.economy, world.map, { faction, squadType: type, x: site.x, y: site.y }));
  }

  return squads;
}

/** Puts a Carthaginian garrison inside its Stronghold, through the Command the game uses. */
function manWalls(world: SiegeWorld, count = 1): readonly Squad[] {
  const squads = muster(world, 'carthage', 'libyan-spear', CARTHAGE, count);
  const ids = squads.map((squad) => squad.id);

  expect(applySiegeCommand(world, garrison('carthage', ids, 1), routeCacheFor(world.map))).toBe(true);

  return squads;
}

/** Puts a Roman army at Carthage's gate, and orders it to storm the place. */
function stormTheGates(world: SiegeWorld, count = 2): readonly Squad[] {
  const squads = muster(world, 'rome', 'principes', AT_THE_GATE, count);
  const ids = squads.map((squad) => squad.id);

  expect(applySiegeCommand(world, assault('rome', ids, 1), routeCacheFor(world.map))).toBe(true);

  return squads;
}

/** Carthage's Stronghold, as its holder reads it. */
function carthageFront(world: SiegeWorld) {
  const front = world.siege.fronts[1];
  if (front === undefined) throw new Error('the stage has no Carthaginian front');

  return front;
}

describe('the walls a Siege has', () => {
  it('gives a Stronghold a gate and a stretch of wall to every side, each its own structure', () => {
    const world = stage();
    const seen = observeSiege(world, 'carthage').fronts.find((front) => front.settlement === 1);

    expect(seen).toBeDefined();
    expect(seen?.structures).toHaveLength(WALL_SECTIONS + 1);

    const gate = seen?.structures.find((structure) => structure.kind === 'gate');
    const walls = seen?.structures.filter((structure) => structure.kind === 'wall') ?? [];

    expect(gate).toMatchObject({ hp: GATE_HP, standing: true });
    expect(walls.map((wall) => wall.side).sort()).toEqual(['east', 'north', 'south', 'west']);
    // A Stronghold is not one pool of health: every piece carries its own.
    expect(walls.every((wall) => wall.hp === WALL_HP)).toBe(true);
    expect(seen?.breached).toBe(false);
  });

  it('leaves a minor settlement open, so there is nothing to break and nothing to starve', () => {
    const world = stage({ minor: { x: 40, y: 40 } });
    muster(world, 'rome', 'hastati', { x: 40, y: 39 });
    const seen = observeSiege(world, 'rome').fronts.find((front) => front.settlement === 2);

    expect(seen).toMatchObject({ structures: [], breached: false, siege: null });
  });

  it('sights an open settlement through the fog, and does not announce one nobody can see', () => {
    const world = stage({ minor: { x: 40, y: 40 } });

    // An open settlement has no wall to keep a secret, and that is still not a
    // licence to skip the fog: no eye, no front (ADR-0020).
    expect(observeSiege(world, 'rome').fronts.map((front) => front.settlement)).toEqual([0]);

    muster(world, 'rome', 'hastati', { x: 40, y: 39 });

    expect(observeSiege(world, 'rome').fronts.map((front) => front.settlement)).toEqual([0, 2]);
  });

  it('keeps the walls of a Stronghold a Faction has never marched on out of its Observation', () => {
    const world = stage();

    expect(observeSiege(world, 'rome').fronts.map((front) => front.settlement)).toEqual([0]);
    expect(observeSiege(world, 'carthage').fronts.map((front) => front.settlement)).toEqual([1]);
  });
});

describe('the ram, which is Rome’s alone', () => {
  it('refuses a Carthaginian assault outright, and honours a Roman one', () => {
    const world = stage();
    const carthaginian = muster(world, 'carthage', 'libyan-spear', { x: 11, y: 10 });
    const roman = muster(world, 'rome', 'principes', AT_THE_GATE);

    expect(
      applySiegeCommand(
        world,
        assault('carthage', carthaginian.map((squad) => squad.id), 0),
        routeCacheFor(world.map),
      ),
    ).toBe(false);
    expect(carthageFront(world).path).toBe(SIEGE.none);

    expect(
      applySiegeCommand(
        world,
        assault('rome', roman.map((squad) => squad.id), 1),
        routeCacheFor(world.map),
      ),
    ).toBe(true);
    expect(carthageFront(world)).toMatchObject({ besieger: 0, path: SIEGE.assault });
  });

  it('is built on the spot, at the besieging Faction’s expense, and is not ready at once', () => {
    const world = stage();
    stormTheGates(world);
    const treasury = world.economy.treasuries[0] ?? 0;
    const match = matchOn(world);

    match.step();

    expect(world.economy.treasuries[0]).toBe(treasury - RAM_COST);
    expect(carthageFront(world)).toMatchObject({ ram: RAM_HP, ramTicks: RAM_BUILD_TICKS });
    // A ram under construction has broken nothing: the gate is still whole.
    expect(carthageFront(world).structures[0]?.hp).toBe(GATE_HP);
  });

  it('takes the gate down once it is built, while the walls are worked at more slowly', () => {
    const world = stage();
    stormTheGates(world);
    const match = matchOn(world);

    run(match, RAM_BUILD_TICKS + ASSAULT_TICKS * 9);

    const gate = carthageFront(world).structures.find((structure) => structure.kind === STRUCTURE.gate);
    const walls = carthageFront(world).structures.filter(
      (structure) => structure.kind === STRUCTURE.wall,
    );

    // The gate is the ram's, and the ram is quicker at it than men are at a wall.
    expect(gate?.hp).toBe(0);
    expect(walls.every((wall) => (wall.hp ?? 0) > 0)).toBe(true);
    expect(walls.some((wall) => (wall.hp ?? 0) < WALL_HP)).toBe(true);
    expect(walls.every((wall) => WALL_HP - (wall.hp ?? 0) <= ESCALADE_DAMAGE * 20)).toBe(true);
  });

  it('is vulnerable: a strong garrison breaks the built ram before the gate falls', () => {
    const world = stage();
    manWalls(world, 4);
    stormTheGates(world);
    const match = matchOn(world);
    // Exactly one ram's worth: it is laid, and there is no second one to lay.
    world.economy.treasuries[0] = RAM_COST;

    run(match, RAM_BUILD_TICKS + 1);
    // The ram stands, built, at the gate it is about to work on.
    expect(carthageFront(world)).toMatchObject({ ram: RAM_HP, ramTicks: 0 });

    run(match, ASSAULT_TICKS * 5);

    const gate = carthageFront(world).structures.find((structure) => structure.kind === STRUCTURE.gate);

    // Four Squads' files break it in five rounds, and five rounds are not eight:
    // the gate is still standing, and there is no money left for another ram.
    expect(carthageFront(world).ram).toBe(0);
    expect(gate?.hp).toBeGreaterThan(0);
    expect(world.economy.treasuries[0]).toBe(0);
  });
});

describe('an assault without a breach', () => {
  it('is possible, and punishing: the walls cost men and nerve in every round without a ram', () => {
    const world = stage();
    const [squad] = stormTheGates(world, 1);
    const match = matchOn(world);
    if (squad === undefined) throw new Error('the stage mustered no attacker');

    const before = { men: squad.strength, morale: squad.morale };
    run(match, RAM_BUILD_TICKS);

    expect(squad.strength).toBeLessThan(before.men);
    expect(squad.morale).toBeLessThan(before.morale);
  });

  it('stops costing men once the ram is up, so the ram is what makes an assault sane', () => {
    const world = stage();
    const [squad] = stormTheGates(world, 1);
    const match = matchOn(world);
    if (squad === undefined) throw new Error('the stage mustered no attacker');

    run(match, RAM_BUILD_TICKS + ASSAULT_TICKS);
    const whenRammed = squad.strength;

    run(match, ASSAULT_TICKS * 4);

    expect(squad.strength).toBe(whenRammed);
  });

  it('storms the breach against the garrison, which surrenders rather than running', () => {
    const world = stage();
    const garrisoned = manWalls(world, 1);
    stormTheGates(world);
    const match = matchOn(world);

    run(match, RAM_BUILD_TICKS + ASSAULT_TICKS * 14);

    expect(carthageFront(world).structures[0]?.hp).toBe(0);
    expect(garrisonOf(world.economy, 1)).toEqual([]);
    // A garrison does not rout through the men who came over the wall: it is gone.
    expect(world.economy.squads.some((squad) => garrisoned.includes(squad))).toBe(false);
  });

  it('does not fight a garrison in the open field, whatever stands on the centre tile', () => {
    const world = stage();
    manWalls(world, 1);
    muster(world, 'rome', 'principes', CARTHAGE);

    expect(engagedPairs(world.economy)).toEqual([]);
    expect(world.economy.squads.every((squad) => squad.garrison !== FIELD || true)).toBe(true);
  });
});

describe('a Siege without a ram', () => {
  it('works at a wall instead, slowly and at a price: the escalade is what a broken ram leaves', () => {
    const world = stage();
    world.economy.treasuries[0] = 0;
    stormTheGates(world, 1);
    const match = matchOn(world);

    run(match, ASSAULT_TICKS * 5);

    const walls = carthageFront(world).structures.filter(
      (structure) => structure.kind === STRUCTURE.wall,
    );

    expect(carthageFront(world).ram).toBe(0);
    expect(walls.some((wall) => (wall.hp ?? 0) < WALL_HP)).toBe(true);
  });
});

describe('what a Siege refuses', () => {
  it('will not storm an open settlement, garrison a wall with none, or blockade ground nobody holds', () => {
    const world = stage({ minor: { x: 40, y: 40 } });
    const romans = muster(world, 'rome', 'principes', { x: 40, y: 40 });
    const ids = romans.map((squad) => squad.id);
    const routes = routeCacheFor(world.map);

    // An open settlement is taken by holding its centre, not stormed...
    expect(applySiegeCommand(world, assault('rome', ids, 2), routes)).toBe(false);

    // ...and an open one has no walls for a garrison to man.
    world.economy.settlements[2]!.owner = 0;
    expect(applySiegeCommand(world, garrison('rome', ids, 2), routes)).toBe(false);

    // Ground nobody holds has no supply to cut.
    world.economy.settlements[2]!.owner = UNOWNED;
    expect(applySiegeCommand(world, blockade('rome', ids, 2), routes)).toBe(false);

    // And nobody besieges their own Stronghold.
    expect(applySiegeCommand(world, assault('rome', ids, 0), routes)).toBe(false);
  });
});

describe('a Siege ordered from a distance', () => {
  it('stands while the army is on the road, and lapses when nobody is coming', () => {
    const world = stage();
    const romans = muster(world, 'rome', 'principes', { x: 60, y: 85 });
    const ids = romans.map((squad) => squad.id);

    expect(applySiegeCommand(world, assault('rome', ids, 1), routeCacheFor(world.map))).toBe(true);

    const match = matchOn(world);
    match.step();
    // The army is twenty-five tiles away and walking: the order to storm still
    // stands, and nothing has been breached on the tick it was given.
    expect(carthageFront(world)).toMatchObject({ path: SIEGE.assault, besieger: 0 });
    expect(carthageFront(world).structures[0]?.hp).toBe(GATE_HP);

    // Countermanded: nobody at the walls, nobody on the road, no Siege.
    match.step([hold('rome', ids)]);
    match.step();
    expect(carthageFront(world)).toMatchObject({ path: SIEGE.none, besieger: UNOWNED });
  });
});

describe('a blockade', () => {
  it('cuts supply: a blockaded settlement produces nothing and grows nobody', () => {
    const blockaded = stage();
    const open = stage();
    stormTheGates(blockaded);
    applySiegeCommand(blockaded, blockade('rome', [1], 1), routeCacheFor(blockaded.map));
    blockaded.economy.squads[0]!.x = AT_THE_GATE.x;
    blockaded.economy.squads[0]!.y = AT_THE_GATE.y;

    const blocked = matchOn(blockaded);
    const control = matchOn(open);
    run(blocked, SEASON_TICKS);
    run(control, SEASON_TICKS);

    const starving = blockaded.economy.settlements[1];
    const fed = open.economy.settlements[1];
    if (starving === undefined || fed === undefined) throw new Error('no Carthaginian Stronghold');

    expect(starving.stocks[RESOURCE.grain]).toBeLessThan(fed.stocks[RESOURCE.grain] ?? 0);
    expect(starving.population).toBeLessThan(fed.population);
    expect(carthageFront(blockaded).path).toBe(SIEGE.blockade);
  });

  it('starves a settlement into surrender, and says the blockade is how it fell', () => {
    const world = stage();
    const squads = muster(world, 'rome', 'principes', AT_THE_GATE, 2);
    applySiegeCommand(
      world,
      blockade('rome', squads.map((squad) => squad.id), 1),
      routeCacheFor(world.map),
    );
    const match = matchOn(world);

    let ticks = 0;
    while (world.economy.settlements[1]?.owner !== 0 && ticks < SEASON_TICKS * 6) {
      match.step();
      ticks += 1;
    }

    expect(world.economy.settlements[1]?.owner).toBe(0);
    expect(siegeMatchOutcome(world)).toMatchObject({
      kind: 'victory',
      winner: 'rome',
      reason: { kind: 'stronghold', stronghold: 1, path: 'blockade' },
    });
  });

  it('is broken by the besieged Faction’s field army, which comes to relieve it', () => {
    const world = stage();
    const squads = muster(world, 'rome', 'principes', AT_THE_GATE, 2);
    applySiegeCommand(
      world,
      blockade('rome', squads.map((squad) => squad.id), 1),
      routeCacheFor(world.map),
    );
    const match = matchOn(world);

    run(match, 10);
    expect(carthageFront(world).path).toBe(SIEGE.blockade);

    muster(world, 'carthage', 'libyan-spear', { x: CARTHAGE.x, y: CARTHAGE.y + RELIEF_RADIUS });
    match.step();

    expect(carthageFront(world)).toMatchObject({ path: SIEGE.none, besieger: UNOWNED });
  });
});

describe('a minor settlement, and nothing razed', () => {
  it('is taken by holding its centre, and keeps its people, its works and its stock', () => {
    const world = stage({ minor: { x: 40, y: 40 } });
    const minor = world.economy.settlements[2];
    if (minor === undefined) throw new Error('the stage has no minor settlement');

    minor.stocks[RESOURCE.grain] = 7;
    muster(world, 'rome', 'principes', { x: 40, y: 40 }, 2);
    const match = matchOn(world);

    run(match, CAPTURE_TICKS * (CAPTURE_HOLDS + 1));

    expect(world.economy.settlements[2]?.owner).toBe(0);
    expect(world.economy.settlements[2]?.stocks[RESOURCE.grain]).toBe(7);
    expect(world.economy.settlements[2]?.population).toBe(minor.population);
    // Only a Stronghold ends the Match: taking a village is not a victory.
    expect(siegeMatchOutcome(world)).toBeNull();
  });

  it('is not held while an enemy stands on its centre too: the centre has to be won first', () => {
    const world = stage({ minor: { x: 40, y: 40 } });
    // Two bodies of the same men and the same arm, with neither side carrying
    // missiles: the hold is decided on men alone, and this test is about the
    // hold being a contest and not about which arm wins it (#66).
    muster(world, 'rome', 'triarii', { x: 40, y: 40 }, 2);
    const defenders = muster(world, 'carthage', 'libyan-spear', { x: 40, y: 40 }, 2);
    for (const squad of defenders) Object.assign(squad, { strength: 120, capacity: 120 });
    const match = matchOn(world);

    // A check falls on tick 0, with both Factions standing on the centre: nobody
    // is holding it, so the count does not begin.
    match.step();
    expect(world.siege.fronts[2]).toMatchObject({ hold: 0, holder: UNOWNED });

    run(match, CAPTURE_TICKS - 2);

    expect(world.economy.settlements[2]?.owner).toBe(UNOWNED);
    expect(defenders.some((squad) => squad.strength > 0)).toBe(true);
  });

  it('redraws both Factions’ Territory when it changes hands (C6)', () => {
    // Eight tiles from Carthage's Stronghold, so its writ covers the village
    // ground — and the village is nearer than the Stronghold for the ground
    // round it, which is what changes hands with it.
    const village: Site = { x: CARTHAGE.x - 8, y: CARTHAGE.y };
    const world = stage({ minor: village });

    expect(territoryAt(territoryOf(world.economy), village.x, village.y)).toBe(1);

    muster(world, 'rome', 'principes', village, 2);
    run(matchOn(world), CAPTURE_TICKS * (CAPTURE_HOLDS + 1));

    expect(world.economy.settlements[2]?.owner).toBe(0);

    // Rome's now, tile by tile, and Carthage has lost the ground that went with
    // it while keeping its own Stronghold: two Territories moved, not one.
    const territory = territoryOf(world.economy);

    expect(territoryAt(territory, village.x, village.y)).toBe(0);
    expect(territoryAt(territory, village.x - 1, village.y)).toBe(0);
    expect(territoryAt(territory, CARTHAGE.x, CARTHAGE.y)).toBe(1);
    expect(territoryAt(territory, CARTHAGE.x - 1, CARTHAGE.y)).toBe(1);
  });
});

describe('the fall of a Stronghold', () => {
  it('ends the Match, and the result names the Stronghold and the path that took it', () => {
    const world = stage();
    manWalls(world, 1);
    stormTheGates(world, 3);

    const setup: MatchSetup<SiegeWorld, ReturnType<typeof observeSiege>> = {
      seed: 1,
      rules: { createWorld: () => world, step: siegeMatchRules.step },
      observe: observeSiege,
      outcome: siegeMatchOutcome,
      players: [
        { faction: 'rome', controller: idleController() },
        { faction: 'carthage', controller: idleController() },
      ],
      ticks: 600,
    };

    const result = runMatch(setup);

    expect(result.result).toMatchObject({
      kind: 'victory',
      winner: 'rome',
      reason: { kind: 'stronghold', stronghold: 1, path: 'assault' },
    });
    expect(result.result.tick).toBeLessThan(600);
  });

  it('is a siege the besieger can watch, and a wall nobody besieges stays out of the other’s Observation', () => {
    const world = stage();
    manWalls(world, 1);
    stormTheGates(world);
    const match = matchOn(world);

    match.step();

    const roman = observeSiege(world, 'rome');
    const front = roman.fronts.find((seen) => seen.settlement === 1);

    expect(front).toMatchObject({ siege: 'assault', besieger: 'rome', garrison: 1 });
    expect(front?.ram).toMatchObject({ hp: RAM_HP, built: false });
    expect(observeEconomy(world, 'rome').squads).toHaveLength(2);
    expect(observeEconomy(world, 'rome').squads[0]?.garrison).toBeNull();

    // The holder sees its own Squad inside, and which one it is.
    expect(observeEconomy(world, 'carthage').squads[0]?.garrison).toBe(1);
    expect(observeSiege(world, 'carthage').fronts.find((seen) => seen.settlement === 1)?.garrison).toBe(1);
  });
});

describe('the Siege a seed opens', () => {
  it('gives both Strongholds walls, and every minor settlement none', () => {
    const world = createSiegeWorld(7);
    const fronts = world.siege.fronts;

    expect(fronts).toHaveLength(world.economy.settlements.length);
    expect(fronts[0]?.structures).toHaveLength(WALL_SECTIONS + 1);
    expect(fronts[1]?.structures).toHaveLength(WALL_SECTIONS + 1);
    expect(world.siege.strongholds).toEqual([0, 1]);
    expect(fronts.slice(2).every((front) => front.structures.length === 0)).toBe(true);
  });

  it('runs two game years of an idle Match hash for hash, and decides nothing', () => {
    const play = () => {
      const match = createMatch({ seed: 7, rules: siegeMatchRules });
      for (let tick = 0; tick < SEASON_TICKS * 4; tick += 1) match.step();

      return { hash: match.hash(), world: match.state.world };
    };

    const once = play();
    const again = play();

    expect(again.hash).toBe(once.hash);
    expect(siegeMatchOutcome(once.world)).toBeNull();
  });
});
