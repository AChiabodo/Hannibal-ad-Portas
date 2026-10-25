import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { capture } from './evidence';
import { KNOWLEDGE } from '../src/sim/fog';
import { setupLayout } from '../src/ui/match-menu';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from '../src/render/view';

/** Where setup puts its controls, read from the same layout the page draws. */
const SETUP = setupLayout({ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT + 60 }, {
  config: { seed: 0, faction: 'rome', difficulty: 'centurio' }, proposed: 0, seedText: '', focus: 0, invalid: false,
}, true);
const SEED = SETUP.buttons[2]!.rect;
const START = SETUP.buttons[3]!.rect;

test('the explicit seed field accepts a pasted zero seed', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /conquistare la Roccaforte nemica/);
  await page.evaluate(() => navigator.clipboard.writeText('0'));
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+V');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  expect((await page.evaluate(() => window.__SPQR.game!.configuration())).seed).toBe(0);
});

test('a rules-driven annihilation defeat names the defeated Faction without reversing the reason', async ({ page }) => {
  await page.goto('/e2e/hud-fixture.html');
  await page.evaluate(async () => {
    const bootPath = '/src/render/boot.ts';
    const siegePath = '/src/sim/siege.ts';
    const { bootRenderer } = await import(bootPath);
    const { siegeMatchRules } = await import(siegePath);
    const view = await bootRenderer(document.getElementById('app'), { seed: 7, faction: 'rome',
      rules: { ...siegeMatchRules, createWorld(seed: number) {
        const world = siegeMatchRules.createWorld(seed);
        // A Faction with neither settlement nor Squad is beaten by the existing rules.
        world.economy.settlements[0].owner = -1;
        return world;
      } } });
    window.__SPQR = { boot: { booted: true, render: view.probe }, game: view, view, atelier: null };
  });
  expect(await page.evaluate(() => window.__SPQR.game!.result())).toEqual({ kind: 'victory', winner: 'carthage', tick: 0, reason: { kind: 'annihilation' } });
  const menu = await page.evaluate(() => window.__SPQR.game!.matchLayout());
  expect(menu.lines).toContain('SCONFITTA');
  expect(menu.lines).toContain('La Fazione sconfitta non ha insediamenti né reparti');
});

async function pressMenu(page: Page, action: string): Promise<void> {
  if (!await page.evaluate(() => window.__SPQR.game!.hud().view.sessionOpen)) {
    const open = await page.evaluate(() => window.__SPQR.game!.hudLayout().buttons.find((button) => button.action === 'session')!.rect);
    const canvas = (await page.locator('canvas').boundingBox())!;
    await page.mouse.click(canvas.x + open.x + 8, canvas.y + open.y + 8);
  }
  if (!await page.evaluate((action) => window.__SPQR.game!.matchLayout().buttons.some((b) => b.action === action), action)) {
    const route = await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((b) => b.action === 'back' || b.action === 'settings')!.action);
    await pressMenu(page, route);
  }
  const rect = await page.evaluate((wanted) => window.__SPQR.game!.matchLayout().buttons.find((button) => button.action === wanted)!.rect, action);
  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + rect.x + 8, box.y + rect.y + 8);
}

