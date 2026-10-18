import { findMemberViolations } from './forbidden-spellings.mjs';

/** Fence #2: the repository bans the global generator (ADR-0006, PLAN §3). */
export const MATH_RANDOM_MESSAGE =
  'reaches Math.random — use the seeded PRNG (xmur3 seeded sfc32), never the global generator: docs/PLAN.md §3';

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * Finds every syntactic path to the global generator: `Math.random()`,
 * `Math["random"]()`, `Math?.random()` and `const { random } = Math`.
 *
 * `Math` is the object and `random` the only name, because this is the one rule
 * that holds everywhere in the repository rather than in the simulation. The
 * operator that is a `Math` member in disguise is not listed: `x ** y` is not a
 * draw, so the transcendental fence is where it belongs.
 *
 * @param {readonly string[]} files Absolute or root-relative file paths.
 * @param {{ root?: string }} [options] Root used to shorten reported paths.
 * @returns {Violation[]}
 */
export function findMathRandomViolations(files, options = {}) {
  return findMemberViolations(files, {
    object: 'Math',
    members: ['random'],
    message: () => MATH_RANDOM_MESSAGE,
    root: options.root,
  });
}
