/**
 * Combat and morale, one acceptance criterion at a time (ticket C3).
 *
 * Every question here is asked through the seam the game itself uses: Squads are
 * raised through C1's scenario door, the rules are combat's own (`fight`,
 * `exchangeOf`, `applyCombatCommands`), orders arrive as Commands through the
 * vocabulary, and what a Faction may see is an Observation. Two of the criteria
 * are about a *number* — terrain, fatigue and ammunition have to change an
 * otherwise identical fight — so those are asked of `exchangeOf`, which is the
 * module's own statement of what one round does, and the rest are asked of whole
 * fights so that the levers are shown to matter and not merely to be read.
 */
import { describe, expect, it } from 'vitest';
import { attack, attackMove, withdraw, type Command } from '../../src/sim/command';
import {
  applyCombatCommands,
  engagedWith,
  exchangeOf,
  EXCHANGE_TICKS,
  FATIGUE_PENALTY,
  fight,
  inContact,
  inSupply,
  RALLY_MORALE,
  RALLY_RADIUS,
  SUPPLY_MORALE_LOSS,
  resupply,
  supplyMorale,
} from '../../src/sim/combat';
import { scriptedController } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import { chargePayroll, createEconomy, type Squad } from '../../src/sim/economy';
import {
  economyMatchOutcome,
  economyMatchRules,
  observeEconomy,
  type EconomyWorld,
} from '../../src/sim/economy-match';
import { squadTypeOf } from '../../src/content';
import type { Faction } from '../../src/sim/faction';
import { hashState } from '../../src/sim/hash';
import { tileX, tileY, type MapGrid, type Site } from '../../src/sim/map';
import type { MatchRules } from '../../src/sim/match';
import { march, musterSquad, orderSquadTo, routeCacheFor, type Placement } from '../../src/sim/movement';
import { createMatch } from '../../src/sim/match';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import { FATIGUE_MAX, ROUTING, type Facing } from '../../src/sim/squad';
import { paintedMap } from './test-map';

/**
 * A world on a theatre a test painted.
 *
 * The two Strongholds are brought close to the fighting ground on purpose: a
 * Squad far from its own country loses morale from being cut off, and the tests
 * about terrain, fatigue and the matchup want an otherwise *identical* fight,
 * not one with Supply quietly moving the morale of one side.
 */
function worldOf(rows: readonly string[] = [], x = 20, y = 20): EconomyWorld {
  const painted = paintedMap(rows, x, y);
  const map: MapGrid = { ...painted, strongholds: [{ x: 5, y: 5 }, { x: 5, y: 30 }] };

  return { map, calendar: startCalendar(), economy: createEconomy(map), autumns: 0, winters: 0 };
}

/** A Squad stood where the test wants it, at full strength and in good order. */
function muster(
  world: EconomyWorld,
  options: {
    readonly faction?: Faction;
    readonly squadType?: string;
    readonly x?: number;
    readonly y?: number;
    readonly facing?: Facing;
  } = {},
): Squad {
  const faction = options.faction ?? 'rome';

  return musterSquad(world.economy, world.map, {
    faction,
    squadType: options.squadType ?? (faction === 'rome' ? 'hastati' : 'libyan-spear'),
    x: options.x ?? 20,
    y: options.y ?? 20,
    ...(options.facing === undefined ? {} : { facing: options.facing }),
  });
}

/**
 * Two equal blocks, front to front, differing only in their arms: what one blow
 * does to the other in a fight that is otherwise the same fight.
 */
function duel(
  attackerType: string,
  defenderType: string,
  attackerFaction: Faction = 'rome',
): ReturnType<typeof exchangeOf> {
  const world = worldOf();
  const attacker = muster(world, {
    faction: attackerFaction,
    squadType: attackerType,
    x: 20,
    y: 20,
    facing: 'south',
  });
  const defender = muster(world, {
    faction: attackerFaction === 'rome' ? 'carthage' : 'rome',
    squadType: defenderType,
    x: 20,
    y: 21,
    facing: 'north',
  });

  for (const squad of [attacker, defender]) {
    squad.strength = 120;
    squad.ammunition = 0;
  }

  return exchangeOf(attacker, defender, world.map);
}

