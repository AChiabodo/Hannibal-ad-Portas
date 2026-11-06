import { expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { startCalendar } from '../../src/sim/season';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { blockade, repairFortification, repairWork, type Command } from '../../src/sim/command';
import { testMap } from './economy-fixtures';
import { buildingCode } from '../../src/content/buildings';

it('marks defenders unknown when the observed plaza reveals no wall', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  world.siege.fronts[1]!.structures[0]!.hp = 0;
  const hidden = musterSquad(economy, map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 75, y: 75 });
  hidden.garrison = 1;
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 73, y: 75 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step();
  const front = observeSiege(match.state.world, 'rome').fronts.find((current) => current.settlement === 1);
  expect(front).toMatchObject({ structures: [], garrisonKnown: false });
  expect(front?.garrisonMen).toBeUndefined();
});

it('reports the observed gate front without requiring sight of the hidden settlement centre', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 65, y: 75 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step();
  const front = observeSiege(match.state.world, 'rome').fronts.find((current) => current.settlement === 1);
  expect(front?.structures).toHaveLength(2);
  expect(front?.structures.every((part) => part.side === 'west')).toBe(true);
  expect(front?.garrisonMen).toBeUndefined();
});

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

it('cancels a fortification repair when a breached stronghold is captured', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.population = 2;
  site.stocks.fill(100);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const front = world.siege.fronts[0]!;
  front.structures.find((piece) => piece.kind === 0)!.hp = 0;
  front.structures.find((piece) => piece.kind === 1 && piece.side === 0)!.hp = 0;
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 24, y: 25 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  const paid = observeSiege(world, 'rome');
  expect(paid.fronts[0]!.structures.find((piece) => piece.kind === 'wall' && piece.side === 'north'))
    .toMatchObject({ hp: 0, repairing: true, repairRemaining: 179 });
  const stocks = paid.settlements[0]!.stocks;
  for (let tick = 0; tick < 10; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((piece) => piece.kind === 'wall' && piece.side === 'north')?.repairRemaining).toBe(169);
  for (let tick = 0; tick < 141; tick += 1) match.step();
  const captured = observeSiege(world, 'carthage');
  expect(captured.settlements.find((current) => current.id === 0)?.stocks).toEqual(stocks);
  expect(captured.fronts.find((current) => current.settlement === 0)!.structures.find((piece) => piece.kind === 'wall' && piece.side === 'north'))
    .toMatchObject({ hp: 0, repairing: false });
});

it('cancels a paid repair on capture without healing or refund and lets the new owner repair', () => {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }], settlements: [{ x: 110, y: 100 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[2]!;
  site.owner = 1;
  site.population = 2;
  site.stocks.fill(100);
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 0 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 109, y: 100 });
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('carthage', 2, 'farm', 0)]);
  const paid = observeSiege(world, 'carthage').settlements.find((current) => current.id === 2)!;
  expect(paid.works[0]).toMatchObject({ hp: 0, repairing: true, repairRemaining: 179 });
  expect(paid.stocks.timber).toBeLessThan(100);
  for (let tick = 0; tick < 10; tick += 1) match.step();
  expect(observeSiege(world, 'carthage').settlements.find((current) => current.id === 2)!.works[0]?.repairRemaining).toBe(169);
  for (let tick = 0; tick < 141; tick += 1) match.step();
  const captured = observeSiege(world, 'rome').settlements.find((current) => current.id === 2)!;
  expect(captured.works[0]).toMatchObject({ hp: 0, repairing: false });
  expect(captured.stocks).toEqual(paid.stocks);
  match.step([repairWork('rome', 2, 'farm', 0)]);
  expect(observeSiege(world, 'rome').settlements.find((current) => current.id === 2)!.works[0])
    .toMatchObject({ hp: 0, repairing: true, repairRemaining: 179 });
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
