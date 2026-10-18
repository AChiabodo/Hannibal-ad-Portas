import { findMemberViolations } from './forbidden-spellings.mjs';
import { reachableFromSimulation } from './sim-reachability.mjs';
import { withChain } from './violations.mjs';

/**
 * Fence #4: the simulation may not reach the ambient clock or ambient entropy.
 *
 * ADR-0006's normative sentence is "every random draw comes from `sfc32` seeded
 * through `xmur3`", and fence #2 enforces it as "no `Math.random`" — which is
 * the same rule only as long as `Math.random` is the only generator a rule can
 * find. It is not: `crypto.getRandomValues` and `crypto.randomUUID` draw from
 * the platform, and `Date.now` and `performance.now` read a clock no Match owns.
 * None of the four is ever legitimate inside a Match — a Match's only time is
 * its tick counter and its only entropy is its seed — so the fence reports them
 * instead of leaving the ADR's sentence to a reviewer's memory.
 *
 * The fence is simulation-scoped, unlike fence #2: a test, a tool or the CLI's
 * report may read a wall clock, and only the rules that feed state and the hash
 * may not. That is also why this fence does not repeat `Math.random`: the
 * repository-wide rule already covers it, and two rules for one spelling is one
 * rule too many.
 *
 * `new Date()` is the same ambient read and is *not* reported — the walk finds
 * members, and a constructor call has none. It is named in the README's fence #2
 * among the spellings a green tick does not cover, which is the honest place for
 * it: this walk is syntactic, and the alternative is a taint analysis the guard
 * declines to be.
 */

/** @typedef {import('./forbidden-spellings.mjs').GlobalObject} GlobalObject */

/**
 * What the fence bans, as the walk wants it: the global, then the members of it
 * that a Match can never afford.
 *
 * @type {readonly { object: GlobalObject, members: readonly string[] }[]}
 */
const AMBIENT_NONDETERMINISM = [
  { object: 'crypto', members: ['getRandomValues', 'randomUUID'] },
  { object: 'Date', members: ['now'] },
  { object: 'performance', members: ['now'] },
];

/** @typedef {import('./violations.mjs').Violation} Violation */

/**
 * @param {string} spelling The member as the reader meets it: `Date.now`.
 * @returns {string}
 */
const ambientMessage = (spelling) =>
  `reaches ${spelling} — a Match's only time is its tick counter and its only entropy is the seeded ` +
  'PRNG (xmur3 seeded sfc32), so this cannot be replayed: docs/PLAN.md §3, ADR-0006';

/**
 * Reports every ambient clock or entropy source in a file the simulation can
 * reach, with the chain that reaches it, in the order a reader walks the report:
 * by file, then by line.
 *
 * @param {string} root Repository root.
 * @returns {Violation[]}
 */
export function findAmbientNondeterminismReachableFromSimulation(root) {
  const { files, chains } = reachableFromSimulation(root);

  const violations = AMBIENT_NONDETERMINISM.flatMap(({ object, members }) =>
    findMemberViolations(files, {
      object,
      members,
      message: (member) => ambientMessage(`${object}.${member}`),
      root,
    }),
  ).map((violation) => withChain(violation, chains));

  // One walk per global reports its own globals together; a report reads top to
  // bottom, so the merged list is put back into file order.
  return violations.sort(
    (left, right) =>
      compare(left.file, right.file) || left.line - right.line || left.column - right.column,
  );
}

/**
 * @param {string} left
 * @param {string} right
 * @returns {number}
 */
function compare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}
