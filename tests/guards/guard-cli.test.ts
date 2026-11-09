import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { makeTree, type FixtureTree } from './make-tree';

const GUARD = fileURLToPath(new URL('../../scripts/guard.mjs', import.meta.url));

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

/** `--scan src` keeps the fixtures small; the repository-wide default is its own test. */
const FIXTURE_ARGS = ['--scan', 'src'];

function runGuard(files: Record<string, string>, args: readonly string[] = FIXTURE_ARGS) {
  tree = makeTree(files);
  const result = spawnSync(process.execPath, [GUARD, '--root', tree.root, ...args], {
    encoding: 'utf8',
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('guard CLI', () => {
  it('fails the AI fence when a helper reads past Observation types', () => {
    const { status, output } = runGuard({
      'src/sim/state.ts': 'export const hidden = 1;',
      'src/ai/brain.ts': "import { hidden } from '../shared/leak.ts';",
      'src/shared/leak.ts': "export { hidden } from '../sim/state.ts';",
    });
    expect(status).toBe(1);
    expect(output).toContain('AI Observation imports');
    expect(output).toContain('src/shared/leak.ts:1');
  });

  it('passes a clean tree and says which fences it checked', () => {
    const { status, output } = runGuard({
      'src/sim/index.ts': "export { makeRng } from './prng';\n",
      'src/sim/prng.ts': 'export const makeRng = (seed: number): number => seed;\n',
      'src/render/adapter.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(output).toContain('no Math.random');
    expect(output).toContain('simulation boundary');
    expect(output).toContain('no transcendental math');
    expect(status).toBe(0);
  });

  it('fails loudly when the simulation reaches arithmetic no engine pins down', () => {
    const { status, output } = runGuard({
      'src/sim/rng.ts': 'export const spread = (x: number): number => Math.pow(x, 2);\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('src/sim/rng.ts:1');
    expect(output).toContain('Math.pow');
  });

  it('fails loudly and names the file that calls the global generator', () => {
    const { status, output } = runGuard({
      'src/sim/index.ts': 'export const roll = (): number => Math.random();\n',
    });

    expect(status).toBe(1);
    expect(output).toContain('src/sim/index.ts:1');
    expect(output).toContain('Math.random');
  });

  it('fails loudly and shows the chain that reaches the rendering engine', () => {
    const { status, output } = runGuard({
      'src/sim/index.ts': "export * from '../art/palette';\n",
      'src/art/palette.ts': "import { Color } from 'pixi.js';\nexport const palette = Color;\n",
    });

    expect(status).toBe(1);
    expect(output).toContain('src/art/palette.ts:1');
    expect(output).toContain('src/sim/index.ts → src/art/palette.ts → pixi.js');
  });

  it('scans the whole repository, not a list of directories someone has to maintain', () => {
    const { status, output } = runGuard(
      {
        'src/sim/index.ts': 'export {};\n',
        'tools/roll.ts': 'export const roll = (): number => Math.random();\n',
      },
      [],
    );

    expect(status).toBe(1);
    expect(output).toContain('tools/roll.ts:1');
  });

  it('refuses unknown arguments instead of guessing', () => {
    const { status, output } = runGuard({ 'src/sim/index.ts': 'export {};\n' }, ['--wat']);

    expect(status).toBe(2);
    expect(output).toContain('--wat');
  });
});
