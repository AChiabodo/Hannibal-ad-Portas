/**
 * The fog, rendered (ticket B4).
 *
 * The ticket's acceptance criterion is one sentence — "fog renders in its three
 * states, and unexplored tiles reveal nothing of the map underneath" — and it is
 * three statements here: the three states have three different veils, a
 * remembered tile lets its terrain through (that is what memory is for), and an
 * unexplored tile comes out the same colour whatever the map holds there.
 *
 * The last one is checked the only way it can mean anything: by compositing the
 * fog over two *different* theatres and comparing the pixels the fog covers. A
 * fog that leaked what was underneath would have to disagree with itself.
 *
 * The fog follows the *logical* tile grid and not the rendering one: vision is
 * per tile, so a tile's whole 16×16 square carries one state, and the half-tile
 * margin `renderTerrain` leaves around the theatre takes the edge tile's, the
 * way the terrain clamps its own materials. The tests say so at the pixels where
 * the two grids would disagree if the fog were painted by the rendering offset.
 */
import { describe, expect, it } from 'vitest';
import { blit, pixelAt, type Rgba } from '../../src/art/pixel-buffer';
import { TERRAIN_TILE } from '../../src/art/terrain';
import {
  KNOWLEDGE,
  UNSEEN,
  createFog,
  eyeOf,
  knows,
  refreshVision,
  type Eye,
  type FogView,
} from '../../src/sim/fog';
import { generateMap, MAP_HEIGHT, MAP_WIDTH, tileIndex, type MapGrid } from '../../src/sim/map';
import { REMEMBERED, UNEXPLORED, renderFog } from '../../src/render/fog';
import { THEATRE_PIXELS, THEATRE_MARGIN, renderTerrain, tilePixel } from '../../src/render/terrain';

/** Two theatres that are nothing like each other, so "reveals nothing" has something to hide. */
const FIRST = generateMap(1);
const SECOND = generateMap(2);

/** A fog that knows nothing of any theatre. */
function blind(): FogView {
  return createFog();
}

/** A fog with one eye: what it covers is visible, everything else is unexplored. */
function looking(eye: Eye): FogView {
  const fog = createFog();
  refreshVision(fog, FIRST, [eye]);

  return fog;
}

/** A fog that has seen every tile once and is looking at none of them: the whole theatre remembered. */
function remembering(): FogView {
  const fog = createFog();
  const everywhere: Eye[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) everywhere.push(eyeOf({ x, y }, 0));
  }

  refreshVision(fog, FIRST, everywhere);
  // And then nobody is looking: everything is memory, nothing is in view, which
  // is the state the middle of the three veils is for.
  refreshVision(fog, FIRST, []);

  return fog;
}

/** Terrain rendered, with the fog drawn over it: what the screen shows. */
function composed(map: MapGrid, fog: FogView) {
  const frame = renderTerrain(map);
  blit(frame, renderFog(fog), 0, 0);

  return frame;
}

/** Whether every pixel in a list is the colour given, so a tile's whole square can be read at once. */
function allAre(pixels: readonly Rgba[], colour: Rgba): boolean {
  return pixels.every((pixel) => pixel.every((channel, at) => channel === colour[at]));
}

/** Every pixel of one logical tile's square, as they come out of the fog buffer. */
function tilePixels(fog: FogView, x: number, y: number): Rgba[] {
  const buffer = renderFog(fog);
  const at = tilePixel(x, y);
  const pixels: Rgba[] = [];

  for (let dy = 0; dy < TERRAIN_TILE; dy += 1) {
    for (let dx = 0; dx < TERRAIN_TILE; dx += 1) pixels.push(pixelAt(buffer, at.x + dx, at.y + dy));
  }

  return pixels;
}

