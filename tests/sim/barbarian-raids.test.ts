import { expect, it } from 'vitest';
import { buildingCode } from '../../src/content/buildings';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { createCampGuards } from '../../src/sim/barbarian-guards';
import { repairWork } from '../../src/sim/command';
import { createSiege, observeSiege, siegeMatchRulesForDifficulty } from '../../src/sim/siege';
import { testMap } from './economy-fixtures';

for (const faction of ['rome', 'carthage'] as const) {
  it(`raiders can damage a completed ${faction} work without capturing it`, () => {
    const rules = siegeMatchRulesForDifficulty('imperator');
    const initial = rules.createWorld(4);
    const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }],
      settlements: [{ x: 75, y: 60 }] }), barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
    const economy = createEconomy(map);
    economy.settlements[2]!.owner = faction === 'rome' ? 0 : 1;
    economy.settlements[2]!.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
    const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
      barbarianCamps: [{ hp: 60 }], campOrders: [] };
    createCampGuards(world);
    const match = createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
    for (let tick = 0; tick < 900; tick += 1) match.step();
    const site = observeSiege(world, faction).settlements.find((settlement) => settlement.id === 2);
    expect(site).toBeDefined();
    expect(site?.works[0]?.hp).toBeLessThan(60);
  });
}

for (const state of ['construction', 'repair'] as const) {
  it(`does not damage a work in ${state}`, () => {
    const rules = siegeMatchRulesForDifficulty('imperator');
    const initial = rules.createWorld(4);
    const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }],
      settlements: [{ x: 75, y: 60 }] }), barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
    const economy = createEconomy(map);
    economy.settlements[2]!.owner = 0;
    economy.settlements[2]!.population = 0;
    economy.settlements[2]!.stocks.fill(100);
    economy.settlements[2]!.works.push({ building: buildingCode('farm')!, ordinal: 0,
      remaining: state === 'construction' ? 100 : 0, ...(state === 'repair' ? { hp: 40 } : {}) });
    const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
      barbarianCamps: [{ hp: 60 }], campOrders: [] };
    createCampGuards(world);
    const match = createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
    if (state === 'repair') match.step([repairWork('rome', 2, 'farm', 0)]);
    for (let tick = 0; tick < 900; tick += 1) match.step();
    const work = observeSiege(world, 'rome').settlements.find((site) => site.id === 2)?.works[0];
    if (state === 'construction') expect(work).toMatchObject({ remaining: 100 });
    else expect(work).toMatchObject({ hp: 40, repairing: true });
  });
}
