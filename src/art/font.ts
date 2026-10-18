/**
 * The bitmap font: every glyph the Italian UI needs, drawn in code (ticket B2, PLAN §4).
 *
 * A font is the asset that is easiest to notice too late: the constraint says no
 * font file may be committed (ADR-0002), so the HUD needs a glyph set that lives
 * in the source and is drawn by the same pipeline as every other pixel. This is
 * that glyph set, and it is data rather than a renderer: a letterform is seven
 * rows of five pixels, each row a number, and the drawing functions walk them.
 *
 * ## The cell
 *
 * A letterform is five pixels wide and seven tall, which is the size the plan
 * fixes for the HUD. Caps and ascenders fill all seven rows; x-height letters
 * start on the third, and a letter with a tail puts it in the last row rather
 * than below the cell — a 5×7 cell has no below.
 *
 * Above the cell there is a two-row **accent band**, empty for an unaccented
 * letter and carrying the mark for an accented one. The band is why the font can
 * print `perché` and `città`: an accent drawn inside the seven rows would have to
 * eat the top of the letter it sits on, and Italian is a language that accents
 * vowels. The cell is exactly as tall as the plan says; the line box is
 * `ACCENT_HEIGHT + GLYPH_HEIGHT` tall, and every glyph reserves the band whether
 * it uses it or not, so a line of `à` and a line of `a` share one baseline.
 *
 * ## The coverage
 *
 * Every printable ASCII character, 0x20 to 0x7E, plus the twelve accented
 * vowels Italian writes: `à è é ì ò ù` and their capitals. Anything else — a
 * typographic apostrophe, a degree sign — has no glyph, and `glyphFor` refuses it
 * by name instead of drawing a hole. Adding a character is adding a letterform;
 * that is the whole cost, and the catalogue renders it the moment it exists.
 *
 * ## Reading the table
 *
 * A row is a 5-bit mask whose **leftmost pixel is the high bit**: `0b01110` is
 * `.###.`. The letterforms are spaced one pixel apart by `GLYPH_ADVANCE`, so the
 * font is monospaced, which is what a HUD made of columns of numbers wants.
 * Drawing is `drawText` for a string and `drawGlyph` for one cell; both take an
 * integer `scale`, so the same glyph set serves the HUD and the large numerals
 * the resource readout needs (§4).
 */

import { TRANSPARENT, type PixelBuffer, type Rgba, createPixelBuffer, fillRect } from './pixel-buffer.ts';

/** A letterform's width in pixels: five, as the plan fixes the HUD font. */
export const GLYPH_WIDTH = 5;

/** A letterform's height in pixels: seven, as the plan fixes the HUD font. */
export const GLYPH_HEIGHT = 7;

/** How far the cursor moves after a glyph: the letterform plus one pixel of air. */
export const GLYPH_ADVANCE = GLYPH_WIDTH + 1;

/** The accent band above the letterform: two rows, enough for a mark that slants. */
export const ACCENT_HEIGHT = 2;

/** One line box: the accent band over the letterform. */
export const LINE_HEIGHT = ACCENT_HEIGHT + GLYPH_HEIGHT;

/** Blank rows between two lines of text. */
export const LINE_GAP = 1;

/** One letterform: seven rows, each a 5-bit mask, leftmost pixel in bit 4. */
type Letterform = readonly number[];

/** The letterform of `i`, whose dot is part of the letter. */
const DOTTED_I: Letterform = [0b00100, 0b00000, 0b00100, 0b01100, 0b00100, 0b00100, 0b01110];

/**
 * `i` without its dot, for `ì`: the accent sits in the band, and a dot under it
 * would read as two marks stacked on one stem.
 */
const DOTLESS_I: Letterform = [0b00000, 0b00000, 0b00100, 0b01100, 0b00100, 0b00100, 0b01110];

/**
 * The unaccented letterforms, keyed by character.
 *
 * Every row is five pixels wide and every letterform is seven rows tall; the
 * structural test in `tests/art/font.test.ts` holds the table to that, so a row
 * that is a pixel too long is a failing build rather than a glyph with a bite
 * out of it.
 */
