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
 *
 * #57 added ten artefacts and moved the plate they are drawn on: the two Factions'
 * villages, a Stronghold whole, hurt, breached and under the ram, and the two
 * remembered places. Every hash already pinned above is untouched, which is the
 * other half of that review.
 *
 * #58 added thirteen more and moved the plate again: the two Factions' standards,
 * the two destination marks, the four facing chevrons and the five condition
 * shapes. Every figure, icon, badge, terrain tile, settlement and marker pinned
 * before them is byte-identical, so the ticket's claim — the readability work
 * extends the art rather than repainting it — is a diff and not a promise.
 */
import { describe, expect, it } from 'vitest';
import { catalogue, cataloguePlate } from '../../src/art/catalogue';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';

/** The fingerprints recorded from the generators as accepted. */
// U9: deliberately add the reviewed UI surfaces and real layout specimens.
const PLATE_HASH = 'dc7f9ff9c7d18c58';

const ARTEFACT_HASHES: Readonly<Record<string, string>> = {
  'ui:carthage-column': '4b56aa9f36f49c4a',
  'ui:carthage-line': '73b1d1b02cffe05a',
  'ui:rome-column': 'a08469a1781f8143',
  'ui:rome-line': 'fde3a2c084513c3a',
  'interface:idle': '949bdad4ac7c1977',
  'interface:selected': '441968d0f235a997',
  'interface:armed': '7ccadea48dd904b7',
  'interface:disabled': '4612506f4557e9b7',
  'interface:focus': '74aad50e7b9be297',
  'ui:setup': '82906ab423edd8b4',
  'ui:squad': '69db12c004c98aa7',
  'ui:armed-pending': 'be5b1e5381012a2d',
  'ui:construction': '02bca410e02e4c6e',
  'ui:options': '1e03d0df52d0241e',
  'ui:result': 'e641e2c442783d44',
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
  'icon:move': '952e726e0eb37f6a',
  'icon:attackMove': '53964edea73a915a',
  'icon:attack': '11b74db46105d1bd',
  'icon:hold': 'a5f3b42e4270dc84',
  'icon:withdraw': 'cb788016de9614fa',
  'icon:line': '283aa81ffa65652a',
  'icon:column': 'b3e799eba94c99d2',
  'icon:garrison': 'c7dd4c2e78f23077',
  'icon:assault': 'd874def643ce88c4',
  'icon:blockade': '81721f3e3139d215',
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
  // U6's settlements and fortifications: every specimen the plate shows — both
  // Factions' villages, the Stronghold whole, hurt and breached, the ram at the
  // gate, and the two remembered places. A wall that moves a pixel names itself.
  'site:settlement:rome:seen': 'c7b555092feaf0e2',
  'site:settlement:carthage:seen': '16d868332ca91372',
  'site:settlement:none:seen': 'bb2d39411b17668b',
  'site:stronghold:rome:intact': 'a650634053d52c2f',
  'site:stronghold:carthage:intact': '11df68855b2d1f4f',
  'site:stronghold:rome:damaged': '159ffa5a964fd8a3',
  'site:stronghold:rome:breached': '5117cc405309552d',
  'site:stronghold:rome:ram': '007bcdd1e7429921',
  'site:stronghold:carthage:remembered': '36df808b07115242',
  'site:settlement:rome:remembered': 'e81000f94b859fe8',
  // #58's insignia and ground marks: the two Factions' standards, the two
  // destination marks, the four facing chevrons and the five condition shapes.
  // The marks are drawn over both Factions' ground, so a pixel that moves in one
  // is a pixel somebody has to look at on grass, on forest and on a memory.
  'insignia:rome': '427559bbe6cfc0ce',
  'insignia:carthage': '51c811280a90e122',
  'mark:order:move': '0c5953cd1b170478',
  'mark:order:attackMove': 'b0fdd0d2423547df',
  'mark:facing:north': '9229abeef65d5db0',
  'mark:facing:east': '95a103c8dcf87170',
  'mark:facing:south': '349a8aaec57aabc8',
  'mark:facing:west': '64f66cceb4f00008',
  'mark:condition:routing': 'ec5b91d595ee7e20',
  'mark:condition:unpaid': 'cca7758a3e055265',
  'mark:condition:noSupply': 'fc46a87d61647745',
  'mark:condition:fatigue': '530365334b02ec14',
  'mark:condition:noAmmunition': '527b196711c5c0c5',
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
