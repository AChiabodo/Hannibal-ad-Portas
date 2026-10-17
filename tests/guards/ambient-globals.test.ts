import { afterEach, describe, expect, it } from 'vitest';
import { findAmbientNondeterminismReachableFromSimulation } from '../../scripts/guards/ambient-globals.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function violationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findAmbientNondeterminismReachableFromSimulation(tree.root);
}

describe('findAmbientNondeterminismReachableFromSimulation', () => {
  it('reports each ambient source a rule can read, naming the file and the line', () => {
    const violations = violationsOf({
      'src/sim/entropy.ts': 'export const draw = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;\n',
      'src/sim/ids.ts': 'export const id = (): string => crypto.randomUUID();\n',
      'src/sim/stamp.ts': 'export const stamp = (): number => Date.now();\n',
      'src/sim/elapsed.ts': 'export const elapsed = (): number => performance.now();\n',
    });

    // Every source in one list, in the order a reader walks the report: by file.
    expect(violations.map((violation) => violation.file)).toEqual([
      'src/sim/elapsed.ts',
      'src/sim/entropy.ts',
      'src/sim/ids.ts',
      'src/sim/stamp.ts',
    ]);
    expect(violations.map((violation) => violation.line)).toEqual([1, 1, 1, 1]);

    const messages = violations.map((violation) => violation.message).join('\n');
    expect(messages).toContain('crypto.getRandomValues');
    expect(messages).toContain('crypto.randomUUID');
    expect(messages).toContain('Date.now');
    expect(messages).toContain('performance.now');
  });

  it('calls the clock and the generator out as not part of a Match', () => {
    const violations = violationsOf({
      'src/sim/stamp.ts': 'export const stamp = (): number => Date.now();\n',
    });

    expect(violations[0]?.message).toContain('tick');
    expect(violations[0]?.message).toContain('PRNG');
  });

  it('follows the same reachability the other fences do, and shows the chain', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from '../ai/planner';\n",
      'src/ai/planner.ts': 'export const decideAt = (): number => Date.now();\n',
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/ai/planner.ts']);
    expect(violations[0]?.chain).toEqual(['src/sim/index.ts', 'src/ai/planner.ts']);
  });

  it('counts every spelling of the member, as the Math fences do', () => {
    const violations = violationsOf({
      'src/sim/bracket.ts': 'export const a = (): number => Date["now"]();\n',
      'src/sim/optional.ts': 'export const b = (): number => performance?.now();\n',
      'src/sim/alias.ts': 'const { now } = Date;\nexport const c = (): number => now();\n',
    });

    expect(violations.map((violation) => violation.file).sort()).toEqual([
      'src/sim/alias.ts',
      'src/sim/bracket.ts',
      'src/sim/optional.ts',
    ]);
  });

  it('does not police a file the simulation cannot reach', () => {
    const violations = violationsOf({
      'src/sim/index.ts': 'export const ready = true;\n',
      'src/render/clock.ts': 'export const stamp = (): number => Date.now();\n',
      'src/cli/timing.ts': 'export const elapsed = (): number => performance.now();\n',
    });

    expect(violations).toEqual([]);
  });

  it('leaves the spells the other fences own to them', () => {
    const violations = violationsOf({
      'src/sim/own.ts':
        'export const roll = (): number => Math.random();\n' +
        'export const square = (x: number): number => x ** 2;\n',
    });

    expect(violations).toEqual([]);
  });

  it('fails loudly when the simulation directory is missing', () => {
    tree = makeTree({ 'src/render/adapter.ts': 'export const ready = true;\n' });

    expect(() => findAmbientNondeterminismReachableFromSimulation(tree!.root)).toThrow(/src\/sim/);
  });
});
