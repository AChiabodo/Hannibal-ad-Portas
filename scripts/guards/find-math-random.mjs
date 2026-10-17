import { findMathMemberViolations } from './math-members.mjs';

/** Fence #2: the repository bans the global generator (ADR-0006, PLAN §3). */
export const MATH_RANDOM_MESSAGE =
  'reaches Math.random — use the seeded PRNG (xmur3 seeded sfc32), never the global generator: docs/PLAN.md §3';

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * Finds every syntactic path to the global generator: `Math.random()`,
 * `Math["random"]()`, `Math?.random()` and `const { random } = Math`.
 *
 * @param {readonly string[]} files Absolute or root-relative file paths.
 * @param {{ root?: string }} [options] Root used to shorten reported paths.
 * @returns {Violation[]}
 */
export function findMathRandomViolations(files, options = {}) {
  return findMathMemberViolations(files, {
    members: ['random'],
    message: () => MATH_RANDOM_MESSAGE,
    root: options.root,
  });
}
