/**
 * The Italian interface, in a real browser (ticket B7).
 *
 * The unit tests in `tests/ui/` already pin what the HUD says and what the
 * minimap draws; what only a browser can show is that the page *is* that
 * interface: that the Match behind it is running, that the words on screen come
 * from the string table, that a click selects the row a Player pressed, that the
 * minimap is drawn through the fog the Faction actually has, and that the whole
 * thing stays where it is when the camera zooms.
 *
 * The page's own hooks are the observation surface, so nothing here reaches into
 * the page's internals: `hud()` is the model, `hudRows()` is where the rows
 * stand, `fog()` is what the Faction knows, and `minimapSamples` reads the plate
 * the page generated. The map itself is regenerated in Node from the seed the
 * page reports, so "the minimap matches the map" is a comparison and not a
 * smoke test.
 */
import { expect, test, type Page } from '@playwright/test';
import { BASE } from '../src/art/palette';
import { MAP_HEIGHT, MAP_WIDTH, generateMap, tileIndex, terrainAt, type MapGrid } from '../src/sim/map';
import { DEFAULT_SEED } from '../src/render/view';
import {
  FOG,
  MINIMAP_CAMERA,
  MINIMAP_COLOUR,
  MINIMAP_PADDING,
  settlementColour,
  viewportRectOnMinimap,
} from '../src/ui/minimap';
import { translate } from '../src/ui/strings';
import {
  advance,
  describeView,
  fog,
  hud,
  hudRects,
  hudRows,
  minimapSamples,
  samples,
  select,
} from './hooks';

const MAP: MapGrid = generateMap(DEFAULT_SEED);

/** Every tile a settlement or a resource node stands on, which a marker paints over. */
const OCCUPIED = new Set<number>([
  ...MAP.strongholds.map((site) => tileIndex(site.x, site.y)),
  ...MAP.settlements.map((site) => tileIndex(site.x, site.y)),
  ...MAP.resources.map((node) => tileIndex(node.x, node.y)),
]);

/**
 * Boots the page and stops the real-time clock, so a test reads one state.
 *
 * The opening order is applied by stepping one tick *before* the pause: a pause
 * holds the orders given during it (B5), so a test that paused first would wait
 * forever for a Squad the page never got to raise.
 */
async function boot(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
  await advance(page, 1);
  await page.evaluate(() => window.__SPQR.game?.pause());
}

/** A line as a Player reads it. */
function line(line: { readonly label: string; readonly value: string }): string {
  return `${line.label} ${line.value}`;
}

test('boots with the interface over the theatre, and says it in Italian', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await boot(page);
  await advance(page, 1);

  const model = await hud(page);
  const words = model.readouts.map((readout) => line(readout));

  expect(words).toContain(`${translate('ui.year')} 1`);
  expect(words).toContain(`${translate('ui.season')} ${translate('season.spring')}`);
  expect(words).toContain(`${translate('ui.treasury')} 20`);

  for (const key of ['resource.grain', 'resource.timber', 'resource.stone', 'resource.iron'] as const) {
    expect(words.some((word) => word.startsWith(translate(key))), key).toBe(true);
  }

  // The page raises one Squad through the same seam a Player will use (C2 gives
  // the Player a way to raise one by hand), so the Squad panel is live.
  expect(model.rows.map((row) => row.selection)).toContainEqual({ kind: 'squad', id: 1 });
  expect(model.rows.find((row) => row.selection.kind === 'squad')?.label).toBe('Astati');

  expect(pageErrors).toEqual([]);
});

test('shows a Squad its morale and its Payroll when it is selected', async ({ page }) => {
  await boot(page);
  await advance(page, 1);
  await select(page, { kind: 'squad', id: 1 });

  const model = await hud(page);
  const words = (model.detail?.lines ?? []).map(line);

  expect(model.detail?.title).toBe('Reparto 1');
  expect(words).toContain(`${translate('ui.type')} Astati`);
  expect(words).toContain(`${translate('ui.morale')} 10`);
  expect(words).toContain(`${translate('ui.payroll')} 3`);
});

test('selects the row a Player clicks', async ({ page }) => {
  await boot(page);
  await advance(page, 1);

  const rows = await hudRows(page);
  const squad = rows.find((row) => row.selection.kind === 'squad');
  if (squad === undefined) throw new Error('the interface has no Squad row');

  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  await page.mouse.click(box.x + squad.rect.x + 5, box.y + squad.rect.y + 5);

  expect(await page.evaluate(() => window.__SPQR.game?.selection() ?? null)).toEqual({ kind: 'squad', id: 1 });

  // And a click on the theatre clears it again rather than selecting whatever
  // happens to be underneath the pointer.
  await page.mouse.click(box.x + 400, box.y + 300);
  expect(await page.evaluate(() => window.__SPQR.game?.selection() ?? null)).toBeNull();
});

