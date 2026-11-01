import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { capture } from './evidence';
import type { HudAction } from '../src/ui/hud';
import { MAP_WIDTH, TERRAIN } from '../src/sim/map';

async function ready(page: Page, faction = 'rome') {
  await page.goto(`/?play=1&seed=7&faction=${faction}&difficulty=centurio`);
  await page.waitForFunction(() => window.__SPQR?.game);
  await page.evaluate(() => window.__SPQR.game!.pause());
}
async function clickAction(page: Page, action: HudAction | 'scale' | 'reset' | 'guide') {
  if (action === 'center') { await page.keyboard.press('f'); return; }
  if (action === 'session' && await page.evaluate(() => window.__SPQR.game!.hud().view.sessionOpen)) {
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => window.__SPQR.game!.hud().view.sessionOpen)) await page.keyboard.press('Escape');
    return;
  }
  const settings = ['scale', 'reset', 'guide', 'navigator'].includes(action);
  if (settings) {
    if (!await page.evaluate(() => window.__SPQR.game!.hud().view.sessionOpen)) await clickAction(page, 'session');
    const entry = await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((b) => b.action === 'settings')?.rect);
    if (entry) await page.mouse.click(entry.x + 8, entry.y + 8);
  }
  const rect = await page.evaluate((action) => {
    const game = window.__SPQR.game!;
    return game.hudLayout().buttons.find((b) => b.action === action)?.rect
      ?? game.matchLayout().buttons.find((b) => b.action === action)!.rect;
  }, action);
  const canvas = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(canvas.x + rect.x + 8, canvas.y + rect.y + 8);
  if (settings && await page.evaluate(() => window.__SPQR.game!.hud().view.sessionOpen)) await clickAction(page, 'session');
}

for (const width of [1280, 1920]) for (const faction of ['rome', 'carthage']) {
  test(`desktop navigation and rendering ${faction} ${width}`, async ({ page, spqr }) => {
    const height = width === 1280 ? 720 : 1080;
    await page.setViewportSize({ width, height });
    await ready(page, faction);
    expect(await page.title()).toContain('Annibale');
    expect(await page.evaluate(() => window.__SPQR.view!.describe().width)).toBe(width);
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
    const rows = await page.evaluate(() => window.__SPQR.game!.hudRows());
    const hash = await page.evaluate(() => window.__SPQR.game!.hash());
    await page.evaluate((faction) => window.__SPQR.view!.panBy(faction === 'rome' ? 200 : -200, faction === 'rome' ? 100 : -100), faction);
    const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
    await page.mouse.click(rows[0]!.rect.x + 8, rows[0]!.rect.y + 8);
    const selection = await page.evaluate(() => window.__SPQR.game!.selection());
    expect(selection.settlement).toBe(rows[0]!.selection.id);
    expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).toEqual(camera);
    await page.mouse.dblclick(rows[0]!.rect.x + 8, rows[0]!.rect.y + 8);
    expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).not.toEqual(camera);
    const focused = await page.evaluate(() => {
      const game = window.__SPQR.game!;
      const site = game.state().visible.settlements[0]!;
      const camera = window.__SPQR.view!.describe().camera;
      return { x: (site.x * 16 + 8 - camera.x) * camera.zoom, y: (site.y * 16 + 8 - camera.y) * camera.zoom,
        layout: game.hudLayout() };
    });
    expect(focused.x).toBeGreaterThanOrEqual(focused.layout.list.width);
    expect(focused.y).toBeGreaterThanOrEqual(focused.layout.list.y);
    expect(focused.y).toBeLessThan(focused.layout.theatre!.y + focused.layout.theatre!.height);

    await page.evaluate((faction) => window.__SPQR.view!.panBy(faction === 'rome' ? 200 : -200, faction === 'rome' ? 100 : -100), faction);
    await clickAction(page, 'center');
    const centred = await page.evaluate(() => window.__SPQR.view!.describe().camera);
    await page.evaluate((faction) => window.__SPQR.view!.panBy(faction === 'rome' ? 200 : -200, faction === 'rome' ? 100 : -100), faction);
    await page.keyboard.press('f');
    expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).toEqual(centred);
    const minimap = await page.evaluate(() => window.__SPQR.game!.hudLayout().minimap);
    await page.keyboard.press('a');
    await page.mouse.move(minimap.x + 30, minimap.y + 30);
    await page.mouse.down();
    await page.mouse.move(minimap.x + minimap.width - 10, minimap.y + minimap.height - 10, { steps: 5 });
    await page.mouse.up();
    await page.mouse.click(minimap.x + 80, minimap.y + 80, { button: 'right' });
    expect(await page.evaluate(() => window.__SPQR.game!.selection())).toEqual(selection);
    expect(await page.evaluate(() => window.__SPQR.game!.hash())).toBe(hash);
    expect(await page.evaluate(() => window.__SPQR.game!.applied())).toEqual([]);
    const zoom = await page.evaluate(() => window.__SPQR.view!.describe().camera.zoom);
    await page.mouse.wheel(0, 100);
    expect(await page.evaluate(() => window.__SPQR.view!.describe().camera.zoom)).toBe(zoom);
    for (let z = 1; z <= 8; z++) {
      await page.evaluate((z) => { window.__SPQR.view!.zoomTo(z); window.__SPQR.game!.centerSelection(); }, z);
      const point = await page.evaluate(() => {
        const site = window.__SPQR.game!.state().visible.settlements[0]!;
        const camera = window.__SPQR.view!.describe().camera;
        return { x: (site.x * 16 + 8 - camera.x) * camera.zoom, y: (site.y * 16 + 8 - camera.y) * camera.zoom,
          layout: window.__SPQR.game!.hudLayout() };
      });
      expect(point.x).toBeGreaterThanOrEqual(point.layout.list.width);
      expect(point.y).toBeGreaterThanOrEqual(point.layout.list.y);
      expect(point.y).toBeLessThan(point.layout.theatre!.y + point.layout.theatre!.height);
      expect(await page.evaluate(() => window.__SPQR.game!.hudLayout().minimap)).toEqual(minimap);
    }
    await page.evaluate(() => window.__SPQR.view!.zoomTo(2));
    await clickAction(page, 'center');
    await capture(page, `${faction}-${width}`, 'issue54');
    const diagnosis = await spqr.diagnosis();
    expect(diagnosis.errors).toEqual([]);
  });
}

