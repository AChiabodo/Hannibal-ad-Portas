import { relative, sep } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectSourceFiles } from '../../scripts/guards/source-files.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

function shortPaths(root: string, files: readonly string[]): string[] {
  return files.map((file) => relative(root, file).split(sep).join('/'));
}

describe('collectSourceFiles', () => {
  it('walks directories recursively, keeps source files and returns absolute paths', () => {
    tree = makeTree({
      'src/sim/a.ts': 'export {};',
      'src/sim/deep/b.mjs': 'export {};',
      'src/sim/readme.md': '# not code',
      'src/sim/data.json': '{}',
    });

    const files = collectSourceFiles(tree.root, ['src']);

    expect(shortPaths(tree.root, files)).toEqual(['src/sim/a.ts', 'src/sim/deep/b.mjs']);
    expect(files.every((file) => file.startsWith(tree!.root))).toBe(true);
  });

  it('skips dependency and generated directories', () => {
    tree = makeTree({
      'src/sim/a.ts': 'export {};',
      'node_modules/pixi.js/lib/index.mjs': 'export {};',
      'dist/assets/app.js': 'export {};',
      'playwright-report/index.html': '<html></html>',
      'coverage/lcov-report/app.ts': 'export {};',
    });

    expect(shortPaths(tree.root, collectSourceFiles(tree.root, ['src', 'node_modules', 'dist']))).toEqual([
      'src/sim/a.ts',
    ]);
  });

  it('fails loudly when a configured scan root is missing', () => {
    const fixture = makeTree({ 'src/sim/a.ts': 'export {};' });
    tree = fixture;

    expect(() => collectSourceFiles(fixture.root, ['src', 'app'])).toThrow(/app/);
  });
});
