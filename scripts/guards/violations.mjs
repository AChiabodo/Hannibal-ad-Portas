/**
 * The unit every guard reports in.
 *
 * @typedef {object} Violation
 * @property {string} file Repository-relative path, POSIX separators.
 * @property {number} line 1-based.
 * @property {number} column 1-based.
 * @property {string} message What is wrong, in one line.
 * @property {string[]} [chain] For import violations: entry → … → offending import.
 */

export {};
