/**
 * The surface `window.__SPQR` publishes, held to the interfaces and to the
 * document (ticket E4).
 *
 * A debug surface is only a contract if something can prove it: the page is
 * reachable by an agent, the names it answers to are the names an agent was
 * written from, and nothing on it can be reached that a Player could not. This
 * spec is that proof, and it is deliberately made of three checks that cannot
 * drift apart:
 *
 * - **the names and the interfaces**, by the compiler, through the `Agrees` type
 *   below: a hook added to `GameHooks` and not to `GAME_HOOKS` is a type error
 *   that names it, and the other way round too;
 * - **the names and the page**, at run time: `Object.keys` of what the page
 *   actually published;
 * - **the names and the document**, in `tests/render/browser-docs.test.ts`,
 *   which runs in Node and reads `docs/BROWSER.md` back.
 *
 * The last of those is where `GAME_HOOKS` earns its keep: an interface erases
 * when the page is built, so a list is the only form in which "every hook is
 * documented" is a question anything can ask.
 *
 * It also carries the property the ticket is most careful about — *without
 * exposing Commands a Player could not issue* — as a type: no hook takes a
 * Command. The five that issue one take what a pointer or a keyboard produces
 * (a map point, a kind with a fixed vocabulary, a Formation, a control group's
 * digit), and they reach the Match through the human Controller, which validates
 * them and refuses the other Faction's. `HooksTakingACommand` is `never` today;
 * the day it is not, this file stops compiling.
 */
import { expect, test } from './fixtures';
import {
  ATELIER_HOOKS,
  ATELIER_PAGE_HOOKS,
  GAME_HOOKS,
  GAME_PAGE_HOOKS,
  PAGES,
  SNAPSHOT_FIELDS,
  VIEW_HOOKS,
} from '../src/hooks';
import type { SpqrDebugHooks } from '../src/debug';
import type { AtelierHooks } from '../src/render/atelier';
import type { ViewHooks } from '../src/render/boot';
import type { GameHooks, GameSnapshot } from '../src/render/game';
import type { Command } from '../src/sim/command';

/**
 * Whether a list of names and the keys of an interface are the same set.
 *
 * `true` when they are, and a compile error naming the difference when they are
 * not: `Exclude<Names, keyof Shape>` is the hook that was listed and never
 * declared, `Exclude<keyof Shape, Names>` the one declared and never listed.
 */
type Agrees<Names extends string, Shape> = [
  Exclude<Names, keyof Shape> | Exclude<keyof Shape, Names>,
] extends [never]
  ? true
  : false;

/** A function's parameters, as one union of types: the arguments a hook would take. */
type ArgumentsOf<Hook> = Hook extends (...args: infer Args) => unknown ? Args[number] : never;

/**
 * The Commands a hook's parameters would accept, if it accepted any.
 *
 * A single Command or a list of them: the two shapes an "issue this" hook would
 * have, and both are absent by design.
 */
type CommandParameters<Hook> = Extract<ArgumentsOf<Hook>, Command | readonly Command[]>;

/** The hooks that would take a Command, which must be none of them. */
type HooksTakingACommand = {
  [Name in keyof GameHooks]: [CommandParameters<GameHooks[Name]>] extends [never] ? never : Name;
}[keyof GameHooks];

/** `true` when no hook hands in a Command, `false` when one does — and then nothing compiles. */
type NoHookTakesACommand = [HooksTakingACommand] extends [never] ? true : false;

test('publishes exactly the hooks the interfaces declare, and no others', () => {
  const view: Agrees<(typeof VIEW_HOOKS)[number], ViewHooks> = true;
  const game: Agrees<(typeof GAME_HOOKS)[number], GameHooks> = true;
  const atelier: Agrees<(typeof ATELIER_HOOKS)[number], AtelierHooks> = true;
  const pages: Agrees<(typeof PAGES)[number], SpqrDebugHooks> = true;
  const gamePage: Agrees<(typeof GAME_PAGE_HOOKS)[number], ViewHooks & GameHooks & { probe: unknown }> = true;
  const atelierPage: Agrees<(typeof ATELIER_PAGE_HOOKS)[number], AtelierHooks & { probe: unknown }> = true;
  const snapshot: Agrees<(typeof SNAPSHOT_FIELDS)[number], GameSnapshot> = true;

  expect([view, game, atelier, pages, gamePage, atelierPage, snapshot]).toEqual([
    true,
    true,
    true,
    true,
    true,
    true,
    true,
  ]);
});

test('gives no hook a way to hand in a Command a Player could not issue', () => {
  const none: NoHookTakesACommand = true;

  // The compile-time answer is the real one; this is only so that a run says so.
  expect(none).toBe(true);
});

test('the snapshot’s fields are the ones it is documented and listed as', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const fields = await page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return Object.keys(game.state());
  });

  // The order too: the snapshot is an object literal, and the document's table
  // lists its fields in the order a reader receives them.
  expect(fields).toEqual([...SNAPSHOT_FIELDS]);
});

test('the running game page publishes its four fields, and the game page’s own hooks', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const published = await page.evaluate(() => ({
    pages: Object.keys(window.__SPQR).sort(),
    view: Object.keys(window.__SPQR.view ?? {}).sort(),
    atelier: window.__SPQR.atelier,
  }));

  expect(published.pages).toEqual([...PAGES].sort());
  // `view` and `game` are the same object on this page — one camera, one Match —
  // so its keys are both interfaces, and `probe` beside them.
  expect(published.view).toEqual([...GAME_PAGE_HOOKS].sort());
  expect(published.atelier, 'the game page is not the Atelier').toBeNull();
});

test('the Atelier publishes its own three hooks and no Match', async ({ page }) => {
  await page.goto('/atelier.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const published = await page.evaluate(() => ({
    pages: Object.keys(window.__SPQR).sort(),
    atelier: Object.keys(window.__SPQR.atelier ?? {}).sort(),
    game: window.__SPQR.game,
  }));

  expect(published.pages).toEqual([...PAGES].sort());
  expect(published.atelier).toEqual([...ATELIER_PAGE_HOOKS].sort());
  expect(published.game, 'the Atelier plays no Match').toBeNull();
});

test('every hook on the page answers to its own name', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  // `probe` is the one value; every other published name is a call, which is what
  // makes the surface a set of hooks rather than a bag of fields.
  const unreadable = await page.evaluate(() =>
    Object.entries(window.__SPQR.view ?? {})
      .filter(([name, value]) => name !== 'probe' && typeof value !== 'function')
      .map(([name]) => name),
  );

  expect(unreadable).toEqual([]);
});
