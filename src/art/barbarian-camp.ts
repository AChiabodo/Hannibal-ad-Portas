/** A small neutral encampment, drawn from the same palette as the theatre. */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, setPixel, type PixelBuffer } from './pixel-buffer.ts';

/** Each camp occupies two tiles, much less than an insediamento minore. */
export const BARBARIAN_CAMP_SIZE = 32;

/** Three arrangements of tents and a central fire, with no faction colours. */
export function barbarianCampSprite(variant: number, condition: 'standing' | 'ruin' = 'standing'): PixelBuffer {
  if (!Number.isInteger(variant) || variant < 0 || variant > 2) {
    throw new RangeError('barbarian camp variant must be 0, 1 or 2');
  }
  const image = createPixelBuffer(BARBARIAN_CAMP_SIZE, BARBARIAN_CAMP_SIZE);
  if (condition === 'ruin') {
    const charcoal = shadeAt(RAMPS.stone, 1);
    const debris = shadeAt(RAMPS.bronze, 2);
    fillRect(image, 5, 19, 10, 2, charcoal);
    fillRect(image, 18, 9, 8, 2, charcoal);
    fillRect(image, 11, 22, 2, 5, debris);
    fillRect(image, 20, 11, 2, 6, debris);
    fillRect(image, 14, 14, 5, 3, charcoal);
    return image;
  }
  const positions = [
    [[3, 6], [20, 8], [10, 19]],
    [[4, 4], [17, 5], [19, 19]],
    [[2, 10], [14, 3], [17, 18]],
  ] as const;
  const outline = shadeAt(RAMPS.stone, 0);
  const hide = shadeAt(RAMPS.bronze, 5);
  const shadow = shadeAt(RAMPS.bronze, 2);
  for (const [x, y] of positions[variant]!) {
    for (let row = 0; row < 7; row += 1) {
      fillRect(image, x + 6 - row, y + row, row * 2 + 1, 1, row === 0 ? outline : hide);
    }
    fillRect(image, x, y + 7, 13, 2, outline);
    fillRect(image, x + 5, y + 5, 3, 4, shadow);
    setPixel(image, x + 6, y + 1, shadeAt(RAMPS.bronze, 6));
  }
  // The hearth is deliberately separate from any army or settlement standard.
  fillRect(image, 14, 14, 5, 3, outline);
  fillRect(image, 15, 13, 3, 3, shadeAt(RAMPS.blood, 5));
  setPixel(image, 16, 12, shadeAt(RAMPS.bronze, 6));
  return image;
}
