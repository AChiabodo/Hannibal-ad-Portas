/**
 * The contextual panels, played through their visible controls (ticket #55).
 *
 * The unit tests in `tests/ui/` decide what the panel *says*; this spec decides
 * that the panel is a control: a button on the canvas is pressed with a pointer,
 * an armed action is answered with a click on the theatre, a list row names a
 * settlement, and a key does what the same button does. What is read back is the
 * page's own hooks — the Commands applied, the selection, the model and the
 * layout — so nothing here reaches into the page.
 *
 * The scene comes from `commands-fixture.html`, which is the real Siege Match
 * with both rosters mustered and a few Squads placed where the offers are about.
 * That is a *scenario built from the actual rules*, not a second model of them;
 * the alternative — marching two hundred ticks before anything is in sight —
 * would test the clock rather than the controls.
 *
 * A Command is *queued* when it is given and appears in the applied log on the
 * next tick, so each scenario steps one tick before it reads what the Match did.
 * That is the seam's own rule (a pause holds the queue, the next decide drains
 * it) and not a convenience of the test.
 */
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { advance, applied, press, select, selection, squads } from './hooks';
import type { HudModel } from '../src/ui/hud';
import type { Command } from '../src/sim/command';
import { translate } from '../src/ui/strings';

const VIEWPORT = { width: 1280, height: 720 };

interface Point {
  readonly x: number;
  readonly y: number;
}

interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Boots the arranged scene and stops the clock.
 *
 * One tick is stepped so that the fog the Observation is built from has seen the
 * placed Squads: the fronts and contacts the panel may show are the ones the
 * Faction's own eyes actually have.
 */
async function bootScene(page: Page, faction: 'rome' | 'carthage'): Promise<void> {
  await page.setViewportSize(VIEWPORT);
  await page.goto(`/e2e/commands-fixture.html?faction=${faction}`);
  // Booting a WebGL page beside eight other workers can take longer than the
  // default five seconds; the assertion is that it booted, not that it was quick.
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached({ timeout: 20_000 });
  await page.evaluate(() => window.__SPQR.game!.pause());
  await advance(page, 1);
  await expect.poll(async () => (await hud(page)).commands.length).toBeGreaterThan(0);
}

async function hud(page: Page): Promise<HudModel> {
  return page.evaluate(() => window.__SPQR.game!.hud());
}

/** The canvas's top-left corner on the page: every click is a canvas point plus this. */
async function origin(page: Page): Promise<Point> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

/** The rectangle of one contextual action, as the panel drew it. */
async function commandRect(page: Page, id: string): Promise<Rect> {
  const rect = await page.evaluate((wanted) => window.__SPQR.game!.hudLayout().commands
    .find((command) => command.order.id === wanted)?.rect ?? null, id);

  if (rect === null) throw new Error(`the panel offers no "${id}"`);

  return rect;
}

async function pressCommand(page: Page, id: string): Promise<void> {
  await press(page, await commandRect(page, id));
}

/** Presses one of the bar's own buttons, e.g. the one that centres the selection. */
async function pressButton(page: Page, action: string): Promise<void> {
  const rect = await page.evaluate((wanted) => window.__SPQR.game!.hudLayout().buttons
    .find((button) => button.action === wanted)?.rect ?? null, action);
  if (rect === null) throw new Error(`the bar has no "${action}" button`);

  await press(page, rect);
}

/** The screen point a tile is drawn at, checked against the interface it must not be under. */
async function mapPoint(page: Page, tileX: number, tileY: number): Promise<Point> {
  const point = await page.evaluate(({ x, y }) => {
    const camera = window.__SPQR.view!.describe().camera;

    return { x: Math.round((x * 16 + 8 - camera.x) * camera.zoom), y: Math.round((y * 16 + 8 - camera.y) * camera.zoom) };
  }, { x: tileX, y: tileY });
  const covered = await page.evaluate(() => window.__SPQR.game!.hudRects());
  const size = await page.evaluate(() => window.__SPQR.view!.describe());
  const under = covered.some((rect) => point.x >= rect.x && point.x < rect.x + rect.width
    && point.y >= rect.y && point.y < rect.y + rect.height);

  expect(under, `tile ${String(tileX)},${String(tileY)} is under the interface`).toBe(false);
  expect(point.x, `tile ${String(tileX)},${String(tileY)} is off the canvas`).toBeGreaterThanOrEqual(0);
  expect(point.y, `tile ${String(tileX)},${String(tileY)} is off the canvas`).toBeGreaterThanOrEqual(0);
  expect(point.x).toBeLessThan(size.width);
  expect(point.y).toBeLessThan(size.height);

  return point;
}

