import { expect, it } from 'vitest';
import { buildingCode } from '../../src/content/buildings';
import { attackStructure } from '../../src/sim/command';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { SEASON_TICKS, startCalendar } from '../../src/sim/season';
import { workGround } from '../../src/sim/settlement-space';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';

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
