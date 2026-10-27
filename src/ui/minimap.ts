/**
 * The minimap: the theatre at a glance, and no more of it than the Faction
 * knows (ticket B7).
 *
 * The minimap is the one piece of the interface that has to be *honest* rather
 * than merely legible. It is a picture of the map — one pixel per tile — and a
 * picture of a map the Player has not seen is a leak: an unexplored Stronghold
 * showing through the fog is the failure a Player notices first and forgives
 * last. So the module takes **B4's fog** as an argument and nothing else: a tile
 * the Faction has never seen is drawn in the night colour whatever the map holds
 * underneath it, and there is no code path that can paint it otherwise.
 *
 * It is the *same* `FogView` the theatre is veiled with (`render/fog.ts`), not a
 * second grid that agrees with it: what the corner of the screen shows and what
 * the map under the camera shows are two drawings of one object, so they cannot
 * drift apart into two opinions about what the Faction knows.
 *
 * ## Why one pixel per tile, and what that costs
 *
 * At 160×160 tiles the map is 160 pixels square, which fits the corner of the
 * viewport without shrinking the theatre. The cost is that a tile is one pixel
 * and a landmark has to be one too: a settlement is the colour of whoever holds
 * it, a resource node the lightest shade of what it holds, and both are *hues
 * on the terrain* rather than shapes on top of it. A minimap that drew icons
 * would need two pixels per tile, and two pixels per tile is a minimap a quarter
 * of the screen wide.
 *
 * The module is pure — `minimapPlate(map, fog, viewport)` is a function of its
 * arguments, with no engine and no clock — so it is composed in Node by a test
 * and in the browser by the page, and the two can be compared.
 */
import { BASE, RAMPS, shade, shadeAt } from '../art/palette.ts';
import { createPixelBuffer, setPixel, strokeRect, type PixelBuffer, type Rgba } from '../art/pixel-buffer.ts';
import { UNOWNED } from '../sim/economy.ts';
import { factionCode } from '../sim/faction.ts';
import { KNOWLEDGE, believedTerrain, knows, type FogView, type Knowledge } from '../sim/fog.ts';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  TERRAIN,
  TILE_COUNT,
  TILE_SIZE,
  terrainAt,
  type MapGrid,
  type ResourceKind,
  type Site,
  type Terrain,
} from '../sim/map.ts';

/** Blank margin between the map and the plate's edge, in pixels: the frame's thickness. */
export const MINIMAP_PADDING = 2;

/** The map's width on the minimap, in pixels: one per tile. */
export const MINIMAP_WIDTH = MAP_WIDTH;

/** The map's height on the minimap, in pixels: one per tile. */
export const MINIMAP_HEIGHT = MAP_HEIGHT;

/** The whole plate's width, frame included. */
export const MINIMAP_PLATE_WIDTH = MINIMAP_WIDTH + 2 * MINIMAP_PADDING;

/** The whole plate's height, frame included. */
export const MINIMAP_PLATE_HEIGHT = MINIMAP_HEIGHT + 2 * MINIMAP_PADDING;

/** How much of a remembered tile's colour survives: enough to read the ground, not to mistake it for seen. */
export const MINIMAP_DIM = -45;

/** The frame around the map. */
export const MINIMAP_FRAME: Rgba = shadeAt(RAMPS.stone, 2);

/** The outline of what the viewport is showing: the one bright thing on the plate. */
export const MINIMAP_CAMERA: Rgba = shadeAt(RAMPS.parchment, 6);

/**
 * What each terrain looks like at one pixel per tile.
 *
 * The ground colours are deliberately the *middle* of their ramps: a minimap is
 * read at a glance, and the extremes of a ramp are the shades a landmark wants.
 */
export const MINIMAP_COLOUR: Readonly<Record<Terrain, Rgba>> = {
  [TERRAIN.plain]: shadeAt(RAMPS.olive, 4),
  [TERRAIN.hill]: shadeAt(RAMPS.stone, 4),
  [TERRAIN.forest]: shadeAt(RAMPS.olive, 2),
  [TERRAIN.farmland]: shadeAt(RAMPS.bronze, 5),
  [TERRAIN.river]: shadeAt(RAMPS.water, 4),
  [TERRAIN.ford]: shadeAt(RAMPS.water, 6),
  [TERRAIN.road]: shadeAt(RAMPS.stone, 6),
};

/**
 * What each resource node looks like: the lightest shade of what it holds.
 *
 * Lightest on purpose, because a node shares its tile with the ground it stands
 * on and has no room for a shape of its own: a node reads as a brighter speck,
 * which is the most a single pixel can say.
 */
export const MINIMAP_MARKER: Readonly<Record<ResourceKind, Rgba>> = {
  [RESOURCE.grain]: shadeAt(RAMPS.bronze, 6),
  [RESOURCE.timber]: shadeAt(RAMPS.olive, 6),
  [RESOURCE.stone]: shadeAt(RAMPS.stone, 6),
  [RESOURCE.iron]: shadeAt(RAMPS.stone, 1),
};

/**
 * What the last known position of an enemy looks like.
 *
 * Blood, and not the shade Carthage's own settlements are drawn in: a contact is
 * something an enemy *had* standing somewhere, and a Player has to be able to
 * tell it from a place the enemy still holds.
 */
export const MINIMAP_CONTACT: Rgba = shadeAt(RAMPS.blood, 3);

/** A rectangle on the plate, in plate pixels. */
export interface PlateRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The ground a camera is showing, in map pixels. */
export interface ViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The colour of a settlement on the minimap: whoever holds it.
 *
 * Rome's is bronze and Carthage's blood, which are the two Faction bases the
 * rest of the game already uses, and a settlement nobody holds — `UNOWNED`, not
 * a third Faction — is parchment, the one colour on the plate that belongs to
 * nobody.
 */
