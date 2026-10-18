/**
 * The bitmap font (ticket B2).
 *
 * Two things are worth testing here and they are not the same: that the table is
 * complete and shaped like a font — every glyph the UI needs, every row exactly
 * five pixels — and that a glyph comes out of the drawing code looking like the
 * glyph. The second is asserted as a picture, written out in the test rather
 * than computed from the same mask the code reads, so a flipped bit fails.
 */
import { describe, expect, it } from 'vitest';
import { createPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import {
  ACCENTS,
  ACCENT_HEIGHT,
  GLYPHS,
  GLYPH_HEIGHT,
  GLYPH_WIDTH,
  LINE_HEIGHT,
  drawText,
  glyphFor,
  hasGlyph,
  measureText,
  textHeight,
} from '../../src/art/font';

const INK = [0, 0, 0, 255] as const;

/** The characters the Italian UI writes with an accent. */
const ACCENTED = ['à', 'è', 'é', 'ì', 'ò', 'ù', 'À', 'È', 'É', 'Ì', 'Ò', 'Ù'];

/** The printable ASCII range: space through tilde, which is what a HUD may print. */
const ASCII = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCodePoint(0x20 + index));

/** A buffer as rows of `#` and `.`, which is how a glyph is meant to be read. */
function picture(buffer: PixelBuffer): string[] {
  return Array.from({ length: buffer.height }, (_, y) =>
    Array.from({ length: buffer.width }, (_, x) => (pixelAt(buffer, x, y)[3] === 0 ? '.' : '#')).join(''),
  );
}

/** One glyph drawn on its own, at the top-left of the buffer. */
function drawOne(character: string, height = LINE_HEIGHT, scale = 1): PixelBuffer {
  const buffer = createPixelBuffer(GLYPH_WIDTH * scale, height);
  drawText(buffer, character, 0, 0, INK, scale);

  return buffer;
}

describe('the glyph set', () => {
  it('covers every printable ASCII character and every accented vowel Italian writes', () => {
    for (const character of [...ASCII, ...ACCENTED]) {
      expect(hasGlyph(character), character).toBe(true);
    }

    expect(GLYPHS.length).toBe(ASCII.length + ACCENTED.length);
    expect(new Set(GLYPHS.map((glyph) => glyph.character)).size).toBe(GLYPHS.length);
  });

  it('is in code-point order, so the catalogue reads the way a table does', () => {
    const points = GLYPHS.map((glyph) => glyph.character.codePointAt(0) ?? 0);

    expect([...points].sort((left, right) => left - right)).toEqual(points);
  });

  it('refuses a character it has no glyph for, rather than drawing a hole', () => {
    for (const character of ['ä', '€', '’', '—']) {
      expect(hasGlyph(character)).toBe(false);
      expect(() => glyphFor(character)).toThrow(RangeError);
    }
    expect(() => glyphFor('ab')).toThrow(RangeError);

    const buffer = createPixelBuffer(GLYPH_WIDTH, LINE_HEIGHT);
    expect(() => drawText(buffer, 'sì — no', 0, 0, INK)).toThrow(/—/);
  });

  it('is a table of five-pixel rows: every letterform is seven of them, every accent mark two', () => {
    for (const glyph of GLYPHS) {
      expect(glyph.letterform.length, glyph.character).toBe(GLYPH_HEIGHT);
      for (const row of glyph.letterform) {
        expect(Number.isInteger(row), glyph.character).toBe(true);
        expect(row, glyph.character).toBeGreaterThanOrEqual(0);
        expect(row, glyph.character).toBeLessThan(1 << GLYPH_WIDTH);
      }
      if (glyph.accent !== null) {
        expect(glyph.accent in ACCENTS).toBe(true);
      }
    }

    for (const mark of Object.values(ACCENTS)) {
      expect(mark.length).toBe(ACCENT_HEIGHT);
      for (const row of mark) {
        expect(row).toBeLessThan(1 << GLYPH_WIDTH);
      }
    }
  });
});

