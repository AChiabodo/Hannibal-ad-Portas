/**
 * The small real-browser smoke (ticket #64).
 *
 * This is not a smaller copy of the complete acceptance matrix. It answers three
 * questions that a change to the page can break immediately, in under ninety
 * seconds on the recorded environment:
 *
 * 1. **does the real entry boot?** `/` opens setup, the boot report says which
 *    renderer and WebGL version it got, and the frame it drew is not empty;
 * 2. **does an ordinary gesture still reach the Match?** a Player's click picks a
 *    Squad, a right click gives it somewhere to walk, and the shared human
 *    Controller applies the Command the page reports;
 * 3. **is the frame and the console healthy?** the same run samples the pixels it
 *    drew and reads the console, the page errors and the failed requests, so a
 *    broken shader or a thrown integration error is a failure here rather than
 *    the first thing complete acceptance notices.
 *
 * It opens no art catalogue, no economy panel and no HUD matrix: those belong to
 * the responsibilities in `scripts/profiles.mjs`, and `test:feature` selects
 * them without running each other.
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { stageToScreen } from '../src/render/camera';
import { generateMap, isWalkable, terrainAt, MAP_WIDTH } from '../src/sim/map';
import { tilePixel } from '../src/render/terrain';
import type { SquadReport } from '../src/render/game';
import { advance, applied, describeView, dismissFirstEntry, hudLayout, hudRows, hudRects, press, samples, selection, squads, state } from './hooks';

/** The seed the smoke Match is played on: the setup page's fixture seed. */
const SEED = 7;

/** The theatre the Match generates, so the smoke knows which ground can be walked. */
const MAP = generateMap(SEED);

/** A page point, which is what a mouse is moved to. */
interface Point {
  readonly x: number;
  readonly y: number;
}

