import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findAssetFiles } from '../../scripts/guards/asset-files.mjs';
import { findAiSimulationImports } from '../../scripts/guards/ai-boundary.mjs';
import { findAmbientNondeterminismReachableFromSimulation } from '../../scripts/guards/ambient-globals.mjs';
import { findMathRandomViolations } from '../../scripts/guards/find-math-random.mjs';
import { findRendererOutsideRender } from '../../scripts/guards/render-boundary.mjs';
import { findRendererReachableFromSimulation } from '../../scripts/guards/simulation-boundary.mjs';
import { findTranscendentalMathReachableFromSimulation } from '../../scripts/guards/transcendental-math.mjs';
import {
  GUARDED_ROOTS,
  collectSourceFiles,
} from '../../scripts/guards/source-files.mjs';

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/**
 * The fences are only worth something if they are wired to the real tree, so
 * this is the same check CI runs, against the repository as it is.
 */
describe('the repository itself', () => {
  // Each independently enforced fence keeps the default per-test time budget;
  // a growing source tree must not pool all seven scans under one timeout.
  it.each([
    { name: 'Math.random', check: () => {
      const files = collectSourceFiles(REPO_ROOT, GUARDED_ROOTS);
      expect(files.length).toBeGreaterThan(0);
      return findMathRandomViolations(files, { root: REPO_ROOT });
    } },
    { name: 'simulation boundary', check: () => findRendererReachableFromSimulation(REPO_ROOT) },
    { name: 'AI Observation imports', check: () => findAiSimulationImports(REPO_ROOT) },
    { name: 'renderer imports', check: () => findRendererOutsideRender(REPO_ROOT) },
    { name: 'transcendental math', check: () => findTranscendentalMathReachableFromSimulation(REPO_ROOT) },
    { name: 'ambient nondeterminism', check: () => findAmbientNondeterminismReachableFromSimulation(REPO_ROOT) },
    // The repository ships no pixels, but it does generate a lot of them.
    { name: 'committed assets', check: () => findAssetFiles(REPO_ROOT) },
  ])('holds the $name fence', ({ check }) => {
    expect(check()).toEqual([]);
  });
});
