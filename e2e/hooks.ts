import type { Page } from '@playwright/test';
import type { Rgba } from '../src/art/pixel-buffer';
import type { AtelierLayout } from '../src/render/atelier-layout';
import type { ViewState } from '../src/render/boot';

/**
 * Reading the page's debug hooks from a test.
 *
 * Both pages publish the same shape (ADR-0003): one of `view` and `atelier` is
 * filled and the other is null, and both offer the same `samples` call over the
 * renderer's own pixels. One place reads it, so a change to the hook shape fails
 * here rather than in two spec files that drifted apart.
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
