/**
 * A human playing: picking Squads, and giving them orders in a real browser
 * (ticket C2).
 *
 * This is the first spec in the repository whose subject is *a person doing
 * something*, so it drives the page the way a person does: a mouse clicks and
 * drags, a keyboard presses, and the page's own pointer and key handlers turn
 * those into Commands. What the tests then read back is the page's hooks — the
 * Squads, the selection, the HUD and the Commands applied — so nothing here
 * reaches into the page's internals and the same gestures a Player uses are the
 * ones under test.
 *
 * Three things are being proven, in the ticket's own words:
 *
 * - selection works by click and by box, and control groups can be assigned and
 *   recalled;
 * - Move, Attack-move and Hold are issued as real Commands, applied by the
 *   Match, and the men march;
 * - a human can move Squads around a generated map in a browser.
 *
 * The wall clock is not the Match's: the page is paused and stepped through its
 * own `advance` hook, and stepping past a pause is what releases the orders a
 * pause held (B5). That is why every step below resumes, advances and pauses
 * again — the pause is real, and a Match that applied orders while paused would
 * be a different game.
 */
import { expect, test, type Page } from '@playwright/test';
import { MAP_WIDTH, generateMap, isWalkable, terrainAt } from '../src/sim/map';
import { tilePixel } from '../src/render/terrain';
import { DEFAULT_SEED } from '../src/render/view';
import type { SquadReport } from '../src/render/game';
import { advance, applied, describeView, groupOf, hud, hudRects, selection, squads } from './hooks';

/** The theatre the page opens on: the map its Squads stand on. */
const MAP = generateMap(DEFAULT_SEED);

/** A point in theatre pixels, which is what a Squad's rectangle is in. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the canvas's top-left corner is on the page.
 *
 * The canvas is centred by the page's stylesheet, so a canvas point is not a
 * page point: every click below is a canvas point plus this origin, which is
 * what a Player's pointer is measured against.
 */
async function canvasOrigin(page: Page): Promise<Point> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

/** A canvas point, as a page point a mouse can be moved to. */
function onPage(origin: Point, at: Point): Point {
  return { x: origin.x + at.x, y: origin.y + at.y };
}

/** Boots the page with the real-time loop stopped, so a test decides when the Match steps. */
async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
  await page.evaluate(() => window.__SPQR.game?.pause());
}

/**
 * Steps the Match, releasing whatever a pause is holding.
 *
 * A paused Match holds its Player's orders until it resumes (B5), and `advance`
 * steps ticks without releasing them — so a test that skipped the resume would
 * be testing the pause and not the order.
 */
async function step(page: Page, ticks: number): Promise<void> {
  await page.evaluate(() => window.__SPQR.game?.resume());
  await advance(page, ticks);
  await page.evaluate(() => window.__SPQR.game?.pause());
}

/** Where a theatre pixel is on the canvas. */
function toScreen(camera: { readonly x: number; readonly y: number; readonly zoom: number }, at: Point): Point {
  return { x: Math.round((at.x - camera.x) * camera.zoom), y: Math.round((at.y - camera.y) * camera.zoom) };
}

/** The middle of a Squad's block, in theatre pixels. */
function middleOf(squad: SquadReport): Point {
  return { x: squad.rect.x + Math.floor(squad.rect.width / 2), y: squad.rect.y + Math.floor(squad.rect.height / 2) };
}

/** The canvas points the interface covers, which are points a click cannot reach the theatre from. */
async function covered(page: Page): Promise<readonly { x: number; y: number; width: number; height: number }[]> {
  return hudRects(page);
}

/** Whether a point is inside the interface. */
function underHud(rects: readonly { x: number; y: number; width: number; height: number }[], at: Point): boolean {
  return rects.some(
    (rect) => at.x >= rect.x && at.x < rect.x + rect.width && at.y >= rect.y && at.y < rect.y + rect.height,
  );
}

