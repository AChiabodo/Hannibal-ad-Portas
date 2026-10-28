import { expect, it } from 'vitest';
import { buildingCode } from '../../src/content/buildings';
import { attackStructure, build, cancelWorkRepair, move, repairWork } from '../../src/sim/command';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import { workGround } from '../../src/sim/settlement-space';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';
import { settlementComposition } from '../../src/art/settlement-composition';
import { TERRAIN, tileIndex } from '../../src/sim/map';

it('stops an approach with a visible reason when the work leaves sight', () => {
  const map = testMap({ strongholds: [{ x: 50, y: 50 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, site, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 25, y: rect.y });
  const spotter = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y + 4 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id)?.goal).not.toBeNull();
  match.step([move('carthage', [spotter.id], rect.x - 2, rect.y + 20)]);
  for (let i = 0; i < 100; i += 1) {
    const shown = observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id)!;
    if (shown.refused === 'target-not-visible') break;
    match.step();
  }
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id))
    .toMatchObject({ goal: null, refused: 'target-not-visible' });
});

it('stops an approach and explains when an observed work starts repairing', () => {
  const map = testMap({ strongholds: [{ x: 50, y: 50 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.population = 0;
  site.stocks.fill(20);
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 40 });
  const rect = workGround(economy, site, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 16, y: rect.y });
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id)?.goal).not.toBeNull();
  match.step([repairWork('rome', 0, 'farm', 0)]);
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id))
    .toMatchObject({ goal: null, refused: 'target-repairing' });
});

it('allows an enemy to damage a visible completed work', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, settlement, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  for (let i = 0; i < 40; i += 1) match.step();
  const farm = observeSiege(world, 'rome').settlements[0]!.works[0]!;
  expect(farm.hp).toBeLessThan(farm.maxHp!);
});

it('fires at a work from a clear ranged position without advancing into melee range', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, settlement, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24,
    x: rect.x + rect.width + 3, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id)?.goal).toBeNull();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]!.hp).toBeLessThan(60);
});

it('approaches a visible work from a reachable side when its western approach is blocked', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, settlement, 'farm', 0)!;
  map.terrain[tileIndex(rect.x - 1, rect.y)] = TERRAIN.river;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24,
    x: rect.x + rect.width + 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  for (let i = 0; i < 150; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]!.hp).toBeLessThan(60);
});

it('stops a ruined farm from producing without removing the work', () => {
  const harvest = (hp: number): number => {
    const map = testMap();
    const economy = createEconomy(map);
    const settlement = economy.settlements[0]!;
    settlement.population = 4;
    settlement.stocks.fill(10);
    settlement.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    for (let i = 0; i < SEASON_TICKS; i += 1) match.step();
    const visible = observeSiege(world, 'rome').settlements[0]!;
    expect(visible.works).toHaveLength(1);
    return visible.stocks.grain;
  };
  expect(harvest(60)).toBeGreaterThan(harvest(0));
}, 30000);

it('suspends production while a damaged farm is being repaired', () => {
  const harvest = (repairing: boolean): number => {
    const map = testMap();
    const economy = createEconomy(map);
    const site = economy.settlements[0]!;
    site.population = 4;
    site.stocks.fill(10);
    site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 50 });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    for (let tick = 0; tick < SEASON_TICKS - 10; tick += 1) match.step();
    if (repairing) match.step([repairWork('rome', 0, 'farm', 0)]);
    for (let tick = 0; tick < 12; tick += 1) match.step();
    const visible = observeSiege(world, 'rome').settlements[0]!;
    expect(visible.works[0]).toMatchObject({ hp: 50, repairing });
    return visible.stocks.grain;
  };
  expect(harvest(false)).toBeGreaterThan(harvest(true));
}, 30000);

it('preserves stored resources when a granary is ruined', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.population = 4;
  settlement.stocks.fill(50);
  settlement.works.push({ building: buildingCode('granary')!, remaining: 0, ordinal: 0, hp: 0 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let i = 0; i < SEASON_TICKS; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.stone).toBeGreaterThanOrEqual(50);
}, 30000);

it.each([false, true])('preserves full house and granary capacity while ruined or repairing (repairing: %s)', (repairing) => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.population = 12;
  site.stocks.fill(55);
  site.works.push(
    { building: buildingCode('house')!, remaining: 0, ordinal: 0, hp: 0 },
    { building: buildingCode('granary')!, remaining: 0, ordinal: 0, hp: 0 },
  );
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < SEASON_TICKS - 10; tick += 1) match.step();
  if (repairing) match.step([repairWork('rome', 0, 'house', 0), repairWork('rome', 0, 'granary', 0)]);
  for (let tick = 0; tick < 12; tick += 1) match.step();
  const observed = observeSiege(world, 'rome').settlements[0]!;
  expect(observed.works.every((work) => work.hp === 0 && work.repairing === repairing)).toBe(true);
  expect(observed.population).toBeGreaterThan(12);
  expect(observed.stocks.stone).toBeGreaterThan(30);
}, 30000);

