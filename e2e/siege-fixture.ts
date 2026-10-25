/**
 * The scene the fortification spec plays (ticket U6).
 *
 * It is the **real** Match — `siegeMatchRules`, the generated map, the walls at
 * `createSiege`'s own hit points — with one Roman army standing at Carthage's walls
 * and nothing else on the field. The point of the scene is the *drawing* of a
 * fortification under the ram: an army at the walls, no defending field army to
 * decide a battle first, and a treasury deep enough to pay for the engine, so the
 * Assault runs to walls that are hurt rather than to a fight.
 *
 * Nothing here is a second model of the rules: the tiles are the map's, the walls
 * are the Siege's, and the only things arranged are where the men are standing and
 * what the Faction can afford. The opponent is idle, so a test that steps a tick
 * reads the walls and not the AI's opinion.
 */
import { bootRenderer } from '../src/render/boot.ts';
import { idleController } from '../src/sim/controller.ts';
import { factionCode, type Faction } from '../src/sim/faction.ts';
import { isWalkable, terrainAt, type MapGrid, type Site } from '../src/sim/map.ts';
import { musterSquad } from '../src/sim/movement.ts';
import { applySiegeCommand, GATE_HP, RAM_HP, STRUCTURE, siegeMatchRules, type SiegeWorld } from '../src/sim/siege.ts';
import { assault, blockade } from '../src/sim/command.ts';
import { routeCacheFor } from '../src/sim/movement.ts';
import { failBoot, publishHooks, requireMount } from '../src/page.ts';

const FACTION: Faction = 'rome';
const SEED = 7;
const params = new URLSearchParams(location.search);
let captureSquad: number | null = null;
const viewedFaction: Faction = params.get('view') === 'carthage' ? 'carthage' : 'rome';

bootRenderer(requireMount('app'), {
  seed: SEED,
  faction: viewedFaction,
  opponent: idleController(),
  rules: {
    ...siegeMatchRules,
    createWorld(seed: number): SiegeWorld {
      const world = siegeMatchRules.createWorld(seed);
      const stage = params.get('stage');
      if (stage === 'neutral') {
        const site = world.map.settlements[0];
        const tile = site && around(world.map, site, 1)[0];
        if (tile) captureSquad = musterSquad(world.economy, world.map, { faction: viewedFaction, squadType: viewedFaction === 'rome' ? 'hastati' : 'libyan-spear', x: tile.x, y: tile.y }).id;
      } else deploy(world);
      if (stage !== null && stage !== 'neutral') {
        const target = world.siege.strongholds[1]!;
        const ids = world.economy.squads.filter((squad) => squad.owner === 0).map(({ id }) => id);
        applySiegeCommand(world, stage === 'blockade' ? blockade('rome', ids, target) : assault('rome', ids, target), routeCacheFor(world.map));
        const front = world.siege.fronts[target]!;
        const gate = front.structures.find(({ kind }) => kind === STRUCTURE.gate)!;
        // Authored visual conditions on the real rules' structures, not a second
        // model. Default fixture behavior is unchanged for the functional suite.
        if (stage === 'ram') { front.ram = RAM_HP; front.ramTicks = 0; gate.hp = GATE_HP / 2; }
        if (stage === 'breach') { gate.hp = 0; front.ram = RAM_HP; front.ramTicks = 0; }
      }
      return world;
    },
  },
})
  .then((view) => {
    // Paused before the page publishes anything: the scene a test reads is the scene
    // the fixture arranged, and one frame of wall clock is not part of it.
    view.pause();
    if (captureSquad !== null) { view.select({ kind: 'squad', id: captureSquad }); view.centerSelection(); }
    publishHooks({ boot: { booted: true, render: view.probe }, game: view, view, atelier: null });
  })
  .catch((error: unknown) => failBoot(error, 'app'));

/** Three Roman Squads at Carthage's walls, and the money for a ram. */
function deploy(world: SiegeWorld): void {
  const enemy = world.map.strongholds[1];
  if (enemy === undefined) return;

  const tiles = around(world.map, enemy, 3);
  const types = ['hastati', 'principes', 'triarii'] as const;

  for (const [index, type] of types.entries()) {
    const tile = tiles[index];
    if (tile === undefined) continue;

    musterSquad(world.economy, world.map, { faction: FACTION, squadType: type, x: tile.x, y: tile.y });
  }

  // A treasury that can lay the engine down: the ram is what makes an Assault a
  // decision rather than a lesson in scarcity, and the scene is about the drawing.
  world.economy.treasuries[factionCode(FACTION)] = 120;
}

/** Walkable, unoccupied tiles one step from a Stronghold, clockwise from the north. */
function around(map: MapGrid, origin: Site, count: number): readonly Site[] {
  const tiles: Site[] = [];

  for (let distance = 1; distance <= 4 && tiles.length < count; distance += 1) {
    for (let down = -distance; down <= distance; down += 1) {
      for (let across = -distance; across <= distance; across += 1) {
        if (Math.max(Math.abs(across), Math.abs(down)) !== distance) continue;
        const tile = { x: origin.x + across, y: origin.y + down };
        if (tile.x < 0 || tile.y < 0) continue;
        if (!isWalkable(terrainAt(map, tile.x, tile.y))) continue;
        if (map.settlements.some((settlement) => settlement.x === tile.x && settlement.y === tile.y)) continue;
        if (tiles.some((used) => used.x === tile.x && used.y === tile.y)) continue;

        tiles.push(tile);
      }
    }
  }

  return tiles;
}
