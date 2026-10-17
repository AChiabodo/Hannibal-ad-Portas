/**
 * The unit every guard reports in.
 *
 * @typedef {object} Violation
 * @property {string} file Repository-relative path, POSIX separators.
 * @property {number} line 1-based.
 * @property {number} column 1-based.
 * @property {string} message What is wrong, in one line.
 * @property {string[]} [chain] For a violation found by walking into the
 *   simulation: the entry that reaches the offending file, then every file on
 *   the way, the offending file last.
 */

/**
 * The same violation, carrying the chain of files that reaches it.
 *
 * A fence that walks into the simulation finds a violation in one file, but the
 * report has to say how the simulation got there — and the reachability walk
 * already knows, so the fence reads that map and decorates each violation with
 * the answer. Two fences report this way, so the decoration, including what a
 * file that is itself an entry point falls back to, is spelled once.
 *
 * @param {Violation} violation
 * @param {Map<string, string[]>} chains Repository-relative file to the chain that reaches it.
 * @returns {Violation}
 */
export function withChain(violation, chains) {
  return { ...violation, chain: chains.get(violation.file) ?? [violation.file] };
}
