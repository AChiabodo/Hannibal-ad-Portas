import { describe, expect, it } from 'vitest';
import { build, recruit } from '../../src/sim/command';
import {
  allocate,
  advanceConstruction,
  applyEconomyCommand,
  BASE_HOUSING,
  BASE_STORAGE,
  BASE_LAND_CAPACITY,
  chargePayroll,
  createEconomy,
  GRAIN_PER_HEAD,
  harvest,
  harvestYield,
  housingCapacity,
  isHeld,
  landCapacity,
  LAND_RADIUS,
  produceSeason,
  seasonYield,
  STARTING_DENARII,
  STARTING_POPULATION,
  storageCapacity,
  UNOWNED,
  type Economy,
  type Settlement,
  type Squad,
} from '../../src/sim/economy';
import { generateMap, RESOURCE, TERRAIN, tileIndex, type ResourceKind, type ResourceNode } from '../../src/sim/map';
import { blockOf, buildingId, squadTypeId, testMap, testSettlement, work } from './economy-fixtures';

/** A node of one resource at one place, in the quantity the map would have put there. */
function node(kind: ResourceKind, x: number, y: number, amount: number): ResourceNode {
  return { kind, x, y, amount };
}

/** A map with a little of everything under the settlement at (10, 10), so the land yields. */
function fertileMap() {
  return testMap({
    resources: [
      node(RESOURCE.grain, 10, 10, 100),
      node(RESOURCE.timber, 10, 10, 100),
      node(RESOURCE.stone, 10, 10, 100),
      node(RESOURCE.iron, 10, 10, 100),
    ],
  });
}

describe('the land a settlement draws on', () => {
  it('sums the nodes within reach, per resource, and ignores the ones over the horizon', () => {
    const map = testMap({
      resources: [
        node(RESOURCE.grain, 12, 12, 20),
        node(RESOURCE.grain, 10 + LAND_RADIUS, 10, 4),
        node(RESOURCE.timber, 10, 11, 9),
        node(RESOURCE.grain, 10 + LAND_RADIUS + 1, 10, 99),
      ],
    });

    const capacity = landCapacity(map, testSettlement());

    expect(capacity[RESOURCE.grain]).toBe(24 + BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.timber]).toBe(9 + BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.stone]).toBe(BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.iron]).toBe(BASE_LAND_CAPACITY);
  });

  it('counts the ground itself: farmland feeds, forest yields timber, hill yields stone', () => {
    const paint: Record<number, number> = {};
    for (let x = 8; x <= 10; x += 1) paint[tileIndex(x, 10)] = TERRAIN.farmland;
    for (let y = 9; y <= 11; y += 1) paint[tileIndex(10, y)] = TERRAIN.forest;
    paint[tileIndex(1, 1)] = TERRAIN.hill;

    const capacity = landCapacity(testMap({ paint }), testSettlement());

    expect(capacity[RESOURCE.grain]).toBe(2 + BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.timber]).toBe(3 + BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.stone]).toBe(1 + BASE_LAND_CAPACITY);
    expect(capacity[RESOURCE.iron]).toBe(BASE_LAND_CAPACITY);
  });
});

describe('how a settlement divides its people', () => {
  it('puts everyone on the land when there is nothing built, spread as evenly as the four kinds allow', () => {
    const allocation = allocate(testSettlement(), [100, 100, 100, 100]);

    expect(allocation.works).toEqual([]);
    expect(allocation.land).toEqual([3, 3, 2, 2]);
  });

  it('staffs the works first, in the order the settlement raised them, and puts the rest on the land', () => {
    const settlement = testSettlement({ works: [work('farm'), work('lumber-camp')] });

    // A farm wants four, a lumber camp four: ten people cover both, leaving two.
    const allocation = allocate(settlement, [100, 100, 100, 100]);

    expect(allocation.works).toEqual([4, 4]);
    expect(allocation.land).toEqual([1, 1, 0, 0]);
  });

  it('leaves a work nobody can staff unstaffed rather than half-staffing it', () => {
    const settlement = testSettlement({ population: 3, works: [work('farm')] });

    const allocation = allocate(settlement, [100, 100, 100, 100]);

    expect(allocation.works).toEqual([0]);
    expect(allocation.land).toEqual([1, 1, 1, 0]);
  });

  it('puts nobody on land the settlement does not have', () => {
    const allocation = allocate(testSettlement({ population: 10 }), [1, 1, 1, 1]);

    expect(allocation.land).toEqual([1, 1, 1, 1]);
  });
});

