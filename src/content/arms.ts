/**
 * The arms, and the matchup matrix that decides which one has the better of a
 * fight (PLAN §4, ticket C3).
 *
 * The plan names the cycle in one line — **spear over cavalry, cavalry over
 * light, light over archers, archers over spear** — and this module is that line
 * written down as a table, because "the matchup matrix decides the advantage in
 * every pairing it covers" has to be a fact a test can walk rather than a
 * sentence a rule half-remembers. There are five arms: the four of the cycle,
 * and `sword`, which stands outside it. A sword-and-shield block is not a
 * counter to anything and nothing counters it; that is what makes the cycle
 * interesting, because a Roman line of swordsmen is a line with no edge and no
 * hole in it.
 *
 * ## The cycle, and why it is not a total order
 *
 * `spear > cavalry > light > archers > spear` is a cycle on purpose: no arm is
 * best, and the answer to "what should I raise" depends on what the enemy has
 * raised, which is a decision a player has to keep making. A total order would
 * have one right answer and would turn the roster into a ladder. That is also
 * why the edges the cycle does not name are `neutral` rather than invented: a
 * light skirmisher against a line of swordsmen is an even fight in the plan, and
 * giving the pair an edge would be this module inventing balance nobody asked
 * for.
 *
 * ## What a table rather than a rule is for
 *
 * Every one of the twenty-five pairings is written out, including the ones that
 * are neutral, so a test can assert the whole matrix against a literal and a
 * reader can see the cycle as a picture. The alternative — a list of four cycle
 * edges and a `neutral` default — is shorter and is exactly what makes the
 * neutral pairs invisible to review: the day somebody adds a sixth arm, the
 * four entry points would stay green while the new arm was neutral against
 * everything.
 *
 * The matrix says *which* side has the better of a fight and nothing about *how
 * much*: how far an advantage multiplies an exchange is a rule of the fight
 * (`sim/combat.ts`), and keeping the two apart is what lets the balance of the
 * cycle move without the table of arms being rewritten.
 */

/** The five arms a Squad can be armed with, in code order. */
export const ARMS = ['spear', 'sword', 'cavalry', 'light', 'archers'] as const;

/** One arm: the way a Squad is equipped and, through the matrix, who it beats. */
export type Arm = (typeof ARMS)[number];

/**
 * The number an arm is held as.
 *
 * A Squad type in state names its arm by code rather than by word, the way every
 * other content name is held (ADR-0006): `SquadType` carries the arm, and state
 * carries the type's code. The table below is indexed by the word because a
 * reader of a matrix should not have to decode numbers to check a cycle.
 */
export const ARM: Readonly<Record<Arm, number>> = {
  spear: 0,
  sword: 1,
  cavalry: 2,
  light: 3,
  archers: 4,
};

/** The number an arm is held as. */
export function armCode(arm: Arm): number {
  return ARM[arm];
}

/** The arm a number names. @throws RangeError when it names none. */
export function armOf(code: number): Arm {
  const arm = ARMS[code];
  if (arm === undefined) throw new RangeError(`${String(code)} is not an arm a Squad can carry`);

  return arm;
}

/** Who has the better of a pairing: a word, because a matrix is read by people. */
export type Advantage = 'advantage' | 'neutral' | 'disadvantage';

/**
 * The matchup matrix: every arm against every arm, `attacker` down the side and
 * `defender` along the top.
 *
 * The four cycle edges are the only ones that are not neutral:
 *
 * |            | spear | sword | cavalry | light | archers |
 * | ---------- | ----- | ----- | ------- | ----- | ------- |
 * | **spear**  | —     | —     | +       | —     | −       |
 * | **sword**  | —     | —     | —       | —     | —       |
 * | **cavalry**| −     | —     | —       | +     | —       |
 * | **light**  | —     | —     | −       | —     | +       |
 * | **archers**| +     | —     | —       | −     | —       |
 *
 * Read a row as "this arm attacking", so the spear row's `cavalry: advantage`
 * is the plan's first edge and the cavalry row's `spear: disadvantage` is the
 * same edge from the other side. The two halves are asserted to mirror each
 * other: an edge that was only written one way round would be a table that
 * silently favoured whichever side happened to attack first.
 */
export const MATCHUP: Readonly<Record<Arm, Readonly<Record<Arm, Advantage>>>> = {
  spear: {
    spear: 'neutral',
    sword: 'neutral',
    cavalry: 'advantage',
    light: 'neutral',
    archers: 'disadvantage',
  },
  sword: {
    spear: 'neutral',
    sword: 'neutral',
    cavalry: 'neutral',
    light: 'neutral',
    archers: 'neutral',
  },
  cavalry: {
    spear: 'disadvantage',
    sword: 'neutral',
    cavalry: 'neutral',
    light: 'advantage',
    archers: 'neutral',
  },
  light: {
    spear: 'neutral',
    sword: 'neutral',
    cavalry: 'disadvantage',
    light: 'neutral',
    archers: 'advantage',
  },
  archers: {
    spear: 'advantage',
    sword: 'neutral',
    cavalry: 'neutral',
    light: 'disadvantage',
    archers: 'neutral',
  },
};

/**
 * Who has the better of `attacker` against `defender`, or `neutral` when the
 * matrix covers no edge for the pair.
 *
 * `neutral` rather than a throw for an arm the table does not hold, because a
 * question about a fight must never stop a tick: an arm is content and content
 * is typed, so an unknown one is a compile error before it is a runtime one.
 */
export function matchupOf(attacker: Arm, defender: Arm): Advantage {
  return MATCHUP[attacker]?.[defender] ?? 'neutral';
}