/** A pair in contact, each side with the other's front. */
function frontalPair(world: EconomyWorld = worldOf()): { roman: Squad; carthaginian: Squad } {
  const roman = muster(world, { x: 20, y: 20, facing: 'south' });
  const carthaginian = muster(world, { faction: 'carthage', x: 20, y: 21, facing: 'north' });

  return { roman, carthaginian };
}

/** The same pair with the Roman facing away: the Carthaginian has its rear. */
function rearPair(world: EconomyWorld = worldOf()): { roman: Squad; carthaginian: Squad } {
  const roman = muster(world, { x: 20, y: 20, facing: 'north' });
  const carthaginian = muster(world, { faction: 'carthage', x: 20, y: 21, facing: 'north' });

  return { roman, carthaginian };
}

/**
 * Runs rounds of contact the way the Match's tick does — a march, then the
 * round — on the ticks a round falls on.
 */
function rounds(world: EconomyWorld, count: number, from = 0): void {
  for (let round = 0; round < count; round += 1) {
    const tick = from + round * EXCHANGE_TICKS;
    march(world.economy, world.map);
    fight(world.economy, world.map, tick, routeCacheFor(world.map));
  }
}

/** The round at which a Squad is first seen running, or `null` if it never breaks. */
function roundBroken(world: EconomyWorld, squad: Squad, limit = 60): number | null {
  for (let round = 0; round < limit; round += 1) {
    if (squad.routing === ROUTING.routed) return round;

    march(world.economy, world.map);
    fight(world.economy, world.map, round * EXCHANGE_TICKS, routeCacheFor(world.map));
  }

  return null;
}

/** The tile the Faction's own country is nearest to: what a beaten Squad runs for. */
function home(world: EconomyWorld): Site {
  return world.map.strongholds[0] ?? { x: 0, y: 0 };
}

/** A Squad's men, or a failure: a test that cannot find it has nothing to assert about. */
function squadOf(world: EconomyWorld, id: number): Squad {
  const found = world.economy.squads.find((squad) => squad.id === id);
  if (found === undefined) throw new Error(`there is no Squad ${id} in the world`);

  return found;
}

describe('two Squads in contact', () => {
  it('resolves from the same state to the same state, dead and all', () => {
    const first = worldOf();
    const second = worldOf();

    frontalPair(first);
    frontalPair(second);

    rounds(first, 20);
    rounds(second, 20);

    expect(hashState(first)).toBe(hashState(second));

    // And the fight actually happened, so "two empty worlds hash alike" is not
    // what passed.
    const [roman] = first.economy.squads;
    expect(roman?.strength).toBeLessThan(120);
    expect(roman?.morale).toBeLessThan(10);
  });

  it('wears both sides down in the same round, so neither side strikes first', () => {
    const world = worldOf();
    const { roman, carthaginian } = frontalPair(world);

    fight(world.economy, world.map, 0, routeCacheFor(world.map));

    expect(roman.strength).toBeLessThan(120);
    expect(carthaginian.strength).toBeLessThan(120);
    expect(roman.morale).toBeLessThan(10);
    expect(carthaginian.morale).toBeLessThan(9);
  });

  it('fights only on the rounds of contact, so most ticks cost nothing', () => {
    const world = worldOf();
    const { roman } = frontalPair(world);

    fight(world.economy, world.map, 1, routeCacheFor(world.map));

    expect(roman.strength).toBe(120);
    expect(roman.morale).toBe(10);
  });

  it('does not fight a Squad it is merely near, or one that is its own', () => {
    const world = worldOf();
    const roman = muster(world, { x: 20, y: 20 });
    const comrade = muster(world, { x: 21, y: 20 });
    const far = muster(world, { faction: 'carthage', x: 20, y: 22 });

    expect(inContact(roman, comrade)).toBe(true);
    expect(inContact(roman, far)).toBe(false);

    fight(world.economy, world.map, 0, routeCacheFor(world.map));

    expect(roman.strength).toBe(120);
    expect(comrade.strength).toBe(120);
    expect(far.strength).toBe(120);
  });
});

