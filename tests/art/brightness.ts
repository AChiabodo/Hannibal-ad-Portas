/**
 * Brightness, as the tests that judge contrast measure it.
 *
 * Two tests now ask the same question of two different artefacts — *how much
 * brightness does this picture span, and how hard does it flicker from one pixel to
 * the next?* — of a terrain tile (`terrain.test.ts`), of a resource marker
 * (`nodes.test.ts`) and of a separation specimen (`separation.test.ts`). The answer
 * has to be the same number in all three or the claims cannot be compared, so the
 * arithmetic lives here rather than three times beside its callers.
 *
 * These live beside the tests rather than in `src/art/` because they are not art:
 * the library draws pixels and never asks how bright they are. Contrast is the
 * judgement the ticket makes about the drawing, and a judgement is what a test is
 * for. `luminance` is the one non-obvious number here — the perceptual weights, so
 * "brighter" means what an eye means by it rather than what a channel sum means.
 */

import { pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';

/** The luminance of a colour: what the eye reads as "how bright", and what a contrast is measured in. */
export function luminance(colour: readonly number[]): number {
  return 0.2126 * (colour[0] ?? 0) + 0.7152 * (colour[1] ?? 0) + 0.0722 * (colour[2] ?? 0);
}

/** A region of a buffer, in its own pixels: the default is the whole thing. */
export interface Region {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The range of brightness a buffer's opaque pixels cover, and how many of them there
 * are.
 *
 * The range is what a shape is seen by: a picture whose pixels all sit within a few
 * levels of each other is a flat field whatever colours it uses, and one that spans a
 * hundred is something the eye finds.
 */
export function brightness(
  buffer: PixelBuffer,
  region: Region = { x: 0, y: 0, width: buffer.width, height: buffer.height },
): { readonly low: number; readonly high: number; readonly inked: number } {
  let low = Number.POSITIVE_INFINITY;
  let high = Number.NEGATIVE_INFINITY;
  let inked = 0;

  for (let y = region.y; y < region.y + region.height; y += 1) {
    for (let x = region.x; x < region.x + region.width; x += 1) {
      const colour = pixelAt(buffer, x, y);
      if (colour[3] === 0) continue;

      inked += 1;
      low = Math.min(low, luminance(colour));
      high = Math.max(high, luminance(colour));
    }
  }

  return { low, high, inked };
}

/** The brightness spread a buffer covers: the one number a contrast claim is stated in. */
export function spread(buffer: PixelBuffer, region?: Region): number {
  const { low, high } = brightness(buffer, region);

  return high - low;
}
