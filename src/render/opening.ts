/**
 * The army the page opens with, and what it can therefore see (ticket C2).
 *
 * A Player needs something to command, and C2 is not the ticket that lets them
 * raise a Squad by hand. So the page **musters** an army at its Stronghold: real
 * Squads of real types, with the strength, the morale and the Payroll their type
 * gives them, stood up through `musterSquad` — the scenario door C1 opened for
 * exactly this ("a test that wants twelve Squads on a painted theatre").
 *
 * That leaves the economy exactly as a Match opens with, which is the honest
 * thing for a scenario to do: the treasury and the stocks in the HUD are the
 * economy's own, and nothing pretends the army was recruited. The day the
 * interface can raise Squads by hand, this module is what disappears.
 *
 * ## Why it is its own module
 *
 * Three of the page's claims depend on *where* the army stands: the fog the page
 * opens with (a Squad has eyes, `SQUAD_VISION`), the tiles a browser test must
 * see revealed, and the army itself. A test cannot reach into `render/game.ts`
 * — that module is the PixiJS-aware one — so the placement arithmetic lives
 * here, where a test can compose the same opening fog in Node and compare it
 * with the page's. One definition, two readers, which is the rule the whole
 * rendering layer follows.
 */
import { SQUAD_VISION, eyeOf, settlementEyes, type Eye } from '../sim/fog.ts';
import type { EconomyWorld } from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { MAP_HEIGHT, MAP_WIDTH, isWalkable, terrainAt, type MapGrid, type Site } from '../sim/map.ts';
import { musterSquad } from '../sim/movement.ts';

/**
 * The army the page musters at its Stronghold, in order.
 *
 * The Roman roster's three lines, in the proportion a consular army had them: two
 * of hastati, two of principes, one of triarii. Five Squads is enough to show a
 * formation, to box-select, to bind to a control group and to march in two
 * directions at once, and few enough that the whole army is on one screen at the
 * page's opening zoom.
 */
export const OPENING_ARMY: readonly string[] = ['hastati', 'hastati', 'principes', 'principes', 'triarii'];

/** How far from the Stronghold the opening army may look for a free tile. */
const MUSTER_REACH = { across: 9, down: 7 } as const;

/**
 * How many tiles apart two Squads of the opening army must stand.
 *
 * A block of a hundred and twenty men is fifty-four pixels wide — three and a
 * bit tiles — so two Squads on neighbouring tiles are drawn as one shapeless
 * mass, and neither can be clicked without picking the other. Four tiles apart
 * leaves each block its own ground, which is what makes the opening army five
 * things a Player can pick rather than one thing they cannot.
 */
const MUSTER_GAP = 4;

/**
 * Where the opening army stands: free, walkable ground below the Faction's
 * Stronghold, a block's width apart from each other.
 *
 * Deterministic, so the page and a test put the army in the same place on every
 * machine — and below the Stronghold rather than around it, because that is the
 * ground a Roman army would have camped on and the ground a Player's eye falls
 * on when the page opens.
 *
 * A tile is taken only if it is `MUSTER_GAP` tiles from every tile already
 * taken, so the five blocks stand on ground of their own. The row is walked left
 * to right and then downwards, which puts a consular army's line in front and
 * its reserve behind it.
 */
export function openingTiles(map: MapGrid, faction: Faction): readonly Site[] {
  const origin = strongholdOf(map, faction);
  if (origin === undefined) return [];

  const tiles: Site[] = [];

  for (let down = 1; down <= MUSTER_REACH.down && tiles.length < OPENING_ARMY.length; down += 1) {
    for (let across = -MUSTER_REACH.across; across <= MUSTER_REACH.across && tiles.length < OPENING_ARMY.length; across += 1) {
      const x = origin.x + across;
      const y = origin.y + down;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      if (!isWalkable(terrainAt(map, x, y))) continue;
      if (map.settlements.some((settlement) => settlement.x === x && settlement.y === y)) continue;
      if (tiles.some((tile) => Math.max(Math.abs(tile.x - x), Math.abs(tile.y - y)) < MUSTER_GAP)) continue;

      tiles.push({ x, y });
    }
  }

  return tiles;
}

/**
 * The eyes the page opens with: the Stronghold's watch, and the army's.
 *
 * The same list the page's own `vision` callback is handed on its first tick, so
 * the fog a browser test composes in Node and the fog the page draws are one
 * answer. It is `settlementEyes` plus one eye per mustered Squad,
 * which is exactly what `eyesOfEconomy` reports once the army is afield.
 */
export function openingEyes(map: MapGrid, faction: Faction): readonly Eye[] {
  const home = strongholdOf(map, faction);
  return [
    ...(home === undefined ? [] : settlementEyes(home)),
    ...openingTiles(map, faction).map((site) => eyeOf(site, SQUAD_VISION)),
  ];
}

/**
 * Stands the opening army up in a world, through the same door a scenario uses.
 *
 * A tile the map does not offer is simply not filled: a theatre with no free
 * ground below its Stronghold is a map no army can muster on, and a page that
 * threw instead would be a page a seed could break.
 */
export function musterOpeningArmy(world: EconomyWorld, faction: Faction): void {
  const tiles = openingTiles(world.map, faction);

  for (const [index, squadType] of OPENING_ARMY.entries()) {
    const tile = tiles[index];
    if (tile === undefined) continue;

    musterSquad(world.economy, world.map, { faction, squadType, x: tile.x, y: tile.y });
  }
}

/** The Faction's Stronghold, which is where its army musters and its eyes start. */
function strongholdOf(map: MapGrid, faction: Faction): Site | undefined {
  const [rome, carthage] = map.strongholds;

  return faction === 'rome' ? rome : carthage;
}