async function openMatch(page: Page, faction = 'rome', seed = 7): Promise<void> {
  await page.goto(`/?play=1&seed=${String(seed)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => window.__SPQR.game!.pause());
}

test('keyboard setup selects Carthage, difficulty and an explicit seed; restart preserves them', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('7');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => window.__SPQR.game!.pause());
  expect(await page.evaluate(() => window.__SPQR.game!.configuration())).toEqual({ seed: 7, faction: 'carthage', difficulty: 'imperator' });
  page.once('dialog', (dialog) => { void dialog.dismiss(); });
  await page.keyboard.press('F2');
  expect(await page.evaluate(() => window.__SPQR.game!.configuration())).toEqual({ seed: 7, faction: 'carthage', difficulty: 'imperator' });
  expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(true);
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.keyboard.press('F2');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  expect(await page.evaluate(() => window.__SPQR.game!.configuration())).toEqual({ seed: 7, faction: 'carthage', difficulty: 'imperator' });
});

test('pointer setup, invalid and empty seeds, copy, pacing, pause and fresh New Match', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  const box = (await page.locator('canvas').boundingBox())!;
  // The visible seed field; typing replaces its proposed value.
  await page.mouse.click(box.x + 80, box.y + SEED.y + Math.floor(SEED.height / 2));
  await page.keyboard.type('4294967296');
  await expect(page.locator('canvas')).toHaveAttribute('aria-label', /Inserisci un intero/);
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('Backspace');
  await page.mouse.click(box.x + 80, box.y + START.y + Math.floor(START.height / 2));
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => window.__SPQR.game!.pause());
  const config = await page.evaluate(() => window.__SPQR.game!.configuration());
  expect(config.seed).toBeGreaterThanOrEqual(0);
  expect(config.seed).toBeLessThanOrEqual(4294967295);
  await pressMenu(page, 'copy');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(String(config.seed));
  for (const speed of [1, 2, 3]) {
    await pressMenu(page, `speed${String(speed)}`);
    expect(await page.evaluate(() => window.__SPQR.game!.speed())).toBe(speed);
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  const tick = await page.evaluate(() => window.__SPQR.game!.tick());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__SPQR.game!.tick())).toBe(tick);
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__SPQR.game!.tick())).toBeGreaterThan(tick);
  await page.keyboard.press('Space');
  await pressMenu(page, 'new');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  page.once('dialog', (dialog) => { void dialog.accept(); });
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  expect((await page.evaluate(() => window.__SPQR.game!.configuration())).seed).not.toBe(config.seed);
});

for (const faction of ['rome', 'carthage'] as const) {
  for (const width of [1280, 1920]) {
    test(`real rules, human submission, final knowledge and bitmap controls: ${faction} at ${String(width)}`, async ({ page, spqr }) => {
      await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
      await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
      await capture(page, `setup-${String(width)}`, 'issue64');
      await openMatch(page, faction);
      expect(await page.title()).toContain('Annibale');
      const initial = await page.evaluate(() => window.__SPQR.game!.state());
      expect(initial.visible.squads).toEqual([]);
      expect(initial.visible.fronts).toHaveLength(1);
      expect(initial.visible.settlements).toHaveLength(1);
      const home = faction === 'rome' ? 0 : 1;
      await page.evaluate(({ side, settlement }) => {
        window.__SPQR.game!.submit({ kind: 'build', faction: side, settlement, building: 'farm' });
        window.__SPQR.game!.submit({ kind: 'recruit', faction: side, settlement, squadType: side === 'rome' ? 'hastati' : 'gaul', men: 24, count: 1 });
        window.__SPQR.game!.advance(1);
        window.__SPQR.game!.select({ kind: 'settlement', id: settlement });
      }, { side: faction, settlement: home });
      const commanded = await page.evaluate(() => window.__SPQR.game!.state());
      expect(commanded.visible.squads).toHaveLength(1);
      expect(commanded.applied.every(({ command }) => command.faction === faction)).toBe(true);
      await capture(page, `${faction}-${String(width)}-construction`, 'issue64');
      const scouted = await page.evaluate(() => {
        const game = window.__SPQR.game!;
        const snapshot = game.state();
        const squad = snapshot.visible.squads[0]!;
        // Scout to known walkable ground at the edge of the settlement's watch,
        // then return. Memory is produced by actual movement, never a reveal hook.
        const index = snapshot.visible.fog.terrain.findIndex((terrain, at) => {
          const dx = at % 96 - squad.x;
          const dy = Math.floor(at / 96) - squad.y;
          return terrain !== 255 && terrain !== 4 && dx * dx + dy * dy >= 49 && dx * dx + dy * dy <= 64;
        });
        if (index < 0) throw new Error('the known watch has no walkable frontier');
        game.submit({ kind: 'move', faction: snapshot.faction, squads: [squad.id], x: index % 96, y: Math.floor(index / 96) });
        game.advance(300);
        game.submit({ kind: 'move', faction: snapshot.faction, squads: [squad.id], x: squad.x, y: squad.y });
        game.advance(300);
        game.select({ kind: 'squad', id: squad.id });
        return game.state();
      });
      expect(scouted.knowledge).toContain(KNOWLEDGE.remembered);
      expect(scouted.knowledge).toContain(KNOWLEDGE.visible);
      expect(scouted.knowledge).toContain(KNOWLEDGE.unexplored);
      for (let zoom = 1; zoom <= 8; zoom += 1) {
        await page.evaluate((value) => window.__SPQR.view!.zoomTo(value), zoom);
        await capture(page, `${faction}-${String(width)}-zoom${String(zoom)}`, 'issue64');
      }

      // Compose a genuine Siege scenario through the public rules adapter, not an outcome hook.
      await page.goto('/e2e/hud-fixture.html');
      await page.evaluate(async (side) => {
        const bootPath = '/src/render/boot.ts';
        const siegePath = '/src/sim/siege.ts';
        const movePath = '/src/sim/movement.ts';
        const controllerPath = '/src/sim/controller.ts';
        const { bootRenderer } = await import(bootPath);
        const { siegeMatchRules } = await import(siegePath);
        const { musterSquad } = await import(movePath);
        const { scriptedController } = await import(controllerPath);
        const command = { kind: 'assault', faction: 'rome', squads: [1], settlement: 1 };
        const rules = { ...siegeMatchRules, createWorld(seed: number) {
          const world = siegeMatchRules.createWorld(seed);
          const target = world.economy.settlements[1];
          musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'principes', x: target.x, y: target.y });
          for (const structure of world.siege.fronts[1].structures) structure.hp = 0;
          return world;
        } };
        const view = await bootRenderer(document.getElementById('app'), { seed: 7, faction: side, rules,
          opponent: scriptedController(side === 'carthage' ? [{ tick: 0, command }] : []) });
        window.__SPQR = { boot: { booted: true, render: view.probe }, game: view, view, atelier: null };
        view.pause();
        if (side === 'rome') view.submit(command);
        view.advance(101);
      }, faction);
      const ended = await page.evaluate(() => window.__SPQR.game!.state());
      expect(ended.result).toEqual({ kind: 'victory', winner: 'rome', tick: 101,
        reason: { kind: 'stronghold', stronghold: 1, path: 'assault' } });
      expect((await page.evaluate(() => window.__SPQR.game!.matchLayout())).lines).toContain(faction === 'rome' ? 'VITTORIA' : 'SCONFITTA');
      expect((await page.evaluate(() => window.__SPQR.game!.matchLayout())).buttons.filter(({ action }) => action.startsWith('speed')).every(({ enabled }) => !enabled)).toBe(true);
      expect((await page.evaluate(() => window.__SPQR.game!.hudLayout())).text.some(({ text }) => text.startsWith('CONCLUSA'))).toBe(true);
      await page.keyboard.press('Space');
      await pressMenu(page, 'speed3');
      await page.evaluate(() => {
        window.__SPQR.view!.inspect(true);
        window.__SPQR.view!.lookFrom(48, 48);
        window.__SPQR.game!.select({ kind: 'settlement', id: 0 });
        window.__SPQR.view!.panBy(10, 10);
      });
      await page.waitForTimeout(300);
      const inspected = await page.evaluate(() => window.__SPQR.game!.state());
      expect(inspected.tick).toBe(101);
      expect(inspected.paused).toBe(true);
      expect(inspected.hash).toBe(ended.hash);
      expect(inspected.knowledge).toEqual(ended.knowledge);
      expect(await page.evaluate(() => window.__SPQR.view!.describe().inspection)).toBe(false);
      expect(inspected.knowledge).toContain(KNOWLEDGE.unexplored);
      await capture(page, `${faction}-${String(width)}-ended`, 'issue64');
      let dialogs = 0;
      page.on('dialog', (dialog) => { dialogs += 1; void dialog.accept(); });
      await pressMenu(page, 'new');
      await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
      await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
      expect(dialogs).toBe(0);
      const diagnosis = await spqr.diagnosis();
      expect(diagnosis.errors).toEqual([]);
      expect(diagnosis.console.filter((line) => line.startsWith('[error]'))).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });
  }
}

test('the clock bound is announced persistently from the actual MatchResult', async ({ page }) => {
  await page.goto('/e2e/hud-fixture.html');
  await page.evaluate(async () => {
    const bootPath = '/src/render/boot.ts';
    const controllerPath = '/src/sim/controller.ts';
    const { bootRenderer } = await import(bootPath);
    const { idleController } = await import(controllerPath);
    const view = await bootRenderer(document.getElementById('app'), { seed: 7, opponent: idleController() });
    window.__SPQR = { boot: { booted: true, render: view.probe }, view, game: view, atelier: null };
    view.pause();
    view.fastForward();
  });
  const ended = await page.evaluate(() => window.__SPQR.game!.state());
  expect(ended.result).toEqual({ kind: 'clock', tick: 25200 });
  expect((await page.evaluate(() => window.__SPQR.game!.matchLayout())).lines).toContain('Conclusi i tre anni della partita');
  await capture(page, 'clock-ended', 'issue64');
  await page.keyboard.press('F2');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  expect(await page.evaluate(() => window.__SPQR.game!.configuration())).toEqual({ seed: 7, faction: 'rome', difficulty: 'centurio' });
});
