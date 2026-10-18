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

/**
 * Which Faction's view the page shows: whose fog is drawn over the theatre.
 *
 * Rome, and not a choice: the page has one side on screen and no Match to pick a
 * side in yet (C2). It is the *viewed* Faction and not "the player's", because a
 * Player is whichever Controller drives a Faction (GLOSSARY: Player) — the same
 * page could show Carthage to a spectator or a replay, and the fog would be
 * Carthage's. The day a side can be chosen this becomes a value, and `boot.ts`
 * reads it exactly as it reads this.
 */
export const VIEWED_FACTION = 'rome';

/** The magnification the page opens at: a tile is 32 screen pixels, and the frame holds 20×15 of them. */
export const DEFAULT_ZOOM = 2;

/** The viewport width in stage pixels, which is also the canvas width in screen pixels. */
export const VIEWPORT_WIDTH = 640;

/** The viewport height in stage pixels. */
export const VIEWPORT_HEIGHT = 480;