const LETTERFORMS: Readonly<Record<string, Letterform>> = {
  ' ': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '!': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00000, 0b00100],
  '"': [0b01010, 0b01010, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '#': [0b01010, 0b01010, 0b11111, 0b01010, 0b11111, 0b01010, 0b01010],
  $: [0b00100, 0b01111, 0b10100, 0b01110, 0b00101, 0b11110, 0b00100],
  '%': [0b11000, 0b11001, 0b00010, 0b00100, 0b01000, 0b10011, 0b00011],
  '&': [0b01100, 0b10010, 0b10100, 0b01000, 0b10101, 0b10010, 0b01101],
  "'": [0b00100, 0b00100, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  '(': [0b00010, 0b00100, 0b01000, 0b01000, 0b01000, 0b00100, 0b00010],
  ')': [0b01000, 0b00100, 0b00010, 0b00010, 0b00010, 0b00100, 0b01000],
  '*': [0b00000, 0b00100, 0b10101, 0b01110, 0b10101, 0b00100, 0b00000],
  '+': [0b00000, 0b00100, 0b00100, 0b11111, 0b00100, 0b00100, 0b00000],
  ',': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  '-': [0b00000, 0b00000, 0b00000, 0b11111, 0b00000, 0b00000, 0b00000],
  '.': [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00100],
  '/': [0b00001, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b10000],
  0: [0b01110, 0b10001, 0b10011, 0b10101, 0b11001, 0b10001, 0b01110],
  1: [0b00100, 0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  2: [0b01110, 0b10001, 0b00001, 0b00010, 0b00100, 0b01000, 0b11111],
  3: [0b11111, 0b00010, 0b00100, 0b00010, 0b00001, 0b10001, 0b01110],
  4: [0b00010, 0b00110, 0b01010, 0b10010, 0b11111, 0b00010, 0b00010],
  5: [0b11111, 0b10000, 0b11110, 0b00001, 0b00001, 0b10001, 0b01110],
  6: [0b00110, 0b01000, 0b10000, 0b11110, 0b10001, 0b10001, 0b01110],
  7: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b01000, 0b01000],
  8: [0b01110, 0b10001, 0b10001, 0b01110, 0b10001, 0b10001, 0b01110],
  9: [0b01110, 0b10001, 0b10001, 0b01111, 0b00001, 0b00010, 0b01100],
  ':': [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b00000],
  ';': [0b00000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00100, 0b01000],
  '<': [0b00010, 0b00100, 0b01000, 0b10000, 0b01000, 0b00100, 0b00010],
  '=': [0b00000, 0b00000, 0b11111, 0b00000, 0b11111, 0b00000, 0b00000],
  '>': [0b01000, 0b00100, 0b00010, 0b00001, 0b00010, 0b00100, 0b01000],
  '?': [0b01110, 0b10001, 0b00001, 0b00110, 0b00100, 0b00000, 0b00100],
  '@': [0b01110, 0b10001, 0b10111, 0b10101, 0b10111, 0b10000, 0b01110],
  A: [0b01110, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  B: [0b11110, 0b10001, 0b10001, 0b11110, 0b10001, 0b10001, 0b11110],
  C: [0b01110, 0b10001, 0b10000, 0b10000, 0b10000, 0b10001, 0b01110],
  D: [0b11100, 0b10010, 0b10001, 0b10001, 0b10001, 0b10010, 0b11100],
  E: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b11111],
  F: [0b11111, 0b10000, 0b10000, 0b11110, 0b10000, 0b10000, 0b10000],
  G: [0b01110, 0b10001, 0b10000, 0b10111, 0b10001, 0b10001, 0b01111],
  H: [0b10001, 0b10001, 0b10001, 0b11111, 0b10001, 0b10001, 0b10001],
  I: [0b01110, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  J: [0b00111, 0b00010, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  K: [0b10001, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010, 0b10001],
  L: [0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b10000, 0b11111],
  M: [0b10001, 0b11011, 0b10101, 0b10101, 0b10001, 0b10001, 0b10001],
  N: [0b10001, 0b11001, 0b10101, 0b10011, 0b10001, 0b10001, 0b10001],
  O: [0b01110, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  P: [0b11110, 0b10001, 0b10001, 0b11110, 0b10000, 0b10000, 0b10000],
  Q: [0b01110, 0b10001, 0b10001, 0b10001, 0b10101, 0b10010, 0b01101],
  R: [0b11110, 0b10001, 0b10001, 0b11110, 0b10100, 0b10010, 0b10001],
  S: [0b01111, 0b10000, 0b10000, 0b01110, 0b00001, 0b00001, 0b11110],
  T: [0b11111, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  U: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01110],
  V: [0b10001, 0b10001, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  W: [0b10001, 0b10001, 0b10001, 0b10101, 0b10101, 0b11011, 0b10001],
  X: [0b10001, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001, 0b10001],
  Y: [0b10001, 0b10001, 0b01010, 0b00100, 0b00100, 0b00100, 0b00100],
  Z: [0b11111, 0b00001, 0b00010, 0b00100, 0b01000, 0b10000, 0b11111],
  '[': [0b01110, 0b01000, 0b01000, 0b01000, 0b01000, 0b01000, 0b01110],
  '\\': [0b10000, 0b10000, 0b01000, 0b00100, 0b00010, 0b00001, 0b00001],
  ']': [0b01110, 0b00010, 0b00010, 0b00010, 0b00010, 0b00010, 0b01110],
  '^': [0b00100, 0b01010, 0b10001, 0b00000, 0b00000, 0b00000, 0b00000],
  _: [0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111],
  '`': [0b01000, 0b00100, 0b00000, 0b00000, 0b00000, 0b00000, 0b00000],
  a: [0b00000, 0b00000, 0b01110, 0b00001, 0b01111, 0b10001, 0b01111],
  b: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b11110],
  c: [0b00000, 0b00000, 0b01110, 0b10001, 0b10000, 0b10001, 0b01110],
  d: [0b00001, 0b00001, 0b01111, 0b10001, 0b10001, 0b10001, 0b01111],
  e: [0b00000, 0b00000, 0b01110, 0b10001, 0b11111, 0b10000, 0b01110],
  f: [0b00110, 0b00100, 0b00100, 0b01110, 0b00100, 0b00100, 0b00100],
  g: [0b00000, 0b00000, 0b01111, 0b10001, 0b01111, 0b00001, 0b01110],
  h: [0b10000, 0b10000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  i: DOTTED_I,
  j: [0b00010, 0b00000, 0b00010, 0b00010, 0b00010, 0b10010, 0b01100],
  k: [0b10000, 0b10000, 0b10010, 0b10100, 0b11000, 0b10100, 0b10010],
  l: [0b01100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b01110],
  m: [0b00000, 0b00000, 0b11010, 0b10101, 0b10101, 0b10101, 0b10101],
  n: [0b00000, 0b00000, 0b11110, 0b10001, 0b10001, 0b10001, 0b10001],
  o: [0b00000, 0b00000, 0b01110, 0b10001, 0b10001, 0b10001, 0b01110],
  p: [0b00000, 0b00000, 0b11110, 0b10001, 0b11110, 0b10000, 0b10000],
  q: [0b00000, 0b00000, 0b01111, 0b10001, 0b01111, 0b00001, 0b00001],
  r: [0b00000, 0b00000, 0b01110, 0b10001, 0b10000, 0b10000, 0b10000],
  s: [0b00000, 0b00000, 0b01111, 0b10000, 0b01110, 0b00001, 0b11110],
  t: [0b01000, 0b01000, 0b11100, 0b01000, 0b01000, 0b01001, 0b00110],
  u: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b10001, 0b01111],
  v: [0b00000, 0b00000, 0b10001, 0b10001, 0b10001, 0b01010, 0b00100],
  w: [0b00000, 0b00000, 0b10001, 0b10001, 0b10101, 0b10101, 0b01010],
  x: [0b00000, 0b00000, 0b10001, 0b01010, 0b00100, 0b01010, 0b10001],
  y: [0b00000, 0b00000, 0b10001, 0b10001, 0b01111, 0b00001, 0b01110],
  z: [0b00000, 0b00000, 0b11111, 0b00010, 0b00100, 0b01000, 0b11111],
  '{': [0b00110, 0b00100, 0b00100, 0b01000, 0b00100, 0b00100, 0b00110],
  '|': [0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100, 0b00100],
  '}': [0b01100, 0b00100, 0b00100, 0b00010, 0b00100, 0b00100, 0b01100],
  '~': [0b00000, 0b00000, 0b01000, 0b10101, 0b00010, 0b00000, 0b00000],
};

/**
 * The accent marks, as the two rows of the accent band: top row first.
 *
 * A mark is one pixel per row and slants, so `à` and `é` are told apart by
 * direction and not only by the letter under them — the distinction an Italian
 * reader needs from `e` alone.
 */
export const ACCENTS = {
  /** The grave: down to the right, as in `città`. */
  grave: [0b01000, 0b00100],
  /** The acute: down to the left, as in `perché`. */
  acute: [0b00100, 0b01000],
} as const;

/** The name of an accent mark the font can draw. */
export type AccentName = keyof typeof ACCENTS;

/** One supported character: its letterform, and the accent that goes over it. */
export interface Glyph {
  readonly character: string;
  /** Seven rows of five pixels. */
  readonly letterform: Letterform;
  /** The mark in the accent band, or `null` for a letter that carries none. */
  readonly accent: AccentName | null;
}

/** The letterform of one of the unaccented characters. */
function letterformOf(character: string): Letterform {
  const letterform = LETTERFORMS[character];
  if (letterform === undefined) {
    throw new Error(`the font table has no letterform for ${JSON.stringify(character)}`);
  }

  return letterform;
}

/** An accented character: an ASCII letterform, and the mark that goes over it. */
function accented(
  character: string,
  base: string,
  accent: AccentName,
  letterform: Letterform = letterformOf(base),
): Glyph {
  return { character, letterform, accent };
}

/**
 * The accented vowels Italian writes.
 *
 * A table rather than a rule, because which vowel takes which accent is a fact
 * about the language and not a fact about the alphabet: `perché` takes the acute
 * and `città` the grave, and no formula derives that from the letter.
 */
const ACCENTED_GLYPHS: readonly Glyph[] = [
  accented('à', 'a', 'grave'),
  accented('è', 'e', 'grave'),
  accented('é', 'e', 'acute'),
  accented('ì', 'i', 'grave', DOTLESS_I),
  accented('ò', 'o', 'grave'),
  accented('ù', 'u', 'grave'),
  accented('À', 'A', 'grave'),
  accented('È', 'E', 'grave'),
  accented('É', 'E', 'acute'),
  accented('Ì', 'I', 'grave'),
  accented('Ò', 'O', 'grave'),
  accented('Ù', 'U', 'grave'),
];

/**
 * Every glyph the font draws, in code-point order.
 *
 * This is the list the Atelier renders and the list a test holds the coverage
 * to: 0x20 to 0x7E and then the accented vowels, which sort after every ASCII
 * character and so end the catalogue.
 */
export const GLYPHS: readonly Glyph[] = [...Object.values(buildLetterformGlyphs()), ...ACCENTED_GLYPHS].sort(
  (left, right) => (left.character.codePointAt(0) ?? 0) - (right.character.codePointAt(0) ?? 0),
);

/** The unaccented glyphs, one per letterform, with the character it was keyed by. */
function buildLetterformGlyphs(): readonly Glyph[] {
  return Object.entries(LETTERFORMS).map(([character, letterform]) => ({
    character,
    letterform,
    accent: null,
  }));
}

/** The glyphs by character, which is how a string is drawn. */
const GLYPHS_BY_CHARACTER = new Map(GLYPHS.map((glyph) => [glyph.character, glyph]));

/** Whether the font can draw a character. */
export function hasGlyph(character: string): boolean {
  return GLYPHS_BY_CHARACTER.has(character);
}

/**
 * The glyph for one character.
 *
 * @throws RangeError when the font has no such glyph: a missing character is a
 *   hole in the UI, and a hole is worth failing on rather than drawing blank.
 */
export function glyphFor(character: string): Glyph {
  const glyph = GLYPHS_BY_CHARACTER.get(character);
  if (glyph === undefined) {
    throw new RangeError(`the font has no glyph for ${JSON.stringify(character)}`);
  }

  return glyph;
}

/**
 * Draws one glyph into a buffer, with `x` and `y` at the top-left of its line
 * box: the accent band occupies `y` and `y + 1`, the letterform starts at
 * `y + ACCENT_HEIGHT`.
 *
 * Drawing clips at the buffer's edges, so a glyph half off a plate paints the
 * half that is on it.
 *
 * @param scale Whole-number magnification, for the large numerals of a resource
 *   readout; `1` is the HUD size.
 * @throws RangeError when the scale is not a positive integer.
 */
export function drawGlyph(
  buffer: PixelBuffer,
  glyph: Glyph,
  x: number,
  y: number,
  colour: Rgba,
  scale = 1,
): void {
  requireScale(scale);

  if (glyph.accent !== null) {
    drawRows(buffer, ACCENTS[glyph.accent], x, y, colour, scale);
  }
  drawRows(buffer, glyph.letterform, x, y + ACCENT_HEIGHT * scale, colour, scale);
}

/**
 * Draws a string into a buffer, `x` and `y` at the top-left of its first line
 * box. `\n` starts a new line `LINE_HEIGHT + LINE_GAP` rows lower, magnified by
 * the scale like everything else.
 *
 * @throws RangeError when a character has no glyph, or the scale is not a
 *   positive integer.
 */
export function drawText(
  buffer: PixelBuffer,
  text: string,
  x: number,
  y: number,
  colour: Rgba,
  scale = 1,
): void {
  requireScale(scale);

  const lineStep = (LINE_HEIGHT + LINE_GAP) * scale;
  const lines = text.split('\n');

  for (let line = 0; line < lines.length; line += 1) {
    let cursor = x;
    for (const character of lines[line] ?? '') {
      drawGlyph(buffer, glyphFor(character), cursor, y + line * lineStep, colour, scale);
      cursor += GLYPH_ADVANCE * scale;
    }
  }
}

/**
 * How wide a string is, in pixels: the longest of its lines, trailing air
 * included, so that a caller can size a plate around the text before drawing it.
 */
export function measureText(text: string, scale = 1): number {
  requireScale(scale);

  if (text === '') return 0;

  let widest = 0;
  for (const line of text.split('\n')) {
    widest = Math.max(widest, [...line].length * GLYPH_ADVANCE * scale);
  }

  return widest;
}

/**
 * How tall a string is, in pixels: every line box plus the gaps between them.
 * An empty string is nothing at all, which is what makes it composable with
 * `measureText`.
 */
export function textHeight(text: string, scale = 1): number {
  requireScale(scale);

  if (text === '') return 0;

  const lines = text.split('\n').length;
  return (lines * LINE_HEIGHT + (lines - 1) * LINE_GAP) * scale;
}

/**
 * A string on a buffer of its own, transparent everywhere the glyphs are not.
 *
 * The companion to `drawText` for a caller that wants a label as a thing rather
 * than as something painted onto a plate: a transparent buffer composites
 * anywhere, which is what makes one label reusable over two different grounds.
 *
 * @throws RangeError when a character has no glyph, or the scale is not a
 *   positive integer.
 */
export function textPlate(text: string, colour: Rgba, scale = 1): PixelBuffer {
  const buffer = createPixelBuffer(
    Math.max(1, measureText(text, scale)),
    Math.max(1, textHeight(text, scale)),
    TRANSPARENT,
  );
  drawText(buffer, text, 0, 0, colour, scale);

  return buffer;
}

/** Paints the pixels a letterform or an accent mark turns on. */
function drawRows(
  buffer: PixelBuffer,
  rows: readonly number[],
  x: number,
  y: number,
  colour: Rgba,
  scale: number,
): void {
  for (let row = 0; row < rows.length; row += 1) {
    const mask = rows[row] ?? 0;
    for (let column = 0; column < GLYPH_WIDTH; column += 1) {
      if (((mask >> (GLYPH_WIDTH - 1 - column)) & 1) === 1) {
        fillRect(buffer, x + column * scale, y + row * scale, scale, scale, colour);
      }
    }
  }
}

/** @throws RangeError when the scale is not a positive integer. */
function requireScale(scale: number): void {
  if (!Number.isInteger(scale) || scale < 1) {
    throw new RangeError(`a text scale must be a positive integer, got ${String(scale)}`);
  }
}
