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

describe('the rule reference', () => {
  it('answers every content item with canonical bills, sizes and faction names', () => {
    for (const building of BUILDINGS) {
      const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === `building:${building.id}`);
      expect(entry?.title).toBe(workLabel(building.id));
      expect(entry?.body).toContain(`${building.buildTicks / 10} s`);
    }
    for (const type of SQUAD_TYPES) {
      const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === `squad:${type.id}`);
      expect(entry?.title).toBe(squadLabel(type.id));
      for (const size of type.sizes) expect(entry?.body).toContain(String(size));
      expect(entry?.body).toContain(type.faction === 'rome' ? 'Roma' : 'Cartagine');
    }
    for (const kind of RESOURCE_KINDS) expect(REFERENCE_ENTRIES.some((entry) => entry.id === `resource:${kind}`)).toBe(true);
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
