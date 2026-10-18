import { describe, expect, it } from 'vitest';
import { FACTIONS, factionCode, factionOf, isFaction } from '../../src/sim/faction';

describe('the two Factions', () => {
  it('are Rome and Carthage, Rome first, in the order the plan introduces them', () => {
    expect(FACTIONS).toEqual(['rome', 'carthage']);
  });

  it('are held as integers in state, Rome 0 and Carthage 1, and read back as words', () => {
    expect(factionCode('rome')).toBe(0);
    expect(factionCode('carthage')).toBe(1);
    expect(factionOf(0)).toBe('rome');
    expect(factionOf(1)).toBe('carthage');
  });

  it('refuses a number that names no Faction, rather than showing a Controller nonsense', () => {
    expect(() => factionOf(2)).toThrow(RangeError);
    expect(() => factionOf(-1)).toThrow(RangeError);
  });

  it('recognises a Faction picked out of data that TypeScript did not check', () => {
    expect(isFaction('rome')).toBe(true);
    expect(isFaction('carthage')).toBe(true);

    for (const value of ['Rome', 'SPQR', '', 0, 1, null, undefined, ['rome'], { faction: 'rome' }]) {
      expect(isFaction(value), String(value)).toBe(false);
    }
  });
});
