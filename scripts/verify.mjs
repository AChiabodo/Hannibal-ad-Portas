#!/usr/bin/env node
/**
 * The one entry point for a chosen verification profile (ticket #64).
 *
 * `npm run test:smoke`, `npm run test:feature -- orders` and the CI jobs all end
 * up here. The script resolves the profile in `scripts/profiles.mjs`, *prints
 * what it selected and why* before running anything, and then delegates to
 * Vitest or Playwright with the project's own configuration.
 *
 * Printing the selection is not decoration. The ticket's central risk is a fast
 * profile that quietly stops covering the behavior it names, so every run says
 * which files it is about to execute; the output is the attribution.
 *
 * Profiles:
 *
 *   focus [paths...]  non-browser tests related to the given (or changed) files
 *   unit              every non-browser test
 *   smoke             real boot, one ordinary Command, rendering and console health
 *   feature <name>    one browser responsibility (`--list` names them)
 *   accept            every browser spec, with visual captures off
 *   visual            the frame producers, with captures on
 *
 * Usage:
 *   node scripts/verify.mjs <profile> [arguments...]
 *   node scripts/verify.mjs --list
 *
 * Exit codes: the child's status, or 2 when the profile was misused.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CORE_TESTS,
  FEATURES,
  SMOKE,
  VISUAL_SPECS,
  acceptanceSpecs,
  featureNames,
  featureSpecs,
} from './profiles.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const VITEST = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const PLAYWRIGHT = join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');

/** The changes a focused run can attribute to a non-browser test. */
const TRACEABLE = ['src/', 'tests/', 'scripts/'];

const argv = process.argv.slice(2);
const profile = argv[0];

if (profile === undefined || profile === '--help' || profile === '-h') {
  console.log(usage());
  process.exit(profile === undefined ? 2 : 0);
}

if (profile === '--list') {
  list();
  process.exit(0);
}

switch (profile) {
  case 'focus':
    focus(argv.slice(1));
    break;
  case 'unit':
    runVitest(['run'], 'every non-browser test');
    break;
  case 'smoke':
    runPlaywright(SMOKE, argv.slice(1), 'real-browser smoke');
    break;
  case 'feature':
    feature(argv.slice(1));
    break;
  case 'accept':
    accept(argv.slice(1));
    break;
  case 'visual':
    visual(argv.slice(1));
    break;
  default:
    console.error(`Unknown profile "${profile}".\n\n${usage()}`);
    process.exit(2);
}

/** The help text, so a developer does not need this file open. */
function usage() {
  return [
    'Usage: node scripts/verify.mjs <profile> [arguments...]',
    '',
    '  focus [paths...]   Non-browser tests related to the given files; without',
    '                     paths, the files changed against HEAD, and the core',
    '                     public seams when nothing changed.',
    '  unit               Every non-browser (Vitest) test.',
    '  smoke              Real-browser smoke: boot, an ordinary Command through a',
    '                     real gesture, rendering and console health.',
    '  feature <name>     One browser responsibility, with extra Playwright',
    '                     arguments after it (for example --grep).',
    '  accept             Every browser spec. Visual captures are off.',
    '  visual             The frame producers. Writes PNGs to SPQR_VISUAL_DIR.',
    '',
    '  --list             List the feature responsibilities.',
    '',
    `Features: ${featureNames().join(', ')}`,
  ].join('\n');
}

/** The responsibilities, and the specs that own each one. */
function list() {
  console.log('Browser responsibilities (#64):\n');
  for (const [name, specs] of Object.entries(FEATURES)) {
    console.log(`  ${name.padEnd(12)} ${specs.join(', ')}`);
  }
  console.log(`\n  ${'smoke'.padEnd(12)} ${SMOKE.join(', ')}`);
  console.log(`\n  ${'visual'.padEnd(12)} ${VISUAL_SPECS.join(', ')}`);
}

/**
 * Focused non-browser checks.
 *
 * With paths, Vitest traces which tests reach them. Without, the same is done
 * for the working tree's changes against HEAD, and a clean tree falls back to the
 * public seams in `CORE_TESTS` — never to the whole suite, which is the profile
 * that stops being fast.
 *
 * @param {string[]} paths
 */
function focus(paths) {
  const given = paths.length > 0 ? paths : changedPaths();

  if (given === undefined) {
    runVitest(['run', ...CORE_TESTS], `the core seams (no traceable change): ${CORE_TESTS.join(', ')}`);
    return;
  }

  runVitest(['related', '--run', ...given], `tests related to: ${given.join(', ')}`);
}

