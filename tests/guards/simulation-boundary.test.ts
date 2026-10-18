import { afterEach, describe, expect, it } from 'vitest';
import { findRendererReachableFromSimulation } from '../../scripts/guards/simulation-boundary.mjs';
import { findTranscendentalMathReachableFromSimulation } from '../../scripts/guards/transcendental-math.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function violationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findRendererReachableFromSimulation(tree.root);
}

/** Both reachability fences share the walk, so they share the entry fixtures too. */
function transcendentalViolationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findTranscendentalMathReachableFromSimulation(tree.root);
}

describe('findRendererReachableFromSimulation', () => {
  it('is silent when the simulation is made of plain modules', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export { makeRng } from './prng';\n",
      'src/sim/prng.ts': 'export function makeRng(seed: number): number {\n  return seed;\n}\n',
      'src/render/pixi-adapter.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations).toEqual([]);
  });

  it('reports a direct import and names the offending file and line', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/sim/index.ts', line: 1 });
    expect(violations[0]?.message).toContain('pixi.js');
    expect(violations[0]?.chain?.at(-1)).toBe('pixi.js');
    expect(violations[0]?.chain?.at(0)).toBe('src/sim/index.ts');
  });

  it('reports the file that actually reaches the engine, through a hop', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export { palette } from '../art/palette';\n",
      'src/art/palette.ts': "import { Color } from 'pixi.js';\nexport const palette = Color;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/art/palette.ts', line: 1 });
    expect(violations[0]?.chain).toEqual(['src/sim/index.ts', 'src/art/palette.ts', 'pixi.js']);
  });

  it('counts re-exports, type-only imports, dynamic imports and require', () => {
    const violations = violationsOf({
      'src/sim/reexport.ts': "export { Application } from 'pixi.js';\n",
      'src/sim/type-only.ts': "import type { Application } from 'pixi.js';\nexport type App = Application;\n",
      'src/sim/dynamic.ts': 'export const load = () => import("pixi.js");\n',
      'src/sim/legacy.ts': 'export const load = () => require("pixi.js");\n',
    });

    expect(violations.map((violation) => violation.file).sort()).toEqual([
      'src/sim/dynamic.ts',
      'src/sim/legacy.ts',
      'src/sim/reexport.ts',
      'src/sim/type-only.ts',
    ]);
    expect(violations.every((violation) => violation.message.includes('pixi.js'))).toBe(true);
  });

  it('follows extension-less imports into directory entry points', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from '../art';\n",
      'src/art/index.ts': "export * from './atlas';\n",
      'src/art/atlas.ts': "import { Texture } from 'pixi.js';\nexport const atlas = Texture;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.chain).toEqual([
      'src/sim/index.ts',
      'src/art/index.ts',
      'src/art/atlas.ts',
      'pixi.js',
    ]);
  });

  it('resolves a .js specifier to the TypeScript source beside it', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from '../art/index.js';\n",
      'src/art/index.ts': "export * from './atlas.js';\n",
      'src/art/atlas.ts': "import { Texture } from 'pixi.js';\nexport const atlas = Texture;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.file).toBe('src/art/atlas.ts');
    expect(violations[0]?.chain).toEqual([
      'src/sim/index.ts',
      'src/art/index.ts',
      'src/art/atlas.ts',
      'pixi.js',
    ]);
  });

  it('treats every file inside the simulation as an entry point', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from './map';\n",
      'src/sim/map.ts': "import type { Texture } from 'pixi.js';\nexport type Tile = Texture;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/sim/map.ts', line: 1 });
    expect(violations[0]?.chain).toEqual(['src/sim/map.ts', 'pixi.js']);
  });

  it('survives an import cycle between simulation modules', () => {
    const violations = violationsOf({
      'src/sim/a.ts': "import './b';\nexport const a = 1;\n",
      'src/sim/b.ts': "import './a';\nexport const b = 2;\n",
    });

    expect(violations).toEqual([]);
  });

  it('ignores bare imports it cannot resolve, such as node builtins', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n",
    });

    expect(violations).toEqual([]);
  });

  it('refuses to stay quiet about a relative import it cannot resolve', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "export * from './gone';\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain('./gone');
  });

  it('lets a relative asset import through untouched', () => {
    const violations = violationsOf({
      'src/sim/index.ts': "import './style.css';\nexport const ready = true;\n",
    });

    expect(violations).toEqual([]);
  });

  it('fails loudly when the simulation directory is missing', () => {
    tree = makeTree({ 'src/render/adapter.ts': 'export const ready = true;\n' });

    expect(() => findRendererReachableFromSimulation(tree!.root)).toThrow(/src\/sim/);
  });
});

/**
 * The simulation's entry is a list, not the single `src/sim` directory: ADR-0001
 * counts the AI as part of the simulation and PLAN §3 puts it in `ai/`, beside
 * `sim/`, and `content/` is the third root the plan counts as the simulation.
 * These pin that the shared walk covers both, whichever fence is asking.
 */
describe('the simulation entries', () => {
  it('fences the AI beside src/sim, without src/sim importing it', () => {
    const violations = violationsOf({
      'src/sim/index.ts': 'export {};\n',
      'src/ai/aim.ts': "export * from './ballistics';\n",
      'src/ai/ballistics.ts':
        "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/ai/ballistics.ts']);
    // Every file in an entry directory is an entry point, so the chain starts at the AI file.
    expect(violations[0]?.chain).toEqual(['src/ai/ballistics.ts', 'pixi.js']);
  });

  it('fences arithmetic no engine pins down inside the AI', () => {
    const violations = transcendentalViolationsOf({
      'src/sim/index.ts': 'export {};\n',
      'src/ai/tactical.ts': 'export const aim = (x: number): number => Math.sin(x);\n',
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/ai/tactical.ts']);
    expect(violations[0]?.message).toContain('Math.sin');
    expect(violations[0]?.chain).toEqual(['src/ai/tactical.ts']);
  });

  it('fences src/content, the other root the plan counts as the simulation', () => {
    const violations = violationsOf({
      'src/sim/index.ts': 'export {};\n',
      'src/content/units.ts':
        "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/content/units.ts']);
  });

  it('tolerates src/ai and src/content until the day they exist', () => {
    const violations = violationsOf({
      'src/sim/index.ts': 'export const ready = true;\n',
    });

    expect(violations).toEqual([]);
  });

  it('fails loudly when an entry exists but is not a directory', () => {
    tree = makeTree({
      'src/sim/index.ts': 'export {};\n',
      'src/ai': 'a file where the AI directory should be, not a root that is merely absent\n',
    });

    expect(() => findRendererReachableFromSimulation(tree!.root)).toThrow(
      /guard entry is not a directory: src\/ai/,
    );
  });
});