test('resize, scale and stored preferences preserve the Match and reset without retaining selection', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await ready(page);
  const row = await page.evaluate(() => window.__SPQR.game!.hudRows()[0]!);
  await page.mouse.click(row.rect.x + 8, row.rect.y + 8);
  const hash = await page.evaluate(() => window.__SPQR.game!.hash());
  const zoom = await page.evaluate(() => window.__SPQR.view!.describe().camera.zoom);
  await clickAction(page, 'scale');
  await clickAction(page, 'scale');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences().uiScale)).toBe(1);
  const scaledRow = await page.evaluate(() => window.__SPQR.game!.hudRows()[0]!);
  await page.mouse.click(scaledRow.rect.x + 5, scaledRow.rect.y + 5);
  expect(await page.evaluate(() => window.__SPQR.game!.selection().settlement)).toBe(row.selection.id);
  expect(await page.evaluate(() => window.__SPQR.view!.describe().camera.zoom)).toBe(zoom);
  await clickAction(page, 'scale'); // restore 2x before persistence checks
  await clickAction(page, 'guide');
  await clickAction(page, 'navigator');
  await clickAction(page, 'scale'); // 3x fits at 1920x1080
  expect(await page.evaluate(() => window.__SPQR.game!.preferences())).toEqual({ uiScale: 3, navigator: false, guideDismissed: true, panelLayout: 'sidebar' });
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect.poll(() => page.evaluate(() => window.__SPQR.game!.hudLayout().text.map((line) => line.text).join(' '))).toContain('Scala richiesta');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences().uiScale)).toBe(3);
  expect(await page.evaluate(() => window.__SPQR.game!.hash())).toBe(hash);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await expect.poll(() => page.evaluate(() => window.__SPQR.view!.describe().width)).toBe(1920);
  page.on('dialog', (dialog) => dialog.accept());
  await page.reload();
  await page.waitForFunction(() => window.__SPQR?.game);
  await page.evaluate(() => window.__SPQR.game!.pause());
  expect(await page.evaluate(() => window.__SPQR.game!.preferences())).toEqual({ uiScale: 3, navigator: false, guideDismissed: true, panelLayout: 'sidebar' });
  expect(await page.evaluate(() => window.__SPQR.game!.selection())).toEqual({ squads: [], settlement: null });
  await clickAction(page, 'reset');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences())).toEqual({ uiScale: 2, navigator: true, guideDismissed: false, panelLayout: 'sidebar' });
  await page.setViewportSize({ width: 900, height: 600 });
  await expect.poll(() => page.evaluate(() => window.__SPQR.game!.hudLayout().text.map((line) => line.text).join(' '))).toContain('1280x720');
  expect(await page.evaluate(() => window.__SPQR.game!.hudLayout().list.width)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await capture(page, 'small-window', 'issue54');
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickAction(page, 'navigator');
  expect(await page.evaluate(() => window.__SPQR.game!.hudRows().length)).toBeGreaterThan(0);
});

