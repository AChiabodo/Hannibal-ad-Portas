import { expect, test } from './fixtures';
import { capture } from './evidence';
import { advance, applied, describeView, hud, hudLayout, hudRows, hudRects, selection, squads } from './hooks';
import { generateMap, isWalkable, terrainAt } from '../src/sim/map';
import { tilePixel } from '../src/render/terrain';

for (const faction of ['rome', 'carthage'] as const) {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    test(`normal group gestures and separate arrivals: ${faction} ${size.width}`, async ({ page, spqr }) => {
      await page.setViewportSize(size);
      await page.goto(`/?play=1&seed=7&faction=${faction}&difficulty=tiro`);
      await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
      await page.evaluate(() => { window.__SPQR.game!.pause(); window.__SPQR.view!.zoomTo(1); });
      const origin = (await page.locator('canvas').boundingBox())!;
      const press = async (r: { x: number; y: number; width: number; height: number }) =>
        page.mouse.click(origin.x + r.x + r.width / 2, origin.y + r.y + r.height / 2);
      const row = (await hudRows(page)).find((r) => r.selection.kind === 'settlement')!;
      await press(row.rect);
      await press((await hudLayout(page)).tabs.find((t) => t.tab === 'recruitment')!.rect);
      await press((await hudLayout(page)).buttons.find((b) => b.action === 'recruitMore')!.rect);
      const type = faction === 'rome' ? 'hastati' : 'gaul';
      const card = (await hudLayout(page)).commands.find((c) => c.order.id === `recruit:${type}:24`)!;
      expect(card.order.enabled).toBe(true);
      await press(card.rect);
      await press((await hudLayout(page)).buttons.find((b) => b.action === `purchase:recruit:${type}:24`)!.rect);
      await page.evaluate(() => window.__SPQR.game!.resume());
      await advance(page, 1);
      await page.evaluate(() => window.__SPQR.game!.pause());
      expect(await squads(page)).toHaveLength(2);
      // Centre the real recruited army through the ordinary camera surface.
      const army = await squads(page);
      const before = await describeView(page);
      const x = Math.round(army[0]!.rect.x - size.width / 2);
      const y = Math.round(army[0]!.rect.y - size.height / 2);
      await page.evaluate(({ dx, dy }) => window.__SPQR.view!.panBy(dx, dy),
        { dx: x - before.camera.x, dy: y - before.camera.y });
      const view = await describeView(page);
      let panels = await hudRects(page);
      const screen = (x: number, y: number) => ({ x: (x - view.camera.x) * view.camera.zoom,
        y: (y - view.camera.y) * view.camera.zoom });
      const open = (point: { x: number; y: number }) => point.x > 10 && point.y > 50 &&
        point.x < size.width - 10 && point.y < size.height - 10 &&
        !panels.some((r) => point.x >= r.x && point.x < r.x + r.width && point.y >= r.y && point.y < r.y + r.height);
      const visible = (await squads(page)).map((s) => ({ squad: s,
        at: screen(s.rect.x + s.rect.width / 2, s.rect.y + s.rect.height / 2) })).filter(({ at }) => open(at));
      expect(visible.length).toBeGreaterThanOrEqual(2);
      const first = visible[0]!;
      const second = visible[1]!;
      await page.mouse.move(origin.x + Math.min(first.at.x, second.at.x) - 20,
        origin.y + Math.min(first.at.y, second.at.y) - 20);
      await page.mouse.down();
      await page.mouse.move(origin.x + Math.max(first.at.x, second.at.x) + 20,
        origin.y + Math.max(first.at.y, second.at.y) + 20, { steps: 5 });
      await page.mouse.up();
      const picked = (await selection(page)).squads;
      expect(picked).toContain(first.squad.id);
      expect(picked).toContain(second.squad.id);
      await page.keyboard.press('Control+1');
      panels = await hudRects(page);

      const map = generateMap(7);
      const target = Array.from({ length: 12 }, (_, i) => 5 + i)
        .flatMap((distance) => [{ x: first.squad.x + distance, y: first.squad.y }, { x: first.squad.x - distance, y: first.squad.y },
          { x: first.squad.x, y: first.squad.y + distance }, { x: first.squad.x, y: first.squad.y - distance }])
        .find((p) => p.x >= 0 && p.y >= 0 && p.x < 96 && p.y < 96 && isWalkable(terrainAt(map, p.x, p.y)) && open(screen(tilePixel(p.x, p.y).x, tilePixel(p.x, p.y).y)));
      expect(target).toBeDefined();
      const targetPixel = tilePixel(target!.x, target!.y);
      const click = screen(targetPixel.x, targetPixel.y);
      await page.mouse.click(origin.x + click.x, origin.y + click.y, { button: 'right' });
      expect((await hud(page)).orders.pending).toBeGreaterThan(0);
      await page.keyboard.press('a');
      expect((await hud(page)).orders.armed?.id).toBe('attackMove');
      await page.mouse.click(origin.x + click.x, origin.y + click.y);
      expect((await selection(page)).squads).toEqual(picked);
      await capture(page, `pending-${faction}-${size.width}`, 'issue68');
      await page.evaluate(() => window.__SPQR.game!.resume());
      await advance(page, 1);
      await page.evaluate(() => window.__SPQR.game!.pause());
      expect((await applied(page)).map((entry) => entry.command.kind)).toEqual(expect.arrayContaining(['move', 'attackMove', 'group']));
      const ordered = (await squads(page)).filter((s) => picked.includes(s.id));
      expect(ordered.every((s) => s.refused === null)).toBe(true);
      const goals = ordered.map((s) => s.goal ?? { x: s.x, y: s.y });
      expect(new Set(goals.map((p) => `${p.x},${p.y}`)).size).toBe(picked.length);
      await page.evaluate(() => window.__SPQR.game!.resume());
      await advance(page, 180);
      await page.evaluate(() => window.__SPQR.game!.pause());
      const arrived = (await squads(page)).filter((s) => picked.includes(s.id));
      expect(arrived.map((s) => ({ x: s.x, y: s.y }))).toEqual(goals);
      expect(arrived.every((s) => s.goal === null)).toBe(true);
      expect((await hud(page)).orders.last?.status).toBe('applied');
      await press((await hudRows(page)).find((entry) => entry.selection.kind === 'settlement')!.rect);
      expect((await selection(page)).squads).toEqual([]);
      await page.keyboard.press('1');
      expect((await selection(page)).squads).toEqual(picked);
      for (const s of arrived) {
        expect(open(screen(s.rect.x + s.rect.width / 2, s.rect.y + s.rect.height / 2))).toBe(true);
      }
      for (const [i, s] of arrived.entries()) for (const other of arrived.slice(i + 1)) {
        expect(s.rect.x + s.rect.width <= other.rect.x || other.rect.x + other.rect.width <= s.rect.x ||
          s.rect.y + s.rect.height <= other.rect.y || other.rect.y + other.rect.height <= s.rect.y).toBe(true);
      }
      await page.keyboard.press('f');
      await capture(page, `arrival-${faction}-${size.width}`, 'issue68');
      const diagnosis = await spqr.diagnosis();
      expect(diagnosis.errors).toEqual([]);
      expect(diagnosis.console.filter((line) => line.startsWith('[error]'))).toEqual([]);
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    });
  }
}
