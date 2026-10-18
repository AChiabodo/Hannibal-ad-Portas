/**
 * The asset fence: no image, font or audio file in the repository (ticket B2,
 * PLAN §2.1, ADR-0002).
 *
 * The fence exists because the constraint is easy to break by accident — a
 * screenshot dragged into a folder, a woff2 dropped in beside a stylesheet — and
 * because the rule is invisible in a diff that shows a filename and a line count.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { findAssetFiles } from '../../scripts/guards/asset-files.mjs';
import { makeTree, type FixtureTree } from './make-tree';

let tree: FixtureTree | undefined;

afterEach(() => {
  tree?.remove();
  tree = undefined;
});

describe('findAssetFiles', () => {
  it('reports every image, font and sound, and names the kind', () => {
    tree = makeTree({
      'src/render/logo.png': 'binary',
      'docs/figure.svg': '<svg></svg>',
      'src/ui/hud.ttf': 'binary',
      'src/ui/hud.woff2': 'binary',
      'src/audio/theme.wav': 'binary',
      'src/audio/theme.mp3': 'binary',
    });

    const violations = findAssetFiles(tree.root);

    expect(violations.map((violation) => violation.file)).toEqual([
      'docs/figure.svg',
      'src/audio/theme.mp3',
      'src/audio/theme.wav',
      'src/render/logo.png',
      'src/ui/hud.ttf',
      'src/ui/hud.woff2',
    ]);
    expect(violations.every((violation) => violation.message.includes('ADR-0002'))).toBe(true);
    expect(violations.map((violation) => violation.message.match(/committed (\w+)/)?.[1])).toEqual([
      'image',
      'audio',
      'audio',
      'image',
      'font',
      'font',
    ]);
    expect(violations.every((violation) => violation.line === 1 && violation.column === 1)).toBe(true);
  });

  it('leaves code, documents and build output alone', () => {
    tree = makeTree({
      'src/main.ts': 'export {};',
      'index.html': '<html></html>',
      'README.md': '# readme',
      'docs/plan.json': '{}',
      'dist/assets/logo.png': 'generated at build time',
      'node_modules/pkg/icon.ico': 'a dependency',
      'coverage/report/index.html': '<html></html>',
    });

    expect(findAssetFiles(tree.root)).toEqual([]);
  });

  it('looks at the case of the extension the way a file system does on some of them', () => {
    tree = makeTree({ 'src/art/SPRITE.PNG': 'binary', 'src/audio/Theme.WAV': 'binary' });

    expect(findAssetFiles(tree.root).length).toBe(2);
  });
});
