import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { entryMenu } from '../src/ui/entry-menu';
import { press } from './hooks';
import { stageToScreen } from '../src/render/camera';
import { tilePixel } from '../src/render/terrain';
/** Pan the public camera until the known target is clear of the lesson panel. */
async function revealTile(page: Page, tile: { readonly x: number; readonly y: number }) {
  return page.evaluate((tile) => {
    const game = window.__SPQR.game!, view = window.__SPQR.view!;
    const opening = view.describe();
    const covered = (x: number, y: number) => game.hudRects().some((rect) =>
      x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height);
    for (const zoom of [...new Set([opening.camera.zoom, 1, 2, 4, 8])]) {
      view.zoomTo(zoom);
      const size = view.describe();
      const spots = [{ x: size.width * 0.8, y: size.height * 0.4 },
        { x: size.width * 0.8, y: size.height * 0.55 }, { x: size.width * 0.5, y: size.height * 0.5 }];
      for (const spot of spots) {
        if (covered(spot.x, spot.y)) continue;
        const before = view.describe().camera;
        view.panBy(tile.x - spot.x / zoom - before.x, tile.y - spot.y / zoom - before.y);
        const camera = view.describe().camera;
        const at = { x: (tile.x - camera.x) * camera.zoom, y: (tile.y - camera.y) * camera.zoom };
        if (at.x > 0 && at.y > 0 && at.x < size.width && at.y < size.height && !covered(at.x, at.y)) return at;
      }
    }
    throw new Error('the observed target cannot be exposed beside the tutorial panel');
  }, tile);
}

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

