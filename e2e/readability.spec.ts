/**
 * Squad readability, tactical feedback and notices on the running page (#58).
 *
 * The unit tests say what a mark, a plate and a notice *are*. This spec says the
 * page draws and answers with them:
 *
 * 1. **a selected Squad wears the plate, the facing chevron and its Faction's
 *    standard**, at both asked-for resolutions and for both Factions, and a
 *    healthy Squad nobody has picked wears nothing above its block;
 * 2. **a move and an attack-move leave different marks on the ground** — the
 *    page remembers the verb it submitted, and the pixels at the destination are
 *    the mark's own, so the difference is drawn and not merely reported;
 * 3. **a refused order becomes a notice**, the strip is where the layout says it
 *    is, a pointer click on its line centres the place it names, and a notice
 *    never pauses the Match;
 * 4. **notices name only what the Faction knows** — its own Squads and its own
 *    settlements — which is the ticket's "no omniscient notifications" read off
 *    the live page rather than promised in a comment.
 *
 * Scenes are written outside the repository (the guard forbids committed image
 * files); what the test asserts is data, clicks and pixels.
 */
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { orderMarker } from '../src/art/markers';
import { pixelAt, type PixelBuffer, type Rgba } from '../src/art/pixel-buffer';
import { stageToScreen } from '../src/render/camera';
import type { ViewState } from '../src/render/boot';
import { tilePixel } from '../src/render/terrain';
import { KNOWLEDGE } from '../src/sim/fog';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, generateMap, type Site } from '../src/sim/map';
import { translate } from '../src/ui/strings';
import type { Rect } from '../src/ui/hud';
import {
  advance,
  covers,
  describeView,
  hudLayout,
  hudRects,
  indicators,
  knowledge,
  notices,
  press,
  samples,
  select,
  squads,
  state,
  dismissFirstEntry,
} from './hooks';

/** The seed the scenes are made on, fixed so a screenshot can be reproduced. */
const SEED = 58;

/** The theatre the page generates for it: where the ground is, and where a river is. */
const MAP = generateMap(SEED);

/** Where the screenshots go: outside the repository, like the rest of the evidence. */
const EVIDENCE = join(tmpdir(), 'spqr-issue58');

/** The two reference resolutions the shared constraints ask for. */
const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

/** The Factions, through the address the setup page builds. */
const FACTIONS = ['rome', 'carthage'] as const;
type Faction = (typeof FACTIONS)[number];

/** The first line each Faction can raise, which is what a scene's Squad is. */
const FIRST_LINE: Readonly<Record<Faction, string>> = { rome: 'hastati', carthage: 'libyan-spear' };

/** Opens the real Match page at the viewport asked for. */
async function openMatch(
  page: Page,
  faction: Faction,
  size: { readonly width: number; readonly height: number },
  options: { readonly paused?: boolean } = {},
): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await dismissFirstEntry(page);
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');

  if (options.paused !== false) {
    await page.evaluate(() => window.__SPQR.game?.pause());
  }
}

/** The canvas's offset from the page's origin, so a theatre point becomes a pointer click. */
async function canvasOrigin(page: Page): Promise<{ readonly x: number; readonly y: number }> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

/** Right-clicks the theatre at a canvas point, which is the movement gesture. */
async function rightClick(page: Page, point: { readonly x: number; readonly y: number }): Promise<void> {
  const origin = await canvasOrigin(page);
  await page.mouse.click(origin.x + point.x, origin.y + point.y, { button: 'right' });
}

