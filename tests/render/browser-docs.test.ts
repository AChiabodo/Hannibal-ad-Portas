import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ATELIER_HOOKS,
  GAME_PAGE_HOOKS,
  PAGES,
  SNAPSHOT_FIELDS,
  VIEW_HOOKS,
  GAME_HOOKS,
} from '../../src/hooks';

/**
 * The browser's hooks are documented in one place, for whoever writes an agent
 * against the page (E4), and this is what stops the document and the code from
 * drifting apart. It reads prose as data the way `command-docs.test.ts` reads the
 * Command table and `protocol-docs.test.ts` reads the protocol's messages.
 *
 * What it cannot do is check the *types*, and that is deliberate rather than a
 * gap: `src/hooks.ts` holds the names as data because an interface erases when
 * the page is built, and an interface also cannot be imported by a Node test —
 * `render/game.ts` is browser code and `tsconfig.node.json` has no DOM lib. So the
 * two halves of the proof sit in the project that can see its subject:
 * `e2e/surface.spec.ts` compares these lists with `keyof` the interfaces and with
 * the live `Object.keys(window.__SPQR)`, and this file compares them with the
 * document. Three checks, three places that can disagree, and no way for two of
 * them to be right and the third forgotten.
 */
const DOCUMENT = 'docs/BROWSER.md';
const PATH = fileURLToPath(new URL('../../docs/BROWSER.md', import.meta.url));
const TEXT = readFileSync(PATH, 'utf8');

/**
 * The names a table lists: the backticked first cell of every row, in the order
 * the document gives them. The name of a hook and the name of a snapshot field
 * both live in that cell, which is why one reader serves both.
 */
function namesIn(start: string, end: string): readonly string[] {
  const opening = TEXT.indexOf(start);
  const closing = TEXT.indexOf(end);
  if (opening < 0 || closing < 0 || closing < opening) {
    throw new Error(`${DOCUMENT} is missing the ${start} … ${end} markers`);
  }

  return TEXT.slice(opening + start.length, closing)
    .split('\n')
    .filter((line) => line.trim().startsWith('| `'))
    .map((line) => (line.split('|')[1] ?? '').replaceAll('`', '').trim());
}

describe('the browser hooks documentation', () => {
  it('documents the four fields a page publishes on window.__SPQR, and nothing else', () => {
    expect(namesIn('<!-- pages:start -->', '<!-- pages:end -->')).toEqual([...PAGES]);
  });

  it('documents every hook the game page publishes, in the order the page lists them', () => {
    expect(namesIn('<!-- surface:start -->', '<!-- surface:end -->')).toEqual([...GAME_PAGE_HOOKS]);
  });

  it('documents every view hook, so that a camera can be driven from the document alone', () => {
    const documented = namesIn('<!-- surface:start -->', '<!-- surface:end -->');

    // Each list is documented as a group in the surface table, in its own order:
    // the camera's hooks first, then the Match's.
    expect(documented.filter((name) => (VIEW_HOOKS as readonly string[]).includes(name))).toEqual([
      ...VIEW_HOOKS,
    ]);
    expect(documented.filter((name) => (GAME_HOOKS as readonly string[]).includes(name))).toEqual([
      ...GAME_HOOKS,
    ]);
  });

  it('documents the Atelier’s hooks', () => {
    expect(namesIn('<!-- atelier:start -->', '<!-- atelier:end -->')).toEqual([...ATELIER_HOOKS]);
  });

  it('names the snapshot’s fields in the order the page builds them', () => {
    // The names *and* their order: `state()` builds the snapshot as an object
    // literal, so `Object.keys` is that literal's order, and a document that
    // listed the same fields in another order would describe an object nobody
    // receives. `e2e/surface.spec.ts` holds this table to the live object and the
    // list to the type; here it is held to the document.
    expect(namesIn('<!-- snapshot:start -->', '<!-- snapshot:end -->')).toEqual([...SNAPSHOT_FIELDS]);
  });
});
