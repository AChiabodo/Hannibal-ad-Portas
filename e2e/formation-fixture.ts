/** Arranged art scene using the real renderer, rules and permitted Observation. */
import { bootRenderer } from '../src/render/boot.ts';
import { failBoot, publishHooks, requireMount } from '../src/page.ts';
import { idleController } from '../src/sim/controller.ts';
import { siegeMatchRules } from '../src/sim/siege.ts';
import { isWalkable, terrainAt } from '../src/sim/map.ts';
import { musterSquad } from '../src/sim/movement.ts';
import { squadTypesOf } from '../src/content/squads.ts';
import { buildingCode } from '../src/content/index.ts';

const query = new URLSearchParams(location.search);
const faction = query.get('faction') === 'carthage' ? 'carthage' : 'rome';
bootRenderer(requireMount('app'), {
  seed: 67, faction, firstEntry: false, opponent: idleController(),
  rules: { ...siegeMatchRules, createWorld(seed) {
    const world = siegeMatchRules.createWorld(seed);
    const home = world.map.strongholds[faction === 'rome' ? 0 : 1]!;
    const types = squadTypesOf(faction);
    const sizes = faction === 'rome' ? [24, 60, 120] : [24, 48];
    for (let index = 0; index < 8; index++) {
      let x = home.x - 4 + index % 4 * 3;
      let y = home.y + 3 + Math.floor(index / 4) * 3;
      while (!isWalkable(terrainAt(world.map, x, y))) { x++; if (x > home.x + 8) { x = home.x - 4; y++; } }
      const type = types[index % types.length]!;
      const squad = musterSquad(world.economy, world.map, { faction, squadType: type.id, x, y,
        facing: (['north', 'east', 'south', 'west'] as const)[index % 4],
        formation: index < 4 ? 'line' : 'column' });
      const specialist = ['elephant', 'numidian-horse', 'balearic-slinger'].includes(type.id);
      const capacity = specialist ? squad.capacity : sizes[index % sizes.length]!;
      world.economy.squads[world.economy.squads.length - 1] = { ...squad, capacity,
        strength: index < 4 || type.id === 'elephant' ? capacity : Math.ceil(capacity * 0.55) };
    }
    if (faction === 'rome') world.economy.settlements[0]!.works.push({ building: buildingCode('castrum')!, remaining: 0 });
    return world;
  } },
}).then((view) => {
  view.pause();
  publishHooks({ boot: { booted: true, render: view.probe }, game: view, view, atelier: null });
}).catch((error: unknown) => failBoot(error, 'app'));