test('draws the minimap from the map, and blanks what the Faction has not seen', async ({ page }) => {
  await boot(page);
  await advance(page, 1);

  const knowledge = await fog(page);
  expect(knowledge.length).toBe(MAP_WIDTH * MAP_HEIGHT);

  const view = await describeView(page);
  const cameraRect = viewportRectOnMinimap({
    x: view.camera.x,
    y: view.camera.y,
    width: Math.floor(view.width / view.camera.zoom),
    height: Math.floor(view.height / view.camera.zoom),
  });

  const points: [number, number][] = [];
  const wanted: (readonly [number, number, number, number])[] = [];
  let unseen = 0;
  let visible = 0;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (OCCUPIED.has(tileIndex(x, y))) continue;

      const at = { x: MINIMAP_PADDING + x, y: MINIMAP_PADDING + y };
      if (onCameraOutline(cameraRect, at.x, at.y)) continue;

      const state = knowledge[tileIndex(x, y)];
      if (state === FOG.unseen) unseen += 1;
      else visible += 1;

      points.push([at.x, at.y]);
      wanted.push(state === FOG.unseen ? BASE.night : MINIMAP_COLOUR[terrainAt(MAP, x, y)]);
    }
  }

  // Both states are actually on screen, or the check is about a plate with
  // nothing to be honest about.
  expect(unseen).toBeGreaterThan(1000);
  expect(visible).toBeGreaterThan(100);

  const drawn = await minimapSamples(page, points);
  let wrong = 0;
  for (let index = 0; index < points.length; index += 1) {
    const got = drawn[index];
    const want = wanted[index];
    if (got === undefined || want === undefined) continue;
    if (got[0] !== want[0] || got[1] !== want[1] || got[2] !== want[2]) wrong += 1;
  }

  expect(wrong, 'minimap pixels that are not the map, through the fog').toBe(0);

  // The Faction's own Stronghold is a landmark on the plate, and an unexplored
  // Stronghold would be the leak this whole test exists to catch.
  const [rome] = MAP.strongholds;
  const at = { x: MINIMAP_PADDING + rome.x, y: MINIMAP_PADDING + rome.y };
  expect(await minimapSamples(page, [[at.x, at.y]])).toEqual([settlementColour(0)]);
});

test('keeps the interface in screen space at every zoom the camera allows', async ({ page }) => {
  await boot(page);
  await advance(page, 1);

  const before = await hud(page);
  const rects = await hudRects(page);
  const minimapRect = rects[rects.length - 1];
  if (minimapRect === undefined) throw new Error('the layout has no minimap');

  for (const zoom of [1, 2, 4, 8]) {
    await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);

    // The words do not change with the camera: the HUD is not a thing in the
    // world, and a panel that zoomed would be legible at exactly one level.
    expect(await hud(page), `zoom ${String(zoom)}`).toEqual(before);

    // And it is drawn where it says it is: the frame at the minimap's first
    // pixel is the minimap's first pixel, at 1× and at 8× alike.
    const [plate] = await minimapSamples(page, [[0, 0]]);
    const [frame] = await samples(page, 'view', [[minimapRect.x, minimapRect.y]]);
    expect(frame, `zoom ${String(zoom)}`).toEqual(plate);
  }
});

test('moves the camera mark on the minimap with the camera', async ({ page }) => {
  await boot(page);
  await advance(page, 1);

  const before = await describeView(page);
  const rect = viewportRectOnMinimap({
    x: before.camera.x,
    y: before.camera.y,
    width: Math.floor(before.width / before.camera.zoom),
    height: Math.floor(before.height / before.camera.zoom),
  });
  expect(await minimapSamples(page, [[rect.x, rect.y]])).toEqual([MINIMAP_CAMERA]);

  await page.evaluate(() => window.__SPQR.view?.panBy(40, 30));

  const after = await describeView(page);
  const moved = viewportRectOnMinimap({
    x: after.camera.x,
    y: after.camera.y,
    width: Math.floor(after.width / after.camera.zoom),
    height: Math.floor(after.height / after.camera.zoom),
  });

  expect({ x: moved.x, y: moved.y }).not.toEqual({ x: rect.x, y: rect.y });
  expect(await minimapSamples(page, [[moved.x, moved.y]])).toEqual([MINIMAP_CAMERA]);
  expect(await minimapSamples(page, [[rect.x, rect.y]])).not.toEqual([MINIMAP_CAMERA]);
});

/** Whether a plate point is on the camera rectangle's one-pixel outline. */
function onCameraOutline(
  rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  x: number,
  y: number,
): boolean {
  const onHorizontal = y === rect.y || y === rect.y + rect.height;
  const onVertical = x === rect.x || x === rect.x + rect.width;

  return (
    (onHorizontal && x >= rect.x && x <= rect.x + rect.width) ||
    (onVertical && y >= rect.y && y <= rect.y + rect.height)
  );
}