describe('the matchup matrix in a fight', () => {
  it('gives the spear the better of the cavalry, and the cavalry the worse of the spear', () => {
    // Two worlds of the same shape, differing only in what the enemy carries:
    // an equal-strength block of horse, and one of spearmen, both taken front on.
    const againstHorse = duel('triarii', 'numidian-horse');
    const againstSpear = duel('triarii', 'libyan-spear');

    expect(againstHorse.men).toBeGreaterThan(againstSpear.men);
    // The edge is morale as well as men: a spear breaking cavalry is a shock.
    expect(againstHorse.morale).toBeGreaterThan(againstSpear.morale);

    // And the same edge from the other side: horse against a spear line strikes
    // for less than a spear line against a spear line.
    const horseAgainstSpear = duel('numidian-horse', 'triarii', 'carthage');
    const spearAgainstSpear = duel('libyan-spear', 'triarii', 'carthage');

    expect(horseAgainstSpear.men).toBeLessThan(spearAgainstSpear.men);
  });
});

describe('flanking and rear attacks', () => {
  it('costs more men and more morale than a frontal attack', () => {
    const frontalWorld = worldOf();
    const frontal = frontalPair(frontalWorld);
    const flanked = worldOf();
    const roman = muster(flanked, { x: 20, y: 20, facing: 'east' });
    const carthaginian = muster(flanked, { faction: 'carthage', x: 20, y: 21, facing: 'north' });

    expect(exchangeOf(carthaginian, roman, flanked.map).men).toBeGreaterThan(
      exchangeOf(frontal.carthaginian, frontal.roman, frontalWorld.map).men,
    );
    expect(exchangeOf(carthaginian, roman, flanked.map).morale).toBeGreaterThan(
      exchangeOf(frontal.carthaginian, frontal.roman, frontalWorld.map).morale,
    );
    expect(exchangeOf(roman, carthaginian, flanked.map).men).toBeLessThan(
      exchangeOf(frontal.roman, frontal.carthaginian, frontalWorld.map).men,
    );
  });

  it('hits hardest from behind, and the flanked side strikes weakly in return', () => {
    const frontWorld = worldOf();
    const front = frontalPair(frontWorld);
    const rearWorld = worldOf();
    const rear = rearPair(rearWorld);

    const frontal = exchangeOf(front.carthaginian, front.roman, frontWorld.map);
    const fromBehind = exchangeOf(rear.carthaginian, rear.roman, rearWorld.map);

    expect(fromBehind.men).toBeGreaterThan(frontal.men);
    expect(fromBehind.morale).toBeGreaterThan(frontal.morale);

    // What the flanked Squad does about it is the other half: its front is
    // facing the wrong way, so the same men do far less than they do face to
    // face.
    expect(exchangeOf(rear.roman, rear.carthaginian, rearWorld.map).men).toBeLessThan(
      exchangeOf(front.roman, front.carthaginian, frontWorld.map).men,
    );
  });

  it('is visibly worth manoeuvring for: the same fight breaks in a third of the time', () => {
    const front = worldOf();
    const ahead = frontalPair(front);
    const rear = worldOf();
    const behind = rearPair(rear);

    // The same men against the same men, and nothing but the angle between them.
    for (const squad of [ahead.roman, ahead.carthaginian, behind.roman, behind.carthaginian]) {
      squad.morale = 10;
      squad.ammunition = 0;
    }

    const frontRounds = roundBroken(front, ahead.roman);
    const rearRounds = roundBroken(rear, behind.roman);

    expect(frontRounds).not.toBeNull();
    expect(rearRounds).not.toBeNull();
    expect(rearRounds ?? 0).toBeLessThan(frontRounds ?? 0);
  });
});

