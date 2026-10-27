import { expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { cancelFortificationRepair, move, repairFortification, type Command } from '../../src/sim/command';
import { observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { musterSquad } from '../../src/sim/movement';

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
