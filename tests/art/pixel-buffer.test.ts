/**
 * The pixel currency, one behaviour at a time (ticket B2).
 *
 * Everything here runs in Node with no engine anywhere: that `art/` can be
 * tested, baked and inspected without a browser is the reason it exists as a
 * separate library at all (ADR-0002, ADR-0003).
 */
import { describe, expect, it } from 'vitest';
import {
  blit,
  blitRegion,
  createPixelBuffer,
  fillRect,
  hashPixelBuffer,
  pixelAt,
  rotateQuarterTurns,
  setPixel,
  strokeRect,
  TRANSPARENT,
} from '../../src/art/pixel-buffer';

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 255] as const;

describe('a pixel buffer', () => {
  it('is transparent black where nothing was drawn, and holds the size it was asked for', () => {
    const buffer = createPixelBuffer(3, 2);

    expect(buffer.width).toBe(3);
    expect(buffer.height).toBe(2);
    expect(buffer.pixels.length).toBe(3 * 2 * 4);
    expect([...buffer.pixels]).toEqual(new Array<number>(24).fill(0));
    expect(pixelAt(buffer, 2, 1)).toEqual(TRANSPARENT);
  });

  it('can be created already filled, which is what a plate starts as', () => {
    const buffer = createPixelBuffer(2, 2, RED);

    expect(pixelAt(buffer, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 1, 1)).toEqual([255, 0, 0, 255]);
  });

  it('refuses a size or a colour that is not one', () => {
    expect(() => createPixelBuffer(0, 4)).toThrow(RangeError);
    expect(() => createPixelBuffer(4, -1)).toThrow(RangeError);
    expect(() => createPixelBuffer(1.5, 4)).toThrow(RangeError);
    expect(() => createPixelBuffer(4, 4, [300, 0, 0, 255])).toThrow(RangeError);
    expect(() => createPixelBuffer(4, 4, [1.5, 0, 0, 255])).toThrow(RangeError);
  });
});

describe('writing one pixel', () => {
  it('replaces what was there and reads back exactly', () => {
    const buffer = createPixelBuffer(2, 2);
    setPixel(buffer, 1, 1, RED);

    expect(pixelAt(buffer, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 0, 0)).toEqual(TRANSPARENT);
  });

  it('refuses a pixel the buffer does not have, rather than wrapping to another one', () => {
    const buffer = createPixelBuffer(2, 2);

    expect(() => setPixel(buffer, 2, 0, RED)).toThrow(/outside a 2×2 buffer/);
    expect(() => setPixel(buffer, 0, -1, RED)).toThrow(RangeError);
    expect(() => pixelAt(buffer, -1, 0)).toThrow(RangeError);
    expect(() => setPixel(buffer, 0, 0, [0, 0, 0, 256])).toThrow(RangeError);
  });
});

describe('filling a rectangle', () => {
  it('paints inside the buffer and drops what hangs off the edge', () => {
    const buffer = createPixelBuffer(4, 3, BLUE);
    fillRect(buffer, -1, 1, 3, 1, RED);

    // Only x = 0 and x = 1 are inside a 4-wide buffer; x = -1 is dropped.
    expect(pixelAt(buffer, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 2, 1)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(buffer, 0, 0)).toEqual([0, 0, 255, 255]);
  });

  it('paints nothing when the rectangle is entirely outside, and nothing when it is empty', () => {
    const buffer = createPixelBuffer(2, 2, BLUE);
    fillRect(buffer, 5, 5, 2, 2, RED);
    fillRect(buffer, 0, 0, 0, 0, RED);

    expect([...buffer.pixels]).toEqual([0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255]);
  });
});