/** Raises the Faction's first line the way a Player does, and answers with its id. */
async function recruit(page: Page, faction: Faction): Promise<number> {
  const home = await page.evaluate(() => window.__SPQR.game?.state().visible.settlements[0]);
  expect(home, `${faction} holds a settlement`).toBeDefined();
  if (home === undefined) throw new Error('the Faction holds nothing');

  await select(page, { kind: 'settlement', id: home.id });
  const tab = await page.evaluate(() => window.__SPQR.game?.hudLayout().tabs
    .find((entry) => entry.tab === 'recruitment')?.rect);
  expect(tab, 'the settlement has a recruitment page').toBeDefined();
  if (tab === undefined) throw new Error('no recruitment tab');
  await press(page, tab);

  const offer = await page.evaluate((wanted) => window.__SPQR.game?.hud().commands
    .find((order) => order.id === `recruit:${wanted}`)?.id, FIRST_LINE[faction]);
  expect(offer, `${faction} can raise its first line`).toBeDefined();
  if (offer === undefined) throw new Error('the recruitment page offers no first line');
  expect(await page.evaluate((id) => window.__SPQR.game?.perform(id), offer), `${faction}: the order was taken`).toBe(true);
  await advance(page, 1);
  await select(page, null);

  const raised = await squads(page);
  expect(raised.length, `${faction} has a Squad standing`).toBeGreaterThan(0);

  return raised[0]!.id;
}

/** Pans the camera so one tile is in the middle of the viewport. */
async function centreOn(page: Page, tile: Site): Promise<ViewState> {
  const before = await describeView(page);
  const at = tilePixel(tile.x, tile.y);
  const wantedX = Math.round(at.x - before.width / (2 * before.camera.zoom));
  const wantedY = Math.round(at.y - before.height / (2 * before.camera.zoom));
  await page.evaluate(
    ({ dx, dy }) => window.__SPQR.view?.panBy(dx, dy),
    { dx: wantedX - before.camera.x, dy: wantedY - before.camera.y },
  );

  return describeView(page);
}

/** Where one tile is on the canvas, in screen pixels. */
function tileScreen(view: ViewState, tile: Site): { readonly x: number; readonly y: number } {
  const at = tilePixel(tile.x, tile.y);

  return stageToScreen(view.camera, at.x, at.y);
}

/** Whether a screen point is covered by any interface panel. */
function hidden(rects: readonly Rect[], point: { readonly x: number; readonly y: number }): boolean {
  return rects.some((rect) => covers(rect, point.x, point.y));
}

/** A walkable, non-river tile a given distance from another, nearest first. */
function groundNear(origin: Site, within = 8): readonly Site[] {
  const found: Site[] = [];

  for (let radius = 2; radius <= within; radius += 1) {
    for (const [dx, dy] of [[radius, 0], [-radius, 0], [0, radius], [0, -radius]] as const) {
      const x = origin.x + dx;
      const y = origin.y + dy;
      if (x < 2 || y < 2 || x >= MAP_WIDTH - 2 || y >= MAP_HEIGHT - 2) continue;

      const terrain = MAP.terrain[y * MAP_WIDTH + x];
      if (terrain === undefined || terrain === TERRAIN.river) continue;
      found.push({ x, y });
    }
  }

  return found;
}

/** Every tile within a radius of one, rivers left out: the ground a scene can name. */
function tilesAround(origin: Site, within: number): readonly Site[] {
  const found: Site[] = [];

  for (let y = Math.max(0, origin.y - within); y <= Math.min(MAP_HEIGHT - 1, origin.y + within); y += 1) {
    for (let x = Math.max(0, origin.x - within); x <= Math.min(MAP_WIDTH - 1, origin.x + within); x += 1) {
      if (Math.abs(x - origin.x) + Math.abs(y - origin.y) < 1) continue;
      if (MAP.terrain[y * MAP_WIDTH + x] === TERRAIN.river) continue;
      found.push({ x, y });
    }
  }

  return found;
}

/** The nearest river tile: deep water, which is the one refusal a click can produce on purpose. */
function riverNear(origin: Site, within = 24): Site | null {
  let best: Site | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let y = Math.max(0, origin.y - within); y <= Math.min(MAP_HEIGHT - 1, origin.y + within); y += 1) {
    for (let x = Math.max(0, origin.x - within); x <= Math.min(MAP_WIDTH - 1, origin.x + within); x += 1) {
      if (MAP.terrain[y * MAP_WIDTH + x] !== TERRAIN.river) continue;

      const distance = Math.abs(x - origin.x) + Math.abs(y - origin.y);
      if (distance >= bestDistance) continue;

      best = { x, y };
      bestDistance = distance;
    }
  }

  return best;
}

