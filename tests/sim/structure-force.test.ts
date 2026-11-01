import { expect, it } from 'vitest';
import { buildingCode } from '../../src/content/buildings';
import { attackStructure } from '../../src/sim/command';
import { EXCHANGE_TICKS } from '../../src/sim/combat';
import { createEconomy } from '../../src/sim/economy';
import type { Faction } from '../../src/sim/faction';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import { coreOf, squadGround, workGround } from '../../src/sim/settlement-space';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from './economy-fixtures';

/** Count real exchanges to the publicly observed ruin; camp HP stays private. */
function destroyAfter(kind: 'work' | 'camp', faction: Faction, sizes: readonly number[],
  survivors = sizes, squadType = faction === 'rome' ? 'hastati' : 'gaul'): number {
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }),
    barbarianCamps: [{ x: 60, y: 60, variant: 0 }] };
  const economy = createEconomy(map);
  const owner = faction === 'rome' ? 1 : 0;
  const site = economy.settlements[owner]!;
  site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = kind === 'camp' ? { x: 60, y: 60 } : workGround(economy, site, 'farm', 0)!;
  const squads = sizes.map((men, index) => {
    const squad = musterSquad(economy, map, { faction, squadType, men, x: rect.x - 2, y: rect.y });
    squad.strength = survivors[index]!;
    return squad.id;
  });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 60 }] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const target = kind === 'camp' ? { kind: 'camp' as const, id: 0 }
    : { kind: 'work' as const, settlement: owner, building: 'farm', ordinal: 0 };
  const ruined = () => kind === 'camp'
    ? observeSiege(world, faction).barbarianCamps?.[0]?.condition === 'ruin'
    : observeSiege(world, owner === 0 ? 'rome' : 'carthage').settlements[0]!.works[0]!.hp === 0;
  match.step([attackStructure(faction, squads, target)]);
  for (let tick = 1; tick < 1000 && !ruined(); tick += 1) match.step();
  expect(ruined(), `${kind}: the observed target eventually becomes a ruin`).toBe(true);
  return match.state.tick;
}

it.each(['work', 'camp'] as const)('does the same %s damage with one 120-man line or five 24-man Squads', (kind) => {
  // Four HP per full 24-man infantry body: 120 men take three exchanges for 60 HP.
  expect(destroyAfter(kind, 'rome', [120])).toBe(2 * EXCHANGE_TICKS + 1);
  expect(destroyAfter(kind, 'rome', [24, 24, 24, 24, 24])).toBe(2 * EXCHANGE_TICKS + 1);
});

it.each(['work', 'camp'] as const)('preserves Carthaginian force and surviving headcount against a %s', (kind) => {
  expect(destroyAfter(kind, 'carthage', [48])).toBe(7 * EXCHANGE_TICKS + 1);
  expect(destroyAfter(kind, 'carthage', [24, 24])).toBe(7 * EXCHANGE_TICKS + 1);
  expect(destroyAfter(kind, 'carthage', [24], [6])).toBe(59 * EXCHANGE_TICKS + 1);
});

it.each(['work', 'camp'] as const)('rounds tiny attacks once per %s rather than once per Squad', (kind) => {
  const oneBody = destroyAfter(kind, 'rome', [24], [5]);
  expect(oneBody).toBe(59 * EXCHANGE_TICKS + 1);
  expect(destroyAfter(kind, 'rome', [24, 24, 24, 24, 24], [1, 1, 1, 1, 1])).toBe(oneBody);
});

it.each(['work', 'camp'] as const)('counts specialist Force rather than drawn figures against a %s', (kind) => {
  expect(destroyAfter(kind, 'carthage', [12], [12], 'numidian-horse')).toBe(29 * EXCHANGE_TICKS + 1);
  expect(destroyAfter(kind, 'carthage', [24], [24], 'elephant')).toBe(7 * EXCHANGE_TICKS + 1);
});

it('keeps the minimum blow independent for each Work in the same exchange', () => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] });
  const economy = createEconomy(map);
  const site = economy.settlements[1]!;
  const buildings = ['farm', 'lumber-camp'] as const;
  for (const building of buildings) site.works.push({ building: buildingCode(building)!, remaining: 0, ordinal: 0 });
  const commands = buildings.map((building) => {
    const rect = workGround(economy, site, building, 0)!;
    const squad = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24,
      x: rect.x - 2, y: rect.y });
    squad.strength = 1;
    return attackStructure('rome', [squad.id], { kind: 'work', settlement: site.id, building, ordinal: 0 });
  });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  match.step(commands);
  expect(observeSiege(world, 'carthage').settlements[0]!.works.map((work) => work.hp)).toEqual([59, 59]);
});

it.each([['rome', 'work'], ['rome', 'wall'], ['carthage', 'work'], ['carthage', 'wall']] as const)(
  'preserves neutral raid Force against %s %s after reinforcement', (faction, kind) => {
  function damage(kind: 'work' | 'wall', survivors: readonly number[]): number {
    const map = { ...testMap({ strongholds: [{ x: 40, y: 40 }, { x: 110, y: 110 }] }),
      barbarianCamps: [{ x: 75, y: 60, variant: 0 }] };
    const economy = createEconomy(map);
    const site = economy.settlements[faction === 'rome' ? 0 : 1]!;
    site.population = 0;
    if (kind === 'work') site.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
    for (const men of survivors) {
      const guard = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', men: 24,
        x: site.x - 15, y: site.y + 4 });
      guard.owner = 2;
      guard.strength = men;
      guard.barbarianCamp = 0;
      guard.barbarianRaidTarget = site.id;
      guard.barbarianRaidUntil = 400;
      if (kind === 'work') {
        const rect = workGround(economy, site, 'farm', 0)!;
        guard.x = rect.x - 2; guard.y = rect.y;
      } else {
        const core = coreOf(economy, site), ground = squadGround(guard);
        guard.x += core.x - 1 - (ground.x + ground.width - 1);
      }
    }
    const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 60 }] };
    refreshSiegeFog(world, 0);
    const health = () => kind === 'work' ? observeSiege(world, faction).settlements[0]!.works[0]!.hp!
      : observeSiege(world, faction).fronts[0]!.structures.reduce((sum, piece) => sum + piece.hp, 0);
    const before = health();
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step();
    return before - health();
  }
  const intact = damage(kind, [24]);
  expect(intact).toBe(kind === 'work' ? 4 : 3);
  expect(damage(kind, [9, 15])).toBe(intact);
});
