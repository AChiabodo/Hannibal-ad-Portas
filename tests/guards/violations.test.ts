import { describe, expect, it } from 'vitest';
import { withChain } from '../../scripts/guards/violations.mjs';

describe('withChain', () => {
  it('adds the chain the reachability walk recorded for the file', () => {
    const chains = new Map([['src/art/noise.ts', ['src/sim/index.ts', 'src/art/noise.ts']]]);

    const violation = withChain(
      { file: 'src/art/noise.ts', line: 3, column: 1, message: 'uses Math.pow' },
      chains,
    );

    expect(violation).toEqual({
      file: 'src/art/noise.ts',
      line: 3,
      column: 1,
      message: 'uses Math.pow',
      chain: ['src/sim/index.ts', 'src/art/noise.ts'],
    });
  });

  it('falls back to the file itself when the walk recorded no chain for it', () => {
    const violation = withChain(
      { file: 'src/sim/rng.ts', line: 1, column: 1, message: 'reaches Math.random' },
      new Map(),
    );

    expect(violation.chain).toEqual(['src/sim/rng.ts']);
  });

  it('leaves the violation it was handed alone', () => {
    const violation = { file: 'src/sim/rng.ts', line: 1, column: 1, message: 'reaches Math.random' };

    withChain(violation, new Map());

    expect(violation).not.toHaveProperty('chain');
  });
});
