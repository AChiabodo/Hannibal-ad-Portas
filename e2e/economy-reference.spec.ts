/** #69 interaction/render samples. Run only on an explicit Chromium request. */
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { advance, applied, dismissFirstEntry, hud, hudLayout, hudRows, press, selection } from './hooks';
import { forecastTreasury, projectSettlement } from '../src/ui/forecast';
import { SEASON_TICKS } from '../src/sim/season';

for (const faction of ['rome', 'carthage'] as const) {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`economic decisions and reference return: ${faction} ${size.width}`, async ({ page }) => {
      await dismissFirstEntry(page);
      await page.setViewportSize(size);
      // A seasonal economic forecast assumes no intervening orders or siege.
      // The real opponent is measured separately by #71's paced Match matrix.
      await page.goto('/e2e/hud-fixture.html');
      await page.evaluate(async (side) => {
        const bootPath = '/src/render/boot.ts', controllerPath = '/src/sim/controller.ts';
        const { bootRenderer } = await import(bootPath);
        const { idleController } = await import(controllerPath);
        const view = await bootRenderer(document.getElementById('app')!, { seed: 7, faction: side, opponent: idleController() });
        view.pause();
        window.__SPQR = { boot: { booted: true, render: view.probe }, game: view, view, atelier: null };
      }, faction);
      const button = async (action: string) => {
        const control = (await hudLayout(page)).buttons.find((item) => item.action === action);
        expect(control, action).toBeDefined();
        await press(page, control!.rect);
      };
      const offer = async (id: string) => {
        for (let attempt = 0; attempt < 12; attempt += 1) {
          const layout = await hudLayout(page);
          const control = layout.commands.find((item) => item.order.id === id);
          if (control) return control;
          const next = layout.buttons.find((item) => item.action === 'commandsNext' && item.enabled);
          if (!next) break;
          await press(page, next.rect);
        }
        throw new Error(`Offer unreachable: ${id}`);
      };
      await press(page, (await hudRows(page)).find((row) => row.selection.kind === 'settlement')!.rect);
      const picked = await selection(page);
      await press(page, (await hudLayout(page)).tabs.find((tab) => tab.tab === 'construction')!.rect);
      await button('category:development');
      expect((await hud(page)).commands.map((item) => item.subject)).toEqual(['house', 'villa', 'forum']);
      const forum = await offer('build:forum');
      expect(forum.order.enabled).toBe(false);
      await page.mouse.move(forum.rect.x + forum.rect.width / 2, forum.rect.y + forum.rect.height / 2);
      await press(page, forum.rect);
      expect((await hud(page)).view.inspectedOrder).toBe('build:forum');
      await button('purchase:build:forum');
      expect((await hud(page)).orders.notice).toContain(forum.order.reason);
      expect((await hud(page)).orders.notice).toContain(forum.order.label);
      expect((await hud(page)).orders.pending).toBe(0);
      await capture(page, `locked-${faction}-${size.width}`, 'issue69');

      // The contextual link opens the exact locked entry; it never buys it.
      await button('reference:building:forum');
      expect(await page.evaluate(() => window.__SPQR.game!.reference()?.entry)).toBe('building:forum');
      const pausedHash = await page.evaluate(() => window.__SPQR.game!.hash());
      for (let tab = 0; tab < 5; tab += 1) await page.keyboard.press('Tab');
      await page.keyboard.press('ArrowDown');
      const entryAfterArrow = await page.evaluate(() => window.__SPQR.game!.reference()!.entry);
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => window.__SPQR.game!.reference()!.entry)).toBe(entryAfterArrow);
      await page.keyboard.press('PageDown');
      await page.keyboard.press('Tab');
      await capture(page, `reference-${faction}-${size.width}`, 'issue69');
      await page.keyboard.press('Escape');
      expect(await page.evaluate(() => window.__SPQR.game!.reference())).toBeNull();
      expect(await page.evaluate(() => window.__SPQR.game!.hash())).toBe(pausedHash);
      expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(true);
      expect(await selection(page)).toEqual(picked);

      await button('category:production');
      const farm = await offer('build:farm');
      expect(farm.order.enabled).toBe(true);
      await press(page, farm.rect);
      await button('purchase:build:farm');
      expect((await hud(page)).orders.pending).toBe(1);
      await advance(page, 1);
      expect((await applied(page)).some(({ command }) => command.kind === 'build' && command.building === 'farm')).toBe(true);
      await capture(page, `construction-${faction}-${size.width}`, 'issue69');

      // A running Match resumes after pointer return; F1 is also a normal entry.
      await page.evaluate(() => window.__SPQR.game!.resume());
      await page.keyboard.press('F1');
      expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(true);
      const close = await page.evaluate(() => window.__SPQR.game!.referenceLayout()!.controls.find((item) => item.id === 'close')!);
      await press(page, close.rect);
      expect(await page.evaluate(() => window.__SPQR.game!.paused())).toBe(false);
      await page.evaluate(() => window.__SPQR.game!.pause());

      // Read the forecast immediately before the real boundary, after the farm stands.
      const tick = await page.evaluate(() => window.__SPQR.game!.tick());
      await advance(page, SEASON_TICKS - 1 - tick);
      const before = await page.evaluate(() => window.__SPQR.game!.state().visible);
      const forecast = forecastTreasury(before, SEASON_TICKS - 1);
      expect(forecast.available).toBe(true);
      if (!forecast.available) throw new Error('Expected a derivable stable boundary');
      const projection = projectSettlement(before.settlements[0]!, forecast.value.season);
      expect((await hud(page)).forecast?.value).toContain(`${forecast.value.resulting} denari`);
      await advance(page, 1);
      const after = await page.evaluate(() => window.__SPQR.game!.state().visible);
      expect(after.treasury).toBe(forecast.value.resulting);
      expect(after.settlements[0]!.stocks).toEqual(projection.stocks);
      expect(await selection(page)).toEqual(picked);
    });
  }
}
