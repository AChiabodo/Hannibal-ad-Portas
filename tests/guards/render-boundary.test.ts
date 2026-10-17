import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { findRendererOutsideRender } from '../../scripts/guards/render-boundary.mjs';
import { makeTree, type FixtureTree } from './make-tree';

/**
 * The fence that keeps `pixi.js` out of every Node-run source file (PLAN §3,
 * ADR-0001): only `src/render/` and `e2e/` may import it. It answers a different
 * question from the reachability fence next door — "may this file import the
 * engine at all", not "can the simulation reach it" — so a `pixi.js` in
 * `src/main.ts` is not reported as a simulation reaching the engine.
 */

const REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function violationsOf(files: Record<string, string>) {
  tree = makeTree(files);
  return findRendererOutsideRender(tree.root);
}

describe('findRendererOutsideRender', () => {
  it('is silent when only src/render imports the rendering engine', () => {
    expect(
      violationsOf({
        'src/sim/index.ts': 'export {};\n',
        'src/render/boot.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
      }),
    ).toEqual([]);
  });

  it('allows it below src/render, however deep the file is', () => {
    expect(
      violationsOf({
        'src/render/adapters/texture.ts': "import { Texture } from 'pixi.js';\nexport const texture = Texture;\n",
      }),
    ).toEqual([]);
  });

  it('reports src/main.ts, the page entry the reachability fence cannot see', () => {
    const violations = violationsOf({
      'src/main.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/main.ts', line: 1 });
    expect(violations[0]?.message).toContain('pixi.js');
    expect(violations[0]?.message).toContain('src/render/');
    expect(violations[0]?.message).toContain('e2e/');
  });

  it('reports a Vitest test, which Node runs', () => {
    const violations = violationsOf({
      'tests/renderer.helper.ts':
        "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file)).toEqual(['tests/renderer.helper.ts']);
  });

  it('reports a script, which Node runs too', () => {
    const violations = violationsOf({
      'scripts/tool.mjs': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file)).toEqual(['scripts/tool.mjs']);
  });

  it('allows it in e2e/, where Playwright drives a real browser', () => {
    expect(
      violationsOf({
        'e2e/boot.spec.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
      }),
    ).toEqual([]);
  });

  it('does not let a directory that merely starts with an allowed name through', () => {
    const violations = violationsOf({
      'src/rendering/hack.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
      'src/render-utils.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
      'e2e-helpers/pixi.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file).sort()).toEqual([
      'e2e-helpers/pixi.ts',
      'src/render-utils.ts',
      'src/rendering/hack.ts',
    ]);
  });

  it('reports src/cli/main.ts, where the engine has no business being', () => {
    const violations = violationsOf({
      'src/cli/main.ts': "import { Application } from 'pixi.js';\nexport const app = Application;\n",
    });

    expect(violations.map((violation) => violation.file)).toEqual(['src/cli/main.ts']);
  });

  it('reports a pixel generator in src/art, which must stay PixiJS-free for Vitest', () => {
    const violations = violationsOf({
      'src/art/generator.ts': "export { Texture } from 'pixi.js';\n",
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ file: 'src/art/generator.ts', line: 1 });
  });

  it('counts every spelling, as the reachability fence does', () => {
    const violations = violationsOf({
      'src/art/reexport.ts': "export { Application } from 'pixi.js';\n",
      'src/art/type-only.ts': "import type { Application } from 'pixi.js';\nexport type App = Application;\n",
      'src/art/dynamic.ts': 'export const load = () => import("pixi.js");\n',
      'src/art/legacy.ts': 'export const load = () => require("pixi.js");\n',
    });

    expect(violations.map((violation) => violation.file).sort()).toEqual([
      'src/art/dynamic.ts',
      'src/art/legacy.ts',
      'src/art/reexport.ts',
      'src/art/type-only.ts',
    ]);
  });

  it('does not mistake a mention for an import', () => {
    expect(
      violationsOf({
        'src/sim/index.ts': '// pixi.js is banned here, and a string naming it is not an import\nexport const note = "pixi.js";\n',
      }),
    ).toEqual([]);
  });

  it('holds on the real repository, as repo-fences.test.ts does for the other fences', () => {
    expect(findRendererOutsideRender(REPO_ROOT)).toEqual([]);
  });
});
