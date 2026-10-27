/**
 * The terrain tiles: the ground, the water, the ways through them, and the five
 * shapes a transition is made of (ticket B3, PLAN §4).
 *
 * B1 generates the theatre. This module is the other half of "terrain on
 * screen": every pixel the map is made of, generated in code like everything
 * else (ADR-0002), with no engine in sight, so a tile can be baked, hashed and
 * compared in Node with no browser anywhere.
 *
 * ## The dual grid, and why not forty-seven variants
 *
 * A tile chosen by its eight neighbours needs forty-seven sprites, and a
 * generator that draws forty-seven hand-tuned shapes is forty-seven chances for
 * the set to be incomplete. The plan fixes the alternative: the map is rendered
 * on a **dual grid**, offset half a tile from the logical one, so each rendered
 * cell covers the corner where four logical tiles meet. A cell's appearance then
 * depends on a four-bit mask — which of the four tiles around that corner share
 * the cell's *foreground* material — and those sixteen masks are **five tiles
 * plus rotation**:
 *
 * - `solid`, the foreground material with no boundary at all (one rotation);
 * - `edge`, the boundary running straight through the cell (four rotations);
 * - `outer`, the foreground in one quadrant: a rounded promontory (four);
 * - `inner`, the foreground in three: a rounded bay (four);
 * - `saddle`, the foreground in two opposite quadrants (two);
 *
 * plus the empty mask, which is the background material's own tile. One tile
 * turned four ways is one tile to draw, one to bake and one to judge — that is
 * the whole argument for the technique, and `TERRAIN_VARIANTS` is the table that
 * turns the argument into arithmetic. `rotateQuarterTurns` is the code that
 * turns it, and `tests/art/terrain.test.ts` walks the table so a mask with no
 * variant is a failing test rather than a hole in the map.
 *
 * ## What a cell is made of, and what a transition looks like
 *
 * A cell is four quadrants, each holding one material's texture, so a cell where
 * three materials meet is filled correctly rather than approximated. On top of
 * that fill the foreground material's **style** draws the transition: a dark
 * outline where the two sides meet, a lit band just inside it (`inner`), and a
 * band just outside it on the neighbour (`outer`) — the shore a river leaves on
 * the land, the moss under a forest's edge, the shoulder of a road. The corner
 * of a promontory or a bay is *rounded* by the same style rather than by a
 * different sprite, which is why an 8-pixel quadrant can read as a coastline
 * instead of a staircase.
 *
 * ## Roads
 *
 * A road is not a material with a boundary but a path drawn between its
 * neighbours, so it is autotiled by its four-neighbour connection mask — the
 * other place the plan's *five tiles plus rotation* pays off. `ROAD_VARIANTS`
 * maps all sixteen connection masks onto six canonical pieces (isolated, end,
 * straight, corner, tee, cross), and `roadTile` draws the path and turns it.
 *
 * ## The terrain is quiet on purpose
 *
 * A tile is repeated nine thousand times, so whatever a material's texture does it
 * does at every zoom and next to every soldier. A dither that steps a whole shade of
 * a standard ramp — twenty percentage points of that ramp's spread — is a field of
 * hard-edged pixels alternating between two visibly different colours, and on screen
 * it competes with the men and the markers standing on it (ticket U5). So terrain is
 * painted from the **detail** ramps (`palette.ts`): the same bases over the same
 * travel at twice the granularity, ten points to a step, whose even indices are the
 * standard shades. A texture therefore dithers between halves of a standard step
 * instead of whole ones. `MATERIAL_TEXTURES` declares, per material, the shade most
 * of its pixels take, the one step its dither alternates to, and the single *mark*
 * that names the material — a furrow, a wave, a stepping stone, a blade of grass —
 * with the share of the tile that mark is allowed to cover.
 * `tests/art/terrain.test.ts` walks that table against the painted pixels, which is
 * what keeps the declaration and the art from drifting apart.
 *
 * ## Determinism
 *
 * Every texture here is a function of a pixel's coordinates and a per-material
 * salt through `noiseAt`, an integer hash — never `Math.random`, and never a
 * transcendental, so the same tile is the same tile on every engine (ADR-0006).
 * The tiles are memoised because the map asks for nine thousand of them; the
 * memo is a cache of a pure function and nothing else.
 */

import { RAMPS, detailAt, shadeAt, type DetailRampName } from './palette.ts';
import {
  type PixelBuffer,
  type Rgba,
  blitRegion,
  createPixelBuffer,
  rotateQuarterTurns,
  setPixel,
} from './pixel-buffer.ts';

/**
 * The side of a terrain tile in pixels: sixteen, as the plan fixes it (PLAN §4).
 *
 * It has to agree with `TILE_SIZE` in `sim/map.ts`, and it cannot import it:
 * `art/` is the pixel library and knows nothing about the simulation, so the
 * agreement is a test rather than a dependency (`tests/render/terrain.test.ts`).
 */
export const TERRAIN_TILE = 16;

/** Half a tile: one quadrant of a cell, and the offset of the dual grid. */
export const QUADRANT = TERRAIN_TILE / 2;

/**
 * The materials a tile can be drawn from (GLOSSARY: Terrain).
 *
 * The same seven terrains the map's grid holds, under art's own names, so the
 * pixel library has a closed vocabulary it can be tested against and the
 * mapping from the simulation's integers lives at the boundary that owns it
 * (`render/terrain.ts`). `river` and `ford` are two materials because they are
 * two textures; they are one *class* because they are one material to the
 * autotiler.
 */
export const MATERIALS = ['plain', 'hill', 'forest', 'farmland', 'river', 'ford', 'road', 'lake', 'marsh'] as const;

/** One of the materials a terrain tile can be drawn from. */
export type TerrainMaterial = (typeof MATERIALS)[number];

/**
 * The classes the autotiler knows: what a material *is* to a boundary.
 *
 * `river` and `ford` are both `water`, so a ford meeting a river is not a
 * boundary to be decorated — they are the same water, and drawing a bank down
 * the middle of a river would be a bug that reads as art.
 */
export const MATERIAL_CLASSES = ['plain', 'hill', 'forest', 'farmland', 'road', 'water', 'marsh'] as const;