describe('terrain, fatigue and ammunition', () => {
  it('makes a hill harder to assault and a ford a worse place to fight from', () => {
    const plain = worldOf();
    const pair = frontalPair(plain);
    const onPlain = exchangeOf(pair.carthaginian, pair.roman, plain.map);

    const hill = worldOf(['^'], 20, 20);
    const uphill = frontalPair(hill);

    const ford = worldOf(['='], 20, 20);
    const disordered = frontalPair(ford);

    expect(exchangeOf(uphill.carthaginian, uphill.roman, hill.map).men).toBeLessThan(onPlain.men);
    // A Squad standing in a ford takes more shock and strikes for less, because
    // the crossing disorders it rather than merely slowing it (GLOSSARY: Ford).
    expect(exchangeOf(disordered.carthaginian, disordered.roman, ford.map).morale).toBeGreaterThan(
      onPlain.morale,
    );
    expect(exchangeOf(disordered.roman, disordered.carthaginian, ford.map).men).toBeLessThan(
      exchangeOf(pair.roman, pair.carthaginian, plain.map).men,
    );
  });

  it('makes cavalry in a forest strike for less than cavalry on open ground', () => {
    const plain = worldOf();
    const open = muster(plain, { faction: 'carthage', squadType: 'numidian-horse', x: 20, y: 21, facing: 'north' });
    const target = muster(plain, { x: 20, y: 20, facing: 'south' });
    open.strength = 120;
    target.strength = 120;

    const forest = worldOf(['f'], 20, 21);
    const tangled = muster(forest, { faction: 'carthage', squadType: 'numidian-horse', x: 20, y: 21, facing: 'north' });
    const victim = muster(forest, { x: 20, y: 20, facing: 'south' });
    tangled.strength = 120;
    victim.strength = 120;

    expect(exchangeOf(tangled, victim, forest.map).men).toBeLessThan(
      exchangeOf(open, target, plain.map).men,
    );
  });

  it('makes a tired Squad strike for less, and a march is what tires it', () => {
    const world = worldOf();
    const { roman, carthaginian } = frontalPair(world);
    const fresh = exchangeOf(roman, carthaginian, world.map).men;

    roman.fatigue = FATIGUE_MAX;

    expect(exchangeOf(roman, carthaginian, world.map).men).toBeLessThan(fresh);
    expect(FATIGUE_PENALTY).toBeGreaterThan(0);

    // A march costs fatigue, and standing still out of contact pays it back.
    const walker = muster(world, { x: 40, y: 40 });
    orderSquadTo(world.map, walker, { x: 40, y: 50 }, routeCacheFor(world.map));
    rounds(world, 4);
    expect(walker.fatigue).toBeGreaterThan(0);

    walker.steps = [];
    rounds(world, FATIGUE_MAX);
    expect(walker.fatigue).toBe(0);
  });

  it('makes the first volleys count, and then stops counting', () => {
    const world = worldOf();
    const { roman, carthaginian } = frontalPair(world);

    expect(roman.ammunition).toBeGreaterThan(0);
    const withMissiles = exchangeOf(roman, carthaginian, world.map);

    roman.ammunition = 0;
    const withoutMissiles = exchangeOf(roman, carthaginian, world.map);

    expect(withMissiles.men).toBeGreaterThan(withoutMissiles.men);
    expect(withMissiles.morale).toBeGreaterThan(withoutMissiles.morale);
  });

  it('spends a volley a round, so missiles are a beginning and not a whole battle', () => {
    const world = worldOf();
    const { roman } = frontalPair(world);
    const carried = roman.ammunition;

    expect(carried).toBeGreaterThan(0);
    rounds(world, carried + 2);

    expect(roman.ammunition).toBe(0);
  });
});