describe('what a Season yields', () => {
  it('follows the allocation: a staffed work yields its own, and the land yields by hand', () => {
    const settlement = testSettlement({ works: [work('farm')] });
    const allocation = allocate(settlement, [100, 100, 100, 100]);

    // A farm staffed by four yields six grain; the six left over work the land.
    expect(allocation.works).toEqual([4]);
    expect(seasonYield(settlement, allocation, 'spring')).toEqual([8, 2, 1, 1]);
  });

  it('yields nothing from a work with nobody on it, or one still going up', () => {
    const unstaffed = testSettlement({ population: 2, works: [work('farm')] });
    const building = testSettlement({ works: [work('farm', 50)] });

    expect(seasonYield(unstaffed, allocate(unstaffed, [100, 100, 100, 100]), 'spring')).toEqual([
      1, 1, 0, 0,
    ]);
    expect(seasonYield(building, allocate(building, [100, 100, 100, 100]), 'spring')).toEqual([
      2, 2, 1, 1,
    ]);
  });

  it('halves what the land yields in winter, and leaves the works alone', () => {
    const settlement = testSettlement({ works: [work('farm')] });
    const allocation = allocate(settlement, [100, 100, 100, 100]);

    expect(seasonYield(settlement, allocation, 'winter')).toEqual([7, 1, 0, 0]);
  });

  it('brings in extra grain at the harvest, from the people on the grain land alone', () => {
    const settlement = testSettlement();

    expect(harvestYield(allocate(settlement, [100, 100, 100, 100]))).toBe(9);
  });
});

describe('a Season in a settlement', () => {
  it('adds what was produced, feeds its people, and grows them when there is enough left', () => {
    const settlement = testSettlement({ population: 10, stocks: [20, 0, 0, 0] });
    const economy = economyOf(settlement);

    produceSeason(fertileMap(), economy, 'spring');

    // Three grain off the land, two eaten, one citizen more: the housing is base 12.
    expect(settlement.stocks[RESOURCE.grain]).toBe(21);
    expect(settlement.population).toBe(11);
    expect(settlement.population).toBeLessThanOrEqual(housingCapacity(settlement));
  });

  it('starves a settlement it cannot feed rather than letting it eat what it does not have', () => {
    const settlement = testSettlement({ population: 20, stocks: [0, 0, 0, 0] });
    const economy = economyOf(settlement);

    // Barren ground: the base land yields two grain, four are eaten.
    produceSeason(testMap(), economy, 'spring');

    expect(GRAIN_PER_HEAD).toBe(5);
    expect(settlement.stocks[RESOURCE.grain]).toBe(0);
    expect(settlement.population).toBe(19);
  });

  it('never stores more than the settlement can hold', () => {
    const settlement = testSettlement({ population: 10, stocks: [BASE_STORAGE - 1, 0, 0, 0] });
    const economy = economyOf(settlement);

    produceSeason(fertileMap(), economy, 'spring');

    expect(storageCapacity(settlement)).toBe(BASE_STORAGE);
    expect(settlement.stocks[RESOURCE.grain]).toBeLessThanOrEqual(BASE_STORAGE);
  });

  it('earns denarii for the Faction that holds it, and none for the one that does not', () => {
    const held = testSettlement({ population: 10 });
    const loose = testSettlement({ id: 1, owner: UNOWNED, population: 10 });
    const economy: Economy = {
      settlements: [held, loose],
      treasuries: [0, 0],
      squads: [],
      nextSquadId: 1,
    };

    produceSeason(fertileMap(), economy, 'spring');

    expect(economy.treasuries[0]).toBe(2);
    expect(economy.treasuries[1]).toBe(0);
  });

  it('brings the harvest in on its own, on top of the Season’s ordinary grain', () => {
    const settlement = testSettlement({ population: 10, stocks: [0, 0, 0, 0] });
    const economy = economyOf(settlement);

    harvest(fertileMap(), economy);

    expect(settlement.stocks[RESOURCE.grain]).toBe(9);
  });
});

describe('construction, as a labour allocation plus a timer', () => {
  it('counts a staffed work down one tick at a time, and stands it when the timer runs out', () => {
    const settlement = testSettlement({ works: [work('farm', 3)] });
    const economy = economyOf(settlement);

    advanceConstruction(testMap(), economy);
    expect(settlement.works[0]?.remaining).toBe(2);

    advanceConstruction(testMap(), economy);
    advanceConstruction(testMap(), economy);
    expect(settlement.works[0]?.remaining).toBe(0);
  });

  it('does not count a work down when nobody is on it', () => {
    const settlement = testSettlement({ population: 2, works: [work('farm', 5)] });

    advanceConstruction(testMap(), economyOf(settlement));

    expect(settlement.works[0]?.remaining).toBe(5);
  });

  it('counts a work that needs nobody down, so a house is not a dead resource sink', () => {
    const settlement = testSettlement({ population: 10, works: [work('house', 2)] });
    const economy = economyOf(settlement);

    expect(housingCapacity(settlement)).toBe(BASE_HOUSING);

    advanceConstruction(testMap(), economy);
    advanceConstruction(testMap(), economy);

    expect(settlement.works[0]?.remaining).toBe(0);
    expect(housingCapacity(settlement)).toBe(BASE_HOUSING + 6);
  });

  it('raises the settlement’s tier when the building that raises it is finished', () => {
    const settlement = testSettlement({ population: 20, works: [work('villa', 1)] });

    advanceConstruction(testMap(), economyOf(settlement));

    expect(settlement.works[0]?.remaining).toBe(0);
    expect(settlement.tier).toBe(2);
  });
});