/** One of the classes a material belongs to. */
export type MaterialClass = (typeof MATERIAL_CLASSES)[number];

/** Which class each material belongs to. */
export const CLASS_OF: Readonly<Record<TerrainMaterial, MaterialClass>> = {
  plain: 'plain',
  hill: 'hill',
  forest: 'forest',
  farmland: 'farmland',
  river: 'water',
  ford: 'water',
  road: 'road',
  lake: 'water',
  marsh: 'marsh',
};

/**
 * Which class wins where two meet, higher being drawn as the foreground.
 *
 * The order is the order things are laid down in: water cuts through land, a
 * road is laid on top of what it crosses, farmland is worked out of whatever was
 * there, and forest, hill and plain shade into one another in that order. The
 * foreground is not a matter of taste — it decides whose decorated boundary is
 * drawn — so it is written down once, here.
 */
export const CLASS_PRIORITY: Readonly<Record<MaterialClass, number>> = {
  plain: 0,
  hill: 1,
  forest: 2,
  farmland: 3,
  road: 4,
  water: 5,
  marsh: 3,
};

/**
 * A four-bit mask of what surrounds a cell, clockwise from the north-west.
 *
 * One type for both families of mask the art autotiles by — the four quadrants a
 * dual-grid cell covers, and the four neighbours a road tile connects to — because
 * they are the same four-bit shape read for the same reason: a mask, a canonical
 * shape and a rotation are what turn sixteen variants into five tiles. Which family
 * a mask belongs to is where it came from, and the two functions that read them are
 * named for it (`variantOf`, `roadVariantOf`).
 *
 * Bit 0 is the north-west quadrant and the bits run clockwise, so a quarter turn
 * clockwise is `((mask << 1) | (mask >>> 3)) & 0xf` and the canonical shape of a
 * mask is the smallest value its rotations take. That the bits run clockwise
 * rather than in reading order is the point: the rotation this module is built
 * on is then one expression instead of a permutation table.
 */
export type GridMask = number;

/** The canonical shapes of the dual grid: five transition tiles and the empty one. */
export const TERRAIN_SHAPES = ['empty', 'solid', 'edge', 'outer', 'inner', 'saddle'] as const;

/** One canonical shape of the dual grid. */
export type TerrainShape = (typeof TERRAIN_SHAPES)[number];

/** One of the sixteen variants, as the shape it is and the turns that place it. */
export interface Variant<Shape extends string> {
  /** The mask this variant paints. */
  readonly mask: GridMask;
  /** The canonical tile this variant is a rotation of. */
  readonly shape: Shape;
  /** How many quarter turns clockwise take the canonical mask to this one. */
  readonly rotation: number;
}

/** A dual-grid variant: a terrain shape turned into place. */
export type TerrainVariant = Variant<TerrainShape>;

/** A road variant: a road piece turned into place. */
export type RoadVariant = Variant<RoadShape>;

/** The canonical mask each shape is drawn in, in the clockwise quadrant bits: the smallest of its class. */
const CANONICAL_MASK: Readonly<Record<TerrainShape, GridMask>> = {
  empty: 0b0000,
  solid: 0b1111,
  edge: 0b0011, // north-west and north-east: the boundary is the horizontal through the centre
  outer: 0b0001, // north-west alone: a promontory pointing at the centre
  inner: 0b0111, // everything but south-west: a bay cut into it
  saddle: 0b0101, // north-west and south-east: two quadrants touching at the centre
};

/** One quarter turn clockwise of a quadrant mask. */
function turnMask(mask: GridMask): GridMask {
  return ((mask << 1) | (mask >>> 3)) & 0b1111;
}

/** How many quarter turns take `from` to `to`, or -1 when no rotation does. */
function turnsBetween(from: GridMask, to: GridMask): number {
  let mask = from;

  for (let turn = 0; turn < 4; turn += 1) {
    if (mask === to) return turn;
    mask = turnMask(mask);
  }

  return -1;
}

/** The sixteen variants, indexed by the mask they paint. */
export const TERRAIN_VARIANTS: readonly TerrainVariant[] = buildVariants(
  TERRAIN_SHAPES,
  CANONICAL_MASK,
  'terrain shape',
);

/** The variant that paints a mask. */
export function variantOf(mask: GridMask): TerrainVariant {
  return variantFrom(TERRAIN_VARIANTS, mask, 'quadrant');
}

/**
 * The four-neighbour connection masks a road is autotiled by.
 *
 * Bit 0 is north and the bits run clockwise, the same shape as the quadrant mask
 * and for the same reason: one turn is one expression.
 */
export const ROAD_SHAPES = ['isolated', 'end', 'straight', 'corner', 'tee', 'cross'] as const;

/** One canonical piece a road can be drawn from. */
export type RoadShape = (typeof ROAD_SHAPES)[number];

/**
 * The sixteen variants of one family of masks, built rather than written down.
 *
 * Both families of four-bit mask work the same way — every mask is the rotation
 * of exactly one canonical shape, and a table that says which is checkable in one
 * loop — so both are built by this, and a mask no shape reaches is refused here
 * rather than discovered as a hole in the map or a gap in a road.
 *
 * @throws Error when a canonical shape does not cover every mask.
 */
function buildVariants<Shape extends string>(
  shapes: readonly Shape[],
  canonical: Readonly<Record<Shape, GridMask>>,
  what: string,
): readonly Variant<Shape>[] {
  const variants: Variant<Shape>[] = [];

  for (let mask = 0; mask < 16; mask += 1) {
    const shape = shapes.find((candidate) => turnsBetween(canonical[candidate], mask) >= 0);
    if (shape === undefined) throw new Error(`no canonical ${what} paints the mask ${String(mask)}`);

    variants.push({ mask, shape, rotation: turnsBetween(canonical[shape], mask) });
  }

  return variants;
}

/** The variant that paints a mask, or a refusal naming what kind of mask it was. */
function variantFrom<Shape extends string>(
  variants: readonly Variant<Shape>[],
  mask: GridMask,
  what: string,
): Variant<Shape> {
  const variant = variants[mask];
  if (variant === undefined) throw new RangeError(`a ${what} mask is four bits, got ${String(mask)}`);

  return variant;
}

