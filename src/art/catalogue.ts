/**
 * The catalogue: every artefact B2 and B3 generate, and the one plate the
 * Atelier shows.
 *
 * The Atelier's job is to make generated art inspectable — by a human, and by an
 * agent that would otherwise guess at pixels from source (ADR-0002). For that to
 * mean anything there has to be *one* place that says what the catalogue is, and
 * it has to be data plus pixels rather than a page: this module is that place,
 * and `cataloguePlate()` composes the whole thing into a single `PixelBuffer`,
 * which is what the page renders at its several zoom levels.
 *
 * Every entry is named and is itself a `PixelBuffer`, so a caller that wants to
 * look at one glyph, one ramp or one terrain variant has one to look at — a
 * test, a bake step or an agent inspecting a single sprite. Names are stable and
 * machine-readable: `glyph:U+00E0`, `ramp:bronze` and `terrain:forest:13`, which
 * is what a diff between two builds of the catalogue should be written in.
 *
 * Three sections, and each is laid out from what it holds rather than from a
 * number someone maintains beside it:
 *
 * - **glyphs**, the whole font, in a grid;
 * - **ramps**, the shades of each base, as strips;
 * - **terrain**, the ground of B3: every material's own tile, then one row per
 *   material of its sixteen dual-grid variants, and then the sixteen road
 *   connections. A row shows its material against the ground it crosses, which is
 * - **nodes**, the four resource markers B3 stands on that ground.
 */

import { GLYPHS, GLYPH_WIDTH, LINE_HEIGHT, drawText, measureText, textPlate } from './font.ts';
import { NODE_KINDS, NODE_TILE, nodeEntries, nodeMarker } from './nodes.ts';
import { BASE, RAMPS, RAMP_NAMES, RAMP_SHADES } from './palette.ts';
import { type PixelBuffer, blit, createPixelBuffer, fillRect } from './pixel-buffer.ts';
import {
  MATERIALS,
  TERRAIN_MATERIALS,
  TERRAIN_TILE,
  cellTile,
  materialTile,
  referenceBackground,
  roadTile,
  terrainEntries,
  variantQuadrants,
} from './terrain.ts';

/** One named artefact: what the Atelier renders, and what a test can pin. */
export interface CatalogueEntry {
  /** A stable, machine-readable name, e.g. `glyph:U+0041` or `terrain:forest:13`. */
  readonly name: string;
  /** The pixels, in the one currency the pipeline has (PLAN §3). */
  readonly buffer: PixelBuffer;
}

/** The flat grey the plate is drawn on: neutral, so nothing on it is flattered. */
export const PLATE_BACKGROUND = BASE.neutral;

/** The ink the plate's own labels are drawn in. */
export const PLATE_INK = BASE.ink;

/** Blank margin around the plate's contents, in pixels. */
const PLATE_PADDING = 4;

/** How many glyphs stand on one row of the glyph grid. */
const GLYPH_GRID_COLUMNS = 16;

/** One cell of the glyph grid: the glyph, plus air on two sides. */
const CELL_WIDTH = GLYPH_WIDTH + 3;
const CELL_HEIGHT = LINE_HEIGHT + 3;

/** One colour swatch of a ramp, and the air between two of them. */
const SWATCH_WIDTH = 7;
const SWATCH_HEIGHT = 7;
const SWATCH_GAP = 1;

/** Blank rows between two sections. */
const SECTION_GAP = 8;

/** Air between a section's heading and what it heads. */
const HEADING_GAP = 3;

/** Air between a ramp's name and its swatches. */
const LABEL_GAP = 3;

/** The rows of the glyph grid. */
const GLYPH_ROWS = Math.ceil(GLYPHS.length / GLYPH_GRID_COLUMNS);

/** One heading: a line of text and the air under it. */
const HEADING_HEIGHT = LINE_HEIGHT + HEADING_GAP;

/** Width of the glyph grid. */
const GLYPH_GRID_WIDTH = GLYPH_GRID_COLUMNS * CELL_WIDTH;

/** Height of the glyph grid. */
const GLYPH_GRID_HEIGHT = GLYPH_ROWS * CELL_HEIGHT;

/** Height of all the ramp strips together. */
const RAMPS_HEIGHT = RAMP_NAMES.length * (SWATCH_HEIGHT + SECTION_GAP) - SECTION_GAP;