describe('breaking, running and rallying', () => {
  it('breaks rather than dying to the last man, and runs for its own country', () => {
    const world = worldOf();
    const { roman } = rearPair(world);
    const home: Site = world.map.strongholds[0] ?? { x: 0, y: 0 };
    const away = Math.abs(roman.x - home.x) + Math.abs(roman.y - home.y);

    expect(roundBroken(world, roman)).not.toBeNull();
    expect(roman.routing).toBe(ROUTING.routed);
    expect(roman.strength).toBeGreaterThan(1);
    expect(roman.steps.length).toBeGreaterThan(0);

    // And it is running home, not standing where it was broken.
    rounds(world, 6, 200);
    const nearer = Math.abs(roman.x - home.x) + Math.abs(roman.y - home.y);
    expect(nearer).toBeLessThan(away);
    expect(roman.strength).toBeGreaterThanOrEqual(1);
  });

  it('is never annihilated while a route out exists, however hard it is pressed', () => {
    const world = worldOf();
    const { roman, carthaginian } = rearPair(world);

    roman.routing = ROUTING.routed;
    roman.strength = 3;
    roman.morale = 0;
    // Somewhere to run is the whole of the claim, so the route is given here and
    // never walked: the enemy is kept at its back every round.
    orderSquadTo(world.map, roman, home(world), routeCacheFor(world.map));

    for (let round = 0; round < 40; round += 1) {
      // The enemy is kept at its back, so the chase never ends; the route out is
      // what keeps the block alive.
      carthaginian.x = roman.x;
      carthaginian.y = roman.y + 1;
      fight(world.economy, world.map, round * EXCHANGE_TICKS, routeCacheFor(world.map));
    }

    expect(squadOf(world, roman.id).strength).toBeGreaterThanOrEqual(1);
    expect(roman.routing).toBe(ROUTING.routed);
  });

  it('survives the very round it breaks, if it has somewhere to run', () => {
    const world = worldOf();
    const { roman, carthaginian } = frontalPair(world);

    // One round from breaking, pressed hard enough to be destroyed by the blow
    // that breaks it, and with an order it can run along. It gets away at one
    // man rather than being cut down on the tick it loses its nerve.
    roman.morale = 1;
    roman.strength = 5;
    orderSquadTo(world.map, roman, home(world), routeCacheFor(world.map));

    fight(world.economy, world.map, 0, routeCacheFor(world.map));

    expect(roman.routing).toBe(ROUTING.routed);
    expect(squadOf(world, roman.id).strength).toBe(1);
    expect(carthaginian.strength).toBeLessThan(120);
  });

  it('is destroyed when there is nowhere left to run', () => {
    const world = worldOf();
    const pair = frontalPair(world);
    pair.carthaginian.strength = 3;

    for (let round = 0; round < 10; round += 1) {
      fight(world.economy, world.map, round * EXCHANGE_TICKS, routeCacheFor(world.map));
    }

    expect(world.economy.squads.some((squad) => squad.id === pair.carthaginian.id)).toBe(false);
  });

  it('rallies by itself once the ground behind it is quiet, and not before', () => {
    const world = worldOf();
    const { roman, carthaginian } = rearPair(world);

    expect(roundBroken(world, roman)).not.toBeNull();

    // The enemy stays where it was: while it is inside the rally radius the
    // beaten Squad keeps running and does not recover its nerve.
    for (let round = 0; round < 3; round += 1) {
      fight(world.economy, world.map, round * EXCHANGE_TICKS, routeCacheFor(world.map));
      if (roman.routing === ROUTING.routed) expect(roman.morale).toBeLessThan(RALLY_MORALE);
    }

    // Now let it get away, and it forms up on its own.
    let tick = 100;
    for (let round = 0; round < 200 && roman.routing === ROUTING.routed; round += 1) {
      march(world.economy, world.map);
      fight(world.economy, world.map, tick, routeCacheFor(world.map));
      tick += EXCHANGE_TICKS;
    }

    expect(Math.max(Math.abs(roman.x - carthaginian.x), Math.abs(roman.y - carthaginian.y))).toBeGreaterThan(
      RALLY_RADIUS,
    );
    expect(roman.routing).toBe(ROUTING.held);
    expect(roman.morale).toBeGreaterThanOrEqual(RALLY_MORALE);
    expect(roman.steps).toEqual([]);
  });

  it('ignores the orders of the hand that got it broken', () => {
    const world = worldOf();
    const { roman, carthaginian } = rearPair(world);

    roman.routing = ROUTING.routed;
    roman.morale = 0;
    const before = [...roman.steps];

    applyCombatCommands(
      world.economy,
      world.map,
      [attack('rome', [roman.id], carthaginian.id), withdraw('rome', [roman.id])],
      routeCacheFor(world.map),
    );

    // Neither order took: a running Squad is moved by its rout and by nothing
    // else, and there is no manual rallying in this game.
    expect(roman.steps).toEqual(before);
    expect(roman.routing).toBe(ROUTING.routed);
  });
});

