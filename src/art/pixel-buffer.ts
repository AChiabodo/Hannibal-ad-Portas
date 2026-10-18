/**
 * `PixelBuffer`: the one currency every generated pixel travels in (ADR-0002, PLAN §3).
 *
 * A generator in `art/` takes a `PixelBuffer` and returns one; the bake step
 * writes one out; the render adapter turns one into a texture; a pixel-hash test
 * pins one; the Atelier draws the catalogue of them. Nothing else crosses those
 * four places, which is what makes the pipeline inspectable in Node with no
 * engine anywhere — PixiJS has no headless path, so a second pixel type would
 * have to be a second, untested implementation (ADR-0001).
 *
 * Three decisions the type carries:
 *
 * - **RGBA, row-major, straight alpha.** `pixels` is `width * height * 4` byte
 *   channels, top-left first. Straight rather than premultiplied, because that
 *   is what a generator can reason about, and the upload premultiplies anyway.
 * - **Integers, always.** A channel is an integer in [0, 255]. Pixel art has no
 *   half-colours, and a float in authored art is a texture that reads differently
 *   on two devices.
 * - **Opaque by default is not assumed.** A fresh buffer is transparent black,
 *   so a generator that forgets to paint a pixel gets a hole loud enough to see
 *   rather than a colour nobody chose.
 *
 * The hash is here rather than in `sim/hash.ts` on purpose. That hash is over the
 * canonical form of authoritative Match state and answers "is this the same
 * run?" (ADR-0006); art is not Match state, and `art/` must not reach into the
 * simulation to be hashable — a pixel-hash test has to run in Node, alone.
 */

/** One colour: red, green, blue and alpha, each an integer in [0, 255]. */
export type Rgba = readonly [number, number, number, number];

/** Fully transparent black: what a fresh buffer holds where nothing was drawn. */
export const TRANSPARENT: Rgba = [0, 0, 0, 0];

/** The byte length of one pixel: four channels, red first. */
export const CHANNELS = 4;

/**
 * A raster of raw RGBA pixels, row-major from the top-left.
 *
 * The buffer is mutable through the functions below and read-only as a value: a
 * generator builds one up and hands it on, and nothing downstream is expected to
 * write into it. `Uint8ClampedArray` rather than `Uint8Array` so a compositing
 * mistake clamps to the channel range instead of wrapping a colour around.
 */
export interface PixelBuffer {
  /** Width in pixels: what a caller drawing at `x` has to stay below. */
  readonly width: number;
  /** Height in pixels: what a caller drawing at `y` has to stay below. */
  readonly height: number;
  /** The pixels themselves: `width * height * CHANNELS` bytes of straight RGBA. */
  readonly pixels: Uint8ClampedArray;
}

/**
 * A buffer of the given size, filled with one colour.
 *
 * @throws RangeError when a dimension is not a positive integer, or the fill is
 *   not a colour.
 */
export function createPixelBuffer(width: number, height: number, fill: Rgba = TRANSPARENT): PixelBuffer {
  requireDimension(width, 'width');
  requireDimension(height, 'height');
  requireColour(fill);

  const pixels = new Uint8ClampedArray(width * height * CHANNELS);
  const buffer: PixelBuffer = { width, height, pixels };
  fillRect(buffer, 0, 0, width, height, fill);

  return buffer;
}

/**
 * The colour at one pixel.
 *
 * @throws RangeError when the pixel is outside the buffer: a read off the edge
 *   is a bug in the caller, and returning a hole would hide it.
 */
export function pixelAt(buffer: PixelBuffer, x: number, y: number): Rgba {
  const index = indexOf(buffer, x, y);

  return [
    buffer.pixels[index] ?? 0,
    buffer.pixels[index + 1] ?? 0,
    buffer.pixels[index + 2] ?? 0,
    buffer.pixels[index + 3] ?? 0,
  ];
}

