/**
 * The scene the contextual-panel spec plays (ticket #55).
 *
 * It is the **real** Match — `siegeMatchRules`, the generated map, the walls, the
 * economy — with both rosters mustered and a handful of Squads put where the
 * panel's offers are about: one beside its own walled Stronghold (a garrison),
 * one beside the enemy's (an assault or a blockade), one out of reach (a mixed
 * selection), and an enemy in sight (an attack). Nothing about it is a second
 * model of the rules: the tiles are the map's, the walls are the Siege's, and the
 * only thing arranged is where the men are standing.
 *
 * The opponent is idle, so a test that steps a tick reads the interface and not
 * the AI's opinion. The Faction under test comes from `?faction=`.
 */
import { squadTypesOf } from '../src/content/squads.ts';
import { bootRenderer } from '../src/render/boot.ts';
import { musterOpeningArmy } from '../src/render/opening.ts';
import { idleController } from '../src/sim/controller.ts';
import type { Faction } from '../src/sim/faction.ts';
import { isWalkable, terrainAt, type MapGrid, type Site } from '../src/sim/map.ts';
import { musterSquad } from '../src/sim/movement.ts';
import { siegeMatchRules, type SiegeWorld } from '../src/sim/siege.ts';
import type { Squad } from '../src/sim/economy.ts';
import { failBoot, publishHooks, requireMount } from '../src/page.ts';

const requested = new URLSearchParams(location.search).get('faction');
const faction: Faction = requested === 'carthage' ? 'carthage' : 'rome';

bootRenderer(requireMount('app'), {
  seed: 7,
  faction,
  opponent: idleController(),
  rules: {
    ...siegeMatchRules,
    createWorld(seed: number): SiegeWorld {
      const world = siegeMatchRules.createWorld(seed);
      deploy(world, faction);
      return world;
    },
  },
})
  .then((view) => {
    // Paused before the page publishes anything, so the scene a test reads is the
    // scene the fixture arranged: a frame of wall clock before the first `pause()`
    // would be a contact round nobody asked for.
    view.pause();
    publishHooks({ boot: { booted: true, render: view.probe }, game: view, view, atelier: null });
  })
  .catch((error: unknown) => failBoot(error, 'app'));

/** Both armies afield, and the four tiles the scene is about. */
function deploy(world: SiegeWorld, played: Faction): void {
  musterOpeningArmy(world, 'rome');

  const [romeStronghold, carthageStronghold] = world.map.strongholds;
  if (romeStronghold === undefined || carthageStronghold === undefined) return;
  const own = played === 'rome' ? 0 : 1;
  const home = played === 'rome' ? romeStronghold : carthageStronghold;
  const away = played === 'rome' ? carthageStronghold : romeStronghold;

  // Carthage's own coalition, mustered at its Stronghold: the elephant included,
  // because it is a Squad like any other to the interface.
  for (const [index, type] of squadTypesOf('carthage').entries()) {
    const tile = freeTiles(world.map, carthageStronghold, index + 1)[index];
    if (tile === undefined) continue;
    musterSquad(world.economy, world.map, { faction: 'carthage', squadType: type.id, x: tile.x, y: tile.y });
  }

  const mine = world.economy.squads.filter((squad) => squad.owner === own);
  const theirs = world.economy.squads.filter((squad) => squad.owner !== own);
  const [beside, outOfReach, marcher] = mine;
  const [raider, besieger] = theirs;

  // Beside the walls: inside a garrison's reach, which is one tile.
  if (beside !== undefined) {
    place(beside, near(world.map, home.x + 1, home.y, 1));
    // One Season unpaid: an exception the group panel can name and open.
    beside.unpaid = 1;
  }
  // Four tiles further out: on the same screen, outside the walls' reach.
  if (outOfReach !== undefined) place(outOfReach, near(world.map, home.x + 4, home.y, 2));
  // Beside the enemy's Stronghold: the target of an assault or a blockade.
  if (marcher !== undefined) place(marcher, near(world.map, away.x + 2, away.y, 2));
  // In sight of our own army: the target of an attack.
  if (raider !== undefined) place(raider, near(world.map, home.x + 2, home.y + 1, 2));
  // Beside our walls but further off: the other Faction's Siege of our home.
  if (besieger !== undefined) place(besieger, near(world.map, home.x + 3, home.y + 2, 2));

  // The rest of our army out of the way, so a box drawn round the two Squads the
  // scene is about picks those two and nobody else.
  for (const [index, spare] of mine.slice(3).entries()) {
    place(spare, near(world.map, away.x + 6 + index, away.y + 1, 3));
  }

  // Stock enough to raise something, so construction and recruitment are offers
  // rather than a lesson in scarcity.
  const holding = world.economy.settlements.find((settlement) =>
    settlement.x === home.x && settlement.y === home.y);
  if (holding !== undefined) {
    for (let kind = 0; kind < 4; kind += 1) holding.stocks[kind] = 60;
  }
}

/** Puts a Squad on a tile, as a fixture arranging a scene rather than as a rule. */
function place(squad: Squad, tile: Site): void {
  squad.x = tile.x;
  squad.y = tile.y;
  squad.steps = [];
  squad.wait = 0;
}

/** Walkable, unoccupied tiles around a Stronghold, nearest first. */
function freeTiles(map: MapGrid, origin: Site, count: number): readonly Site[] {
  const tiles: Site[] = [];

  for (let distance = 1; distance <= 9 && tiles.length < count; distance += 1) {
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

/**
 * A walkable tile near a point, preferring the point itself and then widening.
 *
 * A Stronghold's neighbour is not guaranteed to be dry ground on every seed, and
 * a Squad standing in deep water would make the scene test the map rather than
 * the panel.
 */
function near(map: MapGrid, x: number, y: number, radius: number): Site {
  for (let distance = 0; distance <= radius; distance += 1) {
    for (let down = -distance; down <= distance; down += 1) {
      for (let across = -distance; across <= distance; across += 1) {
        if (Math.max(Math.abs(across), Math.abs(down)) !== distance) continue;
        const tile = { x: x + across, y: y + down };
        if (tile.x < 0 || tile.y < 0) continue;
        if (!isWalkable(terrainAt(map, tile.x, tile.y))) continue;
        if (map.settlements.some((settlement) => settlement.x === tile.x && settlement.y === tile.y)) continue;

        return tile;
      }
    }
  }

  return { x, y };
}
