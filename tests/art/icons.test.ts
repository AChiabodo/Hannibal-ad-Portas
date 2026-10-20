/**
 * The command icons and badges (#55).
 *
 * A picture a Player presses is judged by two things a test can hold: it is
 * *there* and it is *itself*. So these assertions are about ink and silhouette —
 * every icon fills part of its tile, no two command verbs share a shape, a muted
 * copy is one shade, and the badges are small enough to stand beside a numeral.
 * Whether an arrow reads as "march there" is a human question; the Atelier shows
 * them for exactly that, and the plate test pins the pixels that were accepted.
 */
import { describe, expect, it } from 'vitest';
import {
  BADGE_ART,
  BADGE_NAMES,
  BADGE_TILE,
  COMMAND_ART,
  COMMAND_ICON_NAMES,
  ICON_TILE,
  badgeIcon,
  commandIcon,
  iconEntries,
} from '../../src/art/icons.ts';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer.ts';

/** An icon's silhouette: which pixels have ink, with its colours thrown away. */
function silhouette(buffer: PixelBuffer): string {
  return Array.from({ length: buffer.height }, (_unused, y) =>
    Array.from({ length: buffer.width }, (_pixel, x) => (pixelAt(buffer, x, y)[3] === 0 ? '.' : '#')).join(''),
  ).join('\n');
}

/** How many colours an icon paints, and how many of them are opaque. */
function inks(buffer: PixelBuffer): ReadonlySet<string> {
  const seen = new Set<string>();
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const colour = pixelAt(buffer, x, y);
      if (colour[3] !== 0) seen.add(colour.join(','));
    }
  }

  return seen;
}

describe('the command icons', () => {
  it('draws every verb on one tile, with ink on it', () => {
    for (const name of COMMAND_ICON_NAMES) {
      const buffer = commandIcon(name);

      expect(buffer.width, name).toBe(ICON_TILE);
      expect(buffer.height, name).toBe(ICON_TILE);
      expect(inks(buffer).size, name).toBeGreaterThan(0);
      expect(pixelAt(buffer, 0, 0), `${name} keeps its corner clear`).toEqual([0, 0, 0, 0]);
      expect(COMMAND_ART[name].length).toBe(ICON_TILE);
    }
  });

  it('gives every verb a silhouette of its own', () => {
    const seen = new Map<string, string>();

    for (const name of COMMAND_ICON_NAMES) {
      const shape = silhouette(commandIcon(name));
      const other = seen.get(shape);
      expect(other, `${name} and ${String(other)} are the same picture`).toBeUndefined();
      seen.set(shape, name);
    }
  });

  it('draws an unusable command in one muted shade, keeping its shape', () => {
    for (const name of COMMAND_ICON_NAMES) {
      const normal = commandIcon(name);
      const muted = commandIcon(name, { muted: true });

      expect(silhouette(muted), name).toBe(silhouette(normal));
      expect(inks(muted).size, name).toBe(1);
      expect(hashPixelBuffer(muted), name).not.toBe(hashPixelBuffer(normal));
    }
  });
});

describe('the badges', () => {
  it('draws every cost, figure and lock small enough for a row', () => {
    for (const name of BADGE_NAMES) {
      const buffer = badgeIcon(name);

      expect(buffer.width, name).toBe(BADGE_TILE);
      expect(buffer.height, name).toBe(BADGE_TILE);
      expect(inks(buffer).size, name).toBeGreaterThan(0);
      expect(BADGE_ART[name].length).toBe(BADGE_TILE);
    }
  });

  it('gives every badge a shape of its own', () => {
    const seen = new Map<string, string>();

    for (const name of BADGE_NAMES) {
      const shape = silhouette(badgeIcon(name));
      const other = seen.get(shape);
      expect(other, `${name} and ${String(other)} are the same picture`).toBeUndefined();
      seen.set(shape, name);
    }
  });
});

describe('the catalogue of icons', () => {
  it('names every command icon and every badge once', () => {
    const names = iconEntries().map((entry) => entry.name);

    expect(names).toEqual([
      ...COMMAND_ICON_NAMES.map((name) => `icon:${name}`),
      ...BADGE_NAMES.map((name) => `badge:${name}`),
    ]);
    expect(new Set(names).size).toBe(names.length);
  });
});
