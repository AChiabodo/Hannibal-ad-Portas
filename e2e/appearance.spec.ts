/** U9: reproducible visual states, plus interaction checks through the public canvas. */
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { advance, hud, hudLayout, hudRects, covers, press, select, state, sites, squads, describeView, fastForward, dismissFirstEntry } from './hooks';
import type { Rect } from '../src/ui/hud';

const EVIDENCE = join(tmpdir(), 'spqr-issue62', process.env.SPQR_VISUAL_PHASE ?? 'after');
const BEFORE = process.env.SPQR_VISUAL_PHASE === 'before';

async function capture(page: Page, name: string): Promise<void> {
  await mkdir(EVIDENCE, { recursive: true });
  // Let the final Pixi render reach the browser's presented frame.
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.screenshot({ path: join(EVIDENCE, `${name}.png`) });
}

async function scene(page: Page, faction = 'rome'): Promise<void> {
  await page.goto(`/e2e/commands-fixture.html?faction=${faction}`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-booted', 'true');
  await advance(page, 1);
}

async function focusRect(page: Page, rect: Rect): Promise<void> {
  if (!(await hud(page)).view.focus) await page.keyboard.press('F6');
  for (let i = 0; i < 100; i++) {
    const focus = (await hud(page)).view.focus;
    if (focus?.x === rect.x && focus.y === rect.y && focus.width === rect.width && focus.height === rect.height) return;
    await page.keyboard.press('Tab');
  }
  throw new Error(`no keyboard focus at ${JSON.stringify(rect)}`);
}

async function activateByKeyboard(page: Page, rect: Rect): Promise<void> {
  // The base revision predates UI focus: reproduce the same act with its pointer.
  if (BEFORE) await press(page, rect);
  else { await focusRect(page, rect); await page.keyboard.press('Enter'); }
}

async function leaveFocus(page: Page): Promise<void> {
  if (BEFORE) await page.evaluate(() => window.__SPQR.game!.cancelTargeting());
  else await page.keyboard.press('Escape');
}

for (const faction of ['rome', 'carthage'] as const) for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
  test(`review frames ${faction} ${String(width)}x${String(height)}`, async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = `${faction}-${String(width)}x${String(height)}`;
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
    if (faction === 'carthage') await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.type('62');
    await capture(page, `setup-${suffix}`);

    await scene(page, faction);
    const home = (await sites(page)).find((site) => site.owner === faction && site.kind === 'stronghold')!;
    const row = (await hudLayout(page)).rows.find(({ selection }) => selection.kind === 'settlement' && selection.id === home.id)!;
    await press(page, row.rect);
    expect((await hud(page)).selected).toEqual(row.selection);
    for (const tab of ['overview', 'construction', 'recruitment'] as const) {
      const rect = (await hudLayout(page)).tabs.find((entry) => entry.tab === tab)!.rect;
      await press(page, rect);
      expect((await hud(page)).tab).toBe(tab);
      await activateByKeyboard(page, rect);
      expect((await hud(page)).tab).toBe(tab);
      await leaveFocus(page);
      await capture(page, `${tab}-${suffix}`);
    }

    const army = [...await squads(page)].sort((a, b) => Math.max(Math.abs(a.x - home.x), Math.abs(a.y - home.y)) - Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y)));
    const squadRow = (await hudLayout(page)).rows.find(({ selection }) => selection.kind === 'squad' && selection.id === army[0]!.id)!;
    await press(page, squadRow.rect);
    await capture(page, `idle-paused-${suffix}`);
    const actionIds = (await hud(page)).commands.map(({ id }) => id);
    for (const id of actionIds) {
      for (let attempt = 0; attempt < 5; attempt++) {
        if ((await hudLayout(page)).commands.some(({ order }) => order.id === id)) break;
        const next = (await hudLayout(page)).buttons.find(({ action }) => action === 'commandsNext');
        if (next === undefined) break;
        await press(page, next.rect);
      }
      let card = (await hudLayout(page)).commands.find(({ order }) => order.id === id);
      if (card === undefined) {
        await page.evaluate(() => window.__SPQR.game!.scrollHud('commands', -100));
        card = (await hudLayout(page)).commands.find(({ order }) => order.id === id);
      }
      expect(card, id).toBeDefined();
      const before = (await hud(page)).orders.pending;
      await press(page, card!.rect);
      let model = await hud(page);
      if (!card!.order.enabled) expect(model.orders.notice).toBeTruthy();
      else if (card!.order.target !== 'none') expect(model.orders.armed?.id).toBe(id);
      else expect(model.orders.pending).toBe(before + 1);
      const current = (await hudLayout(page)).commands.find(({ order }) => order.id === id);
      if (current === undefined) await page.evaluate(() => window.__SPQR.game!.scrollHud('commands', -100));
      const rect = (await hudLayout(page)).commands.find(({ order }) => order.id === id)!.rect;
      await activateByKeyboard(page, rect);
      model = await hud(page);
      if (!card!.order.enabled) expect(model.orders.notice).toBeTruthy();
      else if (card!.order.target !== 'none') expect(model.orders.armed?.id).toBe(id);
      else expect(model.orders.pending).toBe(before + 2);
      if (id === 'attackMove' || !card!.order.enabled) await capture(page, `${id === 'attackMove' ? 'armed' : 'disabled'}-${suffix}`);
      await leaveFocus(page);
    }
    await capture(page, `pending-${suffix}`);
    await advance(page, 1);
    await capture(page, `applied-${suffix}`);

    await page.keyboard.press('Control+1');
    const chip = (await hudLayout(page)).groups.find(({ index }) => index === 1)!;
    await press(page, chip.rect);
    expect((await hud(page)).picked.map(({ id }) => id)).toEqual([army[0]!.id]);
    await activateByKeyboard(page, chip.rect);
    await capture(page, `group-chip-${suffix}`);
    await leaveFocus(page);

    await page.evaluate(() => window.__SPQR.game!.centerSelection());
    const view = await describeView(page);
    const currentArmy = await squads(page);
    const pair = army.slice(0, 2).map(({ id }) => currentArmy.find((squad) => squad.id === id)!).map(({ rect }) => ({ x: (rect.x - view.camera.x) * view.camera.zoom,
      y: (rect.y - view.camera.y) * view.camera.zoom, right: (rect.x + rect.width - view.camera.x) * view.camera.zoom,
      bottom: (rect.y + rect.height - view.camera.y) * view.camera.zoom }));
    const box = { left: Math.min(...pair.map(({ x }) => x)) - 1, top: Math.min(...pair.map(({ y }) => y)) - 1,
      right: Math.max(...pair.map(({ right }) => right)) + 1, bottom: Math.max(...pair.map(({ bottom }) => bottom)) + 1 };
    const panels = await hudRects(page);
    const corner = [[box.left, box.top, box.right, box.bottom], [box.right, box.top, box.left, box.bottom],
      [box.left, box.bottom, box.right, box.top], [box.right, box.bottom, box.left, box.top]]
      .find(([x, y]) => !panels.some((rect) => covers(rect, x!, y!)));
    expect(corner, 'the selection starts in bare theatre').toBeDefined();
    await page.evaluate(([left, top, right, bottom]) => window.__SPQR.game!.selectIn(left!, top!, right!, bottom!, false), corner!);
    expect((await hud(page)).group?.squads).toBeGreaterThanOrEqual(2);
    await capture(page, `mixed-${suffix}`);

    const away = (await sites(page)).find((site) => site.owner !== faction && site.owner !== null && site.kind === 'stronghold')!;
    const besieger = [...army].sort((a, b) => Math.max(Math.abs(a.x - away.x), Math.abs(a.y - away.y)) - Math.max(Math.abs(b.x - away.x), Math.abs(b.y - away.y)))[0]!;
    await select(page, { kind: 'squad', id: besieger.id });
    await page.evaluate(({ id, target }) => {
      window.__SPQR.game!.perform(id);
      window.__SPQR.game!.targetSettlement(target);
    }, { id: faction === 'rome' ? 'assault' : 'blockade', target: away.id });
    await advance(page, 1);
    await select(page, { kind: 'settlement', id: away.id });
    await page.evaluate(() => window.__SPQR.game!.centerSelection());
    expect((await hud(page)).detail?.lines.some(({ label }) => label === 'Mura')).toBe(true);
    await capture(page, `siege-${suffix}`);
    await press(page, (await hudLayout(page)).buttons.find(({ action }) => action === 'session')!.rect);
    await capture(page, `options-${suffix}`);

    // The requested 3x preference survives a smaller window; controls fit it.
    await page.evaluate(() => window.__SPQR.game!.setUiScale(3));
    const menu = await page.evaluate(() => window.__SPQR.game!.matchLayout());
    if (!BEFORE) for (const { rect } of menu.buttons) expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    await capture(page, `scale3-options-${suffix}`);
    await page.evaluate(() => window.__SPQR.game!.setUiScale(2));
    await press(page, (await page.evaluate(() => window.__SPQR.game!.matchLayout())).buttons.find(({ action }) => action === 'close')!.rect);
    for (const zoom of [1, 2, 4, 8]) {
      await page.evaluate((zoom) => window.__SPQR.view!.zoomTo(zoom), zoom);
      await capture(page, `zoom${String(zoom)}-${suffix}`);
    }
    expect((await state(page)).hash).toMatch(/^[0-9a-f]{16}$/);
    expect(errors).toEqual([]);
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
  });

  test(`result and first-entry frames ${faction} ${String(width)}`, async ({ page }) => {
    test.setTimeout(90_000);
    const suffix = `${faction}-${String(width)}x${String(height)}`;
    await page.setViewportSize({ width, height });
    await page.goto(`/?play=1&seed=59&faction=${faction}&difficulty=tiro`);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    expect((await hud(page)).guide?.stage).toBe('welcome');
    await capture(page, `guide-${suffix}`);
    await page.evaluate(() => window.__SPQR.game!.setUiScale(3));
    await capture(page, `scale3-guide-${suffix}`);
    await dismissFirstEntry(page);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await fastForward(page);
    await capture(page, `result-${suffix}`);
  });
}

