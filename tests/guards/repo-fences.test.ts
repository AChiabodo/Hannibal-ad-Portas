import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findAmbientNondeterminismReachableFromSimulation } from '../../scripts/guards/ambient-globals.mjs';
import { findMathRandomViolations } from '../../scripts/guards/find-math-random.mjs';
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
  it('holds every fence', () => {
    const files = collectSourceFiles(REPO_ROOT, GUARDED_ROOTS);

    expect(files.length).toBeGreaterThan(0);
    expect(findMathRandomViolations(files, { root: REPO_ROOT })).toEqual([]);
    expect(findRendererReachableFromSimulation(REPO_ROOT)).toEqual([]);
    expect(findTranscendentalMathReachableFromSimulation(REPO_ROOT)).toEqual([]);
    expect(findAmbientNondeterminismReachableFromSimulation(REPO_ROOT)).toEqual([]);
  });
});