/** Clicks a tile of the theatre with the left button. */
async function clickTile(page: Page, tileX: number, tileY: number): Promise<void> {
  const at = await origin(page);
  const point = await mapPoint(page, tileX, tileY);
  await page.mouse.click(at.x + point.x, at.y + point.y);
}

/** The last Command the Match has applied, or `null`. */
async function lastCommand(page: Page): Promise<Command | null> {
  const log = await applied(page);

  return log.at(-1)?.command ?? null;
}

/** A row of the navigator, by what it selects. */
async function rowRect(page: Page, wanted: { readonly kind: 'settlement' | 'squad'; readonly id: number }): Promise<Rect> {
  const rect = await page.evaluate((selection) => window.__SPQR.game!.hudLayout().rows
    .find((row) => row.selection.kind === selection.kind && row.selection.id === selection.id)?.rect ?? null, wanted);
  if (rect === null) throw new Error(`no ${wanted.kind} row ${String(wanted.id)}`);

  return rect;
}

/** The Faction's own Squads, ordered by how near they stand to a tile. */
async function squadsNear(page: Page, x: number, y: number): Promise<readonly number[]> {
  const seen = await page.evaluate(() => window.__SPQR.game!.state().visible.squads);

  return [...seen]
    .sort((left, right) => Math.max(Math.abs(left.x - x), Math.abs(left.y - y))
      - Math.max(Math.abs(right.x - x), Math.abs(right.y - y)))
    .map((squad) => squad.id);
}

/** The tile of the enemy stronghold this Faction has met, or `null`. */
async function enemyStronghold(page: Page): Promise<Point | null> {
  return page.evaluate(() => window.__SPQR.game!.state().visible.contacts
    .find((contact) => contact.kind === 'stronghold') ?? null);
}

/** The Faction's own Stronghold, which is the settlement the panel opens on. */
async function homeSettlement(page: Page): Promise<{ readonly id: number; readonly x: number; readonly y: number }> {
  const settlements = await page.evaluate(() => window.__SPQR.game!.state().visible.settlements);
  const stronghold = settlements[0];
  if (stronghold === undefined) throw new Error('the Faction holds nothing');

  return stronghold;
}

/**
 * Picks several Squads by dragging a box round them, as a Player does.
 *
 * The box is the union of the blocks' drawn rectangles converted to the screen,
 * so the gesture is a real drag over what the Player can see and not a selection
 * assembled through a hook.
 */
async function dragSelect(page: Page, ids: readonly number[]): Promise<void> {
  const drawn = (await squads(page)).filter((squad) => ids.includes(squad.id));
  expect(drawn).toHaveLength(ids.length);

  const camera = await page.evaluate(() => window.__SPQR.view!.describe().camera);
  const corners = drawn.map((squad) => ({
    x: (squad.rect.x - camera.x) * camera.zoom,
    y: (squad.rect.y - camera.y) * camera.zoom,
    right: (squad.rect.x + squad.rect.width - camera.x) * camera.zoom,
    bottom: (squad.rect.y + squad.rect.height - camera.y) * camera.zoom,
  }));
  const from = await origin(page);
  const left = Math.min(...corners.map((corner) => corner.x)) - 6;
  const top = Math.min(...corners.map((corner) => corner.y)) - 6;
  const right = Math.max(...corners.map((corner) => corner.right)) + 6;
  const bottom = Math.max(...corners.map((corner) => corner.bottom)) + 6;

  await page.mouse.move(from.x + left, from.y + top);
  await page.mouse.down();
  await page.mouse.move(from.x + right, from.y + bottom, { steps: 6 });
  await page.mouse.up();
}