/** Opens the real entry and waits for the screen the page says it reached. */
async function openEntry(page: Page): Promise<void> {
  await dismissFirstEntry(page);
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=rome&difficulty=tiro`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
  await page.evaluate(() => window.__SPQR.game?.pause());
}

/** Where the canvas's top-left corner is on the page. */
async function canvasOrigin(page: Page): Promise<Point> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

/** The middle of a Squad's block, in theatre pixels. */
function middleOf(squad: SquadReport): Point {
  return { x: squad.rect.x + Math.floor(squad.rect.width / 2), y: squad.rect.y + Math.floor(squad.rect.height / 2) };
}

/** A walkable tile a few tiles east of a Squad, which is where the smoke sends it. */
function targetNear(squad: SquadReport): Point {
  for (let across = 3; across < 12; across += 1) {
    const x = squad.x + across;
    if (x >= MAP_WIDTH) break;
    if (!isWalkable(terrainAt(MAP, x, squad.y))) continue;

    return tilePixel(x, squad.y);
  }

  throw new Error(`no walkable tile east of (${String(squad.x)}, ${String(squad.y)})`);
}

/** A Squad whose block the interface does not cover, and where to click it. */
async function clickableSquad(page: Page): Promise<{ readonly squad: SquadReport; readonly at: Point }> {
  const view = await describeView(page);
  const covered = await hudRects(page);

  for (const squad of await squads(page)) {
    const middle = middleOf(squad);
    const at = stageToScreen(view.camera, middle.x, middle.y);
    if (at.x < 0 || at.y < 0 || at.x >= view.width || at.y >= view.height) continue;
    if (covered.some((rect) => at.x >= rect.x && at.x < rect.x + rect.width && at.y >= rect.y && at.y < rect.y + rect.height)) continue;

    return { squad, at };
  }

  throw new Error('no Squad is visible outside the interface, so nothing can be clicked');
}

test('boots the real entry, reports its renderer and paints the setup screen', async ({ page, spqr }) => {
  await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const boot = await page.evaluate(() => window.__SPQR.boot);
  expect(boot.booted, 'the page booted').toBe(true);
  if (!boot.booted) throw new Error(boot.error);
  expect(boot.render.engine, 'a renderer answered').toBeTruthy();
  expect(boot.render.webglVersion, 'the frame came through WebGL').toBeGreaterThanOrEqual(2);
  expect(boot.render.width, 'the canvas has a viewport').toBeGreaterThan(0);
  expect(boot.render.height).toBeGreaterThan(0);
  expect(boot.render.pixel[3], 'the first frame drew an opaque pixel').toBe(255);

  // Setup publishes no Match, which is its own promise (BROWSER.md, #53).
  const pages = await page.evaluate(() => ({
    game: window.__SPQR.game, view: window.__SPQR.view, atelier: window.__SPQR.atelier,
  }));
  expect(pages).toEqual({ game: null, view: null, atelier: null });

  const diagnosis = await spqr.diagnosis();
  expect(diagnosis.errors, 'boot logged no error and no failed request').toEqual([]);
  expect(diagnosis.console.filter((line) => line.startsWith('[error]'))).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('picks a Squad and moves it with a real pointer gesture, and the Match applies the Command', async ({ page, spqr }) => {
  await openEntry(page);

  // The real Match opens with no free army (#53), so the ordinary path begins by
  // raising a line from the settlement's own recruitment page: rows and cards are
  // pressed where the page drew them, not called through a hook.
  const home = (await state(page)).visible.settlements[0];
  expect(home, 'the Faction holds its Stronghold').toBeDefined();
  if (home === undefined) throw new Error('no Stronghold');
  const row = (await hudRows(page)).find((entry) => entry.selection.kind === 'settlement' && entry.selection.id === home.id);
  expect(row, 'the Stronghold has a navigator row').toBeDefined();
  if (row === undefined) throw new Error('no Stronghold row');
  await press(page, row.rect);
  const tab = (await hudLayout(page)).tabs.find((entry) => entry.tab === 'recruitment');
  expect(tab, 'the settlement has a recruitment page').toBeDefined();
  if (tab === undefined) throw new Error('no recruitment tab');
  await press(page, tab.rect);
  const card = (await hudLayout(page)).commands.find((entry) => entry.order.id === 'recruit:hastati:24');
  expect(card, 'a hastati line is on offer').toBeDefined();
  if (card === undefined) throw new Error('no hastati card');
  await press(page, card.rect);
  await page.evaluate(() => window.__SPQR.game?.resume());
  await advance(page, 1);
  await page.evaluate(() => window.__SPQR.game?.pause());

  const { squad, at } = await clickableSquad(page);
  const view = await describeView(page);
  const origin = await canvasOrigin(page);
  const target = targetNear(squad);
  const order = stageToScreen(view.camera, target.x, target.y);

  await page.mouse.click(origin.x + at.x, origin.y + at.y);
  expect((await selection(page)).squads, 'the click picked the Squad the page drew').toEqual([squad.id]);

  await page.mouse.click(origin.x + order.x, origin.y + order.y, { button: 'right' });
  await page.evaluate(() => window.__SPQR.game?.resume());
  await advance(page, 1);
  await page.evaluate(() => window.__SPQR.game?.pause());

  const ordered = (await squads(page)).find((candidate) => candidate.id === squad.id);
  expect(ordered?.goal, 'the right click gave the Squad a destination').not.toBeNull();
  expect((await applied(page)).map((entry) => entry.command.kind), 'the order is a real Command').toContain('move');

  // Rendering health: the frame the page presented has colour where the Squad
  // stands, and the sample is the page's own read-back rather than a canvas
  // screenshot.
  const [drawn] = await samples(page, 'view', [[Math.round(at.x), Math.round(at.y)]]);
  expect(drawn?.[3], 'the theatre is opaque where the Squad stands').toBe(255);
  expect([drawn?.[0], drawn?.[1], drawn?.[2]], 'the block is not a blank plate').not.toEqual([0, 0, 0]);

  const diagnosis = await spqr.diagnosis();
  expect(diagnosis.errors, 'the ordinary path logged no error and no failed request').toEqual([]);
  expect(diagnosis.console.filter((line) => line.startsWith('[error]'))).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});

test('serves the Atelier catalogue and paints it', async ({ page, spqr }) => {
  await page.goto('/atelier.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const report = await page.evaluate(() => window.__SPQR.atelier?.report);
  expect(report?.width, 'the catalogue has a canvas').toBeGreaterThan(0);
  expect(report?.height).toBeGreaterThan(0);
  expect(report?.sections.length, 'the catalogue laid out its columns').toBeGreaterThan(0);

  const [drawn] = await page.evaluate(() => {
    const atelier = window.__SPQR.atelier;
    if (atelier === null) throw new Error('the page published no atelier hooks');

    const { width, height } = atelier.report;

    return atelier.samples([[Math.floor(width / 2), Math.floor(height / 2)]]);
  });
  expect(drawn?.[3], 'the catalogue frame is opaque').toBe(255);

  const diagnosis = await spqr.diagnosis();
  expect(diagnosis.errors).toEqual([]);
  expect(diagnosis.console.filter((line) => line.startsWith('[error]'))).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
