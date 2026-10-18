/**
 * The terrain tiles (ticket B3).
 *
 * Two claims are worth holding here, and they are the two the ticket's
 * acceptance criteria are written in. The first is that the autotiling is
 * *complete*: all sixteen corner masks are a shape turned into place, the five
 * transition shapes are the whole set, and every material has a tile. The second
 * is that a variant's foreground *claims the pixels it says it claims* — the
 * rounded corner of a promontory really is cut, a straight edge really is half
 * the tile — because a table that maps masks to shapes is worth nothing if the
 * shapes are not the pixels that come out.
 *
 * The tables are checked against worked examples rather than recomputed from the
 * code that builds them: the expected values below are written down from the
 * plan's *five tiles plus rotation*, so a generator that rotates the wrong way
 * fails here rather than on screen.
 */
import { describe, expect, it } from 'vitest';
import {
  CLASS_OF,
  CLASS_PRIORITY,
  MATERIALS,
  QUADRANT,
  ROAD_SHAPES,
  ROAD_VARIANTS,
  TERRAIN_MATERIALS,
  TERRAIN_SHAPES,
  TERRAIN_TILE,
  TERRAIN_VARIANTS,
  cellTile,
  materialTile,
  materialVariantTiles,
  referenceBackground,
  roadTile,
  roadVariantOf,
  terrainEntries,
  variantOf,
  variantQuadrants,
  variantRegion,
  type CellQuadrants,
  type TerrainMaterial,
} from '../../src/art/terrain';
import { TRANSPARENT, hashPixelBuffer, pixelAt } from '../../src/art/pixel-buffer';
import { RAMPS, shadeAt } from '../../src/art/palette';

/** One quarter turn clockwise of a quadrant or connection mask, written the way the tests read masks. */
function turn(mask: number, times = 1): number {
  let turned = mask;
  for (let turn = 0; turn < times; turn += 1) turned = ((turned << 1) | (turned >>> 3)) & 0b1111;

  return turned;
}

/** How many quarter turns take `from` to `to`, as `TERRAIN_VARIANTS` means it. */
function turnsBetween(from: number, to: number): number {
  let mask = from;
  for (let count = 0; count < 4; count += 1) {
    if (mask === to) return count;
    mask = turn(mask);
  }

  return -1;
}

/** The pixel nearest the cell's centre in each quadrant, clockwise from the north-west. */
const QUADRANT_TIPS: readonly (readonly [number, number])[] = [
  [7, 7],
  [8, 7],
  [8, 8],
  [7, 8],
];

/** A pixel well inside each quadrant, away from the rounded corner. */
const QUADRANT_CORNERS: readonly (readonly [number, number])[] = [
  [2, 2],
  [13, 2],
  [13, 13],
  [2, 13],
];

/** Whether a pixel is inside a region grid. */
function inside(region: Uint8Array, x: number, y: number): boolean {
  return region[y * TERRAIN_TILE + x] === 1;
}

/** The mean colour of a tile, which is how two materials are told apart at the lowest zoom. */
function meanColour(material: TerrainMaterial): readonly [number, number, number] {
  const tile = materialTile(material);
  const sum = [0, 0, 0];

  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      const colour = pixelAt(tile, x, y);
      sum[0] = (sum[0] ?? 0) + colour[0];
      sum[1] = (sum[1] ?? 0) + colour[1];
      sum[2] = (sum[2] ?? 0) + colour[2];
    }
  }

  return [sum[0] ?? 0, sum[1] ?? 0, sum[2] ?? 0];
}

describe('the terrain materials', () => {
  it('draws every material as a whole, opaque tile of the size the plan fixes', () => {
    for (const material of MATERIALS) {
      const tile = materialTile(material);

      expect([tile.width, tile.height], material).toEqual([TERRAIN_TILE, TERRAIN_TILE]);
      for (let index = 3; index < tile.pixels.length; index += 4) {
        expect(tile.pixels[index], `${material} is opaque`).toBe(255);
      }
    }
  });

  it('is the same tile every time it is asked, so the map and the bake agree', () => {
    expect(hashPixelBuffer(materialTile('forest'))).toBe(hashPixelBuffer(materialTile('forest')));
    expect(hashPixelBuffer(materialTile('forest'))).not.toBe(hashPixelBuffer(materialTile('plain')));
  });

  it('tells the materials apart by colour, which is what the lowest zoom has to read', () => {
    const means = new Map(MATERIALS.map((material) => [material, meanColour(material)]));
    let closest = Number.POSITIVE_INFINITY;

    for (const left of MATERIALS) {
      for (const right of MATERIALS) {
        if (left >= right) continue;

        const a = means.get(left);
        const b = means.get(right);
        if (a === undefined || b === undefined) continue;

        const distance = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
        closest = Math.min(closest, distance);
      }
    }

    // The closest pair today is plain and road at 65; the floor is stated well
    // below it so that a nudge in a texture is not a failing build, but a
    // material painted the colour of another is.
    expect(closest).toBeGreaterThan(48);
  });

  it('gives water a ramp of its own, because a river drawn out of stone reads as wet rock', () => {
    expect(RAMPS.water.length).toBeGreaterThan(3);
    expect(pixelAt(materialTile('river'), 0, 0)[2]).toBeGreaterThan(pixelAt(materialTile('river'), 0, 0)[0]);
  });
});