describe('the fog over the theatre', () => {
  it('covers the whole image `renderTerrain` produces, margin and all', () => {
    const fog = renderFog(blind());

    expect(fog.width).toBe(THEATRE_PIXELS);
    expect(fog.height).toBe(THEATRE_PIXELS);
  });

  it('paints the three states with three different veils: opaque, veiled and clear', () => {
    const fog = renderFog(looking(eyeOf({ x: 48, y: 48 }, 2)));
    const seen = tilePixel(48, 48);
    const outOfView = tilePixel(10, 10);

    expect(pixelAt(fog, seen.x, seen.y)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(fog, outOfView.x, outOfView.y)).toEqual(UNEXPLORED);
    expect(UNEXPLORED[3]).toBe(255);
    expect(REMEMBERED[3]).toBeGreaterThan(0);
    expect(REMEMBERED[3]).toBeLessThan(255);
  });

  it('gives a tile one state over its whole square, and not the neighbouring tile', () => {
    const fog = looking(eyeOf({ x: 48, y: 48 }, 2));

    // A tile in view, its whole 16×16, and a tile one square away: the
    // rendering grid's half-tile offset must not decide which state a pixel is.
    expect(allAre(tilePixels(fog, 48, 48), [0, 0, 0, 0])).toBe(true);
    expect(allAre(tilePixels(fog, 60, 60), UNEXPLORED)).toBe(true);
    expect(allAre(tilePixels(fog, 45, 48), UNEXPLORED)).toBe(true);
  });

  it('leaves a tile in view exactly as the terrain drew it', () => {
    const at = tilePixel(48, 48);
    const fog = looking(eyeOf({ x: 48, y: 48 }, 2));
    const terrain = renderTerrain(FIRST);

    expect(pixelAt(composed(FIRST, fog), at.x, at.y)).toEqual(pixelAt(terrain, at.x, at.y));
    expect(pixelAt(renderFog(fog), at.x, at.y)).toEqual([0, 0, 0, 0]);
  });

  it('reveals nothing of the map underneath an unexplored tile: two theatres, the same pixel', () => {
    const at = tilePixel(20, 20);
    const one = composed(FIRST, blind());
    const other = composed(SECOND, blind());

    // The two maps are not the same map ...
    expect(pixelAt(renderTerrain(FIRST), at.x, at.y)).not.toEqual(pixelAt(renderTerrain(SECOND), at.x, at.y));
    // ... and the fog shows the same thing over both of them: nothing at all.
    expect(pixelAt(one, at.x, at.y)).toEqual(pixelAt(other, at.x, at.y));
    expect(pixelAt(one, at.x, at.y)).toEqual(UNEXPLORED);
  });

  it('veils a remembered tile without hiding it: the terrain still reads through, dimmed', () => {
    const at = tilePixel(20, 20);
    const one = composed(FIRST, remembering());
    const other = composed(SECOND, remembering());
    const ground = pixelAt(renderTerrain(FIRST), at.x, at.y);

    // A veil, not a cover: the pixel is not the fog colour ...
    expect(pixelAt(one, at.x, at.y)).not.toEqual(REMEMBERED);
    // ... and what is underneath is still distinguishable from another map's.
    expect(pixelAt(one, at.x, at.y)).not.toEqual(pixelAt(other, at.x, at.y));
    // And it is darker than the ground it remembers, which is what "dimmed" means.
    const [red, green, blue] = pixelAt(one, at.x, at.y);
    expect(red).toBeLessThan(ground[0]);
    expect(green).toBeLessThan(ground[1]);
    expect(blue).toBeLessThan(ground[2]);
  });

  it('carries the edge tile of the map into the half-tile margin, as the terrain does', () => {
    const fog = renderFog(looking(eyeOf({ x: 0, y: 0 }, 0)));
    const clear: Rgba = [0, 0, 0, 0];

    // The margin above and left of the theatre is tile (0, 0)'s, clamped.
    expect(pixelAt(fog, 0, 0)).toEqual(clear);
    expect(pixelAt(fog, THEATRE_MARGIN - 1, THEATRE_MARGIN - 1)).toEqual(clear);

    // Tile (0, 0)'s own square starts at the margin and is 16 pixels wide; the
    // tile below and the tile to the right are unexplored.
    expect(pixelAt(fog, THEATRE_MARGIN, THEATRE_MARGIN)).toEqual(clear);
    expect(pixelAt(fog, THEATRE_MARGIN + TERRAIN_TILE - 1, THEATRE_MARGIN + TERRAIN_TILE - 1)).toEqual(clear);
    expect(pixelAt(fog, THEATRE_MARGIN + TERRAIN_TILE, THEATRE_MARGIN)).toEqual(UNEXPLORED);
    expect(pixelAt(fog, THEATRE_MARGIN, THEATRE_MARGIN + TERRAIN_TILE)).toEqual(UNEXPLORED);

    // The far corner of the image is the last tile's, clamped the same way.
    expect(pixelAt(fog, THEATRE_PIXELS - 1, THEATRE_PIXELS - 1)).toEqual(UNEXPLORED);
  });

  it('puts every tile of the map in the state the fog says it is in', () => {
    const fog = createFog();
    refreshVision(fog, FIRST, [eyeOf({ x: 10, y: 10 }, 3), eyeOf({ x: 40, y: 40 }, 0)]);
    const buffer = renderFog(fog);

    for (const [x, y] of [
      [10, 10],
      [40, 40],
      [90, 90],
      [12, 11],
    ] as const) {
      const at = tilePixel(x, y);
      const wanted = knows(fog, x, y) === KNOWLEDGE.visible ? 0 : UNEXPLORED[3];
      expect(pixelAt(buffer, at.x, at.y)[3], `tile (${String(x)}, ${String(y)})`).toBe(wanted);
    }

    // A tile that was in view and is not any more is the third state, not the first.
    refreshVision(fog, FIRST, [eyeOf({ x: 10, y: 10 }, 3)]);
    const at = tilePixel(40, 40);
    expect(pixelAt(renderFog(fog), at.x, at.y)).toEqual(REMEMBERED);
    expect(fog.terrain[tileIndex(40, 40)] ?? UNSEEN).not.toBe(UNSEEN);
  });

  it('refuses a fog that is over some other theatre', () => {
    const tooSmall: FogView = {
      terrain: new Uint8Array(4),
      visible: new Uint8Array(4),
      contacts: [],
    };

    expect(() => renderFog(tooSmall)).toThrow(/theatre/);
    expect(() => renderFog({ ...blind(), visible: new Uint8Array(4) })).toThrow(/theatre/);
  });
});