/**
 * Writes one pixel, replacing whatever was there.
 *
 * @throws RangeError when the pixel is outside the buffer or the colour is not
 *   one. Drawing functions that expect to overhang — `fillRect`, `drawText` —
 *   clip instead and never call this out of bounds.
 */
export function setPixel(buffer: PixelBuffer, x: number, y: number, colour: Rgba): void {
  requireColour(colour);

  const index = indexOf(buffer, x, y);
  buffer.pixels[index] = colour[0];
  buffer.pixels[index + 1] = colour[1];
  buffer.pixels[index + 2] = colour[2];
  buffer.pixels[index + 3] = colour[3];
}

/**
 * Paints an opaque rectangle, clipped to the buffer.
 *
 * The rectangle is `(x, y)` plus `width × height`, in the buffer's own
 * coordinates. Anything off the edge is dropped rather than refused, because
 * every plate and every sprite composes against edges it should not have to
 * measure first. A zero-sized rectangle paints nothing.
 */
export function fillRect(
  buffer: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: Rgba,
): void {
  requireColour(colour);

  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(buffer.width, x + width);
  const bottom = Math.min(buffer.height, y + height);

  for (let row = top; row < bottom; row += 1) {
    let index = (row * buffer.width + left) * CHANNELS;
    for (let column = left; column < right; column += 1) {
      buffer.pixels[index] = colour[0];
      buffer.pixels[index + 1] = colour[1];
      buffer.pixels[index + 2] = colour[2];
      buffer.pixels[index + 3] = colour[3];
      index += CHANNELS;
    }
  }
}

/**
 * Paints the one-pixel edge of a rectangle, clipped to the buffer.
 *
 * The edge is drawn *inside* the rectangle, so a `width × height` outline spans
 * exactly the pixels `fillRect` would have painted and no others: the two calls
 * describe the same region, which is what lets a panel be filled and framed
 * without a caller having to reason about which side of the boundary it is on.
 * A rectangle too small to have an inside — one pixel wide, or one tall — is
 * drawn as the line it is rather than as a hole.
 */
export function strokeRect(
  buffer: PixelBuffer,
  x: number,
  y: number,
  width: number,
  height: number,
  colour: Rgba,
): void {
  requireColour(colour);
  if (width <= 0 || height <= 0) return;

  fillRect(buffer, x, y, width, 1, colour);
  fillRect(buffer, x, y + height - 1, width, 1, colour);
  fillRect(buffer, x, y, 1, height, colour);
  fillRect(buffer, x + width - 1, y, 1, height, colour);
}

/**
 * Composites one buffer over another at `(x, y)`, source over, clipped.
 *
 * The arithmetic is integer and exact, and it is straight-alpha source-over:
 * a source pixel at full alpha replaces, a source pixel at zero alpha is
 * skipped, and anything between blends colour *and* coverage the way the formula
 * says — the target's colour is weighted by its own alpha, and the result is
 * divided by the alpha that comes out. That division is what keeps the buffer
 * straight rather than premultiplied: a translucent red over nothing is still
 * red, not a darker red that the GPU darkens again when it premultiplies on
 * upload.
 *
 * This is what lets a glyph — drawn on a transparent buffer — be stamped onto a
 * plate without the generator knowing what is underneath it, and it is the whole
 * of `blit`: the common case of one buffer onto another *is* this function with
 * the whole source named, which is why the callers that want all of it use the
 * shorter name.
 *
 * @throws RangeError when the target is the source: compositing a buffer onto
 *   itself through an offset is a smear whose result depends on the direction
 *   of the walk, so it is refused rather than half-defined.
 */
export function blit(target: PixelBuffer, source: PixelBuffer, x: number, y: number): void {
  blitRegion(target, source, 0, 0, source.width, source.height, x, y);
}

