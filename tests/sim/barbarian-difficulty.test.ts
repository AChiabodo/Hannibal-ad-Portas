import { expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { createSiege, observeSiege, siegeMatchRulesForDifficulty } from '../../src/sim/siege';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createCampGuards } from '../../src/sim/barbarian-guards';
import { testMap } from './economy-fixtures';

it('keeps the same map and camp strength while configuring the shared raid interval', () => {
  const easy = createMatch({ seed: 4, rules: siegeMatchRulesForDifficulty('tiro') });
  const hard = createMatch({ seed: 4, rules: siegeMatchRulesForDifficulty('imperator') });
  expect(easy.state.world.map).toEqual(hard.state.world.map);
  expect(easy.state.world.barbarianCamps).toEqual(hard.state.world.barbarianCamps);
  expect(easy.state.world.barbarianRaidPeriod ?? 0).toBeGreaterThan(hard.state.world.barbarianRaidPeriod ?? 0);
  const again = createMatch({ seed: 4, rules: siegeMatchRulesForDifficulty('imperator') });
  expect(hard.hash()).toBe(again.hash());
  for (let tick = 0; tick < 650; tick += 1) { hard.step(); again.step(); }
  expect(hard.hash()).toBe(again.hash());
});

for (const faction of ['rome', 'carthage'] as const) {
  it(`raids a ${faction} settlement sooner on the harder setting`, () => {
    function scenario(difficulty: 'tiro' | 'imperator') {
      const rules = siegeMatchRulesForDifficulty(difficulty);
      const initial = rules.createWorld(4);
      const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }],
        settlements: [{ x: 75, y: 60 }] }), barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
      const economy = createEconomy(map);
      economy.settlements[2]!.owner = faction === 'rome' ? 0 : 1;
      const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
        barbarianCamps: [{ hp: 60 }], campOrders: [] };
      createCampGuards(world);
      return createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
    }
    const easy = scenario('tiro');
    const hard = scenario('imperator');
    for (let tick = 0; tick < 750; tick += 1) { easy.step(); hard.step(); }
    expect(observeSiege(easy.state.world, faction).enemies.some((enemy) => enemy.neutral)).toBe(false);
    expect(observeSiege(hard.state.world, faction).enemies.some((enemy) => enemy.neutral)).toBe(true);
  });
}
