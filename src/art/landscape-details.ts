/** Small procedural landscape elements, using the same palette as the theatre. */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, type PixelBuffer } from './pixel-buffer.ts';

type LandscapeSeason = 'spring' | 'summer' | 'autumn' | 'winter';
type LandscapeKind = 'tree' | 'rock' | 'bush';
const cache = new Map<string, PixelBuffer>();

export function landscapeDetail(kind: LandscapeKind, season: LandscapeSeason, variant: number): PixelBuffer {
  const shape = Math.abs(variant % 3);
  const key = `${kind}:${season}:${String(shape)}`;
  const previous = cache.get(key);
  if (previous !== undefined) return previous;
  const buffer = createPixelBuffer(10, 11);
  const winter = season === 'winter';
  const snow = shadeAt(RAMPS.stone, 6);
  const wood = shadeAt(RAMPS.bronze, 2);
  const deciduous = kind === 'tree' ? shape === 0 : shape !== 2;
  const foliage = season === 'autumn' && deciduous ? shadeAt(RAMPS.bronze, 4) : shadeAt(RAMPS.olive, 3);
  const highlight = shadeAt(RAMPS.olive, 4);
  if (kind === 'rock') {
    const stone = shadeAt(RAMPS.stone, 4);
    if (shape < 2) {
      const widths = shape === 0 ? [4, 6, 8, 7] : [2, 4, 5, 6, 6];
      const top = shape === 0 ? 5 : 4;
      widths.forEach((width, index) => fillRect(buffer, Math.floor((10 - width) / 2), top + index, width, 1, stone));
      fillRect(buffer, 3, 8, shape === 0 ? 5 : 4, 1, shadeAt(RAMPS.stone, 3));
      fillRect(buffer, 4, top, shape === 0 ? 3 : 2, 1, winter ? snow : shadeAt(RAMPS.stone, 5));
    } else {
      fillRect(buffer, 0, 7, 4, 2, stone);
      fillRect(buffer, 1, 6, 2, 1, winter ? snow : shadeAt(RAMPS.stone, 5));
      fillRect(buffer, 5, 5, 4, 4, stone);
      fillRect(buffer, 6, 4, 2, 1, winter ? snow : shadeAt(RAMPS.stone, 5));
      fillRect(buffer, 6, 8, 3, 1, shadeAt(RAMPS.stone, 3));
    }
  } else if (kind === 'bush') {
    if (winter && shape !== 2) {
      // The leafy shrubs become stems and snow-capped twigs.
      fillRect(buffer, 4, 5, 1, 5, wood);
      fillRect(buffer, 2, 6, 6, 1, wood);
      fillRect(buffer, 2, shape === 0 ? 4 : 3, 1, 4, wood);
      fillRect(buffer, 7, 4, 1, 3, wood);
      fillRect(buffer, 1, shape === 0 ? 4 : 3, 3, 1, snow);
      fillRect(buffer, 6, 4, 3, 1, snow);
    } else {
      if (shape === 0) [4, 7, 8, 6].forEach((width, index) =>
        fillRect(buffer, Math.floor((10 - width) / 2), 5 + index, width, 1, foliage));
      else if (shape === 1) {
        fillRect(buffer, 1, 5, 3, 4, foliage);
        fillRect(buffer, 5, 4, 3, 4, foliage);
        fillRect(buffer, 2, 8, 5, 2, shadeAt(RAMPS.olive, 2));
      } else {
        fillRect(buffer, 0, 7, 9, 2, shadeAt(RAMPS.olive, 3));
        fillRect(buffer, 1, 6, 3, 2, shadeAt(RAMPS.olive, 3));
        fillRect(buffer, 6, 5, 2, 3, shadeAt(RAMPS.olive, 3));
      }
      fillRect(buffer, 2, 7, 2, 1, winter ? snow : highlight);
      if (winter) fillRect(buffer, 6, 5, 2, 1, snow);
    }
  } else {
    fillRect(buffer, 4, 7, 2, 4, wood);
    if (shape === 0 && winter) {
      // Bare broadleaf branches keep their trunk and planted position.
      fillRect(buffer, 4, 3, 1, 5, wood);
      fillRect(buffer, 2, 5, 6, 1, wood);
      fillRect(buffer, 2, 3, 1, 3, wood);
      fillRect(buffer, 7, 2, 1, 4, wood);
      fillRect(buffer, 1, 3, 3, 1, snow);
      fillRect(buffer, 6, 2, 3, 1, snow);
    } else if (shape === 0 || shape === 1) {
      const widths = shape === 0 ? [4, 7, 8, 8, 6, 4] : [2, 4, 6, 4, 8, 6, 10, 8];
      const top = shape === 0 ? 2 : 1;
      widths.forEach((width, index) => fillRect(buffer, Math.floor((10 - width) / 2), top + index, width, 1, foliage));
      fillRect(buffer, 4, top, 2, 1, winter ? snow : highlight);
      if (winter) {
        fillRect(buffer, 2, 3, 3, 1, snow);
        fillRect(buffer, 1, 7, 3, 1, snow);
      }
    } else {
      // A low, divided evergreen crown with the trunk visible between lobes.
      fillRect(buffer, 1, 3, 3, 4, foliage);
      fillRect(buffer, 5, 2, 4, 5, foliage);
      fillRect(buffer, 3, 5, 4, 3, shadeAt(RAMPS.olive, 2));
      fillRect(buffer, 1, 3, 2, 1, winter ? snow : highlight);
      fillRect(buffer, 6, 2, 2, 1, winter ? snow : highlight);
    }
  }
  cache.set(key, buffer);
  return buffer;
}
