import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { entryMenu } from '../src/ui/entry-menu';
import { press } from './hooks';
import { stageToScreen } from '../src/render/camera';
import { tilePixel } from '../src/render/terrain';

async function recruitTwo(page: Page): Promise<void> {
  const row = await page.evaluate(() => window.__SPQR.game!.hudLayout().rows.find((r) => r.selection.kind === 'settlement')!.rect);
  await press(page, row);
  const tab = await page.evaluate(() => window.__SPQR.game!.hudLayout().tabs.find((t) => t.tab === 'recruitment')!.rect);
  await press(page, tab);
  const card = await page.evaluate(() => window.__SPQR.game!.hudLayout().commands.find((c) => c.order.id === 'recruit:hastati:24')!.rect);
  await press(page, card);
  const more = await page.evaluate(() => window.__SPQR.game!.hudLayout().buttons.find((b) => b.action === 'recruitMore')!.rect);
  await press(page, more);
  const purchase = await page.evaluate(() => window.__SPQR.game!.hudLayout().buttons.find((b) => b.action === 'purchase:recruit:hastati:24')!.rect);
  await press(page, purchase);
  // Only the clock is accelerated. Every human Command above came from a real control.
  await page.evaluate(() => window.__SPQR.game!.advance(1));
}

async function entry(page: Page, action: string, suspended: boolean, chapters = false): Promise<void> {
  const menu = entryMenu(page.viewportSize()!, chapters, suspended);
  const button = menu.buttons.find((candidate) => candidate.action === action)!;
  await press(page, button.rect);
}

async function gameMenu(page: Page, action: string): Promise<void> {
  await page.keyboard.press('Escape');
  const button = await page.evaluate((wanted) => window.__SPQR.game!.matchLayout().buttons.find((b) => b.action === wanted)!.rect, action);
  await press(page, button);
}

async function keyboardGuide(page: Page, action: string): Promise<void> {
  let focused = false;
  for (let index = 0; index < 100 && !focused; index += 1) {
    await page.keyboard.press('F6');
    focused = await page.evaluate((wanted) => {
      const game = window.__SPQR.game!;
      const rect = game.hudLayout().guideButtons.find((b) => b.action === wanted)!.rect;
      const focus = game.hud().view.focus;
      return focus?.x === rect.x && focus.y === rect.y;
    }, action);
  }
  expect(focused).toBe(true);
  await page.keyboard.press('Enter');
}

for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`main entry, separate practice and paused Resume at ${size.width}`, async ({ page, spqr }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
    await capture(page, `menu-${size.width}`, 'issue70');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
    for (let index = 0; index < 3; index += 1) await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    const skip = await page.evaluate(() => window.__SPQR.game!.hudLayout().guideButtons.find((b) => b.action === 'guideSkip')!.rect);
    await press(page, skip);
    await page.keyboard.press('Space');
    const before = await page.evaluate(() => window.__SPQR.game!.state());
    await gameMenu(page, 'home');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
    await entry(page, 'reference', true);
    await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Enciclopedia/);
    await page.mouse.wheel(0, 600);
    await page.keyboard.press('Escape');
    await entry(page, 'settings', true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'options');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await entry(page, 'tutorial', true);
    await entry(page, 'recruitment', true, true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'practice');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__SPQR.game!.hud().guide!.actions.some((b) => b.action === 'tutorialNext'))).toBe(false);
    await recruitTwo(page);
    expect(await page.evaluate(() => window.__SPQR.game!.hud().guide!.step)).toBe(2);
    await capture(page, `tutorial-${size.width}`, 'issue70');
    await keyboardGuide(page, 'tutorialExit');
    await page.keyboard.press('Escape');
    await entry(page, 'resume', true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await page.keyboard.press('Space');
    const restored = await page.evaluate(() => window.__SPQR.game!.state());
    expect(restored.seed).toBe(before.seed);
    expect(restored.faction).toBe(before.faction);
    expect(restored.tick - before.tick).toBeLessThanOrEqual(3);
    expect(restored.applied.slice(0, before.applied.length)).toEqual(before.applied);
    expect((await spqr.diagnosis()).errors).toEqual([]);
  });

  test(`final practice meets the normal AI through pointer orders at ${size.width}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
    await entry(page, 'tutorial', false);
    await entry(page, 'siege', false, true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'practice');
    await page.keyboard.press('Space');
    await recruitTwo(page);
    const rows = await page.evaluate(() => window.__SPQR.game!.hudLayout().rows.filter((r) => r.selection.kind === 'squad').map((r) => r.rect));
    await press(page, rows[0]!);
    await page.keyboard.down('Shift');
    await press(page, rows[1]!);
    await page.keyboard.up('Shift');
    const minimap = await page.evaluate(() => window.__SPQR.game!.hudLayout().minimap);
    await page.mouse.click(minimap.x + 90 * 2, minimap.y + 91 * 2);
    const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
    const tile = tilePixel(88, 89);
    const target = stageToScreen(camera, tile.x, tile.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(target.x, target.y, { button: 'right' });
    await page.keyboard.up('Shift');
    let engaged = false;
    for (let index = 0; index < 200 && !engaged; index += 1) {
      engaged = await page.evaluate(() => {
        window.__SPQR.game!.advance(10);
        return window.__SPQR.game!.state().visible.squads.some((s) => s.engaged);
      });
    }
    expect(engaged).toBe(true);
    await capture(page, `final-encounter-${size.width}`, 'issue70');
    const exit = await page.evaluate(() => window.__SPQR.game!.hudLayout().guideButtons.find((b) => b.action === 'tutorialExit')!.rect);
    await press(page, exit);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'chapters');
  });
}
