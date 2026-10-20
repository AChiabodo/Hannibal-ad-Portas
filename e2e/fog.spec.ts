/**
 * The fog on screen (ticket B4).
 *
 * The acceptance criteria are the tests: fog renders in its three states,
 * unexplored tiles reveal nothing of the map underneath, and the debugging
 * inspection mode reveals the whole theatre without becoming a Player.
 *
 * Everything the page draws is composed here, in Node, by the same modules the
 * page uses — B1's map, `render/terrain.ts` for the theatre, `render/fog.ts` for
 * the fog — so every check compares the GPU's answer against the generator's. The
 * page is driven exactly as a player drives it: the hooks are the same calls a
 * wheel, a drag and, one day, a Match make.
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { blit, pixelAt, type PixelBuffer, type Rgba } from '../src/art/pixel-buffer';
import { TERRAIN_TILE } from '../src/art/terrain';
import { createFog, eyeOf, inspectionView, refreshVision, viewOf, SETTLEMENT_VISION, type FogView } from '../src/sim/fog';

import { generateMap, MAP_WIDTH, type MapGrid, type Site } from '../src/sim/map';
import { screenToStage } from '../src/render/camera';
import type { ViewState } from '../src/render/boot';
import { UNEXPLORED, renderFog } from '../src/render/fog';
import { renderTerrain, tilePixel } from '../src/render/terrain';
import { openingEyes } from '../src/render/opening';
import { DEFAULT_SEED, VIEWED_FACTION } from '../src/render/view';
import { covers, describeView, hudRects, samples } from './hooks';

/** The theatre the page is showing, and the Stronghold its player starts in. */
const MAP: MapGrid = generateMap(DEFAULT_SEED);
const STRONGHOLD: Site = MAP.strongholds[0];

/** The theatre, rendered once: the fog is drawn over this, and the frame is what comes out. */
const THEATRE: PixelBuffer = renderTerrain(MAP);

/** A tile of the theatre this Faction cannot see: where the map has to stay hidden. */
const FAR: Site = { x: STRONGHOLD.x < MAP_WIDTH / 2 ? 80 : 12, y: STRONGHOLD.y };

/** Another tile the watch can stand on: far from the first one, and on the map. */
const ELSEWHERE: Site = { x: FAR.x < MAP_WIDTH / 2 ? FAR.x + 40 : FAR.x - 40, y: FAR.y };

/** The image the page draws for a Faction that knows that much: the theatre under its fog. */
function fogged(fog: FogView): PixelBuffer {
  const frame = renderTerrain(MAP);
  blit(frame, renderFog(fog), 0, 0);

  return frame;
}

/**
 * A Faction's fog after the watches named, refreshed in the order the page
 * refreshed them: the Stronghold's own vision first, and then one look per watch.
 *
 * In order, because memory is what the page's gesture leaves behind: a watch that
 * moved on is out of view and still remembered, and only a sequence of refreshes
 * describes the tile it walked away from.
 */
function watching(...watches: readonly Site[]): FogView {
  const fog = createFog();

  for (const watch of [null, ...watches]) {
    // What the page can see before any watch of its own: the Stronghold and the
    // opening army that musters below it (C2).
    const eyes = [...openingEyes(MAP, VIEWED_FACTION)];
    if (watch !== null) eyes.push(eyeOf(watch, SETTLEMENT_VISION));
    refreshVision(fog, MAP, eyes);
  }

  return viewOf(fog);
}

/** The terrain pixel at the middle of one tile: the colour a tile in view is drawn with. */
function groundAt(tile: Site): Rgba {
  const at = tilePixel(tile.x, tile.y);
  const middle = Math.floor(TERRAIN_TILE / 2);

  return pixelAt(THEATRE, at.x + middle, at.y + middle);
}

/** Whether two colours are the same, within the slack a float blend on the GPU is allowed. */
function same(got: Rgba | undefined, wanted: Rgba, tolerance: number): boolean {
  if (got === undefined) return false;

  return (
    Math.abs(got[0] - wanted[0]) <= tolerance &&
    Math.abs(got[1] - wanted[1]) <= tolerance &&
    Math.abs(got[2] - wanted[2]) <= tolerance
  );
}

/**
 * Asserts that every sampled screen point shows the image the generators produce.
 *
 * The mapping is `screenToStage`'s, which is exact at whole-number zooms, so the
 * comparison is a pixel for a pixel rather than a look-alike. `tolerance` is for
 * the one thing that is not exact: a veiled pixel is blended by the GPU in
 * floats, and one step of an eight-bit channel is a rounding difference rather
 * than a different fog.
 *
 * Points the interface covers are dropped rather than compared: since B7 the
 * frame is the theatre, the fog and the HUD over both, and a panel is
 * deliberately not the map. The rectangles come from the page's own layout.
 */
