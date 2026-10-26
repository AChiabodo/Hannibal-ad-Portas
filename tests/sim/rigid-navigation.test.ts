import { expect, it } from 'vitest';
import { formationFootprint } from '../../src/content/formation';
import { move, type Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { TERRAIN, tileIndex } from '../../src/sim/map';

it('repositions a rigid formation away from a concave river bank before turning towards a legitimate new goal', () => {
  const world = siegeMatchRules.createWorld(7);
  const squad = musterSquad(world.economy, world.map,
    { faction: 'carthage', squadType: 'gaul', men: 24, x: 55, y: 90, facing: 'west' });
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([move('carthage', [squad.id], 53, 93)]);
  expect(observeSiege(match.state.world, 'carthage').squads.find((current) => current.id === squad.id)).toMatchObject({ refused: null, goal: { x: 53, y: 93 } });
  let backedAway = false;
  for (let tick = 0; tick < 90; tick += 1) {
    match.step();
    const seen = observeSiege(match.state.world, 'carthage').squads.find((current) => current.id === squad.id)!;
    if ((seen.x > 55 || seen.y !== 90) && seen.facing === 'west') backedAway = true;
    const rect = formationFootprint(seen.capacity, seen.formation, seen.facing);
    for (let y = seen.y + rect.y; y < seen.y + rect.y + rect.height; y += 1)
      for (let x = seen.x + rect.x; x < seen.x + rect.x + rect.width; x += 1)
        expect(world.map.terrain[tileIndex(x, y)], `footprint intersects water at ${x},${y}`).not.toBe(TERRAIN.river);
  }
  expect(backedAway).toBe(true);
  expect(observeSiege(match.state.world, 'carthage').squads.find((current) => current.id === squad.id)).toMatchObject({ x: 53, y: 93, goal: null, refused: null });
});
