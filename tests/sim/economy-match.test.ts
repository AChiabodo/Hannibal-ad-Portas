import { describe, expect, it } from 'vitest';
import { buildingCode } from '../../src/content';
import { build, recruit, type Command } from '../../src/sim/command';
import { idleController, scriptedController, type Player } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import {
  allocate,
  applyEconomyCommand,
  harvestYield,
  housingCapacity,
  isHeld,
  landCapacity,
  seasonYield,
  STARTING_STOCKS,
  storageCapacity,
  TREASURY_CAP,
  type Economy,
  type Squad,
} from '../../src/sim/economy';
import {
  economyMatchOutcome,
  economyMatchRules,
  eyesOfEconomy,
  observeEconomy,
  type EconomyVisible,
  type EconomyWorld,
} from '../../src/sim/economy-match';
import { SQUAD_VISION, SETTLEMENT_VISION } from '../../src/sim/fog';
import { musterSquad } from '../../src/sim/movement';
import { createMatch } from '../../src/sim/match';
import { RESOURCE, RESOURCE_KINDS } from '../../src/sim/map';
import {
  HEADLESS_TICKS,
  HEADLESS_YEARS,
  SEASON_TICKS,
  YEAR_TICKS,
  type Season,
} from '../../src/sim/season';
import { blockOf, squadTypeId } from './economy-fixtures';

/** The two Players a Match on this world runs on unless a test says otherwise. */
function idlePlayers(): readonly [Player<EconomyVisible>, Player<EconomyVisible>] {
  return [
    { faction: 'rome', controller: idleController<EconomyVisible>() },
    { faction: 'carthage', controller: idleController<EconomyVisible>() },
  ];
}

/** A world of the economy Match, opened on a seed. */
function worldOf(seed: number): EconomyWorld {
  return economyMatchRules.createWorld(seed);
}

/** One Squad of a type Rome can raise, standing on its own tile, with the id and morale a test asks for. */
function squad(overrides: Partial<Squad> = {}): Squad {
  return {
    ...blockOf('hastati'),
    id: 1,
    owner: 0,
    type: squadTypeId('hastati'),
    home: 0,
    morale: 10,
    unpaid: 0,
    ...overrides,
  };
}

describe('what a Faction reads of the economy', () => {
  it('shows its own settlements and where they stand, and never the other Faction’s', () => {
    const world = worldOf(7);
    const rome = observeEconomy(world, 'rome');
    const carthage = observeEconomy(world, 'carthage');

    expect(rome.settlements.map((settlement) => settlement.id)).toEqual([0]);
    expect(carthage.settlements.map((settlement) => settlement.id)).toEqual([1]);
    expect(rome.settlements[0]).toMatchObject({
      tier: 1,
      population: 10,
      x: world.map.strongholds[0].x,
    });

    // The stock and the land are named, not indexed: a Controller reads grain,
    // not `[0]`.
    expect(Object.keys(rome.settlements[0]?.stocks ?? {}).sort()).toEqual([
      'grain',
      'iron',
      'stone',
      'timber',
    ]);
    expect(rome.settlements[0]?.stocks.grain).toBe(20);
    expect(rome.settlements[0]?.land.grain).toBeGreaterThan(0);
  });

  it('shows both Factions the same date, because the calendar is not a secret', () => {
    const world = worldOf(7);
    const rome = observeEconomy(world, 'rome');
    const carthage = observeEconomy(world, 'carthage');

    expect(rome).toMatchObject({ season: 'spring', year: 1 });
    expect(carthage).toMatchObject({ season: rome.season, year: rome.year });
  });

  it('shows a Faction its own treasury and its own Squads, and the other’s neither', () => {
    const world = worldOf(7);
    world.economy.treasuries[0] = 42;
    world.economy.squads.push(squad({ id: 1, owner: 0 }), squad({ id: 2, owner: 1 }));

    const rome = observeEconomy(world, 'rome');

    expect(rome.treasury).toBe(42);
    expect(rome.squads.map((visible) => visible.id)).toEqual([1]);
    expect(rome.squads[0]).toMatchObject({
      type: 'hastati',
      morale: 10,
      payroll: 3,
      unpaid: 0,
      home: 0,
    });
  });

  it('shows what a settlement is building for, by the id a Build Command would name', () => {
    const world = worldOf(7);
    world.economy.settlements[0]?.works.push({ building: buildingCodeOf('lumber-camp'), remaining: 12 });

    const works = observeEconomy(world, 'rome').settlements[0]?.works ?? [];

    expect(works).toEqual([{ building: 'lumber-camp', remaining: 12, standing: false }]);
  });
});

