/**
 * What the Atelier page is made of, as arithmetic (ticket B2).
 *
 * The page shows the whole catalogue at several zoom levels, and "several" is
 * data: a list of magnifications, each of which becomes one column with a caption
 * over it. Keeping the layout as a pure function here rather than as positioning
 * code inside the PixiJS layer buys two things worth having — a unit test can
 * assert the columns do not overlap and that the canvas is exactly big enough for
 * them, and the page's own geometry is available to an agent as data, through the
 * debug hooks, without reading pixels to find out where things are.
 *
 * The zoom levels are magnifications the camera has: whole numbers, and within
 * the range `camera.ts` allows, because a column the camera could never zoom to
 * is a column nobody can reproduce in the game.
 */

import { LINE_HEIGHT } from '../art/font.ts';
import { MAX_ZOOM, MIN_ZOOM } from './camera.ts';

/**
 * The magnifications the Atelier renders the catalogue at.
 *
 * One to one is the size the art is authored at; two is what a HUD reads like;
 * four is where a one-pixel mistake stops being invisible. They are the three
 * questions a human or an agent asks of generated art, and they are all rendered
 * at once so the answer does not depend on clicking anything.
 */
export const ATELIER_ZOOMS: readonly number[] = [1, 2, 4];

/** Blank margin around the page's contents, in pixels. */
const PADDING = 8;

/** Air between one column and the next. */
const COLUMN_GAP = 8;

/** Air between a caption and the plate it names. */
const CAPTION_GAP = 4;

/** The height of a caption's line box. */
const CAPTION_HEIGHT = LINE_HEIGHT;

/** One column of the page: the catalogue at one magnification, and its caption. */
export interface AtelierSection {
  /** Screen pixels per catalogue pixel. */
  readonly zoom: number;
  /** What the caption says, e.g. `zoom 4`. */
  readonly label: string;
  /** Caption's left edge, in page pixels. */
  readonly labelX: number;
  /** Caption's top edge, in page pixels. */
  readonly labelY: number;
  /** Plate's left edge, in page pixels. */
  readonly x: number;
  /** Plate's top edge, in page pixels. */
  readonly y: number;
  /** Plate's width on the page: its own width times the zoom. */
  readonly width: number;
  /** Plate's height on the page: its own height times the zoom. */
  readonly height: number;
}

/** The page: its size, and the columns in it, left to right. */
export interface AtelierLayout {
  readonly width: number;
  readonly height: number;
  readonly sections: readonly AtelierSection[];
}

/** What the layout needs of the plate: how big the catalogue is. */
export interface PlateSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Lays the catalogue out as one column per magnification.
 *
 * Columns stand left to right, each a plate scaled by its zoom with a caption
 * over it; the page is exactly as wide and as tall as they need, so nothing is
 * ever clipped and nothing is ever an arbitrary canvas size someone guessed.
 *
 * @throws RangeError when the plate has no size, or a zoom is not a whole
 *   magnification.
 */
export function atelierLayout(plate: PlateSize, zooms: readonly number[] = ATELIER_ZOOMS): AtelierLayout {
  if (!Number.isInteger(plate.width) || plate.width < 1 || !Number.isInteger(plate.height) || plate.height < 1) {
    throw new RangeError(
      `a plate must have whole pixel dimensions, got ${String(plate.width)}×${String(plate.height)}`,
    );
  }
  if (zooms.length === 0) {
    throw new RangeError('the atelier needs at least one zoom level to show');
  }

  let x = PADDING;
  let tallest = 0;
  const sections: AtelierSection[] = [];

  for (const zoom of zooms) {
    if (!Number.isInteger(zoom) || zoom < MIN_ZOOM || zoom > MAX_ZOOM) {
      throw new RangeError(
        `an atelier zoom must be a whole magnification in [${String(MIN_ZOOM)}, ${String(MAX_ZOOM)}], got ${String(zoom)}`,
      );
    }

    const width = plate.width * zoom;
    const height = plate.height * zoom;
    sections.push({
      zoom,
      label: `zoom ${String(zoom)}`,
      labelX: x,
      labelY: PADDING,
      x,
      y: PADDING + CAPTION_HEIGHT + CAPTION_GAP,
      width,
      height,
    });

    x += width + COLUMN_GAP;
    tallest = Math.max(tallest, height);
  }

  return {
    width: x - COLUMN_GAP + PADDING,
    height: PADDING + CAPTION_HEIGHT + CAPTION_GAP + tallest + PADDING,
    sections,
  };
}