async function expectDrawn(page: Page, image: PixelBuffer, context: string, tolerance = 0): Promise<void> {
  const view = await describeView(page);
  const rects = await hudRects(page);
  const points: [number, number][] = [];
  for (let y = 5; y < view.height; y += 11) {
    for (let x = 5; x < view.width; x += 11) {
      if (rects.some((rect) => covers(rect, x, y))) continue;
      points.push([x, y]);
    }
  }

  expect(points.length, context).toBeGreaterThan(100);

  const drawn = await samples(page, 'view', points);
  let wrong = 0;
  for (const [index, [screenX, screenY]] of points.entries()) {
    const stage = screenToStage(view.camera, screenX, screenY);
    if (!same(drawn[index], pixelAt(image, stage.x, stage.y), tolerance)) wrong += 1;
  }

  expect(wrong, `${context}: mismatched pixels of ${String(points.length)}`).toBe(0);
}

/** Puts a stage pixel in the middle of the viewport, by panning whole pixels, where the map allows. */
async function centreOn(page: Page, stageX: number, stageY: number): Promise<ViewState> {
  const before = await describeView(page);
  const wanted = {
    x: stageX - Math.floor(before.width / (2 * before.camera.zoom)),
    y: stageY - Math.floor(before.height / (2 * before.camera.zoom)),
  };

  const dx = wanted.x - before.camera.x;
  const dy = wanted.y - before.camera.y;
  if (dx !== 0 || dy !== 0) {
    await page.evaluate(({ d }) => window.__SPQR.view?.panBy(d.x, d.y), { d: { x: dx, y: dy } });
  }

  return describeView(page);
}

/** Reads the frame at the middle of one tile, with that tile brought into view first. */
async function pixelOfTile(page: Page, tile: Site): Promise<Rgba> {
  const at = tilePixel(tile.x, tile.y);
  const middle = Math.floor(TERRAIN_TILE / 2);
  const view = await centreOn(page, at.x + middle, at.y + middle);

  const [read] = await samples(page, 'view', [
    [(at.x + middle - view.camera.x) * view.camera.zoom, (at.y + middle - view.camera.y) * view.camera.zoom],
  ]);
  if (read === undefined) throw new Error('the page returned no pixel');

  return read;
}

