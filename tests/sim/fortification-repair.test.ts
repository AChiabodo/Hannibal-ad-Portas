import { expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { build, cancelFortificationRepair, move, repairFortification, repairWork, type Command } from '../../src/sim/command';
import { observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { musterSquad } from '../../src/sim/movement';
import { buildingCode } from '../../src/content/buildings';

it('shares arrival priority between unpaid wall and building repairs', () => {
  const run = (wallFirst: boolean, immediate = false) => {
    const world = siegeMatchRules.createWorld(7);
    const site = world.economy.settlements[0]!;
    site.stocks.fill(20);
    site.stocks[2] = immediate ? 4 : 0;
    site.works.push({ building: buildingCode('house')!, ordinal: 0, remaining: 0, hp: 0 });
    world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!.hp = 0;
    const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
    const wall = repairFortification('rome', 0, 'wall', 'north');
    const house = repairWork('rome', 0, 'house', 0);
    match.step(wallFirst ? [wall, house] : [house, wall]);
    if (!immediate) { site.stocks[2] = 4; match.step(); }
    return observeSiege(world, 'rome');
  };
  const wallFirst = run(true);
  expect(wallFirst.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairing).toBe(true);
  expect(wallFirst.settlements[0]!.works.find((work) => work.building === 'house')?.repairWaiting).toBe('resources');
  const houseFirst = run(false);
  expect(houseFirst.settlements[0]!.works.find((work) => work.building === 'house')?.repairing).toBe(true);
  expect(houseFirst.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairWaiting).toBe('resources');
  const immediateWall = run(true, true);
  expect(immediateWall.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairing).toBe(true);
  expect(immediateWall.settlements[0]!.works.find((work) => work.building === 'house')?.repairWaiting).toBe('resources');
  const immediateHouse = run(false, true);
  expect(immediateHouse.settlements[0]!.works.find((work) => work.building === 'house')?.repairing).toBe(true);
  expect(immediateHouse.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairWaiting).toBe('resources');
});

it('keeps an unpaid repair request visible and starts it when stone is available', () => {
  const world = siegeMatchRules.createWorld(7);
  const site = world.economy.settlements[0]!;
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 30;
  site.stocks.fill(0);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north'))
    .toMatchObject({ hp: 30, repairing: false, repairWaiting: 'resources' });
  site.stocks.fill(100);
  match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north'))
    .toMatchObject({ hp: 30, repairing: true });
});

it('can cancel an unpaid repair request without paying or starting it later', () => {
  const world = siegeMatchRules.createWorld(7);
  const site = world.economy.settlements[0]!;
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 30;
  site.stocks.fill(0);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  match.step([cancelFortificationRepair('rome', 0, 'wall', 'north')]);
  site.stocks.fill(100);
  match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north'))
    .toMatchObject({ hp: 30, repairing: false });
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.stone).toBe(100);
});

it('repairs an owned broken wall using local resources and workers', () => {
  const world = siegeMatchRules.createWorld(7);
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1)!;
  wall.hp = 0;
  world.economy.settlements[0]!.stocks.fill(100);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  const before = observeSiege(world, 'rome').settlements[0]!.stocks.stone;
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  const started = observeSiege(world, 'rome');
  expect(started.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')).toMatchObject({ hp: 0, repairing: true });
  expect(started.settlements[0]!.stocks.stone).toBeLessThan(before);
  for (let tick = 0; tick < 1000; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')).toMatchObject({ hp: 60, repairing: false });
});

it('refuses new repairs during a siege, but keeps a paid repair after siege starts', () => {
  const world = siegeMatchRules.createWorld(7);
  const front = world.siege.fronts[0]!;
  const wall = front.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 45;
  world.economy.settlements[0]!.stocks.fill(100);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  front.path = 1;
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.side === 'north' && item.kind === 'wall')?.repairing).toBe(false);
  front.path = 0;
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  front.path = 1;
  for (let tick = 0; tick < 50; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.side === 'north' && item.kind === 'wall')).toMatchObject({ hp: 60, repairing: false });
});

