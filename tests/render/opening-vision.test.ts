import { expect, it } from 'vitest';
import { openingEyes, openingTiles } from '../../src/render/opening';
import { createFog, refreshVision, viewOf } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { createSiegeWorld, observeSiege, siegeMatchRules } from '../../src/sim/siege';
import { musterSquad } from '../../src/sim/movement';

it.each(['rome', 'carthage'] as const)('composes the opening %s fixture with the same vision as a real Match (#76)', (faction) => {
  const world = createSiegeWorld(7);
  for (const tile of openingTiles(world.map, faction)) musterSquad(world.economy, world.map,
    { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul', ...tile });
  const fog = createFog();
  refreshVision(fog, world.map, openingEyes(world.map, faction));
  const match = createMatch({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([]);
  const observed = observeSiege(world, faction).fog;
  expect(viewOf(fog).visible).toEqual(observed.visible);
  expect(viewOf(fog).terrain).toEqual(observed.terrain);
});