async function gameMenu(page: Page, action: string): Promise<number> {
  await page.keyboard.press('Escape');
  const parkedTick = await page.evaluate(() => window.__SPQR.game!.tick());
  const button = await page.evaluate((wanted) => window.__SPQR.game!.matchLayout().buttons.find((b) => b.action === wanted)!.rect, action);
  await press(page, button);
  return parkedTick;
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
    const parkedTick = await gameMenu(page, 'home');
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
    // Reading does not advance itself; entering the next action does not complete it.
    await keyboardGuide(page, 'tutorialNext');
    expect(await page.evaluate(() => window.__SPQR.game!.hud().guide!.step)).toBe(2);
    expect(await page.evaluate(() => window.__SPQR.game!.hudLayout().guideButtons.find((b) => b.action === 'tutorialNext')!.enabled)).toBe(false);
    // Space controls the clock even while the disabled Next button has keyboard focus.
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(false);
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(true);
    expect(await page.evaluate(() => window.__SPQR.game!.hud().guide!.step)).toBe(2);
    const home = await page.evaluate(() => window.__SPQR.game!.hudLayout().rows.find((r) => r.selection.kind === 'settlement')!.rect);
    await press(page, home);
    expect(await page.evaluate(() => window.__SPQR.game!.hudLayout().guideButtons.find((b) => b.action === 'tutorialNext')!.enabled)).toBe(true);
    await keyboardGuide(page, 'tutorialNext');
    expect(await page.evaluate(() => window.__SPQR.game!.hud().guide!.step)).toBe(3);
    await capture(page, `tutorial-${size.width}`, 'issue70');
    await keyboardGuide(page, 'tutorialExit');
    await page.keyboard.press('Escape');
    const resumedAt = Date.now();
    await entry(page, 'resume', true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await page.keyboard.press('Space');
    const restored = await page.evaluate(() => window.__SPQR.game!.state());
    expect(restored.seed).toBe(before.seed);
    expect(restored.faction).toBe(before.faction);
    // Resume runs through real animation frames until Space pauses it. Its
    // permitted ticks follow elapsed wall time, not a fixed number of API calls.
    expect(restored.tick - parkedTick).toBeLessThanOrEqual(Math.ceil((Date.now() - resumedAt) / 100) + 1);
    expect(restored.applied.slice(0, before.applied.length)).toEqual(before.applied);
    expect((await spqr.diagnosis()).errors).toEqual([]);
  });

  test(`final practice meets the normal AI through pointer orders at ${size.width}`, async ({ page }) => {
    // The 160×160 theatre costs more CPU under software WebGL. Keep the same
    // 2,000 simulated-tick encounter bound, with room to compute it.
    test.setTimeout(120_000);
    await page.setViewportSize(size);
    await page.goto('/');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
    await entry(page, 'tutorial', false);
    await entry(page, 'siege', false, true);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'practice');
    await page.keyboard.press('Space');
    await recruitTwo(page);
    const row = await page.evaluate(() => window.__SPQR.game!.hudLayout().rows.find((r) => r.selection.kind === 'squad')!.rect);
    await press(page, row);
    await page.evaluate(() => window.__SPQR.view!.zoomTo(1));
    await page.keyboard.press('f');
    const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
    const army = await page.evaluate(() => window.__SPQR.game!.squads());
    const origin = (await page.locator('#app canvas').boundingBox())!;
    const corners = army.map((squad) => ({ from: stageToScreen(camera, squad.rect.x, squad.rect.y),
      to: stageToScreen(camera, squad.rect.x + squad.rect.width, squad.rect.y + squad.rect.height) }));
    await page.mouse.move(origin.x + Math.min(...corners.map((corner) => corner.from.x)) - 4,
      origin.y + Math.min(...corners.map((corner) => corner.from.y)) - 4);
    await page.mouse.down();
    await page.mouse.move(origin.x + Math.max(...corners.map((corner) => corner.to.x)) + 4,
      origin.y + Math.max(...corners.map((corner) => corner.to.y)) + 4, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.__SPQR.game!.selection().squads.length)).toBe(2);
    // Defend against the ordinary AI, pursuing only its current sightings. The
    // larger theatre no longer places the old fixed destination on its route.
    let engaged = false;
    let attacked = false;
    const policy: unknown[] = [];
    for (let index = 0; index < 200 && !engaged; index += 1) {
      let expectedTarget: number | null = null;
      const enemy = await page.evaluate(() => window.__SPQR.game!.state().visible.enemies.find((enemy) => enemy.neutral !== true));
      if (enemy !== undefined) {
        const layout = await page.evaluate(() => window.__SPQR.game!.hudLayout());
        const attack = layout.commands.find((entry) => entry.order.id === 'attack');
        if (attack?.order.enabled) {
          await press(page, attack.rect);
          const at = await revealTile(page, tilePixel(enemy.x, enemy.y));
          await page.mouse.click(origin.x + at.x, origin.y + at.y);
          expectedTarget = enemy.id;
        }
      }
      const watchCombat: boolean = enemy !== undefined || attacked;
      const shown: { readonly engaged: boolean; readonly engagedAt: number | null; readonly attacked: boolean;
        readonly tick: number; readonly own: readonly unknown[]; readonly command: unknown } = await page.evaluate((watchCombat) => {
        const game = window.__SPQR.game!;
        let engagedAt: number | null = null;
        // A short skirmish can begin and end between two ten-tick samples.
        // Once an opponent is sighted, observe every tick while keeping the
        // order cadence and bound. Before contact, avoid ten costly repaints.
        const stride = watchCombat ? 1 : 10;
        for (let tick = 0; tick < 10; tick += stride) {
          game.advance(stride);
          if (game.squads().some((squad) => squad.engaged)) engagedAt ??= game.tick();
        }
        return { engaged: engagedAt !== null, engagedAt,
          attacked: game.applied().some((entry) => entry.command.faction === 'rome' && entry.command.kind === 'attack'),
          tick: game.tick(), own: game.state().visible.squads,
          command: game.applied().filter((entry) => entry.command.faction === 'rome').at(-1)?.command };
      }, watchCombat);
      if (expectedTarget !== null) expect(shown.command).toMatchObject({ kind: 'attack', target: expectedTarget });
      policy.push({ enemy, ...shown });
      engaged = shown.engaged;
      attacked ||= shown.attacked;
      if (engaged) console.log(JSON.stringify({ practice: size.width, engagedAt: shown.engagedAt }));
    }
    if (!engaged) await test.info().attach('practice-policy', { body: JSON.stringify(policy), contentType: 'application/json' });
    expect(attacked).toBe(true);
    expect(engaged).toBe(true);
    await capture(page, `final-encounter-${size.width}`, 'issue70');
    const exit = await page.evaluate(() => window.__SPQR.game!.hudLayout().guideButtons.find((b) => b.action === 'tutorialExit')!.rect);
    await press(page, exit);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'chapters');
  });
}
