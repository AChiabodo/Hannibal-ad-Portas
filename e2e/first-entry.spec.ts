/**
 * First-entry guidance and integrated acceptance on the real page (ticket U8).
 *
 * The unit suite pins what the guide is (`tests/ui/guide.test.ts`, the HUD's
 * geometry in `tests/ui/hud.test.ts`). This spec is the other half: a fresh
 * profile opens the actual Match page, and the guide's promises are held to what
 * a pointer does.
 *
 * 1. **Setup says what the Match is**: Faction, difficulty and the objective, in
 *    Italian, before the Player commits to either side.
 * 2. **The guide starts paused and waits**: tick 0 while wall time passes, and
 *    only *Inizia* starts the clock.
 * 3. **It teaches through the real interface**: clicking the drawn Stronghold,
 *    the Recruitment page, the recruit card, the drawn soldiers and the ground —
 *    no hook does the walking. The recruit and the move are real Commands, read
 *    back off the `applied` log.
 * 4. **Its result is legible**: a queued order says it is pending, an applied
 *    one says it was submitted, and the Squad says it is marching.
 * 5. **It can be skipped, dismissed and reopened**, and the dismissal is the only
 *    presentation preference it writes (Q22).
 * 6. **It knows no enemy**: its lines are fixed text, and opening, skipping or
 *    closing it issues no Command and moves no clock it was not holding.
 *
 * The scenes are written outside the repository (the guard forbids committed
 * images), under `SPQR_VISUAL_DIR/issue59`. They are evidence a human reviews;
 * what this spec asserts is data, clicks and outcomes, and it does not treat a
 * matching hash as a visual verdict.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { stageToScreen } from '../src/render/camera';
import { TERRAIN } from '../src/sim/map';
import { HUD_BACKGROUND } from '../src/ui/hud';
import { translate } from '../src/ui/strings';
import type { GuidePanel } from '../src/ui/guide';
import {
  advance,
  applied,
  covers,
  describeView,
  dismissFirstEntry,
  fastForward,
  hud,
  hudLayout,
  hudRects,
  press,
  samples,
  selection,
  sites,
  squads,
  state,
  tickOf,
} from './hooks';

/** The seed every scene is made on, so a screenshot can be reproduced. */
const SEED = 59;

const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

const FACTIONS = ['rome', 'carthage'] as const;
type Faction = (typeof FACTIONS)[number];

/** Opens the real Match page, on a first-entry profile, at the viewport asked for. */
async function openFirstEntry(page: Page, faction: Faction, size: { width: number; height: number }): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
}

/** The canvas's offset from the page's origin, so a theatre point becomes a click. */
async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

/** Clicks one canvas point, as a pointer does. */
async function clickCanvas(page: Page, point: { readonly x: number; readonly y: number }, button: 'left' | 'right' = 'left'): Promise<void> {
  const origin = await canvasOrigin(page);
  await page.mouse.click(origin.x + point.x, origin.y + point.y, { button });
}

/** A theatre rectangle's middle, in canvas pixels. */
function centreOf(rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }, camera: { readonly x: number; readonly y: number; readonly zoom: number }): { x: number; y: number } {
  return stageToScreen(camera, rect.x + Math.floor(rect.width / 2), rect.y + Math.floor(rect.height / 2));
}

/** Presses one of the guide's controls by the name the layout gives it. */
async function pressGuide(page: Page, action: 'guideBegin' | 'guideSkip' | 'guideClose'): Promise<void> {
  const rect = await page.evaluate((wanted) => window.__SPQR.game?.hudLayout().guideButtons
    .find((button) => button.action === wanted)?.rect, action);
  expect(rect, `the guide offers ${action}`).toBeDefined();
  if (rect === undefined) throw new Error(`the guide offers no ${action}`);
  await press(page, rect);
}

/** The whole guide panel, as the HUD model reports it. */
async function guide(page: Page): Promise<GuidePanel | null> {
  return (await hud(page)).guide;
}