/** The canonical connection mask each road piece is drawn in. */
const CANONICAL_ROAD_MASK: Readonly<Record<RoadShape, GridMask>> = {
  isolated: 0b0000,
  end: 0b0001, // north
  straight: 0b0101, // north and south
  corner: 0b0011, // north and east
  tee: 0b0111, // north, east and south
  cross: 0b1111,
};

/** The sixteen road variants, indexed by the connection mask they draw. */
export const ROAD_VARIANTS: readonly RoadVariant[] = buildVariants(
  ROAD_SHAPES,
  CANONICAL_ROAD_MASK,
  'road piece',
);

/** The road piece that draws a connection mask. */
export function roadVariantOf(mask: GridMask): RoadVariant {
  return variantFrom(ROAD_VARIANTS, mask, 'connection');
}

/**
 * The decoration a class puts on its own boundary: outline, inside and outside.
 *
 * One record rather than colours scattered through the painter, because these
 * three are what "the material reads deliberately at a boundary" means: the
 * outline is the silhouette, `inner` is the water's own lit edge or the forest's
 * darker canopy, and `outer` is what the neighbour receives — wet sand on a
 * riverbank, moss under a treeline, a shoulder beside a road.
 */
interface ClassStyle {
  readonly outline: Rgba;
  readonly inner: Rgba;
  readonly outer: Rgba;
}

const CLASS_STYLE: Readonly<Record<MaterialClass, ClassStyle>> = {
  plain: { outline: shadeAt(RAMPS.olive, 0), inner: shadeAt(RAMPS.olive, 5), outer: shadeAt(RAMPS.olive, 2) },
  hill: { outline: shadeAt(RAMPS.stone, 0), inner: shadeAt(RAMPS.stone, 5), outer: shadeAt(RAMPS.stone, 1) },
  forest: { outline: shadeAt(RAMPS.olive, 0), inner: shadeAt(RAMPS.olive, 2), outer: shadeAt(RAMPS.olive, 2) },
  farmland: {
    outline: shadeAt(RAMPS.bronze, 1),
    inner: shadeAt(RAMPS.parchment, 4),
    outer: shadeAt(RAMPS.bronze, 3),
  },
  road: { outline: shadeAt(RAMPS.stone, 0), inner: shadeAt(RAMPS.stone, 5), outer: shadeAt(RAMPS.stone, 3) },
  water: { outline: shadeAt(RAMPS.water, 0), inner: shadeAt(RAMPS.water, 5), outer: shadeAt(RAMPS.bronze, 2) },
  marsh: { outline: shadeAt(RAMPS.olive, 0), inner: shadeAt(RAMPS.olive, 3), outer: shadeAt(RAMPS.bronze, 2) },
};

/**
 * How many diagonal steps of a corner are cut away, in pixels.
 *
 * One, which is three pixels: at a quadrant's eight-pixel scale a rounded corner
 * *is* a chamfer, and a circle of radius six removes the same three — so the
 * arithmetic is honest about being discrete rather than pretending to an arc it
 * cannot draw. The cut is measured from the cell's centre lines, which is what
 * makes it the same shape in all four quadrants under the rotation the variants
 * are built on.
 */
const CORNER_CHAMFER = 1;

/**
 * A small integer hash of a pixel and a salt: the only randomness the art has.
 *
 * `Math.random` is banned repository-wide, and a texture that has to be the same
 * on every engine cannot use a transcendental either (ADR-0006), so the ground
 * is dithered by integer mixing. The result is unsigned 32-bit, and callers take
 * it modulo something small.
 */
function noiseAt(x: number, y: number, salt: number): number {
  let hash = Math.imul(x + 0x9e37, 0x85ebca6b) ^ Math.imul(y + 0xc2b2, 0x27d4eb2d) ^ salt;
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);

  return (hash ^ (hash >>> 13)) >>> 0;
}

/** The salt each material's texture is dithered with, so two materials never share a pattern. */
const SALT: Readonly<Record<TerrainMaterial, number>> = {
  plain: 0x0001,
  hill: 0x1002,
  forest: 0x2003,
  farmland: 0x3004,
  river: 0x4005,
  ford: 0x5006,
  road: 0x6007,
  lake: 0x7008,
  marsh: 0x8009,
};

/**
 * The salts the decoration is dithered with, kept apart from the materials'.
 *
 * The bands are gated rather than painted solid, so a shoreline is a suggestion
 * of a line rather than a stripe of paint; a salt per band means the two sides of
 * a boundary do not dither in step with each other, which would read as a seam
 * in the decoration itself.
 */
const BAND_SALT = { inner: 0x7a11, outer: 0x7b22 } as const;

/** The salt the wheel ruts of a road are scattered with. */
const RUT_SALT = 0x7c33;

/** One shade of one detail ramp, which is what a material's texture is written in. */
export interface MaterialShade {
  /** The base whose detail ramp the shade comes from. */
  readonly ramp: DetailRampName;
  /** The shade's index in that ramp, darkest first. */
  readonly index: number;
}

/**
 * What one material's terrain is made of, as the shades it may be painted with.
 *
 * A terrain is three things and no more: the **body**, the shade most of its pixels
 * take; the **dark**, the one detail step the dither alternates to, which is what
 * gives a field a texture without giving it a pattern; and the **mark**, the single
 * deliberate feature that names the material — farmland's furrows, a river's wave, a
 * ford's stepping stones, a road's gravel, a plain's blade of grass.
 *
 * The mark is the one shade that carries its own `ramp`, because it is the one that
 * may leave the material's base: a ford's stones are `stone` on water and a road's
 * gravel is `stone` in bronze, while the body and the dither are always shades of the
 * material's own base. It may cover no more than `markShare` of the tile, so it stays
 * a feature and never becomes a second texture.
 *
 * Everything here is data rather than numbers inside the painter because the claim
 * the ticket makes is about *contrast*, and contrast is a number somebody can check:
 * a dither is one detail step, a mark of the terrain's own base is at most two, and
 * the art may paint nothing that is not declared here (`tests/art/terrain.test.ts`).
 */
