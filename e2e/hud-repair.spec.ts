import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import { hudLayout, hudModel, type HudModel } from '../src/ui/hud';
import { economyMatchRules, observeEconomy } from '../src/sim/economy-match';
import { musterSquad } from '../src/sim/movement';
import { buildingCode } from '../src/content';
import type { Faction } from '../src/sim/faction';

const EVIDENCE = join(tmpdir(), 'spqr-issue52');

test('an overflowing live list keeps selection through wheel, page keys, buttons and hooks', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/e2e/hud-fixture.html');
  // The public game composition accepts a size. A short test canvas makes the
  // real opening roster overflow, without adding a scenario/Command backdoor.
  await page.evaluate(async () => {
    const stagePath = '/src/render/stage.ts';
    const gamePath = '/src/render/game.ts';
    const controlsPath = '/src/render/controls.ts';
    const mapPath = '/src/sim/map.ts';
    const fogPath = '/src/sim/fog.ts';
    const { createStage, frameReport } = await import(stagePath);
    const { createGame } = await import(gamePath);
    const siegePath = '/src/sim/siege.ts';
    const openingPath = '/src/render/opening.ts';
    const controllerPath = '/src/sim/controller.ts';
    const { siegeMatchRules } = await import(siegePath);
    const { musterOpeningArmy } = await import(openingPath);
    const { idleController } = await import(controllerPath);
    const { bindControls } = await import(controlsPath);
    const { generateMap } = await import(mapPath);
    const { createFog, viewOf, refreshVision } = await import(fogPath);
    const size = { width: 640, height: 320 };
    const stage = await createStage(document.getElementById('app'), { ...size, background: [20, 17, 13, 255] });
    const map = generateMap(7);
    const fog = createFog();
    const game = createGame({ stage, seed: 7, size, world: stage.root,
      sessionControls: false, opponent: idleController(),
      rules: { ...siegeMatchRules, createWorld(seed: number) {
        const world = siegeMatchRules.createWorld(seed);
        musterOpeningArmy(world, 'rome');
        return world;
      } },
      camera: () => ({ x: 0, y: 0, zoom: 2 }), viewport: () => ({ x: 0, y: 0, ...size }),
      fog: () => viewOf(fog), vision: (eyes: unknown) => refreshVision(fog, map, eyes),
    });
    game.hooks.pause();
    bindControls(stage, { ...game.hooks, zoom: () => 2, panBy: () => {}, zoomAbout: () => {},
      clearSelection: () => game.hooks.select(null),
      togglePause: () => game.hooks.paused() ? game.hooks.resume() : game.hooks.pause(),
    });
    window.__SPQR = { boot: { booted: true, render: frameReport(stage) }, game: game.hooks, view: null, atelier: null };
  });
  const getLayout = () => page.evaluate(() => window.__SPQR.game!.hudLayout());
  const first = await getLayout();
  expect(first.listScroll.max).toBeGreaterThan(0);
  await page.evaluate(() => window.__SPQR.game!.select({ kind: 'squad', id: 1 }));
  const hash = await page.evaluate(() => window.__SPQR.game!.hash());
  const box = (await page.locator('#app canvas').boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + first.list.y + 40);
  await page.mouse.wheel(0, 240);
  await expect.poll(async () => (await getLayout()).listScroll.offset).toBeGreaterThan(0);
  await page.keyboard.press('PageUp');
  expect((await getLayout()).listScroll.offset).toBe(0);
  await page.keyboard.press('a');
  const down = first.buttons.find((button) => button.action === 'listNext')!;
  await page.mouse.click(box.x + down.rect.x + 8, box.y + down.rect.y + 8);
  expect((await getLayout()).listScroll.offset).toBeGreaterThan(0);
  await page.keyboard.press('PageDown');
  expect((await getLayout()).listScroll.offset).toBe(first.listScroll.max);
  expect(await page.evaluate(() => window.__SPQR.game!.selection().squads)).toEqual([1]);
  expect(await page.evaluate(() => window.__SPQR.game!.hash())).toBe(hash);
  await page.evaluate(() => window.__SPQR.game!.scrollHud('list', -999));
  expect((await getLayout()).listScroll.offset).toBe(0);
  await page.evaluate(() => window.__SPQR.game!.scrollHud('list', 999));
  await page.keyboard.press('Escape');
  const last = (await getLayout()).rows.at(-1)!;
  await page.mouse.click(box.x + last.rect.x + 4, box.y + last.rect.y + 2);
  expect(await page.evaluate(() => window.__SPQR.game!.selection().squads)).toEqual([last.selection.id]);
});