test.describe('setup explains the Match being configured', () => {
  for (const size of RESOLUTIONS) {
    test(`states Faction, difficulty and the objective at ${String(size.width)}x${String(size.height)}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/');
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'menu');
  await page.keyboard.press('Enter');
      await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'setup');
      const label = await page.locator('#app canvas').getAttribute('aria-label');
      expect(label).toContain(translate('match.objective'));
      expect(label).toContain(translate('match.factionHelp'));
      expect(label).toContain(translate('match.difficultyHelp'));
      expect(label).toContain(`${translate('match.faction')}: ${translate('faction.rome')}`);
      expect(label).toContain(`${translate('match.difficulty')}: ${translate('difficulty.centurio')}`);

      await capture(page, `setup-${String(size.width)}x${String(size.height)}`, 'issue59');
    });
  }
});

test.describe('the guide waits, teaches and gets out of the way', () => {
  for (const faction of FACTIONS) for (const size of RESOLUTIONS) {
    test(`opens paused for ${faction} at ${String(size.width)}x${String(size.height)}`, async ({ page }) => {
      await openFirstEntry(page, faction, size);

      const opening = await guide(page);
      expect(opening?.stage, 'the guide starts on its welcome line').toBe('welcome');
      expect(opening?.actions.map((action) => action.action)).toEqual(['guideBegin', 'guideSkip']);
      expect(await page.evaluate(() => window.__SPQR.game?.paused()), 'the Match starts paused').toBe(true);

      // Wall time does not move the clock the welcome line is holding.
      await page.waitForTimeout(250);
      expect(await tickOf(page)).toBe(0);
      await capture(page, `welcome-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // The settlement the guide will ask the Player to open is on screen, and the
      // guide is not sitting on top of it: one pointer click reaches both.
      const home = (await sites(page)).find((site) => site.owner === faction && site.kind === 'stronghold');
      expect(home, `${faction} sees its own Stronghold`).toBeDefined();
      if (home === undefined) return;
      const camera = (await describeView(page)).camera;
      const at = { ...centreOf(home.rect, camera) };
      expect((await hudRects(page)).some((rect) => covers(rect, at.x, at.y)), 'the Stronghold is bare theatre').toBe(false);

      await pressGuide(page, 'guideBegin');
      expect((await guide(page))?.stage).toBe('stronghold');
      await expect.poll(() => page.evaluate(() => window.__SPQR.game?.paused()), 'Inizia resumes the clock').toBe(false);
      await expect.poll(() => tickOf(page), 'the Match is running').toBeGreaterThan(0);

      await clickCanvas(page, at);
      expect((await selection(page)).settlement).toBe(home.id);
      expect((await guide(page))?.stage, 'opening a settlement moves the guide on').toBe('recruit');

      await capture(page, `settlement-open-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');
    });
  }
});

test('the four acts are performed through the pointed-at interface, and their result is legible', async ({ page }) => {
  test.setTimeout(90_000);
  await openFirstEntry(page, 'rome', RESOLUTIONS[0]);
  await pressGuide(page, 'guideBegin');
  // One deterministic tick at a time from here: the walkthrough is about what a
  // pointer produces, not about how fast the frame loop is.
  await page.evaluate(() => window.__SPQR.game?.pause());

  // 1. Opening the settlement: a click on the structure the layer drew.
  const home = (await sites(page)).find((site) => site.owner === 'rome' && site.kind === 'stronghold');
  if (home === undefined) throw new Error('Rome sees no Stronghold');
  let camera = (await describeView(page)).camera;
  await clickCanvas(page, centreOf(home.rect, camera));
  expect((await selection(page)).settlement).toBe(home.id);

  // The page offers its two other pages as tabs, and the Recruitment page offers
  // the first line with its cost and its men.
  const tabs = await page.evaluate(() => window.__SPQR.game!.hudLayout().tabs);
  const recruitment = tabs.find((tab) => tab.tab === 'recruitment');
  expect(recruitment, 'the settlement panel has a Recruitment page').toBeDefined();
  if (recruitment === undefined) throw new Error('no recruitment page');
  await press(page, recruitment.rect);

  const offers = (await hud(page)).commands;
  const line = offers.find((order) => order.id === 'recruit:hastati:24');
  expect(line, 'the Recruitment page offers hastati').toBeDefined();
  expect(line?.enabled, 'the opening resources can raise the first line').toBe(true);
  if (line === undefined) throw new Error('no hastati offer');

  // 2. Recruiting: the card itself, one press.
  const card = (await hudLayout(page)).commands.find((command) => command.order.id === 'recruit:hastati:24');
  expect(card, 'the card is drawn where the panel says').toBeDefined();
  if (card === undefined) throw new Error('no card to press');
  await press(page, card.rect);
  await press(page, (await hudLayout(page)).buttons.find((button) => button.action === 'purchase:recruit:hastati:24')!.rect);
  expect((await guide(page))?.stage, 'a submitted recruit moves the guide to selection').toBe('select');
  expect((await hud(page)).orders.last?.status, 'a paused order is queued, not applied').toBe('pending');
  expect((await hud(page)).orders.pending).toBe(1);
  const pendingLayout = await hudLayout(page);
  expect([...pendingLayout.status, ...pendingLayout.text, ...pendingLayout.priority].map((entry) => entry.text).join(' '))
    .toContain(translate('ui.pendingPaused').replace('{count}', '1'));
  await capture(page, 'recruit-pending-1280x720', 'issue59');

  await advance(page, 1);
  const raised = await squads(page);
  expect(raised.length, 'the recruit reached the Match').toBe(1);
  expect((await applied(page)).some(({ command }) => command.kind === 'recruit')).toBe(true);
  const report = raised[0]!;

  // 3. Selecting it: a click on the soldiers, not a hook.
  camera = (await describeView(page)).camera;
  await clickCanvas(page, centreOf(report.rect, camera));
  expect((await selection(page)).squads).toEqual([report.id]);
  expect((await guide(page))?.stage, 'selecting the Squad completes that line').toBe('move');

  // The Commands the guide told the Player to find are there, with their words
  // and their keys, and the move is on offer for the picked Squad.
  const commands = (await hud(page)).commands;
  const move = commands.find((order) => order.id === 'move');
  expect(move?.label).toBe(translate('cmd.move'));
  expect(move?.enabled).toBe(true);
  expect(commands.some((order) => order.shortcut !== null), 'the card names keys beside its pictures').toBe(true);

  // 4. Marching: the classic right click on ground the Player can see. The tile is
  // chosen from the Faction's own terrain, so the order is one the rules can take.
  const snapshot = await state(page);
  const tiles = snapshot.visible.fog.terrain;
  const ground = [...tiles.entries()]
    .map(([index, terrain]) => ({ index, terrain, x: index % 96, y: Math.floor(index / 96) }))
    .filter(({ terrain, x, y }) => terrain !== 255 && terrain !== TERRAIN.river &&
      Math.max(Math.abs(x - report.x), Math.abs(y - report.y)) === 3 &&
      !snapshot.visible.settlements.some((site) => site.x === x && site.y === y));
  expect(ground.length, 'there is known ground beside the Squad').toBeGreaterThan(0);

  const rects = await hudRects(page);
  let marched = false;
  for (const tile of ground) {
    const at = stageToScreen(camera, tile.x * 16 + 8, tile.y * 16 + 8);
    if (rects.some((rect) => covers(rect, at.x, at.y))) continue;
    if (at.x < 4 || at.y < 4 || at.x > RESOLUTIONS[0].width - 4 || at.y > RESOLUTIONS[0].height - 4) continue;
    await clickCanvas(page, at, 'right');
    await advance(page, 1);
    const now = (await squads(page)).find((entry) => entry.id === report.id);
    if (now?.goal !== null) { marched = true; break; }
  }
  expect(marched, 'a right click gave the Squad somewhere to walk').toBe(true);
  expect((await applied(page)).some(({ command }) => command.kind === 'move' &&
    command.squads.includes(report.id)), 'the move is a real Command').toBe(true);
  expect((await guide(page))?.stage, 'the move completes the guide').toBe('complete');

  // The panel answers the order: submitted, and the Squad says it is on the march.
  expect((await hud(page)).orders.last?.status, 'the queued order has now reached the Match').toBe('applied');
  expect((await hud(page)).detail?.lines.some((entry) => entry.value === translate('order.marching')),
    'the Squad panel says it is marching').toBe(true);
  await capture(page, 'order-result-1280x720', 'issue59');

  await pressGuide(page, 'guideClose');
  expect(await guide(page), 'the completed guide closes').toBeNull();
  expect((await page.evaluate(() => window.__SPQR.game?.preferences()))?.guideDismissed).toBe(true);
});

test('the guide panel is drawn on the frame, and the theatre under it is the panel’s', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openFirstEntry(page, 'rome', RESOLUTIONS[0]);
  const layout = await hudLayout(page);
  expect(layout.guide.width, 'the welcome panel has a rectangle').toBeGreaterThan(0);
  expect((await hudRects(page)).some((rect) => rect.x === layout.guide.x && rect.y === layout.guide.y &&
    rect.width === layout.guide.width && rect.height === layout.guide.height), 'the click test and the frame agree')
    .toBe(true);

  // The title line is written in the HUD's bright ink on the panel's night ground:
  // sample across it and find ink, which is what "the panel was drawn" means
  // without asserting what the glyphs look like.
  const title = layout.guideText[0]!;
  const points: [number, number][] = [];
  for (let y = title.rect.y; y < title.rect.y + title.rect.height; y += 1) {
    for (let x = title.rect.x; x < title.rect.x + title.rect.width; x += 1) points.push([x, y]);
  }
  const painted = (await samples(page, 'view', points)).filter((pixel) =>
    pixel[0] !== HUD_BACKGROUND[0] || pixel[1] !== HUD_BACKGROUND[1] || pixel[2] !== HUD_BACKGROUND[2]);
  expect(painted.length, 'the guide title is ink on the frame').toBeGreaterThan(0);

  // A click on the panel is not a click on the theatre behind it.
  await clickCanvas(page, { x: layout.guide.x + 6, y: layout.guide.y + 6 });
  expect((await selection(page)).settlement).toBeNull();
  expect((await guide(page))?.stage).toBe('welcome');
});

test('Space begins the Match too, and the guide moves on with it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openFirstEntry(page, 'rome', RESOLUTIONS[0]);
  expect((await guide(page))?.stage).toBe('welcome');

  // The keyboard's own pause control is a beginning: the welcome line is waiting
  // for the Player to start, and pressing Space is starting.
  await page.keyboard.press('Space');
  await expect.poll(() => page.evaluate(() => window.__SPQR.game?.paused())).toBe(false);
  expect((await guide(page))?.stage).toBe('stronghold');
});

test('a skipped guide stays dismissed across Matches and reopens from the options menu', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openFirstEntry(page, 'rome', RESOLUTIONS[0]);
  await pressGuide(page, 'guideSkip');

  expect(await guide(page), 'skipping puts the panel away').toBeNull();
  expect(await page.evaluate(() => window.__SPQR.game?.paused()), 'skipping releases the guide’s own pause').toBe(false);
  expect((await page.evaluate(() => window.__SPQR.game?.preferences()))?.guideDismissed).toBe(true);

  // A returning Player's page does not open a guide, and is not left paused by one.
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  expect(await guide(page)).toBeNull();
  expect(await page.evaluate(() => window.__SPQR.game?.paused())).toBe(false);

  // The Player pauses the Match themselves, then opens the Guide from Options.
  // *Inizia* promises to resume the clock and must do it even though the Guide
  // did not take this pause.
  await page.evaluate(() => window.__SPQR.game?.pause());

  // The options drawer is where it is reopened, as it says.
  const options = (await hudLayout(page)).buttons.find((button) => button.action === 'session');
  expect(options, 'the bar has an options control').toBeDefined();
  if (options === undefined) return;
  await press(page, options.rect);
  await press(page, await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons.find((button) => button.action === 'settings')!.rect));
  const reopen = (await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons
    .find((button) => button.action === 'guide')?.text));
  expect(reopen).toBe(translate('ui.openGuide'));
  const button = (await page.evaluate(() => window.__SPQR.game!.matchLayout().buttons
    .find((entry) => entry.action === 'guide')?.rect));
  if (button === undefined) throw new Error('the options menu has no guide control');
  await press(page, button);

  expect((await guide(page))?.stage, 'reopening starts at the welcome line').toBe('welcome');
  expect(await page.evaluate(() => window.__SPQR.game?.paused()), 'a reopened guide holds the clock').toBe(true);
  expect((await page.evaluate(() => window.__SPQR.game?.preferences()))?.guideDismissed).toBe(false);

  await pressGuide(page, 'guideBegin');
  await expect.poll(() => page.evaluate(() => window.__SPQR.game?.paused())).toBe(false);
});

test('the guide reads no enemy knowledge and issues no Command', async ({ page }) => {
  await dismissFirstEntry(page);
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=rome&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => window.__SPQR.game?.pause());

  // A returning Player has no guide at all; the preference is the only memory.
  expect(await guide(page)).toBeNull();

  // Reopen it for this Match: its lines are the fixed Italian sentences, with no
  // id, coordinate or Faction name — nothing an Observation could have supplied.
  const reopened = await page.evaluate(() => {
    const game = window.__SPQR.game!;
    game.toggleGuide();
    return game.hud().guide;
  });
  expect(reopened?.stage).toBe('welcome');
  for (const line of reopened?.lines ?? []) {
    expect(line).not.toMatch(/\d/);
    expect(line).not.toMatch(/\b(Roma|Cartagine)\b/);
  }

  const before = await page.evaluate(() => window.__SPQR.game!.hash());
  // With the clock stopped, toggling the panel off is the only thing that
  // happens: no Command is issued, and the state hash is the rules' own.
  await page.evaluate(() => window.__SPQR.game!.toggleGuide());
  expect(await page.evaluate(() => window.__SPQR.game!.hash())).toBe(before);
  expect(await applied(page)).toEqual([]);
});

test('plays a whole browser Match for both Factions to a real ending', async ({ page }) => {
  test.setTimeout(180_000);

  for (const faction of FACTIONS) {
    await dismissFirstEntry(page);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=tiro`);
    await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');

    const result = await fastForward(page);
    const ended = await state(page);
    expect(result.kind, `${faction}: the Match ended by an existing rule`).toMatch(/^(victory|draw|clock)$/);
    expect(result.tick).toBeLessThanOrEqual(ended.bound);
    expect(ended.result).toEqual(result);
    expect(ended.hash).toMatch(/^[0-9a-f]{16}$/);
    // A finished Match does not step again, whatever the wall clock does.
    await page.waitForTimeout(200);
    expect(await tickOf(page)).toBe(result.tick);
    expect(await page.evaluate(() => window.__SPQR.game!.fastForward())).toEqual(result);

    const menu = await page.evaluate(() => window.__SPQR.game!.matchLayout());
    expect(menu.lines.length, 'the result and the final known situation are announced').toBeGreaterThan(1);
    await capture(page, `match-end-${faction}-${String(result.kind)}`, 'issue59');
  }
});
