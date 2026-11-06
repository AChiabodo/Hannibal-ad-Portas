import { expect, it } from 'vitest';
import { move } from '../../src/sim/command';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';

it('reveals a camp only through sight, then retains its last observed appearance', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 42, y: 42, variant: 1 }] };
  const economy = createEconomy(map);
  const scout = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 36, y: 42 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  expect(observeSiege(world, 'rome').barbarianCamps).toEqual([]);
  expect(observeSiege(world, 'carthage').barbarianCamps).toEqual([]);
  match.step([move('rome', [scout.id], 40, 42)]);
  for (let i = 0; i < 80; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toEqual([{ id: 0, x: 42, y: 42, variant: 1, condition: 'standing', memory: 'seen' }]);
  match.step([move('rome', [scout.id], 30, 42)]);
  for (let i = 0; i < 120; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toEqual([{ id: 0, x: 42, y: 42, variant: 1, condition: 'standing', memory: 'remembered' }]);
  expect(observeSiege(world, 'carthage').barbarianCamps).toEqual([]);
  const hash = match.hash();
  observeSiege(world, 'rome');
  expect(match.hash()).toBe(hash);
});
