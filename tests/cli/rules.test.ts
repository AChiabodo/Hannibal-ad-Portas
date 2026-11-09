import { describe, expect, it } from 'vitest';
import { CHECKPOINT_TICKS } from '../../src/cli/record';
import {
  DEFAULT_RULES,
  attritionLog,
  attritionWorld,
  drawsRules,
  isRulesName,
  marchLog,
  marchWorld,
  rosterWorld,
  RULES,
  RULES_NAMES,
  type DrawsWorld,
} from '../../src/cli/rules';
import type { Command } from '../../src/sim/command';
import { scriptedController } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import { economyMatchOutcome, economyMatchRules, observeEconomy } from '../../src/sim/economy-match';
import { factionCode } from '../../src/sim/faction';
import { isWalkable, terrainAt } from '../../src/sim/map';
import { createMatch, type Match } from '../../src/sim/match';
import type { RngState } from '../../src/sim/rng';
import { holdsTerritory, inCamp, territoryOf } from '../../src/sim/territory';
import { HEADLESS_TICKS } from '../../src/sim/season';
import type { EconomyVisible, EconomyWorld } from '../../src/sim/economy-match';
import { SQUAD_TYPES, squadTypeOf, squadTypesOf } from '../../src/content';

/** The cursor of a Match, copied, so a later draw cannot rewrite what was read. */
function cursor(match: Match<DrawsWorld, Command>): RngState {
  return { ...match.state.rng };
}

describe('a Match whose rules draw, which is what CI needs a golden hash of', () => {
  it('leaves the random cursor somewhere else after one tick: the draw loop runs', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const before = cursor(match);

    match.step();

    expect(cursor(match)).not.toEqual(before);
  });

  it('draws at least once on every tick: no two cursors in the Match are the same', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const cursors = [JSON.stringify(cursor(match))];

    for (let tick = 0; tick < 5; tick += 1) {
      match.step();
      cursors.push(JSON.stringify(cursor(match)));
    }

    // The cursor before the first tick and after each of five: six spellings,
    // all different, so the generator advanced on every tick rather than once.
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it('takes both kinds of draw: a whole word, and an unbiased digit in [0, 9]', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });

    match.step();

    expect(match.state.world.word).toBeGreaterThanOrEqual(0);
    expect(match.state.world.word).toBeLessThan(0x1_0000_0000);
    expect(match.state.world.digit).toBeGreaterThanOrEqual(0);
    expect(match.state.world.digit).toBeLessThanOrEqual(9);
    expect(match.state.world.total).toBe(match.state.world.digit);
  });

  it('draws both ways round: the words differ between ticks, and the digits are not all zero', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const words = new Set<number>();
    let digits = 0;

    // Thirty-two ticks, so the strong claim here is the second one: a digit
    // that came from the generator sums to more than zero with probability
    // 1 - (1/10)^32, while a digit that is never drawn at all sums to exactly
    // zero every time. The test fails if either draw path stops running.
    for (let tick = 0; tick < 32; tick += 1) {
      match.step();
      words.add(match.state.world.word);
      digits += match.state.world.digit;
    }

    expect(words.size).toBeGreaterThan(1);
    expect(digits).toBeGreaterThan(0);
  });
});