export interface MaterialTexture {
  /** The base the terrain is shaded from: its body, its dither and, by default, its mark. */
  readonly ramp: DetailRampName;
  /** The detail shade most of the tile's pixels take. */
  readonly body: number;
  /** The dither's other shade, exactly one detail step from the body. */
  readonly dark: number;
  /** The one feature that names the material, and the only shade that may use another base. */
  readonly mark: MaterialShade;
  /** The most of a tile that feature may cover, as a share of its pixels. */
  readonly markShare: number;
}

/**
 * The seven terrains, as the shades each is painted from.
 *
 * The bodies are where each material already sat on the palette, so the theatre
 * reads as itself: plain on olive, hill on stone, forest a dark olive canopy,
 * farmland on parchment, water on its own blue, a ford two steps lighter than the
 * river it crosses, and a road's verge on bronze. The *spread* is what changed with
 * U5, not the colour: hill used to dither between stone shades five standard steps
 * apart and farmland between parchment ones three apart, which is what a field of
 * hard pixels was made of. `meanNeighbourJump` in the terrain test is that sentence
 * as a number.
 */
export const MATERIAL_TEXTURES: Readonly<Record<TerrainMaterial, MaterialTexture>> = {
  // A blade of grass, sparse and never on a grid: a regular motif is the one thing
  // ordinary terrain may not have, because the eye finds it before it finds a man.
  plain: { ramp: 'olive', body: 6, dark: 5, mark: { ramp: 'olive', index: 7 }, markShare: 1 / 8 },
  // Rock, with a rare lit outcrop: no more contrast than a shadow on the grass.
  hill: { ramp: 'stone', body: 6, dark: 5, mark: { ramp: 'stone', index: 7 }, markShare: 1 / 16 },
  // A canopy is shade under leaves, so the blot is coarse (half-scale noise) and the
  // brightest leaf is one step above the floor.
  forest: { ramp: 'olive', body: 1, dark: 0, mark: { ramp: 'olive', index: 2 }, markShare: 1 / 16 },
  // The one terrain with a direction: furrows are the dark shade, and the drill that
  // sowed them the mark. A ploughed field should read as ploughed from a man.
  farmland: { ramp: 'parchment', body: 4, dark: 3, mark: { ramp: 'parchment', index: 5 }, markShare: 1 / 8 },
  // Water is drawn as water and not as wet stone: a wave line two detail steps above
  // the body, and nothing else moving.
  river: { ramp: 'water', body: 4, dark: 3, mark: { ramp: 'water', index: 6 }, markShare: 1 / 8 },
  // A crossing is a river two steps lighter with stone slabs in it: the slabs are the
  // material's own second base, and the reason a ford is found rather than stumbled on.
  ford: { ramp: 'water', body: 8, dark: 7, mark: { ramp: 'stone', index: 9 }, markShare: 1 / 16 },
  // The verge under a road's path: gravel, so the mark is stone in the bronze.
  road: { ramp: 'bronze', body: 4, dark: 3, mark: { ramp: 'stone', index: 4 }, markShare: 1 / 4 },
  lake: { ramp: 'water', body: 4, dark: 3, mark: { ramp: 'water', index: 6 }, markShare: 1 / 8 },
  marsh: { ramp: 'olive', body: 3, dark: 2, mark: { ramp: 'water', index: 3 }, markShare: 1 / 8 },
};

/**
 * The shades one material's terrain is painted from, deduplicated.
 *
 * What the painter may reach for, as a value a test can compare the pixels against:
 * a texture that paints a shade it does not declare is a shade nobody chose.
 */
export function materialShades(material: TerrainMaterial): readonly MaterialShade[] {
  const texture = MATERIAL_TEXTURES[material];
  const shades: MaterialShade[] = [
    { ramp: texture.ramp, index: texture.dark },
    { ramp: texture.ramp, index: texture.body },
    texture.mark,
  ];

  return shades.filter(
    (shade, index) => shades.findIndex((other) => other.ramp === shade.ramp && other.index === shade.index) === index,
  );
}

/** The three colours a material's declared terrain resolves to, once it has been asked for. */
interface MaterialColours {
  readonly body: Rgba;
  readonly dark: Rgba;
  readonly mark: Rgba;
}

/** The colours already resolved, one set per material: the painter asks per pixel. */
const MATERIAL_COLOURS = new Map<TerrainMaterial, MaterialColours>();

/**
 * A material's declaration as three colours.
 *
 * Memoised rather than resolved at each pixel: `paintCell` asks for its material's
 * colours sixteen times a cell and there are fifteen thousand cells, and reading a
 * declaration is not what a texture should spend its time on.
 */
function coloursOf(material: TerrainMaterial): MaterialColours {
  const cached = MATERIAL_COLOURS.get(material);
  if (cached !== undefined) return cached;

  const texture = MATERIAL_TEXTURES[material];
  const colours: MaterialColours = {
    body: detailAt(texture.ramp, texture.body),
    dark: detailAt(texture.ramp, texture.dark),
    mark: detailAt(texture.mark.ramp, texture.mark.index),
  };

  MATERIAL_COLOURS.set(material, colours);
  return colours;
}

/**
 * The colour of one pixel of a material's texture.
 *
 * Seamless by construction: the texture is a function of the pixel's
 * coordinates *within the tile*, so the pixel to the right of a tile's last
 * column is the tile's own first column, and two tiles of the same material side
 * by side have no seam to hide. It is also why the dual grid can reassemble a
 * logical tile out of four different cells and get the map back exactly.
 *
 * The shades are the material's own declaration (`MATERIAL_TEXTURES`) and the
 * structure is what makes each material tellable: farmland's rows run one way,
 * a river's wave the other, a ford holds two pairs of stones. What none of them
 * does is alternate between two shades of a standard ramp — that is the flicker
 * U5 removed, and the reason these are *detail* shades.
 */