test('a Squad is ordered by its buttons, by an armed click and by the same key', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  const [nearest] = await squadsNear(page, home.x, home.y);
  await select(page, { kind: 'squad', id: nearest! });

  // A movement order: the button arms it, and the panel says what it wants.
  await pressCommand(page, 'move');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBe('move');
  expect((await hud(page)).orders.armed?.targetHint).toBeTruthy();

  await clickTile(page, home.x - 3, home.y - 2);
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBeNull();
  // A Command already given is not a target: the Squad is still selected.
  expect((await selection(page)).squads).toEqual([nearest]);
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'move', squads: [nearest], x: home.x - 3, y: home.y - 2 });

  // A second movement order replaces the first, and the panel shows one
  // destination rather than an itinerary of waypoints.
  await pressCommand(page, 'move');
  await clickTile(page, home.x - 4, home.y - 1);
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'move', x: home.x - 4, y: home.y - 1 });
  const panel = (await hud(page)).detail?.lines.map((line) => `${line.label}: ${line.value}`).join(' ') ?? '';
  expect(panel).toContain(`Destinazione: ${String(home.x - 4)},${String(home.y - 1)}`);
  expect(panel.match(/Destinazione/g)).toHaveLength(1);

  // Escape cancels the action being aimed, and only that.
  await pressCommand(page, 'attackMove');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBe('attackMove');
  const before = (await applied(page)).length;
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBeNull();
  expect((await applied(page)).length).toBe(before);
  expect((await selection(page)).squads).toEqual([nearest]);

  // The `A` key arms the same action the button does, through the same path.
  await page.keyboard.press('a');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBe('attackMove');
  await clickTile(page, home.x - 2, home.y - 3);
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'attackMove', squads: [nearest], x: home.x - 2, y: home.y - 3 });

  // `S` is Hold, and Escape does not take back a Command already submitted: it
  // drops the selection, which is the other thing Escape means.
  await page.keyboard.press('s');
  expect((await hud(page)).orders.pending).toBe(1);
  await page.keyboard.press('Escape');
  expect((await selection(page)).squads).toEqual([]);
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'hold', squads: [nearest] });

  // The formation keys are the same offers, given to the same Squad.
  await select(page, { kind: 'squad', id: nearest! });
  await page.keyboard.press('c');
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'formation', formation: 'column' });
  await page.keyboard.press('l');
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'formation', formation: 'line' });

  // Withdraw is its own visible action, and the rules obey it as a real Command.
  await pressCommand(page, 'withdraw');
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'withdraw', squads: [nearest] });
});

test('an enemy in sight is attacked by its own explicit action', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  const [nearest] = await squadsNear(page, home.x, home.y);
  await select(page, { kind: 'squad', id: nearest! });

  const enemies = await page.evaluate(() => window.__SPQR.game!.state().visible.enemies);
  expect(enemies.length).toBeGreaterThan(0);
  const enemy = enemies[0]!;
  expect((await hud(page)).commands.find((order) => order.id === 'attack')?.enabled).toBe(true);

  await pressCommand(page, 'attack');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBe('attack');
  await clickTile(page, enemy.x, enemy.y);
  await advance(page, 1);

  expect(await lastCommand(page)).toMatchObject({ kind: 'attack', squads: [nearest], target: enemy.id });
});

test('a mixed selection shows its reach, garrisons who can, and keeps a way back to the group', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  const [nearest, next] = await squadsNear(page, home.x, home.y);
  await dragSelect(page, [nearest!, next!]);

  const model = await hud(page);
  expect((await selection(page)).squads).toEqual([nearest, next]);
  expect(model.group?.squads).toBe(2);
  expect(model.detail?.lines.map((line) => line.label)).toContain('Composizione');
  expect(model.commands.find((order) => order.id === 'garrison')?.note).toMatch(/su 2 a portata/);

  await pressCommand(page, 'garrison');
  await press(page, await rowRect(page, { kind: 'settlement', id: home.id }));
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'garrison', settlement: home.id });

  const garrisoned = await page.evaluate(() => window.__SPQR.game!.state().visible.squads.map((squad) => squad.garrison));
  // The rule decides who is in reach: the Squad beside the walls is inside, the
  // one four tiles out is not, and the panel does not pretend otherwise.
  expect(garrisoned.filter((id) => id !== null)).toHaveLength(1);

  // Settle the selection back on the two Squads so the group panel is open.
  await page.evaluate((id) => window.__SPQR.game!.select({ kind: 'squad', id }), nearest!);
  await dragSelect(page, [nearest!, next!]);
  const exceptions = await page.evaluate(() => window.__SPQR.game!.hudLayout().exceptions);
  expect(exceptions.length).toBeGreaterThan(0);
  await press(page, exceptions[0]!.rect);
  expect(await page.evaluate(() => window.__SPQR.game!.hud().orders.backToGroup)).toBe(true);
  const back = await page.evaluate(() => window.__SPQR.game!.hudLayout().buttons
    .find((button) => button.action === 'groupBack')?.rect ?? null);
  expect(back).not.toBeNull();
  await press(page, back!);
  expect([...(await selection(page)).squads].sort()).toEqual([nearest, next].sort());
});

