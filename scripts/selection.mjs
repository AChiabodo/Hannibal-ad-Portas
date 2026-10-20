#!/usr/bin/env node
/**
 * Which changes must run complete browser acceptance (ticket #64).
 *
 * The fast profiles exist so a routine change does not pay for the whole
 * Chromium matrix, and that is only safe while the *escalation* is boring: a
 * change that could affect the game, the page or the verification machinery
 * itself runs `npm run test:accept`. Anything that cannot be classified — an
 * empty diff, a shallow clone with no base, a file nobody expected — also runs
 * it. The fail-safe direction is always "more acceptance", never less. The rules
 * themselves live in `selection-rules.mjs`, where a unit test reaches them.
 *
 * Usage:
 *   node scripts/selection.mjs --files <a.md,b.ts>
 *   node scripts/selection.mjs --base <sha>
 *   node scripts/selection.mjs --base <sha> --github
 *
 * `--github` prints the single line a workflow writes to `$GITHUB_OUTPUT`;
 * the explanation still goes to standard error, where a reader can find it.
 *
 * Exit codes: 0 the decision was printed, 2 the CLI was misused.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { explain, requiresAcceptance } from './selection-rules.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

const argv = process.argv.slice(2);
let files;
let base;
let github = false;

for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];

  if (argument === '--files') {
    files = (argv[index + 1] ?? '').split(',').map((file) => file.trim()).filter((file) => file.length > 0);
    index += 1;
  } else if (argument === '--base') {
    base = argv[index + 1];
    index += 1;
  } else if (argument === '--github') {
    github = true;
  } else if (argument === '--help' || argument === '-h') {
    console.log('Usage: node scripts/selection.mjs [--files a.md,b.ts] [--base <sha>] [--github]');
    process.exit(0);
  } else {
    console.error(`Unknown argument "${argument}".`);
    process.exit(2);
  }
}

if (files === undefined && base !== undefined) {
  files = changedSince(base);
}

if (files === undefined) {
  files = [];
}

const decision = requiresAcceptance(files);
const reason = explain(files, decision);

if (github) {
  console.error(reason);
  console.log(`acceptance=${String(decision)}`);
} else {
  console.log(`changed files: ${String(files.length)}`);
  console.log(reason);
  console.log(`acceptance: ${String(decision)}`);
}

/**
 * The files a branch changed since a base commit.
 *
 * A git failure is returned as an empty list, which `requiresAcceptance` treats
 * as "unknown" and therefore as acceptance.
 *
 * @param {string} base
 * @returns {readonly string[]}
 */
function changedSince(base) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
    return output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  } catch {
    return [];
  }
}