function textureOf(material: TerrainMaterial, x: number, y: number): Rgba {
  const { body, dark, mark } = coloursOf(material);
  const salt = SALT[material];
  const noise = noiseAt(x, y, salt);

  switch (material) {
    case 'plain': {
      if (noise % 11 === 0) return mark;
      return noise % 3 === 0 ? dark : body;
    }
    case 'hill': {
      if (noise % 31 === 0) return mark;
      return noise % 3 === 0 ? dark : body;
    }
    case 'forest': {
      // The blot is asked of a noise at half scale, so the shade gathers in clumps
      // the size of a leaf rather than in single pixels.
      if (noiseAt(x >> 1, y >> 1, salt) % 6 === 0) return dark;
      if (noise % 17 === 0) return mark;
      return noise % 3 === 0 ? dark : body;
    }
    case 'farmland': {
      if (y % 4 === 0) return dark;
      if (noiseAt(x >> 1, y, salt) % 7 === 0) return mark;
      return body;
    }
    case 'river':
    case 'lake': {
      if (y % 5 === 2 && (x + y) % 7 < 4) return mark;
      return noise % 9 === 0 ? dark : body;
    }
    case 'ford': {
      const stone = (x >= 3 && x <= 5 && y >= 9 && y <= 10) || (x >= 9 && x <= 11 && y >= 4 && y <= 5);
      if (stone) return mark;
      return noise % 6 === 0 ? dark : body;
    }
    case 'road': {
      if (noise % 7 === 0) return mark;
      return noise % 4 === 0 ? dark : body;
    }
    case 'marsh': {
      if (noise % 11 === 0) return mark;
      return noise % 3 === 0 ? dark : body;
    }
  }
}

/** The tiles already generated, keyed by material: the map asks for them nine thousand times. */
const MATERIAL_TILES = new Map<TerrainMaterial, PixelBuffer>();

/** One material's whole tile, as the map's floor is made of it. */
export function materialTile(material: TerrainMaterial): PixelBuffer {
  const cached = MATERIAL_TILES.get(material);
  if (cached !== undefined) return cached;

  const tile = createPixelBuffer(TERRAIN_TILE, TERRAIN_TILE);
  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) setPixel(tile, x, y, textureOf(material, x, y));
  }

  MATERIAL_TILES.set(material, tile);
  return tile;
}

/** The four quadrants of a cell, clockwise from the north-west: northwest, north-east, south-east, south-west. */
export type CellQuadrants = readonly [TerrainMaterial, TerrainMaterial, TerrainMaterial, TerrainMaterial];

/** The quadrant bit of each position in a `CellQuadrants` tuple: clockwork, the same as the mask. */
const QUADRANT_BITS: readonly GridMask[] = [0b0001, 0b0010, 0b0100, 0b1000];

/** Where in the cell each quadrant's pixels start, clockwise from the north-west. */
const QUADRANT_ORIGIN: readonly (readonly [number, number])[] = [
  [0, 0],
  [QUADRANT, 0],
  [QUADRANT, QUADRANT],
  [0, QUADRANT],
];

/**
 * Where in a material's own tile each quadrant's pixels come from: the opposite corner.
 *
 * A cell's north-west quadrant is a logical tile's *south-east* quarter, so the
 * copy takes the material tile's south-east quarter — and the two together are
 * what `tilePhase` says in one step.
 */
const QUADRANT_SOURCE: readonly (readonly [number, number])[] = [
  [QUADRANT, QUADRANT],
  [0, QUADRANT],
  [0, 0],
  [QUADRANT, 0],
];

/** Which quadrant of a cell a pixel falls in, clockwise from the north-west. */
function quadrantAt(x: number, y: number): number {
  if (y < QUADRANT) return x < QUADRANT ? 0 : 1;

  return x < QUADRANT ? 3 : 2;
}

/**
 * Whether a pixel is one diagonal step from the cell's centre, which is the corner the chamfer cuts.
 *
 * Distance is counted in whole steps from the two centre lines — the column and
 * the row where the four quadrants meet — so the test is integer, symmetric
 * about the cell's centre, and the same in every quadrant once a variant is
 * turned into place.
 */
function atCorner(x: number, y: number): boolean {
  const toCentreX = x < QUADRANT ? QUADRANT - 1 - x : x - QUADRANT;
  const toCentreY = y < QUADRANT ? QUADRANT - 1 - y : y - QUADRANT;

  return toCentreX + toCentreY <= CORNER_CHAMFER;
}

/**
 * Whether a pixel lies inside a canonical shape's foreground region.
 *
 * The five transition tiles are these predicates and nothing else: the fill
 * comes from the quadrants, so the shape only has to say which side of the
 * boundary a pixel is on. `edge` is the straight boundary through the centre,
 * `saddle` the two opposite quadrants, and `outer` and `inner` the two cases
 * with a corner at the centre — a promontory and a bay.
 *
 * Only those last two round, and only when the cell has exactly two materials to
 * round between: where three materials meet there is no single other side for
 * the corner to curve against, so the boundary follows the quadrant edge it
 * really is.
 */
function insideCanonical(shape: TerrainShape, x: number, y: number, rounded: boolean): boolean {
  switch (shape) {
    case 'empty':
      return false;
    case 'solid':
      return true;
    case 'edge':
      return y < QUADRANT;
    case 'saddle':
      return (x < QUADRANT) === (y < QUADRANT);
    case 'outer':
      return x < QUADRANT && y < QUADRANT && !(rounded && atCorner(x, y));
    case 'inner':
      // The canonical mask is every quadrant but the south-west one, and the bay
      // is filled in by the few pixels of that quadrant nearest the centre.
      return (
        !(x < QUADRANT && y >= QUADRANT) || (rounded && x < QUADRANT && y >= QUADRANT && atCorner(x, y))
      );
  }
}

/** A quarter turn counter-clockwise about the cell's centre: where a canonical pixel comes from. */
function canonicalPoint(x: number, y: number, rotation: number): readonly [number, number] {
  let px = x;
  let py = y;

  for (let turn = 0; turn < rotation; turn += 1) {
    const nextX = py;
    const nextY = TERRAIN_TILE - 1 - px;
    px = nextX;
    py = nextY;
  }

  return [px, py];
}

/**
 * Whether a pixel of a cell lies inside the foreground region its variant paints.
 *
 * The variant says which shape and how many turns placed it, so the question is
 * asked in the canonical orientation: the actual pixel is turned back by the
 * variant's rotation and the canonical predicate answers.
 */
