/**
 * The separation specimens (ticket U5).
 *
 * U5's claim is about *figure and ground*: a soldier has to be the thing the eye
 * finds on a field, and the field has to stay quiet enough for that to be true.
 * A claim about a picture is judged on a picture, so the Atelier shows a specimen
 * per material — three tiles of that ground with one man standing on the middle
 * one — and this file holds the three things a specimen has to be:
 *
 * - **the ground it says**, tiled edge to edge, so the specimen is the map and not
 *   a repaint of it;
 * - **a soldier on it**, drawn over the ground the way the game draws him;
 * - **separated**, which is the only assertion here that is worth anything as a
 *   number: the man's own ink covers a far wider range of brightness than the
 *   ground under him, and reaches well outside it. A ground that grew as loud as
 *   the figure standing on it would fail here whatever it looked like.
 */
import { describe, expect, it } from 'vitest';
import {
  FIGURE_FACTION,
  FIGURE_FACTIONS,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  soldier,
} from '../../src/art/figures';
import { TERRAIN_TILE, materialTile } from '../../src/art/terrain';
import { hashPixelBuffer, pixelAt } from '../../src/art/pixel-buffer';
import { brightness } from './brightness';
import {
  SEPARATION_MATERIALS,
  SEPARATION_FIGURES,
  SEPARATION_SIZE,
  SEPARATION_TILES,
  materialPatch,
  separationEntries,
  separationSpecimen,
} from '../../src/art/separation';


/** Where the soldier of a specimen stands on it, in the specimen's own pixels. */
function figureBox(): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  const column = Math.floor(SEPARATION_TILES / 2) * TERRAIN_TILE;

  return {
    x: column + Math.floor((TERRAIN_TILE - FIGURE_WIDTH) / 2),
    y: column + Math.floor((TERRAIN_TILE - FIGURE_HEIGHT) / 2),
    width: FIGURE_WIDTH,
    height: FIGURE_HEIGHT,
  };
}

describe('the ground a specimen stands on', () => {
  it('is the material tiled edge to edge, so the specimen is the map and not a repaint of it', () => {
    for (const material of SEPARATION_MATERIALS) {
      const ground = materialPatch(material);

      expect([ground.width, ground.height], material).toEqual([SEPARATION_SIZE, SEPARATION_SIZE]);
      for (let y = 0; y < ground.height; y += 1) {
        for (let x = 0; x < ground.width; x += 1) {
          expect(pixelAt(ground, x, y), `${material} at (${String(x)}, ${String(y)})`).toEqual(
            pixelAt(materialTile(material), x % TERRAIN_TILE, y % TERRAIN_TILE),
          );
        }
      }
    }
  });

  it('is three tiles a side, so both the repetition and the man fit in it', () => {
    expect(SEPARATION_TILES).toBe(3);
    expect(SEPARATION_SIZE).toBe(SEPARATION_TILES * TERRAIN_TILE);
  });
});

describe('a separation specimen', () => {
  it('draws a soldier of each Faction on every ground', () => {
    for (const faction of FIGURE_FACTIONS) {
      const figure = SEPARATION_FIGURES[faction];
      expect(FIGURE_FACTION[figure], `${figure} is ${faction}'s`).toBe(faction);

      for (const material of SEPARATION_MATERIALS) {
        const specimen = separationSpecimen(material, faction);

        expect([specimen.width, specimen.height], `${faction} on ${material}`).toEqual([
          SEPARATION_SIZE,
          SEPARATION_SIZE,
        ]);
        // The ground is opaque everywhere, and the figure is drawn over it: blitting
        // skips the figure's transparent pixels, so nothing of the ground is lost.
        for (let index = 3; index < specimen.pixels.length; index += 4) {
          expect(specimen.pixels[index], `${faction} on ${material} is whole`).toBe(255);
        }

        // The man is *there*: his rectangle holds ink the bare ground does not.
        const bare = materialPatch(material);
        const box = figureBox();
        let changed = 0;
        for (let y = 0; y < box.height; y += 1) {
          for (let x = 0; x < box.width; x += 1) {
            const at = pixelAt(specimen, box.x + x, box.y + y);
            if (at[0] !== pixelAt(bare, box.x + x, box.y + y)[0]) changed += 1;
          }
        }
        expect(changed, `${faction} on ${material}`).toBeGreaterThan(0);
      }
    }
  });

  it('separates the man from the ground: his ink reaches outside it and covers more of the range', () => {
    for (const faction of FIGURE_FACTIONS) {
      const figure = SEPARATION_FIGURES[faction];
      const ink = brightness(soldier(figure, 'south', { action: 'idle', step: 0 }));

      for (const material of SEPARATION_MATERIALS) {
        const terrain = brightness(materialTile(material));
        const reach = Math.max(terrain.low - ink.low, ink.high - terrain.high);
        const terrainRange = terrain.high - terrain.low;
        const inkRange = ink.high - ink.low;

        // Two assertions, and the second is the one U5 exists for: the man is not
        // merely brighter than the ground somewhere, his whole drawing spans several
        // times the brightness the ground dares to use.
        expect(reach, `${figure} on ${material} reaches outside it`).toBeGreaterThanOrEqual(40);
        expect(inkRange, `${figure} on ${material} outranges it`).toBeGreaterThanOrEqual(3 * terrainRange);
      }
    }
  });

  it('is the same specimen every time it is asked, and one per Faction and ground', () => {
    const entries = separationEntries();

    expect(entries.map((entry) => entry.name)).toEqual(
      FIGURE_FACTIONS.flatMap((faction) => SEPARATION_MATERIALS.map((material) => `separation:${faction}:${material}`)),
    );
    expect(new Set(entries.map((entry) => hashPixelBuffer(entry.buffer))).size).toBe(entries.length);

    for (const [index, entry] of entries.entries()) {
      const faction = FIGURE_FACTIONS[Math.floor(index / SEPARATION_MATERIALS.length)];
      const material = SEPARATION_MATERIALS[index % SEPARATION_MATERIALS.length];
      if (faction === undefined || material === undefined) continue;

      expect(hashPixelBuffer(entry.buffer)).toBe(hashPixelBuffer(separationSpecimen(material, faction)));
    }
  });
});