describe('a Build Command', () => {
  it('pays the cost out of the settlement and starts the work', () => {
    const economy = economyOf(testSettlement({ stocks: [0, 10, 0, 0] }));

    expect(applyEconomyCommand(economy, build('rome', 0, 'farm'))).toBe(true);

    expect(economy.settlements[0]?.stocks[RESOURCE.timber]).toBe(4);
    expect(economy.settlements[0]?.works).toEqual([{ building: buildingId('farm'), remaining: 400 }]);
  });

  it('refuses a settlement the Faction does not hold, and one nobody holds', () => {
    const unheld = economyOf(testSettlement({ owner: UNOWNED, stocks: [0, 100, 0, 0] }));

    expect(applyEconomyCommand(unheld, build('rome', 0, 'farm'))).toBe(false);
    expect(unheld.settlements[0]?.works).toEqual([]);

    const other = economyOf(testSettlement({ owner: 1, stocks: [0, 100, 0, 0] }));
    expect(applyEconomyCommand(other, build('rome', 0, 'farm'))).toBe(false);
  });

  it('refuses a building nobody knows, and one the Faction may not raise', () => {
    const economy = economyOf(testSettlement({ stocks: [0, 100, 0, 0] }));

    expect(applyEconomyCommand(economy, build('rome', 0, 'no-such-building'))).toBe(false);
    expect(applyEconomyCommand(economy, build('rome', 0, 'castrum'))).toBe(true);

    const carthage = economyOf(testSettlement({ owner: 1, stocks: [0, 100, 0, 0] }));
    expect(applyEconomyCommand(carthage, build('carthage', 0, 'castrum'))).toBe(false);
  });

  it('refuses a building above the settlement’s tier, and one of its kind too many', () => {
    const low = economyOf(testSettlement({ stocks: [0, 100, 100, 100] }));
    expect(low.settlements[0]?.tier).toBe(1);
    expect(applyEconomyCommand(low, build('rome', 0, 'forum'))).toBe(false);

    const full = economyOf(testSettlement({ stocks: [0, 100, 0, 0] }));
    for (let raised = 0; raised < 4; raised += 1) {
      expect(applyEconomyCommand(full, build('rome', 0, 'farm'))).toBe(true);
    }
    expect(applyEconomyCommand(full, build('rome', 0, 'farm'))).toBe(false);
    expect(full.settlements[0]?.works).toHaveLength(4);
  });

  it('refuses a building the settlement cannot afford, and leaves its stock alone', () => {
    const economy = economyOf(testSettlement({ stocks: [0, 5, 0, 0] }));

    expect(applyEconomyCommand(economy, build('rome', 0, 'farm'))).toBe(false);
    expect(economy.settlements[0]?.stocks[RESOURCE.timber]).toBe(5);
  });
});

describe('a Recruit Command', () => {
  it('raises the Squads in the settlement, paying their cost out of its stock', () => {
    const economy = economyOf(testSettlement({ stocks: [20, 0, 0, 5] }));

    expect(applyEconomyCommand(economy, recruit('rome', 0, 'hastati', 2))).toBe(true);

    // Two hastati at eight grain and two iron apiece.
    expect(economy.settlements[0]?.stocks[RESOURCE.grain]).toBe(4);
    expect(economy.settlements[0]?.stocks[RESOURCE.iron]).toBe(1);
    expect(economy.squads).toHaveLength(2);
    expect(economy.squads[0]).toMatchObject({
      id: 1,
      owner: 0,
      type: squadTypeId('hastati'),
      home: 0,
      morale: 10,
      unpaid: 0,
    });
    expect(economy.squads[1]?.id).toBe(2);
    expect(economy.nextSquadId).toBe(3);
  });

  it('refuses a Squad type above the settlement’s tier, so the tiers gate recruitment', () => {
    const low = economyOf(testSettlement({ stocks: [100, 0, 0, 100] }));

    expect(applyEconomyCommand(low, recruit('rome', 0, 'principes', 1))).toBe(false);
    expect(low.squads).toEqual([]);

    const high = economyOf(testSettlement({ tier: 2, stocks: [100, 0, 0, 100] }));
    expect(applyEconomyCommand(high, recruit('rome', 0, 'principes', 1))).toBe(true);
    expect(high.squads).toHaveLength(1);
  });

  it('refuses the other Faction’s roster, a type nobody knows, and one it cannot pay for', () => {
    const economy = economyOf(testSettlement({ stocks: [100, 0, 0, 100] }));

    expect(applyEconomyCommand(economy, recruit('rome', 0, 'libyan-spear', 1))).toBe(false);
    expect(applyEconomyCommand(economy, recruit('rome', 0, 'no-such-type', 1))).toBe(false);

    const poor = economyOf(testSettlement({ stocks: [0, 0, 0, 0] }));
    expect(applyEconomyCommand(poor, recruit('rome', 0, 'hastati', 1))).toBe(false);
  });
});

