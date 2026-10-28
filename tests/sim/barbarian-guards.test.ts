import { expect, it } from 'vitest';
import { musterSquad } from '../../src/sim/movement';
import { createSiegeWorld, observeSiege, siegeMatchRules } from '../../src/sim/siege';
import { createMatch } from '../../src/sim/match';
import { move } from '../../src/sim/command';
import { createCampGuards } from '../../src/sim/barbarian-guards';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { startCalendar } from '../../src/sim/season';
import { createSiege, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';

it('a discovered barbarian camp has neutral defenders hostile to both factions', () => {
  const world = createSiegeWorld(1);
  const camp = world.map.barbarianCamps?.[0];
  expect(camp).toBeDefined();
  if (camp === undefined) return;
  const rome = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: camp.x, y: camp.y });
  const seenByRome = observeSiege(world, 'rome').enemies;
  expect(seenByRome.some((enemy) => enemy.neutral === true)).toBe(true);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 15; tick += 1) match.step();
  expect(rome.strength).toBeLessThan(24);
  const other = createSiegeWorld(1);
  musterSquad(other.economy, other.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: camp.x, y: camp.y });
  expect(observeSiege(other, 'carthage').enemies.some((enemy) => enemy.neutral === true)).toBe(true);
});

it('camp defenders react to a nearby intruder without waiting for an attack order', () => {
  const world = createSiegeWorld(1);
  const camp = world.map.barbarianCamps![0]!;
  const intruder = musterSquad(world.economy, world.map, {
    faction: 'rome', squadType: 'hastati', men: 24, x: camp.x + 4, y: camp.y,
  });
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 150; tick += 1) match.step();
  expect(intruder.strength).toBeLessThan(24);
});

it('a surviving camp gradually replaces a defeated defender', () => {
  const world = createSiegeWorld(1);
  const camp = world.map.barbarianCamps![0]!;
  const attacker = musterSquad(world.economy, world.map, {
    faction: 'rome', squadType: 'triarii', men: 120, x: camp.x, y: camp.y,
  });
  musterSquad(world.economy, world.map, {
    faction: 'rome', squadType: 'hastati', men: 24, x: camp.x + 3, y: camp.y,
  });
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 200; tick += 1) match.step();
  expect(observeSiege(world, 'rome').enemies.some((enemy) => enemy.neutral === true)).toBe(false);
  match.step([move('rome', [attacker.id], camp.x + 12, camp.y)]);
  while (match.state.tick < 601) match.step();
  expect(observeSiege(world, 'rome').enemies.some((enemy) => enemy.neutral === true)).toBe(true);
});

it('a destroyed camp does not replace its defeated surviving guard', () => {
  const world = createSiegeWorld(1);
  const camp = world.map.barbarianCamps![0]!;
  world.barbarianCamps![0]!.hp = 0;
  musterSquad(world.economy, world.map, {
    faction: 'rome', squadType: 'triarii', men: 120, x: camp.x, y: camp.y,
  });
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 200; tick += 1) match.step();
  expect(observeSiege(world, 'rome').enemies.some((enemy) => enemy.neutral === true)).toBe(false);
  while (match.state.tick < 601) match.step();
  expect(observeSiege(world, 'rome').enemies.some((enemy) => enemy.neutral === true)).toBe(false);
});

it('orphaned defenders do not approach a nearby squad on their own', () => {
  const world = createSiegeWorld(1);
  const camp = world.map.barbarianCamps![0]!;
  world.barbarianCamps![0]!.hp = 0;
  const scout = musterSquad(world.economy, world.map, {
    faction: 'rome', squadType: 'hastati', men: 24, x: camp.x + 4, y: camp.y,
  });
  const seen = observeSiege(world, 'rome').enemies.find((enemy) => enemy.neutral === true);
  expect(seen).toBeDefined();
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  for (let tick = 0; tick < 180; tick += 1) match.step();
  const after = observeSiege(world, 'rome').enemies.find((enemy) => enemy.id === seen?.id);
  expect(after).toMatchObject({ x: seen?.x, y: seen?.y });
  expect(scout.strength).toBe(24);
});

it('orphaned defenders wander beyond a tiny repeating circuit', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 31, y: 20, variant: 0 }] };
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 0 }] };
  createCampGuards(world);
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const start = observeSiege(world, 'rome').enemies.find((enemy) => enemy.neutral);
  expect(start).toBeDefined();
  let furthest = 0;
  let leftSight = false;
  for (let tick = 0; tick < 1200; tick += 1) {
    match.step();
    const sighting = observeSiege(world, 'rome').enemies.find((enemy) => enemy.id === start?.id);
    if (sighting === undefined) leftSight = true;
    if (sighting !== undefined && start !== undefined) {
      furthest = Math.max(furthest, Math.abs(sighting.x - start.x), Math.abs(sighting.y - start.y));
    }
  }
  expect(leftSight || furthest > 3).toBe(true);
});
