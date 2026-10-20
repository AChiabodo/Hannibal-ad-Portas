/**
 * The escalation rules for complete acceptance (ticket #64), as data and two
 * pure functions so that `scripts/selection.mjs` and its test agree.
 *
 * Documentation is the only thing that may skip the complete gate: Markdown and
 * the agent skill files cannot change a pixel, a Command or a spec. Everything
 * else — including verification machinery, configuration and a file nobody
 * expected — escalates. An empty or unreadable diff escalates too: "I could not
 * tell" is never a reason to run less.
 */

/**
 * A path that cannot change behavior or verification.
 *
 * Deliberately narrow: adding a prefix here is how a change silently skips the
 * gate, so the list holds documentation and nothing else.
 *
 * @type {readonly RegExp[]}
 */
export const DOCUMENTATION_ONLY = [
  /^docs\//,
  /^\.agents\//,
  /^[^/]+\.md$/,
  /^LICENSE(\.\w+)?$/,
];

/**
 * Whether this change must run complete browser acceptance.
 *
 * @param {readonly string[]} changed root-relative paths.
 * @returns {boolean} `true` when acceptance is required.
 */
export function requiresAcceptance(changed) {
  // A diff nobody could read is not evidence that nothing changed.
  if (changed.length === 0) return true;

  return changed.some((file) => !DOCUMENTATION_ONLY.some((pattern) => pattern.test(file)));
}

/**
 * One sentence a reviewer can check against the file list.
 *
 * @param {readonly string[]} changed
 * @param {boolean} decision
 * @returns {string}
 */
export function explain(changed, decision) {
  if (changed.length === 0) {
    return 'no file list could be established (fail-safe): complete acceptance runs';
  }

  const code = changed.filter((file) => !DOCUMENTATION_ONLY.some((pattern) => pattern.test(file)));
  if (decision) {
    return `code or verification changed (${code.slice(0, 5).join(', ')}${code.length > 5 ? ', …' : ''}): complete acceptance runs`;
  }

  return 'documentation only: complete acceptance may be skipped, smoke still runs';
}
