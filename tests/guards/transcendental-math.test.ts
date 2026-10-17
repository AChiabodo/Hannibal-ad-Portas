import { afterEach, describe, expect, it } from 'vitest';
import { findTranscendentalMathReachableFromSimulation } from '../../scripts/guards/transcendental-math.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function violationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findTranscendentalMathReachableFromSimulation(tree.root);
}

describe('findTranscendentalMathReachableFromSimulation', () => {
  it('is silent for arithmetic that is exact everywhere', () => {
    const violations = violationsOf({
      'src/sim/geometry.ts':
        'export const lengthSquared = (x: number, y: number): number => x * x + y * y;\n' +
        'export const root = (value: number): number => Math.sqrt(value);\n' +
        'export const clamp = (value: number): number => Math.max(0, Math.min(9, value));\n',
    });

    expect(violations).toEqual([]);
  });

  it('names the file and the line that reaches a transcendental', () => {
    const violations = violationsOf({
      'src/sim/facing.ts': 'export const facing = (radians: number): number => Math.sin(radians);\n',
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/sim/facing.ts', line: 1 });
    expect(violations[0]?.message).toContain('Math.sin');
    expect(violations[0]?.chain).toEqual(['src/sim/facing.ts']);
  });

  it('follows the same reachability the renderer fence does, and shows the chain', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from '../art/noise';\n",
      'src/art/noise.ts': 'export const noise = (t: number): number => Math.pow(t, 2.5);\n',
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/art/noise.ts']);
    expect(violations[0]?.chain).toEqual(['src/sim/index.ts', 'src/art/noise.ts']);
  });

  it('counts every spelling of the member, as the Math.random fence does', () => {
    const violations = violationsOf({
      'src/sim/bracket.ts': 'export const a = (x: number): number => Math["log"](x);\n',
      'src/sim/optional.ts': 'export const b = (x: number): number => Math?.exp(x);\n',
      'src/sim/alias.ts': 'const { cos } = Math;\nexport const c = (x: number): number => cos(x);\n',
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
      'src/render/camera.ts': 'export const zoom = (x: number): number => Math.log(x);\n',
    });

    expect(violations).toEqual([]);
  });

  it('fails loudly when the simulation directory is missing', () => {
    tree = makeTree({ 'src/render/adapter.ts': 'export const ready = true;\n' });

    expect(() => findTranscendentalMathReachableFromSimulation(tree!.root)).toThrow(/src\/sim/);
  });
});