it('does not damage a work that is still under construction', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.population = 0;
  settlement.works.push({ building: buildingCode('farm')!, remaining: 100, ordinal: 0 });
  const rect = workGround(economy, settlement, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  for (let i = 0; i < 40; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ remaining: 100 });
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]!.hp).toBeUndefined();
});

it('does not shoot through an intact wall at an interior work', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.works.push({ building: buildingCode('house')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, settlement, 'house', 0)!;
  const horizontal = Math.abs(rect.x - settlement.x) > Math.abs(rect.y - settlement.y);
  const x = horizontal ? settlement.x + (rect.x < settlement.x ? -8 : 8) : rect.x;
  const y = horizontal ? rect.y : settlement.y + (rect.y < settlement.y ? -8 : 8);
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24, x, y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'house', ordinal: 0 })]);
  for (let i = 0; i < 40; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 60 });
});

it('does not damage a work while its repair is active', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const settlement = economy.settlements[0]!;
  settlement.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 40, repairTicks: 10 });
  const rect = workGround(economy, settlement, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 })]);
  for (let i = 0; i < 40; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 40 });
});

it('repairs a ruined work with local resources and workers', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.stocks.fill(20);
  site.population = 10;
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 0 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'farm', 0)]);
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 0, repairing: true });
  for (let i = 0; i < 200; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 60, repairing: false });
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.timber).toBeLessThan(20);
});

it('keeps an already started work repair waiting for workers during a siege', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.stocks.fill(20);
  site.population = 1;
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 50 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'farm', 0)]);
  world.siege.fronts[0]!.path = 1;
  for (let i = 0; i < 50; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 50, repairing: true, repairRemaining: 30 });
  site.population = 10;
  for (let i = 0; i < 40; i += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 60, repairing: false });
});

it('cancels a paid work repair without refunding or restoring its health', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.stocks.fill(20);
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 30 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'farm', 0)]);
  const afterPayment = observeSiege(world, 'rome').settlements[0]!.stocks.timber;
  match.step([cancelWorkRepair('rome', 0, 'farm', 0)]);
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 30, repairing: false });
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.timber).toBe(afterPayment);
});

it('protects a repair stalled for workers until cancellation, without refunding it', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.stocks.fill(20);
  site.population = 1;
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 50 });
  const rect = workGround(economy, site, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'farm', 0)]);
  const paid = observeSiege(world, 'rome').settlements[0]!.stocks.timber;
  const attack = attackStructure('carthage', [attacker.id], { kind: 'work', settlement: 0, building: 'farm', ordinal: 0 });
  match.step([attack]);
  for (let tick = 0; tick < 20; tick += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0])
    .toMatchObject({ hp: 50, repairing: true, repairRemaining: 30, repairWaiting: 'workers' });
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === attacker.id)?.refused).toBe('target-repairing');
  match.step([cancelWorkRepair('rome', 0, 'farm', 0)]);
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.timber).toBe(paid);
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 50, repairing: false });
  match.step([attack]);
  for (let tick = 0; tick < 10; tick += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]!.hp).toBeLessThan(50);
});

it('keeps an unfunded work repair unpaid until resources are available', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.stocks.fill(0);
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 30 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'farm', 0)]);
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 30, repairing: false, repairWaiting: 'resources' });
  site.stocks.fill(20);
  match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works[0]).toMatchObject({ hp: 30, repairing: true });
});

it('starts affordable construction and repair requests in their arrival order', () => {
  const run = (first: 'repair' | 'build', immediate = false) => {
    const map = testMap();
    const economy = createEconomy(map);
    const site = economy.settlements[0]!;
    site.stocks.fill(20);
    site.stocks[1] = immediate ? 4 : 0;
    site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 0 });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    const orders = [repairWork('rome', 0, 'farm', 0), build('rome', 0, 'house')];
    match.step(first === 'repair' ? orders : orders.reverse());
    if (!immediate) { site.stocks[1] = 4; match.step(); }
    return observeSiege(world, 'rome').settlements[0]!;
  };
  const repairFirst = run('repair');
  expect(repairFirst.works.find((work) => work.building === 'farm')?.repairing).toBe(true);
  expect(repairFirst.pending?.some((order) => order.building === 'house')).toBe(true);
  const buildFirst = run('build');
  expect(buildFirst.works.some((work) => work.building === 'house')).toBe(true);
  expect(buildFirst.works.find((work) => work.building === 'farm')?.repairWaiting).toBe('resources');
  const immediateRepair = run('repair', true);
  expect(immediateRepair.works.find((work) => work.building === 'farm')?.repairing).toBe(true);
  expect(immediateRepair.pending?.some((order) => order.building === 'house')).toBe(true);
  const immediateBuild = run('build', true);
  expect(immediateBuild.works.some((work) => work.building === 'house')).toBe(true);
  expect(immediateBuild.works.find((work) => work.building === 'farm')?.repairWaiting).toBe('resources');
});