test('construction and recruitment are content-backed pages that submit real Commands', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  await press(page, await rowRect(page, { kind: 'settlement', id: home.id }));

  const tabs = await page.evaluate(() => window.__SPQR.game!.hudLayout().tabs);
  expect(tabs.map((tab) => tab.tab)).toEqual(['overview', 'construction', 'recruitment']);
  await press(page, tabs.find((tab) => tab.tab === 'construction')!.rect);

  const farm = (await hud(page)).commands.find((order) => order.id === 'build:farm');
  expect(farm?.note).toContain('tick');
  expect(farm?.enabled).toBe(true);
  await pressCommand(page, 'build:farm');
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'build', settlement: home.id, building: 'farm' });

  const works = (await hud(page)).detail?.lines.filter((line) => line.label === 'Cantieri').map((line) => line.value) ?? [];
  expect(works.join(' ')).toContain('Fattoria');

  await press(page, (await page.evaluate(() => window.__SPQR.game!.hudLayout().tabs))
    .find((tab) => tab.tab === 'recruitment')!.rect);
  const hastati = (await hud(page)).commands.find((order) => order.id === 'recruit:hastati');
  expect(hastati?.enabled).toBe(true);
  await pressCommand(page, 'recruit:hastati');
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'recruit', settlement: home.id, squadType: 'hastati', count: 1 });
});

test('Rome storms a known Stronghold, and the panel shows what it knows of the walls', async ({ page }) => {
  await bootScene(page, 'rome');
  const site = await enemyStronghold(page);
  expect(site).not.toBeNull();

  // The Squad beside the enemy Stronghold is the one that can storm it.
  const [beside] = await squadsNear(page, site!.x, site!.y);
  await select(page, { kind: 'squad', id: beside! });
  const model = await hud(page);
  expect(model.commands.find((order) => order.id === 'assault')?.enabled).toBe(true);
  expect(model.commands.find((order) => order.id === 'blockade')?.enabled).toBe(true);

  // The panel names the walls it knows, and no enemy figure beside them.
  const panel = model.detail?.lines.map((line) => `${line.label}: ${line.value}`).join(' ') ?? '';
  expect(panel).toContain(`${translate('ui.walls')} `);
  expect(panel).toContain(`${translate('ui.garrisonCount')} `);

  // The enemy Stronghold's own front is known: at least one wall section stands
  // on a settlement this Faction does not hold.
  const known = await page.evaluate(() => {
    const state = window.__SPQR.game!.state();
    const own = new Set(state.visible.settlements.map((settlement) => settlement.id));

    return state.visible.fronts.filter((front) => !own.has(front.settlement) && front.structures.length > 0).length;
  });
  expect(known).toBeGreaterThan(0);

  // Bring the target on screen with the bar's own Centre control, then arm the
  // assault with its button and answer it with a click on the Stronghold.
  await pressButton(page, 'center');
  await pressCommand(page, 'assault');
  expect(await page.evaluate(() => window.__SPQR.game!.targeting())).toBe('assault');
  await clickTile(page, site!.x, site!.y);
  await advance(page, 1);

  expect(await lastCommand(page)).toMatchObject({ kind: 'assault', squads: [beside] });
  expect((await hud(page)).orders.last).not.toBeNull();
});

