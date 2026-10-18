/**
 * The catalogue and the plate the Atelier shows (ticket B2).
 *
 * Two claims are worth holding here. The catalogue is *complete*: one named
 * entry for every glyph and every ramp, with nothing missing and nothing
 * unnamed. And the plate *places* the catalogue: every entry's pixels turn up
 * where the layout says they are, which is what makes the Atelier a rendering of
 * the catalogue rather than a picture beside it.
 */
import { describe, expect, it } from 'vitest';
import { PLATE_BACKGROUND, PLATE_HEIGHT, PLATE_WIDTH, catalogue, cataloguePlate } from '../../src/art/catalogue';
import { GLYPHS, GLYPH_WIDTH, LINE_HEIGHT } from '../../src/art/font';
import { RAMPS, RAMP_NAMES, RAMP_SHADES } from '../../src/art/palette';
import { pixelAt } from '../../src/art/pixel-buffer';

/** How many glyphs stand on one row of the plate, which the layout test mirrors. */
const GLYPH_GRID_COLUMNS = 16;
const CELL_WIDTH = GLYPH_WIDTH + 3;
const CELL_HEIGHT = LINE_HEIGHT + 3;
const PLATE_PADDING = 4;
const HEADING_HEIGHT = LINE_HEIGHT + 3;

/** The name the catalogue gives a character. */
function glyphName(character: string): string {
  return `glyph:U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

describe('the catalogue', () => {
  it('names every glyph and every ramp exactly once', () => {
    const names = catalogue().map((entry) => entry.name);

    expect(names.length).toBe(GLYPHS.length + RAMP_NAMES.length);
    expect(new Set(names).size).toBe(names.length);
    for (const glyph of GLYPHS) {
      expect(names).toContain(glyphName(glyph.character));
    }
    for (const name of RAMP_NAMES) {
      expect(names).toContain(`ramp:${name}`);
    }
  });

  it('gives each glyph a line box of its own, with the accent band part of the entry', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const glyph of GLYPHS) {
      const buffer = entries.get(glyphName(glyph.character));
      expect(buffer?.width, glyph.character).toBe(GLYPH_WIDTH);
      expect(buffer?.height, glyph.character).toBe(LINE_HEIGHT);
    }

    // A space has no ink at all; a letter has ink under its band; `à` has ink in
    // the band itself, which is where an accent lives.
    const ink = (name: string): number => {
      const buffer = entries.get(name);
      if (buffer === undefined) throw new Error(`no catalogue entry ${name}`);
      let count = 0;
      for (let index = 3; index < buffer.pixels.length; index += 4) {
        if ((buffer.pixels[index] ?? 0) > 0) count += 1;
      }
      return count;
    };

    expect(ink('glyph:U+0020')).toBe(0);
    expect(ink('glyph:U+0041')).toBeGreaterThan(0);
    expect(ink('glyph:U+00E0')).toBeGreaterThan(ink('glyph:U+0061'));
  });

  it('gives each ramp a strip of its shades, darkest first', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const name of RAMP_NAMES) {
      const buffer = entries.get(`ramp:${name}`);
      expect(buffer?.width).toBe(RAMP_SHADES * 7 + (RAMP_SHADES - 1));
      expect(buffer?.height).toBe(7);
      if (buffer === undefined) throw new Error(`no catalogue entry ramp:${name}`);

      expect(pixelAt(buffer, 0, 0)).toEqual(RAMPS[name][0]);
      expect(pixelAt(buffer, buffer.width - 1, 0)).toEqual(RAMPS[name][RAMP_SHADES - 1]);
    }
  });
});

describe('the catalogue plate', () => {
  it('is the size its sections add up to, on the neutral background', () => {
    const plate = cataloguePlate();

    expect(plate.width).toBe(PLATE_WIDTH);
    expect(plate.height).toBe(PLATE_HEIGHT);
    for (const [x, y] of [
      [0, 0],
      [plate.width - 1, plate.height - 1],
      [plate.width - 1, 0],
    ]) {
      expect(pixelAt(plate, x ?? 0, y ?? 0)).toEqual(PLATE_BACKGROUND);
    }
  });

  it('places every glyph entry in its cell of the grid, pixel for pixel', () => {
    const plate = cataloguePlate();
    const glyphs = catalogue().slice(0, GLYPHS.length);
    let checked = 0;

    for (let index = 0; index < glyphs.length; index += 1) {
      const entry = glyphs[index];
      if (entry === undefined) continue;

      const cellX = PLATE_PADDING + (index % GLYPH_GRID_COLUMNS) * CELL_WIDTH;
      const cellY = PLATE_PADDING + HEADING_HEIGHT + Math.floor(index / GLYPH_GRID_COLUMNS) * CELL_HEIGHT;

      for (let y = 0; y < entry.buffer.height; y += 1) {
        for (let x = 0; x < entry.buffer.width; x += 1) {
          const entryPixel = pixelAt(entry.buffer, x, y);
          const platePixel = pixelAt(plate, cellX + x, cellY + y);
          const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
          expect(platePixel, `${entry.name} at (${String(x)}, ${String(y)})`).toEqual(expected);
          checked += 1;
        }
      }
    }

    expect(checked).toBe(glyphs.length * GLYPH_WIDTH * LINE_HEIGHT);
  });
});
