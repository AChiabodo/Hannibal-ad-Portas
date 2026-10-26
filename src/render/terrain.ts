/**
 * The theatre, rendered: B1's map as one image (ticket B3, PLAN §4).
 *
 * B1 generates the map; `art/terrain.ts` generates the tiles; this module is the
 * place the two meet and the map becomes pixels. It is the *composition* half of
 * B3, and it is deliberately not a tile-per-sprite renderer: the whole theatre is
 * composed once, into one `PixelBuffer`, and the game puts that single texture
 * under the camera. Panning and zooming a 160×160 map is then one container
 * moving, which is why the ticket's "stays responsive" is a property of the
 * design rather than a hope about the engine.
 *
 * ## The dual grid, in one paragraph
 *
 * The logical grid is 160×160 tiles. The rendering grid is offset half a tile in
 * both directions and has one cell more in each: cell `(i, j)` covers the corner
 * where logical tiles `(i−1, j−1)`, `(i, j−1)`, `(i, j)` and `(i−1, j)` meet, and
 * its four quadrants are exactly those four tiles' nearest quarters. Every
 * logical tile is therefore split across the four cells around its own corners,
 * and the image is the logical map translated by half a tile — no distortion and
 * no gap — while each *cell* can be a transition tile chosen by what is around
 * it. That is the whole trick: the tile that has to look deliberate is the cell,
 * not the logical tile, and the cell only needs five shapes.
 *
 * The half-tile margin the offset leaves around the theatre is filled by
 * clamping to the edge tile, so the map's first and last tiles are whole ones
 * rather than three-quarters of a tile cut off by the frame.
 *
 * ## Everything here is pure
 *
 * No engine, no clock, no state: `renderTerrain(map)` is a function of the map
 * and of nothing else, so it can be composed in Node in a test, baked to a PNG
 * by the CLI, and generated again in the browser — the same pixels three times,
 * which is what makes the browser test a comparison rather than a smoke test.
 *
 * `render/` is where this module lives rather than `art/` because it is the one
 * place that has to know both vocabularies: the simulation's terrains and the
 * art library's materials. `MATERIAL_OF_TERRAIN` is that mapping, and
 * `tests/render/terrain.test.ts` asserts it covers every terrain, so a terrain
 * added to the map without a tile to draw it is a failing test.
 */

import {
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  TERRAIN,
  terrainAt,
  type MapGrid,
  type ResourceKind,
  type Terrain,
} from '../sim/map.ts';
import {
  QUADRANT,
  TERRAIN_TILE,
  cellTile,
  roadTile,
  type CellQuadrants,
  type TerrainMaterial,
} from '../art/terrain.ts';
import { nodeMarker, type NodeKind } from '../art/nodes.ts';
import { blit, createPixelBuffer, type PixelBuffer } from '../art/pixel-buffer.ts';

/**
 * Which material each terrain of the simulation is drawn with.
 *
 * The two vocabularies are deliberately separate — `art/` is the pixel library
 * and knows nothing about the simulation — so the mapping lives here, at the one
 * boundary that has both, and a test asserts it is total and injective.
 */
export const MATERIAL_OF_TERRAIN: Readonly<Record<Terrain, TerrainMaterial>> = {
  [TERRAIN.plain]: 'plain',
  [TERRAIN.hill]: 'hill',
  [TERRAIN.forest]: 'forest',
  [TERRAIN.farmland]: 'farmland',
  [TERRAIN.river]: 'river',
  [TERRAIN.ford]: 'ford',
  [TERRAIN.road]: 'road',
};

/**
 * Which marker each kind of resource node is drawn with.
 *
 * The same boundary as the materials above, for the same reason: `art/` knows
 * four kinds of marker and nothing about the economy, and a test asserts every
 * resource the map can hold has one.
 */
export const MARKER_OF_RESOURCE: Readonly<Record<ResourceKind, NodeKind>> = {
  [RESOURCE.grain]: 'grain',
  [RESOURCE.timber]: 'timber',
  [RESOURCE.stone]: 'stone',
  [RESOURCE.iron]: 'iron',
};

/**
 * How far into the buffer the first logical tile starts, in pixels.
 *
 * Half a tile, because the rendering grid is offset by half a tile: the logical
 * tile `(x, y)` occupies `[x·16 + 8, x·16 + 24)` in both axes. It is also the
 * camera's natural home — `(8, 8)` is the theatre's first tile, exactly.
 */
