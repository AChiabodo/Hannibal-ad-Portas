import { expect, test, type Page } from '@playwright/test';
import type { SpqrDebugHooks } from '../src/debug';

/** Reads the boot report the page publishes on `window.__SPQR` (ADR-0003). */
async function bootReport(page: Page): Promise<SpqrDebugHooks['boot']> {
  return page.evaluate(() => window.__SPQR.boot);
}

test('boots in a real browser and renders through software WebGL', async ({ page }) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const boot = await bootReport(page);
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

  // Pixels actually made it through the renderer and back out again, which is
  // the loop every later agent-facing verification depends on.
  expect(boot.render.pixel).toEqual([255, 136, 0, 255]);

  await expect(page.locator('#app canvas')).toHaveCount(1);
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});
