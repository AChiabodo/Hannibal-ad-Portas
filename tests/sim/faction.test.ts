import { describe, expect, it } from 'vitest';
import { FACTIONS, isFaction } from '../../src/sim/faction';

describe('the two Factions', () => {
  it('are Rome and Carthage, Rome first, in the order the plan introduces them', () => {
    expect(FACTIONS).toEqual(['rome', 'carthage']);
  });

  it('recognises a Faction picked out of data that TypeScript did not check', () => {
    expect(isFaction('rome')).toBe(true);
    expect(isFaction('carthage')).toBe(true);

    for (const value of ['Rome', 'SPQR', '', 0, 1, null, undefined, ['rome'], { faction: 'rome' }]) {
      expect(isFaction(value), String(value)).toBe(false);
    }
  });
});
