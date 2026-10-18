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

/** The fingerprints recorded from the generators as accepted. */
const PLATE_HASH = '7ac48ab2397a7363';

const ARTEFACT_HASHES: Readonly<Record<string, string>> = {
  'glyph:U+0020': '19ce279ecc93e509',
  'glyph:U+0041': 'aae456011072287d',
  'glyph:U+0061': 'b702478adf79d775',
  'glyph:U+00E0': '83010f42b9f116f9',
  'glyph:U+00E9': '88ac51037ebf01b9',
  'glyph:U+00D9': '97f51eff418d6c5e',
  'ramp:stone': 'd0007ed617908b29',
  'ramp:parchment': '6371c17806297e2f',
  'terrain:plain': 'a38e504004e2b885',
  'terrain:river': '071c4ea85185bd39',
  'terrain:forest:1': 'ca8c7a531f8ac267',
  'terrain:forest:3': '05220f100872dc91',
  'terrain:ford:15': '7d34527f96548791',
  'road:5': '1c9614c06266f59d',
  'road:15': '6cbfe1095e247ff4',
  'node:grain': '66279bf415efe8ad',
  'node:timber': 'eaae50b95335f381',
  'node:stone': 'a0aa54a966b9308f',
  'node:iron': 'b7b8ef7b02238245',
  // C2's soldiers: one hash per figure, direction and frame, so a change to a
  // helmet, a shield or a stride names itself.
  'figure:hastati:south:idle': 'f0efdd16ff33d615',
  'figure:hastati:south:walk:0': 'fbfcbd329e1c5b56',
  'figure:hastati:south:walk:1': 'f066906df8ef1777',
  'figure:hastati:south:attack:1': '9ba58ddc8139ec6c',
  'figure:hastati:south:death': 'da59746b7721e844',
  'figure:hastati:north:idle': '24bdb2b2bc8df020',
  'figure:hastati:east:idle': 'e4156d4064e24cb3',
  'figure:hastati:west:idle': '86d3ae1c38343c17',
  'figure:principes:south:idle': '13763da87015a35e',
  'figure:triarii:south:idle': '9247c68e448e0b34',
  // C4's Carthaginian roster: one hash per type's standing figure, so a shield,
  // a weapon or a head that changes names itself — plus the elephant's charge
  // and the horseman's march, which are the two drawings the roster exists for.
  'figure:libyan-spear:south:idle': 'dbcff7db994d33a4',
  'figure:gaul:south:idle': '8e9767edc980893c',
  'figure:iberian-sword:south:idle': '33709a5cd986f259',
  'figure:balearic-slinger:south:idle': '4b8ab0f882951281',
  'figure:numidian-horse:south:idle': '000f94dab4dfd8ec',
  'figure:numidian-horse:east:walk:0': '9923090e82ac63e7',
  'figure:elephant:south:idle': 'e7ecfa834be92b5d',
  'figure:elephant:south:attack:1': '480d980f6dc7b225',
};

describe('the generated output, as a fingerprint', () => {
  it('pins the whole catalogue plate, layout and all', () => {
    expect(hashPixelBuffer(cataloguePlate())).toBe(PLATE_HASH);
  });

  it('pins the artefacts inside the plate, so a hash says which one moved', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const [name, hash] of Object.entries(ARTEFACT_HASHES)) {
      const buffer = entries.get(name);
      expect(buffer, name).toBeDefined();
      expect(hashPixelBuffer(buffer!), name).toBe(hash);
    }
  });
});