test('unavailable browser storage does not block play or preference controls', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage unavailable'); } });
  });
  await ready(page);
  await clickAction(page, 'navigator');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences().navigator)).toBe(false);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences().navigator)).toBe(true);
  await clickAction(page, 'reset');
  expect(await page.evaluate(() => window.__SPQR.game!.preferences().uiScale)).toBe(2);
});

for (const faction of ['rome', 'carthage'] as const) {
  test(`Minimap gestures cannot issue orders to a selected Squad (${faction})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ready(page, faction);
    await page.evaluate((faction) => {
      const game = window.__SPQR.game!;
      game.submit({ kind: 'recruit', faction, settlement: faction === 'rome' ? 0 : 1,
        squadType: faction === 'rome' ? 'hastati' : 'gaul', men: 24, count: 1 });
      game.advance(1);
      game.select({ kind: 'squad', id: game.squads()[0]!.id });
    }, faction);
    const selection = await page.evaluate(() => window.__SPQR.game!.selection());
    const minimap = await page.evaluate(() => window.__SPQR.game!.hudLayout().minimap);
    await page.keyboard.press('a');
    await page.mouse.click(minimap.x + 30, minimap.y + 30);
    await page.mouse.move(minimap.x + 30, minimap.y + 30);
    await page.mouse.down();
    await page.mouse.move(minimap.x - 100, minimap.y - 100, { steps: 5 });
    await page.mouse.up();
    await page.mouse.click(minimap.x + 90, minimap.y + 60, { button: 'right' });
    await page.evaluate(() => window.__SPQR.game!.advance(1));
    expect(await page.evaluate(() => window.__SPQR.game!.selection())).toEqual(selection);
    expect(await page.evaluate(() => window.__SPQR.game!.applied().map(({ command }) => command.kind))).toEqual(['recruit']);
    await page.evaluate(() => window.__SPQR.game!.cancelTargeting());
    const known = await page.evaluate(({ width, water }) => {
      const game = window.__SPQR.game!;
      const snapshot = game.state();
      const squad = snapshot.visible.squads[0]!;
      const index = snapshot.visible.fog.terrain.findIndex((terrain, at) => {
        const dx = at % width - squad.x;
        const dy = Math.floor(at / width) - squad.y;
        return terrain !== 255 && !water.some((code) => code === terrain) && dx * dx + dy * dy >= 49 && dx * dx + dy * dy <= 64;
      });
      if (index < 0) throw new Error('the known watch has no walkable frontier');
      game.submit({ kind: 'move', faction: snapshot.faction, squads: [squad.id], x: index % width, y: Math.floor(index / width) });
      game.advance(300);
      game.submit({ kind: 'move', faction: snapshot.faction, squads: [squad.id], x: squad.x, y: squad.y });
      game.advance(300);
      game.select({ kind: 'squad', id: squad.id });
      game.centerSelection();
      return game.knowledge();
    }, { width: MAP_WIDTH, water: [TERRAIN.river, TERRAIN.lake] });
    expect(known).toContain(0);
    expect(known).toContain(1);
    expect(known).toContain(2);
    for (let zoom = 1; zoom <= 8; zoom++) {
      await page.evaluate((zoom) => { window.__SPQR.view!.zoomTo(zoom); window.__SPQR.game!.centerSelection(); }, zoom);
      await capture(page, `${faction}-known-zoom${zoom}`, 'issue54');
    }
  });
}

test('options drawer consumes double-clicks over the covered navigator', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await ready(page);
  const row = await page.evaluate(() => window.__SPQR.game!.hudRows()[0]!);
  await page.mouse.click(row.rect.x + 4, row.rect.y + 4);
  await page.evaluate(() => window.__SPQR.view!.panBy(200, 100));
  const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
  await clickAction(page, 'session');
  await page.mouse.dblclick(row.rect.x + 2, row.rect.y + 4);
  expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).toEqual(camera);
  await clickAction(page, 'session');
  await page.mouse.dblclick(row.rect.x + 2, row.rect.y + 4);
  expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).not.toEqual(camera);
});
