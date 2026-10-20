import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import type { SpqrDebugHooks } from '../src/debug';
import { blit, pixelAt, type PixelBuffer } from '../src/art/pixel-buffer';
import { createFog, refreshVision, viewOf } from '../src/sim/fog';
import { MAP_HEIGHT, MAP_WIDTH, generateMap } from '../src/sim/map';
import type { ViewState } from '../src/render/boot';
import { renderFog } from '../src/render/fog';
import { VIEWED_FACTION, DEFAULT_SEED, DEFAULT_ZOOM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../src/render/view';
import { renderTerrain, THEATRE_PIXELS, tilePixel } from '../src/render/terrain';
import { openingEyes } from '../src/render/opening';
import { screenToStage, stageToScreen } from '../src/render/camera';
import { covers, describeView, hudRects, samples } from './hooks';

/**
 * The theatre on screen (ticket B3).
 *
 * The interesting assertion is not "the page loaded" but "the pixels on the GPU
 * are the pixels the generator produces". So the whole theatre is composed
 * *here*, in Node, by the same generator the page uses — B1 for the map, `art/`
 * for the tiles, `render/terrain.ts` for the composition — and every check
 * compares the renderer's answer with it. Two independent sides of the pipeline,
 * neither of which can pass the comparison alone.
 *
 * What that buys is the map's own acceptance criteria: a map that renders
 * completely (every sampled point matches, including the corners of the theatre),
 * pans and zooms across all 96×96 tiles, and stays exactly in step with the
 * generator at every zoom level.
 *
 * B4 put the fog over the map (see `fog.spec.ts` for the fog itself), so the
 * image these tests compare against is the theatre *under the fog the page opens
 * with*: the player's Faction sees the ground around its Stronghold and nothing
 * else. B7 put the interface over both, so points the HUD covers are dropped
 * rather than compared — the rectangles come from the page's own layout, so the
 * exclusion is the interface's idea of where it stands and not a second one kept
 * here.
 */

/** The map as the page will describe it, so a test can check the two agree. */
const DESCRIBED = { seed: DEFAULT_SEED, mapWidth: MAP_WIDTH, mapHeight: MAP_HEIGHT, mapPixels: THEATRE_PIXELS };

/** The theatre B1 generates for the page's seed, and the ground under the fog drawn over it. */
const GRID = generateMap(DEFAULT_SEED);
const THEATRE: PixelBuffer = foggedByThePlayer();

/** The theatre rendered, with the fog the page opens with drawn over it. */
function foggedByThePlayer(): PixelBuffer {
  const fog = createFog();
  // The eyes the page opens with: the Stronghold's watch, and the opening
  // army's own (C2 — a Squad has eyes, and the fog follows the men).
  refreshVision(fog, GRID, openingEyes(GRID, VIEWED_FACTION));

  const frame = renderTerrain(GRID);
  blit(frame, renderFog(viewOf(fog)), 0, 0);

  return frame;
}

/**
 * Canvas points that show the theatre, and the theatre pixel each one should show.
 *
 * Only points inside the viewport: at a magnification above one, and after any
 * pan, the theatre is larger than the canvas or shifted by it, and a point off
 * the canvas is a question with no answer rather than a wrong one.
 *
 * The step adapts to how much theatre is on screen, because at 8× the viewport
 * holds eighty stage pixels and a fixed step of seventeen would leave a handful
 * of points — most of them behind the interface. The step is chosen so that the
 * smaller dimension is walked about eight times, and never finer than one stage
 * pixel.
 */
function visiblePoints(view: ViewState): { points: [number, number][]; expected: [number, number][] } {
  const points: [number, number][] = [];
  const expected: [number, number][] = [];
  const { camera } = view;

  const firstX = Math.max(0, camera.x);
  const firstY = Math.max(0, camera.y);
  const lastX = Math.min(THEATRE.width, camera.x + Math.ceil(view.width / camera.zoom));
  const lastY = Math.min(THEATRE.height, camera.y + Math.ceil(view.height / camera.zoom));
  const step = Math.min(17, Math.max(1, Math.floor(Math.min(lastX - firstX, lastY - firstY) / 8)));

  for (let y = firstY; y < lastY; y += step) {
    for (let x = firstX; x < lastX; x += step) {
      const screen = stageToScreen(camera, x, y);
      points.push([screen.x, screen.y]);
      expected.push([x, y]);
    }
  }

  return { points, expected };
}

/**
 * Asserts that every canvas point shows the theatre pixel the camera says it should.
 *
 * Points the interface covers are dropped rather than compared: since B7 the
 * frame is the theatre, the fog and the HUD over both, and a panel is
 * deliberately not the map.
 */
async function expectTheatrePixels(page: Page, view: ViewState, context: string): Promise<void> {
  const rects = await hudRects(page);
  const { points, expected } = visiblePoints(view);
  const kept: { point: [number, number]; stage: [number, number] }[] = [];

  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const stage = expected[index];
    if (point === undefined || stage === undefined) continue;
    if (rects.some((rect) => covers(rect, point[0], point[1]))) continue;

    kept.push({ point, stage });
  }

  expect(kept.length, context).toBeGreaterThan(10);

  const drawn = await samples(page, 'view', kept.map((entry) => entry.point));
  let wrong = 0;
  for (let index = 0; index < kept.length; index += 1) {
    const entry = kept[index];
    if (entry === undefined) continue;

    const wanted = pixelAt(THEATRE, entry.stage[0], entry.stage[1]);
    const got = drawn[index];
    if (got === undefined || got[0] !== wanted[0] || got[1] !== wanted[1] || got[2] !== wanted[2]) wrong += 1;
  }

  expect(wrong, `${context}: mismatched pixels`).toBe(0);
}

