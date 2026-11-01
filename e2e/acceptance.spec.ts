/**
 * Integrated acceptance scenes for the delivered browser UI (ticket U8).
 *
 * The first-entry spec is about the guide; this one is about the interface the
 * guide leads a Player into. It captures the states the shared constraints name,
 * at **1280x720 and 1920x1080, for both Factions**, and asserts their outcome
 * rather than only saving a picture:
 *
 * - **individual and multiple selection**, reached with a click and a dragged box;
 * - **an order while paused** (`In attesa`) and **an order the rules refuse**,
 *   which is a notice and a line in the Squad's panel;
 * - **the supported zooms** (1× and 8×) around a picked Squad;
 * - **the three fog knowledge states** in one frame;
 * - **a long navigator and long detail text**, from a reproduced scenario with
 *   more Squads and works than one panel holds;
 * - **critical conditions** — low Morale, high Fatigue, an unpaid Season — as the
 *   notices and the plates say them.
 *
 * The other scenes the ticket names already have their own committed specs and
 * evidence, and the completion report links them: terrain and fog states
 * (`e2e/terrain-readability.spec.ts`), settlements, walls and Siege
 * (`e2e/settlements.spec.ts`), standards, condition plates and the notice journal
 * (`e2e/readability.spec.ts`), setup and the whole Match (`e2e/setup.spec.ts`,
 * `e2e/match.spec.ts`, and the full-Match test in `e2e/first-entry.spec.ts`).
 *
 * The screenshots are written under `SPQR_VISUAL_DIR/issue59` when the visual
 * profile asks for them; nothing here claims that a matching hash is a visual
 * verdict (see the completion report's gate section).
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { stageToScreen } from '../src/render/camera';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, generateMap } from '../src/sim/map';
import { translate } from '../src/ui/strings';
import {
  advance,
  describeView,
  dismissFirstEntry,
  hud,
  hudLayout,
  hudRows,
  knowledge,
  notices,
  press,
  selection,
  squads,
  state,
} from './hooks';

const SEED = 59;

const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

const FACTIONS = ['rome', 'carthage'] as const;
type Faction = (typeof FACTIONS)[number];

/** The first line each Faction can raise at tier one, as the card names it. */
const FIRST_LINE: Readonly<Record<Faction, string>> = { rome: 'hastati', carthage: 'libyan-spear' };

/** The map the page generates for the seed, used to find a river to be refused by. */
const MAP = generateMap(SEED);

async function openMatch(page: Page, faction: Faction, size: { width: number; height: number }): Promise<void> {
  await dismissFirstEntry(page);
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => window.__SPQR.game?.pause());
}

async function canvasOrigin(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  return { x: box.x, y: box.y };
}

async function clickCanvas(page: Page, point: { readonly x: number; readonly y: number }, button: 'left' | 'right' = 'left'): Promise<void> {
  const origin = await canvasOrigin(page);
  await page.mouse.click(origin.x + point.x, origin.y + point.y, { button });
}

/** Raises two lines through the settlement's own card, one press and one tick each. */
async function raiseTwo(page: Page, faction: Faction): Promise<readonly { id: number; x: number; y: number; rect: { x: number; y: number; width: number; height: number } }[]> {
  const home = (await hudRows(page)).find((row) => row.selection.kind === 'settlement');
  expect(home, 'the navigator lists the Faction’s settlement').toBeDefined();
  if (home === undefined) throw new Error('no settlement row');
  await press(page, home.rect);
  const tab = (await hudLayout(page)).tabs.find((entry) => entry.tab === 'recruitment');
  expect(tab, 'the settlement has a Recruitment page').toBeDefined();
  if (tab === undefined) throw new Error('no recruitment page');
  await press(page, tab.rect);

  for (let raised = 0; raised < 2; raised += 1) {
    const card = (await hudLayout(page)).commands.find((command) => command.order.id === `recruit:${FIRST_LINE[faction]}:24`);
    expect(card?.order.enabled, 'the opening stocks can raise a second line').toBe(true);
    if (card === undefined) throw new Error('no recruit card');
    await press(page, card.rect);
    const purchase = (await hudLayout(page)).buttons.find((button) => button.action === `purchase:recruit:${FIRST_LINE[faction]}:24`);
    expect(purchase?.enabled, 'the inspected line can be purchased').toBe(true);
    await press(page, purchase!.rect);
    await advance(page, 1);
  }

  const raised = await squads(page);
  expect(raised.length, 'two lines stand').toBe(2);

  return raised;
}