/** The widest ramp name, which is what the swatches clear. */
const RAMP_LABEL_WIDTH = Math.max(...RAMP_NAMES.map((name) => measureText(name)));

/** Width of the ramp section: a name, and the shades of the ramp beside it. */
const RAMPS_WIDTH = RAMP_LABEL_WIDTH + LABEL_GAP + RAMP_SHADES * SWATCH_WIDTH + (RAMP_SHADES - 1) * SWATCH_GAP;

/** How many terrain variants stand on one row: the dual grid's sixteen masks. */
const TERRAIN_COLUMNS = 16;

/** One cell of a terrain row: the tile, plus the air that keeps two rows apart. */
const TERRAIN_CELL = TERRAIN_TILE + 3;

/** The labels down the side of the terrain section: the ground, one row per material, the road, the nodes. */
const TERRAIN_ROW_LABELS: readonly string[] = ['ground', 'road', 'node', ...TERRAIN_MATERIALS];

/** The widest of them, which is what the tiles clear. */
const TERRAIN_LABEL_WIDTH = Math.max(...TERRAIN_ROW_LABELS.map((label) => measureText(label)));

/** Width of the terrain section: a label, and sixteen variants beside it. */
const TERRAIN_WIDTH = TERRAIN_LABEL_WIDTH + LABEL_GAP + TERRAIN_COLUMNS * TERRAIN_CELL;

/** The rows of variant tiles: one per material that can be a boundary's foreground. */
const TERRAIN_ROWS = TERRAIN_MATERIALS.length;

/** Height of the terrain section: the material row, the variant rows and the road row. */
const TERRAIN_HEIGHT = (1 + TERRAIN_ROWS + 1) * TERRAIN_CELL;

/** The resource markers, which stand in a row of their own under the terrain. */
const NODES_HEIGHT = NODE_TILE + 3;

/** The plate's width: the padding, and whichever section is wider. */
export const PLATE_WIDTH = PLATE_PADDING * 2 + Math.max(GLYPH_GRID_WIDTH, RAMPS_WIDTH, TERRAIN_WIDTH);

/** The plate's height, which the sections above add up to. */
export const PLATE_HEIGHT =
  PLATE_PADDING * 2 +
  HEADING_HEIGHT * 5 +
  GLYPH_GRID_HEIGHT +
  RAMPS_HEIGHT +
  TERRAIN_HEIGHT +
  NODES_HEIGHT +
  SECTION_GAP * 4;

/**
 * Every artefact the art library generates, in a stable order: the glyphs in
 * code-point order, the ramps in the order `RAMP_NAMES` states, and the terrain
 * tiles `terrainEntries` names.
 *
 * Each glyph is drawn on its own transparent buffer at line-box size, so the
 * accent band is part of the entry and two entries can be compared without
 * caring what is behind them.
 */
export function catalogue(): readonly CatalogueEntry[] {
  const glyphs = GLYPHS.map((glyph) => {
    const buffer = createPixelBuffer(GLYPH_WIDTH, LINE_HEIGHT);
    drawText(buffer, glyph.character, 0, 0, PLATE_INK);

    return { name: `glyph:${codePointName(glyph.character)}`, buffer };
  });

  const ramps = RAMP_NAMES.map((name) => ({ name: `ramp:${name}`, buffer: rampSwatches(name) }));

  return [...glyphs, ...ramps, ...terrainEntries(), ...nodeEntries()];
}

/** The glyph entries, which stand first in the catalogue and in the plate's grid. */
function glyphEntries(entries: readonly CatalogueEntry[]): readonly CatalogueEntry[] {
  return entries.slice(0, GLYPHS.length);
}

/** The ramp entries, which stand after the glyphs and are drawn as strips. */
function rampEntries(entries: readonly CatalogueEntry[]): readonly CatalogueEntry[] {
  return entries.slice(GLYPHS.length, GLYPHS.length + RAMP_NAMES.length);
}

/**
 * The whole catalogue on one plate, which is what the Atelier renders.
 *
 * The layout is additive from the constants above — padding, a heading, the
 * grid, a gap, a heading, the ramp strips, a gap, a heading, the terrain, a gap,
 * a heading, the roads — so the plate's size is a consequence of what the
 * catalogue holds rather than a number someone maintains beside it. Everything
 * is drawn in the plate's own coordinates and nothing is scaled: the zoom the
 * Atelier shows it at is the camera's business, not the plate's.
 */
