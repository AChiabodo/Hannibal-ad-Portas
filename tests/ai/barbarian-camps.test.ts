import { expect, it } from 'vitest';
import { createArmyController } from '../../src/cli/ai-match';
import { CAMP_REWARD } from '../../src/sim/barbarian-camp-combat';
import { createEconomy } from '../../src/sim/economy';
import { createFogs } from '../../src/sim/fog';
import { createMatch } from '../../src/sim/match';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { refreshSiegeFog } from '../../src/sim/siege-fog';
import { testMap } from '../sim/economy-fixtures';

it.each(['rome', 'carthage'] as const)('the %s AI clears a visible vulnerable camp and receives its reward', (faction) => {
  const home = faction === 'rome' ? { x: 20, y: 20 } : { x: 110, y: 110 };
  const camp = { x: home.x + (faction === 'rome' ? 20 : -20), y: home.y, variant: 0 };
  const map = { ...testMap({ strongholds: [{ x: 20, y: 20 }, { x: 110, y: 110 }] }), barbarianCamps: [camp] };
  const economy = createEconomy(map);
  const squad = musterSquad(economy, map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul',
    men: faction === 'rome' ? 120 : 48, x: camp.x + (faction === 'rome' ? -3 : 3), y: camp.y });
  if (faction === 'carthage') musterSquad(economy, map,
    { faction, squadType: 'gaul', men: 48, x: camp.x + 6, y: camp.y });
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs(), barbarianCamps: [{ hp: 12 }], campOrders: [] };
  refreshSiegeFog(world, 0);
  const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  const ai = createArmyController('imperator');
  const before = observeSiege(world, faction).treasury;
  let ordered = false;
  for (let tick = 0; tick < 100; tick += 1) {
    const commands = ai.decide({ faction, tick: match.state.tick, visible: observeSiege(world, faction) });
    ordered ||= commands.some((command) => command.kind === 'attackStructure' && command.squads.includes(squad.id));
    match.step(commands);
  }
  expect(ordered).toBe(true);
  expect(observeSiege(world, faction).barbarianCamps).toMatchObject([{ condition: 'ruin' }]);
  expect(observeSiege(world, faction).treasury).toBe(before + CAMP_REWARD);
});