function regionInside(variant: TerrainVariant, x: number, y: number, rounded: boolean): boolean {
  const [cx, cy] = canonicalPoint(x, y, variant.rotation);

  return insideCanonical(variant.shape, cx, cy, rounded);
}

/** What four materials add up to: which class is drawn on top, and which pixels it claims. */
interface CellPlan {
  /** The class drawn as the foreground, whose boundary is the one decorated. */
  readonly foreground: MaterialClass;
  /** The dual-grid variant: the five shapes, turned into place. */
  readonly variant: TerrainVariant;
  /** The material that stands in for the foreground class where a quadrant is a different one of its materials. */
  readonly representative: TerrainMaterial;
  /** The one material on the far side of the foreground, or `undefined` where three or four meet. */
  readonly background: TerrainMaterial | undefined;
  /** 1 where the foreground region claims the pixel, in the cell's own coordinates. */
  readonly inside: Uint8Array;
}

/**
 * Works out what a cell's four materials mean, once, for the painter and the tests.
 *
 * Everything a variant *is* comes out of here: the foreground class, the mask of
 * the quadrants that share it, the shape that mask is a rotation of, and the
 * region of pixels the foreground claims — rounded only where there is a single
 * other side for the corner to curve against.
 */
function planCell(quadrants: CellQuadrants): CellPlan {
  const classes = quadrants.map((material) => CLASS_OF[material]);
  const foreground = highestPriorityClass(classes);
  let mask: GridMask = 0;
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    if (classes[quadrant] === foreground) mask |= QUADRANT_BITS[quadrant] ?? 0;
  }

  const variant = variantOf(mask);
  const background = backgroundMaterial(quadrants, foreground);
  const inside = regionOf(variant, background !== undefined);

  return {
    foreground,
    variant,
    representative: classRepresentative(quadrants, foreground),
    background,
    inside,
  };
}

/** The 0/1 grid of a variant's foreground region, with the minority corner rounded or squared. */
function regionOf(variant: TerrainVariant, rounded: boolean): Uint8Array {
  const inside = new Uint8Array(TERRAIN_TILE * TERRAIN_TILE);
  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      inside[y * TERRAIN_TILE + x] = regionInside(variant, x, y, rounded) ? 1 : 0;
    }
  }

  return inside;
}

/**
 * The pixels one variant's named material claims, as a `0`/`1` grid over the cell.
 *
 * The dual grid's promise is that a cell is *five shapes turned into place*, and
 * this is that promise as a value a test can read: the mask says which quadrants
 * the material owns, the shape says what that looks like, and the rotation says
 * where. `cellTile` paints exactly this region whenever the named material is
 * the pair's foreground — which is every pair the catalogue shows, and every
 * pair whose boundary is decorated at all.
 *
 * The region is read from the arguments rather than from the priority table, so
 * asking about the lower material of a pair answers with *its* pixels: the two
 * answers are complements, which is also how a boundary looks from either bank.
 */
export function variantRegion(
  material: TerrainMaterial,
  background: TerrainMaterial,
  mask: GridMask,
): Uint8Array {
  return regionOf(variantOf(mask), material !== background);
}

/** The cells already generated, keyed by their four materials: the map asks for one per cell. */
const CELL_TILES = new Map<number, PixelBuffer>();

/** The key of a cell's four materials: base seven, one digit per quadrant. */
function cellKey(quadrants: CellQuadrants): number {
  const index = (material: TerrainMaterial): number => MATERIALS.indexOf(material);
  const [nw, ne, sw, se] = quadrants;

  return ((index(nw) * MATERIALS.length + index(ne)) * MATERIALS.length + index(sw)) * MATERIALS.length +
    index(se);
}

/**
 * One rendered cell: the dual grid's tile for the four materials around a corner.
 *
 * - the four materials are the logical tiles the cell's centre sits between,
 *   clockwise from the north-west — north-west, north-east, south-east,
 *   south-west — and everything else follows from them:
 *
 * - the **fill** is each quadrant's own texture, so a cell where three or four
 *   materials meet is right rather than approximated;
 * - the **foreground** is the highest-priority class present, and the *mask* is
 *   which quadrants share it: that mask is the dual-grid variant, one of the
 *   five shapes turned into place;
 * - the **transition** is the foreground's style drawn along the boundary the
 *   mask describes — outline, inside band, outside band — with the minority
 *   corner rounded, so a coastline turns rather than steps;
 * - where the fill is not the foreground's, the *representative* material of the
 *   foreground class covers the pixels the rounded region claims, which is how a
 *   promontory gains the pixels a bay loses.
 *
 * Pure, and memoised: the same four materials always produce the same tile.
 */
export function cellTile(quadrants: CellQuadrants): PixelBuffer {
  const key = cellKey(quadrants);
  const cached = CELL_TILES.get(key);
  if (cached !== undefined) return cached;

  const tile = paintCell(quadrants);
  CELL_TILES.set(key, tile);

  return tile;
}

function paintCell(quadrants: CellQuadrants): PixelBuffer {
  const tile = createPixelBuffer(TERRAIN_TILE, TERRAIN_TILE);
  const classes = quadrants.map((material) => CLASS_OF[material]);
  const distinct = new Set(classes);

  // One class and nothing to draw a transition between: the quadrants are the
  // whole story, which is also the case a river and a ford meeting falls into.
  if (distinct.size === 1) {
    fillQuadrants(tile, quadrants);
    return tile;
  }

  const plan = planCell(quadrants);
  const { foreground, representative, background, inside } = plan;
  const boundary = markBoundary(inside);
  const style = CLASS_STYLE[foreground];

  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      const index = y * TERRAIN_TILE + x;
      const here = inside[index] === 1;
      const own = quadrants[quadrantAt(x, y)] ?? 'plain';
      const ownIsForeground = CLASS_OF[own] === foreground;
      const material = here
        ? ownIsForeground
          ? own
          : representative
        : ownIsForeground && background !== undefined
          ? background
          : own;

      // The texture is asked at the *logical tile's* own pixel, not the cell's:
      // half a tile along either axis is the same offset in every quadrant, and
      // it is what keeps farmland's furrows and a river's waves running straight
      // across a cell's edge instead of restarting there (`tilePhase`).
      setPixel(tile, x, y, textureOf(material, tilePhase(x), tilePhase(y)));

      if (boundary[index] === 1) {
        // The silhouette, always painted: a boundary that is dithered away is a
        // boundary nobody sees at the lowest zoom.
        setPixel(tile, x, y, style.outline);
        continue;
      }
      if (!nearBoundary(boundary, x, y)) continue;
      if (here) {
        if (noiseAt(x, y, BAND_SALT.inner) % 3 !== 0) setPixel(tile, x, y, style.inner);
      } else if (noiseAt(x, y, BAND_SALT.outer) % 3 !== 0) {
        setPixel(tile, x, y, style.outer);
      }
    }
  }

  return tile;
}

