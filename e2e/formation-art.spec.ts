import { expect, test } from './fixtures';
import { capture, VISUAL_EVIDENCE } from './evidence';
import { describeView, hudRects, samples, squads } from './hooks';
import { squadBlock, blockMen, visualShape } from '../src/render/squads';
import { pixelAt } from '../src/art/pixel-buffer';
import { FIGURE_TREATMENTS } from '../src/art/figure-study';

for (const faction of ['rome', 'carthage'] as const) for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`recruited Figures, visible picking and comparative art: ${faction} ${size.width}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(size);
    await page.goto(`/e2e/formation-fixture.html?faction=${faction}`);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-booted', 'true');
    await expect(page).toHaveTitle(/SPQR/);
    const blocks = await squads(page);
    expect(blocks).toHaveLength(8);
    for (const squad of blocks) expect(blockMen(visualShape(squad))).toHaveLength(squad.figures);
    const view = await describeView(page);
    const panels = await hudRects(page);
    // Frontmost first, and an actual opaque Figure pixel rather than the centre
    // of a rectangle whose middle may deliberately contain a casualty hole.
    let clicked = false;
    for (const squad of [...blocks].sort((a, b) => b.y - a.y || b.id - a.id)) {
      const drawn = squadBlock(squad);
      for (let y = drawn.height - 1; y >= 0 && !clicked; y--) for (let x = 0; x < drawn.width && !clicked; x++) {
        const ink = pixelAt(drawn, x, y);
        if (ink[3] !== 255) continue;
        const point = { x: (squad.rect.x + x - view.camera.x) * view.camera.zoom,
          y: (squad.rect.y + y - view.camera.y) * view.camera.zoom };
        if (point.x < 0 || point.y < 0 || point.x >= size.width || point.y >= size.height ||
          panels.some((rect) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height)) continue;
        const [gpu] = await samples(page, 'view', [[point.x, point.y]]);
        if (JSON.stringify(gpu) !== JSON.stringify(ink)) continue;
        await page.mouse.click(point.x + 1, point.y + 1);
        expect((await page.evaluate(() => window.__SPQR.game!.selection())).squads).toContain(squad.id);
        clicked = true;
      }
      if (clicked) break;
    }
    expect(clicked, 'a visible Figure is selectable through a real pointer').toBe(true);
    for (const zoom of [1, 2, 3, 4]) {
      await page.evaluate((level) => window.__SPQR.view!.zoomTo(level), zoom);
      await page.keyboard.press('f');
      await capture(page, `field-${faction}-${size.width}-z${zoom}`, 'issue67');
    }
    // The comparison is an Atelier mode, using the same PixelBuffer/PixiJS path.
    // The extensive matrix produces evidence only on the explicit visual run.
    for (const treatment of VISUAL_EVIDENCE ? FIGURE_TREATMENTS : ['native'] as const) {
      for (const zoom of VISUAL_EVIDENCE ? [1, 2, 3, 4] : [3]) for (const scene of ['formations', 'proportions']) {
        await page.goto(`/atelier.html?study=67&faction=${faction}&treatment=${treatment}&zoom=${zoom}&scene=${scene}`);
        await expect(page.locator('body')).toHaveAttribute('data-spqr-booted', 'true');
        expect(await page.evaluate(() => window.__SPQR.atelier!.zooms)).toEqual([zoom]);
        expect(await page.locator('#app canvas').count()).toBe(1);
        await capture(page, `${scene}-${faction}-${treatment}-${size.width}-z${zoom}`, 'issue67');
      }
    }
    expect(errors).toEqual([]);
  });
}