for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
  test(`pause and secondary scrolling share pointer, keyboard and hooks at ${viewport.width}`, async ({ page, spqr }) => {
    await page.setViewportSize(viewport);
    await page.goto('/e2e/game-fixture.html');
    await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
    await expect(page).toHaveTitle('SPQR — Annibale alle porte');
    await page.evaluate(() => window.__SPQR.game!.pause());
    const box = (await page.locator('#app canvas').boundingBox())!;
    const getLayout = () => page.evaluate(() => window.__SPQR.game!.hudLayout());
    const getHash = () => page.evaluate(() => window.__SPQR.game!.hash());
    const pausedHash = await getHash();
    expect((await getLayout()).text.map((line) => line.text)).toContain('IN PAUSA');
    await page.evaluate(() => window.__SPQR.game!.select({ kind: 'squad', id: 1 }));
    const initial = await getLayout();
    expect(initial.detailScroll.max).toBeGreaterThan(0);
    const priority = initial.priority;
    await page.mouse.move(box.x + 40, box.y + initial.detail.y + 50);
    const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
    await page.mouse.wheel(0, 240);
    await expect.poll(async () => (await getLayout()).detailScroll.offset).toBeGreaterThan(0);
    expect((await getLayout()).priority).toEqual(priority);
    expect(await page.evaluate(() => window.__SPQR.view!.describe().camera)).toEqual(camera);
    await page.keyboard.press('Shift+PageUp');
    expect((await getLayout()).detailScroll.offset).toBe(0);
    const down = initial.buttons.find((button) => button.action === 'detailNext')!;
    await page.keyboard.press('a');
    await page.mouse.click(box.x + down.rect.x + 8, box.y + down.rect.y + 8);
    expect((await getLayout()).detailScroll.offset).toBeGreaterThan(0);
    await page.evaluate(() => window.__SPQR.game!.scrollHud('detail', -999));
    expect((await getLayout()).detailScroll.offset).toBe(0);
    await page.mouse.click(box.x + initial.detail.x + 4, box.y + initial.detail.y + 2);
    expect(await page.evaluate(() => window.__SPQR.game!.selection().squads)).toEqual([1]);
    expect(await getHash()).toBe(pausedHash);
    await mkdir(EVIDENCE, { recursive: true });
    await page.screenshot({ path: join(EVIDENCE, `live-paused-${viewport.width}.png`) });
    const pause = initial.buttons.find((button) => button.action === 'pause')!;
    await page.keyboard.press('a');
    await page.mouse.click(box.x + pause.rect.x + 8, box.y + pause.rect.y + 8);
    expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(false);
    expect((await getLayout()).text.map((line) => line.text)).toContain('IN CORSO');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(true);
    expect((await getLayout()).text.map((line) => line.text)).toContain('IN PAUSA');
    await page.evaluate(() => window.__SPQR.game!.resume());
    expect((await getLayout()).text.map((line) => line.text)).toContain('IN CORSO');
    await page.keyboard.press('Space');
    const diagnosis = await spqr.diagnosis();
    expect(diagnosis.errors).toEqual([]);
    expect(diagnosis.console.filter((line) => /^\[(error|warn)\]/.test(line))).toEqual([]);
    expect(await page.locator('vite-error-overlay').count()).toBe(0);
  });

  for (const faction of ['rome', 'carthage'] as const) {
    for (const desktop of [false, true]) test(`${desktop ? 'desktop ' : ''}rendered refused Order, active Work and overflowing list: ${faction} at ${viewport.width}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/e2e/game-fixture.html');
      await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
      await page.evaluate(() => window.__SPQR.game!.pause());
      for (const kind of ['squad', 'settlement'] as const) {
        const source = scene(faction, kind);
        const model = { ...source, view: { ...source.view, desktop, uiScale: 2 } };
        const size = desktop ? viewport : { width: 640, height: 480 };
        const layout = hudLayout(model, size);
        expect(layout.listScroll.offset).toBeGreaterThan(0);
        expect(layout.rows.at(-1)!.selection).toEqual({ kind: 'squad', id: 80 });
        expect(layout.priority.map((line) => line.text).join(' ')).toContain(kind === 'squad'
          ? 'Ordine: Acque profonde' : 'Cantieri: Villa - In costruzione 123456789 tick');
        // Fixture rendering uses exactly the production PixelBuffer/Pixi adapter.
        // It supplies a filtered model, never a hidden-world rendering hook.
        await page.evaluate(async ({ model, size }: { model: HudModel; size: { width: number; height: number } }) => {
          const stagePath = '/src/render/stage.ts';
          const hudPath = '/src/render/hud.ts';
          const { createStage } = await import(stagePath);
          const { createHudLayer } = await import(hudPath);
          const mount = document.getElementById('app')!;
          mount.replaceChildren();
          const stage = await createStage(mount, { ...size, background: [20, 17, 13, 255] });
          const layer = createHudLayer(stage);
          layer.panels(model, size);
          stage.render();
        }, { model, size });
        await mkdir(EVIDENCE, { recursive: true });
        await page.screenshot({ path: join(EVIDENCE, `${desktop ? 'desktop-' : ''}${faction}-${kind}-${viewport.width}.png`) });
      }
    });
  }
}

/** Scenario-only state is filtered by the real Observation before becoming HUD data. */
function scene(faction: Faction, kind: 'squad' | 'settlement'): HudModel {
  const world = economyMatchRules.createWorld(7);
  const home = world.economy.settlements.find((settlement) => settlement.owner === (faction === 'rome' ? 0 : 1))!;
  home.works.push({ building: buildingCode('villa')!, remaining: 123456789 });
  for (let index = 0; index < 80; index += 1) {
    musterSquad(world.economy, world.map, {
      faction, squadType: faction === 'rome' ? 'hastati' : 'libyan-spear', x: home.x, y: home.y,
    });
  }
  const visible = observeEconomy(world, faction);
  const squads = visible.squads.map((squad) => ({ ...squad, refused: 'water' as const }));
  return hudModel({ ...visible, squads }, [home.id], { kind, id: kind === 'squad' ? 80 : home.id }, [80],
    { paused: true, listOffset: 99999 });
}
