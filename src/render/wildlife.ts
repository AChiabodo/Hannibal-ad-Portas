/** Decorative animals derived from the theatre, never part of Match state. */
import { createPixelBuffer, fillRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import { RAMPS, shadeAt } from '../art/palette.ts';
import { KNOWLEDGE, knows, type FogView } from '../sim/fog.ts';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, terrainAt, type MapGrid } from '../sim/map.ts';
import { tilePixel } from './terrain.ts';

export type WildlifeKind = 'hare' | 'boar' | 'bird';
export interface Wildlife {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind: WildlifeKind;
}
export interface VisibleWildlife extends Wildlife {
  readonly pixelX: number;
  readonly pixelY: number;
  readonly frame: number;
}

/** Derive sparse habitat-specific placements without consuming the Match RNG. */
export function wildlifeOf(map: MapGrid, seed: number): readonly Wildlife[] {
  const animals: Wildlife[] = [];
  for (let y = 1; y < MAP_HEIGHT - 1; y += 1) {
    for (let x = 1; x < MAP_WIDTH - 1; x += 1) {
      const terrain = terrainAt(map, x, y);
      if (terrain !== TERRAIN.plain && terrain !== TERRAIN.forest && terrain !== TERRAIN.marsh) continue;
      let hash = Math.imul(x + seed, 0x85ebca6b) ^ Math.imul(y + seed, 0x27d4eb2d);
      hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);
      if (((hash ^ (hash >>> 13)) >>> 0) % (terrain === TERRAIN.marsh ? 40 : 700) !== 0) continue;
      animals.push({ id: y * MAP_WIDTH + x, x, y,
        kind: terrain === TERRAIN.forest ? 'boar' : terrain === TERRAIN.marsh ? 'bird' : 'hare' });
    }
  }
  return animals;
}

/** Only current sight may reveal an animal; animation stays inside its tile. */
export function visibleWildlife(animals: readonly Wildlife[], fog: FogView, tick: number): readonly VisibleWildlife[] {
  return animals.filter((animal) => knows(fog, animal.x, animal.y) === KNOWLEDGE.visible).map((animal) => {
    const at = tilePixel(animal.x, animal.y);
    const frame = Math.floor((tick + animal.id) / 18) % 2;
    return { ...animal, pixelX: at.x + 4 + frame, pixelY: at.y + 5, frame };
  });
}

/** Small silhouettes, subordinate to the squads and using the shared palette. */
export function wildlifeSprite(kind: WildlifeKind): PixelBuffer {
  const buffer = createPixelBuffer(8, 7);
  if (kind === 'bird') {
    const plumage = shadeAt(RAMPS.stone, 5);
    fillRect(buffer, 2, 2, 4, 2, plumage);
    fillRect(buffer, 5, 1, 2, 2, plumage);
    fillRect(buffer, 3, 4, 1, 2, shadeAt(RAMPS.bronze, 3));
    return buffer;
  }
  const body = shadeAt(RAMPS.bronze, kind === 'boar' ? 2 : 4);
  const dark = shadeAt(RAMPS.stone, 1);
  fillRect(buffer, 1, 2, kind === 'boar' ? 5 : 4, 3, body);
  fillRect(buffer, 5, 1, 2, 2, body);
  fillRect(buffer, 2, 5, 1, 1, dark);
  fillRect(buffer, 5, 5, 1, 1, dark);
  if (kind === 'hare') fillRect(buffer, 5, 0, 1, 2, body);
  return buffer;
}