describe('stroking a rectangle', () => {
  it('paints the edge inside the region, and leaves the middle alone', () => {
    const buffer = createPixelBuffer(4, 4, BLUE);
    strokeRect(buffer, 0, 0, 4, 4, RED);

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const onEdge = x === 0 || y === 0 || x === 3 || y === 3;
        expect(pixelAt(buffer, x, y), `${String(x)},${String(y)}`).toEqual(onEdge ? [255, 0, 0, 255] : [0, 0, 255, 255]);
      }
    }
  });

  it('covers exactly the pixels a fill of the same region would', () => {
    const filled = createPixelBuffer(3, 2, BLUE);
    const stroked = createPixelBuffer(3, 2, BLUE);
    fillRect(filled, 0, 0, 3, 2, RED);
    strokeRect(stroked, 0, 0, 3, 2, RED);

    // Two rows and three columns is all edge, so the two calls agree; a stroke
    // of a bigger region is the same boundary and a hollow middle.
    expect([...stroked.pixels]).toEqual([...filled.pixels]);

    const plate = createPixelBuffer(5, 5, BLUE);
    strokeRect(plate, 1, 1, 3, 3, RED);
    expect(pixelAt(plate, 2, 2)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(plate, 1, 2)).toEqual([255, 0, 0, 255]);
  });

  it('clips at the buffer edge and paints nothing for an empty region', () => {
    const buffer = createPixelBuffer(3, 3, BLUE);
    strokeRect(buffer, -1, -1, 3, 3, RED);
    strokeRect(buffer, 0, 0, 0, 2, RED);

    // The region's own boundary is at x = -1 and y = -1, so only the parts of
    // the edge that fall inside the buffer are painted.
    expect(pixelAt(buffer, 0, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 1, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 1, 1)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(buffer, 0, 0)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(buffer, 2, 2)).toEqual([0, 0, 255, 255]);
  });
});

describe('compositing one buffer onto another', () => {
  it('replaces whole pixels at full alpha, leaves holes at none, and blends the rest exactly', () => {
    const target = createPixelBuffer(3, 1, BLUE);
    const source = createPixelBuffer(3, 1);
    setPixel(source, 0, 0, RED);
    setPixel(source, 1, 0, [255, 0, 0, 128]);
    // Pixel 2 stays transparent.

    blit(target, source, 0, 0);

    expect(pixelAt(target, 0, 0)).toEqual([255, 0, 0, 255]);
    // (255·128 + 0·127)/255 = 128; (0·128 + 255·127)/255 = 127.
    expect(pixelAt(target, 1, 0)).toEqual([128, 0, 127, 255]);
    expect(pixelAt(target, 2, 0)).toEqual([0, 0, 255, 255]);
  });

  it('keeps a translucent colour translucent over nothing, and blends two of them exactly', () => {
    const overNothing = createPixelBuffer(1, 1);
    const translucent = createPixelBuffer(1, 1);
    setPixel(translucent, 0, 0, [255, 0, 0, 128]);
    blit(overNothing, translucent, 0, 0);

    // Straight alpha: the colour is the colour, and only the coverage is halved.
    // A premultiplied composite would have darkened it to 128 here.
    expect(pixelAt(overNothing, 0, 0)).toEqual([255, 0, 0, 128]);

    const halfBlue = createPixelBuffer(1, 1, [0, 0, 255, 128]);
    blit(halfBlue, translucent, 0, 0);

    // outA = 128 + ⌊128·127/255⌋ = 191; red = ⌊255·128·255 / (255·191)⌋ = 170;
    // blue = ⌊255·128·127 / (255·191)⌋ = 85.
    expect(pixelAt(halfBlue, 0, 0)).toEqual([170, 0, 85, 191]);
  });

  it('clips an overhanging composite instead of refusing it', () => {
    const target = createPixelBuffer(2, 2);
    const source = createPixelBuffer(2, 2, RED);

    blit(target, source, -1, -1);

    expect(pixelAt(target, 0, 0)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(target, 1, 1)).toEqual(TRANSPARENT);
  });

  it('refuses to composite a buffer onto itself', () => {
    const buffer = createPixelBuffer(2, 2, RED);

    expect(() => blit(buffer, buffer, 1, 0)).toThrow(RangeError);
  });
});

