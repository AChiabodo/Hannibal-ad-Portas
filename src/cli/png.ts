/**
 * A PNG encoder, in the repository's own code.
 *
 * The bake step writes the catalogue out as files so that a human or an agent can
 * open the art without a browser — which is the whole argument for baking at all,
 * since the runtime regenerates everything from the same library (ADR-0002). That
 * needs an encoder, and this one is written here rather than taken from a package
 * for two reasons. The repository has one runtime dependency and is careful with
 * it; and a PNG is a format this code only ever *writes*, of one narrow shape —
 * 8-bit RGBA, no interlacing, filter type zero — so the writer fits in a page and
 * can be tested by inflating its own output back and comparing the pixels.
 *
 * It is deliberately unambitious. Filter zero on every row means the scanlines in
 * the file are the buffer's pixels with one byte in front of each row, which makes
 * a round-trip test exact rather than approximate and keeps the decoder on the
 * other side simple. Compression is whatever `zlib` does at its default level:
 * **the file bytes are a build product, not a contract** — the contract is the
 * pixel hash of the buffer that went in (`hashPixelBuffer`), which is the same
 * number on every machine, while these bytes need only be stable on one.
 */
import { deflateSync } from 'node:zlib';
import type { PixelBuffer } from '../art/pixel-buffer.ts';

/** The eight bytes every PNG starts with, which is also how a reader knows it is one. */
export const PNG_SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Bytes per pixel in the only colour type this encoder writes: RGBA, eight bits each. */
const BYTES_PER_PIXEL = 4;

/** Colour type 6: truecolour with alpha. The one shape the art library produces. */
const COLOUR_TYPE_RGBA = 6;

/** Bit depth 8: one byte per channel, which is what a `PixelBuffer` holds. */
const BIT_DEPTH = 8;

/** Filter type 0: none. Rows are written as they are. */
const FILTER_NONE = 0;

/**
 * One `PixelBuffer` as the bytes of a PNG file.
 *
 * The result is a `Uint8Array` because that is what a caller writes to disk; it is
 * not a `Buffer`, so nothing downstream acquires a Node type it did not ask for.
 */
export function encodePng(buffer: PixelBuffer): Uint8Array {
  return concat([
    Uint8Array.from(PNG_SIGNATURE),
    chunk('IHDR', headerOf(buffer)),
    chunk('IDAT', deflateSync(scanlinesOf(buffer))),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** The thirteen bytes of an `IHDR`: size, and the four decisions this encoder fixes. */
function headerOf(buffer: PixelBuffer): Uint8Array {
  const header = new Uint8Array(13);
  writeUint32(header, 0, buffer.width);
  writeUint32(header, 4, buffer.height);
  header[8] = BIT_DEPTH;
  header[9] = COLOUR_TYPE_RGBA;
  header[10] = 0;
  header[11] = FILTER_NONE;
  header[12] = 0;

  return header;
}

/** The image data as PNG stores it: one filter byte, then a row of RGBA. */
function scanlinesOf(buffer: PixelBuffer): Uint8Array {
  const stride = buffer.width * BYTES_PER_PIXEL;
  const raw = new Uint8Array((stride + 1) * buffer.height);

  for (let y = 0; y < buffer.height; y += 1) {
    const at = y * (stride + 1);
    raw[at] = FILTER_NONE;
    raw.set(buffer.pixels.subarray(y * stride, (y + 1) * stride), at + 1);
  }

  return raw;
}

/** One PNG chunk: its length, its type, its data, and a CRC over the last two. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  writeUint32(out, 0, data.length);

  for (let index = 0; index < 4; index += 1) {
    out[4 + index] = type.charCodeAt(index);
  }
  out.set(data, 8);
  writeUint32(out, 8 + data.length, crc32(out.subarray(4, 8 + data.length)));

  return out;
}

/** @param target @param offset @param value Big-endian, as PNG's fields are. */
function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

/** The CRC-32 table, built once: PNG's checksum, the one every chunk carries. */
const CRC_TABLE: Uint32Array = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

/** The CRC-32 of some bytes, as PNG defines it: reflected, initial and final value all ones. */
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < bytes.length; index += 1) {
    crc = (CRC_TABLE[(crc ^ (bytes[index] ?? 0)) & 0xff] ?? 0) ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/** One array holding every part, in order. */
function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((length, part) => length + part.length, 0);
  const out = new Uint8Array(total);

  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }

  return out;
}
