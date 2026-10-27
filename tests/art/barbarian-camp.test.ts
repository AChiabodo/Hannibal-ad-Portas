import { describe, expect, it } from 'vitest';
import { barbarianCampSprite } from '../../src/art/barbarian-camp';

/** Public PixelBuffer boundary: the three camps must remain recognisably distinct. */
describe('barbarian camp art', () => {
  it('draws three reproducible, compact and distinct encampments', () => {
    const sprites = [0, 1, 2].map((variant) => barbarianCampSprite(variant));
    for (const sprite of sprites) {
      expect(sprite.width).toBe(32);
      expect(sprite.height).toBe(32);
      const alphas = sprite.pixels.filter((_value, index) => index % 4 === 3);
      expect(alphas.some((alpha) => alpha === 0)).toBe(true);
      expect(alphas.filter((alpha) => alpha > 0).length).toBeGreaterThan(60);
    }
    expect(new Set(sprites.map((sprite) => Array.from(sprite.pixels).join(','))).size).toBe(3);
    expect(barbarianCampSprite(1).pixels).toEqual(sprites[1]!.pixels);
  });
});

it('draws a distinct sparse ruin for a destroyed camp', () => {
  const standing = barbarianCampSprite(0);
  const ruin = barbarianCampSprite(0, 'ruin');
  const count = (pixels: Uint8ClampedArray) => pixels.filter((value, i) => i % 4 === 3 && value > 0).length;
  expect(count(ruin.pixels)).toBeGreaterThan(8);
  expect(count(ruin.pixels)).toBeLessThan(count(standing.pixels));
  expect(ruin.pixels).not.toEqual(standing.pixels);
});