describe('the economy on the battlefield', () => {
  it('loses morale when it is cut off from the settlements that feed it', () => {
    const world = worldOf();
    const cutOff = muster(world, { x: 60, y: 60 });
    const atHome = muster(world, { x: 4, y: 4 });

    expect(inSupply(world.economy, cutOff)).toBe(false);
    expect(inSupply(world.economy, atHome)).toBe(true);

    supplyMorale(world.economy);

    expect(cutOff.morale).toBe(10 - SUPPLY_MORALE_LOSS);
    expect(atHome.morale).toBe(10);
  });

  it('is charged for being cut off at a Season boundary, as one rule with Payroll', () => {
    const match = createMatch({ seed: 3, rules: economyMatchRules });
    const world = match.state.world;
    const [home] = world.economy.settlements;
    const away = { x: home?.x ?? 0, y: home?.y ?? 0 };
    const cutOff = musterSquad(world.economy, world.map, {
      faction: 'rome',
      squadType: 'hastati',
      x: away.x,
      y: away.y,
    });

    for (let tick = 0; tick < SEASON_TICKS - 1; tick += 1) match.step();

    // No Season has turned yet, so the march has not been charged for.
    expect(cutOff.morale).toBeGreaterThanOrEqual(10 - SUPPLY_MORALE_LOSS);
  });

  it('does not get its nerve back by standing still: morale is the economy’s resource too', () => {
    const world = worldOf();
    const soldier = muster(world, { x: 4, y: 4 });
    soldier.morale = 4;

    for (let tick = 0; tick <= 200; tick += EXCHANGE_TICKS) {
      fight(world.economy, world.map, tick, routeCacheFor(world.map));
    }

    // A Season of pay is what recovers it (`chargePayroll`), and nothing in the
    // fight's upkeep does.
    expect(soldier.morale).toBe(4);
  });

  it('restocks missiles in its own country at a Season boundary, and nowhere else', () => {
    const world = worldOf();
    const atHome = muster(world, { x: 4, y: 4 });
    const cutOff = muster(world, { x: 70, y: 70 });

    atHome.ammunition = 0;
    cutOff.ammunition = 0;

    resupply(world.economy);

    expect(atHome.ammunition).toBe(squadTypeOf(atHome.type)?.ammunition);
    expect(cutOff.ammunition).toBe(0);
  });

  it('fights worse for having gone unpaid, because Payroll is morale', () => {
    const world = worldOf();
    const { roman } = frontalPair(world);
    world.economy.treasuries[0] = 0;

    chargePayroll(world.economy);

    expect(roman.morale).toBe(8);
    expect(roman.unpaid).toBe(1);
  });

  it('feeds the battlefield: an unpaid Squad breaks sooner than a paid one', () => {
    const paid = worldOf();
    const unpaid = worldOf();
    const paidPair = rearPair(paid);
    const unpaidPair = rearPair(unpaid);

    unpaid.economy.treasuries[0] = 0;
    chargePayroll(unpaid.economy);

    expect(unpaidPair.roman.morale).toBeLessThan(paidPair.roman.morale);

    const unpaidRounds = roundBroken(unpaid, unpaidPair.roman);
    const paidRounds = roundBroken(paid, paidPair.roman);

    expect(unpaidRounds).not.toBeNull();
    expect(paidRounds).not.toBeNull();
    expect(unpaidRounds ?? 0).toBeLessThan(paidRounds ?? 0);
  });
});

