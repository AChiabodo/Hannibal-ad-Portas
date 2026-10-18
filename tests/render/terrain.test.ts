/**
 * The theatre, rendered (ticket B3).
 *
 * The acceptance criteria are the tests. "A map produced by B1 renders
 * completely, with no seams and no missing variants" is three statements: the
 * composed image has the size the geometry says, no pixel of it is a hole, and a
 * map of one material composes into a tiling of that material's tile at the
 * half-tile offset — which is what "no seam" means once it is written down. Then
 * "rivers, fords, forests, hills, roads and farmland are distinguishable" is a
 * statement about where the materials land, checked at the pixel the map names.
 *
 * The map is generated here, in Node, by B1's own generator, with no engine and
 * no browser: the same module the page runs, which is what makes the browser
 * test beside this one a comparison rather than a smoke test.
 */
import { describe, expect, it } from 'vitest';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  RESOURCE_KINDS,
  TERRAIN,
  TILE_COUNT,
  TILE_SIZE,
  generateMap,
  tileIndex,
  type MapGrid,
  type ResourceNode,
  type Terrain,
} from '../../src/sim/map';
import {
  MARKER_OF_RESOURCE,
  MATERIAL_OF_TERRAIN,
  THEATRE_MARGIN,
  THEATRE_PIXELS,
  quadrantsAt,
  renderTerrain,
  roadMask,
  tilePixel,
} from '../../src/render/terrain';
import { MATERIALS, TERRAIN_TILE, materialTile, roadTile, type TerrainMaterial } from '../../src/art/terrain';
import { NODE_KINDS, nodeMarker, type NodeKind } from '../../src/art/nodes';
import { blitRegion, createPixelBuffer, hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';

/** A map of one terrain, with the trimmings a `MapGrid` must carry and nothing that is drawn. */
function flatMap(terrain: Terrain = TERRAIN.plain): MapGrid {
  const grid = new Uint8Array(TILE_COUNT);
  grid.fill(terrain);

  return {
    terrain: grid,
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

/** A map of one terrain with a single tile of another set into it. */
function mapWith(base: Terrain, at: { readonly x: number; readonly y: number }, tile: Terrain): MapGrid {
  const map = flatMap(base);
  map.terrain[tileIndex(at.x, at.y)] = tile;

  return map;
}

/** Whether two colours are the same, channel for channel. */
function sameColour(left: readonly number[], right: readonly number[]): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2] && left[3] === right[3];
}

/** The material tile's own pixel, which is where a logical tile's pixel comes from. */
function materialPixel(material: TerrainMaterial, x: number, y: number): readonly number[] {
  return pixelAt(materialTile(material), x, y);
}

/** The same map with one resource node taken away, which is how a drawn node is seen. */
function mapWithout(map: MapGrid, node: ResourceNode): MapGrid {
  return { ...map, resources: map.resources.filter((other) => other !== node) };
}

/** Every pixel of a buffer is opaque: a map with a hole in it is a map with a missing variant. */
function holesIn(buffer: PixelBuffer): number {
  let holes = 0;
  for (let index = 3; index < buffer.pixels.length; index += 4) {
    if ((buffer.pixels[index] ?? 0) !== 255) holes += 1;
  }

  return holes;
}

/**
 * A fingerprint of a generous crop, rather than of the whole theatre.
 *
 * The pixel hash walks every byte with a 64-bit mix, which is the right trade for
 * a 16×16 tile and a slow one for two and a half million pixels; a crop is a
 * fingerprint of the same generator, and the test that needs the *whole* map
 * compared is the tiling one, which compares pixels directly.
 */
function fingerprint(buffer: PixelBuffer): string {
  const size = 128;
  const crop = createPixelBuffer(size, size);
  blitRegion(crop, buffer, 700, 700, size, size, 0, 0);

  return hashPixelBuffer(crop);
}

describe('the material a terrain is drawn with', () => {
  it('covers every terrain the map knows, and never draws two terrains as one', () => {
    const drawn = new Set<TerrainMaterial>();

    for (const terrain of Object.values(TERRAIN)) {
      const material = MATERIAL_OF_TERRAIN[terrain];

      expect(material, `terrain ${String(terrain)}`).toBeDefined();
      expect(MATERIALS).toContain(material);
      expect(drawn.has(material), `terrain ${String(terrain)} shares a tile with another`).toBe(false);
      drawn.add(material);
    }
  });

  it('gives every resource the map can hold a marker of its own', () => {
    const drawn = new Set<NodeKind>();

    for (const kind of RESOURCE_KINDS) {
      const marker = MARKER_OF_RESOURCE[kind];

      expect(NODE_KINDS, `resource ${String(kind)}`).toContain(marker);
      expect(drawn.has(marker), `resource ${String(kind)} shares a marker with another`).toBe(false);
      drawn.add(marker);
    }
  });

  it('agrees with the simulation about how big a tile is', () => {
    expect(TERRAIN_TILE).toBe(TILE_SIZE);
  });
});

describe('the rendered theatre', () => {
  it('is one cell more than the map in each direction, so no edge tile is cut off', () => {
    const theatre = renderTerrain(flatMap());

    expect(theatre.width).toBe(THEATRE_PIXELS);
    expect(theatre.height).toBe(THEATRE_PIXELS);
    expect(THEATRE_PIXELS).toBe((MAP_WIDTH + 1) * TERRAIN_TILE);
  });

  it('composes a map of one material into a tiling of that material, half a tile along', () => {
    const theatre = renderTerrain(flatMap(TERRAIN.forest));
    const forest = materialTile('forest');
    let checked = 0;
    let wrong = 0;

    // A stride coprime with the tile, so the walk lands on every phase of the
    // texture rather than down one column of it.
    for (let y = 0; y < theatre.height; y += 31) {
      for (let x = 0; x < theatre.width; x += 31) {
        // The dual grid is the logical map moved half a tile: the pixel at
        // `(x, y)` is the material's own pixel at `(x − 8, y − 8)` inside its
        // tile. Anything else — a few pixels of the wrong phase, a quadrant
        // copied from the wrong corner — is a seam, and shows up here.
        const expected = pixelAt(
          forest,
          (x - THEATRE_MARGIN) & (TERRAIN_TILE - 1),
          (y - THEATRE_MARGIN) & (TERRAIN_TILE - 1),
        );
        checked += 1;
        if (!sameColour(pixelAt(theatre, x, y), expected)) wrong += 1;
      }
    }

    expect(checked).toBeGreaterThan(1000);
    expect(wrong).toBe(0);
  });

  it('keeps a material’s texture running across a cell’s edge, not restarting there', () => {
    // One plain tile in a forest: the four cells around it hold two materials, so
    // they take the painted path rather than the quadrant copy — and the forest
    // they paint has to be the forest of the tile, not of the cell.
    const map = mapWith(TERRAIN.forest, { x: 10, y: 10 }, TERRAIN.plain);
    const theatre = renderTerrain(map);

    for (const [tileX, tileY] of [
      [11, 10],
      [10, 11],
      [11, 11],
      [9, 9],
    ] as const) {
      for (let local = 4; local <= 11; local += 1) {
        for (let other = 4; other <= 11; other += 1) {
          const at = tilePixel(tileX, tileY);
          expect(
            pixelAt(theatre, at.x + local, at.y + other),
            `tile (${String(tileX)}, ${String(tileY)}) pixel (${String(local)}, ${String(other)})`,
          ).toEqual(materialPixel('forest', local, other));
        }
      }
    }
  });

  it('renders a generated map completely, with no hole anywhere', () => {
    for (const seed of [1, 7, 218, 4096]) {
      const theatre = renderTerrain(generateMap(seed));

      expect([theatre.width, theatre.height], `seed ${String(seed)}`).toEqual([THEATRE_PIXELS, THEATRE_PIXELS]);
      expect(holesIn(theatre), `seed ${String(seed)}`).toBe(0);
    }
  });

  it('puts every material a seed generates on the screen', () => {
    for (const seed of [1, 7, 218]) {
      const map = generateMap(seed);
      const present = new Set(Object.values(map.terrain).map((terrain) => MATERIAL_OF_TERRAIN[terrain as Terrain]));

      // Every terrain B1 generates, drawn: a material with no tile would be a
      // hole in the map and a hole in the catalogue.
      for (const material of present) {
        expect(MATERIALS, `seed ${String(seed)}`).toContain(material);
      }
      expect(present.size).toBeGreaterThanOrEqual(6);
    }
  });

  it('is the same pixels for the same seed and different ones for another', () => {
    expect(fingerprint(renderTerrain(generateMap(7)))).toBe(fingerprint(renderTerrain(generateMap(7))));
    expect(fingerprint(renderTerrain(generateMap(7)))).not.toBe(fingerprint(renderTerrain(generateMap(8))));
  });

  it('is a file of its own every time, so a caller cannot draw on the map it was given', () => {
    const map = generateMap(7);
    const once = renderTerrain(map);
    const twice = renderTerrain(map);

    // Compared as a boolean: `expect` on two two-and-a-half-million-pixel
    // buffers spends its time formatting a diff nobody asked for.
    expect(once === twice).toBe(false);
    expect(fingerprint(once)).toBe(fingerprint(twice));
  });
});

describe('where a tile lands', () => {
  it('puts a logical tile half a tile into the cell that covers its corner', () => {
    expect(tilePixel(0, 0)).toEqual({ x: THEATRE_MARGIN, y: THEATRE_MARGIN });
    expect(tilePixel(3, 5)).toEqual({ x: 3 * TERRAIN_TILE + THEATRE_MARGIN, y: 5 * TERRAIN_TILE + THEATRE_MARGIN });
  });

  it('shows a lone tile of one material where the map says it is, and nothing around it', () => {
    const map = mapWith(TERRAIN.plain, { x: 40, y: 40 }, TERRAIN.farmland);
    const theatre = renderTerrain(map);
    const at = tilePixel(40, 40);

    // Deep inside the tile: four pixels clear of every edge, so no band and no
    // rounded corner reaches it.
    for (let local = 4; local <= 11; local += 1) {
      for (let other = 4; other <= 11; other += 1) {
        expect(pixelAt(theatre, at.x + local, at.y + other), `(${String(local)}, ${String(other)})`).toEqual(
          materialPixel('farmland', local, other),
        );
      }
    }

    // And a tile two away is the material around it, so the lone tile is a tile
    // and not the whole region being painted.
    const away = tilePixel(42, 40);
    expect(pixelAt(theatre, away.x + 8, away.y + 8)).toEqual(materialPixel('plain', 8, 8));
  });
});

describe('the roads of a map', () => {
  it('connects a road tile to the road tiles beside it, and to nothing else', () => {
    const map = flatMap();
    const road = (x: number, y: number): void => {
      map.terrain[tileIndex(x, y)] = TERRAIN.road;
    };
    road(10, 10);
    road(11, 10);
    road(10, 11);
    // A ford beside the road is water, not a road: the path ends at the bank.
    map.terrain[tileIndex(9, 10)] = TERRAIN.ford;

    expect(roadMask(map, 10, 10)).toBe(0b0100 | 0b0010);
    expect(roadMask(map, 11, 10)).toBe(0b1000);
    expect(roadMask(map, 10, 11)).toBe(0b0001);
    expect(roadMask(map, 0, 0)).toBe(0);
  });

  it('draws the path of a road tile over the material its shoulder is made of', () => {
    const map = flatMap();
    map.terrain[tileIndex(10, 10)] = TERRAIN.road;
    map.terrain[tileIndex(10, 11)] = TERRAIN.road;
    const theatre = renderTerrain(map);
    const at = tilePixel(10, 10);

    // A road with one neighbour to the south: the path runs from the tile's
    // centre to its south edge, and the piece says so.
    const piece = roadTile(roadMask(map, 10, 10));
    expect(pixelAt(piece, 8, 15)[3]).toBe(255);
    expect(pixelAt(piece, 8, 0)[3]).toBe(0);
    expect(pixelAt(theatre, at.x + 8, at.y + 15)).toEqual(pixelAt(piece, 8, 15));

    // And where there is no path, what shows is the road material's own shoulder
    // — the tile B1 says is road, not the ground beside it.
    expect(pixelAt(theatre, at.x + 4, at.y + 4)).toEqual(materialPixel('road', 4, 4));
  });

  it('joins two road tiles with no gap in the path where they meet', () => {
    const map = flatMap();
    for (const y of [10, 11, 12]) map.terrain[tileIndex(10, y)] = TERRAIN.road;

    const above = roadTile(roadMask(map, 10, 10));
    const below = roadTile(roadMask(map, 10, 11));

    // The south edge of one tile and the north edge of the next are the same line
    // on screen, so the path has to be in the same columns on both sides of it: a
    // road that stepped sideways at a tile join would be a road with a break in
    // it.
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      expect(pixelAt(above, x, TERRAIN_TILE - 1)[3] === 0, `column ${String(x)}`).toBe(
        pixelAt(below, x, 0)[3] === 0,
      );
    }

    // And the drawn map shows both halves of that join where they belong.
    const theatre = renderTerrain(map);
    const at = tilePixel(10, 10);
    expect(pixelAt(theatre, at.x + 8, at.y + 15)).toEqual(pixelAt(above, 8, 15));
    expect(pixelAt(theatre, at.x + 8, at.y + TERRAIN_TILE)).toEqual(pixelAt(below, 8, 0));
  });
});

