/**
 * The legacy drawing/input fixture�s army and its opening vision (ticket C2).
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
import { formationFootprint } from '../content/formation.ts';
import { intersects, settlementLayout } from '../content/settlement-layout.ts';
import { FACINGS } from '../sim/squad.ts';

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
const MUSTER_REACH = { across: 20, down: 24 } as const;

/**
 * How many tiles apart two Squads of the opening army must stand.
 *
 * Reserve every facing of a full body: it must be able to turn for an ordinary
 * Move without hitting another formation, the estate or the map boundary.
 */
const poses = FACINGS.map((facing) => formationFootprint(120, 'line', facing));
const left = Math.min(...poses.map((pose) => pose.x)), top = Math.min(...poses.map((pose) => pose.y));
const MUSTER_FOOTPRINT = { x: left, y: top,
  width: Math.max(...poses.map((pose) => pose.x + pose.width)) - left,
  height: Math.max(...poses.map((pose) => pose.y + pose.height)) - top };
const MUSTER_GAP = Math.max(MUSTER_FOOTPRINT.width, MUSTER_FOOTPRINT.height);

/**
 * Free field outside reserved estates, with dry ground for every facing of a
 * full body. Lower rows are tried left to right, followed by upper rows when
 * the map boundary or water leaves too little room below the Stronghold.
 */
export function openingTiles(map: MapGrid, faction: Faction): readonly Site[] {
  const origin = strongholdOf(map, faction);
  if (origin === undefined) return [];

  const tiles: Site[] = [];
  const footprint = MUSTER_FOOTPRINT;
  const grounds = [...map.strongholds, ...map.settlements].map((site) => {
    const rect = settlementLayout('stronghold').grounds;
    return { ...rect, x: site.x + rect.x, y: site.y + rect.y };
  });
  // Prefer the lower field, then use the upper field when the map edge leaves
  // no room below. Every Figure must stand clear of the reserved estate.
  const rows = Array.from({ length: MUSTER_REACH.down }, (_unused, index) => index + 1);

  for (const down of [...rows, ...rows.map((row) => -row)]) {
    if (tiles.length >= OPENING_ARMY.length) break;
    for (let across = -MUSTER_REACH.across; across <= MUSTER_REACH.across && tiles.length < OPENING_ARMY.length; across += 1) {
      const x = origin.x + across;
      const y = origin.y + down;
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) continue;
      if (!isWalkable(terrainAt(map, x, y))) continue;
      const body = { ...footprint, x: x + footprint.x, y: y + footprint.y };
      if (grounds.some((ground) => intersects(body, ground))) continue;
      let clear = true;
      for (let row = body.y; row < body.y + body.height; row += 1) for (let col = body.x; col < body.x + body.width; col += 1)
        if (col < 0 || row < 0 || col >= MAP_WIDTH || row >= MAP_HEIGHT || !isWalkable(terrainAt(map, col, row))) clear = false;
      if (!clear) continue;
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
 * field ground near its Stronghold is a map no army can muster on, and a page that
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