it('cancels a paid repair without refund or restoring damaged health', () => {
  const world = siegeMatchRules.createWorld(7);
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 20;
  world.economy.settlements[0]!.stocks.fill(100);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  const paid = observeSiege(world, 'rome').settlements[0]!.stocks.stone;
  match.step([cancelFortificationRepair('rome', 0, 'wall', 'north')]);
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')).toMatchObject({ hp: 20, repairing: false });
  expect(observeSiege(world, 'rome').settlements[0]!.stocks.stone).toBe(paid);
});

it('waits for workers without restoring health and resumes when they are available', () => {
  const world = siegeMatchRules.createWorld(7);
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 55;
  const settlement = world.economy.settlements[0]!;
  settlement.stocks.fill(100);
  settlement.population = 1;
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  for (let tick = 0; tick < 30; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.side === 'north' && item.kind === 'wall')).toMatchObject({ hp: 55, repairing: true });
  settlement.population = 30;
  for (let tick = 0; tick < 30; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.side === 'north' && item.kind === 'wall')).toMatchObject({ hp: 60, repairing: false });
});

it('keeps a repaired breach open until the body occupying its passage leaves', () => {
  const world = siegeMatchRules.createWorld(7);
  const site = world.economy.settlements[0]!;
  const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
  wall.hp = 0;
  site.stocks.fill(100);
  const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: site.x, y: site.y - 7 });
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  for (let tick = 0; tick < 220; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')).toMatchObject({ hp: 0, repairing: true, repairRemaining: 0 });
  match.step([move('rome', [squad.id], site.x, site.y - 15)]);
  for (let tick = 0; tick < 250; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')).toMatchObject({ hp: 60, repairing: false });
});

it('assigns scarce workers to fortifications in the order their repairs were requested', () => {
  const world = siegeMatchRules.createWorld(7);
  const site = world.economy.settlements[0]!;
  site.population = 2;
  site.stocks.fill(100);
  const walls = world.siege.fronts[0]!.structures.filter((item) => item.kind === 1);
  for (const wall of walls) wall.hp = 30;
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'east'), repairFortification('rome', 0, 'wall', 'north')]);
  const visible = observeSiege(world, 'rome').fronts[0]!.structures;
  expect(visible.find((item) => item.kind === 'wall' && item.side === 'east')?.repairRemaining).toBe(89);
  expect(visible.find((item) => item.kind === 'wall' && item.side === 'north')?.repairRemaining).toBe(90);
});

it('shares worker priority with new construction in the order chosen by the player', () => {
  const run = (first: 'repair' | 'build') => {
    const world = siegeMatchRules.createWorld(7);
    const site = world.economy.settlements[0]!;
    site.population = 4;
    site.stocks.fill(100);
    const wall = world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!;
    wall.hp = 30;
    const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
    const commands = [repairFortification('rome', 0, 'wall', 'north'), build('rome', 0, 'farm')];
    match.step(first === 'repair' ? commands : commands.reverse());
    return observeSiege(world, 'rome');
  };
  const repairFirst = run('repair');
  const buildFirst = run('build');
  expect(repairFirst.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairRemaining).toBe(89);
  expect(buildFirst.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairRemaining).toBe(90);
});

it('gives completed productive works priority over a new repair', () => {
  const world = siegeMatchRules.createWorld(7);
  const site = world.economy.settlements[0]!;
  site.population = 5;
  site.stocks.fill(100);
  site.works.push({ building: buildingCode('farm')!, remaining: 0 });
  world.siege.fronts[0]!.structures.find((item) => item.kind === 1 && item.side === 0)!.hp = 30;
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([repairFortification('rome', 0, 'wall', 'north')]);
  const seen = observeSiege(world, 'rome');
  expect(seen.fronts[0]!.structures.find((item) => item.kind === 'wall' && item.side === 'north')?.repairRemaining).toBe(90);
});