export function cataloguePlate(): PixelBuffer {
  const plate = createPixelBuffer(PLATE_WIDTH, PLATE_HEIGHT, PLATE_BACKGROUND);
  // Asked for once: every glyph is drawn afresh by `catalogue()`, and a plate
  // that asked again per section would draw the font five times over.
  const entries = catalogue();
  const glyphs = glyphEntries(entries);
  const ramps = rampEntries(entries);

  let y = PLATE_PADDING;
  blit(plate, textPlate('glyphs', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  for (let index = 0; index < GLYPHS.length; index += 1) {
    const entry = glyphs[index];
    if (entry === undefined) continue;

    const column = index % GLYPH_GRID_COLUMNS;
    const row = Math.floor(index / GLYPH_GRID_COLUMNS);
    blit(plate, entry.buffer, PLATE_PADDING + column * CELL_WIDTH, y + row * CELL_HEIGHT);
  }
  y += GLYPH_GRID_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('ramps', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The swatches are the ramp entries themselves, blitted rather than redrawn: the
  // plate shows the catalogue and does not hold a second opinion about it.
  const rampsTop = y;
  for (let index = 0; index < RAMP_NAMES.length; index += 1) {
    const entry = ramps[index];
    if (entry === undefined) continue;

    const row = rampsTop + index * (SWATCH_HEIGHT + SECTION_GAP);
    blit(plate, textPlate(RAMP_NAMES[index] ?? '', PLATE_INK), PLATE_PADDING, row);
    blit(plate, entry.buffer, PLATE_PADDING + RAMP_LABEL_WIDTH + LABEL_GAP, row + 1);
  }
  y = rampsTop + RAMPS_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('terrain', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // One row per material, each a label and sixteen variants: the mask a column
  // stands for is the column's own number, so a row reads left to right from
  // "none of it" to "all of it".
  blit(plate, textPlate('ground', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < MATERIALS.length; index += 1) {
    const material = MATERIALS[index];
    if (material === undefined) continue;

    blit(plate, materialTile(material), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + index * TERRAIN_CELL, y);
  }
  y += TERRAIN_CELL;

  for (const material of TERRAIN_MATERIALS) {
    const background = referenceBackground(material);
    blit(plate, textPlate(material, PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);

    for (let mask = 0; mask < TERRAIN_COLUMNS; mask += 1) {
      blit(
        plate,
        cellTile(variantQuadrants(material, background, mask)),
        PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + mask * TERRAIN_CELL,
        y,
      );
    }
    y += TERRAIN_CELL;
  }
  y += SECTION_GAP;

  blit(plate, textPlate('roads', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  blit(plate, textPlate('road', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let mask = 0; mask < TERRAIN_COLUMNS; mask += 1) {
    blit(plate, roadTile(mask), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + mask * TERRAIN_CELL, y);
  }
  y += TERRAIN_CELL + SECTION_GAP;

  blit(plate, textPlate('nodes', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The markers are drawn on the neutral plate with no ground under them, which is
  // exactly the question a marker has to answer: does it read on nothing?
  blit(plate, textPlate('node', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < NODE_KINDS.length; index += 1) {
    const kind = NODE_KINDS[index];
    if (kind === undefined) continue;

    blit(plate, nodeMarker(kind), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + index * TERRAIN_CELL, y);
  }

  return plate;
}

/** One ramp as a strip of its shades, darkest first, which is how a ramp is judged. */
function rampSwatches(name: (typeof RAMP_NAMES)[number]): PixelBuffer {
  const width = RAMP_SHADES * SWATCH_WIDTH + (RAMP_SHADES - 1) * SWATCH_GAP;
  const buffer = createPixelBuffer(width, SWATCH_HEIGHT);

  for (let shade = 0; shade < RAMP_SHADES; shade += 1) {
    const colour = RAMPS[name][shade];
    if (colour === undefined) continue;

    fillRect(buffer, shade * (SWATCH_WIDTH + SWATCH_GAP), 0, SWATCH_WIDTH, SWATCH_HEIGHT, colour);
  }

  return buffer;
}

/** A character's name in the catalogue: its code point, so no glyph name needs escaping. */
function codePointName(character: string): string {
  return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}
