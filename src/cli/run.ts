/**
 * The Match the CLI plays, and the invariant it checks it ended on.
 *
 * The CLI is a harness, not a game: it hands the driver a seed, the two idle
 * Players and a bound, and takes whatever the rules give back. *Which* rules is
 * the one choice this module leaves to the command line, and it is a name from
 * the table in `rules.ts`: the economy Match by default, the clock on its own,
 * the theatre with both Factions' fogs beside it, the engine-only empty Match,
 * and a Match whose rules draw on every tick, so that CI can gate a hash of the
 * settlements and the map, of the calendar, of the fog, of the seed expansion
 * and of the generator actually working (ADR-0006, ADR-0013, A5 review F5).
 *
 * Those names change what a name plays as the world is built, and nothing about
 * the command line or its report changes with them.
 *
 * The invariant is ADR-0006's, made checkable: the same seed and the same
 * Commands must end in the same state hash. A Match the caller asked a hash of
 * is compared to it, and a mismatch is the failure the CLI exits 1 on — the
 * loud, readable end of "this run is not the run it was expected to be", which
 * is what a golden hash in CI is for.
 */
import type { RunOptions } from './arguments.ts';
import { RULES } from './rules.ts';
import type { MatchRun } from '../sim/index.ts';
import type { ReportableRun } from './report.ts';

/**
 * Plays one whole Match, headless, from the options a command line gave.
 *
 * Which Match is the caller's to name and the table's to build, so this is a
 * lookup and a call: the Matches have different worlds and are played in their
 * own types (`rules.ts`).
 *
 * Nothing here waits on anything: the loop runs ticks as fast as the processor
 * lets it, which is why a hundred short Matches are a routine command rather
 * than an afternoon (PLAN §3). The bound always terminates the Match, so a call
 * to this always returns a result.
 *
 * @throws CommandValidationError, ForeignCommandError, StateSerializationError
 *   when a Player or a rule breaks an invariant of the seam; the CLI reports
 *   those and exits 1.
 */
export function playMatch(options: RunOptions): ReportableRun {
  return RULES[options.rules].play(options.seed, options.ticks, options.difficulty);
}

/**
 * The state hash a Match was required to end on did not match the one it did.
 *
 * The Match itself is fine — this is a run that is not the run that was
 * expected, which is either a change to the rules, a change to the seed, or a
 * divergence that has to be understood before anything else is believed about
 * the build. Both numbers are in the message, because the interesting question
 * is never "did it mismatch" but "what did it end on instead".
 */
export class HashMismatchError extends Error {
  /** The hash the caller required. */
  readonly expected: string;

  /** The hash the Match actually ended on. */
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(
      `the Match is not the Match that was expected: expected ${expected}, got ${actual}. ` +
        'A different hash for the same seed and the same Commands is a divergence (ADR-0006)',
    );
    this.name = 'HashMismatchError';
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Checks the one invariant the CLI can check from outside a Match: that it
 * ended on the hash it was required to.
 *
 * @throws HashMismatchError when the Match ended on any other hash.
 */
export function requireExpectedHash(
  run: MatchRun,
  options: { readonly expectedHash: string | null },
): void {
  if (options.expectedHash !== null && run.hash !== options.expectedHash) {
    throw new HashMismatchError(options.expectedHash, run.hash);
  }
}
