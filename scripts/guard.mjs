#!/usr/bin/env node
/**
 * The fences CI leans on (PLAN §3, §6). They are numbered as the README numbers
 * them, so a report and the document agree about which rule broke:
 *
 *   1. the simulation cannot reach the rendering engine (ADR-0001);
 *   2. `pixi.js` lives under `render/` and nowhere else (PLAN §3);
 *   3. no `Math.random` anywhere (ADR-0006);
 *   4. the simulation cannot reach arithmetic ECMA-262 leaves
 *      implementation-approximated, so two engines may disagree (ADR-0006);
 *   5. the simulation cannot reach the ambient clock or entropy — `crypto`,
 *      `Date.now`, `performance.now` (ADR-0006);
 *   6. no image, font or audio file is committed (PLAN §2.1, ADR-0002).
 *
 * All six are crude on purpose and loud on purpose: they name the offending file.
 * The three that look for a member are syntactic, so they see a global spelled
 * out and not an alias of it; the README names the spellings a green tick does
 * not cover.
 *
 * Usage: node scripts/guard.mjs [--root <dir>] [--scan <dir>]...
 *
 * The first `--scan` replaces the default list, so a narrower scan is exactly
 * what was asked for.
 *
 * Exit codes: 0 fences hold, 1 a fence is broken, 2 the CLI was misused.
 */
import { ASSET_EXTENSIONS, findAssetFiles } from './guards/asset-files.mjs';
import { GUARDED_ROOTS, collectSourceFiles } from './guards/source-files.mjs';
import { findAmbientNondeterminismReachableFromSimulation } from './guards/ambient-globals.mjs';
import { findMathRandomViolations } from './guards/find-math-random.mjs';
import { existingSimulationEntries } from './guards/sim-reachability.mjs';
import { findRendererReachableFromSimulation } from './guards/simulation-boundary.mjs';
import { RENDERER_ALLOWED_DIRECTORIES, findRendererOutsideRender } from './guards/render-boundary.mjs';
import { findTranscendentalMathReachableFromSimulation } from './guards/transcendental-math.mjs';

const USAGE = `Usage: node scripts/guard.mjs [--root <dir>] [--scan <dir>]...

  --root <dir>  repository root to guard (default: current directory)
  --scan <dir>  root-relative directory to scan for Math.random, repeatable`;

/** Wide enough for the longest fence label plus the gap before its detail. */
const LABEL_WIDTH = 36;

const argv = process.argv.slice(2);

/** @type {{ root: string, scan: string[] }} */
const options = { root: process.cwd(), scan: [...GUARDED_ROOTS] };
let scanWasGiven = false;

for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];

  if (argument === '--help' || argument === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  if (argument === '--root' || argument === '--scan') {
    const value = argv[index + 1];
    if (value === undefined) {
      console.error(`guard: ${argument} needs a value\n\n${USAGE}`);
      process.exit(2);
    }
    index += 1;

    if (argument === '--root') {
      options.root = value;
    } else {
      if (!scanWasGiven) {
        options.scan = [];
        scanWasGiven = true;
      }
      if (!options.scan.includes(value)) options.scan.push(value);
    }
    continue;
  }

  console.error(`guard: unknown argument: ${argument}\n\n${USAGE}`);
  process.exit(2);
}

try {
  const mathRandomFiles = collectSourceFiles(options.root, options.scan);
  const mathRandomViolations = findMathRandomViolations(mathRandomFiles, { root: options.root });
  const boundaryViolations = findRendererReachableFromSimulation(options.root);
  const transcendentalViolations = findTranscendentalMathReachableFromSimulation(options.root);
  const ambientViolations = findAmbientNondeterminismReachableFromSimulation(options.root);
  const renderViolations = findRendererOutsideRender(options.root);
  const assetViolations = findAssetFiles(options.root);
  const entries = existingSimulationEntries(options.root).join(", ");

  report("simulation boundary", boundaryViolations, `entry ${entries}`);
  report("pixi.js outside render/", renderViolations, `allowed under ${RENDERER_ALLOWED_DIRECTORIES.join(", ")}`);
  report("no Math.random", mathRandomViolations, `${mathRandomFiles.length} files scanned`);
  report("no transcendental math", transcendentalViolations, `entry ${entries}`);
  report("no ambient clock or entropy", ambientViolations, `entry ${entries}`);
  report("no committed assets", assetViolations, `${ASSET_EXTENSIONS.size} file kinds refused`);

  const total =
    mathRandomViolations.length +
    boundaryViolations.length +
    transcendentalViolations.length +
    ambientViolations.length +
    renderViolations.length +
    assetViolations.length;
  if (total > 0) {
    console.error(`\nguard: ${total} violation(s) — the fences in docs/PLAN.md §3 do not hold`);
    process.exit(1);
  }

  console.log('\nguard: fences hold');
} catch (error) {
  console.error(`guard: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}

/**
 * @param {string} label
 * @param {import('./guards/violations.mjs').Violation[]} violations
 * @param {string} detail
 */
function report(label, violations, detail) {
  const name = `guard: ${label}`;

  if (violations.length === 0) {
    console.log(`ok    ${name.padEnd(LABEL_WIDTH)}${detail}`);
    return;
  }

  console.log(`FAIL  ${name.padEnd(LABEL_WIDTH)}${violations.length} violation(s), ${detail}`);
  for (const violation of violations) {
    console.log(`        ${violation.file}:${violation.line}:${violation.column}  ${violation.message}`);
    if (violation.chain !== undefined) {
      console.log(`          how: ${violation.chain.join(' → ')}`);
    }
  }
}