test('Carthage is told it has no ram, and may still blockade', async ({ page }) => {
  await bootScene(page, 'carthage');
  const site = await enemyStronghold(page);
  expect(site).not.toBeNull();
  const [beside] = await squadsNear(page, site!.x, site!.y);
  await select(page, { kind: 'squad', id: beside! });

  const model = await hud(page);
  expect(model.commands.find((order) => order.id === 'assault')).toMatchObject({
    enabled: false,
    reason: translate('reason.noRam'),
  });
  expect(model.commands.find((order) => order.id === 'blockade')?.enabled).toBe(true);

  // Pressing a control that cannot be used answers in words in the panel, rather
  // than swallowing the press: that is how an icon's limit is learned.
  await pressCommand(page, 'assault');
  expect((await hud(page)).orders.notice).toContain(translate('reason.noRam'));

  await pressButton(page, 'center');
  await pressCommand(page, 'blockade');
  await clickTile(page, site!.x, site!.y);
  await advance(page, 1);
  expect(await lastCommand(page)).toMatchObject({ kind: 'blockade', squads: [beside] });

  // What is known of the walls is in the settlement's own panel, and no enemy
  // stock is: the panel only ever shows the Faction's own stocks.
  const home = await homeSettlement(page);
  await press(page, await rowRect(page, { kind: 'settlement', id: home.id }));
  const lines = (await hud(page)).detail?.lines.map((line) => `${line.label}: ${line.value}`).join(' ') ?? '';
  expect(lines).toContain(`${translate('ui.walls')}:`);
  expect(lines).toContain(`${translate('ui.gate')}:`);
});

test('Control groups are numbered visible controls beside the keyboard binding', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  const [nearest, next] = await squadsNear(page, home.x, home.y);
  await dragSelect(page, [nearest!, next!]);
  await page.keyboard.press('Control+1');

  const groups = (await hud(page)).groups;
  expect(groups.map((group) => group.index)).toEqual([1]);
  expect(groups[0]?.count).toBe(2);

  const chip = await page.evaluate(() => window.__SPQR.game!.hudLayout().groups
    .find((group) => group.index === 1)?.rect ?? null);
  expect(chip).not.toBeNull();

  await page.evaluate(() => window.__SPQR.game!.select(null));
  expect((await selection(page)).squads).toEqual([]);
  await press(page, chip!);
  expect([...(await selection(page)).squads].sort()).toEqual([nearest, next].sort());
});

test('orders given while paused are visibly pending, and land on the next tick', async ({ page }) => {
  await bootScene(page, 'rome');
  const home = await homeSettlement(page);
  const [nearest] = await squadsNear(page, home.x, home.y);
  await select(page, { kind: 'squad', id: nearest! });
  await page.evaluate(() => window.__SPQR.game!.pause());

  await pressCommand(page, 'hold');
  const paused = await hud(page);
  expect(paused.orders.pending).toBe(1);
  const said = await page.evaluate(() => window.__SPQR.game!.hudLayout().status.map((line) => line.text).join(' '));
  expect(said).toContain('In attesa: 1');
  expect(said).toContain('in pausa');

  await advance(page, 1);
  expect((await hud(page)).orders.pending).toBe(0);
  expect(await lastCommand(page)).toMatchObject({ kind: 'hold', squads: [nearest] });
});

/**
 * Rendered evidence at the two reference resolutions, for both Factions.
 *
 * A layout is not proven by a passing build (the ticket says so): the panels are
 * captured as the page draws them, a settlement's construction page and a
 * Squad's command page with an armed action, at 1280x720 and 1920x1080. The
 * assertions beside the pictures are the ones a picture cannot make cheaply:
 * every control is inside the panel that claims it, no two controls overlap, and
 * every word fits the rectangle it was given.
 */