test('keyboard focus reaches the same settlement tab and command rectangles as the pointer', async ({ page }) => {
  test.skip(BEFORE, 'UI focus did not exist in the base revision');
  await page.setViewportSize({ width: 1280, height: 720 });
  await scene(page);
  await select(page, { kind: 'settlement', id: 0 });
  await page.keyboard.press('F6');
  await expect.poll(async () => (await hud(page)).view.focus).toBeTruthy();
  const target = (await hudLayout(page)).tabs.find(({ tab }) => tab === 'recruitment')!.rect;
  for (let i = 0; i < 80; i++) {
    const focus = (await hud(page)).view.focus;
    if (focus?.x === target.x && focus.y === target.y) break;
    await page.keyboard.press('Tab');
  }
  expect((await hud(page)).view.focus).toEqual(target);
  await page.keyboard.press('Enter');
  expect((await hud(page)).tab).toBe('recruitment');
  const before = (await hud(page)).orders.pending;
  const recruit = (await hudLayout(page)).commands.find(({ order }) => order.enabled)!;
  for (let i = 0; i < 80; i++) {
    const focus = (await hud(page)).view.focus;
    if (focus?.x === recruit.rect.x && focus.y === recruit.rect.y) break;
    await page.keyboard.press('Tab');
  }
  await page.keyboard.press('Enter');
  expect((await hud(page)).orders.pending).toBe(before + 1);
  await capture(page, 'keyboard-recruitment-rome-1280x720');
  await page.keyboard.press('Escape');
  expect((await hud(page)).view.focus).toBeNull();
  expect((await hud(page)).selected).toEqual({ kind: 'settlement', id: 0 });
});