/** Boots the page and waits for the hooks, answering with what the renderer reported. */
async function boot(page: Page): Promise<SpqrDebugHooks['boot'] & { readonly booted: true }> {
  await page.goto('/e2e/game-fixture.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report: SpqrDebugHooks['boot'] = await page.evaluate(() => window.__SPQR.boot);
  if (!report.booted) throw new Error(`boot failed: ${report.error}`);

  // C2 puts an army on the map, and these tests are about the map: the men are
  // hidden with the page's own lens, so what is compared is the theatre and the
  // fog the generators produced and not a hundred soldiers standing on it.
  await page.evaluate(() => window.__SPQR.game?.showSquads(false));

  return report;
}

/**
 * The camera the page opens with: centred on the player's Stronghold, clamped to
 * the theatre.
 *
 * Written out here rather than read off the page, because a test that asked the
 * page where it was looking and then checked it would be checking nothing.
 */
function openingCamera(): { readonly x: number; readonly y: number; readonly zoom: number } {
  const stronghold = GRID.strongholds[0];
  if (stronghold === undefined) throw new Error('the map has no Stronghold');

  const at = tilePixel(stronghold.x, stronghold.y);
  const across = Math.max(0, THEATRE_PIXELS - Math.floor(VIEWPORT_WIDTH / DEFAULT_ZOOM));
  const down = Math.max(0, THEATRE_PIXELS - Math.floor(VIEWPORT_HEIGHT / DEFAULT_ZOOM));

  return {
    x: Math.min(Math.max(0, Math.floor(at.x - VIEWPORT_WIDTH / (2 * DEFAULT_ZOOM))), across),
    y: Math.min(Math.max(0, Math.floor(at.y - VIEWPORT_HEIGHT / (2 * DEFAULT_ZOOM))), down),
    zoom: DEFAULT_ZOOM,
  };
}

test('boots in a real browser and draws the generated theatre through software WebGL', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const report = await boot(page);

  test.info().annotations.push({
    type: 'renderer',
    description: report.render.rendererDescription ?? 'unreported',
  });

  // A real WebGL2 context, not a null context from a GPU stack that refused to
  // fall back to SwiftShader.
  expect(report.render.engine).toBe('webgl');
  expect(report.render.webglVersion).toBe(2);

  // The viewport is the canvas, the camera opens on the Faction's Stronghold at
  // its default zoom, and the page can say what it is looking at.
  const view = await describeView(page);
  expect(view.width).toBe(VIEWPORT_WIDTH);
  expect(view.height).toBe(VIEWPORT_HEIGHT);
  expect(view.camera.zoom).toBe(DEFAULT_ZOOM);
  expect({ seed: view.seed, mapWidth: view.mapWidth, mapHeight: view.mapHeight, mapPixels: view.mapPixels }).toEqual(
    DESCRIBED,
  );
  // The page opens in the player's fog, not with the whole map revealed.
  expect(view.inspection).toBe(false);
  expect(view.watch).toBe(null);
  // C2 opens the camera where the army musters: the player's Stronghold, kept
  // inside the theatre's edges (B3's clamp), instead of the middle of the map.
  expect(view.camera).toEqual(openingCamera());

  // The centre pixel of the frame is the theatre pixel the camera says is there.
  const centre = { x: Math.floor(VIEWPORT_WIDTH / 2), y: Math.floor(VIEWPORT_HEIGHT / 2) };
  const stageCentre = screenToStage(view.camera, centre.x, centre.y);
  expect(report.render.pixel).toEqual(pixelAt(THEATRE, stageCentre.x, stageCentre.y));

  await expect(page.locator('#app canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('draws the theatre pixel for pixel, at every whole-number zoom the camera offers', async ({ page }) => {
  await boot(page);

  for (const zoom of [1, 2, 3, 4, 8]) {
    await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);

    const view = await describeView(page);
    expect(view.camera.zoom, `zoom ${String(zoom)}`).toBe(zoom);
    await expectTheatrePixels(page, view, `zoom ${String(zoom)}`);
  }
});

test('pans in whole stage pixels and lands on them exactly', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => window.__SPQR.view?.zoomTo(3));
  await page.evaluate(() => window.__SPQR.view?.panBy(5, 3));

  const view = await describeView(page);
  expect(Number.isInteger(view.camera.x), 'the camera is on a whole stage pixel').toBe(true);
  expect(Number.isInteger(view.camera.y)).toBe(true);

  // After an odd pan the mapping is still exact: the canvas point that shows a
  // given stage pixel is the one the camera says, pixel for pixel.
  await expectTheatrePixels(page, view, 'after panning');
});