describe('drawing a glyph', () => {
  it('paints an unaccented letter inside its cell, under the empty accent band', () => {
    expect(picture(drawOne('I'))).toEqual([
      '.....',
      '.....',
      '.###.',
      '..#..',
      '..#..',
      '..#..',
      '..#..',
      '..#..',
      '.###.',
    ]);
  });

  it('paints an accented letter as the same letter with a mark in the band above it', () => {
    expect(picture(drawOne('è'))).toEqual([
      '.#...',
      '..#..',
      '.....',
      '.....',
      '.###.',
      '#...#',
      '#####',
      '#....',
      '.###.',
    ]);
  });

  it('tells the two accents apart by direction, not only by the letter under them', () => {
    const grave = picture(drawOne('è'));
    const acute = picture(drawOne('é'));

    expect(grave.slice(2)).toEqual(acute.slice(2));
    expect(grave.slice(0, 2)).toEqual(['.#...', '..#..']);
    expect(acute.slice(0, 2)).toEqual(['..#..', '.#...']);
  });

  it('keeps the baseline of an accented letter and its plain twin in the same place', () => {
    const plain = picture(drawOne('a'));
    const accented = picture(drawOne('à'));

    expect(accented.slice(ACCENT_HEIGHT)).toEqual(plain.slice(ACCENT_HEIGHT));
    expect(accented.slice(0, ACCENT_HEIGHT)).not.toEqual(plain.slice(0, ACCENT_HEIGHT));
  });

  it('magnifies by whole pixels, so a large numeral is the numeral and not a blur', () => {
    const buffer = createPixelBuffer(GLYPH_WIDTH * 2, LINE_HEIGHT * 2);
    drawText(buffer, 'I', 0, 0, INK, 2);

    // The top bar of the `I`, two pixels to a pixel, at four rows below the doubled band.
    for (const x of [2, 3, 4, 5, 6, 7]) {
      for (const y of [4, 5]) {
        expect(pixelAt(buffer, x, y)).toEqual([0, 0, 0, 255]);
      }
    }
    expect(pixelAt(buffer, 1, 4)[3]).toBe(0);
    expect(pixelAt(buffer, 8, 4)[3]).toBe(0);
  });
});

describe('drawing a string', () => {
  it('advances one cell per glyph, which is what makes a column of numbers line up', () => {
    const buffer = createPixelBuffer(GLYPH_WIDTH * 3, LINE_HEIGHT);
    drawText(buffer, '1.0', 0, 0, INK);

    expect(measureText('1.0')).toBe(3 * 6);
    // `1` starts at x 0, `.` at x 6 and `0` at x 12, each with one column of air
    // after it: the glyphs are six pixels apart, not five.
    expect(pixelAt(buffer, 2, 2)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(buffer, 8, 8)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(buffer, 13, 8)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(buffer, 4, 8)[3]).toBe(0);
    expect(pixelAt(buffer, 5, 8)[3]).toBe(0);
    expect(pixelAt(buffer, 11, 8)[3]).toBe(0);
  });

  it('starts a new line below the last one, and measures the longest of them', () => {
    const buffer = createPixelBuffer(GLYPH_WIDTH * 4, LINE_HEIGHT * 2 + 1);
    drawText(buffer, 'ab\nabcd', 0, 0, INK);

    expect(measureText('a\nabcd')).toBe(24);
    expect(textHeight('a')).toBe(LINE_HEIGHT);
    expect(textHeight('a\nb')).toBe(LINE_HEIGHT * 2 + 1);
    expect(measureText('')).toBe(0);
    expect(textHeight('')).toBe(0);
    // The second line box starts at row 10: its accent band is empty, and the
    // `a` under it starts three rows further down.
    expect(pixelAt(buffer, 1, 10)[3]).toBe(0);
    expect(pixelAt(buffer, 1, 12)[3]).toBe(0);
    expect(pixelAt(buffer, 1, 14)).toEqual([0, 0, 0, 255]);
  });

  it('clips at the edge of the buffer instead of refusing to draw', () => {
    const buffer = createPixelBuffer(GLYPH_WIDTH, LINE_HEIGHT);
    drawText(buffer, 'H', -3, -2, INK);

    expect(buffer.height).toBe(LINE_HEIGHT);
    expect(pixelAt(buffer, 0, 0)[3]).toBe(0);
  });

  it('refuses a scale that is not a whole magnification', () => {
    const buffer = createPixelBuffer(GLYPH_WIDTH, LINE_HEIGHT);

    for (const scale of [0, -1, 1.5]) {
      expect(() => drawText(buffer, 'a', 0, 0, INK, scale)).toThrow(RangeError);
      expect(() => measureText('a', scale)).toThrow(RangeError);
      expect(() => textHeight('a', scale)).toThrow(RangeError);
    }
  });
});