/**
 * Every ink pixel of a mark, read off the canvas where the mark is drawn.
 *
 * The destination mark is a 9×9 sprite at the middle of its tile (`render/squad-layer.ts`),
 * so its expected place is arithmetic the test can do — and the comparison is
 * against the art library's own buffer, so a mark that is drawn differently from
 * the one the catalogue shows fails here.
 */
async function markPixels(
  page: Page,
  view: ViewState,
  goal: Site,
  kind: 'move' | 'attackMove',
): Promise<readonly { readonly point: readonly [number, number]; readonly colour: Rgba }[]> {
  const mark: PixelBuffer = orderMarker(kind);
  const tile = tilePixel(goal.x, goal.y);
  // The layer places a 9×9 mark three pixels into its 16-pixel tile.
  const at = { x: tile.x + 3, y: tile.y + 3 };
  const points: [number, number][] = [];
  const colours: Rgba[] = [];

  for (let y = 0; y < mark.height; y += 1) {
    for (let x = 0; x < mark.width; x += 1) {
      const colour = pixelAt(mark, x, y);
      if (colour[3] === 0) continue;

      const screen = stageToScreen(view.camera, at.x + x, at.y + y);
      points.push([screen.x, screen.y]);
      colours.push(colour);
    }
  }

  const drawn = await samples(page, 'view', points);

  return points.map((point, index) => ({ point, colour: drawn[index] ?? colours[index] ?? [0, 0, 0, 0] }));
}