/**
 * The one material on the far side of the foreground class, when there is one.
 *
 * `undefined` where the cell holds three or four materials: there is no single
 * other side then, and the painter keeps every quadrant's own texture instead of
 * inventing one.
 */
function backgroundMaterial(
  quadrants: CellQuadrants,
  foreground: MaterialClass,
): TerrainMaterial | undefined {
  let found: TerrainMaterial | undefined;

  for (const material of quadrants) {
    if (CLASS_OF[material] === foreground) continue;
    if (found === undefined) {
      found = material;
      continue;
    }
    if (found !== material) return undefined;
  }

  return found;
}

/**
 * The coordinate inside a logical tile that a cell-local pixel belongs to.
 *
 * A cell's quadrants are the four logical tiles around its centre, so a cell
 * pixel's position *within its own tile* is the cell coordinate turned by half a
 * tile — the same offset in all four quadrants, because a quadrant is half a
 * tile square. It is what makes the material textures a property of the map
 * rather than of the dual grid, and therefore seamless across a cell's edge.
 */
function tilePhase(value: number): number {
  return (value + QUADRANT) & (TERRAIN_TILE - 1);
}

/** Fills each quadrant of a cell from its own material, quadrant for quadrant. */
function fillQuadrants(tile: PixelBuffer, quadrants: CellQuadrants): void {
  for (let quadrant = 0; quadrant < 4; quadrant += 1) {
    const origin = QUADRANT_ORIGIN[quadrant];
    const source = QUADRANT_SOURCE[quadrant];
    const material = quadrants[quadrant] ?? 'plain';
    if (origin === undefined || source === undefined) continue;

    blitRegion(
      tile,
      materialTile(material),
      source[0],
      source[1],
      QUADRANT,
      QUADRANT,
      origin[0],
      origin[1],
    );
  }
}

/** The class drawn as the foreground where several meet: the one laid down last. */
function highestPriorityClass(classes: readonly MaterialClass[]): MaterialClass {
  let foreground: MaterialClass = classes[0] ?? 'plain';

  for (const candidate of classes) {
    if (CLASS_PRIORITY[candidate] > CLASS_PRIORITY[foreground]) foreground = candidate;
  }

  return foreground;
}

/**
 * The material that stands in for a class in a cell: the one most of its quadrants are.
 *
 * Only ever needed where a class covers quadrants of more than one material —
 * which today means water, where a river and a ford can meet in one cell — and
 * then the majority is what a rounded corner should look like.
 */
function classRepresentative(quadrants: CellQuadrants, foreground: MaterialClass): TerrainMaterial {
  const counts = new Map<TerrainMaterial, number>();

  for (const material of quadrants) {
    if (CLASS_OF[material] !== foreground) continue;
    counts.set(material, (counts.get(material) ?? 0) + 1);
  }

  let best: TerrainMaterial = 'plain';
  let bestCount = -1;
  for (const material of MATERIALS) {
    const count = counts.get(material) ?? 0;
    if (count > bestCount) {
      best = material;
      bestCount = count;
    }
  }

  return best;
}

/** Marks every pixel the region changes across, so the silhouette has one place to be drawn. */
function markBoundary(inside: Uint8Array): Uint8Array {
  const boundary = new Uint8Array(TERRAIN_TILE * TERRAIN_TILE);

  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      const here = inside[y * TERRAIN_TILE + x];
      for (const [nx, ny] of neighbours(x, y)) {
        if (inside[ny * TERRAIN_TILE + nx] !== here) {
          boundary[y * TERRAIN_TILE + x] = 1;
          break;
        }
      }
    }
  }

  return boundary;
}

/** Whether a pixel is one step from the silhouette, which is where the bands are painted. */
function nearBoundary(boundary: Uint8Array, x: number, y: number): boolean {
  return neighbours(x, y).some(([nx, ny]) => boundary[ny * TERRAIN_TILE + nx] === 1);
}

/**
 * The four neighbours of a pixel inside the cell, clamped at its edges.
 *
 * Clamping rather than wrapping, and rather than reaching into the next cell:
 * the region continues across a cell's edge, so a pixel at the edge has no
 * boundary there and must not draw one. The neighbouring cell draws whatever is
 * really on the other side, and its own clamp meets this one exactly.
 */
function neighbours(x: number, y: number): readonly (readonly [number, number])[] {
  return [
    [Math.max(0, x - 1), y],
    [Math.min(TERRAIN_TILE - 1, x + 1), y],
    [x, Math.max(0, y - 1)],
    [x, Math.min(TERRAIN_TILE - 1, y + 1)],
  ];
}

/** How wide a road's path is, exclusive of its far edge: six pixels, a cart's width. */
const ROAD_FROM = QUADRANT - 3;
const ROAD_TO = QUADRANT + 2;

/** The road tiles already generated, keyed by their connection mask. */
const ROAD_TILES = new Map<GridMask, PixelBuffer>();

/**
 * One road tile: the path a road draws between the neighbours it is connected to.
 *
 * A road is autotiled by which of its four neighbours it continues into — the
 * other half of the plan's *five tiles plus rotation*, since the sixteen
 * connection masks are six canonical pieces turned into place. The path is drawn
 * in the canonical orientation and the whole tile is then turned, which is
 * exactly the claim the technique makes: a corner is not a second piece of art.
 *
 * The result is transparent where there is no path, so the road material's own
 * shoulder underneath is what the verge is made of.
 */