/**
 * The working tree's changed files that a non-browser test could import, or
 * `undefined` when there are none.
 *
 * Untracked and modified files both count: a new module is exactly the case a
 * focused check should trace, and `git diff HEAD` alone would not see it. A
 * change that only touches `e2e/`, documentation or configuration is not
 * traceable to a Vitest file, and the caller falls back to the core seams —
 * never to the whole suite, which is the profile that stops being fast.
 *
 * @returns {string[] | undefined}
 */
function changedPaths() {
  const listing = changedListing();
  if (listing === undefined) return undefined;

  const changed = listing
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => TRACEABLE.some((prefix) => line.startsWith(prefix)))
    .filter((line) => existsSync(join(ROOT, line)));

  return changed.length > 0 ? changed : undefined;
}

/**
 * `git ls-files` for what the working tree changed, or `undefined` when git
 * cannot answer.
 *
 * @returns {string | undefined}
 */
function changedListing() {
  try {
    return execFileSync('git', ['ls-files', '-m', '-o', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return undefined;
  }
}

/**
 * One browser responsibility.
 *
 * @param {string[]} args the feature name, then Playwright's own arguments.
 */
function feature(args) {
  const [name, ...rest] = args;
  if (name === undefined) {
    console.error(`A feature name is required. Features: ${featureNames().join(', ')}`);
    process.exit(2);
  }

  const specs = featureSpecs(name);
  if (specs === undefined) {
    console.error(`Unknown feature "${name}". Features: ${featureNames().join(', ')}`);
    process.exit(2);
  }

  runPlaywright(specs, rest, `the ${name} responsibility`);
}

/**
 * Complete browser acceptance: every spec on disk, captures off.
 *
 * The list is read from the directory rather than from `FEATURES`, so a new spec
 * is included by existing. The profile test also checks that every file can be
 * attributed to a responsibility, which is what keeps a broad run diagnosable.
 *
 * @param {string[]} args Playwright's own arguments.
 */
function accept(args) {
  const specs = acceptanceSpecs(readdirSync(join(ROOT, 'e2e')));
  const env = { ...process.env };
  delete env.SPQR_VISUAL;
  delete env.SPQR_VISUAL_DIR;

  runPlaywright(specs, args, 'complete browser acceptance (captures off)', env);
}

/**
 * Visual-frame production: the same scenes, with the pictures written.
 *
 * Software WebGL at 1920x1080 is the slowest thing this repository runs, so this
 * profile is sequential by default. It is evidence production, not a gate: the
 * acceptance gate runs the same assertions without frames.
 *
 * @param {string[]} args Playwright's own arguments.
 */
function visual(args) {
  const directory = process.env.SPQR_VISUAL_DIR ?? join(tmpdir(), 'spqr-visual');
  const env = { ...process.env, SPQR_VISUAL: '1', SPQR_VISUAL_DIR: directory };
  const selected = args.some((argument) => argument === '--workers' || argument.startsWith('--workers='));
  const workers = selected ? [] : ['--workers=1'];

  console.log(`Visual frames will be written under: ${directory}`);

  runPlaywright(VISUAL_SPECS, [...workers, ...args], 'visual-frame production', env);
}

/**
 * Runs Vitest through its own CLI, so arguments and configuration are the ones
 * the project already uses.
 *
 * @param {string[]} args
 * @param {string} selection what this run is, in one line.
 */
function runVitest(args, selection) {
  announce(selection);
  finish(spawnSync(process.execPath, [VITEST, ...args], { cwd: ROOT, stdio: 'inherit' }));
}

/**
 * Runs Playwright with an explicit spec list, never with a path filter.
 *
 * @param {readonly string[]} specs
 * @param {readonly string[]} args extra Playwright arguments.
 * @param {string} selection what this run is, in one line.
 * @param {NodeJS.ProcessEnv} [env] environment for the child.
 */
function runPlaywright(specs, args, selection, env = process.env) {
  announce(selection);
  console.log(`  ${specs.join('\n  ')}\n`);
  finish(spawnSync(process.execPath, [PLAYWRIGHT, 'test', ...specs, ...args], { cwd: ROOT, stdio: 'inherit', env }));
}

/**
 * @param {string} selection what this run is, in one line.
 */
function announce(selection) {
  console.log(`\n# ${selection}`);
}

/**
 * Exits with the child's status, and refuses to report a missing child as success.
 *
 * @param {import('node:child_process').SpawnSyncReturns<Buffer>} result
 */
function finish(result) {
  if (result.error !== undefined) {
    console.error(result.error.message);
    process.exit(2);
  }
  process.exit(result.status ?? 2);
}
