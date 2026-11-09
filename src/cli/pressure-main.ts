import { DIFFICULTY_NAMES } from '../ai/difficulty.ts';
import { diagnosePressure, PRESSURE_SEEDS } from './pressure.ts';
import { explicitSeed } from '../input/match-setup.ts';

const seed = process.argv[2];
if (process.argv.length > 3 || (seed !== undefined && explicitSeed(seed) === null)) {
  console.error('Usage: node src/cli/pressure-main.ts [seed: uint32]');
  process.exit(2);
}
const seeds = seed === undefined ? PRESSURE_SEEDS : [Number(seed)];
let failed = false;
for (const value of seeds) {
  for (const faction of ['rome', 'carthage'] as const) {
    for (const difficulty of DIFFICULTY_NAMES) {
      const start = performance.now();
      const result = diagnosePressure(value, faction, difficulty);
      console.log(JSON.stringify({ ...result, computeMilliseconds: Math.round(performance.now() - start) }));
      if (!result.pass) failed = true;
    }
  }
}
process.exitCode = failed ? 1 : 0;
