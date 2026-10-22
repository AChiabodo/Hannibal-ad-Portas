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
// P2 moved the squad specimens and the plate they sit on: the panel now shows a
// Squad's recruited capacity beside its survivors, which is a reviewed change.
// #66 moved them again, and only them: a Squad's panel now states its `Forza` —
// the bearing the exchange, a wall's defence and the AI's estimate all read — so
// the `ui:squad` and `ui:armed-pending` specimens (one panel, armed and idle) and
// the plate they sit on are what differ, and every other artefact is
// byte-identical.
// #69's revision gives construction offers separate name/cost lines and a two-column grid.
// All other catalogue artefacts retain their accepted hashes.
// The saved panel selector changes only the Options and result specimens.
const PLATE_HASH = 'd0a5e8a32afad83a';

const ARTEFACT_HASHES: Readonly<Record<string, string>> = {
  'ui:carthage-column': 'ab1340faad9c09ab',
  'ui:carthage-line': 'd86ca6e857fa2dc9',
  'ui:rome-column': '2e0424cbc5e9b70c',
  'ui:rome-line': '834358201fe88f22',
  'interface:idle': '949bdad4ac7c1977',
  'interface:selected': '441968d0f235a997',
  'interface:armed': '7ccadea48dd904b7',
  'interface:disabled': '4612506f4557e9b7',
  'interface:focus': '74aad50e7b9be297',
  'ui:setup': '82906ab423edd8b4',
  'ui:squad': '81e4974ec630d5ef',
  'ui:armed-pending': '6817ec6aeea8726d',
  'ui:construction': '369b6a8567d735db',
  'ui:options': 'bede2ea6d7e599a2',
  'ui:result': 'bdf1e8a2adc62be0',
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
  'figure:hastati:south:idle': '5f425298fbbdcaf9',
  'figure:hastati:south:walk:0': '1aec5aa0bd5661e2',
  'figure:hastati:south:walk:1': '833b81f548d937eb',
  'figure:hastati:south:attack:1': '6292f4236dfd06a4',
  'figure:hastati:south:death': 'da59746b7721e844',
  'figure:hastati:north:idle': '7594a1c1fff0d694',
  'figure:hastati:east:idle': 'e1151c72ce416f21',
  'figure:hastati:west:idle': '414a38b1a40b01bd',
  'figure:principes:south:idle': '470188abada6578d',
  'figure:triarii:south:idle': 'ac3eeea399cf5840',
  // C4's Carthaginian roster: one hash per type's standing figure, so a shield,
  // a weapon or a head that changes names itself — plus the elephant's charge
  // and the horseman's march, which are the two drawings the roster exists for.
  'figure:libyan-spear:south:idle': 'a6e9ec6f1e2c3c5e',
  'figure:gaul:south:idle': 'bf50786ec4a03256',
  'figure:iberian-sword:south:idle': 'acde20593facce2b',
  'figure:balearic-slinger:south:idle': 'f3f3b17ad453307b',
  'figure:numidian-horse:south:idle': '93bf4c8e53714592',
  'figure:numidian-horse:east:walk:0': '35c1d3daec923555',
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
  'separation:rome:plain': '79a41f36c96fe0e3',
  'separation:rome:hill': 'c49f46eec5984021',
  'separation:rome:forest': '8937f1614c4789e3',
  'separation:rome:farmland': '38e32302b0235830',
  'separation:rome:river': 'b6902e2d099e98f5',
  'separation:rome:ford': '43ab50a8dbcd01cd',
  'separation:rome:road': '950d77ce9f2a8228',
  'separation:carthage:plain': 'f8a046df85ad74da',
  'separation:carthage:hill': '37c952cb43838d98',
  'separation:carthage:forest': '84edbb807675c5b6',
  'separation:carthage:farmland': 'f96d7bd8ae91d5b0',
  'separation:carthage:river': '63e850058b5c3842',
  'separation:carthage:ford': '45a0aaed24abc30d',
  'separation:carthage:road': '89fbae7610a42cea',
  // U6's settlements and fortifications: every specimen the plate shows — both
  // Factions' villages, the Stronghold whole, hurt and breached, the ram at the
  // gate, and the two remembered places. A wall that moves a pixel names itself.
  'site:settlement:rome:seen': 'c42e4a3b11ec2c19',
  'site:settlement:rome:castrum': '062565e8254c5066',
  'site:settlement:carthage:seen': '271fec07c2c96d11',
  'site:settlement:none:seen': '82095318862fba48',
  'site:stronghold:rome:intact': '60a521811cb80247',
  'site:stronghold:carthage:intact': '93b32afe44a4e0a7',
  'site:stronghold:rome:damaged': 'da414269bcb655d7',
  'site:stronghold:rome:breached': '67bed99fdc69ffa0',
  'site:stronghold:rome:ram': '03ccce5867107abd',
  'site:stronghold:carthage:remembered': 'db5b23158dcfd749',
  'site:settlement:rome:remembered': '63bf6c2c6aa583d7',
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