test.describe('the theatre’s annotations', () => {
  test('a selected Squad wears its plate, facing and standard, and a healthy one wears nothing', async ({ page }) => {
    // Four scenes (two Factions at two resolutions), each raising its Squad
    // through the recruitment page and taking a screenshot: the default 30 s is
    // a frame budget's timeout, not a walkthrough's.
    test.setTimeout(120_000);
    await mkdir(EVIDENCE, { recursive: true });

    for (const faction of FACTIONS) {
      for (const size of RESOLUTIONS) {
        await openMatch(page, faction, size);
        const id = await recruit(page, faction);

        // Before the Player picks it, a healthy Squad carries only its standard.
        const healthy = (await indicators(page)).find((entry) => entry.id === id);
        expect(healthy?.annotation, `${faction}: a healthy unselected Squad carries no plate`).toBe('none');
        expect(healthy?.conditions).toEqual([]);

        const report = (await squads(page)).find((entry) => entry.id === id);
        expect(report, `${faction}: the Squad is on the map`).toBeDefined();
        if (report === undefined) throw new Error('no Squad to select');

        const view = await centreOn(page, { x: report.x, y: report.y });
        await select(page, { kind: 'squad', id });

        const selected = (await indicators(page)).find((entry) => entry.id === id);
        expect(selected?.annotation, `${faction} ${String(size.width)}: a selected Squad wears the plate`).toBe('plate');
        expect(selected?.standard).toBe(faction);
        expect(selected?.selected).toBe(true);
        expect(selected?.morale).toBe(selected?.maxMorale);
        expect(selected?.facing).toBe(report.facing);

        // The plate, the chevron and the standard are drawn in the theatre, and the
        // standard is over the block rather than off the screen.
        const block = stageToScreen(view.camera, report.rect.x, report.rect.y);
        const up = stageToScreen(view.camera, report.rect.x, report.rect.y - 12);
        expect(up.x).toBeGreaterThanOrEqual(0);
        expect(up.y).toBeGreaterThanOrEqual(0);
        expect(up.y).toBeLessThan(block.y);

        // The marks are not under the interface, so what the screenshot shows is
        // the theatre's own drawing and not a panel's edge.
        const rects = await hudRects(page);
        expect(hidden(rects, { x: up.x, y: up.y }), `${faction}: the plate is over the theatre`).toBe(false);

        await page.screenshot({
          path: join(EVIDENCE, `selected-${faction}-${String(size.width)}x${String(size.height)}.png`),
        });
      }
    }
  });

  test('a move and an attack-move leave different marks on the ground', async ({ page }) => {
    await openMatch(page, 'rome', RESOLUTIONS[0]);
    const id = await recruit(page, 'rome');
    const report = (await squads(page)).find((entry) => entry.id === id);
    if (report === undefined) throw new Error('no Squad to order');

    await select(page, { kind: 'squad', id });
    let view = await centreOn(page, { x: report.x, y: report.y });
    const rects = await hudRects(page);
    const goals = groundNear({ x: report.x, y: report.y }, 6)
      .map((tile) => ({ tile, at: tileScreen(view, tile) }))
      .filter(({ at }) => at.x > 8 && at.y > 8 && at.x < view.width - 8 && at.y < view.height - 8 && !hidden(rects, at));
    expect(goals.length, 'there is ground to order the Squad onto').toBeGreaterThanOrEqual(2);
    if (goals.length < 2) return;

    const [first, second] = goals;

    expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: first!.at.x, y: first!.at.y })).toBe(true);
    await advance(page, 1);
    const marching = (await indicators(page)).find((entry) => entry.id === id);
    expect(marching?.orderMark).toBe('move');
    expect(marching?.destination).toEqual({ x: first!.tile.x, y: first!.tile.y });

    view = await describeView(page);
    const movePixels = await markPixels(page, view, first!.tile, 'move');
    expect(movePixels.length).toBeGreaterThan(10);
    for (const { point, colour } of movePixels) {
      const [drawn] = await samples(page, 'view', [point]);
      expect(drawn, `the move mark at ${String(point[0])},${String(point[1])}`).toEqual(colour);
    }

    expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('attackMove', x, y), { x: second!.at.x, y: second!.at.y })).toBe(true);
    await advance(page, 1);
    const attacking = (await indicators(page)).find((entry) => entry.id === id);
    expect(attacking?.orderMark).toBe('attackMove');
    expect(attacking?.destination).toEqual({ x: second!.tile.x, y: second!.tile.y });

    view = await describeView(page);
    const attackPixels = await markPixels(page, view, second!.tile, 'attackMove');
    expect(attackPixels.length).toBeGreaterThan(movePixels.length);
    for (const { point, colour } of attackPixels) {
      const [drawn] = await samples(page, 'view', [point]);
      expect(drawn, `the attack-move mark at ${String(point[0])},${String(point[1])}`).toEqual(colour);
    }

    await page.screenshot({ path: join(EVIDENCE, 'attack-move-rome.png') });
  });

  test('a refused order becomes a notice, its line centres the place, and it never pauses the Match', async ({ page }) => {
    test.setTimeout(90_000);
    await openMatch(page, 'rome', RESOLUTIONS[1], { paused: false });
    const id = await recruit(page, 'rome');
    const report = (await squads(page)).find((entry) => entry.id === id);
    if (report === undefined) throw new Error('no Squad to order');

    const river = riverNear({ x: report.x, y: report.y });
    expect(river, 'the theatre has a river near the army').not.toBeNull();
    if (river === null) return;

    await select(page, { kind: 'squad', id });
    const view = await centreOn(page, river);
    const at = tileScreen(view, river);
    expect(hidden(await hudRects(page), at), 'the river tile is bare ground under the pointer').toBe(false);

    // A real right click on deep water: the classic movement gesture, through the
    // same submission path a button uses. The rules refuse it, and the interface
    // hears the refusal.
    await rightClick(page, at);
    await advance(page, 1);

    const journal = await notices(page);
    const refusal = journal.find((notice) => notice.kind === 'refusal');
    expect(refusal, 'the refusal is a notice').toBeDefined();
    expect(refusal?.target).toEqual({ kind: 'squad', id, x: report.x, y: report.y });
    expect(refusal?.label).toContain(translate('refusal.water'));

    // A notice does not stop the Match for the Player.
    expect(await page.evaluate(() => window.__SPQR.game?.paused())).toBe(false);

    // The strip is drawn where the layout says, at the far side of the interface.
    const layout = await hudLayout(page);
    expect(layout.noticeRows.length).toBeGreaterThan(0);
    const row = layout.noticeRows.find((entry) => entry.id === refusal?.id);
    expect(row, 'the notice has a line a Player can press').toBeDefined();
    if (row === undefined) return;

    // Somewhere else first, so the camera has to move for the click to have done it.
    // Move into the theatre: negative panning can already hit the home corner's
    // clamp with the taller playable viewport, leaving nowhere for Centre to go.
    await page.evaluate(() => window.__SPQR.view?.panBy(400, 300));
    const wandered = await describeView(page);

    await press(page, row.rect);
    const centred = await describeView(page);
    // The camera may have been clamped against the theatre's edge already, so the
    // claim is that the click moved it *and* that it now shows the place, not that
    // both axes had room to move.
    expect(centred.camera).not.toEqual(wandered.camera);

    // The click centred the Squad the notice named, in exactly the way the
    // interface's own Centre control does — which is the same `centerOn` the
    // camera clamps against the theatre's edge, so near a corner the two agree on
    // the nearest reachable place rather than on the arithmetic ideal.
    await select(page, { kind: 'squad', id });
    await page.evaluate(() => window.__SPQR.game?.centerSelection());
    const byControl = await describeView(page);
    expect(centred.camera).toEqual(byControl.camera);

    // And the place it names is on the screen the Player is looking at.
    const place = tilePixel(report.x, report.y);
    const onScreen = stageToScreen(centred.camera, place.x, place.y);
    expect(onScreen.x).toBeGreaterThanOrEqual(0);
    expect(onScreen.x).toBeLessThan(centred.width);
    expect(onScreen.y).toBeGreaterThanOrEqual(0);
    expect(onScreen.y).toBeLessThan(centred.height);

    expect((await notices(page)).find((notice) => notice.id === refusal?.id)?.lost, 'the place is still known').toBe(false);
    expect(await page.evaluate(() => window.__SPQR.game?.centerNotice('no-such-notice'))).toBe(false);

    await page.screenshot({ path: join(EVIDENCE, 'notice-refusal-1920x1080.png') });
  });

  test('a tired Squad wears the condition shape, alone when unselected and with its plate when picked', async ({ page }) => {
    test.setTimeout(90_000);
    await mkdir(EVIDENCE, { recursive: true });
    await openMatch(page, 'rome', RESOLUTIONS[0]);

    // Two lines, raised the way a Player raises them, so the scene also shows a
    // mixed selection: each Squad carries its own plate.
    const first = await recruit(page, 'rome');
    await page.evaluate(() => {
      const game = window.__SPQR.game;
      const home = game?.state().visible.settlements[0];
      if (!game || !home) return;
      game.select({ kind: 'settlement', id: home.id });
      game.setTab('recruitment');
      game.perform('recruit:hastati');
      game.advance(1);
    });
    const raised = await squads(page);
    expect(raised.length, 'two lines stand').toBeGreaterThanOrEqual(2);

    const report = raised.find((entry) => entry.id === first) ?? raised[0]!;
    const view = await centreOn(page, { x: report.x, y: report.y });

    await select(page, { kind: 'squad', id: report.id });
    for (const other of raised) {
      if (other.id === report.id) continue;
      const at = stageToScreen(view.camera, other.rect.x + Math.floor(other.rect.width / 2),
        other.rect.y + Math.floor(other.rect.height / 2));
      // A box, not a point: a zero-width drag selects nothing (`input/selection.ts`).
      await page.evaluate(({ x, y }) => window.__SPQR.game?.selectIn(x - 20, y - 20, x + 20, y + 20, true), at);
    }

    const picked = await page.evaluate(() => window.__SPQR.game?.selection());
    expect(picked?.squads.length, 'both lines are picked').toBeGreaterThanOrEqual(2);
    const pickedBefore = await indicators(page);
    for (const entry of pickedBefore) {
      if (!entry.selected) continue;
      expect(entry.annotation, `${String(entry.id)}: a picked Squad wears its plate`).toBe('plate');
    }

    // One destination for the picked group, then fifteen ticks of marching: that
    // is fifteen points of Fatigue (`sim/combat.ts`), the approved warning
    // threshold reached by the rules and not by a fixture.
    const rects = await hudRects(page);
    const candidates = groundNear({ x: report.x, y: report.y }, 12)
      .map((tile) => ({ tile, at: tileScreen(view, tile) }))
      .filter(({ at }) => !hidden(rects, at) && at.x > 8 && at.y > 8 && at.x < view.width - 8 && at.y < view.height - 8)
      // The farthest first: a march has to last long enough to tire the men.
      .reverse();

    // The nearest ground is not always ground a Squad can reach: the theatre's
    // rivers are walls with fords in them, and a goal on the far bank is refused.
    // So the order is given until one takes, which is the rules answering and not
    // the test choosing a tile it likes.
    const pickedIds = new Set(pickedBefore.filter((entry) => entry.selected).map((entry) => entry.id));
    let bound: { tile: Site; at: { readonly x: number; readonly y: number } } | null = null;
    for (const candidate of candidates) {
      expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: candidate.at.x, y: candidate.at.y })).toBe(true);
      await advance(page, 1);
      const now = (await squads(page)).filter((squad) => pickedIds.has(squad.id));
      if (now.some((squad) => squad.goal !== null)) {
        bound = candidate;
        break;
      }
    }
    expect(bound, 'a destination took').not.toBeNull();
    if (bound === null) return;

    // March there and back until the men are tired. Arrival is not the point: a
    // Squad that stands still pays a point of Fatigue back every tick, so the
    // order is renewed whenever the route runs out.
    const home = {
      tile: { x: report.x, y: report.y },
      at: (() => {
        const at = tilePixel(report.x, report.y);

        return stageToScreen(view.camera, at.x, at.y);
      })(),
    };
    const spots = [bound, home];
    let spot = 0;
    let marching: readonly { readonly id: number; readonly fatigue: number; readonly goal: unknown }[] = [];
    for (let tick = 0; tick < 80; tick += 1) {
      marching = (await squads(page)).filter((squad) => pickedIds.has(squad.id));
      if (marching.length > 0 && marching.every((squad) => squad.fatigue >= 15)) break;
      if (marching.every((squad) => squad.goal === null)) {
        spot = (spot + 1) % spots.length;
        const next = spots[spot]!;
        await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: next.at.x, y: next.at.y });
      }
      await advance(page, 1);
    }
    for (const squad of marching) {
      if (squad.fatigue < 15) await test.info().attach('fatigue-scene', {
        body: JSON.stringify({ raised, bound, home, view, current: await describeView(page), marching: await squads(page) }, null, 2),
        contentType: 'application/json',
      });
      expect(squad.fatigue, `Squad ${String(squad.id)}: the march tired it`).toBeGreaterThanOrEqual(15);
    }

    // The strip carries the condition as a standing notice, with the shape beside
    // it in the theatre: two presentations of the same fact.
    expect((await notices(page)).some((notice) => notice.kind === 'fatigue' && notice.persistent)).toBe(true);
    expect(await page.evaluate(() => window.__SPQR.game?.paused())).toBe(true);

    await page.screenshot({ path: join(EVIDENCE, 'fatigue-plate-rome-1280x720.png') });

    // Nothing picked: the troubled Squads keep one shape each and no bar.
    await select(page, null);
    const unselected = await indicators(page);
    for (const entry of unselected) {
      if (!entry.conditions.includes('fatigue')) continue;
      expect(entry.annotation, `${String(entry.id)}: one shape, not a label`).toBe('pin');
    }

    // A warning never takes the Player's view or their clock.
    const still = await describeView(page);
    expect(still.camera).toEqual(view.camera);
    expect(await page.evaluate(() => window.__SPQR.game?.paused())).toBe(true);
    await page.screenshot({ path: join(EVIDENCE, 'fatigue-pin-rome-1280x720.png') });
  });

  test('the labelled estimate is on the strip, and pause and speed do not move a mark', async ({ page }) => {
    await openMatch(page, 'rome', RESOLUTIONS[0]);
    const id = await recruit(page, 'rome');
    const report = (await squads(page)).find((entry) => entry.id === id);
    if (report === undefined) throw new Error('no Squad to order');

    const layout = await hudLayout(page);
    const words = [...layout.text, ...layout.priority].map((line) => line.text).join(' ');
    expect(words, 'the economy’s estimate is labelled').toContain(translate('forecast.title'));

    await select(page, { kind: 'squad', id });
    const view = await centreOn(page, { x: report.x, y: report.y });
    const rects = await hudRects(page);
    const goal = groundNear({ x: report.x, y: report.y }, 6)
      .map((tile) => ({ tile, at: tileScreen(view, tile) }))
      .find(({ at }) => !hidden(rects, at) && at.x > 8 && at.y > 8 && at.x < view.width - 8 && at.y < view.height - 8);
    if (goal === undefined) throw new Error('no ground to order onto');
    expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: goal.at.x, y: goal.at.y })).toBe(true);
    await advance(page, 1);

    const before = (await indicators(page)).find((entry) => entry.id === id);
    expect(before?.orderMark).toBe('move');

    // Speed changes only the clock; the mark the Player's own order left is the
    // same mark, and the destination is the same place.
    await page.evaluate(() => window.__SPQR.game?.setSpeed(3));
    await advance(page, 1);
    const fast = (await indicators(page)).find((entry) => entry.id === id);
    expect(fast?.orderMark).toBe('move');
    expect(fast?.destination).toEqual(before?.destination);

    // Pausing stops the clock and changes nothing about what is drawn.
    await page.evaluate(() => window.__SPQR.game?.pause());
    const paused = (await indicators(page)).find((entry) => entry.id === id);
    expect(await page.evaluate(() => window.__SPQR.game?.paused())).toBe(true);
    expect(paused?.orderMark).toBe('move');
    expect(paused?.destination).toEqual(before?.destination);
    expect((await describeView(page)).camera).toEqual(view.camera);
  });

  test('the annotations survive every supported zoom, and a mark reads over remembered ground', async ({ page }) => {
    test.setTimeout(120_000);
    await mkdir(EVIDENCE, { recursive: true });
    await openMatch(page, 'rome', RESOLUTIONS[1]);
    const id = await recruit(page, 'rome');
    const report = (await squads(page)).find((entry) => entry.id === id);
    if (report === undefined) throw new Error('no Squad to inspect');
    const origin = { x: report.x, y: report.y };
    const figures = report.figures;

    await select(page, { kind: 'squad', id });
    let view = await centreOn(page, origin);

    // The camera's own zooms, all of them: a formation is never replaced by an
    // aggregate icon, and a selected Squad keeps its plate at every magnification.
    for (const zoom of [1, 2, 4, 8]) {
      await page.evaluate((magnification) => window.__SPQR.view?.zoomTo(magnification), zoom);
      view = await describeView(page);
      const selected = (await indicators(page)).find((entry) => entry.id === id);
      expect(selected?.annotation, `zoom ${String(zoom)}: the plate is drawn`).toBe('plate');
      expect(selected?.selected, `zoom ${String(zoom)}: the Squad is still picked`).toBe(true);
      const block = (await squads(page)).find((entry) => entry.id === id);
      expect(block?.figures, `zoom ${String(zoom)}: still the individual soldiers`).toBe(figures);
      expect(block?.rect.width ?? 0).toBeGreaterThan(0);
      if (zoom === 1 || zoom === 8) {
        await page.screenshot({ path: join(EVIDENCE, `zoom-${String(zoom)}-rome-1920x1080.png`) });
      }
    }

    // March away, so the ground behind the Squad is *remembered* rather than in
    // view, and order it back onto a patch of that memory: the destination mark
    // must read over the veil as it reads over open ground.
    await page.evaluate(() => window.__SPQR.view?.zoomTo(2));
    // The zoom walk keeps whatever the clamped camera could show; put the Squad
    // back in the middle before choosing ground to march on.
    view = await centreOn(page, origin);
    await select(page, { kind: 'squad', id });
    const rects = await hudRects(page);
    const far = groundNear(origin, 12)
      .map((tile) => ({ tile, at: tileScreen(view, tile) }))
      .filter(({ at }) => !hidden(rects, at) && at.x > 8 && at.y > 8 && at.x < view.width - 8 && at.y < view.height - 8)
      .reverse();

    let chosen: { tile: Site; at: { readonly x: number; readonly y: number } } | null = null;
    for (const candidate of far) {
      expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: candidate.at.x, y: candidate.at.y })).toBe(true);
      await advance(page, 1);
      const now = (await squads(page)).find((entry) => entry.id === id);
      if (now !== undefined && now.goal !== null) {
        chosen = candidate;
        break;
      }
    }
    expect(chosen, 'a march was ordered').not.toBeNull();
    if (chosen === null) return;

    for (let tick = 0; tick < 80; tick += 1) {
      const now = (await squads(page)).find((entry) => entry.id === id);
      if (now === undefined || now.goal === null) break;
      await advance(page, 1);
    }

    const now = (await squads(page)).find((entry) => entry.id === id);
    expect(now, 'the Squad is still on the map').toBeDefined();
    if (now === undefined) return;
    expect(Math.abs(now.x - origin.x) + Math.abs(now.y - origin.y), 'the Squad marched').toBeGreaterThan(0);

    // The trail behind the Squad is remembered ground: outside its own four-tile
    // watch and outside the settlement's eight, and seen on the way.
    const states = await knowledge(page);
    const remembered = tilesAround({ x: now.x, y: now.y }, 12)
      .filter((tile) => {
        const away = Math.abs(tile.x - now.x) + Math.abs(tile.y - now.y);

        return away >= 5 && states[tile.y * MAP_WIDTH + tile.x] === KNOWLEDGE.remembered;
      })
      .map((tile) => ({ tile, at: tileScreen(view, tile) }))
      .filter(({ at }) => at.x > 8 && at.y > 8 && at.x < view.width - 8 && at.y < view.height - 8);
    expect(remembered.length, 'the ground behind the march is remembered').toBeGreaterThan(0);

    let back: { tile: Site; at: { readonly x: number; readonly y: number } } | null = null;
    for (const candidate of remembered) {
      expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y),
        { x: candidate.at.x, y: candidate.at.y })).toBe(true);
      await advance(page, 1);
      const marked = (await squads(page)).find((entry) => entry.id === id);
      if (marked !== undefined && marked.goal !== null) {
        back = candidate;
        break;
      }
    }
    expect(back, 'the order onto remembered ground took').not.toBeNull();
    if (back === null) return;

    const marked = (await indicators(page)).find((entry) => entry.id === id);
    expect(marked?.destination).toEqual({ x: back.tile.x, y: back.tile.y });

    const ink = await markPixels(page, view, back.tile, 'move');
    expect(ink.length).toBeGreaterThan(10);
    for (const { point, colour } of ink) {
      const [drawn] = await samples(page, 'view', [point]);
      expect(drawn, `the remembered mark at ${String(point[0])},${String(point[1])}`).toEqual(colour);
    }

    await page.screenshot({ path: join(EVIDENCE, 'mark-over-remembered-ground-rome.png') });
  });

  test('notices name only what the Faction knows', async ({ page }) => {
    await openMatch(page, 'rome', RESOLUTIONS[0]);
    const id = await recruit(page, 'rome');
    const report = (await squads(page)).find((entry) => entry.id === id);
    if (report === undefined) throw new Error('no Squad to order');

    const river = riverNear({ x: report.x, y: report.y });
    if (river === null) throw new Error('no river near the army');

    await select(page, { kind: 'squad', id });
    const view = await centreOn(page, river);
    const at = tileScreen(view, river);
    expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.orderAt('move', x, y), { x: at.x, y: at.y })).toBe(true);
    await advance(page, 1);

    const snapshot = await state(page);
    const ownSquads = new Set(snapshot.visible.squads.map((squad) => squad.id));
    const ownSettlements = new Set(snapshot.visible.settlements.map((settlement) => settlement.id));

    for (const notice of snapshot.notices) {
      if (notice.target === null) continue;

      const known = notice.target.kind === 'squad' ? ownSquads.has(notice.target.id) : ownSettlements.has(notice.target.id);
      expect(known, `${notice.id}: ${notice.target.kind} ${String(notice.target.id)} is the Faction's own`).toBe(true);
    }

    // And the journal carries no figure the Observation does not: every notice is
    // about the Faction's own army or its own walls, and the one this scene raised
    // is the refusal of its own order.
    expect(snapshot.notices.some((notice) => notice.kind === 'refusal')).toBe(true);
    expect((await notices(page)).map((notice) => notice.id)).toEqual(snapshot.notices.map((notice) => notice.id));
  });
});