it('keeps a productive work staffed before allocating workers to a new work repair', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.population = 5;
  site.stocks.fill(20);
  site.works.push(
    { building: buildingCode('farm')!, remaining: 0, ordinal: 0 },
    { building: buildingCode('lumber-camp')!, remaining: 0, ordinal: 0, hp: 30 },
  );
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'lumber-camp', 0)]);
  const works = observeSiege(world, 'rome').settlements[0]!.works;
  expect(works.find((work) => work.building === 'farm')?.staffed).toBe(true);
  expect(works.find((work) => work.building === 'lumber-camp'))
    .toMatchObject({ repairing: true, repairRemaining: 90, repairWaiting: 'workers' });
});

it('shares workers between building repairs and construction in the chosen order', () => {
  const run = (first: 'repair' | 'build') => {
    const map = testMap();
    const economy = createEconomy(map);
    const site = economy.settlements[0]!;
    site.population = 4;
    site.stocks.fill(20);
    site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 30 });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    const repair = repairWork('rome', 0, 'farm', 0);
    const construction = build('rome', 0, 'lumber-camp');
    match.step(first === 'repair' ? [repair, construction] : [construction, repair]);
    return observeSiege(world, 'rome').settlements[0]!.works;
  };
  const repairFirst = run('repair');
  expect(repairFirst.find((work) => work.building === 'farm')).toMatchObject({ repairing: true, repairRemaining: 89 });
  expect(repairFirst.find((work) => work.building === 'lumber-camp')?.remaining).toBe(350);
  const buildFirst = run('build');
  expect(buildFirst.find((work) => work.building === 'farm')).toMatchObject({ repairing: true, repairRemaining: 90, repairWaiting: 'workers' });
  expect(buildFirst.find((work) => work.building === 'lumber-camp')?.remaining).toBe(349);
});

it('rejoins the normal work order after a repair completes', () => {
  const map = testMap();
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  site.population = 6;
  site.stocks.fill(20);
  site.works.push(
    { building: buildingCode('farm')!, remaining: 50, ordinal: 0, queueOrder: 1 },
    { building: buildingCode('lumber-camp')!, remaining: 0, ordinal: 0, hp: 59 },
  );
  economy.nextPendingId = 2;
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'lumber-camp', 0)]);
  for (let tick = 0; tick < 2; tick += 1) match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works.find((work) => work.building === 'lumber-camp'))
    .toMatchObject({ hp: 60, repairing: false });
  const before = observeSiege(world, 'rome').settlements[0]!.works.find((work) => work.building === 'farm')!.remaining;
  match.step();
  expect(observeSiege(world, 'rome').settlements[0]!.works.find((work) => work.building === 'farm')!.remaining).toBe(before - 1);
});

it('remembers a work as last seen until its ruin is observed again', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[0]!;
  const work = { building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 60 };
  site.works.push(work);
  const rect = workGround(economy, site, 'farm', 0)!;
  const scout = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: rect.x - 2, y: rect.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const stages = () => observeSiege(world, 'carthage').appearances?.find((item) => item.id === 0)?.tiles
    .filter((tile) => tile.work?.building === 'farm').map((tile) => tile.work!.stage) ?? [];
  expect(stages()).toContain(2);
  match.step([move('carthage', [scout.id], 55, 55)]);
  for (let i = 0; i < 220; i += 1) match.step();
  work.hp = 0;
  match.step();
  expect(stages()).toContain(2);
  expect(stages()).not.toContain(4);
  match.step([move('carthage', [scout.id], rect.x - 2, rect.y)]);
  for (let i = 0; i < 220; i += 1) match.step();
  expect(stages()).toContain(4);
});

it('draws damaged, ruined and repairing works differently from an intact work', () => {
  const draw = (stage: number) => settlementComposition({ kind: 'stronghold', owner: 'rome', tier: 1,
    works: [{ building: 'farm', ordinal: 0, origin: 'rome', stage }] }).pixels;
  const intact = draw(2);
  for (const stage of [3, 4, 5]) expect(draw(stage).some((pixel, index) => pixel !== intact[index])).toBe(true);
});
