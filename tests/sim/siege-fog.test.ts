import { describe, expect, it } from 'vitest';
import { contactCode, contactKind, type ContactKind } from '../../src/sim/siege-fog.ts';

describe('a siege fog contact kind', () => {
  it('names the kind and, for a Squad, the type index it was last seen as', () => {
    expect(contactCode({ kind: 'settlement' })).toBe(0);
    expect(contactCode({ kind: 'stronghold' })).toBe(1);
    expect(contactCode({ kind: 'squad', type: 4 })).toBe(6);
  });

  it('round-trips every kind through the one integer the fog memory holds', () => {
    const kinds: readonly ContactKind[] = [
      { kind: 'settlement' }, { kind: 'stronghold' },
      { kind: 'squad', type: 0 }, { kind: 'squad', type: 5 },
    ];
    for (const kind of kinds) expect(contactKind(contactCode(kind))).toEqual(kind);
  });

  it('tells a Stronghold from a type-zero Squad, which the raw integer alone cannot', () => {
    expect(contactKind(1).kind).toBe('stronghold');
    expect(contactKind(2)).toEqual({ kind: 'squad', type: 0 });
  });
});
