import { reachableFromSimulation } from './sim-reachability.mjs';

/**
 * Fence #1: the simulation must never be able to reach the rendering engine
 * (ADR-0001, PLAN §3). The check is on *reachability*, not on direct imports,
 * so `sim → art → pixi.js` fails just as loudly as `sim → pixi.js`, and the
 * report names the chain that got there.
 */

/** @typedef {import('./violations.mjs').Violation} Violation */

/** The rendering engine the simulation must never reach. */
export const RENDERER_PACKAGE = 'pixi.js';

/**
 * @param {string} specifier
 * @returns {string}
 */
const message = (specifier) =>
  `imports "${specifier}" — ${RENDERER_PACKAGE} must never be reachable from the simulation (ADR-0001)`;

/**
 * @param {string} specifier
 * @returns {string}
 */
function unresolvedMessage(specifier) {
  return `imports "${specifier}" — the guard cannot resolve it, so it cannot see through it`;
}

/**
 * Follows every module reachable from the simulation and reports each import of
 * `RENDERER_PACKAGE`, with the chain that reaches it, plus every relative import
 * the guard could not resolve: an unresolvable import is a hole in the fence,
 * and a guard that stays quiet about a hole is worse than no guard.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findRendererReachableFromSimulation(root) {
  const { imports } = reachableFromSimulation(root);

  /** @type {Violation[]} */
  const violations = [];

  for (const found of imports) {
    const at = { file: found.file, line: found.line, column: found.column };
    const chain = [...found.chain, found.specifier];

    if (isForbidden(found.specifier, RENDERER_PACKAGE)) {
      violations.push({ ...at, message: message(found.specifier), chain });
      continue;
    }

    if (found.specifier.startsWith('.') && found.resolved === undefined) {
      violations.push({ ...at, message: unresolvedMessage(found.specifier), chain });
    }
  }

  return violations;
}

/**
 * @param {string} specifier
 * @param {string} forbidden
 * @returns {boolean}
 */
function isForbidden(specifier, forbidden) {
  return specifier === forbidden || specifier.startsWith(`${forbidden}/`);
}