/**
 * A Squad a test can click, and where to click it.
 *
 * The opening army stands below the Stronghold and the interface is over the
 * left of the screen, so the Squads under the panels are not clickable — which
 * is true for a Player too. The test picks the first Squad the interface does
 * not cover, and fails rather than clicking blindly.
 */
async function clickableSquad(page: Page): Promise<{ readonly squad: SquadReport; readonly at: Point }> {
  const view = await describeView(page);
  const rects = await covered(page);

  for (const squad of await squads(page)) {
    const at = toScreen(view.camera, middleOf(squad));
    if (at.x < 0 || at.y < 0 || at.x >= view.width || at.y >= view.height) continue;
    if (underHud(rects, at)) continue;

    return { squad, at };
  }

  throw new Error('no Squad is visible outside the interface, so nothing can be clicked');
}

/** A walkable tile a few tiles east of a Squad, which is where an order will send it. */
function targetNear(squad: SquadReport): Point {
  for (let across = 3; across < 12; across += 1) {
    const x = squad.x + across;
    const y = squad.y;
    if (x >= MAP_WIDTH) break;
    if (!isWalkable(terrainAt(MAP, x, y))) continue;

    return tilePixel(x, y);
  }

  throw new Error(`no walkable tile east of (${String(squad.x)}, ${String(squad.y)})`);
}

test('picks a Squad with a click, and the interface says so', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const click = onPage(await canvasOrigin(page), at);

  await page.mouse.click(click.x, click.y);

  const picked = await selection(page);
  expect(picked).toEqual({ squads: [squad.id], settlement: null });

  const model = await hud(page);
  expect(model.selected).toEqual({ kind: 'squad', id: squad.id });
  expect(model.picked).toEqual([{ kind: 'squad', id: squad.id }]);
  expect(model.detail?.title).toBe(`Reparto ${String(squad.id)}`);
});

test('picks several Squads by dragging a box over them', async ({ page }) => {
  await boot(page);
  const view = await describeView(page);
  const rects = await covered(page);

  // Every Squad whose block the interface leaves alone, and the corners of the
  // smallest box that holds two of them.
  const reachable = (await squads(page))
    .map((squad) => ({ squad, at: toScreen(view.camera, middleOf(squad)) }))
    .filter(({ at }) => at.x >= 0 && at.y >= 0 && at.x < view.width && at.y < view.height && !underHud(rects, at));

  expect(reachable.length, 'the opening army is on screen').toBeGreaterThan(1);

  const [first, second] = reachable;
  if (first === undefined || second === undefined) throw new Error('unreachable');

  const origin = await canvasOrigin(page);
  const from = onPage(origin, {
    x: Math.min(first.at.x, second.at.x) - 20,
    y: Math.min(first.at.y, second.at.y) - 20,
  });
  const to = onPage(origin, {
    x: Math.max(first.at.x, second.at.x) + 20,
    y: Math.max(first.at.y, second.at.y) + 20,
  });

  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();

  const picked = await selection(page);
  expect(picked.settlement).toBeNull();
  expect(picked.squads).toContain(first.squad.id);
  expect(picked.squads).toContain(second.squad.id);
  expect(picked.squads.length).toBeGreaterThan(1);

  // And every one of them is highlighted in the list, not only the first.
  const model = await hud(page);
  expect(model.picked.length).toBe(picked.squads.length);
});

test('moves a Squad with a right click, and the men march', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const target = targetNear(squad);
  const view = await describeView(page);
  const origin = await canvasOrigin(page);
  const squadClick = onPage(origin, at);
  const orderClick = onPage(origin, toScreen(view.camera, target));

  await page.mouse.click(squadClick.x, squadClick.y);
  await page.mouse.click(orderClick.x, orderClick.y, { button: 'right' });
  await step(page, 1);

  const ordered = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect(ordered?.goal, 'the Match has a goal for the Squad').not.toBeNull();

  const commands = await applied(page);
  expect(commands.map((entry) => entry.command.kind)).toContain('move');

  await step(page, 40);

  const marched = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect({ x: marched?.x, y: marched?.y }).not.toEqual({ x: squad.x, y: squad.y });
});

