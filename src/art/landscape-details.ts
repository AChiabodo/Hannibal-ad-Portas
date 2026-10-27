/** Small procedural landscape elements, using the same palette as the theatre. */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, type PixelBuffer } from './pixel-buffer.ts';

type LandscapeSeason = 'spring' | 'summer' | 'autumn' | 'winter';
type LandscapeKind = 'tree' | 'rock';
const cache = new Map<string, PixelBuffer>();

export function landscapeDetail(kind: LandscapeKind, season: LandscapeSeason, variant: number): PixelBuffer {
  const shape = Math.abs(variant % 3);
  const key = `${kind}:${season}:${String(shape)}`;
  const previous = cache.get(key);
  if (previous !== undefined) return previous;
  const buffer = createPixelBuffer(10, 11);
  const stone = shadeAt(RAMPS.stone, 4);
  if (kind === 'rock') {
    fillRect(buffer, 2, 6, 6 + (shape % 2), 3, stone);
    fillRect(buffer, 3, 5, 4, 1, stone);
    if (season === 'winter') fillRect(buffer, 3, 5, 4, 1, shadeAt(RAMPS.stone, 6));
  } else {
    fillRect(buffer, 4, 7, 2, 4, shadeAt(RAMPS.bronze, 2));
    const foliage = season === 'autumn' ? shadeAt(RAMPS.bronze, 4) : shadeAt(RAMPS.olive, 3);
    fillRect(buffer, 2, 3 + shape % 2, 6, 5, foliage);
    fillRect(buffer, 3 + shape % 2, 1, 4, 3, foliage);
    fillRect(buffer, 3, 3, 2, 2, season === 'winter' ? shadeAt(RAMPS.stone, 6) : shadeAt(RAMPS.olive, 4));
    if (season === 'winter') fillRect(buffer, 5, 5, 2, 1, shadeAt(RAMPS.stone, 6));
  }
  cache.set(key, buffer);
  return buffer;
}