test('reaches every corner of a full 96×96 map, and stays exact there', async ({ page }) => {
  await boot(page);

  // The whole theatre, at the zoom that shows the most of it, walked corner to
  // corner: what the ticket asks for when it asks that panning and zooming stay
  // responsive across a full map is that the map is *all* there, at every zoom,
  // and one texture under a camera is what makes that true by construction.
  for (const zoom of [1, 2]) {
    await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);
    await page.evaluate(() => window.__SPQR.view?.panBy(-100000, -100000));

    const topLeft = await describeView(page);
    expect(topLeft.camera, `zoom ${String(zoom)} top left`).toEqual({ x: 0, y: 0, zoom });
    await expectTheatrePixels(page, topLeft, `zoom ${String(zoom)} top left`);

    await page.evaluate(() => window.__SPQR.view?.panBy(100000, 100000));

    const bottomRight = await describeView(page);
    expect(bottomRight.camera.x).toBe(THEATRE_PIXELS - Math.floor(VIEWPORT_WIDTH / bottomRight.camera.zoom));
    expect(bottomRight.camera.y).toBe(THEATRE_PIXELS - Math.floor(VIEWPORT_HEIGHT / bottomRight.camera.zoom));
    await expectTheatrePixels(page, bottomRight, `zoom ${String(zoom)} bottom right`);
  }
});

test('zooms about a point with the wheel, keeping that point where it is', async ({ page }) => {
  await boot(page);

  const [screenX, screenY] = [190, 130];
  const before = await describeView(page);
  const anchor: { x: number; y: number } = screenToStage(before.camera, screenX, screenY);

  await page.evaluate(
    ({ x, y }) => window.__SPQR.view?.zoomAbout(4, x, y),
    { x: screenX, y: screenY },
  );

  const after = await describeView(page);
  expect(after.camera.zoom).toBe(4);
  // The stage pixel that was under the point is still under it — the property a
  // wheel needs, and the one B2's camera deliberately did not have.
  expect(screenToStage(after.camera, screenX, screenY)).toEqual(anchor);
  await expectTheatrePixels(page, after, 'after an anchored zoom');
});

