/**
 * The gate rules for browser verification (ticket #64, follow-up), as data and a
 * pure function so that `scripts/selection.mjs`, the CI plan job and its test all
 * read the same answer.
 *
 * Browser work is expensive: provisioning Chromium plus a smoke is about two
 * minutes, complete acceptance about eight, and a develop pull request does not
 * need either to be useful. So there are two levels:
 *
 * - **`main` is the integration gate.** A pull request into `main`, a push to
 *   `main`, and a manual run take the smoke and complete acceptance.
 * - **`develop` is the fast integration branch.** Its pull requests run lint,
 *   types, build, unit tests, the CLI hashes and the fences, and no browser. A
 *   merge into `develop` runs the smoke as a post-merge safety net, because a
 *   page that no longer boots should be noticed before the main pull request.
 *   A pull request into `develop` can opt in with the `browser` label.
 *
 * Everything else escalates, because "I could not tell" is never a reason to run
 * less: an empty or unreadable diff, a failed plan, an unexpected target branch.
 * Documentation is the only thing that may skip complete acceptance while still
 * taking the smoke.
 */

/** The label a develop pull request may carry to opt into the browser gates. */
export const BROWSER_LABEL = 'browser';

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
 * Whether every changed file is documentation.
 *
 * An empty list is **not** documentation: it means the diff could not be read,
 * and the caller escalates instead.
 *
 * @param {readonly string[]} changed root-relative paths.
 * @returns {boolean}
 */
export function isDocumentationOnly(changed) {
  return changed.length > 0 && changed.every((file) => DOCUMENTATION_ONLY.some((pattern) => pattern.test(file)));
}

/**
 * Which browser gates a change takes.
 *
 * @param {object} [options]
 * @param {'push' | 'pull_request' | 'workflow_dispatch'} [options.event] the event being planned.
 * @param {string | null} [options.branch] the branch a push landed on.
 * @param {string | null} [options.baseBranch] the branch a pull request targets.
 * @param {readonly string[]} [options.labels] the pull request's labels.
 * @param {readonly string[]} [options.changed] the changed files; empty means unknown.
 * @returns {{ readonly acceptance: boolean; readonly smoke: boolean; readonly reason: string }}
 */
export function selectGates({
  event = 'pull_request',
  branch = null,
  baseBranch = 'main',
  labels = [],
  changed = [],
} = {}) {
  const unknown = changed.length === 0;
  const documented = isDocumentationOnly(changed);
  const manual = event === 'workflow_dispatch';
  const push = event === 'push';
  const pullRequest = event === 'pull_request';
  const target = push ? branch : baseBranch;
  const onMain = target === 'main';
  const onDevelop = target === 'develop';
  const unexpected = (push || pullRequest) && !onMain && !onDevelop;
  const labelled = pullRequest && labels.includes(BROWSER_LABEL);

  // A main pull request is the gate; a develop merge gets the smoke as a
  // post-merge net; a develop pull request is fast unless it asks, or unless
  // nobody could establish what changed or where it is going.
  const smoke = manual || unknown || unexpected || labelled || (push ? onMain || onDevelop : onMain);
  const acceptance = manual || unknown || unexpected || labelled || (onMain && !documented);

  return {
    acceptance,
    smoke,
    reason: explain({ unknown, documented, manual, push, pullRequest, target, labelled, onMain, onDevelop, unexpected }),
  };
}

/**
 * One sentence a reviewer can check against the event and the file list.
 *
 * @param {object} facts
 * @param {boolean} facts.unknown
 * @param {boolean} facts.documented
 * @param {boolean} facts.manual
 * @param {boolean} facts.push
 * @param {boolean} facts.pullRequest
 * @param {string | null} facts.target
 * @param {boolean} facts.labelled
 * @param {boolean} facts.onMain
 * @param {boolean} facts.onDevelop
 * @param {boolean} facts.unexpected
 * @returns {string}
 */
function explain(facts) {
  if (facts.manual) {
    return 'manual run: smoke and complete acceptance run';
  }

  if (facts.unknown) {
    return 'no file list could be established (fail-safe): smoke and complete acceptance run';
  }

  if (facts.unexpected) {
    return 'unexpected target branch (fail-safe): smoke and complete acceptance run';
  }

  if (facts.push) {
    if (facts.onMain) {
      return facts.documented
        ? 'push to main, documentation only: smoke runs, complete acceptance is skipped'
        : 'push to main: smoke and complete acceptance run';
    }

    return 'push to develop: smoke runs as a post-merge safety net; complete acceptance waits for main';
  }

  if (facts.onMain) {
    return facts.documented
      ? 'pull request to main, documentation only: smoke runs, complete acceptance is skipped'
      : 'pull request to main: smoke and complete acceptance run';
  }

  if (facts.labelled) {
    return `pull request to develop with the "${BROWSER_LABEL}" label: smoke and complete acceptance run`;
  }

  return `pull request to develop: fast checks only; add the "${BROWSER_LABEL}" label, or let the main pull request run the browser gates`;
}
