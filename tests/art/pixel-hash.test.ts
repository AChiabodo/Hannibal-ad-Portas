/**
 * The pixel hashes: the generated output, pinned (ticket B2, PLAN §6).
 *
 * A hash that moves is either a bug in a generator or a decision taken on
 * purpose, and the difference is exactly what a reviewer wants to see in a diff.
 * So the numbers below are recorded, not derived: the expected value in each test
 * is the fingerprint of output somebody looked at and accepted, and a change to
 * a letterform, a shade or the plate's layout changes it.
 *
 * The pinning is deliberately coarse as well as fine. One hash covers the whole
 * Atelier plate — every glyph and every ramp in their places — so a change
 * anywhere in the layout is visible in one line; the per-glyph and per-ramp
 * hashes say *which* artefact moved.
 */
import { describe, expect, it } from 'vitest';
import { catalogue, cataloguePlate } from '../../src/art/catalogue';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';
import { titlePlate } from '../../src/art/title';

/** The fingerprints recorded from the generators as accepted. */
const PLATE_HASH = '224fbb946b77d04d';
const TITLE_HASH = 'db817c162bf51e43';

const GLYPH_HASHES: Readonly<Record<string, string>> = {
  'glyph:U+0020': '19ce279ecc93e509',
  'glyph:U+0041': 'aae456011072287d',
  'glyph:U+0061': 'b702478adf79d775',
  'glyph:U+00E0': '83010f42b9f116f9',
  'glyph:U+00E9': '88ac51037ebf01b9',
  'glyph:U+00D9': '97f51eff418d6c5e',
  'ramp:stone': 'd0007ed617908b29',
  'ramp:parchment': '6371c17806297e2f',
};

describe('the generated output, as a fingerprint', () => {
  it('pins the whole catalogue plate, layout and all', () => {
    expect(hashPixelBuffer(cataloguePlate())).toBe(PLATE_HASH);
  });

  it('pins the game page’s first screen', () => {
    expect(hashPixelBuffer(titlePlate())).toBe(TITLE_HASH);
  });

  it('pins the artefacts inside the plate, so a hash says which one moved', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const [name, hash] of Object.entries(GLYPH_HASHES)) {
      const buffer = entries.get(name);
      expect(buffer, name).toBeDefined();
      expect(hashPixelBuffer(buffer!), name).toBe(hash);
    }
  });
});
