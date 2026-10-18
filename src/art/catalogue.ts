/**
 * The catalogue: every artefact B2 generates, and the one plate the Atelier shows.
 *
 * The Atelier's job is to make generated art inspectable — by a human, and by an
 * agent that would otherwise guess at pixels from source (ADR-0002). For that to
 * mean anything there has to be *one* place that says what the catalogue is, and
 * it has to be data plus pixels rather than a page: this module is that place,
 * and `cataloguePlate()` composes the whole thing into a single `PixelBuffer`,
 * which is what the page renders at its several zoom levels.
 *
 * Every entry is named and is itself a `PixelBuffer`, so a caller that wants to
 * look at one glyph rather than a plate has one to look at — a test, a bake step
 * or an agent inspecting a single sprite. Names are stable and machine-readable:
 * `glyph:U+00E0` and `ramp:bronze`, which is what a diff between two builds of
 * the catalogue should be written in.
 *
 * What is *not* here is as deliberate as what is. B2 generates a font and a
 * palette; the figures of C2, the buildings of C5 and the terrain of B3 join this
 * catalogue by adding themselves to it, which is why the plate lays sections out
 * from constants rather than from a scenery list.
 */

import { GLYPHS, GLYPH_WIDTH, LINE_HEIGHT, drawText, measureText, textPlate } from './font.ts';
import { BASE, RAMPS, RAMP_NAMES, RAMP_SHADES } from './palette.ts';
import { type PixelBuffer, blit, createPixelBuffer, fillRect } from './pixel-buffer.ts';

/** One named artefact: what the Atelier renders, and what a test can pin. */
export interface CatalogueEntry {
  /** A stable, machine-readable name, e.g. `glyph:U+0041` or `ramp:blood`. */
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

/** Blank rows between the glyph grid and the ramp strips. */
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

/** The plate's height, which the sections above add up to. */
export const PLATE_HEIGHT = PLATE_PADDING * 2 + HEADING_HEIGHT * 2 + GLYPH_GRID_HEIGHT + SECTION_GAP + RAMPS_HEIGHT;

/** The plate's width: the padding, and whichever section is wider. */
export const PLATE_WIDTH = PLATE_PADDING * 2 + Math.max(GLYPH_GRID_WIDTH, RAMPS_WIDTH);

/**
 * Every artefact the art library generates, in a stable order: the glyphs in
 * code-point order, then the ramps in the order `RAMP_NAMES` states.
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

  return [...glyphs, ...ramps];
}

/**
 * The whole catalogue on one plate, which is what the Atelier renders.
 *
 * The layout is additive from the constants above — padding, a heading, the
 * grid, a gap, a heading, the ramp strips — so the plate's size is a consequence
 * of what the catalogue holds rather than a number someone maintains beside it.
 * Everything is drawn in the plate's own coordinates and nothing is scaled: the
 * zoom the Atelier shows it at is the camera's business, not the plate's.
 */
export function cataloguePlate(): PixelBuffer {
  const plate = createPixelBuffer(PLATE_WIDTH, PLATE_HEIGHT, PLATE_BACKGROUND);
  const entries = catalogue();

  let y = PLATE_PADDING;
  blit(plate, textPlate('glyphs', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  for (let index = 0; index < GLYPHS.length; index += 1) {
    const entry = entries[index];
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
  for (let index = 0; index < RAMP_NAMES.length; index += 1) {
    const entry = entries[GLYPHS.length + index];
    if (entry === undefined) continue;

    blit(plate, textPlate(RAMP_NAMES[index] ?? '', PLATE_INK), PLATE_PADDING, y);
    blit(plate, entry.buffer, PLATE_PADDING + RAMP_LABEL_WIDTH + LABEL_GAP, y + 1);
    y += SWATCH_HEIGHT + SECTION_GAP;
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