/**
 * Composites one rectangle of a buffer onto another, source over, clipped.
 *
 * The same arithmetic as `blit`, applied to a region of the source rather than
 * all of it: this is what lets a tile be assembled out of the quadrants of four
 * materials — the dual grid of B3 copies an 8×8 quadrant at a time — and what
 * lets a sprite be cut out of a sheet.
 *
 * The region is refused when it is not whole or not inside the source, because
 * a caller asking for pixels that are not there is a bug in the caller; the
 * destination is clipped, because a caller composing against an edge should not
 * have to measure it first. A zero-width or zero-height region paints nothing.
 *
 * @throws RangeError when the target is the source, or the region is not a whole
 *   rectangle inside it.
 */
export function blitRegion(
  target: PixelBuffer,
  source: PixelBuffer,
  sourceX: number,
  sourceY: number,
  width: number,
  height: number,
  x: number,
  y: number,
): void {
  if (target === source) {
    throw new RangeError('a buffer cannot be blitted onto itself: the result would depend on walk order');
  }
  requireRegion(source, sourceX, sourceY, width, height);

  const left = Math.max(0, x);
  const top = Math.max(0, y);
  const right = Math.min(target.width, x + width);
  const bottom = Math.min(target.height, y + height);

  for (let row = top; row < bottom; row += 1) {
    for (let column = left; column < right; column += 1) {
      const sourceIndex =
        ((sourceY + row - y) * source.width + (sourceX + column - x)) * CHANNELS;
      const alpha = source.pixels[sourceIndex + 3] ?? 0;
      if (alpha === 0) continue;

      const targetIndex = (row * target.width + column) * CHANNELS;
      if (alpha === 255) {
        target.pixels[targetIndex] = source.pixels[sourceIndex] ?? 0;
        target.pixels[targetIndex + 1] = source.pixels[sourceIndex + 1] ?? 0;
        target.pixels[targetIndex + 2] = source.pixels[sourceIndex + 2] ?? 0;
        target.pixels[targetIndex + 3] = 255;
        continue;
      }

      const inverse = 255 - alpha;
      const underAlpha = target.pixels[targetIndex + 3] ?? 0;
      const outAlpha = alpha + (((underAlpha * inverse) / 255) | 0);

      for (let channel = 0; channel < CHANNELS - 1; channel += 1) {
        const over = source.pixels[sourceIndex + channel] ?? 0;
        const under = target.pixels[targetIndex + channel] ?? 0;
        target.pixels[targetIndex + channel] =
          ((over * alpha * 255 + under * underAlpha * inverse) / (255 * outAlpha)) | 0;
      }
      // The alpha channel composites as coverage, not as a colour: the source
      // contributes its own alpha outright and the remainder of the target's.
      target.pixels[targetIndex + 3] = outAlpha;
    }
  }
}

/**
 * A copy of a buffer turned a whole number of quarter turns clockwise.
 *
 * Rotation is a primitive of the pipeline rather than a trick of one generator:
 * the plan's autotiling is *five tiles plus rotation* rather than forty-seven
 * variants, so a single canonical piece turned four ways has to be exactly as
 * good as one drawn four times — and the only way to know that is for the turn
 * to be code the tests walk. The turn is clockwise because that is what a reader
 * assumes; a negative or absent turn is normalised, and a fractional one is
 * refused rather than rounded.
 *
 * A quarter turn that is a multiple of four still returns a fresh buffer: the
 * buffer is read-only as a value, but a caller that gets one back must not be
 * able to tell a rotation from an alias.
 *
 * @throws RangeError when the number of turns is not a whole number.
 */
export function rotateQuarterTurns(buffer: PixelBuffer, turns: number): PixelBuffer {
  if (!Number.isInteger(turns)) {
    throw new RangeError(`a rotation must be a whole number of quarter turns, got ${String(turns)}`);
  }

  const quarter = ((turns % 4) + 4) % 4;
  let turned = copyOf(buffer);

  for (let turn = 0; turn < quarter; turn += 1) turned = rotateOnce(turned);

  return turned;
}

