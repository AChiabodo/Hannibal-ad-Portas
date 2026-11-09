/**
 * The resource markers (ticket B3).
 *
 * The ticket asks that resource nodes stay legible at every zoom level, and the
 * lowest zoom shows one screen pixel per map pixel, so a marker has to be
 * distinguishable up close *and* from a distance. Four claims are worth holding:
 * every kind the economy counts has a marker, the art table is well formed, the
 * four silhouettes differ, and a marker leaves the ground showing through it —
 * because a node is a thing standing on the map, not a kind of ground.
 *
 * The silhouette assertions are the interesting ones, and they are properties
 * rather than copies of the table: grain taller than wide, timber wider than
 * tall, stone widening all the way down, iron narrowing after it widens, and no
 * two profiles the same. A copy of the table would pass whatever the table said.
 */
import { describe, expect, it } from 'vitest';
import { MARKER_ART, NODE_KINDS, NODE_TILE, nodeEntries, nodeMarker } from '../../src/art/nodes';
import { TRANSPARENT, hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import { MATERIALS, materialTile } from '../../src/art/terrain';
import { brightness } from './brightness';


/** A marker's ink, as rows of `#` and `.`. */
function picture(buffer: PixelBuffer): string[] {
  return Array.from({ length: buffer.height }, (_, y) =>
    Array.from({ length: buffer.width }, (_, x) => (pixelAt(buffer, x, y)[3] === 0 ? '.' : '#')).join(''),
  );
}

/** How wide the ink is on each row, from the top down; zero where there is none. */
function rowWidths(buffer: PixelBuffer): number[] {
  return picture(buffer).map((row) => [...row].filter((pixel) => pixel === '#').length);
}

/** The mean colour of a marker's ink, which is how the four are told apart at low zoom. */
function meanInk(buffer: PixelBuffer): readonly [number, number, number] {
  const sum = [0, 0, 0];
  let seen = 0;

  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const colour = pixelAt(buffer, x, y);
      if (colour[3] === 0) continue;

      sum[0] = (sum[0] ?? 0) + colour[0];
      sum[1] = (sum[1] ?? 0) + colour[1];
      sum[2] = (sum[2] ?? 0) + colour[2];
      seen += 1;
    }
  }

  return [(sum[0] ?? 0) / seen, (sum[1] ?? 0) / seen, (sum[2] ?? 0) / seen];
}

/** An ink profile: how wide it is, how tall it is, and what colour it is. */
function profile(buffer: PixelBuffer): { readonly widths: number[]; readonly wide: number; readonly tall: number } {
  const rows = rowWidths(buffer);
  const inked = rows.filter((width) => width > 0);

  return { widths: rows, wide: Math.max(0, ...rows), tall: inked.length };
}

describe('the marker art', () => {
  it('is a table of whole tiles: one per kind, sixteen rows of sixteen pixels', () => {
    for (const kind of NODE_KINDS) {
      const rows = MARKER_ART[kind];

      expect(rows.length, kind).toBe(NODE_TILE);
      for (const [index, row] of rows.entries()) {
        expect(row.length, `${kind} row ${String(index)}`).toBe(NODE_TILE);
        expect([...row].every((pixel) => '.bld'.includes(pixel)), `${kind} row ${String(index)}`).toBe(true);
      }
    }
  });
});

