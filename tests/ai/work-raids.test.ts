import { expect, it } from 'vitest';
import { createArmyController } from '../../src/cli/ai-match';
import { buildingCode } from '../../src/content/buildings';
import { move } from '../../src/sim/command';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import { workGround } from '../../src/sim/settlement-space';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from '../sim/economy-fixtures';

it.each(['rome', 'carthage'] as const)('the %s Controller raids a visible enemy work through ordinary Match commands', (faction) => {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }], settlements: [{ x: 60, y: 60 }] });
  const economy = createEconomy(map);
  const target = economy.settlements[2]!;
  target.owner = faction === 'rome' ? 1 : 0;
  target.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0 });
  const rect = workGround(economy, target, 'farm', 0)!;
  const attacker = musterSquad(economy, map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul',
    men: 24, x: rect.x - 2, y: rect.y });
  musterSquad(economy, map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul',
    men: 24, x: target.x + 4, y: target.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const ai = createArmyController('imperator');
  const visible = observeSiege(world, faction);
  const appearance = visible.appearances!.find((site) => site.id === target.id)!;
  const workTarget = { kind: 'work' as const, settlement: target.id, building: 'farm', ordinal: 0 };
  const opposite = { ...visible, squads: visible.squads.filter((squad) => squad.id === attacker.id)
    .map((squad) => ({ ...squad, x: rect.x + rect.width + 5, y: rect.y })) };
  expect(createArmyController('imperator').decide({ faction, tick: 0, visible: opposite }))
    .toContainEqual({ kind: 'attackStructure', faction, squads: [attacker.id], target: workTarget });
  const defended = { ...opposite, squads: opposite.squads.map((squad) => ({ ...squad, x: rect.x - 6 })),
    enemies: [{ id: 99, type: faction === 'rome' ? 'gaul' : 'hastati',
    x: rect.x + rect.width + 7, y: rect.y, appearance: { men: 120 } }] };
  expect(createArmyController('imperator').decide({ faction, tick: 0, visible: defended })
    .some((command) => command.kind === 'attackStructure' && command.target.kind === 'work')).toBe(false);
  for (const changed of [
    { ...appearance, owner: null },
    { ...appearance, owner: faction },
    { ...appearance, tiles: appearance.tiles.map((tile) => ({ ...tile, visible: false })) },
    ...[0, 1, 4, 5].map((stage) => ({ ...appearance, tiles: appearance.tiles.map((tile) => ({ ...tile,
      ...(tile.work === undefined ? {} : { work: { ...tile.work, stage } }) })) })),
  ]) {
    const commands = createArmyController('imperator').decide({ faction, tick: 0,
      visible: { ...visible, appearances: [changed] } });
    expect(commands.some((command) => command.kind === 'attackStructure' && command.target.kind === 'work')).toBe(false);
  }
  const commands = ai.decide({ faction, tick: 0, visible });
  expect(commands).toContainEqual({ kind: 'attackStructure', faction, squads: [attacker.id],
    target: { kind: 'work', settlement: target.id, building: 'farm', ordinal: 0 } });
  match.step(commands);
  for (let tick = 0; tick < 20; tick += 1) match.step();
  const owner = faction === 'rome' ? 'carthage' : 'rome';
  expect(observeSiege(world, owner).settlements.find((site) => site.id === target.id)!.works[0]!.hp).toBeLessThan(60);
  match.step([move(faction, visible.squads.map((squad) => squad.id), 40, 80)]);
  for (let tick = 0; tick < 150; tick += 1) match.step();
  const remembered = observeSiege(world, faction);
  expect(remembered.appearances!.find((site) => site.id === target.id)!.tiles
    .filter((tile) => tile.work !== undefined).every((tile) => !tile.visible)).toBe(true);
  expect(ai.decide({ faction, tick: match.state.tick, visible: remembered })
    .some((command) => command.kind === 'attackStructure' && command.target.kind === 'work')).toBe(false);
  const hp = observeSiege(world, owner).settlements.find((site) => site.id === target.id)!.works[0]!.hp;
  for (let tick = 0; tick < 40; tick += 1) match.step();
  expect(observeSiege(world, owner).settlements.find((site) => site.id === target.id)!.works[0]!.hp).toBe(hp);
});