describe('the five shapes of the dual grid', () => {
  it('covers all sixteen masks, each a shape turned into place', () => {
    expect(TERRAIN_VARIANTS.length).toBe(16);

    for (let mask = 0; mask < 16; mask += 1) {
      const variant = variantOf(mask);

      expect(variant.mask, `mask ${String(mask)}`).toBe(mask);
      expect(TERRAIN_SHAPES).toContain(variant.shape);
      expect(variant.rotation).toBeGreaterThanOrEqual(0);
      expect(variant.rotation).toBeLessThan(4);
    }
  });

  it('turns a mask by one quarter turn and finds the same shape, one rotation further on', () => {
    // The canonical mask of a shape is the smallest mask that has it, which is
    // the convention `TERRAIN_VARIANTS` is built on; the test reads it back off
    // the table rather than trusting a constant it cannot see.
    const canonical = new Map<string, number>();
    for (let mask = 0; mask < 16; mask += 1) {
      const { shape } = variantOf(mask);
      const known = canonical.get(shape);
      if (known === undefined || mask < known) canonical.set(shape, mask);
    }

    for (let mask = 0; mask < 16; mask += 1) {
      const variant = variantOf(mask);
      const from = canonical.get(variant.shape);
      expect(from, `no canonical mask for ${variant.shape}`).toBeDefined();

      // The stored rotation is the one that *places* the shape: turning the
      // canonical mask by it has to land on this mask, whichever of the turns
      // that would also work was stored.
      expect(turn(from ?? 0, variant.rotation), `mask ${String(mask)}`).toBe(mask);
    }
  });

  it('needs five transition shapes and the background alone, and no more', () => {
    const counts = new Map<string, number>();
    for (const variant of TERRAIN_VARIANTS) counts.set(variant.shape, (counts.get(variant.shape) ?? 0) + 1);

    expect([...counts.keys()].sort()).toEqual([...TERRAIN_SHAPES].sort());
    expect(counts.get('empty')).toBe(1);
    expect(counts.get('solid')).toBe(1);
    expect(counts.get('edge')).toBe(4);
    expect(counts.get('outer')).toBe(4);
    expect(counts.get('inner')).toBe(4);
    expect(counts.get('saddle')).toBe(2);
  });

  it('draws a canonical piece once and turns it, rather than one tile per mask', () => {
    // Four rotations of one mask, four different pixels, one shape: the claim
    // the technique makes, as four hashes that differ and one shape that does not.
    const tiles = [0, 1, 2, 3].map((turns) => {
      const mask = turn(0b0001, turns);
      return { mask, tile: cellTile(variantQuadrants('forest', 'plain', mask)) };
    });

    expect(new Set(tiles.map(({ tile }) => hashPixelBuffer(tile))).size).toBe(4);
    for (const { mask } of tiles) expect(variantOf(mask).shape).toBe('outer');
  });
});