export function roadTile(mask: GridMask): PixelBuffer {
  const cached = ROAD_TILES.get(mask);
  if (cached !== undefined) return cached;

  const variant = roadVariantOf(mask);
  const tile = rotateQuarterTurns(paintRoad(variant.shape), variant.rotation);
  ROAD_TILES.set(mask, tile);

  return tile;
}

/** The canonical road path for a shape, drawn with trodden earth and a dark shoulder. */
function paintRoad(shape: RoadShape): PixelBuffer {
  const tile = createPixelBuffer(TERRAIN_TILE, TERRAIN_TILE);
  const path = new Uint8Array(TERRAIN_TILE * TERRAIN_TILE);
  const north = CANONICAL_ROAD_MASK[shape] & 0b0001;
  const east = CANONICAL_ROAD_MASK[shape] & 0b0010;
  const south = CANONICAL_ROAD_MASK[shape] & 0b0100;

  const arm = (fromX: number, fromY: number, toX: number, toY: number): void => {
    for (let y = fromY; y <= toY; y += 1) {
      for (let x = fromX; x <= toX; x += 1) path[y * TERRAIN_TILE + x] = 1;
    }
  };

  // The centre is always path: every shape has one, isolated included.
  arm(ROAD_FROM, ROAD_FROM, ROAD_TO, ROAD_TO);
  if (shape === 'isolated') {
    // A lone tile gets its corners taken off, so it reads as a clearing.
    for (const [x, y] of [
      [ROAD_FROM, ROAD_FROM],
      [ROAD_TO, ROAD_FROM],
      [ROAD_FROM, ROAD_TO],
      [ROAD_TO, ROAD_TO],
    ] as const) {
      path[y * TERRAIN_TILE + x] = 0;
    }
  }
  if (north) arm(ROAD_FROM, 0, ROAD_TO, QUADRANT);
  if (south) arm(ROAD_FROM, QUADRANT, ROAD_TO, TERRAIN_TILE - 1);
  if (east) arm(QUADRANT, ROAD_FROM, TERRAIN_TILE - 1, ROAD_TO);
  if (CANONICAL_ROAD_MASK[shape] & 0b1000) arm(0, ROAD_FROM, QUADRANT, ROAD_TO);

  const earth = shadeAt(RAMPS.bronze, 4);
  const rut = shadeAt(RAMPS.bronze, 2);
  const shoulder = shadeAt(RAMPS.stone, 1);

  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      if (path[y * TERRAIN_TILE + x] === 0) continue;
      setPixel(tile, x, y, noiseAt(x, y, RUT_SALT) % 5 === 0 ? rut : earth);
    }
  }

  // The shoulder is painted where the path ends, which is what stops a road from
  // bleeding into the grass as a soft edge — and it is drawn last so a corner
  // does not eat the shoulder of the arm beside it.
  for (let y = 0; y < TERRAIN_TILE; y += 1) {
    for (let x = 0; x < TERRAIN_TILE; x += 1) {
      if (path[y * TERRAIN_TILE + x] === 1) continue;
      if (!neighbours(x, y).some(([nx, ny]) => path[ny * TERRAIN_TILE + nx] === 1)) continue;

      setPixel(tile, x, y, shoulder);
    }
  }

  return tile;
}

/** One generated tile, named for the catalogue and the bake step. */
export interface TerrainEntry {
  readonly name: string;
  readonly buffer: PixelBuffer;
}

/**
 * The ground materials the Atelier shows a row of variants for.
 *
 * Plain is not among them, and that is a fact about the terrain rather than a
 * gap in the page: plain is the ground everything else is laid over, so it is
 * never the foreground of a boundary and has no variants of its own — its
 * boundary with a hill is the hill's variant, seen from the other side. The road
 * is not among them either: a road is autotiled by its connections rather than
 * by a corner, so its sixteen variants are a row of their own.
 */
export const TERRAIN_MATERIALS: readonly TerrainMaterial[] = [
  'hill',
  'forest',
  'farmland',
  'river',
  'ford',
  'lake',
  'marsh',
];

/**
 * What a material's boundary is shown against in the Atelier: plain ground.
 *
 * The row's own material is the higher priority of the pair, so the shapes in a
 * row are that material's foreground and the background is the ground it is
 * crossing — which is also the pair the map produces most often.
 */
export function referenceBackground(material: TerrainMaterial): TerrainMaterial {
  return material === 'plain' ? 'hill' : 'plain';
}

/** The cell four quadrants make for one mask of a material against a background. */
export function variantQuadrants(
  material: TerrainMaterial,
  background: TerrainMaterial,
  mask: GridMask,
): CellQuadrants {
  const quadrants = QUADRANT_BITS.map((bit) => ((mask & bit) === 0 ? background : material));

  return [quadrants[0] ?? background, quadrants[1] ?? background, quadrants[2] ?? background, quadrants[3] ?? background];
}

/** One material's whole row of variants, against the reference background. */
export function materialVariantTiles(material: TerrainMaterial): readonly PixelBuffer[] {
  const background = referenceBackground(material);

  return Array.from({ length: 16 }, (_, mask) => cellTile(variantQuadrants(material, background, mask)));
}

/**
 * Every terrain tile, named, in the order the Atelier lays them out.
 *
 * Six materials by sixteen variants, then the road's sixteen connections: the
 * whole of the terrain art in one list, which is what puts it beside every other
 * generated asset on the Atelier page and in the bake (PLAN §3).
 */
export function terrainEntries(): readonly TerrainEntry[] {
  const entries: TerrainEntry[] = [];

  for (const material of MATERIALS) entries.push({ name: `terrain:${material}`, buffer: materialTile(material) });

  for (const material of TERRAIN_MATERIALS) {
    for (let mask = 0; mask < 16; mask += 1) {
      entries.push({
        name: `terrain:${material}:${String(mask)}`,
        buffer: cellTile(variantQuadrants(material, referenceBackground(material), mask)),
      });
    }
  }

  for (let mask = 0; mask < 16; mask += 1) {
    entries.push({ name: `road:${String(mask)}`, buffer: roadTile(mask) });
  }

  return entries;
}