describe('a Match on the economy, with two Controllers', () => {
  it('applies a Build and a Recruit through the driver, and logs both', () => {
    const log: { tick: number; command: Command }[] = [
      { tick: 0, command: build('rome', 0, 'lumber-camp') },
      { tick: 0, command: recruit('rome', 0, 'hastati', 1) },
    ];

    const run = runMatch<EconomyWorld, EconomyVisible>({
      seed: 7,
      rules: economyMatchRules,
      observe: observeEconomy,
      outcome: economyMatchOutcome,
      players: [
        { faction: 'rome', controller: scriptedController<EconomyVisible>(log) },
        { faction: 'carthage', controller: idleController<EconomyVisible>() },
      ],
      ticks: 2,
    });

    expect(run.log.map((entry) => entry.command.kind)).toEqual(['build', 'recruit']);
    expect(run.result).toEqual({ kind: 'clock', tick: 2 });
  });

  it('leaves a Faction’s Commands in its own settlements, and the other Faction’s stock alone', () => {
    const world = worldOf(7);
    apply(world.economy, [build('rome', 0, 'lumber-camp'), recruit('rome', 0, 'hastati', 1)]);

    const rome = observeEconomy(world, 'rome');
    const carthage = observeEconomy(world, 'carthage');

    expect(rome.settlements[0]?.works).toHaveLength(1);
    expect(rome.squads).toHaveLength(1);
    expect(carthage.settlements).toHaveLength(1);
    expect(carthage.squads).toEqual([]);
    // Carthage spent nothing, so its stock is still the one a settlement opens on.
    expect(carthage.settlements[0]?.stocks).toEqual({ grain: 20, timber: 20, stone: 10, iron: 10 });
  });

  it('terminates on the bound, because an economy alone cannot be won or lost', () => {
    const run = runMatch<EconomyWorld, EconomyVisible>({
      seed: 7,
      rules: economyMatchRules,
      observe: observeEconomy,
      outcome: economyMatchOutcome,
      players: idlePlayers(),
      ticks: HEADLESS_TICKS,
    });

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('runs the same three game years twice, hash for hash', () => {
    const play = () =>
      runMatch<EconomyWorld, EconomyVisible>({
        seed: 7,
        rules: economyMatchRules,
        observe: observeEconomy,
        outcome: economyMatchOutcome,
        players: idlePlayers(),
        ticks: HEADLESS_TICKS,
      });

    expect(play().hash).toBe(play().hash);
  });
});

describe('an economy left alone for three game years', () => {
  it('neither stalls nor becomes infinite: every people, stock and treasury stays inside its ceiling, and the stock grew', () => {
    const match = createMatch({ seed: 1, rules: economyMatchRules });

    for (let tick = 0; tick < HEADLESS_TICKS; tick += 1) match.step();

    const { economy } = match.state.world;
    const startingTotal =
      STARTING_STOCKS.grain + STARTING_STOCKS.timber + STARTING_STOCKS.stone + STARTING_STOCKS.iron;

    for (const settlement of economy.settlements) {
      expect(settlement.population, `settlement ${settlement.id}`).toBeGreaterThan(0);
      expect(settlement.population).toBeLessThanOrEqual(housingCapacity(settlement));

      for (const kind of RESOURCE_KINDS) {
        expect(settlement.stocks[kind] ?? 0, `settlement ${settlement.id}`).toBeGreaterThanOrEqual(0);
        expect(settlement.stocks[kind] ?? 0).toBeLessThanOrEqual(storageCapacity(settlement));
      }

      // A settlement a Faction holds really worked: three years of production
      // reached its stock, and are not merely inside the bounds above.
      if (!isHeld(settlement)) continue;
      const held = RESOURCE_KINDS.reduce<number>(
        (total, kind) => total + (settlement.stocks[kind] ?? 0),
        0,
      );
      expect(held, `settlement ${settlement.id}`).toBeGreaterThan(startingTotal);
    }

    for (const treasury of economy.treasuries) {
      expect(treasury).toBeGreaterThanOrEqual(0);
      expect(treasury).toBeLessThanOrEqual(TREASURY_CAP);
    }

    // The calendar reached the end of its bound, and the hooks fired every year.
    expect(match.state.world.autumns).toBe(HEADLESS_YEARS);
    expect(match.state.world.winters).toBe(HEADLESS_YEARS);
    expect(match.state.world.calendar.year).toBe(HEADLESS_YEARS + 1);
    expect(YEAR_TICKS).toBe(SEASON_TICKS * 4);
  });

  it('keeps producing in its third year, and the harvest alone beats an ordinary Season', () => {
    const match = createMatch({ seed: 1, rules: economyMatchRules });

    for (let tick = 0; tick < HEADLESS_TICKS; tick += 1) match.step();

    const { map, economy } = match.state.world;
    const settlement = economy.settlements[0]!;
    const allocation = allocate(settlement, landCapacity(map, settlement));

    const grain = (season: Season) =>
      seasonYield(settlement, allocation, season)[RESOURCE.grain] ?? 0;
    const harvest = harvestYield(allocation);

    // The harvest alone brings in more grain than an ordinary Season's whole
    // production, so the autumn peak is real and not a rounding difference...
    expect(harvest).toBeGreaterThan(grain('spring'));
    expect(harvest).toBeGreaterThan(grain('winter'));

    // ...ordinary production is still happening (the economy has not stalled)...
    expect(grain('spring')).toBeGreaterThan(0);

    // ...and it reached the stock, not just the formula.
    expect(settlement.stocks[RESOURCE.timber] ?? 0).toBeGreaterThan(STARTING_STOCKS.timber);
  });
});

describe('Payroll across a Season boundary', () => {
  it('charges on the boundary and not before it, and moves morale when it does', () => {
    const match = createMatch({ seed: 7, rules: economyMatchRules });
    const world = match.state.world;

    world.economy.treasuries[0] = 10;
    // Standing in its own country, so the Season charges Payroll and nothing
    // else: a Squad cut off from Supply is a different Season's bill (C3).
    const home = world.economy.settlements[0]!;
    world.economy.squads.push(squad({ id: 1, owner: 0, morale: 5, x: home.x, y: home.y }));

    for (let tick = 0; tick < SEASON_TICKS - 1; tick += 1) match.step();
    expect(world.economy.squads[0]?.morale).toBe(5);

    match.step();
    expect(world.economy.squads[0]?.morale).toBe(6);
    expect(world.economy.treasuries[0]).toBeLessThan(10);
  });

  it('loses an unpaid Squad morale Season by Season, and deserts it when there is none left', () => {
    const match = createMatch({ seed: 7, rules: economyMatchRules });
    const world = match.state.world;

    // An army the treasury cannot keep: six denarii a Season against a couple of tax.
    world.economy.treasuries[0] = 0;
    const home = world.economy.settlements[0]!;
    for (const id of [1, 2]) {
      world.economy.squads.push(
        squad({ id, owner: 0, type: squadTypeId('triarii'), morale: 4, x: home.x, y: home.y }),
      );
    }

    for (let tick = 0; tick < SEASON_TICKS; tick += 1) match.step();

    const owed = world.economy.squads.filter((kept) => kept.owner === 0);
    expect(owed).toHaveLength(2);
    expect(owed.map((kept) => kept.morale)).toEqual([2, 2]);
    expect(owed.map((kept) => kept.unpaid)).toEqual([1, 1]);

    for (let tick = 0; tick < SEASON_TICKS; tick += 1) match.step();
    expect(world.economy.squads.filter((kept) => kept.owner === 0)).toEqual([]);
  });
});

/** Applies Commands the way the rules do, without stepping the clock. */
function apply(economy: Economy, commands: readonly Command[]): void {
  for (const command of commands) applyEconomyCommand(economy, command);
}

/** The code a building id names, refused loudly so a typo in a test is not a silent zero. */
function buildingCodeOf(id: string): number {
  const code = buildingCode(id);
  if (code === undefined) throw new Error(`no building is named ${id}`);

  return code;
}

describe('the eyes a Faction has in this world', () => {
  it('sees from its settlements and from the Squads it is marching, and no further', () => {
    const world = worldOf(7);
    const stronghold = world.economy.settlements[0];
    if (stronghold === undefined) throw new Error('the map has no Stronghold');

    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 4, y: 4 });

    const eyes = eyesOfEconomy(world, 'rome');

    expect(eyes).toHaveLength(2);
    expect(eyes[0]).toEqual({ x: stronghold.x, y: stronghold.y, radius: SETTLEMENT_VISION });
    expect(eyes[1]).toEqual({ x: 4, y: 4, radius: SQUAD_VISION });
  });

  it('has no eyes for the other Faction’s things', () => {
    const world = worldOf(7);

    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 4, y: 4 });

    expect(eyesOfEconomy(world, 'carthage').every((eye) => eye.x !== 4 || eye.y !== 4)).toBe(true);
  });
});