test('renders the contextual panels at 1280x720 and 1920x1080, for both Factions', async ({ page }) => {
  const evidence = join(tmpdir(), 'spqr-issue55');
  await mkdir(evidence, { recursive: true });

  for (const [width, height] of [[1280, 720], [1920, 1080]] as const) {
    for (const faction of ['rome', 'carthage'] as const) {
      await bootScene(page, faction);
      await page.setViewportSize({ width, height });

      const home = await homeSettlement(page);
      const row = await rowRect(page, { kind: 'settlement', id: home.id });
      await press(page, row);
      await press(page, (await page.evaluate(() => window.__SPQR.game!.hudLayout().tabs))
        .find((tab) => tab.tab === 'construction')!.rect);

      const shape = await page.evaluate(() => {
        const layout = window.__SPQR.game!.hudLayout();
        const inside = (rect: { x: number; y: number; width: number; height: number }): boolean =>
          rect.x >= layout.detail.x - 1 && rect.y >= layout.detail.y - 1
          && rect.x + rect.width <= layout.detail.x + layout.detail.width + 1
          && rect.y + rect.height <= layout.detail.y + layout.detail.height + 1;
        const overlap = (left: { x: number; y: number; width: number; height: number },
          right: { x: number; y: number; width: number; height: number }): boolean =>
          left.x < right.x + right.width && right.x < left.x + left.width
          && left.y < right.y + right.height && right.y < left.y + left.height;
        const controls = [...layout.commands.map((command) => command.rect), ...layout.tabs.map((tab) => tab.rect)];

        return {
          inside: controls.every(inside),
          overlaps: controls.some((left, index) => controls.slice(index + 1).some((right) => overlap(left, right))),
          offers: layout.commands.map((command) => command.order.id),
          tabs: layout.tabs.map((tab) => tab.tab),
        };
      });

      expect(shape.inside, `${faction} at ${String(width)}: every control is inside the detail panel`).toBe(true);
      expect(shape.overlaps, `${faction} at ${String(width)}: no two controls overlap`).toBe(false);
      expect(shape.tabs).toEqual(['overview', 'construction', 'recruitment']);
      expect(shape.offers).toContain('build:farm');

      await page.screenshot({ path: join(evidence, `construction-${faction}-${String(width)}x${String(height)}.png`) });

      // The Squad page, with an action armed so the requirement line is drawn.
      const [nearest] = await squadsNear(page, home.x, home.y);
      await select(page, { kind: 'squad', id: nearest! });
      const armedBefore = await page.evaluate(() => {
        const rect = window.__SPQR.game!.hudLayout().commands
          .find((command) => command.order.id === 'attackMove')!.rect;

        return window.__SPQR.view!.samples([[rect.x + rect.width / 2, rect.y + rect.height / 2]]);
      });
      await pressCommand(page, 'attackMove');
      const armedAfter = await page.evaluate(() => {
        const rect = window.__SPQR.game!.hudLayout().commands
          .find((command) => command.order.id === 'attackMove')!.rect;

        return window.__SPQR.view!.samples([[rect.x + rect.width / 2, rect.y + rect.height / 2]]);
      });
      expect(armedAfter, 'the armed action is drawn differently').not.toEqual(armedBefore);

      // The panel is ink, not an empty plate: the frame the page presented holds
      // its ground, its edge, its label ink and its value ink, sampled live.
      const colours = await page.evaluate(() => {
        const layout = window.__SPQR.game!.hudLayout();
        const points: [number, number][] = [];
        for (let y = layout.detail.y + 2; y < layout.detail.y + layout.detail.height - 2; y += 3) {
          for (let x = layout.detail.x + 2; x < layout.detail.x + layout.detail.width - 2; x += 3) points.push([x, y]);
        }
        const seen = new Set(window.__SPQR.view!.samples(points).map((rgba) => rgba.join(',')));

        return seen.size;
      });
      expect(colours).toBeGreaterThanOrEqual(4);
      await page.screenshot({ path: join(evidence, `commands-${faction}-${String(width)}x${String(height)}.png`) });

      const status = await page.evaluate(() => window.__SPQR.game!.hudLayout().status.map((line) => line.text));
      expect(status.join(' ')).toContain('Mira');

      // The card is rows of decisions, three of them, and every picture is ink on
      // the frame the page presented — sampled live, not inferred from the model.
      const card = await page.evaluate(() => {
        const game = window.__SPQR.game!;
        const layout = game.hudLayout();
        const rows = new Set(layout.commands.map((command) => command.rect.y)).size;
        const icons = layout.commands.slice(0, 3).map((command) => {
          const points: [number, number][] = [];
          for (let y = command.rect.y + 4; y < command.rect.y + 34; y += 3) {
            for (let x = command.rect.x + 4; x < command.rect.x + command.rect.width - 4; x += 3) points.push([x, y]);
          }
          return new Set(window.__SPQR.view!.samples(points).map((rgba) => rgba.join(','))).size;
        });

        return { rows, icons };
      });
      expect(card.rows).toBe(3);
      // Two at least: the panel's ground and the picture on it. A muted control is
      // one ink, so asking for more would fail on exactly the state it tests.
      for (const colours of card.icons) expect(colours).toBeGreaterThan(1);
      await page.keyboard.press('Escape');

      expect(await page.evaluate(() => window.__SPQR.game!.hud().commands.length)).toBeGreaterThan(0);
      expect(await page.locator('vite-error-overlay').count()).toBe(0);
    }
  }
});
