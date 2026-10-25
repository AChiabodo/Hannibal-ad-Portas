/** #71: ordinary pacing and real inputs; never advance/fastForward the Match. */
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { capture } from './evidence';
import { dismissFirstEntry, hudLayout, press, state, describeView, hudRects } from './hooks';
import { PRESSURE_LIMITS } from '../src/cli/pressure';
import type { SiegeVisible } from '../src/sim/siege';
import type { Faction } from '../src/sim/faction';
import { stageToScreen } from '../src/render/camera';
import { tilePixel } from '../src/render/terrain';
import { SEASON_TICKS } from '../src/sim/season';

async function button(page: Page, action: string) {
  const drawn = (await hudLayout(page)).buttons.find((entry) => entry.action === action);
  expect(drawn, action).toBeDefined();
  await press(page, drawn!.rect);
}
async function pace(page: Page) {
  await page.keyboard.press('Escape');
  await press(page, await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((entry) => entry.action === 'settings')!.rect));
  await press(page, await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((entry) => entry.action === 'speed3')!.rect));
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  expect((await state(page)).speed).toBe(3);
}
async function pause(page: Page, paused: boolean) {
  if ((await state(page)).paused !== paused) await page.keyboard.press('Space');
  expect((await state(page)).paused).toBe(paused);
}
async function contact(page: Page, name: string) {
  await expect.poll(async () => (await state(page)).visible.enemies.length, { timeout: 120_000, intervals: [250] }).toBeGreaterThan(0);
  await pause(page, true);
  const observed = await state(page);
  const notice = observed.notices.find((entry) => entry.kind === 'contact');
  expect(notice?.target).toBeTruthy();
  await button(page, 'notices');
  const row = (await hudLayout(page)).noticeRows.find((entry) => entry.id === notice!.id);
  expect(row).toBeDefined();
  await press(page, row!.rect);
  const troopPixels = await page.evaluate(() => {
    const game = window.__SPQR.game!, view = window.__SPQR.view!;
    const enemy = game.state().visible.enemies[0]!;
    const camera = view.describe().camera;
    const points: [number, number][] = [];
    for (let y = -20; y <= 20; y += 4) for (let x = -20; x <= 20; x += 4) {
      points.push([Math.round((enemy.x * 16 + 8 + x - camera.x) * camera.zoom), Math.round((enemy.y * 16 + 8 + y - camera.y) * camera.zoom)]);
    }
    const drawn = view.samples(points);
    game.showSquads(false);
    const ground = view.samples(points);
    game.showSquads(true);
    return drawn.filter((pixel, index) => pixel.some((channel, component) => channel !== ground[index]![component])).length;
  });
  expect(troopPixels, 'currently sighted troops contribute actual pixels to the theatre').toBeGreaterThan(0);
  await capture(page, `contact-${name}`, 'issue71');
  await button(page, 'notices');
  return { tick: observed.tick, notice, troopPixels };
}
function pressure(before: SiegeVisible, after: SiegeVisible, faction: Faction): string | null {
  for (const front of after.fronts) {
    const home = after.settlements.find((site) => site.id === front.settlement);
    if (!home) continue;
    const previous = before.fronts.find((entry) => entry.settlement === front.settlement);
    if (previous && front.structures.some((wall, index) => wall.hp < previous.structures[index]!.hp)) return 'wall-damage';
    if (front.siege === 'blockade' && front.besieger !== faction && after.enemies.some((squad) =>
      Math.max(Math.abs(squad.x - home.x), Math.abs(squad.y - home.y)) <= 1)) return 'occupied-blockade';
  }
  return null;
}

