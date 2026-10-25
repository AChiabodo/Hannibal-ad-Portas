/**
 * The rule descriptions the Encyclopedia reads (#66).
 *
 * A reference is only worth having if it cannot drift from the rules it
 * describes, so these tests check the *content* against the constants rather
 * than the prose against itself: every section has an entry, every fact is a
 * whole number the rule still holds, and no entry is empty or promises an
 * outcome the rules do not decide in advance.
 */
import { describe, expect, it } from 'vitest';
import { REFERENCE_ENTRIES, REFERENCE_SECTIONS, referenceOf } from '../../src/ui/reference';
import { POINTS_PER_MAN } from '../../src/sim/combat';
import { RAM_BEARING_PER_BLOW, WALL_ASSAULT_LOSS } from '../../src/sim/siege';
import { SQUAD_TYPES } from '../../src/content/squads';
import { BUILDINGS } from '../../src/content/buildings';
import { RESOURCE_KINDS } from '../../src/sim/map';
import { squadLabel, workLabel } from '../../src/ui/strings';
import { TICK_HZ } from '../../src/sim/clock';

describe('the rule reference', () => {
  it('gives beginners a directly named path to capture, exploration and supplies', () => {
    const entries = ['capture', 'exploration', 'supply'].map((id) => REFERENCE_ENTRIES.find((entry) => entry.id === id));
    expect(entries.every((entry) => entry?.section === 'start')).toBe(true);
    expect(entries[0]?.body).toContain('casella centrale');
    expect(entries[0]?.body).toContain('Castrum');
    expect(entries[1]?.body).toContain('clic destro');
    expect(entries[1]?.body).toContain('non conquista');
    expect(entries[2]?.body).toContain('munizioni');
    expect(entries[2]?.body).toContain('non vengono rimpiazzati');
  });

  it('helps a beginner read the real interface and distinguish current sight from memory', () => {
    const controls = REFERENCE_ENTRIES.find((entry) => entry.id === 'interface');
    expect(controls?.body).toContain('F6');
    expect(controls?.body).toContain('soldo');
    expect(controls?.body).toContain('lucchetto');
    const sight = REFERENCE_ENTRIES.find((entry) => entry.id === 'visibility');
    expect(sight?.body).toContain('Ultimo contatto noto');
    expect(sight?.body).toContain('non');
    for (const id of ['commands', 'conditions']) {
      const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === id);
      expect(entry?.body).not.toContain('marcia più rapidamente');
      expect(entry?.body).toContain('velocità di movimento');
    }
  });

  it('answers every content item with canonical bills, sizes and faction names', () => {
    for (const building of BUILDINGS) {
      const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === `building:${building.id}`);
      expect(entry?.title).toBe(workLabel(building.id));
      expect(entry?.body).toContain(`${building.buildTicks / TICK_HZ} s`);
    }
    for (const type of SQUAD_TYPES) {
      const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === `squad:${type.id}`);
      expect(entry?.title).toBe(squadLabel(type.id));
      for (const size of type.sizes) expect(entry?.body).toContain(String(size));
      expect(entry?.body).toContain(type.faction === 'rome' ? 'Roma' : 'Cartagine');
      expect(entry?.body).toContain(`Morale iniziale: ${type.morale}`);
      expect(entry?.body).toContain(`Munizioni iniziali: ${type.ammunition} salve`);
      expect(entry?.body).toContain(`Passo: ${type.pace}`);
    }
    for (const kind of RESOURCE_KINDS) expect(REFERENCE_ENTRIES.some((entry) => entry.id === `resource:${kind}`)).toBe(true);
    expect(new Set(RESOURCE_KINDS.map((kind) => REFERENCE_ENTRIES.find((entry) => entry.id === `resource:${kind}`)?.body)).size).toBe(4);
    for (const id of ['labour', 'seasons', 'population', 'commands', 'conditions', 'territory']) {
      expect(REFERENCE_ENTRIES.some((entry) => entry.id === id), id).toBe(true);
    }
  });
  it('answers every section with at least one entry, and every entry has words and numbers', () => {
    for (const section of REFERENCE_SECTIONS) {
      const entries = referenceOf(section);
      expect(entries.length, `${section} has no entry`).toBeGreaterThan(0);
    }

    for (const entry of REFERENCE_ENTRIES) {
      expect(entry.title.length, `${entry.id} has no title`).toBeGreaterThan(0);
      expect(entry.body.length, `${entry.id} has no words`).toBeGreaterThan(40);
      expect(entry.facts.length, `${entry.id} quotes no number`).toBeGreaterThan(0);
      // A reference states what a rule does; it never promises an outcome.
      expect(entry.body.toLowerCase()).not.toMatch(/sempre|always|garantit|guarantee/);
    }
  });

  it('quotes the numbers the rules hold, not the numbers they used to hold', () => {
    const factsOf = (id: string) => (REFERENCE_ENTRIES.find((entry) => entry.id === id)?.facts ?? [])
      .map((fact) => fact.value);

    expect(factsOf('force')).toContain(POINTS_PER_MAN);
    // The sizes the sentence quotes are the roster's own, not typed into a string,
    // and the two of them divide: five of the small make one of the large, which
    // is the sentence's whole claim.
    const largest = Math.max(...SQUAD_TYPES.map((type) => type.strength));
    expect(factsOf('force')).toContain(largest);
    expect(factsOf('force')).toContain(largest / 5);
    expect(factsOf('siege')).toContain(RAM_BEARING_PER_BLOW);
    expect(factsOf('siege')).toContain(WALL_ASSAULT_LOSS);
  });

  it('reads the roster’s own weights, so a type that changes weight changes a line', () => {
    const roster = REFERENCE_ENTRIES.find((entry) => entry.id === 'roster');
    expect(roster).toBeDefined();
    expect(roster?.facts.map((fact) => fact.label)).toEqual(SQUAD_TYPES.map((type) => type.id));
    expect(roster?.facts.map((fact) => fact.value)).toEqual(SQUAD_TYPES.map((type) => type.impact));
  });
});
