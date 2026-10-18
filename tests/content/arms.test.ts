/**
 * The matchup matrix (ticket C3).
 *
 * The plan states the cycle in one line — `spear > cavalry > light > archers >
 * spear` — so the test states it again as a literal table, independently of the
 * table the code holds, and walks every one of the twenty-five pairings. A test
 * that recomputed the matrix from the cycle would pass by construction; this one
 * can disagree with the code.
 *
 * Two properties are asserted on top of the literal: the two halves of every
 * pairing mirror each other, and the arms the roster names all have a row.
 */
import { describe, expect, it } from 'vitest';
import { SQUAD_TYPES } from '../../src/content/squads';
import {
  ARMS,
  ARM,
  armCode,
  armOf,
  MATCHUP,
  matchupOf,
  type Advantage,
  type Arm,
} from '../../src/content/arms';

/** The plan's cycle, written the way the plan writes it. */
const CYCLE: readonly (readonly [Arm, Arm])[] = [
  ['spear', 'cavalry'],
  ['cavalry', 'light'],
  ['light', 'archers'],
  ['archers', 'spear'],
];

describe('the matchup matrix', () => {
  it('decides the plan’s cycle, arm by arm', () => {
    for (const [winner, loser] of CYCLE) {
      expect(matchupOf(winner, loser), `${winner} over ${loser}`).toBe('advantage');
      expect(matchupOf(loser, winner), `${loser} against ${winner}`).toBe('disadvantage');
    }
  });

  it('holds the whole table, so no pairing is decided by a default somewhere else', () => {
    // The literal each row must equal: the cycle's four edges, and neutral for
    // every pair the plan does not name.
    const expected: Record<Arm, Record<Arm, Advantage>> = {
      spear: { spear: 'neutral', sword: 'neutral', cavalry: 'advantage', light: 'neutral', archers: 'disadvantage' },
      sword: { spear: 'neutral', sword: 'neutral', cavalry: 'neutral', light: 'neutral', archers: 'neutral' },
      cavalry: { spear: 'disadvantage', sword: 'neutral', cavalry: 'neutral', light: 'advantage', archers: 'neutral' },
      light: { spear: 'neutral', sword: 'neutral', cavalry: 'disadvantage', light: 'neutral', archers: 'advantage' },
      archers: { spear: 'advantage', sword: 'neutral', cavalry: 'neutral', light: 'disadvantage', archers: 'neutral' },
    };

    expect(MATCHUP).toEqual(expected);

    for (const attacker of ARMS) {
      for (const defender of ARMS) {
        expect(matchupOf(attacker, defender), `${attacker} vs ${defender}`).toBe(expected[attacker][defender]);
      }
    }
  });

  it('mirrors every edge, so neither side of a pairing is quietly favoured', () => {
    for (const attacker of ARMS) {
      for (const defender of ARMS) {
        expect(
          matchupOf(attacker, defender),
          `${attacker} vs ${defender}`,
        ).toBe(reversalOf(matchupOf(defender, attacker)));
      }
    }
  });

  it('is even for a pairing the cycle does not cover, including the sword against everything', () => {
    for (const arm of ARMS) {
      expect(matchupOf('sword', arm), `sword vs ${arm}`).toBe('neutral');
      expect(matchupOf(arm, 'sword'), `${arm} vs sword`).toBe('neutral');
      expect(matchupOf(arm, arm), `${arm} vs ${arm}`).toBe('neutral');
    }
  });

  it('names an arm for every Squad type the roster can raise, and reads a code back as its arm', () => {
    for (const type of SQUAD_TYPES) {
      expect(ARMS, type.id).toContain(type.arm);
      expect(armOf(armCode(type.arm))).toBe(type.arm);
    }

    expect(() => armOf(ARMS.length)).toThrow(RangeError);
    expect(ARM.spear).toBe(0);
    expect(ARM.archers).toBe(ARMS.length - 1);
  });
});

/** The other side of a pairing: what an advantage is to the man on the wrong end. */
function reversalOf(edge: Advantage): Advantage {
  if (edge === 'advantage') return 'disadvantage';
  if (edge === 'disadvantage') return 'advantage';

  return 'neutral';
}
