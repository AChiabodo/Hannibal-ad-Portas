/** U9: reproducible visual states, plus interaction checks through the public canvas. */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { advance, hud, hudLayout, hudRects, covers, press, select, state, sites, squads, describeView, fastForward, dismissFirstEntry } from './hooks';
import type { Rect } from '../src/ui/hud';
import type { SiteReport } from '../src/render/game';

/**
 * Which revision the frames are of, when someone is comparing two of them.
 * The default is the delivered revision; `SPQR_VISUAL_PHASE=before` reproduces
 * the pre-change scenes (U9's own comparison), and every frame is then named
 * for the revision it shows.
 */
const BEFORE = process.env.SPQR_VISUAL_PHASE === 'before';

/** One frame of the visual scene. Frames are produced only by `test:visual`. */
async function frame(page: Page, name: string): Promise<void> {
  await capture(page, BEFORE ? `before-${name}` : name, 'issue62');
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
  await page.evaluate(() => window.__SPQR.game!.cancelTargeting());
}

async function revealOrder(page: Page, id: string) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = await hudLayout(page);
    const card = layout.commands.find(({ order }) => order.id === id);
    if (card !== undefined) return card;
    const model = await hud(page);
    const index = model.commands.findIndex((order) => order.id === id);
    const action = index < layout.commandScroll.offset ? 'commandsPrevious' : 'commandsNext';
    const button = layout.buttons.find((button) => button.action === action);
    if (button === undefined || !button.enabled) break;
    await press(page, button.rect);
  }
  throw new Error(`no visible economy order ${id}`);
}

/**
 * Opens the reviewed revision at a reference resolution and lands on the
 * command fixture, capturing the setup frame first.
 *
 * The two review scenes below share this opening because it is the part that is
 * not the subject: a Player choosing a Faction and a seed, then a Match to look
 * at. Splitting the scenes keeps each frame producer inside a test whose name
 * says which failure a reader is looking at, which is what makes a slow visual
 * run diagnosable (#64).
 *
 * The page errors it listens for are returned rather than handed in: a caller
 * cannot forget to read them, and the two scenes do not share a mutable list.
 */
async function reviewScene(
  page: Page,
  faction: 'rome' | 'carthage',
  width: number,
  height: number,
): Promise<{ readonly home: SiteReport; readonly errors: readonly string[] }> {
  const suffix = `${faction}-${String(width)}x${String(height)}`;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width, height });
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  if (faction === 'carthage') await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.type('62');
  await frame(page, `setup-${suffix}`);

  await scene(page, faction);
  const home = (await sites(page)).find((site) => site.owner === faction && site.kind === 'stronghold');
  expect(home, 'the Faction sees its Stronghold').toBeDefined();
  if (home === undefined) throw new Error('no Stronghold');

  return { home, errors };
}

/** The army ordered by distance from a settlement, which both review scenes want. */
function armyFrom<T extends { readonly x: number; readonly y: number }>(
  squads: readonly T[],
  home: { readonly x: number; readonly y: number },
): T[] {
  return [...squads].sort(
    (a, b) => Math.max(Math.abs(a.x - home.x), Math.abs(a.y - home.y)) - Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y)),
  );
}

