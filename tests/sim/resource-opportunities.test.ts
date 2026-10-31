import { describe, expect, it } from 'vitest';
import { allocate, createEconomy, landCapacity, LAND_RADIUS, seasonYield } from '../../src/sim/economy';
import { buildingCode } from '../../src/content/buildings';
import { generateMap, halfOf, RESOURCE_KINDS, type Site } from '../../src/sim/map';
import { move } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { createFogs } from '../../src/sim/fog';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import { settlementSide } from '../../src/sim/settlement-space';
import { turnPoint } from '../../src/content/settlement-layout';

const within = (a: Site, b: Site) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= LAND_RADIUS;

describe('effective resource opportunities (#76)', () => {
  it.each([
    { seed: 61, faction: 'carthage', first: null, x: 105, y: 137, facing: 'south', to: { x: 100, y: 142 } },
    { seed: 169, faction: 'rome', first: 2, x: 31, y: 90, facing: 'west', to: { x: 62, y: 35 } },
    { seed: 178, faction: 'rome', first: 2, x: 63, y: 33, facing: 'north', to: { x: 85, y: 63 } },
    { seed: 186, faction: 'carthage', first: 3, x: 123, y: 75, facing: 'west', to: { x: 97, y: 54 } },
  ] as const)('continues an accepted expansion route around the seed-$seed terrain and Work corners', ({ seed, faction, first, x, y, facing, to }) => {
    const map = generateMap(seed), economy = createEconomy(map);
    const owner = faction === 'rome' ? 0 : 1;
    const estates = [economy.settlements[owner]!, ...(first === null ? [] : [economy.settlements[first]!])];
    for (const site of estates) {
      site.owner = owner;
      site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
    }
    const squad = musterSquad(economy, map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul', men: 24, x, y, facing });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    const match = createMatch({ seed, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step([move(faction, [squad.id], to.x, to.y)]);
    for (let tick = 1; tick < SEASON_TICKS && observeSiege(world, faction).squads[0]?.goal !== null; tick += 1) match.step();
    expect(observeSiege(world, faction).squads[0]).toMatchObject({ ...to, goal: null, refused: null });
  });

  it.each(['rome', 'carthage'] as const)('lets %s take the first opportunity without losses beside seed 80’s nearby guard', (faction) => {
    const world = siegeMatchRules.createWorld(80);
    const owner = faction === 'rome' ? 0 : 1;
    const home = world.economy.settlements[owner]!;
    const distance = (site: Site) => Math.max(Math.abs(site.x - home.x), Math.abs(site.y - home.y));
    const target = world.economy.settlements.slice(2).filter((site) => halfOf(world.map, site.x, site.y) === owner)
      .sort((a, b) => distance(a) - distance(b))[0]!;
    const at = turnPoint({ x: 0, y: 10 }, settlementSide(world.economy, home));
    const squad = musterSquad(world.economy, world.map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul',
      men: 24, x: home.x + at.x, y: home.y + at.y });
    const match = createMatch({ seed: 80, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step([move(faction, [squad.id], target.x, target.y)]);
    for (let tick = 1; tick < 400; tick += 1) match.step();
    const shown = observeSiege(world, faction);
    expect(shown.settlements.some((site) => site.id === target.id)).toBe(true);
    expect(shown.squads.find((body) => body.id === squad.id)).toMatchObject({ men: 24, refused: null, goal: null });
  });

  it('gives both Strongholds enough local capacity for the starting workers, including seed 587 timber', () => {
    for (const seed of [2, 4, 12, 14, 587]) {
      const map = generateMap(seed);
      const economy = createEconomy(map);
      const homes = economy.settlements.slice(0, 2);
      for (const kind of RESOURCE_KINDS) {
        const capacity = homes.map((home) => Math.min(home.population, landCapacity(map, home)[kind]!));
        expect(capacity, `seed ${seed}, resource ${kind}`).toEqual(homes.map((home) => home.population));
      }
    }
  });

  it('places every node in workable land, with all four resources at each home and nearby neutral opportunity over 1000 seeds', () => {
    const problems: string[] = [];
    for (let seed = 0; seed < 1000; seed += 1) {
      const map = generateMap(seed);
      const sites = [...map.strongholds, ...map.settlements];
      const economy = createEconomy(map);
      const opportunities = [...economy.settlements.slice(0, 2)];
      for (const node of map.resources) if (!sites.some((site) => within(site, node)))
        problems.push(`seed ${seed}: unworkable node ${node.kind} at ${node.x},${node.y}`);
      for (const half of [0, 1] as const) {
        const home = map.strongholds[half];
        const near = map.settlements.filter((site) => halfOf(map, site.x, site.y) === half)
          .sort((a, b) => Math.max(Math.abs(a.x - home.x), Math.abs(a.y - home.y)) -
            Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y)))[0]!;
        opportunities.push(economy.settlements.find((site) => site.x === near.x && site.y === near.y)!);
        for (const kind of RESOURCE_KINDS) for (const site of [home, near])
          if (!map.resources.some((node) => node.kind === kind && within(site, node)))
            problems.push(`seed ${seed}: resource ${kind} unavailable at ${site.x},${site.y}`);
      }
      // Ten opening citizens grow by at most one per Season: 22 after the
      // current three-year campaign. Compare actual staffed production at
      // equal development, including each side's first expansion opportunity.
      for (const population of [10, 22]) for (const developed of [false, true]) for (const season of ['spring', 'winter'] as const) {
        const yields = opportunities.map((site) => {
          const settlement = { ...site, population, works: developed
            ? ['farm', 'lumber-camp', 'quarry', 'mine'].map((building) => ({ building: buildingCode(building)!, remaining: 0, ordinal: 0 })) : [] };
          return seasonYield(settlement, allocate(settlement, landCapacity(map, site)), season);
        });
        if (yields.some((yielded) => JSON.stringify(yielded) !== JSON.stringify(yields[0])))
          problems.push(`seed ${seed}: unequal ${season} production at population ${population}, developed ${developed}`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  }, 120000);
});
