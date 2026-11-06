#!/usr/bin/env node
/**
 * Which browser gates a change takes (ticket #64, follow-up).
 *
 * The rules live in `selection-rules.mjs`, where a unit test reaches them. This
 * CLI is what the CI plan job runs: it reads the event, the target branch, the
 * pull request's labels and the changed files, and prints the two decisions the
 * jobs need.
 *
 * The short version:
 *
 * - a pull request into `main`, a push to `main`, and a manual run take smoke and
 *   complete acceptance;
 * - a push to `develop` takes the smoke as a post-merge safety net;
 * - a pull request into `develop` takes the fast checks only, unless it carries
 *   the `browser` label (or the diff could not be read, which escalates).
 *
 * Nothing here decides *whether the game is correct*; it decides how much
 * browser evidence CI buys. Local profiles remain the developer's choice:
 * `npm run test:smoke`, `test:feature`, `test:accept`.
 *
 * Usage:
 *   node scripts/selection.mjs --files <a.md,b.ts> [--github]
 *   node scripts/selection.mjs --base <sha> --base-branch develop --labels a,b --github
 *   node scripts/selection.mjs --event push --branch develop --base <sha> --github
 *   node scripts/selection.mjs --event workflow_dispatch --github
 *
 * `--github` prints the `name=value` lines a workflow writes to `$GITHUB_OUTPUT`;
 * the explanation still goes to standard error, where a reader can find it.
 *
 * Exit codes: 0 the decision was printed, 2 the CLI was misused.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { selectGates } from './selection-rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const argv = process.argv.slice(2);
/** @type {string[] | undefined} */
let files;
/** @type {string | undefined} */
let base;
let event = 'pull_request';
/** @type {string | null} */
let branch = null;
let baseBranch = 'main';
/** @type {string[]} */
let labels = [];
let github = false;

for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];

  if (argument === '--files') {
    files = listAt(argv, index + 1);
    index += 1;
  } else if (argument === '--base') {
    base = argv[index + 1];
    index += 1;
  } else if (argument === '--event') {
    event = argv[index + 1] ?? event;
    index += 1;
  } else if (argument === '--branch') {
    branch = argv[index + 1] ?? null;
    index += 1;
  } else if (argument === '--base-branch') {
    baseBranch = argv[index + 1] ?? baseBranch;
    index += 1;
  } else if (argument === '--labels') {
    labels = listAt(argv, index + 1);
    index += 1;
  } else if (argument === '--github') {
    github = true;
  } else if (argument === '--help' || argument === '-h') {
    console.log('Usage: node scripts/selection.mjs [--files a.md,b.ts] [--base <sha>] [--event <event>] [--branch <name>] [--base-branch <name>] [--labels a,b] [--github]');
    process.exit(0);
  } else {
    console.error(`Unknown argument "${argument}".`);
    process.exit(2);
  }
}

if (files === undefined && base !== undefined) {
  files = changedSince(base);
}

const chosenEvent = readEvent(event);
if (chosenEvent === undefined) {
  console.error(`Unknown event "${event}". Expected push, pull_request or workflow_dispatch.`);
  process.exit(2);
}

const selection = selectGates({
  event: chosenEvent,
  branch,
  baseBranch,
  labels,
  changed: files ?? [],
});

if (github) {
  console.error(selection.reason);
  console.log(`smoke=${String(selection.smoke)}`);
  console.log(`acceptance=${String(selection.acceptance)}`);
} else {
  console.log(`event: ${event}`);
  console.log(`target: ${event === 'push' ? branch ?? 'unknown' : baseBranch}`);
  console.log(`changed files: ${String(files?.length ?? 0)}`);
  console.log(selection.reason);
  console.log(`smoke: ${String(selection.smoke)}`);
  console.log(`acceptance: ${String(selection.acceptance)}`);
}

/**
 * The event name, or `undefined` when it is not one this repository plans for.
 *
 * @param {string} value
 * @returns {'push' | 'pull_request' | 'workflow_dispatch' | undefined}
 */
function readEvent(value) {
  return value === 'push' || value === 'pull_request' || value === 'workflow_dispatch' ? value : undefined;
}

/**
 * A comma-separated argument, as GitHub Actions passes a label list or a file
 * list. An empty string is an empty list, not a one-element list.
 *
 * @param {readonly string[]} args
 * @param {number} at
 * @returns {string[]}
 */
function listAt(args, at) {
  return (args[at] ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/**
 * The files a branch changed since a base commit.
 *
 * A git failure is returned as an empty list, which `selectGates` treats as
 * "unknown" and therefore as both browser gates.
 *
 * @param {string} base
 * @returns {string[]}
 */
function changedSince(base) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
    return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}