/** Drags a box round two Squads, which is the pointer's multiple selection. */
async function boxSelect(page: Page, boxes: readonly { rect: { x: number; y: number; width: number; height: number } }[]): Promise<void> {
  await page.evaluate(() => { window.__SPQR.view!.zoomTo(1); window.__SPQR.game!.centerSelection(); });
  const view = await describeView(page);
  const corners = boxes.map(({ rect }) => ({
    left: stageToScreen(view.camera, rect.x, rect.y),
    right: stageToScreen(view.camera, rect.x + rect.width, rect.y + rect.height),
  }));
  const left = Math.min(...corners.map((corner) => corner.left.x)) - 8;
  const top = Math.min(...corners.map((corner) => corner.left.y)) - 8;
  const right = Math.max(...corners.map((corner) => corner.right.x)) + 8;
  const bottom = Math.max(...corners.map((corner) => corner.right.y)) + 8;
  const origin = await canvasOrigin(page);
  await page.mouse.move(origin.x + left, origin.y + top);
  await page.mouse.down();
  await page.mouse.move(origin.x + right, origin.y + bottom, { steps: 6 });
  await page.mouse.up();
}

/** The closest river tile, which is what a refused move is aimed at. */
function riverNear(x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number; distance: number } | null = null;
  for (let ty = 0; ty < MAP_HEIGHT; ty += 1) for (let tx = 0; tx < MAP_WIDTH; tx += 1) {
    if (MAP.terrain[ty * MAP_WIDTH + tx] !== TERRAIN.river) continue;
    const distance = Math.max(Math.abs(tx - x), Math.abs(ty - y));
    if (best === null || distance < best.distance) best = { x: tx, y: ty, distance };
  }

  return best === null ? null : { x: best.x, y: best.y };
}

/** Pans the camera so a tile is in the middle of the viewport. */
async function centreOn(page: Page, tile: { x: number; y: number }): Promise<void> {
  const before = await describeView(page);
  const px = tile.x * 16 + 8;
  const py = tile.y * 16 + 8;
  const area = (await hudLayout(page)).theatre ?? { x: 0, y: 0, width: before.width, height: before.height };
  const wantedX = Math.round(px - (area.x + area.width / 2) / before.camera.zoom);
  const wantedY = Math.round(py - (area.y + area.height / 2) / before.camera.zoom);
  await page.evaluate(({ dx, dy }) => window.__SPQR.view?.panBy(dx, dy), {
    dx: wantedX - before.camera.x, dy: wantedY - before.camera.y,
  });
}

