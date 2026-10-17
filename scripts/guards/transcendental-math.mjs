import { findMathMemberViolations } from './math-members.mjs';
import { reachableFromSimulation } from './sim-reachability.mjs';

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
];

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * @param {string} member
 * @returns {string}
 */
const message = (member) =>
  `calls Math.${member} — ECMA-262 leaves it implementation-approximated, so two engines may disagree: ` +
  'use lookup tables or integer arithmetic (docs/PLAN.md §3, ADR-0006)';

/**
 * Reports every forbidden `Math` member in a file the simulation can reach,
 * with the chain that reaches it, so the report says both what and how.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findTranscendentalMathReachableFromSimulation(root) {
  const { files, chains } = reachableFromSimulation(root);

  return findMathMemberViolations(files, {
    members: FORBIDDEN_TRANSCENDENTALS,
    message,
    root,
  }).map((violation) => ({ ...violation, chain: chains.get(violation.file) ?? [violation.file] }));
}
