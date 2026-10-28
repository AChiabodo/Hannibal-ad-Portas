import { expect, it } from 'vitest';
import { createCampGuards } from '../../src/sim/barbarian-guards';
import { repairFortification, repairWork } from '../../src/sim/command';
import { buildingCode } from '../../src/content/buildings';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRulesForDifficulty } from '../../src/sim/siege';
import { testMap } from './economy-fixtures';

it('reports an active barbarian assault, damages walls and refuses new repairs until the raiders retreat', () => {
  const rules = siegeMatchRulesForDifficulty('imperator');
  const initial = rules.createWorld(4);
  const map = { ...testMap({ strongholds: [{ x: 40, y: 40 }, { x: 110, y: 110 }], settlements: [] }),
    barbarianCamps: [{ x: 55, y: 40, variant: 0 }] };
  const economy = createEconomy(map);
  economy.settlements[0]!.stocks.fill(100);
  economy.settlements[0]!.population = 0;
  economy.settlements[0]!.works.push(
    { building: buildingCode('granary')!, ordinal: 0, remaining: 0, hp: 40 },
    { building: buildingCode('granary')!, ordinal: 1, remaining: 0, hp: 40 },
  );
  const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
    barbarianCamps: [{ hp: 60 }], campOrders: [] };
  createCampGuards(world);
  const match = createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
  match.step([repairWork('rome', 0, 'granary', 0)]);
  expect(observeSiege(world, 'rome').settlements[0]?.works[0]).toMatchObject({ repairing: true, hp: 40 });
  let damaged = false;
  for (let tick = 0; tick < 950; tick += 1) {
    match.step();
    const front = observeSiege(world, 'rome').fronts.find((value) => value.settlement === 0)!;
    const piece = front.structures.find((value) => value.hp < value.maxHp!);
    if (piece === undefined) continue;
    damaged = true;
    expect(front.siege).toBe('assault');
    match.step([repairFortification('rome', 0, piece.kind, piece.side), repairWork('rome', 0, 'granary', 1)]);
    const again = observeSiege(world, 'rome').fronts.find((value) => value.settlement === 0)!;
    expect(again.structures.find((value) => value.kind === piece.kind && value.side === piece.side)?.repairing).toBe(false);
    const works = observeSiege(world, 'rome').settlements[0]?.works;
    expect(works?.[0]).toMatchObject({ repairing: true, hp: 40 });
    expect(works?.[1]).toMatchObject({ repairing: false, hp: 40 });
    break;
  }
  expect(damaged).toBe(true);
  for (let tick = 0; tick < 500; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts.find((value) => value.settlement === 0)?.siege).toBeNull();
});

it('lets the garrison inflict casualties on barbarians attacking the walls', () => {
  const rules = siegeMatchRulesForDifficulty('imperator');
  const initial = rules.createWorld(4);
  const map = { ...testMap({ strongholds: [{ x: 40, y: 40 }, { x: 110, y: 110 }], settlements: [] }),
    barbarianCamps: [{ x: 55, y: 40, variant: 0 }] };
  const economy = createEconomy(map);
  const defender = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', x: 40, y: 40 });
  defender.garrison = 0;
  const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
    barbarianCamps: [{ hp: 60 }], campOrders: [] };
  createCampGuards(world);
  const match = createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
  let sawCasualties = false;
  for (let tick = 0; tick < 1000; tick += 1) {
    match.step();
    const enemy = observeSiege(world, 'rome').enemies.find((value) => value.neutral);
    if (enemy?.appearance !== undefined && enemy.appearance.men < 24) { sawCasualties = true; break; }
  }
  expect(sawCasualties).toBe(true);
});

it('keeps an assault active and fights the garrison when raiders enter through a breach', () => {
  const rules = siegeMatchRulesForDifficulty('imperator');
  const initial = rules.createWorld(4);
  const map = { ...testMap({ strongholds: [{ x: 40, y: 40 }, { x: 110, y: 110 }], settlements: [] }),
    barbarianCamps: [{ x: 55, y: 40, variant: 0 }] };
  const economy = createEconomy(map);
  const defender = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', x: 40, y: 40 });
  defender.garrison = 0;
  const world = { ...initial, map, economy, siege: createSiege(map, economy), fog: createFogs(),
    barbarianCamps: [{ hp: 60 }], campOrders: [] };
  createCampGuards(world);
  const guard = world.economy.squads.find((squad) => squad.owner === 2)!;
  guard.x = 41; guard.y = 40;
  guard.barbarianRaidTarget = 0; guard.barbarianRaidUntil = 1000;
  const front = world.siege.fronts[0]!;
  front.structures.find((piece) => piece.kind === 1)!.hp = 0;
  front.barbarianAssault = 1;
  const match = createMatch({ seed: 4, rules: { ...rules, createWorld: () => world } });
  for (let tick = 0; tick < 21; tick += 1) match.step();
  expect(observeSiege(world, 'rome').fronts.find((value) => value.settlement === 0)?.siege).toBe('assault');
  const visible = observeSiege(world, 'rome');
  expect(visible.enemies.find((enemy) => enemy.neutral)?.appearance?.men).toBeLessThan(24);
});
