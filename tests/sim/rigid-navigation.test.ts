import { expect, it } from 'vitest';
import { formationFootprint } from '../../src/content/formation';
import { move, recruit, type Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { TERRAIN, tileIndex } from '../../src/sim/map';
import { intersects } from '../../src/content/settlement-layout';

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

it('clears two freshly recruited bodies when one exits and the other moves within the courtyard', () => {
  const world = siegeMatchRules.createWorld(7);
  const match = createMatch<SiegeWorld, Command>({ seed: 7, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([recruit('rome', 0, 'hastati', 24, 2)]);
  const [leaving, staying] = observeSiege(match.state.world, 'rome').squads;
  match.step([move('rome', [staying!.id], 22, 110), move('rome', [leaving!.id], 60, 90)]);
  for (let tick = 0; tick < 400; tick += 1) {
    match.step();
    const seen = observeSiege(match.state.world, 'rome').squads;
    const rects = seen.map((squad) => {
      const rect = formationFootprint(squad.capacity, squad.formation, squad.facing);
      return { ...rect, x: rect.x + squad.x, y: rect.y + squad.y };
    });
    expect(intersects(rects[0]!, rects[1]!), `recruited bodies overlap at tick ${tick}`).toBe(false);
  }
  const seen = observeSiege(match.state.world, 'rome').squads;
  expect(seen.find((squad) => squad.id === leaving!.id)).toMatchObject({ x: 60, y: 90, goal: null });
  expect(seen.find((squad) => squad.id === staying!.id)).toMatchObject({ x: 22, y: 110, goal: null });
});
