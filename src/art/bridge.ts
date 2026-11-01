/** Wooden decking for one walkable bridge tile, in the theatre's pixel palette. */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, fillRect, type PixelBuffer } from './pixel-buffer.ts';
import { TERRAIN_TILE } from './terrain.ts';

const tiles = new Map<boolean, PixelBuffer>();

/** Plank seams run across the direction of travel; the whole tile remains walkable. */
export function bridgeDeck(horizontal: boolean): PixelBuffer {
  const cached = tiles.get(horizontal);
  if (cached !== undefined) return cached;
  const tile = createPixelBuffer(TERRAIN_TILE, TERRAIN_TILE, shadeAt(RAMPS.bronze, 4));
  for (let i = 0; i < TERRAIN_TILE; i += 4) {
    if (horizontal) {
      fillRect(tile, i, 0, 1, TERRAIN_TILE, shadeAt(RAMPS.bronze, 2));
      fillRect(tile, i + 1, 0, 1, TERRAIN_TILE, shadeAt(RAMPS.bronze, 5));
    } else {
      fillRect(tile, 0, i, TERRAIN_TILE, 1, shadeAt(RAMPS.bronze, 2));
      fillRect(tile, 0, i + 1, TERRAIN_TILE, 1, shadeAt(RAMPS.bronze, 5));
    }
  }
  tiles.set(horizontal, tile);
  return tile;
}
