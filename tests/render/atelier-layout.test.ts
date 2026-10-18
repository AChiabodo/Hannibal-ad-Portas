/**
 * The Atelier's geometry (ticket B2).
 *
 * The page renders the catalogue at several zoom levels, so what is worth
 * asserting is that "several" costs what it says: one column per magnification,
 * each exactly that many times the plate, none overlapping, and a canvas that
 * loses none of them to its own edge.
 */
import { describe, expect, it } from 'vitest';
import { ATELIER_ZOOMS, atelierLayout } from '../../src/render/atelier-layout';
import { MAX_ZOOM } from '../../src/render/camera';

const PLATE = { width: 136, height: 191 };

describe('the atelier layout', () => {
  it('gives every zoom level a column exactly that big, left to right', () => {
    const layout = atelierLayout(PLATE, [1, 2, 4]);

    expect(layout.sections.map((section) => section.zoom)).toEqual([1, 2, 4]);
    expect(layout.sections.map((section) => section.width)).toEqual([136, 272, 544]);
    expect(layout.sections.map((section) => section.height)).toEqual([191, 382, 764]);

    for (let index = 1; index < layout.sections.length; index += 1) {
      const previous = layout.sections[index - 1];
      const section = layout.sections[index];
      if (previous === undefined || section === undefined) throw new Error('missing section');
      expect(section.x).toBeGreaterThanOrEqual(previous.x + previous.width);
    }
  });

  it('captions each column above it, in the catalogue’s own words', () => {
    const layout = atelierLayout(PLATE, ATELIER_ZOOMS);

    expect(layout.sections.map((section) => section.label)).toEqual(['zoom 1', 'zoom 2', 'zoom 4']);
    for (const section of layout.sections) {
      expect(section.labelX).toBe(section.x);
      expect(section.labelY).toBeLessThan(section.y);
    }
  });

  it('is exactly as big as its columns need, so nothing is clipped', () => {
    const layout = atelierLayout(PLATE, ATELIER_ZOOMS);
    const last = layout.sections[layout.sections.length - 1];
    const tallest = Math.max(...layout.sections.map((section) => section.y + section.height));
    if (last === undefined) throw new Error('no sections');

    expect(layout.width).toBeGreaterThanOrEqual(last.x + last.width);
    expect(layout.height).toBeGreaterThanOrEqual(tallest);
    for (const section of layout.sections) {
      expect(section.x + section.width).toBeLessThanOrEqual(layout.width);
      expect(section.y + section.height).toBeLessThanOrEqual(layout.height);
      expect(section.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('refuses a plate without a size and a zoom that is not a whole magnification', () => {
    expect(() => atelierLayout({ width: 0, height: 10 })).toThrow(RangeError);
    expect(() => atelierLayout({ width: 10.5, height: 10 })).toThrow(RangeError);
    expect(() => atelierLayout(PLATE, [])).toThrow(RangeError);
    expect(() => atelierLayout(PLATE, [1.5])).toThrow(RangeError);
    expect(() => atelierLayout(PLATE, [0])).toThrow(RangeError);
    // The camera could never show it, so the page could never reproduce it.
    expect(() => atelierLayout(PLATE, [MAX_ZOOM + 1])).toThrow(RangeError);
  });
});
