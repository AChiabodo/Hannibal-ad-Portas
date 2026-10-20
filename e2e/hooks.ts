import { expect, type Page } from '@playwright/test';
import type { Rgba } from '../src/art/pixel-buffer';
import type { AtelierLayout } from '../src/render/atelier-layout';
import type { ViewState } from '../src/render/boot';
import type { HudModel, Rect, RowRect, Selection } from '../src/ui/hud';
import type { GameSnapshot, SiteReport, SquadReport } from '../src/render/game';
import type { MatchResult } from '../src/sim/driver';
import type { Selection as PlayerSelection } from '../src/input/selection';
import type { Command } from '../src/sim/command';
import type { LoggedCommand } from '../src/sim/replay';
import type { Knowledge } from '../src/sim/fog';

/**
 * Reading the page's debug hooks from a test.
 *
 * Both pages publish the same shape (ADR-0003): the game page fills `view` and
 * `game` and the Atelier fills `atelier`, and the others are null. One place
 * reads it, so a change to the hook shape fails here rather than in three spec
 * files that drifted apart.
 *
 * What crosses the bridge is *data*, not the hooks themselves: a function is not
 * serialisable, so a test asks the page to call its own hook and answer with the
 * result. That is why these read one thing each rather than handing back an
 * object pretending to be the page's.
 */

/** Which page's pixels a caller is asking about. */
export type HookName = 'view' | 'atelier';

/**
 * Opens the game page and waits for it, optionally with the clock stopped.
 *
 * A test that steps the Match wants the loop stopped first, so that one tick is
 * one picture and not whatever the frame rate handed over; a test about the page
 * booting wants it running. Either way this is the one place the page is opened,
 * so no spec invents its own idea of what "booted" means.
 */
export async function bootGame(page: Page, options: { paused?: boolean } = {}): Promise<void> {
  await page.goto('/e2e/game-fixture.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  if (options.paused === true) {
    await page.evaluate(() => {
      const game = window.__SPQR.game;
      if (game === null) throw new Error('the page published no game hooks');

      game.pause();
    });
  }
}

/** Where the game page's camera is looking, and how big its viewport is. */
export async function describeView(page: Page): Promise<ViewState> {
  const state = await page.evaluate(() => {
    const view = window.__SPQR.view;
    if (view === null) throw new Error('the page published no view hooks');

    return view.describe();
  });

  return state;
}

/** The Atelier's geometry: its canvas, and every column on it. */
export async function atelierReport(page: Page): Promise<AtelierLayout> {
  const report = await page.evaluate(() => {
    const atelier = window.__SPQR.atelier;
    if (atelier === null) throw new Error('the page published no atelier hooks');

    return atelier.report;
  });

  return report;
}

/** One extraction of the running page, read at the given canvas points. */
export async function samples(
  page: Page,
  which: HookName,
  points: readonly (readonly [number, number])[],
): Promise<readonly Rgba[]> {
  const asked: [number, number][] = points.map(([x, y]) => [x, y]);

  const read = await page.evaluate(
    ({ name, askedPoints }) => {
      const hooks = window.__SPQR[name];
      if (hooks === null) throw new Error(`the page published no ${name} hooks`);

      return hooks.samples(askedPoints);
    },
    { name: which, askedPoints: asked },
  );

  return read;
}

/** The game page's interface: the words and figures the HUD is showing. */
export async function hud(page: Page): Promise<HudModel> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.hud();
  });
}

/** Where each selectable row stands on the canvas. */
export async function hudRows(page: Page): Promise<readonly RowRect[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.hudRows();
  });
}

/** Every rectangle the interface covers, which is what the theatre is not visible through. */
export async function hudRects(page: Page): Promise<readonly Rect[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.hudRects();
  });
}

/** Selects a settlement or a Squad, or clears the selection. */
export async function select(page: Page, selection: Selection | null): Promise<void> {
  await page.evaluate((next) => window.__SPQR.game?.select(next), selection);
}

/** Steps the Match a whole number of ticks, without waiting for wall time. */
export async function advance(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => window.__SPQR.game?.advance(count), ticks);
}

/** What the Faction knows of each tile, row-major: B4's three states, as the page reads them. */
export async function knowledge(page: Page): Promise<readonly Knowledge[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.knowledge();
  });
}

/** The generated minimap, read at the given plate points. */
export async function minimapSamples(
  page: Page,
  points: readonly (readonly [number, number])[],
): Promise<readonly Rgba[]> {
  const asked: [number, number][] = points.map(([x, y]) => [x, y]);

  return page.evaluate((askedPoints) => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.minimapSamples(askedPoints);
  }, asked);
}

/** The Faction's own Squads, each with the theatre rectangle its men are drawn in. */
export async function squads(page: Page): Promise<readonly SquadReport[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.squads();
  });
}

/** What the Player has picked: the Squads an order would go to, and the settlement the panel shows. */
export async function selection(page: Page): Promise<PlayerSelection> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.selection();
  });
}

/** The Commands the page has applied lately, oldest first. */
export async function applied(page: Page): Promise<readonly LoggedCommand<Command>[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.applied();
  });
}

/** The Squads a control group holds. */
export async function groupOf(page: Page, index: number): Promise<readonly number[]> {
  return page.evaluate((which) => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.groupOf(which);
  }, index);
}

/**
 * Every place the Faction may see, with the rectangle each is drawn in (U6).
 *
 * The page's own list, not a recomputation: what a test reads here is what the
 * settlement layer was handed, so a click the test makes at one of these rectangles
 * is a click on what the page drew.
 */
export async function sites(page: Page): Promise<readonly SiteReport[]> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.sites();
  });
}

/** Turns the settlements' lens on or off, as the theatre pixel comparisons need. */
export async function showSettlements(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((show) => {
    window.__SPQR.game?.showSettlements(show);
  }, visible);
}

/** The Match's tick, which is what a pause or a fast-forward is measured in. */
export async function tickOf(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.tick();
  });
}

/**
 * Everything the page believes, as the plain-data copy it hands an inspector.
 *
 * One call rather than nine, because that is the surface an agent is written
 * against: the snapshot is what the page *is*, and the individual hooks are how it
 * was built.
 */
export async function state(page: Page): Promise<GameSnapshot> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.state();
  });
}

/**
 * Whether a screen point falls on a rectangle the interface covers.
 *
 * Three specs ask it of `hudRects` — is this theatre pixel hidden behind a panel —
 * and the answer has to be the same in all of them, so the predicate lives here
 * rather than once per file.
 */
export function covers(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}

/**
 * Presses the middle of an interface rectangle, as a pointer does.
 *
 * The canvas is not at the page's origin, so a rectangle the HUD publishes in canvas
 * pixels is offset by the canvas's own box before the click: this is the one place
 * that offset is applied, which is what makes "press the button the page drew" the
 * same sentence in every spec that does it.
 */
export async function press(page: Page, rect: Rect): Promise<void> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  await page.mouse.click(
    box.x + rect.x + Math.floor(rect.width / 2),
    box.y + rect.y + Math.floor(rect.height / 2),
  );
}

/** Plays the Match to its end without waiting for wall time, and says how it ended. */
export async function fastForward(page: Page): Promise<MatchResult> {
  return page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    return game.fastForward();
  });
}
