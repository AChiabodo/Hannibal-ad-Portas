/**
 * The marks the theatre draws about a Squad (#58).
 *
 * The same standard the icons and the soldiers are held to: a mark is a shape
 * first, and the colour confirms it. So the tests walk the silhouettes — two
 * destination marks that differ with the palette taken out, four chevrons that
 * point the way they say, five condition shapes no two of which are the same —
 * and pin the deterministic answer.
 */
import { describe, expect, it } from 'vitest';
import {
  CONDITION_MARKS,
  CONDITION_MARK_SIZE,
  FACING_MARKS,
  FACING_MARK_SIZE,
  ORDER_MARK_KINDS,
  ORDER_MARKER_SIZE,
  conditionMark,
  facingMarker,
  markerEntries,
  orderMarker,
  type FacingMark,
} from '../../src/art/markers';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';

/** How many pixels of a buffer have any ink in them. */
function ink(buffer: PixelBuffer): number {
  let painted = 0;
  for (let index = 3; index < buffer.pixels.length; index += 4) if ((buffer.pixels[index] ?? 0) > 0) painted += 1;

  return painted;
}

/** Which pixels have ink, whatever colour: a silhouette, for comparing shapes. */
function silhouette(buffer: PixelBuffer): readonly boolean[] {
  const painted: boolean[] = [];

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) painted.push(pixelAt(buffer, x, y)[3] !== 0);
  }

  return painted;
}

describe('the destination marks', () => {
  it('draws move as C2’s diamond, unchanged: hollow, with a dot in the middle', () => {
    const mark = orderMarker('move');

    expect({ width: mark.width, height: mark.height }).toEqual({ width: ORDER_MARKER_SIZE, height: ORDER_MARKER_SIZE });
    expect(pixelAt(mark, 0, 0)[3]).toBe(0);
    expect(pixelAt(mark, 4, 4)[3]).toBeGreaterThan(0);
    expect(ink(mark)).toBe(17);
  });

  it('tells a move from an attack-move by shape, not only by colour', () => {
    const move = silhouette(orderMarker('move'));
    const attack = silhouette(orderMarker('attackMove'));

    expect(move).not.toEqual(attack);
    expect(ink(orderMarker('attackMove'))).toBeGreaterThan(ink(orderMarker('move')));
  });

  it('draws the same mark for the same question, every time', () => {
    for (const kind of ORDER_MARK_KINDS) {
      expect(hashPixelBuffer(orderMarker(kind))).toBe(hashPixelBuffer(orderMarker(kind)));
    }
  });
});

describe('the facing chevrons', () => {
  it('draws four arrows, each with its tip on the side it names', () => {
    const tips: Readonly<Record<FacingMark, readonly [number, number][]>> = {
      north: [[3, 0], [3, 1]],
      east: [[6, 3], [5, 3]],
      south: [[3, 6], [3, 5]],
      west: [[0, 3], [1, 3]],
    };

    for (const facing of FACING_MARKS) {
      const marker = facingMarker(facing);
      expect({ width: marker.width, height: marker.height }).toEqual({
        width: FACING_MARK_SIZE,
        height: FACING_MARK_SIZE,
      });

      for (const [x, y] of tips[facing]) {
        expect(pixelAt(marker, x, y)[3], `${facing} tip at ${String(x)},${String(y)}`).toBeGreaterThan(0);
      }
    }
  });

  it('draws four different arrows, not one reused', () => {
    const hashes = FACING_MARKS.map((facing) => hashPixelBuffer(facingMarker(facing)));

    expect(new Set(hashes).size).toBe(FACING_MARKS.length);
  });
});

describe('the condition shapes', () => {
  it('draws five shapes, no two of them the same with the palette taken out', () => {
    for (const [index, kind] of CONDITION_MARKS.entries()) {
      const marker = conditionMark(kind);

      expect({ width: marker.width, height: marker.height }).toEqual({
        width: CONDITION_MARK_SIZE,
        height: CONDITION_MARK_SIZE,
      });
      expect(ink(marker), kind).toBeGreaterThan(2);

      for (const [other, otherKind] of CONDITION_MARKS.entries()) {
        if (other <= index) continue;

        const left = silhouette(marker);
        const right = silhouette(conditionMark(otherKind));
        const differing = left.filter((painted, pixel) => painted !== right[pixel]).length;
        expect(differing, `${kind} vs ${otherKind}`).toBeGreaterThanOrEqual(4);
      }
    }
  });
});

describe('the mark catalogue', () => {
  it('names every mark exactly once, so the Atelier and a bake can walk it', () => {
    const names = markerEntries().map((entry) => entry.name);

    expect(names).toEqual([
      ...ORDER_MARK_KINDS.map((kind) => `mark:order:${kind}`),
      ...FACING_MARKS.map((facing) => `mark:facing:${facing}`),
      ...CONDITION_MARKS.map((kind) => `mark:condition:${kind}`),
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});
