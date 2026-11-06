/**
 * The military balance #66 asks to be **measured**, not inspected.
 *
 * A rule that reads a blow off the men brought to bear is either equivalent
 * across the sizes the roster sells or it is not, and the only way to know is to
 * run whole scenes through the public seam — Commands in, Observation out — and
 * compare numbers. This file is a bounded matrix of such scenes, each with the
 * metric it is measured by written beside it and the band it must fall in
 * declared **before** the measurement rather than chosen after it. The numbers
 * these tests reach are recorded in `docs/reviews/issue-66-military-balance.md`,
 * together with what they do not cover.
 *
 * ## The declared metric, and the band
 *
 * **Metric.** The men a body of men takes off its enemy in one round of contact,
 * and the Morale it takes off in the same round, with the angle, the ground, the
 * arms, the fatigue and the missiles held equal between the two configurations
 * being compared. Two configurations are compared wherever a size is in
 * question: the *same men* as one Squad, and as several.
 *
 * **Band.** Fifteen per cent either way. That is roughly twice the worst rounding
 * one step of the exchange chain can cost at point scale (`POINTS_PER_MAN`), and
 * wide enough to survive the remainder a divided attention hands out unevenly,
 * while still failing on anything a Player could exploit: the entity-count
 * exploits this ticket exists to close were worth four hundred per cent, not
 * fifteen.
 *
 * **Limitations, stated up front.** Every scene here is a hand-built theatre with
 * a handful of bodies on it, not a Match; the angle is held equal by giving each
 * attacker its own identical enemy on its own tile, because five Squads cannot
 * all stand on one tile's front; and none of this says anything about the value of
 * *manoeuvre*, which is what five bodies are for. Whole AI-vs-AI Matches are
 * measured separately at the end of the file, and are deliberately coarse: this
 * ticket quartermasters the balance, and the win-rate verdict over hundreds of
 * Matches is #29's.
 *
 * ## Public seam only
 *
 * Scenes are built with `musterSquad` (the scenario door) and played by
 * `siegeMatchRules.step` through `createMatch`; orders are the vocabulary's own
 * Commands, and every reading is a number the rules wrote on the world.
 */
import { describe, expect, it } from 'vitest';
import { assault, blockade, garrison, type Command } from '../../src/sim/command';
import { createFogs } from '../../src/sim/fog';
import { createEconomy, type Squad } from '../../src/sim/economy';
import { RESOURCE, tileIndex } from '../../src/sim/map';
import { createMatch, type Match } from '../../src/sim/match';
import { routeCacheFor } from '../../src/sim/movement';
import type { MapGrid, Site } from '../../src/sim/map';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import {
  applySiegeCommand,
  CAPTURE_HOLDS,
  CAPTURE_TICKS,
  createSiege,
  observeSiege,
  siegeMatchRules,
  STRUCTURE,
  type SiegeWorld,
} from '../../src/sim/siege';
import { FATIGUE_MAX, formationCode, ROUTING, type Facing } from '../../src/sim/squad';
import { ROME, CARTHAGE, testMap } from './economy-fixtures';
import { apart, BAND, body, lost } from './force-fixtures';

/** One round of contact is five ticks (`EXCHANGE_TICKS`), and a scene steps whole rounds. */
const ROUND = 5;

