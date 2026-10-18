import { expect, test, type Page } from '@playwright/test';
import type { SpqrDebugHooks } from '../src/debug';
import { pixelAt, type PixelBuffer } from '../src/art/pixel-buffer';
import { titlePlate } from '../src/art/title';
import { screenToStage, stageToScreen } from '../src/render/camera';
import type { ViewState } from '../src/render/boot';
import { describeView, samples } from './hooks';

/**
 * The boot, against the generator (ticket B2).
 *
 * The interesting assertion is not "the page loaded" but "the pixels on the GPU
 * are the pixels the art library produces". So the plate is generated *here*, in
 * Node, with the same library the page uses, and every check compares the
 * renderer's answer with the generator's: two independent sides of the pipeline,
 * neither of which can pass the comparison on its own.
 */

/** The plate the page is showing, computed in Node. */
const PLATE: PixelBuffer = titlePlate();

/**
 * Canvas points that show the plate, and the plate pixel each one should show.
 *
 * Only points inside the viewport: at a magnification above one, and after any
 * pan, the plate is larger than the canvas or shifted by it, and a point off the
 * canvas is a question with no answer rather than a wrong one.
 */
function visiblePoints(view: ViewState): {
  points: [number, number][];
  expected: [number, number][];
} {
  const points: [number, number][] = [];
  const expected: [number, number][] = [];
  const { camera } = view;

  const lastX = Math.min(PLATE.width, camera.x + Math.ceil(view.width / camera.zoom));
  const lastY = Math.min(PLATE.height, camera.y + Math.ceil(view.height / camera.zoom));

  for (let y = Math.max(0, camera.y); y < lastY; y += 5) {
    for (let x = Math.max(0, camera.x); x < lastX; x += 5) {
      const screen = stageToScreen(camera, x, y);
      points.push([screen.x, screen.y]);
      expected.push([x, y]);
    }
  }

  return { points, expected };
}

/** Asserts that every canvas point shows the plate pixel the camera says it should. */
async function expectPlatePixels(page: Page, view: ViewState, context: string): Promise<void> {
  const { points, expected } = visiblePoints(view);
  expect(points.length, context).toBeGreaterThan(0);

  const drawn = await samples(page, 'view', points);
  for (let index = 0; index < points.length; index += 1) {
    const [plateX, plateY] = expected[index] ?? [0, 0];
    expect(drawn[index], `${context}: stage (${String(plateX)}, ${String(plateY)})`).toEqual(
      pixelAt(PLATE, plateX, plateY),
    );
  }
}

test('boots in a real browser and draws the generated title through software WebGL', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const boot: SpqrDebugHooks['boot'] = await page.evaluate(() => window.__SPQR.boot);
  expect(boot.booted).toBe(true);
  if (!boot.booted) throw new Error(`boot failed: ${boot.error}`);

  test.info().annotations.push({
    type: 'renderer',
    description: boot.render.rendererDescription ?? 'unreported',
  });

  // A real WebGL2 context, not a null context from a GPU stack that refused to
  // fall back to SwiftShader.
  expect(boot.render.engine).toBe('webgl');
  expect(boot.render.webglVersion).toBe(2);

  // The viewport is the plate at the camera's whole-number magnification, and the
  // centre pixel is the plate's own pixel there.
  const view = await describeView(page);
  expect(view.camera).toEqual({ x: 0, y: 0, zoom: 2 });
  expect(boot.render.width).toBe(PLATE.width * 2);
  expect(boot.render.height).toBe(PLATE.height * 2);

  const centre = { x: Math.floor(boot.render.width / 2), y: Math.floor(boot.render.height / 2) };
  const stageCentre = screenToStage(view.camera, centre.x, centre.y);
  expect(boot.render.pixel).toEqual(pixelAt(PLATE, stageCentre.x, stageCentre.y));

  await expect(page.locator('#app canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('draws the plate pixel for pixel, at every whole-number zoom the camera offers', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  for (const zoom of [1, 2, 3, 4]) {
    await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);

    const view = await describeView(page);
    expect(view.camera.zoom, `zoom ${String(zoom)}`).toBe(zoom);
    await expectPlatePixels(page, view, `zoom ${String(zoom)}`);
  }
});

test('pans in whole stage pixels and lands on them exactly', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  await page.evaluate(() => window.__SPQR.view?.zoomTo(3));
  await page.evaluate(() => window.__SPQR.view?.panBy(5, 3));

  const view = await describeView(page);
  expect(view.camera).toEqual({ x: 5, y: 3, zoom: 3 });

  // After an odd pan the mapping is still exact: the canvas point that shows a
  // given stage pixel is the one the camera says, pixel for pixel.
  await expectPlatePixels(page, view, 'after panning');
});

test('refuses a pan or a zoom that would put it between two pixels', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  await expect(page.evaluate(() => window.__SPQR.view?.panBy(0.5, 0))).rejects.toThrow(
    /whole number of pixels/,
  );
  await expect(page.evaluate(() => window.__SPQR.view?.zoomTo(2.5))).rejects.toThrow(/whole number/);

  // The refusals left the camera where it was.
  expect((await describeView(page)).camera).toEqual({ x: 0, y: 0, zoom: 2 });
});
