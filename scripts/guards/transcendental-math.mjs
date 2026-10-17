import { EXPONENTIATION, findMemberViolations } from './forbidden-spellings.mjs';
import { reachableFromSimulation } from './sim-reachability.mjs';
import { withChain } from './violations.mjs';

/**
 * Fence #3: the simulation may not reach arithmetic that ECMA-262 leaves
 * implementation-approximated (ADR-0006, PLAN §3).
 *
 * Two engines may legitimately disagree about these functions, and that is the
 * one thing a replay cannot survive: the same Match, replayed in another
 * browser against the same seed and the same command log, would diverge without
 * anyone having changed a rule. Geometry that wants trigonometry uses lookup
 * tables or integer approximation instead.
 *
 * The plan names five — `sin`, `cos`, `exp`, `pow` and `log` — and the fence
 * bans the family they belong to, because everything in it is either
 * approximated itself or defined in terms of something that is. `Math.sqrt` is
 * deliberately absent: IEEE 754 pins it down, and the plan's own consequence is
 * that a `Math.sqrt` in the wrong place is a reviewer's call, not a guard's.
 *
 * `EXPONENTIATION` is in the list with no carve-out for integer exponents,
 * although `x ** 2` is exact and `x ** 0.5` is not. The approximation belongs to
 * the operation, not to a particular exponent, and a syntactic walk does not
 * know an exponent's value: a carve-out would have to guess, and a fence that
 * guesses is worse than one that is blunt. Writing the multiplication out says
 * which one is meant. The name covers `**` and `**=` alike, because they are the
 * same operation.
 */
const FORBIDDEN_TRANSCENDENTALS = [
  'sin',
  'cos',
  'tan',
  'asin',
  'acos',
  'atan',
  'atan2',
  'sinh',
  'cosh',
  'tanh',
  'asinh',
  'acosh',
  'atanh',
  'exp',
  'expm1',
  'log',
  'log1p',
  'log2',
  'log10',
  'pow',
  'cbrt',
  'hypot',
  EXPONENTIATION,
];

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * @param {string} member
 * @returns {string}
 */
const message = (member) =>
  member === EXPONENTIATION
    ? 'uses exponentiation (** or **=) — Number::exponentiate, the same operation as Math.pow, which ' +
      'ECMA-262 leaves implementation-approximated, so two engines may disagree: write the ' +
      'multiplication out, or use a lookup table (docs/PLAN.md §3, ADR-0006)'
    : `calls Math.${member} — ECMA-262 leaves it implementation-approximated, so two engines may disagree: ` +
      'use lookup tables or integer arithmetic (docs/PLAN.md §3, ADR-0006)';

/**
 * Reports every forbidden `Math` member, and every exponentiation, in a file the
 * simulation can reach, with the chain that reaches it, so the report says both
 * what and how.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findTranscendentalMathReachableFromSimulation(root) {
  const { files, chains } = reachableFromSimulation(root);

  return findMemberViolations(files, {
    object: 'Math',
    members: FORBIDDEN_TRANSCENDENTALS,
    message,
    root,
  }).map((violation) => withChain(violation, chains));
}