export function settlementColour(owner: number): Rgba {
  if (owner === factionCode('rome')) return shadeAt(RAMPS.bronze, 6);
  if (owner === factionCode('carthage')) return shadeAt(RAMPS.blood, 6);
  if (owner === UNOWNED) return shadeAt(RAMPS.parchment, 6);

  throw new RangeError(`a settlement is held by a Faction or by nobody, not by ${String(owner)}`);
}

/** Where a tile of the map is on the plate. */
export function minimapPointOf(x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: MINIMAP_PADDING + x, y: MINIMAP_PADDING + y };
}

/** Where the ground a viewport shows is on the plate, clamped to the map. */
export function viewportRectOnMinimap(viewport: ViewportRect): PlateRect {
  const left = clamp(Math.floor(viewport.x / TILE_SIZE), 0, MAP_WIDTH);
  const top = clamp(Math.floor(viewport.y / TILE_SIZE), 0, MAP_HEIGHT);
  const right = clamp(Math.ceil((viewport.x + viewport.width) / TILE_SIZE), 0, MAP_WIDTH);
  const bottom = clamp(Math.ceil((viewport.y + viewport.height) / TILE_SIZE), 0, MAP_HEIGHT);

  return {
    x: MINIMAP_PADDING + left,
    y: MINIMAP_PADDING + top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * The plate: the map, through the fog, with the camera marked.
 *
 * `viewport` is what the camera is showing, in map pixels, or `null` for a plate
 * with no camera on it — a test that wants to read the map without a rectangle
 * over it, and a page that has not decided where it is looking yet.
 *
 * @throws RangeError when the fog is not over this theatre: a view of another
 *   size is a caller that has lost track of which map it is looking at, and
 *   answering it with a half-painted plate would hide that.
 */
export interface KnownMinimapSite extends Site {
  readonly owner: number;
}

export function minimapPlate(map: MapGrid, fog: FogView, viewport: ViewportRect | null,
  ownership: readonly KnownMinimapSite[] = []): PixelBuffer {
  requireTheatre(fog);

  const plate = createPixelBuffer(MINIMAP_PLATE_WIDTH, MINIMAP_PLATE_HEIGHT, BASE.night);
  strokeRect(
    plate,
    MINIMAP_PADDING - 1,
    MINIMAP_PADDING - 1,
    MINIMAP_WIDTH + 2,
    MINIMAP_HEIGHT + 2,
    MINIMAP_FRAME,
  );

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const knowledge = knows(fog, x, y);
      if (knowledge === KNOWLEDGE.unexplored) continue;

      // The terrain the Faction *believes*, not the terrain the map holds: they
      // are the same today, because nothing redraws a tile, and the day
      // something does, a remembered tile must show what was seen (B4).
      const ground = believedTerrain(fog, x, y) ?? terrainAt(map, x, y);
      const at = minimapPointOf(x, y);
      setPixel(plate, at.x, at.y, fogged(MINIMAP_COLOUR[ground], knowledge));
    }
  }

  // Landmarks after the ground, and only where the Faction knows the ground they
  // stand on: a settlement in the fog is the leak this module exists to prevent,
  // so the fog is consulted again rather than assumed.
  for (const site of [...map.strongholds, ...map.settlements]) {
    const knowledge = knows(fog, site.x, site.y);
    const current = ownership.find((known) => known.x === site.x && known.y === site.y);
    // Memory records a place, not its current holder. Never infer ownership
    // from the generator's original Stronghold slots.
    paintSite(plate, fog, site, knowledge === KNOWLEDGE.visible && current !== undefined
      ? settlementColour(current.owner) : shadeAt(RAMPS.stone, 5));
  }
  for (const node of map.resources) {
    paintSite(plate, fog, node, MINIMAP_MARKER[node.kind]);
  }

  // And the enemy last seen: a contact is remembered at the tile it stood on, so
  // it is drawn where the Faction believes it is rather than tracked live.
  for (const contact of fog.contacts) {
    if (contact.id < 0) continue;
    paintSite(plate, fog, contact, MINIMAP_CONTACT);
  }

  if (viewport !== null) {
    const rect = viewportRectOnMinimap(viewport);
    if (rect.width > 0 && rect.height > 0) {
      strokeRect(plate, rect.x, rect.y, rect.width + 1, rect.height + 1, MINIMAP_CAMERA);
    }
  }

  return plate;
}

/** The colour a tile shows at one state of knowledge. */
function fogged(colour: Rgba, knowledge: Knowledge): Rgba {
  return knowledge === KNOWLEDGE.remembered ? shade(colour, MINIMAP_DIM) : colour;
}

/** One tile's landmark, if the Faction knows the ground it stands on. */
function paintSite(plate: PixelBuffer, fog: FogView, site: Site, colour: Rgba): void {
  const knowledge = knows(fog, site.x, site.y);
  if (knowledge === KNOWLEDGE.unexplored) return;

  const at = minimapPointOf(site.x, site.y);
  setPixel(plate, at.x, at.y, fogged(colour, knowledge));
}

/** @throws RangeError when the view is not over this project's theatre. */
function requireTheatre(fog: FogView): void {
  if (fog.terrain.length !== TILE_COUNT || fog.visible.length !== TILE_COUNT) {
    throw new RangeError(
      `the fog is over ${String(fog.terrain.length)} tiles, and this theatre has ${String(TILE_COUNT)}`,
    );
  }
}

/** A whole number kept between two bounds. */
function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}