for (const faction of ['rome', 'carthage'] as const) for (const difficulty of ['tiro', 'centurio', 'imperator'] as const) {
  test(`paced visible pressure ${faction} ${difficulty}`, async ({ page, spqr }, info) => {
    test.setTimeout(180_000);
    const width = difficulty === 'centurio' ? 1920 : 1280;
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : 720 });
    await dismissFirstEntry(page);
    await page.goto(`/?play=1&seed=1&faction=${faction}&difficulty=${difficulty}`);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await pace(page);
    const started = Date.now(), name = `${faction}-${difficulty}-${width}`;
    const seen = await contact(page, name);
    const contactWallSeconds = (Date.now() - started) / 1000;
    expect(seen.tick).toBeLessThanOrEqual(PRESSURE_LIMITS[difficulty].contact * 600);
    let before = (await state(page)).visible;
    await pause(page, false);
    let effect: string | null = null;
    await expect.poll(async () => {
      const current = await state(page);
      effect = pressure(before, current.visible, faction);
      before = current.visible;
      return effect;
    }, { timeout: 120_000, intervals: [250] }).not.toBeNull();
    await pause(page, true);
    const final = await state(page);
    expect(final.tick).toBeLessThanOrEqual(PRESSURE_LIMITS[difficulty].pressure * 600);
    const home = (await hudLayout(page)).rows.find((entry) => entry.selection.kind === 'settlement')!;
    await press(page, home.rect);
    await page.keyboard.press('f');
    await button(page, 'notices');
    await capture(page, `pressure-${name}`, 'issue71');
    const evidence = { seed: 1, faction, difficulty, policy: 'passive', speed: 3, advanceCalls: 0,
      contact: { ...seen, activeSeconds: seen.tick / 10, wallSeconds: contactWallSeconds },
      pressure: { tick: final.tick, activeSeconds: final.tick / 10, wallSeconds: (Date.now() - started) / 1000, effect } };
    await info.attach('paced-pressure.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
    console.log(JSON.stringify(evidence));
    expect((await spqr.diagnosis()).errors).toEqual([]);
  });
}

