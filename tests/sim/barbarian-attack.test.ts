import { expect, it } from 'vitest';
import { CAMP_REWARD } from '../../src/sim/barbarian-camp-combat';
import { attackStructure, move } from '../../src/sim/command';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { TERRAIN, tileIndex } from '../../src/sim/map';
import { startCalendar } from '../../src/sim/season';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';

it.each(['rome', 'carthage'] as const)(
  'awards the contested camp once to %s after both factions damage it in the same tick', (finalFaction) => {
    const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
      barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
    const economy = createEconomy(map);
    const roman = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 58, y: 60 });
    const carthaginian = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24, x: 64, y: 60 });
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 8 }], campOrders: [] };
    refreshSiegeFog(world, 0);
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    const beforeRome = observeSiege(world, 'rome').treasury;
    const beforeCarthage = observeSiege(world, 'carthage').treasury;
    const romanOrder = attackStructure('rome', [roman.id], { kind: 'camp', id: 0 });
    const carthaginianOrder = attackStructure('carthage', [carthaginian.id], { kind: 'camp', id: 0 });
    const commands = finalFaction === 'rome' ? [carthaginianOrder, romanOrder] : [romanOrder, carthaginianOrder];
    match.step(commands);
    expect(observeSiege(world, 'rome').barbarianCamps?.[0]?.condition).toBe('ruin');
    expect(observeSiege(world, 'rome').treasury).toBe(beforeRome + (finalFaction === 'rome' ? CAMP_REWARD : 0));
    expect(observeSiege(world, 'carthage').treasury).toBe(beforeCarthage + (finalFaction === 'carthage' ? CAMP_REWARD : 0));
    match.step(commands);
    for (let tick = 0; tick < 20; tick += 1) match.step();
    expect(observeSiege(world, 'rome').treasury).toBe(beforeRome + (finalFaction === 'rome' ? CAMP_REWARD : 0));
    expect(observeSiege(world, 'carthage').treasury).toBe(beforeCarthage + (finalFaction === 'carthage' ? CAMP_REWARD : 0));
  },
);

it('approaches a camp from outside sight using a spotter and stops at ranged distance', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
  const economy = createEconomy(map);
  const slinger = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24, x: 53, y: 60 });
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 60, y: 64 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 60 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [slinger.id], { kind: 'camp', id: 0 })]);
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === slinger.id)?.goal).toEqual({ x: 56, y: 60 });
  for (let tick = 0; tick < 100; tick += 1) match.step();
  expect(observeSiege(world, 'carthage').squads.find((squad) => squad.id === slinger.id))
    .toMatchObject({ x: 56, y: 60, goal: null });
  expect(observeSiege(world, 'carthage').barbarianCamps?.[0]?.condition).toBe('ruin');
});

it.each([false, true])('fires on a camp at ranged distance only with a clear line (blocked: %s)', (blocked) => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
  if (blocked) map.terrain[tileIndex(58, 60)] = TERRAIN.river;
  const economy = createEconomy(map);
  const slinger = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24, x: 56, y: 60 });
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 60, y: 64 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 4 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [slinger.id], { kind: 'camp', id: 0 })]);
  const visible = observeSiege(world, 'carthage');
  expect(visible.barbarianCamps?.[0]?.condition).toBe(blocked ? 'standing' : 'ruin');
  if (!blocked) expect(visible.squads.find((squad) => squad.id === slinger.id)?.goal).toBeNull();
  if (blocked) {
    for (let tick = 0; tick < 100; tick += 1) match.step();
    expect(observeSiege(world, 'carthage').barbarianCamps?.[0]?.condition).toBe('ruin');
  }
});

it('moves a ranged squad into range before it can damage a camp', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
  const economy = createEconomy(map);
  const slinger = musterSquad(economy, map, { faction: 'carthage', squadType: 'balearic-slinger', men: 24, x: 55, y: 60 });
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 60, y: 64 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 4 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('carthage', [slinger.id], { kind: 'camp', id: 0 })]);
  expect(observeSiege(world, 'carthage').barbarianCamps?.[0]?.condition).toBe('standing');
  for (let tick = 0; tick < 100; tick += 1) match.step();
  expect(observeSiege(world, 'carthage').barbarianCamps?.[0]?.condition).toBe('ruin');
});

it('destroys a visible camp and awards the final attacker once', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 42, y: 42, variant: 1 }] };
  const economy = createEconomy(map);
  const scout = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 42 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 12 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const treasury = observeSiege(world, 'rome').treasury;
  match.step([attackStructure('rome', [scout.id], { kind: 'camp', id: 0 })]);
  for (let i = 0; i < 100; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ id: 0, condition: 'ruin' }]);
  const after = observeSiege(world, 'rome').treasury;
  expect(after).toBeGreaterThan(treasury);
  match.step([attackStructure('rome', [scout.id], { kind: 'camp', id: 0 })]);
  for (let i = 0; i < 50; i += 1) match.step();
  expect(observeSiege(world, 'rome').treasury).toBe(after);
  match.step([move('rome', [scout.id], 30, 42)]);
  for (let i = 0; i < 100; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ id: 0, condition: 'ruin', memory: 'remembered' }]);
});

it('retains standing memory when another faction destroys the camp unseen', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 42, y: 42, variant: 1 }] };
  const economy = createEconomy(map);
  const roman = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 42, y: 46 });
  const carthaginian = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 40, y: 42 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 12 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([move('rome', [roman.id], 30, 46)]);
  for (let i = 0; i < 120; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ condition: 'standing', memory: 'remembered' }]);
  const before = observeSiege(world, 'carthage').treasury;
  match.step([attackStructure('carthage', [carthaginian.id], { kind: 'camp', id: 0 })]);
  for (let i = 0; i < 50; i += 1) match.step();
  expect(observeSiege(world, 'carthage').barbarianCamps).toMatchObject([{ condition: 'ruin', memory: 'seen' }]);
  expect(observeSiege(world, 'carthage').treasury).toBeGreaterThan(before);
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ condition: 'standing', memory: 'remembered' }]);
  match.step([move('rome', [roman.id], 44, 44)]);
  for (let i = 0; i < 120; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ condition: 'ruin', memory: 'seen' }]);
});


it('refuses an attack on a hidden camp and does not reveal it', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
  const economy = createEconomy(map);
  const scout = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 30, y: 30 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 12 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const first = observeSiege(world, 'rome').squads[0]!;
  match.step([attackStructure('rome', [scout.id], { kind: 'camp', id: 0 })]);
  for (let i = 0; i < 30; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toEqual([]);
  expect(observeSiege(world, 'rome').squads[0]).toMatchObject({ x: first.x, y: first.y, goal: null, refused: 'target-not-visible' });
});

it('stops approaching a camp when the faction loses sight of it', () => {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 42, y: 42, variant: 0 }] };
  const economy = createEconomy(map);
  const eye = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 42, y: 42 });
  const attacker = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 42 });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 60 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step([attackStructure('rome', [attacker.id], { kind: 'camp', id: 0 })]);
  match.step([move('rome', [eye.id], 32, 42)]);
  for (let i = 0; i < 130; i += 1) match.step();
  expect(observeSiege(world, 'rome').barbarianCamps).toMatchObject([{ condition: 'standing', memory: 'remembered' }]);
  expect(observeSiege(world, 'rome').squads.find((squad) => squad.id === attacker.id)).toMatchObject({ goal: null, refused: 'target-not-visible' });
});