/** A hand-built theatre: two Strongholds, room to fight on, nothing else. */
function stage(options: { readonly minor?: Site; readonly hill?: Site } = {}): SiegeWorld {
  const map: MapGrid = testMap({
    strongholds: [ROME, CARTHAGE],
    ...(options.minor === undefined ? {} : { settlements: [options.minor] }),
    ...(options.hill === undefined ? {} : { paint: { [tileIndex(options.hill.x, options.hill.y)]: 1 } }),
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

/** A Match on a stage a scene has already shaped, so `step` advances the rules' own clock. */
function matchOn(world: SiegeWorld): Match<SiegeWorld, Command> {
  return createMatch({ seed: 1, rules: { createWorld: () => world, step: siegeMatchRules.step } });
}

/**
 * Advances a Match a whole number of ticks.
 *
 * The scenes place their bodies and give their Siege orders before the first
 * tick, which is what a Player does between two ticks; after that the Match is
 * the only thing that moves.
 */
function run(match: Match<SiegeWorld, Command>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) match.step();
}

/**
 * Gives a world one Siege Command through the rules' own entry point.
 *
 * `siegeMatchRules.step` calls exactly this before it does anything else, so a
 * scene that arranges an order before the first tick does what a click does
 * between ticks — through the same door, and not through a second copy of it.
 */
function order(world: SiegeWorld, command: Command): boolean {
  return applySiegeCommand(world, command, routeCacheFor(world.map));
}

/**
 * One configuration of a scene: `count` bodies of `men` of a type, each on a tile
 * three apart and each frontally engaged with its own identical enemy.
 *
 * Three apart, because a Squad is in contact with the tile beside it: closer and
 * the pairs would be one melee, and what is being measured is the *division of the
 * men*, not the geometry of a crowd. Each attacker therefore has the same angle
 * (front), the same ground and the same arms as every other, and the comparison
 * between "one body" and "five bodies" differs only in how the men are divided.
 */
function engagement(
  world: SiegeWorld,
  attacker: { readonly faction: 'rome' | 'carthage'; readonly type: string; readonly men: number },
  count: number,
  defender: { readonly faction: 'rome' | 'carthage'; readonly type: string; readonly men: number },
  /** Whether the bodies share one tile and so one enemy, or each has a pair of its own. */
  stacked = false,
): readonly Squad[] {
  const enemies: Squad[] = [];
  const facing: Facing = 'north';
  const against: Facing = 'south';

  if (stacked) {
    // One tile for everyone: `aspectOf` calls a blow from the same tile frontal,
    // which is the only arrangement in which several bodies all have exactly the
    // angle and the ground one body would have.
    enemies.push(body(world, defender.faction, defender.type, 20, 20, defender.men, against));
    for (let index = 0; index < count; index += 1) {
      body(world, attacker.faction, attacker.type, 20, 20, attacker.men, facing);
    }

    return enemies;
  }

  for (let index = 0; index < count; index += 1) {
    const column = 20 + index * 3;
    body(world, attacker.faction, attacker.type, column, 21, attacker.men, facing);
    enemies.push(body(world, defender.faction, defender.type, column, 20, defender.men, against));
  }

  return enemies;
}

/** A scene's enemy, played one round. */
function oneRound(world: SiegeWorld): void {
  run(matchOn(world), ROUND);
}

describe('the blow a body of men lands, across the sizes the roster sells', () => {
  /**
   * Rome's offer is 24, 60 and 120 and Carthage's is 24 and 48, so the same
   * question is asked of both rosters and each is answered against its own body:
   * the men one full-size Squad brings, and the same men divided.
   */
  const ROSTERS = [
    {
      faction: 'rome' as const,
      type: 'hastati',
      enemy: { faction: 'carthage' as const, type: 'libyan-spear', men: 48 },
      divisions: [[24, 5], [60, 2], [120, 1]] as const,
    },
    {
      faction: 'carthage' as const,
      type: 'libyan-spear',
      enemy: { faction: 'rome' as const, type: 'hastati', men: 120 },
      divisions: [[24, 2], [48, 1]] as const,
    },
  ];

  for (const roster of ROSTERS) {
    it(`lands casualties in proportion to the men, ${roster.faction} from 24 to its full body`, () => {
      const full = roster.divisions.at(-1);
      if (full === undefined) throw new Error('the roster offers nothing');

      /** What the bodies take off one enemy in one round, stacked on its tile. */
      function focused(men: number, count: number): number {
        const world = stage();
        const enemies = engagement(world, { faction: roster.faction, type: roster.type, men }, count, roster.enemy, true);
        oneRound(world);
        const taken = lost(enemies);
        expect(taken).toBeGreaterThan(0);

        return taken;
      }

      const whole = focused(full[0], full[1]);

      for (const [men, count] of roster.divisions) {
        // The same men, divided differently, take the same men off the enemy in
        // proportion to how many of the full body's men they are. Focused on one
        // enemy — `woundsOf` floors a defender's casualties once, from every blow
        // that landed on it, which is what makes the sums match at every size.
        const share = (men * count) / (full[0] * full[1]);
        expect(apart(focused(men, count), whole * share), `${String(men)} x ${String(count)} focused`)
          .toBeLessThanOrEqual(BAND);
      }
    });

    it(`gains nothing by spreading the same men over more Squads, ${roster.faction}`, () => {
      /** What the bodies take off their own enemies in one round, each pair on its own tiles. */
      function distributed(men: number, count: number): number {
        const world = stage();
        const enemies = engagement(world, { faction: roster.faction, type: roster.type, men }, count, roster.enemy);
        oneRound(world);

        return lost(enemies);
      }

      const full = roster.divisions.at(-1);
      if (full === undefined) throw new Error('the roster offers nothing');
      const whole = distributed(full[0], full[1]);

      for (const [men, count] of roster.divisions) {
        const share = (men * count) / (full[0] * full[1]);
        // Spreading the men over more enemies can *lose* a little — a defender's
        // casualties are floored once, and five small shares round down five
        // times — but it can never gain: that is the exploit this rule closes.
        expect(distributed(men, count), `${String(men)} x ${String(count)} spread`)
          .toBeLessThanOrEqual(whole * share * (1 + BAND));
      }
    });
  }

  it('does not multiply its blow by the number of enemies it is fighting', () => {
    // A 24-man body, first against one enemy and then pressed against five: the
    // shares of a divided blow are smaller than a man each, and a share too small
    // to make a man kills nobody rather than a man for every enemy it touches.
    /** What the Roman body took off the Carthaginians in one round, with `enemies` on its tile. */
    function blow(enemies: number): number {
      const world = stage();
      const attacker = body(world, 'rome', 'hastati', 20, 20, 24, 'north');
      attacker.ammunition = 0;
      const ring: Squad[] = [];
      for (let index = 0; index < enemies; index += 1) {
        ring.push(body(world, 'carthage', 'libyan-spear', 20, 20, 24, 'south'));
      }
      oneRound(world);

      return lost(ring);
    }

    expect(blow(1)).toBeGreaterThan(0);
    expect(blow(5), 'a divided blow is not a blow per enemy').toBeLessThanOrEqual(blow(1));
  });

  it('takes the same nerve off the enemy whatever number of bodies the men are in', () => {
    /** One 48-man body's Morale, after one round against `count` Roman bodies of 24. */
    function pressed(count: number): number {
      const world = stage();
      const alone = body(world, 'carthage', 'libyan-spear', 20, 20, 48, 'south');
      for (let index = 0; index < count; index += 1) body(world, 'rome', 'hastati', 20, 20, 24, 'south');
      const before = alone.morale;
      oneRound(world);

      return before - alone.morale;
    }

    // Five bodies pressing one is not five times the shock of one body pressing
    // one: 120 men shake the same nerve as 120 men, divided any way at all.
    expect(pressed(1)).toBeGreaterThan(0);
    expect(apart(pressed(5), pressed(1))).toBeLessThanOrEqual(BAND);
  });

  it('keeps the arms deciding the fight, at every size the ratio survives', () => {
    // What the matchup is worth is a ratio of the blow, so it does not depend on
    // how many men carry the arm — but a small enough body has the whole ratio
    // floored away, so the readings are taken where the roster's own rounding
    // still leaves it visible.
    /** What 120 Roman spearmen take off a Carthaginian body of `defenderType` in one round. */
    const against = (defenderType: string, men: number): number => {
      const world = stage();
      const enemy = engagement(world, { faction: 'rome', type: 'triarii', men: 120 }, 1,
        { faction: 'carthage', type: defenderType, men });
      oneRound(world);

      return lost(enemy);
    };

    const neutral = against('libyan-spear', 48);
    // A spear has the better of horse and the worse of archers.
    expect(against('numidian-horse', 12), 'spear over horse').toBeGreaterThan(neutral);
    expect(against('balearic-slinger', 24), 'spear under archers').toBeLessThan(neutral);
  });

  it('keeps the angle and the ground worth fighting for, at every size', () => {
    for (const men of [24, 48]) {
      /** What a Roman body of `men` lost to one Carthaginian body in one round. */
      const struck = (facing: Facing, where: { readonly hill?: Site } = {}): number => {
        const world = stage(where);
        const victim = body(world, 'rome', 'hastati', 20, 20, men, facing);
        body(world, 'carthage', 'libyan-spear', 20, 21, 48, 'north');
        oneRound(world);

        return lost([victim]);
      };

      // Facing the enemy, taken from behind, and taken from a hill above it: the
      // same men, and the levers worth the same share of the fight at 24 as at 48.
      const frontal = struck('south');
      expect(struck('north'), `rear at ${String(men)}`).toBeGreaterThan(frontal);
      expect(struck('south', { hill: { x: 20, y: 20 } }), `hill at ${String(men)}`).toBeLessThan(frontal);
    }
  });

  it('pays for a column and for fatigue in the same proportion at every size', () => {
    for (const men of [24, 48]) {
      /** What a Roman body of `men` takes off its enemy, shaped and rested as asked. */
      const blow = (shape: 'line' | 'column', fatigue: number): number => {
        const world = stage();
        const attacker = body(world, 'rome', 'hastati', 20, 21, men, 'north');
        attacker.formation = formationCode(shape);
        attacker.fatigue = fatigue;
        const enemy = body(world, 'carthage', 'libyan-spear', 20, 20, 48, 'south');
        oneRound(world);

        return lost([enemy]);
      };

      const inLine = blow('line', 0);
      expect(blow('column', 0), `column at ${String(men)}`).toBeLessThan(inLine);
      expect(blow('line', FATIGUE_MAX), `fatigue at ${String(men)}`).toBeLessThan(inLine);
    }
  });

  it('makes missiles a beginning, and not a way to buy damage by splitting a body', () => {
    /** What 120 Roman hastati take off their enemies in the first round, divided as asked. */
    function volley(count: number): number {
      const world = stage();
      const enemies = engagement(world, { faction: 'rome', type: 'hastati', men: 120 / count }, count,
        { faction: 'carthage', type: 'libyan-spear', men: 48 });
      oneRound(world);

      return lost(enemies);
    }

    const whole = volley(1);
    expect(whole).toBeGreaterThan(0);
    // Five bodies of 120 men between them do not out-shoot the one body they
    // could have been: a volley is a weight of missiles per man, not per Squad.
    expect(volley(5)).toBeLessThanOrEqual(whole * (1 + BAND));

    // And the missiles run out: once its volleys are spent a body deals the blow
    // of its men and nothing more.
    const spent = stage();
    const shooter = body(spent, 'rome', 'hastati', 20, 21, 120, 'north');
    shooter.ammunition = 0;
    const victim = body(spent, 'carthage', 'libyan-spear', 20, 20, 48, 'south');
    oneRound(spent);

    expect(lost([victim])).toBeLessThan(whole);
  });
});

describe('the specialists against the new infantry', () => {
  /** What a body of `type` and `men` takes off a 120-man Roman line in one round. */
  function blowOf(squadType: string, men: number): number {
    const world = stage();
    const line = engagement(world, { faction: 'carthage', type: squadType, men }, 1,
      { faction: 'rome', type: 'hastati', men: 120 });
    oneRound(world);

    return lost(line);
  }

  it('makes the elephant worth more than its points and the horse more than its riders', () => {
    // The elephant's twenty-four points of staying power hit like four-score men
    // (`impact` 4); the Numidian horse's twelve riders like twenty-four.
    const horse = blowOf('numidian-horse', 12);
    const elephant = blowOf('elephant', 24);
    const footOfTwentyFour = blowOf('gaul', 24);

    expect(horse).toBeGreaterThan(blowOf('gaul', 12));
    expect(elephant).toBeGreaterThan(footOfTwentyFour);
    expect(elephant).toBeGreaterThan(horse);
  });

  it('makes the slinger a missile body: weak in the melee and worth more while it has stones', () => {
    /** The men a slinger body takes off a 48-man line in one round, missiles or none. */
    function firstRound(armed: boolean): number {
      const world = stage();
      const slingers = body(world, 'carthage', 'balearic-slinger', 20, 20, 24, 'south');
      if (!armed) slingers.ammunition = 0;
      const line = body(world, 'rome', 'hastati', 20, 21, 48, 'north');
      oneRound(world);

      return lost([line]);
    }

    expect(firstRound(true)).toBeGreaterThan(firstRound(false));

    /** A body's blow with its missiles spent. */
    function meleeBlowOf(squadType: string, men: number): number {
      const world = stage();
      const line = engagement(world, { faction: 'carthage', type: squadType, men }, 1,
        { faction: 'rome', type: 'hastati', men: 120 });
      const attacker = world.economy.squads.find((squad) => squad.owner === 1);
      if (attacker === undefined) throw new Error('the stage mustered no attacker');
      attacker.ammunition = 0;
      oneRound(world);

      return lost(line);
    }

    // A slinger's melee is a 24-man body's, not a line's: it is the volleys that
    // make it worth raising, which is what a missile arm is for.
    expect(meleeBlowOf('balearic-slinger', 24)).toBeLessThan(meleeBlowOf('gaul', 48));
  });
});

describe('the Siege reads men and not Squads', () => {
  /** The hit points left on every stretch of wall, added up. */
  function walls(world: SiegeWorld): number {
    return (world.siege.fronts[1]?.structures ?? [])
      .filter((structure) => structure.kind === STRUCTURE.wall)
      .reduce((total, structure) => total + structure.hp, 0);
  }

  /** Equal forces distributed outside the west perimeter, each one Tile from the Walls. */
  function storming(men: number, count: number): { world: SiegeWorld; squads: readonly Squad[] } {
    const world = stage();
    const squads: Squad[] = [];
    for (let index = 0; index < count; index += 1) {
      squads.push(body(world, 'rome', 'principes', CARTHAGE.x - 8, CARTHAGE.y + (index - (count - 1) / 2) * 4, men, 'east'));
    }
    world.economy.treasuries[0] = 0;
    expect(order(world, assault('rome', squads.map((squad) => squad.id), 1))).toBe(true);

    return { world, squads };
  }

  it('works a wall at a body’s rate, however many Squads the men are drawn as', () => {
    const one = storming(120, 1);
    const beforeOne = walls(one.world);
    run(matchOn(one.world), 10 * 12);
    const byOne = beforeOne - walls(one.world);

    const many = storming(24, 5);
    const beforeMany = walls(many.world);
    run(matchOn(many.world), 10 * 12);
    const byFive = beforeMany - walls(many.world);

    expect(byOne).toBeGreaterThan(0);
    expect(byFive).toBeGreaterThan(0);
    expect(apart(byFive, byOne)).toBeLessThanOrEqual(BAND);
  });

  it('costs the men under the walls in proportion to their own body', () => {
    // A body of 120 pays five men an assault round; a body of 24 pays one, and
    // five of them pay five between them — the same men, not five times the loss.
    const one = storming(120, 1);
    run(matchOn(one.world), 10 * 6);
    const paidByOne = lost(one.squads);

    const many = storming(24, 5);
    run(matchOn(many.world), 10 * 6);
    const paidByFive = lost(many.squads);

    expect(paidByOne).toBeGreaterThan(0);
    expect(apart(paidByFive, paidByOne)).toBeLessThanOrEqual(BAND);
  });

  it('defends the ram with the men on the wall, not with the Squads they are drawn as', () => {
    /** The ram left, after one assault by 120 men on a garrison of 120 in `shape`. */
    function afterElevenRounds(shape: readonly number[]): number {
      const world = stage();
      world.economy.settlements[1]!.tier = 2; // 120 defenders fit the Tier II wall-duty capacity.
      const holders: Squad[] = [];
      for (const men of shape) {
        const holder = body(world, 'carthage', 'libyan-spear', CARTHAGE.x, CARTHAGE.y, men);
        holders.push(holder);
        expect(order(world, garrison('carthage', [holder.id], 1))).toBe(true);
        run(matchOn(world), 60);
      }
      const admitted = observeSiege(world, 'carthage').squads;
      expect(holders.every((holder) => admitted.find((squad) => squad.id === holder.id)?.garrison === 1)).toBe(true);

      const attacker = body(world, 'rome', 'principes', CARTHAGE.x - 8, CARTHAGE.y, 120, 'east');
      world.economy.treasuries[0] = 15;
      expect(order(world, assault('rome', [attacker.id], 1))).toBe(true);
      // Long enough for the ram to be paid for, built, and worked for a few rounds.
      run(matchOn(world), 10 * 11);

      return world.siege.fronts[1]?.ram ?? 0;
    }

    // 120 men as five bodies of 24, and as two of 48 and one of 24: Carthage's
    // melee tops out at 48, so the second is the fewest bodies the same men fit in.
    const five = afterElevenRounds([24, 24, 24, 24, 24]);
    const one = afterElevenRounds([48, 48, 24]);

    expect(one).toBeGreaterThanOrEqual(0);
    expect(apart(one, five)).toBeLessThanOrEqual(BAND);
  });

  it('starves a town by the Season, not by the number of Squads in the ring', () => {
    /** The grain one Season of blockade costs, with 120 men in `count` bodies round the town. */
    function starved(count: number): number {
      const world = stage();
      const ring: Squad[] = [];
      for (let index = 0; index < count; index += 1) {
        ring.push(body(world, 'rome', 'hastati', CARTHAGE.x - 8, CARTHAGE.y + (index - (count - 1) / 2) * 4, 120 / count, 'east'));
      }
      // 120 men in `count` bodies of the roster's own sizes: `120 / count` is 120
      // for one body and 24 for five, both of which the roster sells.
      expect(ring.reduce((men, squad) => men + squad.capacity, 0)).toBe(120);
      const settlement = world.economy.settlements[1];
      if (settlement === undefined) throw new Error('the stage has no Carthaginian settlement');
      const before = settlement.stocks[RESOURCE.grain] ?? 0;
      expect(order(world, blockade('rome', ring.map((squad) => squad.id), 1))).toBe(true);
      run(matchOn(world), SEASON_TICKS + 1);

      return before - (settlement.stocks[RESOURCE.grain] ?? 0);
    }

    const one = starved(1);
    const five = starved(5);

    expect(one).toBeGreaterThan(0);
    expect(five).toBe(one);
  });

  it('takes an undefended village with one small body', () => {
    const village: Site = { x: 40, y: 40 };
    const world = stage({ minor: village });
    const handful = body(world, 'rome', 'hastati', village.x, village.y, 24);
    expect(handful.strength).toBe(24);

    run(matchOn(world), CAPTURE_TICKS * (CAPTURE_HOLDS + 1));

    expect(world.economy.settlements[2]?.owner).toBe(0);
  });

  it('gives a contested centre to the larger body of men', () => {
    const village: Site = { x: 40, y: 40 };
    const world = stage({ minor: village });
    const big = body(world, 'rome', 'triarii', village.x, village.y, 120);
    const small = body(world, 'carthage', 'libyan-spear', village.x, village.y, 24);

    run(matchOn(world), CAPTURE_TICKS * (CAPTURE_HOLDS + 1));

    // The larger body holds the ground and the smaller one is brushed aside by
    // the fight over the tile, not by a count of Squads.
    expect(big.strength).toBeGreaterThan(0);
    expect(small.strength < 24 || small.routing === ROUTING.routed).toBe(true);
    // And the ground went with the men: the larger body took the village.
    expect(world.economy.settlements[2]?.owner).toBe(0);
  });
});
