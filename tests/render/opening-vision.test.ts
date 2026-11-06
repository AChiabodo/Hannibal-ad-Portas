import { expect, it } from 'vitest';
import { musterOpeningArmy, openingEyes, openingTiles } from '../../src/render/opening';
import { canOccupy } from '../../src/sim/settlement-space';
import { FACINGS, facingCode } from '../../src/sim/squad';
import { createFog, refreshVision, viewOf } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { createSiegeWorld, observeSiege, siegeMatchRules } from '../../src/sim/siege';
import { musterSquad } from '../../src/sim/movement';

it.each(['rome', 'carthage'] as const)('musters the whole %s drawing fixture on physically legal ground', (faction) => {
  const world = createSiegeWorld(7);
  if (faction === 'rome') musterOpeningArmy(world, faction);
  else for (const tile of openingTiles(world.map, faction)) musterSquad(world.economy, world.map,
    { faction, squadType: 'gaul', ...tile });
  const owner = faction === 'rome' ? 0 : 1;
  const army = world.economy.squads.filter((squad) => squad.owner === owner);
  expect(army).toHaveLength(5);
  expect(army.filter((squad) => !canOccupy(world.map, squad, squad.x, squad.y)).map((squad) => squad.id)).toEqual([]);
  for (const facing of FACINGS) expect(army.filter((squad) =>
    !canOccupy(world.map, squad, squad.x, squad.y, squad.formation, facingCode(facing))).map((squad) => squad.id), facing).toEqual([]);
});

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