test('refuses a pan or a zoom that would put it between two pixels', async ({ page }) => {
  await boot(page);

  const before = await describeView(page);

  await expect(page.evaluate(() => window.__SPQR.view?.panBy(0.5, 0))).rejects.toThrow(/whole number of pixels/);
  await expect(page.evaluate(() => window.__SPQR.view?.zoomTo(2.5))).rejects.toThrow(/whole number/);
  await expect(page.evaluate(() => window.__SPQR.view?.zoomAbout(4, 0.5, 0))).rejects.toThrow(/whole number/);
  await expect(page.evaluate(() => window.__SPQR.view?.zoomTo(99))).rejects.toThrow(/whole number/);

  // The refusals left the camera where it was.
  expect((await describeView(page)).camera).toEqual(before.camera);
});

test('moves the camera for a drag, in whole stage pixels', async ({ page }) => {
  await boot(page);

  const before = await describeView(page);
  const canvas = page.locator('#app canvas');

  await page.evaluate(() => window.__SPQR.view?.zoomTo(2));
  const start = await describeView(page);

  const box = await canvas.boundingBox();
  if (box === null) throw new Error('the page has no canvas to drag');

  // Panning is the *right* button's drag since C2: the left button picks a box
  // of Squads, and a camera that moved when a Player selected would be a camera
  // nobody could aim.
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(box.x + 260, box.y + 180, { steps: 4 });
  await page.mouse.up({ button: 'right' });

  const after = await describeView(page);
  // Dragging left and up moves the camera right and down, by whole pixels: 40
  // screen pixels at 2× is 20 stage pixels.
  expect(after.camera).toEqual({ x: start.camera.x + 20, y: start.camera.y + 10, zoom: 2 });
  expect(Number.isInteger(after.camera.x)).toBe(true);
  expect(Number.isInteger(after.camera.y)).toBe(true);
  expect(after.camera).not.toEqual(before.camera);
});

test('drags and wheels the whole map without regenerating it', async ({ page }) => {
  await boot(page);

  // The failure this catches is the one that would make a full map unresponsive:
  // composing the theatre again on every frame. Two hundred camera moves in the
  // page, measured there, cannot afford a 1.5-million-pixel composition each — that
  // would be twenty seconds, and the bound is a couple of seconds with room for a
  // slow software renderer.
  const moves = 200;
  const elapsed = await page.evaluate((count) => {
    const started = performance.now();
    for (let step = 0; step < count; step += 1) {
      window.__SPQR.view?.panBy(step % 2 === 0 ? 3 : -3, step % 3 === 0 ? 2 : -2);
      if (step % 25 === 0) window.__SPQR.view?.zoomTo((step % 4) + 1);
    }

    return performance.now() - started;
  }, moves);

  test.info().annotations.push({ type: 'camera moves', description: `${String(moves)} moves in ${elapsed.toFixed(0)}ms` });
  expect(elapsed).toBeLessThan(3000);
  await expectTheatrePixels(page, await describeView(page), 'after two hundred moves');
});

test('clamps the camera to the map instead of showing the page behind it', async ({ page }) => {
  await boot(page);

  await page.evaluate(() => window.__SPQR.view?.panBy(-100000, -100000));
  expect((await describeView(page)).camera).toEqual({ x: 0, y: 0, zoom: DEFAULT_ZOOM });

  await page.evaluate(() => window.__SPQR.view?.zoomTo(8));
  await page.evaluate(() => window.__SPQR.view?.panBy(100000, 100000));
  const clamped = (await describeView(page)).camera;

  // At 8× the viewport is 80×60 stage pixels of a 1552-pixel theatre, so the
  // camera can go almost to its end and no further — and the last stage pixel it
  // can show is the one whose magnification would end exactly at the edge.
  expect(clamped.zoom).toBe(8);
  expect(clamped.x).toBe(THEATRE_PIXELS - Math.floor(VIEWPORT_WIDTH / 8));
  expect(clamped.y).toBe(THEATRE_PIXELS - Math.floor(VIEWPORT_HEIGHT / 8));
});