describe('compositing one rectangle of a buffer', () => {
  /** A 4×4 buffer whose pixel at `(x, y)` holds its own coordinates as a colour. */
  function marked(): ReturnType<typeof createPixelBuffer> {
    const buffer = createPixelBuffer(4, 4);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) setPixel(buffer, x, y, [x, y, 0, 255]);
    }

    return buffer;
  }

  it('copies the named rectangle to the named corner, clipped at the target', () => {
    const target = createPixelBuffer(3, 3);

    blitRegion(target, marked(), 1, 1, 2, 2, 0, 0);

    expect(pixelAt(target, 0, 0)).toEqual([1, 1, 0, 255]);
    expect(pixelAt(target, 1, 1)).toEqual([2, 2, 0, 255]);
    expect(pixelAt(target, 2, 2)).toEqual(TRANSPARENT);

    // Off the target is dropped, not refused, the same as a whole-buffer blit.
    blitRegion(target, marked(), 0, 0, 4, 4, -1, -1);
    expect(pixelAt(target, 0, 0)).toEqual([1, 1, 0, 255]);
  });

  it('refuses a region the source does not have, and refuses to blit a buffer onto itself', () => {
    const buffer = marked();

    expect(() => blitRegion(buffer, buffer, 0, 0, 2, 2, 0, 0)).toThrow(RangeError);
    expect(() => blitRegion(createPixelBuffer(1, 1), buffer, 3, 0, 2, 1, 0, 0)).toThrow(RangeError);
    expect(() => blitRegion(createPixelBuffer(1, 1), buffer, 0, 0, -1, 1, 0, 0)).toThrow(RangeError);
    expect(() => blitRegion(createPixelBuffer(1, 1), buffer, 0, 0, 1.5, 1, 0, 0)).toThrow(RangeError);
  });
});

describe('turning a buffer', () => {
  it('turns a corner clockwise, one quarter at a time', () => {
    const buffer = createPixelBuffer(2, 2);
    setPixel(buffer, 0, 0, RED);

    expect(pixelAt(rotateQuarterTurns(buffer, 1), 1, 0)).toEqual(RED);
    expect(pixelAt(rotateQuarterTurns(buffer, 2), 1, 1)).toEqual(RED);
    expect(pixelAt(rotateQuarterTurns(buffer, 3), 0, 1)).toEqual(RED);
    expect(pixelAt(rotateQuarterTurns(buffer, 4), 0, 0)).toEqual(RED);
    expect(pixelAt(rotateQuarterTurns(buffer, -3), 1, 0)).toEqual(RED);
  });

  it('swaps the sides of a rectangle and comes back to where it started', () => {
    const wide = createPixelBuffer(3, 1, RED);
    const turned = rotateQuarterTurns(wide, 1);

    expect([turned.width, turned.height]).toEqual([1, 3]);
    expect(hashPixelBuffer(rotateQuarterTurns(wide, 4))).toBe(hashPixelBuffer(wide));
  });

  it('hands back a copy rather than the buffer itself, and refuses a fractional turn', () => {
    const buffer = createPixelBuffer(2, 2, RED);

    expect(rotateQuarterTurns(buffer, 0)).not.toBe(buffer);
    expect(rotateQuarterTurns(buffer, 0).pixels).toEqual(buffer.pixels);
    expect(() => rotateQuarterTurns(buffer, 1.5)).toThrow(RangeError);
  });
});

describe('the pixel hash', () => {
  it('is sixteen hexadecimal digits, the same for the same pixels and different for different ones', () => {
    const buffer = createPixelBuffer(2, 2, RED);
    const same = createPixelBuffer(2, 2, RED);
    const moved = createPixelBuffer(2, 2, RED);
    setPixel(moved, 0, 0, BLUE);

    expect(hashPixelBuffer(buffer)).toMatch(/^[0-9a-f]{16}$/);
    expect(hashPixelBuffer(buffer)).toBe(hashPixelBuffer(same));
    expect(hashPixelBuffer(buffer)).not.toBe(hashPixelBuffer(moved));
  });

  it('tells two buffers of different shapes apart, even with the same pixels in the same order', () => {
    const wide = createPixelBuffer(4, 1, RED);
    const tall = createPixelBuffer(1, 4, RED);

    expect([...wide.pixels]).toEqual([...tall.pixels]);
    expect(hashPixelBuffer(wide)).not.toBe(hashPixelBuffer(tall));
  });
});
