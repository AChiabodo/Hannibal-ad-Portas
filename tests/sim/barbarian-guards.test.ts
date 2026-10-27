import { expect, it } from 'vitest';
import { musterSquad } from '../../src/sim/movement';
import { createSiegeWorld, observeSiege, siegeMatchRules } from '../../src/sim/siege';
import { createMatch } from '../../src/sim/match';

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