describe('the foreground region of a variant', () => {
  it('claims one quadrant for a promontory and three for a bay', () => {
    const promontory = variantRegion('forest', 'plain', 0b0001);
    const bay = variantRegion('forest', 'plain', 0b1110);

    expect([...promontory].filter((bit) => bit === 1).length).toBeGreaterThan(64 - 8);
    expect([...promontory].filter((bit) => bit === 1).length).toBeLessThan(64);
    expect([...bay].filter((bit) => bit === 1).length).toBeGreaterThan(192);
    expect([...bay].filter((bit) => bit === 1).length).toBeLessThan(192 + 8);
  });

  it('claims exactly half a cell for a straight edge, and both halves for a solid one', () => {
    const edge = variantRegion('forest', 'plain', 0b0011);
    const solid = variantRegion('forest', 'plain', 0b1111);

    expect([...edge].filter((bit) => bit === 1).length).toBe(128);
    expect([...solid].filter((bit) => bit === 1).length).toBe(TERRAIN_TILE * TERRAIN_TILE);
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      expect(inside(edge, x, 7), `x ${String(x)}`).toBe(true);
      expect(inside(edge, x, 8), `x ${String(x)}`).toBe(false);
    }
  });

  it('claims the quadrants the mask names, whichever way up the shape is', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      // The four corners of the four quadrants, read from the same clockwise bits
      // the mask is written in: a rotation that put the shape in the wrong place
      // would show up here.
      const region = variantRegion('forest', 'plain', mask);

      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const [x, y] = QUADRANT_CORNERS[quadrant] ?? [0, 0];
        const lit = ((mask >>> quadrant) & 1) === 1;
        expect(inside(region, x, y), `mask ${String(mask)} quadrant ${String(quadrant)}`).toBe(lit);
      }
    }
  });

  it('cuts the minority corner, so a promontory is rounded and a bay is filled in', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const { shape } = variantOf(mask);
      const region = variantRegion('forest', 'plain', mask);

      if (shape === 'outer') {
        // One quadrant is the material: its pixel at the cell's centre is cut away.
        const quadrant = [0, 1, 2, 3].find((bit) => ((mask >>> bit) & 1) === 1) ?? 0;
        const [tipX, tipY] = QUADRANT_TIPS[quadrant] ?? [0, 0];
        const [cornerX, cornerY] = QUADRANT_CORNERS[quadrant] ?? [0, 0];
        expect(inside(region, tipX, tipY), `mask ${String(mask)} tip`).toBe(false);
        expect(inside(region, cornerX, cornerY), `mask ${String(mask)} corner`).toBe(true);
      }

      if (shape === 'inner') {
        // One quadrant is plain: its corner at the cell's centre is filled in.
        const quadrant = [0, 1, 2, 3].find((bit) => ((mask >>> bit) & 1) === 0) ?? 0;
        const [tipX, tipY] = QUADRANT_TIPS[quadrant] ?? [0, 0];
        expect(inside(region, tipX, tipY), `mask ${String(mask)} tip`).toBe(true);
      }
    }
  });

  it('does not round a corner where three materials meet, because there is no one other side', () => {
    const outline = shadeAt(RAMPS.olive, 0);
    // The same north-west corner, twice: against one other material the corner is
    // cut and painted with the neighbour, against two it is a square corner and
    // therefore an outline pixel.
    const rounded = cellTile(['forest', 'plain', 'plain', 'plain']);
    const square = cellTile(['forest', 'hill', 'plain', 'plain']);

    expect(pixelAt(rounded, 7, 7)).not.toEqual(outline);
    expect(pixelAt(square, 7, 7)).toEqual(outline);
  });
});

describe('one cell of the dual grid', () => {
  it('fills each quadrant from the material that owns it, pixel for pixel', () => {
    const samples: readonly CellQuadrants[] = [
      ['plain', 'plain', 'forest', 'plain'],
      ['forest', 'plain', 'plain', 'plain'],
      ['plain', 'forest', 'hill', 'plain'],
      ['forest', 'hill', 'farmland', 'plain'],
      ['river', 'river', 'plain', 'ford'],
    ];

    for (const quadrants of samples) {
      const tile = cellTile(quadrants);

      for (let quadrant = 0; quadrant < 4; quadrant += 1) {
        const [x, y] = QUADRANT_CORNERS[quadrant] ?? [0, 0];
        const material = quadrants[quadrant] ?? 'plain';
        // The fill comes from the *logical tile's* own pixel, which is half a
        // tile along from the cell's — the offset that keeps a texture running
        // across a cell's edge instead of restarting there.
        const phase = (value: number): number => (value + QUADRANT) % TERRAIN_TILE;
        expect(pixelAt(tile, x, y), `${quadrants.join('/')} quadrant ${String(quadrant)}`).toEqual(
          pixelAt(materialTile(material), phase(x), phase(y)),
        );
      }
    }
  });

  it('paints the silhouette where the region changes, so a coastline has one edge', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const tile = cellTile(variantQuadrants('river', 'plain', mask));
      const region = variantRegion('river', 'plain', mask);
      const outline = shadeAt(RAMPS.water, 0);

      for (let y = 0; y < TERRAIN_TILE; y += 1) {
        for (let x = 0; x < TERRAIN_TILE; x += 1) {
          const here = inside(region, x, y);
          const neighbour = [
            [x - 1, y],
            [x + 1, y],
            [x, y - 1],
            [x, y + 1],
          ].some(([nx, ny]) => {
            if (nx === undefined || ny === undefined) return false;
            if (nx < 0 || ny < 0 || nx >= TERRAIN_TILE || ny >= TERRAIN_TILE) return false;

            return inside(region, nx, ny) !== here;
          });

          if (neighbour) {
            expect(pixelAt(tile, x, y), `mask ${String(mask)} at (${String(x)}, ${String(y)})`).toEqual(outline);
          }
        }
      }
    }
  });

  it('leaves no hole in a cell: every pixel is painted', () => {
    for (const quadrants of [
      ['plain', 'plain', 'forest', 'plain'],
      ['river', 'ford', 'plain', 'plain'],
      ['road', 'hill', 'forest', 'farmland'],
    ] as const) {
      const tile = cellTile(quadrants);
      for (let index = 3; index < tile.pixels.length; index += 4) {
        expect(tile.pixels[index], quadrants.join('/')).toBe(255);
      }
    }
  });

  it('keeps the order of the priority table, so the foreground is the material laid down last', () => {
    expect(CLASS_PRIORITY.water).toBeGreaterThan(CLASS_PRIORITY.road);
    expect(CLASS_PRIORITY.road).toBeGreaterThan(CLASS_PRIORITY.farmland);
    expect(CLASS_PRIORITY.farmland).toBeGreaterThan(CLASS_PRIORITY.forest);
    expect(CLASS_PRIORITY.forest).toBeGreaterThan(CLASS_PRIORITY.hill);
    expect(CLASS_PRIORITY.hill).toBeGreaterThan(CLASS_PRIORITY.plain);
    expect(CLASS_OF.river).toBe(CLASS_OF.ford);
  });
});