for (const faction of ['rome', 'carthage'] as const) for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
  test(`all economy rows by pointer and keyboard ${faction} ${String(width)}`, async ({ page }) => {
    test.skip(BEFORE, 'additional functional gate for the changed economy layout');
    test.setTimeout(180_000);
    await page.setViewportSize({ width, height });
    await scene(page, faction);
    const home = (await sites(page)).find((site) => site.owner === faction && site.kind === 'stronghold')!;
    await select(page, { kind: 'settlement', id: home.id });
    for (const tab of ['construction', 'recruitment'] as const) {
      await press(page, (await hudLayout(page)).tabs.find((entry) => entry.tab === tab)!.rect);
      const ids = (await hud(page)).commands.map(({ id }) => id);
      for (const id of ids) {
        const card = await revealOrder(page, id);
        const pending = (await hud(page)).orders.pending;
        await press(page, card.rect);
        const purchase = (await hudLayout(page)).buttons.find((button) => button.action === `purchase:${id}`)!;
        await press(page, purchase.rect);
        if (card.order.enabled) expect((await hud(page)).orders.pending, `${id} pointer`).toBe(pending + 1);
        else expect((await hud(page)).orders.notice, `${id} pointer refusal`).toBeTruthy();
        const drawn = await revealOrder(page, id);
        await activateByKeyboard(page, drawn.rect);
        await activateByKeyboard(page, (await hudLayout(page)).buttons.find((button) => button.action === `purchase:${id}`)!.rect);
        if (card.order.enabled) expect((await hud(page)).orders.pending, `${id} keyboard`).toBe(pending + 2);
        else expect((await hud(page)).orders.pending, `${id} stays unavailable`).toBe(pending);
        await frame(page, `economy-${id.replace(':', '-')}-${faction}-${String(width)}x${String(height)}`);
        await leaveFocus(page);
      }
    }
  });

  test(`critical Siege frames ${faction} ${String(width)}`, async ({ page }) => {
    test.skip(BEFORE, 'the critical-state fixture matrix is added by U9');
    await page.setViewportSize({ width, height });
    for (const stage of ['building', 'ram', 'breach', 'blockade']) {
      await page.goto(`/e2e/siege-fixture.html?view=${faction}&stage=${stage}`);
      await expect(page.locator('body')).toHaveAttribute('data-spqr-booted', 'true');
      await advance(page, 1);
      const target = (await sites(page)).find((site) => site.kind === 'stronghold' && site.owner === 'carthage')!;
      expect(target, `${stage}: the viewed Faction may know this front`).toBeDefined();
      await select(page, { kind: 'settlement', id: target.id });
      await page.evaluate(() => window.__SPQR.game!.centerSelection());
      const camera = (await describeView(page)).camera;
      const at = { x: (target.rect.x + target.rect.width / 2 - camera.x) * camera.zoom,
        y: (target.rect.y + target.rect.height / 2 - camera.y) * camera.zoom };
      const layout = await hudLayout(page);
      expect(at.x, 'the reviewed Siege is in the theatre, not offscreen').toBeGreaterThanOrEqual(layout.list.width);
      expect(at.x).toBeLessThanOrEqual(width);
      expect(at.y).toBeGreaterThanOrEqual(layout.bar.height);
      expect((await hudRects(page)).some((rect) => covers(rect, at.x, at.y)), 'the reviewed Siege is outside the interface').toBe(false);
      if (stage === 'building') expect(target.front?.ram?.built).toBe(false);
      if (stage === 'ram') expect(target.front?.ram?.built).toBe(true);
      if (stage === 'breach') expect(target.front?.breached).toBe(true);
      if (stage === 'blockade') expect(target.front?.siege).toBe('blockade');
      await frame(page, `siege-${stage}-${faction}-${String(width)}x${String(height)}`);
      // The established public inspection lens lets the reviewer see the gate
      // and ram even when three field Squads overlap the walls. Same knowledge.
      await page.evaluate(() => window.__SPQR.game!.showSquads(false));
      await frame(page, `siege-${stage}-structure-${faction}-${String(width)}x${String(height)}`);
    }
  });

  test(`review frames: panels and commands ${faction} ${String(width)}x${String(height)}`, async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = `${faction}-${String(width)}x${String(height)}`;
    const { home, errors } = await reviewScene(page, faction, width, height);

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
      await frame(page, `${tab}-${suffix}`);
    }

    const army = armyFrom(await squads(page), home);
    const squadRow = (await hudLayout(page)).rows.find(({ selection }) => selection.kind === 'squad' && selection.id === army[0]!.id)!;
    await press(page, squadRow.rect);
    await frame(page, `idle-paused-${suffix}`);
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
      if (id === 'attackMove' || !card!.order.enabled) await frame(page, `${id === 'attackMove' ? 'armed' : 'disabled'}-${suffix}`);
      await leaveFocus(page);
    }
    await frame(page, `pending-${suffix}`);
    await advance(page, 1);
    await frame(page, `applied-${suffix}`);

    await page.keyboard.press('Control+1');
    const chip = (await hudLayout(page)).groups.find(({ index }) => index === 1)!;
    await press(page, chip.rect);
    expect((await hud(page)).picked.map(({ id }) => id)).toEqual([army[0]!.id]);
    await activateByKeyboard(page, chip.rect);
    await frame(page, `group-chip-${suffix}`);
    await leaveFocus(page);

    expect((await state(page)).hash).toMatch(/^[0-9a-f]{16}$/);
    expect(errors).toEqual([]);
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
  });

  test(`review frames: theatre and options ${faction} ${String(width)}x${String(height)}`, async ({ page }) => {
    test.setTimeout(120_000);
    const suffix = `${faction}-${String(width)}x${String(height)}`;
    const { home, errors } = await reviewScene(page, faction, width, height);
    const army = armyFrom(await squads(page), home);

    const squadRow = (await hudLayout(page)).rows.find(({ selection }) => selection.kind === 'squad' && selection.id === army[0]!.id)!;
    await press(page, squadRow.rect);
    expect((await hud(page)).selected).toEqual(squadRow.selection);
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
    await frame(page, `mixed-${suffix}`);

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
    await frame(page, `siege-${suffix}`);
    await press(page, (await hudLayout(page)).buttons.find(({ action }) => action === 'session')!.rect);
    await frame(page, `options-${suffix}`);

    // The requested 3x preference survives a smaller window; controls fit it.
    await page.evaluate(() => window.__SPQR.game!.setUiScale(3));
    const menu = await page.evaluate(() => window.__SPQR.game!.matchLayout());
    if (!BEFORE) for (const { rect } of menu.buttons) expect(rect.x + rect.width).toBeLessThanOrEqual(width);
    await frame(page, `scale3-options-${suffix}`);
    await page.evaluate(() => window.__SPQR.game!.setUiScale(2));
    await press(page, (await page.evaluate(() => window.__SPQR.game!.matchLayout())).buttons.find(({ action }) => action === 'close')!.rect);
    await select(page, { kind: 'squad', id: besieger.id });
    for (const zoom of [1, 2, 4, 8]) {
      await page.evaluate((zoom) => window.__SPQR.view!.zoomTo(zoom), zoom);
      await page.evaluate(() => window.__SPQR.game!.centerSelection());
      await frame(page, `zoom${String(zoom)}-${suffix}`);
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
    await frame(page, `guide-${suffix}`);
    await page.evaluate(() => window.__SPQR.game!.setUiScale(3));
    await frame(page, `scale3-guide-${suffix}`);
    await dismissFirstEntry(page);
    await page.reload();
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await fastForward(page);
    await frame(page, `result-${suffix}`);
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
  await activateByKeyboard(page, (await hudLayout(page)).buttons.find((button) => button.action === `purchase:${recruit.order.id}`)!.rect);
  expect((await hud(page)).orders.pending).toBe(before + 1);
  await frame(page, 'keyboard-recruitment-rome-1280x720');
  await page.keyboard.press('Escape');
  expect((await hud(page)).view.sessionOpen).toBe(true);
  await page.keyboard.press('Escape');
  expect((await hud(page)).view.focus).toBeNull();
  expect((await hud(page)).selected).toEqual({ kind: 'settlement', id: 0 });
});