test.describe('the delivered interface under a Player’s hands', () => {
  for (const faction of FACTIONS) for (const size of RESOLUTIONS) {
    test(`selection, orders, zooms and fog for ${faction} at ${String(size.width)}x${String(size.height)}`, async ({ page }) => {
      test.setTimeout(120_000);
      await openMatch(page, faction, size);
      const raised = await raiseTwo(page, faction);

      // Individual selection: the row a Player sees, pressed.
      const row = (await hudRows(page)).find((entry) => entry.selection.kind === 'squad');
      expect(row).toBeDefined();
      if (row === undefined) throw new Error('no squad row');
      await press(page, row.rect);
      expect((await selection(page)).squads).toHaveLength(1);
      await capture(page, `single-selection-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // Multiple selection: a dragged box round both blocks.
      await boxSelect(page, raised);
      const picked = (await selection(page)).squads;
      expect(picked.length, 'the box picked both lines').toBe(2);

      // A pending order: given while paused, so the panel must say it is waiting.
      const first = raised[0]!;
      const camera = (await describeView(page)).camera;
      const destination = stageToScreen(camera, first.x * 16 + 8 + 48, first.y * 16 + 8 + 48);
      await clickCanvas(page, destination, 'right');
      expect((await hud(page)).orders.pending, 'the paused order is queued').toBe(1);
      const pendingLayout = await hudLayout(page);
      expect([...pendingLayout.status, ...pendingLayout.text, ...pendingLayout.priority].map((entry) => entry.text).join(' ')).toContain(translate('ui.pendingPaused').replace('{count}', '1'));
      await capture(page, `mixed-selection-pending-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // A refused order: the rules say deep water, and the interface says so in
      // the Squad's panel and as a notice. The river is a real tile of this seed.
      const river = riverNear(first.x, first.y);
      expect(river, 'the theatre has a river near the army').not.toBeNull();
      if (river === null) return;
      await centreOn(page, river);
      const riverView = await describeView(page);
      const at = stageToScreen(riverView.camera, river.x * 16 + 8, river.y * 16 + 8);
      await clickCanvas(page, at, 'right');
      await advance(page, 1);
      const refusal = (await notices(page)).find((notice) => notice.kind === 'refusal');
      expect(refusal, 'the refused order is a notice').toBeDefined();
      expect(refusal?.label).toContain(translate('refusal.water'));
      // The Squad's own panel says the same thing: the order line is the rules'
      // answer, not the strip's second opinion.
      await page.evaluate((id) => window.__SPQR.game!.select({ kind: 'squad', id }), picked[0]!);
      expect((await hud(page)).detail?.lines.map((line) => line.value)).toContain(translate('refusal.water'));
      await capture(page, `refused-order-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // The supported zooms, about a picked Squad.
      await page.evaluate(() => window.__SPQR.game!.select({ kind: 'squad', id: window.__SPQR.game!.squads()[0]!.id }));
      for (const zoom of [1, 8] as const) {
        await page.evaluate((value) => { window.__SPQR.view!.zoomTo(value); window.__SPQR.game!.centerSelection(); }, zoom);
        await capture(page, `zoom${String(zoom)}-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');
      }

      // The three knowledge states in one frame: the first watch's ground is
      // remembered once the watch moves on, the second's is in view, and the rest
      // is unexplored. This is the same call a tick makes with a Faction's eyes,
      // not a reveal.
      await page.evaluate(() => window.__SPQR.view!.zoomTo(2));
      await page.evaluate(() => {
        window.__SPQR.view!.lookFrom(48, 48);
        window.__SPQR.view!.lookFrom(20, 20);
      });
      const states = await knowledge(page);
      expect(states, 'unexplored').toContain(0);
      expect(states, 'remembered').toContain(1);
      expect(states, 'in view').toContain(2);
      await centreOn(page, { x: 20, y: 20 });
      await capture(page, `fog-states-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');
    });
  }
});

test.describe('long lists, long text and critical conditions', () => {
  for (const faction of FACTIONS) for (const size of RESOLUTIONS) {
    test(`a crowded panel and a Squad in trouble for ${faction} at ${String(size.width)}x${String(size.height)}`, async ({ page }) => {
      test.setTimeout(120_000);
      await dismissFirstEntry(page);
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto('/e2e/hud-fixture.html');
      await page.evaluate(async ({ side }) => {
        const bootPath = '/src/render/boot.ts';
        const siegePath = '/src/sim/siege.ts';
        const movePath = '/src/sim/movement.ts';
        const mapPath = '/src/sim/map.ts';
        const buildingPath = '/src/content/buildings.ts';
        const { bootRenderer } = await import(bootPath);
        const { siegeMatchRules } = await import(siegePath);
        const { musterSquad } = await import(movePath);
        const { isWalkable, terrainAt, MAP_WIDTH, MAP_HEIGHT } = await import(mapPath);
        const { buildingCode } = await import(buildingPath);
        const types = side === 'rome'
          ? ['hastati', 'principes', 'triarii']
          : ['libyan-spear', 'gaul', 'iberian-sword'];
        const rules = { ...siegeMatchRules, createWorld(seed: number) {
          const world = siegeMatchRules.createWorld(seed);
          const owner = side === 'rome' ? 0 : 1;
          const home = world.map.strongholds[owner]!;
          let made = 0;
          // The compact U9 dock leaves room for all 28 old rows at 1080p.
          // Keep this an actual overflow scene at both desktop sizes.
          for (let radius = 1; radius <= 20 && made < 48; radius += 1) {
            for (let across = -radius; across <= radius && made < 48; across += 1) {
              const x = home.x + across;
              const y = home.y + radius;
              if (x < 2 || y < 2 || x >= MAP_WIDTH - 2 || y >= MAP_HEIGHT - 2) continue;
              if (!isWalkable(terrainAt(world.map, x, y))) continue;
              if (world.economy.settlements.some((settlement: { x: number; y: number }) => settlement.x === x && settlement.y === y)) continue;
              if (world.economy.squads.some((squad: { x: number; y: number }) => squad.x === x && squad.y === y)) continue;
              musterSquad(world.economy, world.map, { faction: side, squadType: types[made % types.length]!, x, y });
              made += 1;
            }
          }
          const own = world.economy.squads.filter((squad: { owner: number }) => squad.owner === owner);
          // A Squad the critical-condition rules must speak about: low Morale,
          // high Fatigue and two Seasons of Payroll owed.
          own[0]!.morale = 1;
          own[0]!.fatigue = 18;
          own[0]!.unpaid = 2;
          // A settlement with a long panel: nine works, standing and building.
          // Works hold content codes, not ids: state is integers (ADR-0006).
          const settlement = world.economy.settlements[owner]!;
          settlement.works.push(
            { building: buildingCode('farm')!, remaining: 0 },
            { building: buildingCode('granary')!, remaining: 0 },
            { building: buildingCode('house')!, remaining: 0 },
            { building: buildingCode('villa')!, remaining: 240 },
            { building: buildingCode('forum')!, remaining: 600 },
            { building: buildingCode('lumber-camp')!, remaining: 300 },
            { building: buildingCode('quarry')!, remaining: 350 },
            { building: buildingCode('mine')!, remaining: 400 },
            { building: buildingCode('market')!, remaining: 450 },
          );
          return world;
        } };
        const view = await bootRenderer(document.getElementById('app')!, { seed: 59, faction: side, rules });
        window.__SPQR = { boot: { booted: true, render: view.probe }, game: view, view, atelier: null };
        view.pause();
      }, { side: faction });

      const model = await hud(page);
      expect(model.rows.length, 'the navigator holds more than one panel of Squads').toBeGreaterThanOrEqual(25);
      const layout = await hudLayout(page);
      expect(layout.listScroll.max, 'the navigator scrolls rather than hiding rows').toBeGreaterThan(0);
      await capture(page, `long-list-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // A settlement's detail is longer than its panel, and scrolls.
      // The supported dock deliberately has a shallow detail area, so this
      // remains an overflow scene even where the taller sidebar fits all works.
      await page.evaluate(() => window.__SPQR.game!.setPanelLayout('dock'));
      const home = (await state(page)).visible.settlements[0]!;
      await page.evaluate((id) => window.__SPQR.game!.select({ kind: 'settlement', id }), home.id);
      await press(page, (await hudLayout(page)).tabs.find((tab) => tab.tab === 'construction')!.rect);
      await press(page, (await hudLayout(page)).buttons.find((button) => button.action === 'settlement:works')!.rect);
      const detail = await hudLayout(page);
      expect((await hud(page)).detail?.lines.length, 'the settlement has a long panel').toBeGreaterThanOrEqual(8);
      expect(detail.detailScroll.max, 'the detail scrolls rather than clipping').toBeGreaterThan(0);
      await capture(page, `long-text-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');

      // The critical Squad: its plate and the strip say the same three things.
      const critical = (await squads(page))[0]!;
      await page.evaluate((id) => window.__SPQR.game!.select({ kind: 'squad', id }), critical.id);
      const kinds = (await notices(page)).map((notice) => notice.kind);
      expect(kinds).toContain('morale');
      expect(kinds).toContain('fatigue');
      expect(kinds).toContain('unpaid');
      const indicator = await page.evaluate((id) => window.__SPQR.game!.indicators().find((entry) => entry.id === id), critical.id);
      expect(indicator?.annotation).toBe('plate');
      expect(indicator?.conditions.length, 'the plate carries the critical shapes').toBeGreaterThan(0);
      await capture(page, `critical-${faction}-${String(size.width)}x${String(size.height)}`, 'issue59');
    });
  }
});
