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
 *
 * U5 moved five of them on purpose: every terrain hash pinned here (four materials,
 * one of them pinned as two of its variants) and the plate they sit in. Nothing else
 * did — the glyphs, the ramps, the road path, the four markers and every figure and
 * icon are byte-identical before and after, which is what "the terrain was quietened
 * and nothing else was touched" looks like as a diff.
 */
import { describe, expect, it } from 'vitest';
import { catalogue, cataloguePlate } from '../../src/art/catalogue';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';

/** The fingerprints recorded from the generators as accepted. */
const PLATE_HASH = '710051d5f6f235ab';

const ARTEFACT_HASHES: Readonly<Record<string, string>> = {
  'glyph:U+0020': '19ce279ecc93e509',
  'glyph:U+0041': 'aae456011072287d',
  'glyph:U+0061': 'b702478adf79d775',
  'glyph:U+00E0': '83010f42b9f116f9',
  'glyph:U+00E9': '88ac51037ebf01b9',
  'glyph:U+00D9': '97f51eff418d6c5e',
  'ramp:stone': 'd0007ed617908b29',
  'ramp:parchment': '6371c17806297e2f',
  'terrain:plain': 'd14d3e402472f841',
  'terrain:river': 'a2579b9a216a4285',
  'terrain:forest:1': '13d735e83c0f4576',
  'terrain:forest:3': '39b83fd25393c7fe',
  'terrain:ford:15': '8eba09ba35bdbb45',
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
  // #55's command card: one hash per verb, so an icon that is redrawn names
  // itself — and a few badges, which are read beside a numeral.
  'icon:move': '5142f40c96217728',
  'icon:attackMove': '3b0b502fd6b469ae',
  'icon:attack': 'dfeb67d910a4d845',
  'icon:hold': 'abe4fec9919d673d',
  'icon:withdraw': 'b85e658d3f72c5c8',
  'icon:line': '31ffc0b2375ad82b',
  'icon:column': '8cb3b931c70e7785',
  'icon:garrison': 'a88f53fe932cee07',
  'icon:assault': '45243b1dfa42d88f',
  'icon:blockade': '5eadf658dd51a5d9',
  'badge:grain': 'c018f12758926e0a',
  'badge:clock': '0ee8bfa2e5051795',
  'badge:lock': '8d7b02a5b46f1b25',
  // U5's separation specimens: three tiles of a material with one man of each
  // Faction on the middle one, which is the picture the quietened terrain is judged
  // in. All fourteen, because each is a different material under a different cloth
  // and a hedge that moved in one of them is a hedge somebody has to look at.
  'separation:rome:plain': '83fe728217f3eaff',
  'separation:rome:hill': '9247c82ee8dc1095',
  'separation:rome:forest': 'e5c24ca102580feb',
  'separation:rome:farmland': '8bd52bafa2e89454',
  'separation:rome:river': '745161bdd3b3ec35',
  'separation:rome:ford': '5d8c929f199091f5',
  'separation:rome:road': '0b256ceac290a94c',
  'separation:carthage:plain': '76808fb7790ed23c',
  'separation:carthage:hill': '7d777f56babd487e',
  'separation:carthage:forest': '6a392e89171d6bb0',
  'separation:carthage:farmland': '763c93861c592be6',
  'separation:carthage:river': 'b712216999d83b80',
  'separation:carthage:ford': '1b249e7404e701ab',
  'separation:carthage:road': '4433626c7b132ec0',
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