describe('the road tiles', () => {
  it('covers all sixteen connections, each a piece turned into place', () => {
    expect(ROAD_VARIANTS.length).toBe(16);
    expect(new Set(ROAD_VARIANTS.map((variant) => variant.shape)).size).toBe(ROAD_SHAPES.length);

    for (let mask = 0; mask < 16; mask += 1) {
      const variant = roadVariantOf(mask);
      expect(variant.mask).toBe(mask);
      expect(turnsBetween({ isolated: 0, end: 1, corner: 3, straight: 5, tee: 7, cross: 15 }[variant.shape], mask)).toBe(
        variant.rotation,
      );
    }
  });

  it('draws a path through the centre, out to each edge its mask connects', () => {
    for (let mask = 0; mask < 16; mask += 1) {
      const tile = roadTile(mask);

      // The centre is always path: every shape has one.
      expect(pixelAt(tile, 8, 8)[3], `mask ${String(mask)} centre`).toBeGreaterThan(0);

      // The four arms, read clockwise from the north: the pixel at the middle of
      // each edge is path exactly when that connection bit is set.
      const arms: readonly (readonly [number, number])[] = [
        [8, 0],
        [15, 8],
        [8, 15],
        [0, 8],
      ];
      for (let arm = 0; arm < 4; arm += 1) {
        const [x, y] = arms[arm] ?? [0, 0];
        const connected = ((mask >>> arm) & 1) === 1;
        expect(pixelAt(tile, x, y)[3] > 0, `mask ${String(mask)} arm ${String(arm)}`).toBe(connected);
      }
    }
  });

  it('leaves the corners of a cross untouched, so the shoulder is the material underneath', () => {
    const tile = roadTile(0b1111);

    expect(pixelAt(tile, 0, 0)).toEqual(TRANSPARENT);
    expect(pixelAt(tile, 15, 15)).toEqual(TRANSPARENT);
  });
});

describe('the terrain catalogue', () => {
  it('names every material, every variant of every row, and every road connection', () => {
    const names = terrainEntries().map((entry) => entry.name);

    expect(new Set(names).size).toBe(names.length);
    for (const material of MATERIALS) expect(names).toContain(`terrain:${material}`);
    for (const material of TERRAIN_MATERIALS) {
      for (let mask = 0; mask < 16; mask += 1) expect(names).toContain(`terrain:${material}:${String(mask)}`);
    }
    for (let mask = 0; mask < 16; mask += 1) expect(names).toContain(`road:${String(mask)}`);
  });

  it('shows each row as its own variant against the ground it crosses', () => {
    for (const material of TERRAIN_MATERIALS) {
      const tiles = materialVariantTiles(material);

      expect(tiles.length).toBe(16);
      expect(hashPixelBuffer(tiles[0] ?? tiles[1]!)).toBe(hashPixelBuffer(tiles[0] ?? tiles[1]!));
      // Mask 15 is the material with no boundary at all: the whole cell opaque.
      const solid = tiles[15];
      if (solid === undefined) throw new Error('no mask 15 tile');
      for (let index = 3; index < solid.pixels.length; index += 4) {
        expect(solid.pixels[index]).toBe(255);
      }
      expect(referenceBackground(material)).toBe('plain');
    }
  });
});