describe('the fight as a Command and as an Observation', () => {
  it('closes with the Squad an attack names', () => {
    const world = worldOf();
    const roman = muster(world, { x: 20, y: 20 });
    const enemy = muster(world, { faction: 'carthage', x: 26, y: 20 });

    applyCombatCommands(
      world.economy,
      world.map,
      [attack('rome', [roman.id], enemy.id)],
      routeCacheFor(world.map),
    );

    expect(roman.steps.length).toBeGreaterThan(0);

    for (let step = 0; step < 40 && !inContact(roman, enemy); step += 1) march(world.economy, world.map);

    expect(inContact(roman, enemy)).toBe(true);
  });

  it('falls back on the nearest settlement its Faction holds when told to withdraw', () => {
    const world = worldOf();
    const roman = muster(world, { x: 20, y: 20 });
    const [stronghold] = world.map.strongholds;

    applyCombatCommands(
      world.economy,
      world.map,
      [withdraw('rome', [roman.id])],
      routeCacheFor(world.map),
    );

    const goal = roman.steps.at(-1);
    expect(goal).toBeDefined();
    expect(goal === undefined ? null : { x: tileX(goal), y: tileY(goal) }).toEqual(stronghold);
  });

  it('reports the fight to its own Faction: men, fatigue, missiles and whether it has broken', () => {
    const world = worldOf();
    const { roman } = frontalPair(world);

    rounds(world, 4);

    const visible = observeEconomy(world, 'rome').squads.find((squad) => squad.id === roman.id);

    expect(visible).toBeDefined();
    expect(visible?.engaged).toBe(true);
    expect(visible?.men).toBeLessThan(120);
    expect(visible?.morale).toBeLessThan(10);
    expect(visible?.ammunition).toBeLessThan(4);
    expect(visible?.fatigue).toBeGreaterThan(0);
    expect(visible?.routing).toBe(roman.routing === ROUTING.routed);
  });

  it('keeps an enemy’s Squad out of an Observation, contact or no contact', () => {
    const world = worldOf();
    const { roman, carthaginian } = frontalPair(world);

    rounds(world, 2);

    const seen = observeEconomy(world, 'rome').squads;

    expect(seen.some((squad) => squad.id === roman.id)).toBe(true);
    expect(seen.some((squad) => squad.id === carthaginian.id)).toBe(false);
    expect(engagedWith(world.economy, roman)?.id).toBe(carthaginian.id);
  });

  it('plays a whole fight through the rules of the Match, and replays it exactly', () => {
    const placements: readonly Placement[] = [
      { faction: 'rome', squadType: 'hastati', x: 40, y: 40 },
      { faction: 'carthage', squadType: 'libyan-spear', x: 48, y: 40 },
    ];
    const rules: MatchRules<EconomyWorld, Command> = {
      createWorld: () => {
        const world = worldOf();
        for (const placement of placements) musterSquad(world.economy, world.map, placement);

        return world;
      },
      step: economyMatchRules.step,
    };

    const play = () =>
      runMatch({
        seed: 9,
        rules,
        observe: observeEconomy,
        outcome: economyMatchOutcome,
        ticks: 400,
        players: [
          {
            faction: 'rome',
            controller: scriptedController([
              { tick: 0, command: attackMove('rome', [1], 44, 40) },
              { tick: 200, command: attackMove('rome', [1], 48, 40) },
            ]),
          },
          {
            faction: 'carthage',
            controller: scriptedController([
              { tick: 0, command: attackMove('carthage', [2], 44, 40) },
              { tick: 200, command: attackMove('carthage', [2], 40, 40) },
            ]),
          },
        ],
      });

    const first = play();
    const second = play();

    expect(first.hash).toBe(second.hash);
    expect(first.result.kind).toBe('clock');
  });
});