describe('a resource marker', () => {
  it('is a whole tile, and it is the same marker every time it is asked', () => {
    for (const kind of NODE_KINDS) {
      const marker = nodeMarker(kind);

      expect([marker.width, marker.height], kind).toEqual([NODE_TILE, NODE_TILE]);
      expect(hashPixelBuffer(marker)).toBe(hashPixelBuffer(nodeMarker(kind)));
    }

    expect(new Set(NODE_KINDS.map((kind) => hashPixelBuffer(nodeMarker(kind)))).size).toBe(NODE_KINDS.length);
  });

  it('leaves the ground showing through, so a node is on the map rather than instead of it', () => {
    for (const kind of NODE_KINDS) {
      const marker = nodeMarker(kind);
      const inked = rowWidths(marker).reduce((total, width) => total + width, 0);

      // A marker is a small pile, not a repaint of the tile: it covers well under
      // half of it, and its four corners are ground.
      expect(inked, kind).toBeGreaterThan(40);
      expect(inked, kind).toBeLessThan((NODE_TILE * NODE_TILE) / 2);
      for (const [x, y] of [
        [0, 0],
        [NODE_TILE - 1, 0],
        [0, NODE_TILE - 1],
        [NODE_TILE - 1, NODE_TILE - 1],
      ] as const) {
        expect(pixelAt(marker, x, y), `${kind} corner`).toEqual(TRANSPARENT);
      }
    }
  });

  it('gives each kind a silhouette of its own, before colour is considered', () => {
    const profiles = new Map(NODE_KINDS.map((kind) => [kind, profile(nodeMarker(kind))]));
    const grain = profiles.get('grain');
    const timber = profiles.get('timber');
    const stone = profiles.get('stone');
    const iron = profiles.get('iron');
    if (grain === undefined || timber === undefined || stone === undefined || iron === undefined) {
      throw new Error('a marker is missing');
    }

    // Grain is the only marker taller than it is wide; timber the only flat one.
    expect(grain.tall).toBeGreaterThan(grain.wide);
    expect(timber.wide).toBeGreaterThan(timber.tall);

    // Stone is a heap: it widens as it falls and its widest row is at its foot.
    const inked = stone.widths.filter((width) => width > 0);
    const widest = inked.indexOf(Math.max(...inked));
    expect(inked.slice(0, widest)).toEqual([...inked.slice(0, widest)].sort((a, b) => a - b));
    expect(widest).toBeGreaterThanOrEqual(inked.length / 2);
    expect(inked[0] ?? 99).toBeLessThan((inked[widest] ?? 0) / 2);

    // Iron is a diamond: it widens, then narrows again, symmetrically.
    const diamond = iron.widths.filter((width) => width > 0);
    expect(diamond).toEqual([...diamond].reverse());
    expect(diamond.indexOf(Math.max(...diamond))).toBeGreaterThan(0);
    expect(diamond.lastIndexOf(Math.max(...diamond))).toBeLessThan(diamond.length - 1);

    // Four profiles, four different sets of rows: no two markers could be taken
    // for one another at any zoom.
    const shapes = new Set([...profiles.values()].map((entry) => entry.widths.join(',')));
    expect(shapes.size).toBe(4);
  });

  it('keeps iron the dark one and grain the light one, so colour agrees with shape', () => {
    const lightness = (kind: (typeof NODE_KINDS)[number]): number => {
      const mean = meanInk(nodeMarker(kind));

      return mean[0] + mean[1] + mean[2];
    };

    expect(lightness('iron')).toBeLessThan(lightness('stone'));
    expect(lightness('stone')).toBeLessThan(lightness('grain'));
    expect(lightness('timber')).toBeLessThan(lightness('grain'));
  });

  it('names every marker for the catalogue', () => {
    const entries = nodeEntries();

    expect(entries.map((entry) => entry.name)).toEqual(NODE_KINDS.map((kind) => `node:${kind}`));
    for (const [index, entry] of entries.entries()) {
      expect(hashPixelBuffer(entry.buffer)).toBe(hashPixelBuffer(nodeMarker(NODE_KINDS[index] ?? 'grain')));
    }
  });

  it('reads on every terrain it can stand on, including the quietened one', () => {
    // Ticket U5 quietened the terrain's own dither. A marker is a thing standing on
    // that ground, so it has to be the loudest of the two: some shade of it must sit
    // at least two detail steps away from the whole range of the ground under it, and
    // its own range must be wide enough that its silhouette is drawn in contrast and
    // not in one flat tone.
    for (const kind of NODE_KINDS) {
      const marker = brightness(nodeMarker(kind));
      expect(marker.high - marker.low, `${kind} range`).toBeGreaterThanOrEqual(60);

      for (const material of MATERIALS) {
        const terrain = brightness(materialTile(material));
        const reach = Math.max(terrain.low - marker.low, marker.high - terrain.high);

        expect(reach, `${kind} on ${material}`).toBeGreaterThanOrEqual(24);
      }
    }
  });
});