test('issues an Attack-move with the keyboard and the mouse, and a Hold with the keyboard', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const target = targetNear(squad);
  const view = await describeView(page);
  const origin = await canvasOrigin(page);
  const squadClick = onPage(origin, at);
  const orderClick = onPage(origin, toScreen(view.camera, target));

  await page.mouse.click(squadClick.x, squadClick.y);
  await page.keyboard.press('a');
  await page.mouse.click(orderClick.x, orderClick.y);
  await step(page, 1);

  const marching = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect(marching?.goal).not.toBeNull();
  expect((await applied(page)).map((entry) => entry.command.kind)).toContain('attackMove');

  await page.keyboard.press('s');
  await step(page, 1);

  const held = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect(held?.goal, 'Hold forgets the route').toBeNull();
  expect((await applied(page)).map((entry) => entry.command.kind)).toContain('hold');
});

test('attack-moves on a shift + right click, without arming anything', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const view = await describeView(page);
  const origin = await canvasOrigin(page);
  const squadClick = onPage(origin, at);
  const orderClick = onPage(origin, toScreen(view.camera, targetNear(squad)));

  await page.mouse.click(squadClick.x, squadClick.y);
  await page.keyboard.down('Shift');
  await page.mouse.click(orderClick.x, orderClick.y, { button: 'right' });
  await page.keyboard.up('Shift');
  await step(page, 1);

  const marching = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect(marching?.goal).not.toBeNull();
  expect((await applied(page)).map((entry) => entry.command.kind)).toContain('attackMove');
});

test('sends a Withdraw as a real Command, even though the rules obey it later', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const click = onPage(await canvasOrigin(page), at);

  await page.mouse.click(click.x, click.y);
  await page.keyboard.press('w');
  await step(page, 1);

  // Combat is out of scope (C3 owns what a withdrawal *does*), so what the page
  // can be held to is that the Command left the interface and reached the Match.
  const withdrawn = (await applied(page)).filter((entry) => entry.command.kind === 'withdraw');
  expect(withdrawn).toHaveLength(1);
  expect(withdrawn[0]?.command).toMatchObject({ kind: 'withdraw', faction: 'rome', squads: [squad.id] });
});

test('binds a control group, drops the selection, and recalls the group with its digit', async ({ page }) => {
  await boot(page);
  const { squad, at } = await clickableSquad(page);
  const origin = await canvasOrigin(page);
  const click = onPage(origin, at);

  await page.mouse.click(click.x, click.y);
  await page.keyboard.press('Control+1');
  await step(page, 1);

  expect(await groupOf(page, 1)).toEqual([squad.id]);
  expect((await applied(page)).map((entry) => entry.command.kind)).toContain('group');

  // A click on the theatre away from every Squad drops the selection, and the
  // digit brings the group back.
  const view = await describeView(page);
  const empty = toScreen(view.camera, { x: 4, y: 4 });
  if (empty.x >= 0 && empty.y >= 0 && empty.x < view.width && empty.y < view.height) {
    const pageAt = onPage(origin, empty);
    await page.mouse.click(pageAt.x, pageAt.y);
  } else {
    await page.keyboard.press('Escape');
  }
  expect((await selection(page)).squads).toEqual([]);

  await page.keyboard.press('1');
  expect((await selection(page)).squads).toEqual([squad.id]);
});

test('says nothing to the Match when a click hits the interface instead of the map', async ({ page }) => {
  await boot(page);
  const rects = await covered(page);
  const list = rects[1];
  if (list === undefined) throw new Error('the page has no list panel');

  const origin = await canvasOrigin(page);
  const row = onPage(origin, { x: list.x + 4, y: list.y + 4 });
  await page.mouse.click(row.x, row.y);

  // The list's first row is a settlement, so the panel follows it and no Squad
  // is picked: a click on the interface is not a click on the theatre.
  expect((await selection(page)).squads).toEqual([]);
});