describe('the resource nodes of a map', () => {
  it('stands a marker on every node the seed places', () => {
    const map = generateMap(7);
    const theatre = renderTerrain(map);

    expect(map.resources.length).toBeGreaterThan(0);
    for (const node of map.resources) {
      const at = tilePixel(node.x, node.y);
      const marker = nodeMarker(MARKER_OF_RESOURCE[node.kind]);
      const plain = renderTerrain(mapWithout(map, node));

      // Some pixel of the marker is on screen at the node's own tile, and a map
      // with that node taken away is different there: the node is drawn, and it is
      // drawn where B1 said it was.
      let inked = 0;
      let differed = 0;
      for (let y = 0; y < marker.height; y += 1) {
        for (let x = 0; x < marker.width; x += 1) {
          if (pixelAt(marker, x, y)[3] === 0) continue;
          inked += 1;
          if (pixelAt(theatre, at.x + x, at.y + y)[0] !== pixelAt(plain, at.x + x, at.y + y)[0]) differed += 1;
        }
      }

      expect(inked, `node at (${String(node.x)}, ${String(node.y)})`).toBeGreaterThan(0);
      expect(differed, `node at (${String(node.x)}, ${String(node.y)})`).toBeGreaterThan(0);
    }
  });

  it('draws a marker over the terrain rather than instead of it', () => {
    const map: MapGrid = {
      ...flatMap(),
      resources: [{ x: 20, y: 20, kind: RESOURCE.iron, amount: 8 }],
    };
    const theatre = renderTerrain(map);
    const marker = nodeMarker('iron');
    const at = tilePixel(20, 20);

    for (const [x, y] of [
      [0, 0],
      [8, 8],
      [15, 15],
    ] as const) {
      if (pixelAt(marker, x, y)[3] === 0) {
        expect(pixelAt(theatre, at.x + x, at.y + y), 'the ground shows through').toEqual(materialPixel('plain', x, y));
      } else {
        expect(pixelAt(theatre, at.x + x, at.y + y), 'the marker is on the ground').toEqual(
          pixelAt(marker, x, y),
        );
      }
    }
  });
});

describe('the dual grid over a real map', () => {
  it('reads the four materials around a cell, clamped at the map’s edges', () => {
    const map = mapWith(TERRAIN.plain, { x: 0, y: 0 }, TERRAIN.hill);

    expect(quadrantsAt(map, 0, 0)).toEqual(['hill', 'hill', 'hill', 'hill']);
    expect(quadrantsAt(map, 1, 1)).toEqual(['hill', 'plain', 'plain', 'plain']);
    expect(quadrantsAt(map, 0, 0)).toEqual(quadrantsAt(map, 0, 0));
  });

  it('covers every corner of the map with a cell, including the margin', () => {
    const map = generateMap(7);
    const last = quadrantsAt(map, MAP_WIDTH, MAP_HEIGHT);

    expect(last.length).toBe(4);
    for (const material of last) expect(MATERIALS).toContain(material);
  });
});