describe('Payroll', () => {
  it('pays the Squads it can and lets a paid one recover a point of morale, up to its type’s most', () => {
    const economy = economyWith([squad({ morale: 5 }), squad({ id: 2, morale: 10 })]);

    chargePayroll(economy);

    expect(economy.treasuries[0]).toBe(4);
    expect(economy.squads.map((kept) => kept.morale)).toEqual([6, 10]);
    expect(economy.squads.every((kept) => kept.unpaid === 0)).toBe(true);
  });

  it('pays the oldest first out of one treasury, and leaves the rest owing', () => {
    const economy = economyWith([squad({ id: 1 }), squad({ id: 2 })], 3);

    chargePayroll(economy);

    expect(economy.treasuries[0]).toBe(0);
    expect(economy.squads.map((kept) => kept.unpaid)).toEqual([0, 1]);
    expect(economy.squads[1]?.morale).toBe(8);
  });

  it('loses morale each Season it is unpaid, and deserts when there is none left', () => {
    const economy = economyWith([squad({ morale: 10 })], 0);

    for (let season = 0; season < 4; season += 1) chargePayroll(economy);
    expect(economy.squads).toHaveLength(1);
    expect(economy.squads[0]?.morale).toBe(2);
    expect(economy.squads[0]?.unpaid).toBe(4);
    expect(economy.treasuries[0]).toBe(0);

    chargePayroll(economy);
    expect(economy.squads).toEqual([]);
  });

  it('pays each Faction out of its own treasury, and never the other’s', () => {
    const economy: Economy = {
      settlements: [],
      treasuries: [3, 3],
      squads: [squad({ id: 1, owner: 0 }), squad({ id: 2, owner: 1 })],
      nextSquadId: 3,
    };

    chargePayroll(economy);

    expect(economy.treasuries).toEqual([0, 0]);
    expect(economy.squads.every((kept) => kept.unpaid === 0)).toBe(true);
  });
});

describe('opening an economy on a generated map', () => {
  it('gives each Faction its Stronghold, and leaves every minor settlement to nobody', () => {
    const map = generateMap(7);
    const economy = createEconomy(map);

    expect(economy.settlements).toHaveLength(2 + map.settlements.length);
    expect(economy.settlements[0]).toMatchObject({
      id: 0,
      owner: 0,
      tier: 1,
      population: STARTING_POPULATION,
    });
    expect(economy.settlements[1]).toMatchObject({ id: 1, owner: 1 });
    expect(economy.settlements.slice(2).every((settlement) => settlement.owner === UNOWNED)).toBe(true);
    expect(economy.treasuries).toEqual([STARTING_DENARII, STARTING_DENARII]);
    expect(economy.squads).toEqual([]);
    expect(isHeld(economy.settlements[0]!)).toBe(true);
    expect(isHeld(economy.settlements[2]!)).toBe(false);
    expect(housingCapacity(economy.settlements[0]!)).toBeGreaterThan(0);
  });

  it('opens the same settlements, twice, from the same seed', () => {
    expect(createEconomy(generateMap(11))).toEqual(createEconomy(generateMap(11)));
  });
});

/** One economy holding one settlement, with a treasury the tests can spend. */
function economyOf(settlement: Settlement): Economy {
  return { settlements: [settlement], treasuries: [10, 0], squads: [], nextSquadId: 1 };
}

/** One economy holding a list of Squads, and a treasury of `denarii`. */
function economyWith(squads: readonly Squad[], denarii = 10): Economy {
  return {
    settlements: [],
    treasuries: [denarii, 0],
    squads: [...squads],
    nextSquadId: squads.length + 1,
  };
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
