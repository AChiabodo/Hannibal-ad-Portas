/**
 * The palette, and the ramps derived from it (ticket B2).
 *
 * The derivations are checked against worked examples rather than against the
 * formula that produced them: a ramp that recomputed its own expected values
 * would pass whatever it did.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE,
  DETAIL_RAMPS,
  DETAIL_SHADES,
  RAMP_NAMES,
  RAMP_SHADES,
  RAMPS,
  detailAt,
  ramp,
  rgba,
  shade,
  withAlpha,
} from '../../src/art/palette';

describe('a colour written down as a number', () => {
  it('splits the channels and defaults to opaque', () => {
    expect(rgba(0x14110d)).toEqual([20, 17, 13, 255]);
    expect(rgba(0xff8800, 128)).toEqual([255, 136, 0, 128]);
    expect(rgba(0x000000)).toEqual([0, 0, 0, 255]);
    expect(rgba(0xffffff)).toEqual([255, 255, 255, 255]);
  });

  it('refuses anything that is not a colour', () => {
    for (const hex of [-1, 0x1000000, 1.5, Number.NaN]) {
      expect(() => rgba(hex)).toThrow(RangeError);
    }
    for (const alpha of [-1, 256, 0.5]) {
      expect(() => rgba(0x000000, alpha)).toThrow(RangeError);
    }
  });
});

describe('the same colour at another alpha', () => {
  it('keeps the channels it was given, and takes the alpha it was asked for', () => {
    expect(withAlpha(BASE.ink, 160)).toEqual([BASE.ink[0], BASE.ink[1], BASE.ink[2], 160]);
    expect(withAlpha([10, 20, 30, 255], 0)).toEqual([10, 20, 30, 0]);
    expect(withAlpha([10, 20, 30, 128], 255)).toEqual([10, 20, 30, 255]);
  });

  it('refuses an alpha that is not a channel', () => {
    for (const alpha of [-1, 256, 0.5, Number.NaN]) {
      expect(() => withAlpha(BASE.ink, alpha)).toThrow(RangeError);
    }
  });
});

describe('shifting a base toward black or white', () => {
  const base = [100, 150, 200, 255] as const;

  it('takes a percentage of the channel to darken and of the room left to lighten', () => {
    // Darken: 100−50, 150−75, 200−100. Lighten: 100+⌊155/2⌋, 150+⌊105/2⌋, 200+⌊55/2⌋.
    expect(shade(base, 0)).toEqual(base);
    expect(shade(base, -50)).toEqual([50, 75, 100, 255]);
    expect(shade(base, 50)).toEqual([177, 202, 227, 255]);
  });

  it('reaches black and white at the ends, and stays inside the channels beyond them', () => {
    expect(shade([255, 255, 255, 255], -100)).toEqual([0, 0, 0, 255]);
    expect(shade([0, 0, 0, 255], 100)).toEqual([255, 255, 255, 255]);
    expect(shade([255, 255, 255, 255], 100)).toEqual([255, 255, 255, 255]);
    expect(shade([0, 0, 0, 255], -100)).toEqual([0, 0, 0, 255]);
  });

  it('keeps the alpha it was given, and refuses an amount that is not a shade', () => {
    expect(shade([10, 20, 30, 128], -25)[3]).toBe(128);

    for (const amount of [-101, 101, 0.5, Number.NaN]) {
      expect(() => shade([10, 20, 30, 255], amount)).toThrow(RangeError);
    }
  });
});

describe('a ramp derived from a base', () => {
  it('runs darkest first, holds the base in the middle, and holds nothing else', () => {
    const base = BASE.stone;
    const shades = ramp(base, 7);

    expect(shades.length).toBe(7);
    expect(shades[3]).toEqual(base);

    const lightness = shades.map((colour) => colour[0] + colour[1] + colour[2]);
    for (let index = 1; index < lightness.length; index += 1) {
      expect(lightness[index]!).toBeGreaterThan(lightness[index - 1]!);
    }
  });

  it('is the base alone when asked for one shade, and refuses a count that is not a whole positive one', () => {
    expect(ramp(BASE.olive, 1)).toEqual([BASE.olive]);

    for (const shades of [0, -1, 2.5]) {
      expect(() => ramp(BASE.olive, shades)).toThrow(RangeError);
    }
  });
});

describe('a ramp fine enough to dither a field with', () => {
  it('is the same base and the same travel, at twice the granularity', () => {
    expect(DETAIL_SHADES).toBe(13);
    expect(Object.keys(DETAIL_RAMPS).sort()).toEqual([...RAMP_NAMES].sort());

    for (const name of RAMP_NAMES) {
      const detail = DETAIL_RAMPS[name];

      expect(detail.length, name).toBe(DETAIL_SHADES);
      // The two ramps of one base span the same colour: the ends are the same
      // shades, and the middle is the base itself.
      expect(detail[0], name).toEqual(RAMPS[name][0]);
      expect(detail[DETAIL_SHADES - 1], name).toEqual(RAMPS[name][RAMP_SHADES - 1]);
      expect(detail[6], name).toEqual(BASE[name]);
    }
  });

  it('holds every shade of the standard ramp, one step in two', () => {
    // The property that makes a detail ramp a subdivision of the palette rather than
    // a second palette: every shade the rest of the art already uses is one of its
    // shades, at twice the resolution. Its odd indices are colours nothing else
    // paints — that is the point of a surface — but they sit *between* the standard
    // shades of the same base, never outside them.
    for (const name of RAMP_NAMES) {
      for (let shadeIndex = 0; shadeIndex < RAMP_SHADES; shadeIndex += 1) {
        expect(DETAIL_RAMPS[name][shadeIndex * 2], `${name} shade ${String(shadeIndex)}`).toEqual(
          RAMPS[name][shadeIndex],
        );
      }
    }
  });

  it('reads a shade by index, and refuses one it does not have', () => {
    expect(detailAt('olive', 6)).toEqual(BASE.olive);
    expect(detailAt('water', 8)).toEqual(DETAIL_RAMPS.water[8]);

    for (const index of [-1, DETAIL_SHADES, 0.5]) {
      expect(() => detailAt('olive', index)).toThrow(RangeError);
    }
  });
});

describe('the palette the catalogue draws from', () => {
  it('carries a ramp for every named base, all of them the same length', () => {
    expect(Object.keys(RAMPS).sort()).toEqual([...RAMP_NAMES].sort());

    for (const name of RAMP_NAMES) {
      expect(RAMPS[name].length).toBe(RAMP_SHADES);
      expect(RAMPS[name][3]).toEqual(BASE[name]);
    }
  });

  it('grades in lightness, ramp for ramp', () => {
    for (const name of RAMP_NAMES) {
      const lightness = RAMPS[name].map((colour) => colour[0] + colour[1] + colour[2]);
      for (let index = 1; index < lightness.length; index += 1) {
        expect(lightness[index], `${name} shade ${String(index)}`).toBeGreaterThan(lightness[index - 1]!);
      }
    }
  });
});
