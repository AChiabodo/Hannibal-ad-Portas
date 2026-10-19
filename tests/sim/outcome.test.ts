import { describe, expect, it } from 'vitest';
import { sameEnding, type MatchResult } from '../../src/sim/outcome';

/**
 * Whether two endings are the same ending (E2).
 *
 * The comparison a replay is judged by once its hashes agree: two worlds can be
 * identical and still be a different Match if the rules say it ended differently —
 * sooner, later, for the other Faction, or not at all. So "the same ending" is a
 * question about every field, and the tests below are the fields one at a time.
 */
const VICTORY: MatchResult = {
  kind: 'victory',
  winner: 'rome',
  reason: { kind: 'stronghold', stronghold: 1, path: 'assault' },
  tick: 40,
};

describe('two endings', () => {
  it('are the same when every field says the same thing', () => {
    expect(sameEnding(VICTORY, { ...VICTORY })).toBe(true);
    expect(sameEnding({ kind: 'clock', tick: 9 }, { kind: 'clock', tick: 9 })).toBe(true);
    expect(sameEnding({ kind: 'draw', tick: 9 }, { kind: 'draw', tick: 9 })).toBe(true);
  });

  it('differ when the Match ended on another tick', () => {
    expect(sameEnding(VICTORY, { ...VICTORY, tick: 41 })).toBe(false);
    expect(sameEnding({ kind: 'clock', tick: 9 }, { kind: 'clock', tick: 10 })).toBe(false);
  });

  it('differ when the other Faction won', () => {
    expect(sameEnding(VICTORY, { ...VICTORY, winner: 'carthage' })).toBe(false);
  });

  it('differ when the Stronghold fell another way, or another one fell', () => {
    expect(
      sameEnding(VICTORY, {
        ...VICTORY,
        reason: { kind: 'stronghold', stronghold: 1, path: 'blockade' },
      }),
    ).toBe(false);
    expect(
      sameEnding(VICTORY, {
        ...VICTORY,
        reason: { kind: 'stronghold', stronghold: 0, path: 'assault' },
      }),
    ).toBe(false);
  });

  it('differ when what ended the Match was not the same kind of thing', () => {
    expect(sameEnding(VICTORY, { ...VICTORY, reason: { kind: 'annihilation' } })).toBe(false);
    expect(sameEnding(VICTORY, { kind: 'clock', tick: 40 })).toBe(false);
    expect(sameEnding({ kind: 'draw', tick: 40 }, { kind: 'clock', tick: 40 })).toBe(false);
  });
});
