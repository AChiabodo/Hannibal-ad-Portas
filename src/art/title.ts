/**
 * The game page's first pixels: a title plate generated like everything else.
 *
 * B2 is the ticket that puts something on the screen, and what it puts there is
 * the smallest honest thing: the game's name, drawn in the generated font on the
 * generated palette, through the same `PixelBuffer` → texture → camera path the
 * map of B3 and the HUD of B7 will travel. It is not a menu — nothing here is
 * clickable and no Match exists yet — and B3 replaces it with the theatre.
 *
 * The Italian on it is a placeholder in the same sense `main.ts` says: player
 * text belongs in the string table with its English fallback path (PLAN §2.4),
 * which B7 builds. Until then the words are literals beside the pixels they
 * become.
 */

import { drawText, measureText, textHeight } from './font.ts';
import { BASE, RAMPS, shadeAt } from './palette.ts';
import { type PixelBuffer, createPixelBuffer, fillRect } from './pixel-buffer.ts';

/** The name of the game, as the page prints it. */
export const TITLE_TEXT = 'SPQR';

/** The subtitle, which is the war rather than the republic. */
export const SUBTITLE_TEXT = 'Hannibal ad Portas';

/** The year the Match begins, as the page prints it. */
export const DATE_TEXT = 'Anno 218 a.C.';

/**
 * The title's magnification.
 *
 * Four is a whole number of pixels per pixel, which is the only kind of
 * magnification pixel art has: the plate is drawn at four to one and the camera
 * shows it at one to one, so the letters on screen are as crisp as their
 * letterforms are, and the large-numeral path the resource readout needs (PLAN
 * §4) is the path the title already takes.
 */
export const TITLE_SCALE = 4;

/** Blank margin around the plate, in pixels. */
const PADDING = 6;

/** Air between one line of the plate and the next. */
const LINE_SPACING = 4;

/** The thickness of the rule under the title, in pixels. */
const RULE_HEIGHT = 1;

/**
 * The title plate: the name large, a rule, the war and the year — the whole of
 * the first screen, as one buffer.
 *
 * Every position is an integer and nothing is centred by half of anything: a
 * line's left edge is `⌊(width − how wide it is) / 2⌋`, which is a whole pixel
 * even when the leftover is odd.
 */
export function titlePlate(): PixelBuffer {
  const titleWidth = measureText(TITLE_TEXT, TITLE_SCALE);
  const subtitleWidth = measureText(SUBTITLE_TEXT);
  const dateWidth = measureText(DATE_TEXT);
  const width = PADDING * 2 + Math.max(titleWidth, subtitleWidth, dateWidth);

  const height =
    PADDING +
    textHeight(TITLE_TEXT, TITLE_SCALE) +
    LINE_SPACING +
    RULE_HEIGHT +
    LINE_SPACING +
    textHeight(SUBTITLE_TEXT) +
    LINE_SPACING +
    textHeight(DATE_TEXT) +
    PADDING;

  const plate = createPixelBuffer(width, height, BASE.night);

  let y = PADDING;
  drawText(plate, TITLE_TEXT, centred(width, titleWidth), y, BASE.parchment, TITLE_SCALE);
  y += textHeight(TITLE_TEXT, TITLE_SCALE) + LINE_SPACING;

  fillRect(plate, PADDING, y, width - PADDING * 2, RULE_HEIGHT, shadeAt(RAMPS.bronze, 2));
  y += RULE_HEIGHT + LINE_SPACING;

  drawText(plate, SUBTITLE_TEXT, centred(width, subtitleWidth), y, shadeAt(RAMPS.bronze, 5));
  y += textHeight(SUBTITLE_TEXT) + LINE_SPACING;

  drawText(plate, DATE_TEXT, centred(width, dateWidth), y, shadeAt(RAMPS.stone, 4));

  return plate;
}

/** The left edge of a line of text centred in a plate of the given width. */
function centred(plateWidth: number, textWidth: number): number {
  return Math.floor((plateWidth - textWidth) / 2);
}
