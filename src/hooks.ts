/**
 * The debug hooks' names, as data (ADR-0003, ticket E4).
 *
 * `src/debug.ts` says what *shape* a page publishes; this says what the hooks
 * are *called*, in a form a test can compare things against. That distinction is
 * the whole reason this module exists: an interface erases when the page is
 * built, so "every hook is documented" and "the page publishes every hook" are
 * questions nothing can ask of a type — but they are cheap questions to ask of a
 * list.
 *
 * Three things are held to these lists, and none of them can drift alone:
 *
 * - **the interfaces they name**, by the compiler: `e2e/surface.spec.ts` compares
 *   each list with `keyof` the interface it belongs to, so a hook added to one
 *   side and not the other is a type error that names the hook;
 * - **the running page**, at run time: the same spec reads
 *   `Object.keys(window.__SPQR.view)` and finds exactly these names, which is
 *   what makes `window.__SPQR` a contract rather than a convention;
 * - **the document an agent is written from** (`docs/BROWSER.md`), by
 *   `tests/render/browser-docs.test.ts`, which reads its tables back the way the
 *   Command and protocol documents are read back.
 *
 * It also carries the fields of the snapshot `state()` returns, for the same
 * three reasons: the snapshot is the bigger half of what an agent reads, and it is
 * an object literal rather than an interface, so its field list is the only thing
 * a document and a running page can be compared with.
 *
 * The module holds no imports at all, on purpose: a browser test, a unit test and
 * a page can all reach it, and reaching it costs nothing.
 */

/**
 * The four things a page publishes on `window.__SPQR`, in the order the type
 * lists them.
 *
 * One page fills `view` and `game`, the Atelier fills `atelier`, and whichever is
 * not this page is `null`: one inspection routine reads either page.
 */
export const PAGES = ['boot', 'view', 'game', 'atelier'] as const;

/**
 * The camera and the pixel read-back — `ViewHooks` in `render/boot.ts`.
 *
 * Every one of these is a call a Player's wheel or drag makes too, which is what
 * "nothing about the page is reachable only by a hand" means in practice.
 */
export const VIEW_HOOKS = [
  'panBy',
  'zoomTo',
  'zoomAbout',
  'lookFrom',
  'inspect',
  'describe',
  'samples',
] as const;

/**
 * The running Match — `GameHooks` in `render/game.ts`.
 *
 * The interface, the Player's hands, the clock and the inspection surface. Five
 * of these (`orderAt`, `orderNow`, `setFormation`, `bindGroup`, `recallGroup`)
 * issue Commands, and every one of them issues what a pointer or a keyboard
 * could: there is no hook that takes a Command, which is the property
 * `e2e/surface.spec.ts` proves at the type level.
 */
export const GAME_HOOKS = [
  'hud',
  'selection',
  'select',
  'hudRects',
  'hudRows',
  'hudLayout',
  'scrollHud',
  'squads',
  'corpses',
  'selectAt',
  'selectIn',
  'orderAt',
  'orderNow',
  'setFormation',
  'bindGroup',
  'recallGroup',
  'groupOf',
  'tick',
  'advance',
  'bound',
  'result',
  'state',
  'hash',
  'fastForward',
  'pause',
  'resume',
  'paused',
  'speed',
  'setSpeed',
  'minimapSamples',
  'knowledge',
  'showSquads',
  'applied',
] as const;

/**
 * Everything the game page's `view` and `game` fields hold: the two interfaces
 * above, and the frame report the page booted with.
 *
 * `probe` is a value rather than a call — it is what the renderer said about
 * itself when it started — and it belongs to `GameView` in `render/boot.ts`
 * rather than to either half.
 */
export const GAME_PAGE_HOOKS = ['probe', ...VIEW_HOOKS, ...GAME_HOOKS] as const;

/**
 * The Atelier's inspection surface — `AtelierHooks` in `render/atelier.ts`.
 *
 * The catalogue page publishes what it laid out and what it drew, and no Match at
 * all: it is the other page an agent can open, and the only one whose subject is
 * the art rather than the war.
 */
export const ATELIER_HOOKS = ['report', 'zooms', 'samples'] as const;

/** Everything the Atelier page publishes: its three hooks, and the frame it booted with. */
export const ATELIER_PAGE_HOOKS = ['probe', ...ATELIER_HOOKS] as const;

/**
 * The fields of the snapshot `state()` hands an inspector — `GameSnapshot` in
 * `render/game.ts`.
 *
 * In the order the page builds them, because that is the order `Object.keys`
 * reports and the order the document lists them in: the snapshot is an object a
 * reader is promised, and a table listing the same fields in another order would
 * describe an object nobody receives. It is here for the reason the hook names
 * are: a field list is a thing a document and a running page can be held to, and
 * a type is not.
 */
export const SNAPSHOT_FIELDS = [
  'tick',
  'bound',
  'seed',
  'faction',
  'paused',
  'speed',
  'result',
  'hash',
  'visible',
  'hud',
  'selection',
  'squads',
  'corpses',
  'knowledge',
  'applied',
] as const;
