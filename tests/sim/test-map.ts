/**
 * A theatre a test can draw: the same 96×96 grid the map module fixes, painted
 * by hand, so a question about movement can be asked about a picture a reader
 * can see rather than about whatever a seed happened to grow.
 *
 * A generated map is the right fixture for the questions that are about the
 * theatre — is everything on it reachable, is the way from one Stronghold to the
 * other walkable — and tests that ask those use `generateMap` directly. But a
 * worked example ("the road round the hill is cheaper than the hill") wants a
 * road and a hill in known places, and a refusal ("no way reaches that pocket")
 * wants a wall with no gate in it. Both are one call here.
 *
 * The map's own width and height are fixed at 96 tiles (`map.ts`), so a picture
 * is painted *onto* a plain theatre rather than being one: `plainMap` is the
 * empty canvas, `paint` puts a shape on it at a place, and `paintedMap` is the
 * two in one call.
 */
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TERRAIN,
  TILE_COUNT,
  tileIndex,
  type MapGrid,
  type Site,
  type Terrain,
} from '../../src/sim/map';

/** The terrain each glyph paints: the map's own, in a spelling a picture can carry. */
const TERRAIN_OF_GLYPH: Readonly<Record<string, Terrain>> = {
  '.': TERRAIN.plain,
  '^': TERRAIN.hill,
  f: TERRAIN.forest,
  ',': TERRAIN.farmland,
  '~': TERRAIN.river,
  '=': TERRAIN.ford,
  '-': TERRAIN.road,
};

/**
 * A theatre of nothing but plain land, with a Stronghold in each of two opposite
 * corners and nothing else standing on it.
 *
 * Everything but the terrain grid is empty on purpose: movement reads the
 * terrain and nothing else, so a test that says nothing about Strongholds,
 * settlements, rivers, resources or roads should not have to build them.
 */
export function plainMap(): MapGrid {
  const terrain = new Uint8Array(TILE_COUNT);
  terrain.fill(TERRAIN.plain);

  return {
    terrain,
    strongholds: [
      { x: 0, y: 0 },
      { x: MAP_WIDTH - 1, y: MAP_HEIGHT - 1 },
    ],
    settlements: [],
    rivers: [],
    resources: [],
    roads: [],
  };
}

/**
 * Paints rows of glyphs onto a map, the picture's top-left glyph landing on the
 * tile at `x, y`, and one glyph per tile rightwards and downwards from there.
 *
 * @throws Error when a glyph is not a terrain or a glyph would be painted off
 *   the map: a picture that quietly painted nothing, or painted somewhere else,
 *   would make the test that drew it a lie.
 */
export function paint(map: MapGrid, rows: readonly string[], x = 0, y = 0): MapGrid {
  rows.forEach((row, down) => {
    for (let across = 0; across < row.length; across += 1) {
      const terrain = TERRAIN_OF_GLYPH[row.charAt(across)];
      if (terrain === undefined) {
        throw new Error(`"${row.charAt(across)}" is not a terrain in a test map picture`);
      }

      const tileX = x + across;
      const tileY = y + down;
      if (tileX >= MAP_WIDTH || tileY >= MAP_HEIGHT) {
        throw new Error(`the picture runs off the map at (${String(tileX)}, ${String(tileY)})`);
      }

      map.terrain[tileIndex(tileX, tileY)] = terrain;
    }
  });

  return map;
}

/** A plain theatre with one picture painted on it, at `x, y`. */
export function paintedMap(rows: readonly string[], x = 0, y = 0): MapGrid {
  return paint(plainMap(), rows, x, y);
}

/** One row of a picture repeated: a wall or a road that runs the length of the map. */
export function repeated(count: number, row: string): string[] {
  return Array.from({ length: count }, () => row);
}

/** A tile written the way a caller reads it. */
export function at(x: number, y: number): Site {
  return { x, y };
}
