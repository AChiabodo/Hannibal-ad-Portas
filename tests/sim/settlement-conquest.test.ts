import { expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { startCalendar } from '../../src/sim/season';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { blockade, type Command } from '../../src/sim/command';
import { testMap } from './economy-fixtures';
import { buildingCode } from '../../src/content/buildings';

it('takes the visible capture square without requiring its exact centre tile', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }], settlements: [{ x: 110, y: 100 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 109, y: 100 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 151; tick += 1) match.step();
  expect(observeSiege(match.state.world, 'rome').settlements.some((site) => site.id === 2)).toBe(true);
});

it('keeps an occupied stronghold when its plaza is held but its wall defenders remain', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const defender = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
  defender.garrison = 0;
  world.siege.fronts[0]!.structures[0]!.hp = 0;
  musterSquad(economy, map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 24, y: 25 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 151; tick += 1) match.step();
  expect(observeSiege(match.state.world, 'rome').settlements.some((site) => site.id === 0)).toBe(true);
});

it('preserves captured Works and their tradition while discarding unpaid orders of the former owner', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }], settlements: [{ x: 110, y: 100 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[2]!;
  site.owner = 1;
  site.origin = 1;
  site.tier = 3;
  site.stocks.fill(0);
  site.works.push({ building: buildingCode('house')!, remaining: 0, ordinal: 0, origin: 1 });
  economy.pending = [{ id: 1, owner: 1, settlement: 2, kind: 0, content: buildingCode('house')!, ordinal: 1, men: 0, count: 0, reason: 2 }];
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 109, y: 100 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 151; tick += 1) match.step();
  expect(observeSiege(match.state.world, 'rome').settlements.find((current) => current.id === 2)).toMatchObject({
    tier: 3, pending: [], works: [{ building: 'house', remaining: 0, ordinal: 0, origin: 'carthage' }],
  });
});

it('recognises winter quarters throughout the courtyard, excluding exterior productive grounds', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const inside = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 29, y: 25 });
  const outside = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 36, y: 25 });
  const squads = observeSiege(world, 'rome').squads;
  expect(squads.find((squad) => squad.id === inside.id)?.inQuarters).toBe(true);
  expect(squads.find((squad) => squad.id === outside.id)?.inQuarters).toBe(false);
});

it('keeps a perimeter blockade against a token relief force, but yields to a stronger emerged army', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'libyan-spear', men: 48, x: 25, y: 33 });
  attacker.facing = 0;
  const relief = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 120, x: 15, y: 25 });
  relief.strength = 1;
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([blockade('carthage', [attacker.id], 0)]);
  expect(observeSiege(match.state.world, 'carthage').fronts.find((front) => front.settlement === 0)?.besieger).toBe('carthage');
  relief.strength = 120;
  match.step();
  expect(observeSiege(match.state.world, 'rome').fronts.find((front) => front.settlement === 0)?.besieger).toBeNull();
});