/** One clockwise quarter turn: the pixel at `(x, y)` comes from `(y, height − 1 − x)`. */
function rotateOnce(buffer: PixelBuffer): PixelBuffer {
  const turned = createPixelBuffer(buffer.height, buffer.width);

  for (let y = 0; y < turned.height; y += 1) {
    for (let x = 0; x < turned.width; x += 1) {
      setPixel(turned, x, y, pixelAt(buffer, y, buffer.height - 1 - x));
    }
  }

  return turned;
}

/** A fresh buffer holding the same pixels and the same shape. */
function copyOf(buffer: PixelBuffer): PixelBuffer {
  const copy = createPixelBuffer(buffer.width, buffer.height);
  copy.pixels.set(buffer.pixels);

  return copy;
}

/**
 * The fingerprint of a buffer, as sixteen lowercase hexadecimal digits.
 *
 * FNV-1a, 64 bits, over the dimensions and then the bytes: the same shape and
 * the same pixels hash the same on every engine, which is what makes a
 * pixel-hash test a build gate rather than a coincidence. The dimensions are
 * part of the hash so that two buffers that happen to share a byte sequence but
 * not a shape cannot collide.
 *
 * Sixty-four bits for the same reason the state hash uses them: this decides
 * whether two renders are the same render, and a collision here would report an
 * unchanged generator while the art moved.
 */
export function hashPixelBuffer(buffer: PixelBuffer): string {
  const OFFSET_BASIS = 0xcbf29ce484222325n;
  const PRIME = 0x100000001b3n;
  const MASK_64 = 0xffffffffffffffffn;

  let hash = OFFSET_BASIS;
  const mix = (byte: number): void => {
    hash = ((hash ^ BigInt(byte)) * PRIME) & MASK_64;
  };

  for (const byte of [buffer.width, buffer.height]) {
    // Four bytes per dimension, least significant first: the buffer is the same
    // size on every engine, so this is exactly the shape, never a rounding of it.
    mix(byte & 0xff);
    mix((byte >>> 8) & 0xff);
    mix((byte >>> 16) & 0xff);
    mix((byte >>> 24) & 0xff);
  }
  for (let index = 0; index < buffer.pixels.length; index += 1) {
    mix(buffer.pixels[index] ?? 0);
  }

  return hash.toString(16).padStart(16, '0');
}

/** The byte index of a pixel, or a refusal naming the buffer that does not have it. */
function indexOf(buffer: PixelBuffer, x: number, y: number): number {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= buffer.width || y >= buffer.height) {
    throw new RangeError(
      `(${String(x)}, ${String(y)}) is outside a ${String(buffer.width)}×${String(buffer.height)} buffer`,
    );
  }

  return (y * buffer.width + x) * CHANNELS;
}

/** @throws RangeError when the dimension is not a positive integer. */
function requireDimension(value: number, what: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`a pixel buffer ${what} must be a positive integer, got ${String(value)}`);
  }
}

/** @throws RangeError when the region is not a whole rectangle inside the buffer. */
function requireRegion(buffer: PixelBuffer, x: number, y: number, width: number, height: number): void {
  if (!Number.isInteger(width) || width < 0 || !Number.isInteger(height) || height < 0) {
    throw new RangeError(
      `a blit region must have whole, non-negative sides, got ${String(width)}×${String(height)}`,
    );
  }
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x + width > buffer.width ||
    y + height > buffer.height
  ) {
    throw new RangeError(
      `the region (${String(x)}, ${String(y)}) ${String(width)}×${String(height)} is outside a ` +
        `${String(buffer.width)}×${String(buffer.height)} buffer`,
    );
  }
}

/** @throws RangeError when a channel is not an integer in [0, 255]. */
function requireColour(colour: Rgba): void {
  for (const channel of colour) {
    if (!Number.isInteger(channel) || channel < 0 || channel > 255) {
      throw new RangeError(
        `a colour channel must be an integer in [0, 255], got ${String(colour.join(','))}`,
      );
    }
  }
}
