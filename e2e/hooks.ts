import type { Page } from '@playwright/test';
import type { Rgba } from '../src/art/pixel-buffer';
import type { AtelierLayout } from '../src/render/atelier-layout';
import type { ViewState } from '../src/render/boot';
import type { HudModel, Rect, RowRect, Selection } from '../src/ui/hud';
import type { SquadReport } from '../src/render/game';
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
