/**
 * What the game page looks at when it opens (ticket B3).
 *
 * Three numbers — the seed, the magnification and the viewport — and the reason
 * they are here rather than in `boot.ts` is that `boot.ts` imports the rendering
 * engine. A browser test runs in Node and wants to know what the page *should*
 * be showing, so the numbers it has to agree with have to be reachable without
 * loading PixiJS; the module that decides them is therefore a module with no
 * imports at all.
 *
 * They are decisions, so they are written down once and read from both sides:
 * change the default seed here and the page and the test move together, which is
 * the opposite of a test that reads the seed back off the page and can no longer
 * tell whether the page chose the right one.
 */

/**
 * The seed the game page opens on, until something lets a player choose one.
 *
 * Seven, because it is the seed the README dumps: the map a reader can look at on
 * the command line is the map the page draws, which is worth more than a round
 * number.
 */
export const DEFAULT_SEED = 7;

/** The magnification the page opens at: a tile is 32 screen pixels, and the frame holds 20×15 of them. */
export const DEFAULT_ZOOM = 2;

/** The viewport width in stage pixels, which is also the canvas width in screen pixels. */
export const VIEWPORT_WIDTH = 640;

/** The viewport height in stage pixels. */
export const VIEWPORT_HEIGHT = 480;
