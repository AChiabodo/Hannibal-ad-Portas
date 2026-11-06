/**
 * The men on the map, in a real browser (ticket C2).
 *
 * The unit tests say what a block of a Squad *is*; this says the page draws it:
 * the soldiers the generator composes, where the simulation says the Squad
 * stands, in the formation it holds. The expected image is composed here, in
 * Node, by `render/squads.ts` — the same module the page uses — and compared
 * with the GPU's pixels, so neither side can pass alone. That is B3's pixel
 * discipline applied to the first thing in the game that moves.
 *
 * A block is mostly transparent, so only its opaque pixels are compared: an
 * empty pixel of a block tells a test nothing (the terrain shows through it),
 * and pretending otherwise would be comparing the map with itself. The interface
 * is avoided by rectangle, as everywhere else, because the panels are drawn over
 * the theatre.
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { pixelAt } from '../src/art/pixel-buffer';
import { blockPlacement, squadBlock, squadFrameKey, visualShape } from '../src/render/squads';
import { tilePixel } from '../src/render/terrain';
import { bootGame, describeView, hudRects, samples, squads } from './hooks';

/** Boots the page with the clock stopped, so one tick is one picture. */
async function boot(page: Page): Promise<void> {
  await bootGame(page, { paused: true });
  await page.evaluate(() => {
    const game = window.__SPQR.game!;
    const home = game.state().visible.settlements[0]!;
    const army = game.squads();
    const field = army.find((squad) => squad.x > home.x) ?? army[0]!;
    game.select({ kind: 'squad', id: field.id });
    game.centerSelection();
    game.select(null);
  });
}

/** The page's own tick, which is what a frame is chosen from. */
async function tick(page: Page): Promise<number> {
  return page.evaluate(() => window.__SPQR.game?.tick() ?? 0);
}

test('draws a Squad as the soldiers the generator composes, where the Match says it stands', async ({ page }) => {
  await boot(page);
  const view = await describeView(page);
  const rects = await hudRects(page);
  const now = await tick(page);

  const block = (await squads(page)).find((squad) => {
    const shape = visualShape(squad);
    const at = blockPlacement(tilePixel(squad.x, squad.y), shape);
    const onScreen = {
      x: (at.x - view.camera.x) * view.camera.zoom,
      y: (at.y - view.camera.y) * view.camera.zoom,
      width: (squad.rect.width + 2) * view.camera.zoom,
      height: (squad.rect.height + 2) * view.camera.zoom,
    };

    return (
      onScreen.x >= 0 &&
      onScreen.y >= 0 &&
      onScreen.x + onScreen.width < view.width &&
      onScreen.y + onScreen.height < view.height &&
      !rects.some(
        (rect) =>
          onScreen.x < rect.x + rect.width &&
          rect.x < onScreen.x + onScreen.width &&
          onScreen.y < rect.y + rect.height &&
          rect.y < onScreen.y + onScreen.height,
      )
    );
  });

  expect(block, 'a Squad is drawn on screen and clear of the interface').toBeDefined();
  if (block === undefined) return;

  const shape = visualShape(block);
  const drawn = squadBlock(block, { faction: 'rome', tick: now });
  const at = blockPlacement(tilePixel(block.x, block.y), shape);

  // The block's own opaque pixels, on the canvas, in one extraction.
  const points: [number, number][] = [];
  const expected: { readonly x: number; readonly y: number }[] = [];

  for (let y = 0; y < drawn.height; y += 1) {
    for (let x = 0; x < drawn.width; x += 1) {
      const pixel = pixelAt(drawn, x, y);
      if (pixel[3] !== 255) continue;

      points.push([
        (at.x + x - view.camera.x) * view.camera.zoom,
        (at.y + y - view.camera.y) * view.camera.zoom,
      ]);
      expected.push({ x, y });
    }
  }

  expect(points.length, 'the block has men in it').toBeGreaterThan(200);

  const read = await samples(page, 'view', points);

  for (const [index, got] of read.entries()) {
    const source = expected[index];
    if (source === undefined) continue;

    expect(got, `block pixel (${String(source.x)}, ${String(source.y)})`).toEqual(pixelAt(drawn, source.x, source.y));
  }

  // And the rectangle the page reports for a click is the rectangle its men are
  // drawn in: the pick and the picture cannot disagree (input/selection.ts picks
  // against this, so a Squad is never drawn where it cannot be clicked, or
  // clicked where it is not drawn).
  expect({ width: drawn.width, height: drawn.height }).toEqual({
    width: block.rect.width,
    height: block.rect.height,
  });

  // The key the layer rebuilds on names the shape that was drawn, so a Squad
  // that lost a man, turned or changed formation would have been re-composed.
  expect(squadFrameKey(block, { faction: 'rome', tick: now })).toContain(`${String(block.figures)}`);
});