for (const faction of ['rome', 'carthage'] as const) {
  test(`ordinary entry to conflict and Resume ${faction}`, async ({ page, spqr }, info) => {
    test.setTimeout(240_000);
    const width = faction === 'rome' ? 1280 : 1920;
    await page.setViewportSize({ width, height: width === 1280 ? 720 : 1080 });
    await page.goto('/');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
    if (faction === 'carthage') await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Tab');
    await page.keyboard.type('1');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await press(page, (await hudLayout(page)).guideButtons.find((entry) => entry.action === 'guideSkip')!.rect);
    await pause(page, true);
    expect((await state(page)).faction).toBe(faction);
    expect((await state(page)).seed).toBe(1);
    const started = Date.now();
    let earlierContact: Awaited<ReturnType<typeof contact>> | null = null;
    const homeRow = (await hudLayout(page)).rows.find((entry) => entry.selection.kind === 'settlement')!;
    await press(page, homeRow.rect);
    await button(page, 'settlement:balance');
    await capture(page, `journey-economy-${faction}-${width}`, 'issue71');
    await press(page, (await hudLayout(page)).tabs.find((entry) => entry.tab === 'construction')!.rect);
    await press(page, (await hudLayout(page)).commands.find((entry) => entry.order.id === 'build:farm')!.rect);
    await button(page, 'purchase:build:farm');
    if (faction === 'rome') {
      // React to an actual siege: an early superior human army correctly scares
      // off the scouting party. No enemy orders or resources are fabricated.
      await pace(page);
      await pause(page, false);
      await expect.poll(async () => (await state(page)).applied.some((entry) => entry.command.kind === 'build')).toBe(true);
      earlierContact = await contact(page, `journey-${faction}-${width}`);
      let previous = (await state(page)).visible;
      await pause(page, false);
      await expect.poll(async () => {
        const current = (await state(page)).visible;
        const effect = pressure(previous, current, faction);
        previous = current;
        return effect;
      }, { timeout: 120_000, intervals: [250] }).not.toBeNull();
      await pause(page, true);
      await press(page, (await hudLayout(page)).rows.find((entry) => entry.selection.kind === 'settlement')!.rect);
    }
    await press(page, (await hudLayout(page)).tabs.find((entry) => entry.tab === 'recruitment')!.rect);
    const type = faction === 'rome' ? 'hastati' : 'gaul';
    for (const [index, men] of (faction === 'rome' ? [24, 24] : [24, 48]).entries()) {
      const card = (await hudLayout(page)).commands.find((entry) => entry.order.id === `recruit:${type}:${men}`)!;
      expect(card.order.enabled).toBe(true);
      await press(page, card.rect);
      await button(page, `purchase:recruit:${type}:${men}`);
      if (faction === 'rome' && index === 0) {
        // A superior two-Squad army can drive the scout away without a battle.
        // Commit the first defender while the real siege is still occupied,
        // then raise the second. This is a human policy, not an AI override.
        await pause(page, false);
        await expect.poll(async () => {
          const current = await state(page);
          return current.visible.squads.some((squad) => squad.men < squad.capacity) ||
            current.visible.enemies.some((squad) => squad.appearance && squad.appearance.men < squad.appearance.capacity) || current.corpses.length > 0;
        }, { timeout: 30_000, intervals: [100] }).toBe(true);
        await pause(page, true);
      }
    }
    await pace(page);
    await pause(page, false);
    await expect.poll(async () => (await state(page)).visible.squads.length).toBe(2);
    await pause(page, true);
    const raised = await state(page);
    const army = raised.visible.squads;
    expect(raised.applied.map((entry) => entry.command.kind)).toContain('recruit');
    if (faction === 'carthage') expect(raised.applied.map((entry) => entry.command.kind)).toContain('build');
    const ownRows = (await hudLayout(page)).rows.filter((entry) => entry.selection.kind === 'squad');
    await press(page, ownRows[0]!.rect);
    await page.keyboard.press('f');
    const origin = (await page.locator('#app canvas').boundingBox())!;
    const firstView = await describeView(page), firstAt = tilePixel(army[0]!.x, army[0]!.y);
    const zoomPoint = stageToScreen(firstView.camera, firstAt.x, firstAt.y);
    await page.mouse.move(origin.x + zoomPoint.x, origin.y + zoomPoint.y);
    await page.mouse.wheel(0, 100);
    await expect.poll(async () => (await describeView(page)).camera.zoom).toBe(1);
    await page.keyboard.press('f');
    const camera = (await describeView(page)).camera;
    const corners = (await state(page)).squads.map((squad) => ({
      top: stageToScreen(camera, squad.rect.x, squad.rect.y),
      bottom: stageToScreen(camera, squad.rect.x + squad.rect.width, squad.rect.y + squad.rect.height),
    }));
    await page.mouse.move(origin.x + Math.min(...corners.map((rect) => rect.top.x)) - 5,
      origin.y + Math.min(...corners.map((rect) => rect.top.y)) - 5);
    await page.mouse.down();
    await page.mouse.move(origin.x + Math.max(...corners.map((rect) => rect.bottom.x)) + 5,
      origin.y + Math.max(...corners.map((rect) => rect.bottom.y)) + 5, { steps: 5 });
    await page.mouse.up();
    expect((await state(page)).selection.squads).toHaveLength(2);
    await page.keyboard.press('Control+1');
    await page.keyboard.press('s');
    await pause(page, false);
    // The host deliberately retains only 128 recent Commands. Read each human
    // act as it lands, before later AI traffic evicts it from that window.
    await expect.poll(async () => (await state(page)).applied.map((entry) => entry.command.kind))
      .toEqual(expect.arrayContaining(['group', 'hold']));
    const seen = earlierContact ?? await contact(page, `journey-${faction}-${width}`);
    await pause(page, true);
    const current = await state(page);
    expect(current.visible.settlements[0]!.works.some((work) => work.building === 'farm' && work.standing)).toBe(true);
    await page.keyboard.press('1');
    const attack = (await hudLayout(page)).commands.find((entry) => entry.order.id === 'attack');
    const enemy = current.visible.enemies[0];
    const attacking = attack?.order.enabled && enemy !== undefined;
    if (attacking) {
      await press(page, attack.rect);
      const view = await describeView(page), target = stageToScreen(view.camera, tilePixel(enemy.x, enemy.y).x, tilePixel(enemy.x, enemy.y).y);
      await page.mouse.click(origin.x + target.x, origin.y + target.y);
    }
    await pause(page, false);
    if (attacking) await expect.poll(async () => (await state(page)).applied.some((entry) => entry.command.kind === 'attack')).toBe(true);
    // Pursue only permitted sightings or their last-known positions. A scouting
    // party may correctly withdraw from superior forces; a one-off attack at
    // its old tile is not a promise that the Player will catch it there.
    let lastOrder = -1;
    await expect.poll(async () => {
      const current = await state(page);
      const casualties = current.visible.squads.some((squad) => squad.men < squad.capacity) ||
        current.visible.enemies.some((squad) => squad.appearance && squad.appearance.men < squad.appearance.capacity) || current.corpses.length > 0;
      if (casualties) return true;
      const target = current.visible.enemies[0] ?? current.visible.contacts.filter((entry) => entry.kind === 'squad').sort((a, b) => b.seen - a.seen)[0];
      if (target && current.tick - lastOrder >= 10) {
        await page.keyboard.press('f');
        const view = await describeView(page), tile = tilePixel(target.x, target.y), at = stageToScreen(view.camera, tile.x, tile.y);
        const panels = await hudRects(page);
        if (at.x > 0 && at.y > 80 && at.x < view.width && at.y < view.height &&
          !panels.some((rect) => at.x >= rect.x && at.x < rect.x + rect.width && at.y >= rect.y && at.y < rect.y + rect.height)) {
          await page.keyboard.press('a');
          await page.mouse.click(origin.x + at.x, origin.y + at.y);
          lastOrder = current.tick;
        }
      }
      return false;
    }, { timeout: 90_000, intervals: [500] }).toBe(true);
    await pause(page, true);
    const conflict = await state(page);
    expect(conflict.tick, 'losses precede seasonal attrition or Payroll desertion').toBeLessThan(SEASON_TICKS);
    const wounded = conflict.visible.squads.find((squad) => squad.men < squad.capacity);
    if (wounded) {
      await press(page, (await hudLayout(page)).rows.find((row) => row.selection.kind === 'squad' && row.selection.id === wounded.id)!.rect);
      await page.keyboard.press('f');
    }
    // Inspect the casualty slots at a useful scale through ordinary wheel input.
    const focus = (await state(page)).visible.squads.find((squad) => squad.id === wounded?.id) ?? (await state(page)).visible.squads[0]!;
    const beforeZoom = await describeView(page), foot = tilePixel(focus.x, focus.y);
    const zoomAt = stageToScreen(beforeZoom.camera, foot.x, foot.y);
    await page.mouse.move(origin.x + zoomAt.x, origin.y + zoomAt.y);
    for (let zoom = beforeZoom.camera.zoom; zoom < 4; zoom += 1) await page.mouse.wheel(0, -100);
    await expect.poll(async () => (await describeView(page)).camera.zoom).toBe(4);
    await page.keyboard.press('f');
    await capture(page, `journey-losses-${faction}-${width}`, 'issue71');
    await page.keyboard.press('F1');
    await capture(page, `journey-reference-${faction}-${width}`, 'issue71');
    await page.keyboard.press('Escape');
    expect((await state(page)).hash).toBe(conflict.hash);
    await page.keyboard.press('Escape');
    await press(page, await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((entry) => entry.action === 'home')!.rect));
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
    await page.keyboard.press('Enter');
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
    await pause(page, true);
    const restored = await state(page);
    expect(restored.seed).toBe(1);
    expect(restored.faction).toBe(faction);
    expect(restored.tick).toBeGreaterThanOrEqual(conflict.tick);
    expect(restored.visible.settlements[0]!.works.some((work) => work.building === 'farm' && work.standing)).toBe(true);
    expect(await page.evaluate(() => window.__SPQR.game!.groupOf(1)))
      .toEqual(army.filter((squad) => restored.visible.squads.some((survivor) => survivor.id === squad.id)).map((squad) => squad.id));
    const evidence = { seed: 1, faction, speed: 3, sizes: army.map((squad) => squad.capacity),
      policy: faction === 'rome' ? 'first-defender-in-siege-then-second-and-pursue-observed' : 'early-recruit-and-pursue-observed',
      contactTick: seen.tick, conflictTick: conflict.tick, activeSeconds: conflict.tick / 10, wallSeconds: (Date.now() - started) / 1000,
      survivors: conflict.visible.squads.map((squad) => ({ id: squad.id, men: squad.men, capacity: squad.capacity })),
      enemySurvivors: conflict.visible.enemies, corpses: conflict.corpses, advanceCalls: 0 };
    await info.attach('journey.json', { body: JSON.stringify(evidence), contentType: 'application/json' });
    console.log(JSON.stringify(evidence));
    expect((await spqr.diagnosis()).errors).toEqual([]);
  });
}