describe('the Matches the command line can play, by name', () => {
  it('plays the drawing Match again from the same seed, hash for hash', () => {
    const first = RULES.draws.play(1, 600);
    const second = RULES.draws.play(1, 600);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ends the drawing Match by the tick bound, which is the outcome the empty one reports too', () => {
    expect(RULES.draws.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
  });

  it('gives the drawing Match a different hash from the empty Match on the same seed and bound', () => {
    expect(RULES.draws.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });
});

describe('a Match on the strategic clock, which is the one the command line plays by default', () => {
  it('plays the seasons Match by name, and ends it by the tick bound like any other', () => {
    expect(isRulesName('seasons')).toBe(true);
    expect(RULES.seasons.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
    expect(RULES.seasons.play(1, 600).hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives the seasons Match a different hash from the empty one, so the clock really reaches the state', () => {
    expect(RULES.seasons.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });

  it('runs a headless Match bound to three game years, and always terminates', () => {
    const run = RULES.seasons.play(7, HEADLESS_TICKS);

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
  });
});

describe('the Match on the theatre and the economy, which is the one the command line plays by default', () => {
  it('plays the economy Match by name, and ends it by the tick bound like any other', () => {
    expect(isRulesName('economy')).toBe(true);
    expect(DEFAULT_RULES).toBe('economy');
    expect(RULES.economy.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
    expect(RULES.economy.play(1, 600).hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives the economy Match a hash of its own, so the settlements and the map really reach the state', () => {
    const economy = RULES.economy.play(1, 600).hash;

    expect(economy).not.toBe(RULES.seasons.play(1, 600).hash);
    expect(economy).not.toBe(RULES.empty.play(1, 600).hash);
    expect(economy).not.toBe(RULES.draws.play(1, 600).hash);
  });

  it('runs a headless economy Match bound to three game years, and always terminates', () => {
    const run = RULES.economy.play(1, HEADLESS_TICKS);

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
  });

  it('plays the same three game years again from the same seed, hash for hash', () => {
    expect(RULES.economy.play(7, HEADLESS_TICKS).hash).toBe(RULES.economy.play(7, HEADLESS_TICKS).hash);
  });
});

describe('a Match on the theatre and the fog', () => {
  it('plays the fog Match again from the same seed, hash for hash, and ends by the clock', () => {
    const first = RULES.fog.play(1, 600);
    const second = RULES.fog.play(1, 600);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.result).toEqual({ kind: 'clock', tick: 600 });
    expect(first.log).toEqual([]);
  });

  it('gives the fog Match a different hash from the empty Match: the map and what each Faction knows are in state', () => {
    expect(RULES.fog.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });
});

describe('the march Match, which is what CI gates movement and combat with', () => {
  /** The world the march Match begins on, played for a bound, as the CLI plays it. */
  function played(seed: number, ticks: number): EconomyWorld {
    const world = marchWorld(seed);
    const log = marchLog(world);

    runMatch<EconomyWorld, EconomyVisible>({
      seed,
      rules: { createWorld: () => world, step: economyMatchRules.step },
      observe: observeEconomy,
      outcome: economyMatchOutcome,
      players: [
        { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
        { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
      ],
      ticks,
    });

    return world;
  }

  it('musters two equal forces of unequal Squads, all of them on ground they can walk off', () => {
    const world = marchWorld(1);
    const owners = world.economy.squads.map((squad) => squad.owner);
    const men = (faction: 'rome' | 'carthage') => world.economy.squads
      .filter((squad) => squad.owner === factionCode(faction))
      .reduce((total, squad) => total + squad.strength, 0);

    expect(world.economy.squads).toHaveLength(7);
    expect(owners.filter((owner) => owner === factionCode('rome'))).toHaveLength(2);
    expect(owners.filter((owner) => owner === factionCode('carthage'))).toHaveLength(5);
    expect(men('rome')).toBe(men('carthage'));

    for (const squad of world.economy.squads) {
      expect(isWalkable(terrainAt(world.map, squad.x, squad.y))).toBe(true);
    }
  });

  it('stands each Faction up at its own Stronghold, and sends it to the other one', () => {
    const world = marchWorld(1);
    const [rome, carthage] = world.map.strongholds;
    const log = marchLog(world);

    // Two Roman lines of 120 and five Carthaginian bodies of 48: the same two
    // hundred and forty men a side, and not the same number of Squads (#66).
    expect(log).toEqual([
      { tick: 0, command: { kind: 'move', faction: 'rome', squads: [1, 2], ...carthage } },
      { tick: 0, command: { kind: 'move', faction: 'carthage', squads: [3, 4, 5, 6, 7], ...rome } },
    ]);
    expect(world.economy.squads.reduce((men, squad) => men + squad.strength, 0)).toBe(480);

    const squares = world.economy.settlements.slice(0, 2).map((settlement) => ({ x: settlement.x, y: settlement.y }));
    expect(squares).toEqual([rome, carthage]);
  });

  it('marches the two armies across, and every survivor arrives near the Stronghold it was sent to', () => {
    const world = marchWorld(1);
    const [rome, carthage] = world.map.strongholds;
    const mustered = new Map(
      world.economy.squads.map((squad) => [squad.id, { x: squad.x, y: squad.y, men: squad.strength }]),
    );

    const after = played(1, 600);

    expect(after.economy.squads.length).toBeGreaterThan(0);
    for (const squad of after.economy.squads) {
      const target = squad.owner === factionCode('rome') ? carthage : rome;
      const from = mustered.get(squad.id);

      // It crossed the theatre: the ground it mustered on is behind it, and the
      // Stronghold it was ordered to anchors its distributed arrival (#68).
      expect(Math.max(Math.abs(squad.x - target.x), Math.abs(squad.y - target.y))).toBeLessThanOrEqual(12);
      expect({ x: squad.x, y: squad.y }).not.toEqual({ x: from?.x, y: from?.y });
      expect(squad.steps).toEqual([]);
    }

    // The two armies met on the way: a march across a theatre with an enemy on
    // it is a fight as well as a march (C3), so the men who arrive are not the
    // men who set out — and since #66 the two forces bring the same two hundred
    // and forty men, so neither is wiped out on the road.
    expect(after.economy.squads.length).toBeLessThanOrEqual(7);
    expect(new Set(after.economy.squads.map((squad) => squad.owner)).size).toBe(2);
    expect(
      after.economy.squads.some((squad) => squad.strength < (mustered.get(squad.id)?.men ?? 0)),
    ).toBe(true);
  });

  it('plays the same march again from the same seed and bound, hash for hash', () => {
    const first = RULES.march.play(1, 600);
    const second = RULES.march.play(1, 600);

    expect(first.result).toEqual({ kind: 'clock', tick: 600 });
    expect(first.log).toHaveLength(2);
    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is a Match of its own: not the economy Match, and not the empty one', () => {
    const march = RULES.march.play(1, 600).hash;

    expect(march).not.toBe(RULES.economy.play(1, 600).hash);
    expect(march).not.toBe(RULES.empty.play(1, 600).hash);
  });
});

describe('the roster Match, which is what CI gates the two rosters with', () => {
  /** The world the roster Match begins on, played for a bound, as the CLI plays it. */
  function played(seed: number, ticks: number): EconomyWorld {
    const world = rosterWorld(seed);
    const log = marchLog(world);

    runMatch<EconomyWorld, EconomyVisible>({
      seed,
      rules: { createWorld: () => world, step: economyMatchRules.step },
      observe: observeEconomy,
      outcome: economyMatchOutcome,
      players: [
        { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
        { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
      ],
      ticks,
    });

    return world;
  }

  it('musters every type of both rosters onto the theatre, elephants included', () => {
    const world = rosterWorld(1);
    const ids = world.economy.squads.map((squad) => squadTypeOf(squad.type)?.id);

    expect(world.economy.squads).toHaveLength(SQUAD_TYPES.length);
    for (const faction of ['rome', 'carthage'] as const) {
      expect(ids).toEqual(expect.arrayContaining(squadTypesOf(faction).map((type) => type.id)));
    }
    expect(ids.filter((id) => id === 'elephant')).toHaveLength(1);

    for (const squad of world.economy.squads) {
      expect(isWalkable(terrainAt(world.map, squad.x, squad.y))).toBe(true);
    }
  });

  it('runs a headless Match between the two Factions to a result, using only these rosters', () => {
    const run = RULES.roster.play(1, 600);

    expect(run.result).toEqual({ kind: 'clock', tick: 600 });
    expect(run.log).toHaveLength(2);
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('sends the two rosters at each other, and the fight costs both sides men', () => {
    const world = rosterWorld(1);
    const mustered = new Map(world.economy.squads.map((squad) => [squad.id, squad.strength]));

    const after = played(1, 600);

    expect(after.economy.squads.length).toBeGreaterThan(0);

    // Everything left on the field is a type one of the two rosters raised.
    const known = new Set(SQUAD_TYPES.map((type) => type.id));
    for (const squad of after.economy.squads) {
      expect(known.has(squadTypeOf(squad.type)?.id ?? '')).toBe(true);
    }

    // And the two armies met: the whole roster crossed the theatre, so both
    // Factions have a Squad that lost men on the way (C3's fight, not a march).
    for (const owner of [factionCode('rome'), factionCode('carthage')]) {
      const hurt = after.economy.squads.filter(
        (squad) => squad.owner === owner && squad.strength < (mustered.get(squad.id) ?? squad.strength),
      );

      expect(hurt.length, String(owner)).toBeGreaterThan(0);
    }
  });

  it('plays the same rosters again from the same seed and bound, hash for hash', () => {
    const first = RULES.roster.play(1, 600);
    const second = RULES.roster.play(1, 600);

    expect(first.hash).toBe(second.hash);
  });

  it('is a Match of its own: not the march, and not the economy', () => {
    const roster = RULES.roster.play(1, 600).hash;

    expect(roster).not.toBe(RULES.march.play(1, 600).hash);
    expect(roster).not.toBe(RULES.economy.play(1, 600).hash);
  });
});

describe('a whole Match won headless, once by Assault and once by Blockade', () => {
  // Thousands of full Observations on the 160x160 theatre, sometimes repeated
  // four times for deterministic equality, exceed the ordinary five-second unit bound.
  const timeout = 60_000;
  it('storms Carthage’s Stronghold with the ram, and the result names the Stronghold', () => {
    const run = RULES.assault.play(1, 9000);

    expect(run.result).toMatchObject({
      kind: 'victory',
      winner: 'rome',
      reason: { kind: 'stronghold', stronghold: 1, path: 'assault' },
    });
    // A Match decided by the rules, not by the bound.
    expect(run.result.tick).toBeLessThan(9000);
    expect(run.log.map((entry) => entry.command.kind)).toEqual(['assault', 'garrison']);
  }, timeout);

  it('starves the same Stronghold into surrender, and the result says so', () => {
    const run = RULES.blockade.play(1, 9000);

    expect(run.result).toMatchObject({
      kind: 'victory',
      winner: 'rome',
      reason: { kind: 'stronghold', stronghold: 1, path: 'blockade' },
    });
    expect(run.result.tick).toBeLessThan(9000);
    // A Blockade is the slow path: it takes Seasons where an Assault takes a
    // fight, which is the asymmetry the ticket is about.
    expect(run.result.tick).toBeGreaterThan(RULES.assault.play(1, 9000).result.tick);
  }, timeout);

  it('plays each path again from the same seed, hash for hash', () => {
    expect(RULES.assault.play(1, 9000).hash).toBe(RULES.assault.play(1, 9000).hash);
    expect(RULES.blockade.play(1, 9000).hash).toBe(RULES.blockade.play(1, 9000).hash);
  }, timeout);

  it('is two genuinely different Matches, not one procedure with different numbers', () => {
    expect(RULES.assault.play(1, 9000).hash).not.toBe(RULES.blockade.play(1, 9000).hash);
  }, timeout);
});

describe('the Attrition Match, where the country an army stands in is the whole rule', () => {
  /** The world the Attrition Match begins on, played for a bound, as the CLI plays it. */
  function played(seed: number, ticks: number): EconomyWorld {
    const world = attritionWorld(seed);
    const log = attritionLog(world);

    runMatch<EconomyWorld, EconomyVisible>({
      seed,
      rules: { createWorld: () => world, step: economyMatchRules.step },
      observe: observeEconomy,
      outcome: economyMatchOutcome,
      players: [
        { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
        { faction: 'carthage', controller: scriptedController<EconomyVisible>(log) },
      ],
      ticks,
    });

    return world;
  }

  it('stands one army in Rome’s own country and one in nobody’s', () => {
    const world = attritionWorld(1);
    const [roman, carthaginian] = world.economy.squads;
    if (roman === undefined || carthaginian === undefined) {
      throw new Error('the Attrition Match fields two armies');
    }

    expect(world.economy.squads).toHaveLength(2);
    expect([roman.owner, carthaginian.owner]).toEqual([factionCode('rome'), factionCode('carthage')]);

    // Rome's army is in its own Territory and Carthage's is in the open field
    // between the Strongholds, which is nobody's (C6).
    const territory = territoryOf(world.economy);

    expect(holdsTerritory(territory, 0, roman)).toBe(true);
    expect(holdsTerritory(territory, 1, carthaginian)).toBe(false);
  });

  it('winters Rome under the camp it raised, and charges Carthage for the field', () => {
    const world = played(1, 9000);
    const roman = world.economy.squads.find((squad) => squad.owner === factionCode('rome'));
    const carthaginian = world.economy.squads.find((squad) => squad.owner === factionCode('carthage'));
    if (roman === undefined || carthaginian === undefined) {
      throw new Error('the Attrition Match fields two armies');
    }

    // Four Season boundaries: summer, autumn, winter and spring. The army in its
    // own country behind a camp pays none of it; the one in the field is a
    // forty-eight-man Carthaginian line after P2, and losses two percent, two
    // percent, six percent and two percent take it down to forty-three.
    expect(world.winters).toBe(1);
    expect(world.autumns).toBe(1);
    expect(roman.strength).toBe(120);
    expect(inCamp(world.economy, roman)).toBe(true);
    expect(carthaginian.strength).toBe(43);
    expect(inCamp(world.economy, carthaginian)).toBe(false);
  });

  it('plays the same attrition again from the same seed and bound, hash for hash', () => {
    const first = RULES.attrition.play(1, 9000);
    const second = RULES.attrition.play(1, 9000);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.result).toEqual({ kind: 'clock', tick: 9000 });
    expect(first.log).toEqual(attritionLog(attritionWorld(1)));
  });

  it('is a Match of its own: two armies on a theatre nothing else in the harness fields', () => {
    expect(RULES.attrition.play(1, 9000).hash).not.toBe(RULES.march.play(1, 600).hash);
    expect(RULES.attrition.play(1, 9000).hash).not.toBe(RULES.economy.play(1, 9000).hash);
  });
});

describe('every Match the command line can play replays from its own log (E2)', () => {
  /** Long enough for every name to have ticked something, short enough to be a unit test. */
  const TICKS = 40;

  it.each(RULES_NAMES)('replays %s to the hash its own play ended on, checkpoints and all', (name) => {
    const run = RULES[name].play(1, TICKS);
    const replayed = RULES[name].replay({
      seed: run.seed,
      log: run.log,
      ticks: run.result.tick,
      everyTicks: CHECKPOINT_TICKS,
    });

    expect(replayed.checkpoints.at(-1), name).toEqual({ tick: run.result.tick, hash: run.hash });
  });

  it('replays a Match that fields its own armies, which is not the Match its rules alone play', () => {
    const run = RULES.march.play(1, TICKS);
    const replayed = RULES.march.replay({ seed: 1, log: run.log, ticks: run.result.tick });

    // The march musters its Squads onto the world its seed builds, so a replay
    // that started from the bare economy world would part from it at tick 0.
    expect(RULES.economy.replay({ seed: 1, log: run.log, ticks: run.result.tick }).checkpoints).not.toEqual(
      replayed.checkpoints,
    );
  });
});

describe('the names of the Matches the command line ships', () => {
  it('names the Matches it ships, and nothing else', () => {
    expect(isRulesName('economy')).toBe(true);
    expect(isRulesName('seasons')).toBe(true);
    expect(isRulesName('empty')).toBe(true);
    expect(isRulesName('draws')).toBe(true);
    expect(isRulesName('fog')).toBe(true);
    expect(isRulesName('march')).toBe(true);
    expect(isRulesName('roster')).toBe(true);
    expect(isRulesName('assault')).toBe(true);
    expect(isRulesName('blockade')).toBe(true);
    expect(isRulesName('attrition')).toBe(true);
    expect(isRulesName('siege')).toBe(true);
    expect(isRulesName(DEFAULT_RULES)).toBe(true);

    for (const value of ['', 'Empty', 'empty ', 'draws\n', 'anything else']) {
      expect(isRulesName(value)).toBe(false);
    }
  });
});