export const THEATRE_MARGIN = QUADRANT;

/** The side of the rendered theatre, in pixels: one cell more than the map, half a tile wider at each edge. */
export const THEATRE_PIXELS = (MAP_WIDTH + 1) * TERRAIN_TILE;

/** Where a logical tile's top-left pixel is in the rendered theatre. */
export function tilePixel(x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: x * TERRAIN_TILE + THEATRE_MARGIN, y: y * TERRAIN_TILE + THEATRE_MARGIN };
}

/**
 * Which tile a theatre pixel belongs to: the inverse of `tilePixel`, rounded
 * down.
 *
 * The theatre is drawn half a tile out of step with the logical grid (the dual
 * grid's margin), so the pixel at `(0, 0)` is not tile `(0, 0)` but the cells
 * around it; this is the one conversion a click needs, and it is here beside the
 * function it inverts so the two cannot disagree about the margin.
 */
export function tileAt(pixelX: number, pixelY: number): { readonly x: number; readonly y: number } {
  return {
    x: Math.floor((pixelX - THEATRE_MARGIN) / TERRAIN_TILE),
    y: Math.floor((pixelY - THEATRE_MARGIN) / TERRAIN_TILE),
  };
}

/**
 * The four materials around a cell's centre, clockwise from the north-west.
 *
 * Cell `(i, j)` covers the corner where those four logical tiles meet, and a
 * cell on the theatre's own edge reaches one tile past it: the clamp is what
 * fills the half-tile margin with the edge tile rather than with a hole.
 */
export function quadrantsAt(map: MapGrid, cellX: number, cellY: number): CellQuadrants {
  return [
    materialAt(map, cellX - 1, cellY - 1),
    materialAt(map, cellX, cellY - 1),
    materialAt(map, cellX, cellY),
    materialAt(map, cellX - 1, cellY),
  ];
}

/**
 * The whole theatre as one buffer: the ground, the roads over it, the nodes over those.
 *
 * Three passes, because each answers a different question. The cells lay down the
 * ground and its transitions; the road pass draws each road tile's path, since a
 * road is not a material with a boundary but a path between its neighbours; and
 * the node pass stands a marker on each resource node, since a node is a thing on
 * the map rather than a kind of ground. A road's own shoulder is its material, so
 * the path has something to be a path across, and a marker is drawn last so that
 * a node on a road is still a node.
 */
export function renderTerrain(map: MapGrid): PixelBuffer {
  const theatre = createPixelBuffer(THEATRE_PIXELS, THEATRE_PIXELS);

  for (let j = 0; j <= MAP_HEIGHT; j += 1) {
    for (let i = 0; i <= MAP_WIDTH; i += 1) {
      blit(theatre, cellTile(quadrantsAt(map, i, j)), i * TERRAIN_TILE, j * TERRAIN_TILE);
    }
  }

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (terrainAt(map, x, y) !== TERRAIN.road) continue;

      const at = tilePixel(x, y);
      blit(theatre, roadTile(roadMask(map, x, y)), at.x, at.y);
    }
  }

  for (const node of map.resources) {
    const at = tilePixel(node.x, node.y);
    blit(theatre, nodeMarker(MARKER_OF_RESOURCE[node.kind]), at.x, at.y);
  }

  return theatre;
}

/**
 * Which of a road tile's four neighbours are roads, as a clockwise four-bit mask.
 *
 * A ford is not a road even where a road made it: the crossing is water, and a
 * road that ran through a ford would be a road drawn over a river. The path ends
 * at each bank and the ford is what crosses, which is what the map says.
 */
export function roadMask(map: MapGrid, x: number, y: number): number {
  const connect = (nx: number, ny: number): number =>
    nx >= 0 && ny >= 0 && nx < MAP_WIDTH && ny < MAP_HEIGHT && terrainAt(map, nx, ny) === TERRAIN.road ? 1 : 0;

  return connect(x, y - 1) | (connect(x + 1, y) << 1) | (connect(x, y + 1) << 2) | (connect(x - 1, y) << 3);
}

/** The material of a logical tile, clamped to the map at its edges. */
function materialAt(map: MapGrid, x: number, y: number): TerrainMaterial {
  const clampedX = Math.min(Math.max(x, 0), MAP_WIDTH - 1);
  const clampedY = Math.min(Math.max(y, 0), MAP_HEIGHT - 1);

  return MATERIAL_OF_TERRAIN[terrainAt(map, clampedX, clampedY)];
}