/** Boots the page and waits for the hooks, as `boot.spec.ts` does. */
async function boot(page: Page): Promise<ViewState> {
  await page.goto('/e2e/game-fixture.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report = await page.evaluate(() => window.__SPQR.boot);
  if (!report.booted) throw new Error(`boot failed: ${report.error}`);

  // The army C2 musters is hidden for these comparisons: the ticket under test
  // is the fog, and a Squad standing in it is a second thing on the frame.
  await page.evaluate(() => {
    window.__SPQR.game?.showSquads(false);
    window.__SPQR.game?.showSettlements(false);
  });

  return describeView(page);
}

test('opens with the fog its Stronghold can see, and hides the rest of the theatre', async ({ page }) => {
  const view = await boot(page);

  // The page says so: nothing is revealed, and the only eyes are the Stronghold's.
  expect(view.inspection).toBe(false);
  expect(view.watch).toBe(null);
  test.info().annotations.push({
    type: 'stronghold',
    description: `(${String(STRONGHOLD.x)}, ${String(STRONGHOLD.y)})`,
  });

  // What the page drew is the theatre under the fog the Stronghold's vision makes.
  await expectDrawn(page, fogged(watching()), 'the theatre under the opening fog');

  // A tile in view is the terrain, exactly; a tile out of it is the cover, exactly.
  expect((await pixelOfTile(page, STRONGHOLD)).slice(0, 3)).toEqual(groundAt(STRONGHOLD).slice(0, 3));
  expect(await pixelOfTile(page, FAR)).toEqual(UNEXPLORED);
});

test('reveals nothing of the map underneath an unexplored tile, at another zoom too', async ({ page }) => {
  await boot(page);

  // The same question at a magnification that shows four times the theatre: the
  // fog is a grid of tiles, so the answer must not depend on the zoom.
  await page.evaluate(() => window.__SPQR.view?.zoomTo(1));
  expect((await describeView(page)).camera.zoom).toBe(1);

  await expectDrawn(page, fogged(watching()), 'the opening fog at 1x');
  expect(await pixelOfTile(page, FAR)).toEqual(UNEXPLORED);
});

test('walks one tile through the three states of the fog as the watch moves', async ({ page }) => {
  await boot(page);

  // Unexplored: nothing of the map underneath reaches the screen.
  expect(await pixelOfTile(page, FAR)).toEqual(UNEXPLORED);

  // In view: the watch stands on it, and it is drawn exactly as the terrain drew it.
  await page.evaluate((tile) => window.__SPQR.view?.lookFrom(tile.x, tile.y), FAR);
  expect((await describeView(page)).watch).toEqual(FAR);
  expect((await pixelOfTile(page, FAR)).slice(0, 3)).toEqual(groundAt(FAR).slice(0, 3));

  // Remembered: the watch looks somewhere else, and the tile it left keeps its
  // ground — dimmed, and plainly neither the cover nor the clear image.
  await page.evaluate((tile) => window.__SPQR.view?.lookFrom(tile.x, tile.y), ELSEWHERE);

  const remembered = await pixelOfTile(page, FAR);
  const ground = groundAt(FAR);
  expect(remembered).not.toEqual(UNEXPLORED);
  expect(remembered.slice(0, 3)).not.toEqual(ground.slice(0, 3));
  expect(remembered[0]).toBeLessThan(ground[0]);
  expect(remembered[1]).toBeLessThan(ground[1]);

  // And the whole frame is the fog that gesture describes, composed in Node.
  await expectDrawn(page, fogged(watching(FAR, ELSEWHERE)), 'the fog after the watch moved on', 1);
});

test('reveals the whole theatre in the inspection mode, which is not a Player', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => window.__SPQR.view?.inspect(true));
  expect((await describeView(page)).inspection).toBe(true);

  // The whole map, exactly: the frame is the theatre under the omniscient view.
  await expectDrawn(page, fogged(inspectionView(MAP)), 'the inspection mode');
  expect(await pixelOfTile(page, FAR)).toEqual(groundAt(FAR));

  // The inspection is a state of the renderer and not a mind: there is no
  // Controller on the hook surface, so nothing here can emit a Command.
  const hooks = await page.evaluate(() => Object.keys(window.__SPQR.view ?? {}).sort());
  expect(hooks).not.toContain('decide');
  expect(hooks).not.toContain('controller');

  await page.evaluate(() => window.__SPQR.view?.inspect(false));
  expect((await describeView(page)).inspection).toBe(false);
  await expectDrawn(page, fogged(watching()), 'the fog again after the inspection');
});

test('refuses a look that is not a whole tile of the theatre, and keeps the fog it had', async ({ page }) => {
  await boot(page);

  await expect(page.evaluate(() => window.__SPQR.view?.lookFrom(1.5, 2))).rejects.toThrow(/whole tile/);
  await expect(page.evaluate(() => window.__SPQR.view?.lookFrom(-1, 2))).rejects.toThrow(/theatre/);
  await expect(
    page.evaluate(({ w }) => window.__SPQR.view?.lookFrom(w, 2), { w: MAP_WIDTH }),
  ).rejects.toThrow(/theatre/);

  // A refused look changed nothing at all: the watch is still nowhere, and the
  // frame is still the one the Stronghold drew.
  const after = await describeView(page);
  expect(after.watch).toBe(null);
  expect(after.inspection).toBe(false);
  await expectDrawn(page, fogged(watching()), 'the fog after three refused looks');
});

test('pans and zooms under fog without rebuilding either image', async ({ page }) => {
  await boot(page);

  const moves = 200;
  const elapsed = await page.evaluate((count) => {
    const started = performance.now();
    for (let step = 0; step < count; step += 1) {
      window.__SPQR.view?.panBy(step % 2 === 0 ? 3 : -3, step % 3 === 0 ? 2 : -2);
      if (step % 25 === 0) window.__SPQR.view?.zoomTo((step % 4) + 1);
    }

    return performance.now() - started;
  }, moves);

  test.info().annotations.push({
    type: 'camera moves',
    description: `${String(moves)} moves in ${elapsed.toFixed(0)}ms`,
  });
  expect(elapsed).toBeLessThan(3000);

  // The fog is not rebuilt per frame and not per camera move: the watch never
  // moved, and the frame is still the one the Stronghold's vision makes.
  expect((await describeView(page)).watch).toBe(null);
  await expectDrawn(page, fogged(watching()), 'the fog after two hundred camera moves');
});
