/**
 * The PNG encoder (ticket B2, ADR-0002).
 *
 * An encoder is only believable if a decoder can read what it wrote, so these
 * tests decode: the chunk structure is parsed, the image data is inflated, and the
 * scanlines are compared with the pixels that went in. Nothing here trusts the
 * encoder's own idea of what it produced.
 */
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { encodePng, PNG_SIGNATURE } from '../../src/cli/png';
import { createPixelBuffer, hashPixelBuffer, setPixel, type PixelBuffer } from '../../src/art/pixel-buffer';

const RED = [255, 0, 0, 255] as const;
const BLUE = [0, 0, 255, 128] as const;

/** One PNG chunk, as a reader sees it: its type, its data, and the CRC the file claims. */
interface Chunk {
  readonly type: string;
  readonly data: Uint8Array;
  readonly crc: number;
}

const CRC_TABLE = ((): Uint32Array => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
})();

/** The CRC-32 of some bytes, computed here rather than taken from the encoder. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** Splits a PNG into its chunks, checking the signature and every length along the way. */
function chunksOf(png: Uint8Array): readonly Chunk[] {
  expect([...png.subarray(0, 8)]).toEqual([...PNG_SIGNATURE]);

  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let at = 8;

  while (at < png.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(...png.subarray(at + 4, at + 8));
    const data = png.subarray(at + 8, at + 8 + length);
    const crc = view.getUint32(at + 8 + length);
    expect(crc, `the CRC of ${type}`).toBe(crc32(png.subarray(at + 4, at + 8 + length)));
    chunks.push({ type, data, crc });
    at += 12 + length;
  }

  return chunks;
}

/** The RGBA pixels a PNG holds, decoded from its header, its inflated data and its filters. */
function decode(png: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  const chunks = chunksOf(png);
  const header = chunks[0];
  const data = chunks[1];
  const end = chunks[2];
  if (header === undefined || data === undefined) throw new Error('the PNG has no header or no image data');

  expect(header.type).toBe('IHDR');
  expect(data.type).toBe('IDAT');
  expect(end?.type).toBe('IEND');
  expect(end?.data.length).toBe(0);

  const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
  const width = view.getUint32(0);
  const height = view.getUint32(4);
  expect(header.data[8]).toBe(8);
  expect(header.data[9]).toBe(6);
  expect(header.data[10]).toBe(0);
  expect(header.data[11]).toBe(0);
  expect(header.data[12]).toBe(0);

  const raw = new Uint8Array(inflateSync(data.data));
  const stride = width * 4;
  expect(raw.length).toBe((stride + 1) * height);

  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    expect(raw[y * (stride + 1)], `the filter of row ${String(y)}`).toBe(0);
    pixels.set(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), y * stride);
  }

  return { width, height, pixels };
}

/** A small buffer with a colour in every corner and a transparent middle. */
function sample(): PixelBuffer {
  const buffer = createPixelBuffer(3, 2);
  setPixel(buffer, 0, 0, RED);
  setPixel(buffer, 1, 0, BLUE);
  setPixel(buffer, 2, 0, [1, 2, 3, 4]);
  setPixel(buffer, 0, 1, [16, 32, 64, 128]);
  setPixel(buffer, 1, 1, [255, 255, 255, 255]);
  setPixel(buffer, 2, 1, [0, 0, 0, 0]);

  return buffer;
}

describe('encoding a pixel buffer as a PNG', () => {
  it('writes a file a decoder can read back, pixel for pixel', () => {
    const buffer = sample();
    const decoded = decode(encodePng(buffer));

    expect(decoded.width).toBe(3);
    expect(decoded.height).toBe(2);
    expect([...decoded.pixels]).toEqual([...buffer.pixels]);
  });

  it('is the same bytes every time, for the same pixels', () => {
    expect([...encodePng(sample())]).toEqual([...encodePng(sample())]);
  });

  it('keeps the pixels even when nothing compressible is in them', () => {
    const buffer = createPixelBuffer(4, 4);
    for (let index = 0; index < buffer.pixels.length; index += 1) {
      buffer.pixels[index] = (index * 37) % 256;
    }

    const decoded = decode(encodePng(buffer));

    expect([...decoded.pixels]).toEqual([...buffer.pixels]);
  });

  it('encodes a plate-sized buffer, which is what the bake step actually writes', () => {
    const buffer = createPixelBuffer(136, 191, RED);
    const decoded = decode(encodePng(buffer));

    expect(decoded.width).toBe(136);
    expect(decoded.height).toBe(191);
    expect(hashPixelBuffer(buffer)).toMatch(/^[0-9a-f]{16}$/);
    expect([...decoded.pixels.subarray(0, 8)]).toEqual([255, 0, 0, 255, 255, 0, 0, 255]);
  });
});
