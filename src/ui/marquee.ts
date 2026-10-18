/**
 * The box a Player drags to select with (ticket C2).
 *
 * Box selection is a gesture, and a gesture without feedback is a gesture a
 * Player is not sure they made: the rectangle has to be on screen while the
 * mouse is down, and the moment it is released it has done its job and must go.
 * So it is the one piece of the interface with a lifetime measured in a drag
 * rather than in a Match.
 *
 * It is drawn as a `PixelBuffer` like everything else (ADR-0002): a one-pixel
 * outline of a bright parchment, transparent inside so the theatre shows
 * through, composed at the size the drag currently is. That is small work — a
 * box is at most a screen — and it keeps the page free of a second drawing path
 * that the pixel hashes would not see.
 */
import { RAMPS, shadeAt } from '../art/palette.ts';
import { createPixelBuffer, fillRect, type PixelBuffer, type Rgba } from '../art/pixel-buffer.ts';

/** The ink the box is drawn in: the brightest parchment, which reads over grass and over fog. */
export const MARQUEE_INK: Rgba = shadeAt(RAMPS.parchment, 6);

/**
 * The outline of a drag's box.
 *
 * One pixel wide, and with nothing inside it: a filled box would hide the men
 * the Player is selecting.
 *
 * @throws RangeError when the size is not a whole number of pixels, or is not
 *   positive: a box of nothing is not a box.
 */
export function marquee(width: number, height: number): PixelBuffer {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`a marquee needs a whole positive size, got ${String(width)}×${String(height)}`);
  }

  const box = createPixelBuffer(width, height);

  fillRect(box, 0, 0, width, 1, MARQUEE_INK);
  fillRect(box, 0, height - 1, width, 1, MARQUEE_INK);
  fillRect(box, 0, 0, 1, height, MARQUEE_INK);
  fillRect(box, width - 1, 0, 1, height, MARQUEE_INK);

  return box;
}
