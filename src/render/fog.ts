/**
 * The fog, rendered: what one Faction knows, drawn over the theatre (ticket B4,
 * PLAN §4).
 *
 * B3 composed B1's map into one image; this composes B4's fog into a second one
 * of the same size, drawn over the first. Three states, three veils:
 *
 * - **unexplored** is opaque. Nothing of the map underneath reaches the screen,
 *   which is what "unexplored" means — a tile nobody has seen cannot be read,
 *   however the map happens to be drawn.
 * - **remembered** is a translucent veil: the terrain the Faction saw is still
 *   there, dimmed, because the memory of it is what the Faction is playing
 *   against.
 * - **visible** is transparent: the tile is drawn exactly as the terrain drew
 *   it.
 *
 * ## The fog follows the tiles, not the rendering offset
 *
 * `renderTerrain` renders on a grid offset half a tile from the logical one, so
 * that a *cell* can be a transition. Vision is not a transition: it is decided
 * per tile, so a tile's whole 16×16 square carries one state, and the half-tile
 * margin around the theatre takes the edge tile's state, clamped the way the
 * terrain clamps its materials. A fog painted on the rendering grid instead
 * would let one tile's state leak half a tile into its neighbour's, which is a
 * lie about what the Faction can see.
 *
 * ## What it is handed
 *
 * A `FogView`, and nothing else: not the map, not the world. The renderer
 * therefore *cannot* draw a tile a Faction has not seen — there is nothing in
 * its hands to draw it from. What the player sees and what the Faction's
 * Controller may know come from one object of the same shape, which is the
 * cheapest way for the two to agree forever.
 *
 * The buffer is a `PixelBuffer` like every other image in the repository, so it
 * can be composed in Node, compared pixel for pixel with what the browser drew,
 * and baked alongside the rest of the generated art (ADR-0002).
 */

import { TRANSPARENT, createPixelBuffer, fillRect, type PixelBuffer, type Rgba } from '../art/pixel-buffer.ts';
import { BASE, withAlpha } from '../art/palette.ts';
import { KNOWLEDGE, knows, type FogView, type Knowledge } from '../sim/fog.ts';
import { MAP_HEIGHT, MAP_WIDTH, TILE_COUNT } from '../sim/map.ts';
import { TERRAIN_TILE } from '../art/terrain.ts';
import { THEATRE_PIXELS, tilePixel } from './terrain.ts';

/**
 * The cover over ground a Faction has never seen.
 *
 * `BASE.ink` is the palette's darkest base, painted at full alpha: an
 * unexplored tile is not a dark tile, it is a tile with nothing on it at all,
 * and a veil that could be read through would be a leak rather than a look.
 */
export const UNEXPLORED: Rgba = BASE.ink;

/**
 * The veil over ground a Faction has seen but cannot see now.
 *
 * `BASE.ink` again, at an alpha that dims the terrain without hiding it: the
 * memory of the ground is what the player plans against (D4), so a remembered
 * tile has to stay readable — a forest still has to look like a forest — while
 * being plainly darker than a tile in view.
 */
export const REMEMBERED: Rgba = withAlpha(UNEXPLORED, 160);

/**
 * The fog over the whole theatre, aligned with `renderTerrain`, pixel for pixel.
 *
 * One pass per logical tile, then the four half-tile margins around them, so
 * every pixel of the image is covered by exactly one state.
 *
 * @throws RangeError when the view is not over a 96×96 theatre, which is the
 *   only theatre this project has.
 */
export function renderFog(fog: FogView): PixelBuffer {
  requireTheatre(fog);

  const image = createPixelBuffer(THEATRE_PIXELS, THEATRE_PIXELS);

  // One block per tile, and one ring of blocks outside the map for the half-tile
  // margin the rendering offset leaves: a block of the ring is clamped to the
  // edge tile, the way `renderTerrain` clamps its materials, so the fog covers
  // the whole image and stops exactly where the terrain stops.
  for (let y = -1; y <= MAP_HEIGHT; y += 1) {
    for (let x = -1; x <= MAP_WIDTH; x += 1) {
      const veil = VEIL[knows(fog, clampTile(x, MAP_WIDTH), clampTile(y, MAP_HEIGHT))];

      if (veil[3] === TRANSPARENT[3]) continue;

      const at = tilePixel(x, y);
      fillRect(image, at.x, at.y, TERRAIN_TILE, TERRAIN_TILE, veil);
    }
  }

  return image;
}

/**
 * What each of the three states is drawn with, read straight off `fog.ts`'s own
 * answer for a tile: the renderer names a veil, and how much a Faction knows is
 * decided in one place rather than spelled out a second time here.
 */
const VEIL: Readonly<Record<Knowledge, Rgba>> = {
  [KNOWLEDGE.unexplored]: UNEXPLORED,
  [KNOWLEDGE.remembered]: REMEMBERED,
  [KNOWLEDGE.visible]: TRANSPARENT,
};

/** A tile coordinate of the ring around the map, brought back onto the map: the edge tile's state. */
function clampTile(value: number, tiles: number): number {
  return Math.min(Math.max(value, 0), tiles - 1);
}

/** @throws RangeError when a view is not over this project's theatre. */
function requireTheatre(fog: FogView): void {
  if (fog.terrain.length !== TILE_COUNT || fog.visible.length !== TILE_COUNT) {
    throw new RangeError(
      `the fog is over ${String(fog.terrain.length)} tiles, and this theatre has ${String(TILE_COUNT)}`,
    );
  }
}
