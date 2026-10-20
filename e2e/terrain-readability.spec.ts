/**
 * The terrain on screen, and the men standing on it (ticket U5).
 *
 * U5 quietened the ground so that soldiers and resource markers are what the eye
 * finds first. Its evidence therefore has to be *rendered*: a hash that moved is a
 * record of a decision, not a look at the decision. This spec drives the real Match
 * page — the setup's own `?play=` address, both Factions, both reference
 * resolutions — and asks the frame itself three questions:
 *
 * - **is the ground the generator's?** Every sampled point of visible ground is the
 *   colour `renderTerrain` says it is, and every sampled point of remembered ground
 *   is that colour under the fog's own veil. That is the quietened art on screen and
 *   not merely in the bake.
 * - **are the men louder than it?** The brightness range inside a Squad's block is
 *   compared with the range of the ground beside it: figure over ground, in the
 *   frame, measured rather than asserted from source.
 * - **does the frame still tell terrains apart?** A scene is sampled on several
 *   materials through their own middles, and a screen whose ground had gone flat
 *   would fail the spread it is asked for.
 *
 * The pictures are written outside the repository (`%TEMP%\spqr-issue56`) because
 * the guard forbids committing image files: they are for a human to open beside the
 * same run's bake, which is what turns "the hashes changed" into a judgement. The
 * assertions beside them run on every pass, so the evidence and the verification are
 * the same run.
 */
import { expect, test } from './fixtures';
import type { Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pixelAt, type PixelBuffer, type Rgba } from '../src/art/pixel-buffer';
import { TERRAIN_TILE } from '../src/art/terrain';
import { stageToScreen } from '../src/render/camera';
import { REMEMBERED } from '../src/render/fog';
import { THEATRE_MARGIN, renderTerrain, tileAt } from '../src/render/terrain';
import { KNOWLEDGE, type Knowledge } from '../src/sim/fog';
import { MAP_HEIGHT, MAP_WIDTH, generateMap, type MapGrid, type Site } from '../src/sim/map';
import type { ViewState } from '../src/render/boot';
import type { Rect } from '../src/ui/hud';
import { advance, covers, describeView, hudRects, knowledge, press, samples, select, squads } from './hooks';

/** Where the screenshots go: outside the repository, like the rest of the evidence. */
const EVIDENCE = join(tmpdir(), 'spqr-issue56');

/** The seed every scene is played on: the fixtures' own, so a reader can reproduce it. */
const SEED = 7;

/** The two reference resolutions the shared constraints ask for. */
const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

/** The Factions, through the address the setup page builds. */
const FACTIONS = ['rome', 'carthage'] as const;
type Faction = (typeof FACTIONS)[number];

/** The magnifications a scene is walked at: the camera's coarsest, its finest, and two between. */
const ZOOMS = [1, 2, 4, 8] as const;

/** How far from the Stronghold the watch looks first, in tiles: well outside the settlement's own vision. */
const WATCH_AWAY = 26;

/**
 * How far the watch moves on, in tiles: past its own vision, so that the ground it
 * saw first is out of view and therefore *remembered*.
 *
 * Larger than the watch's own radius (`SETTLEMENT_VISION`, 8), which is what makes
 * the two states neighbours: the camera then looks at the edge of what is in view,
 * with memory on the far side of it.
 */
const WATCH_STEP = 10;

/** How far past the watch the camera looks, in tiles: the edge of its vision, where the two states meet. */
const LOOK_EDGE = 8;

/** The theatre, generated once: what the ground on screen has to be. */
const MAP: MapGrid = generateMap(SEED);
const THEATRE: PixelBuffer = renderTerrain(MAP);

/** The luminance of a colour: what the eye reads as "how bright", and what a contrast is measured in. */
function luminance(colour: readonly number[]): number {
  return 0.2126 * (colour[0] ?? 0) + 0.7152 * (colour[1] ?? 0) + 0.0722 * (colour[2] ?? 0);
}

/**
 * One theatre pixel as the remembered veil leaves it: the source-over blend, in the
 * fog's own colour and alpha, as an exact number rather than a rounded one.
 *
 * Written out rather than asked of `renderFog`, because the *state* of each tile is
 * the page's (it is read from `knowledge()`), and a fog rebuilt from guesses would
 * be a test of its own guesses. The arithmetic is the compositor's and the exact
 * composition in Node is `tests/render/fog.test.ts`'s; what this spec adds is that
 * the *page* agrees with it.
 */
function veiled(colour: Rgba): readonly number[] {
  const alpha = REMEMBERED[3] / 255;

  // Source over: the veil is what is *over* the terrain, so it takes the alpha and
  // the terrain the room that is left.
  return [0, 1, 2].map((channel) => (REMEMBERED[channel] ?? 0) * alpha + (colour[channel] ?? 0) * (1 - alpha));
}

/**
 * The colour a theatre pixel should reach the screen with, given its tile's
 * knowledge, and how far from it the frame may be.
 *
 * Visible ground is exact: the page draws the generator's own pixel through a
 * whole-number camera, and anything else is a defect. Remembered ground is allowed
 * a step either way, because the veil is composited by the GPU in floating point and
 * written to an 8-bit framebuffer: the blend is the same blend, rounded once at the
 * end rather than by the integer arithmetic a buffer-to-buffer copy uses.
 */
function expectedAt(
  states: readonly Knowledge[],
  x: number,
  y: number,
): { readonly colour: readonly number[]; readonly tolerance: number } | null {
  const at = tileAt(x, y);
  const state = states[at.y * MAP_WIDTH + at.x];
  if (state === undefined) return null;

  const colour = pixelAt(THEATRE, x, y);
  if (state === KNOWLEDGE.visible) return { colour, tolerance: 0 };
  if (state === KNOWLEDGE.remembered) return { colour: veiled(colour), tolerance: 2 };
  // Unexplored ground is the fog and nothing else: it says nothing about terrain, so
  // it is not a reading of the quietened art and is skipped rather than compared.
  return null;
}

/** Opens the real Match page, paused, at the viewport asked for. */
async function openMatch(
  page: Page,
  faction: Faction,
  size: { readonly width: number; readonly height: number },
): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => {
    window.__SPQR.game?.pause();
  });
}

/**
 * Puts the lenses on or off: the ground is compared with the men and the towns out
 * of it, and the men are put back where a scene is about them (#57 adds the towns
 * to the same lens).
 */
async function showSquads(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((show) => {
    window.__SPQR.game?.showSquads(show);
    window.__SPQR.game?.showSettlements(show);
  }, visible);
}

/** Looks out from one tile, which is what a tick does with a Faction's own eyes. */
async function lookFrom(page: Page, site: Site): Promise<void> {
  await page.evaluate((at) => window.__SPQR.view?.lookFrom(at.x, at.y), site);
}

/**
 * Pans the camera so one stage point is in the middle of the viewport.
 *
 * `panBy` is whole stage pixels and refuses nothing a player could not do, so this
 * is a pan and not a teleport: the delta is computed from the camera the page
 * reports, and read back afterwards, because the camera clamps itself to the
 * theatre and a test that assumed its own arithmetic would be wrong at an edge.
 */
async function centreOn(page: Page, stage: { readonly x: number; readonly y: number }): Promise<ViewState> {
  const before = await describeView(page);
  const wantedX = Math.round(stage.x - before.width / (2 * before.camera.zoom));
  const wantedY = Math.round(stage.y - before.height / (2 * before.camera.zoom));
  await page.evaluate(
    ({ dx, dy }) => window.__SPQR.view?.panBy(dx, dy),
    { dx: wantedX - before.camera.x, dy: wantedY - before.camera.y },
  );

  return describeView(page);
}

/**
 * Walks the canvas and keeps the points that are ground the Faction knows: inside
 * the viewport, off the interface, and on a tile that is not unexplored.
 *
 * The step follows the zoom, so eight times magnification is walked as finely over
 * fewer stage pixels rather than asked eight times the questions.
 */
function groundPoints(
  view: ViewState,
  states: readonly Knowledge[],
  rects: readonly Rect[],
): { readonly point: readonly [number, number]; readonly stage: readonly [number, number] }[] {
  const { camera } = view;
  const kept: { readonly point: readonly [number, number]; readonly stage: readonly [number, number] }[] = [];

  for (let screenY = 0; screenY < view.height; screenY += Math.max(13, camera.zoom * 3)) {
    for (let screenX = 0; screenX < view.width; screenX += Math.max(17, camera.zoom * 5)) {
      if (rects.some((rect) => covers(rect, screenX, screenY))) continue;

      const stageX = camera.x + Math.floor(screenX / camera.zoom);
      const stageY = camera.y + Math.floor(screenY / camera.zoom);
      if (stageX < 0 || stageY < 0 || stageX >= THEATRE.width || stageY >= THEATRE.height) continue;
      if (expectedAt(states, stageX, stageY) === null) continue;

      kept.push({ point: [screenX, screenY], stage: [stageX, stageY] });
    }
  }

  return kept;
}

test.describe('the quietened terrain on screen', () => {
  for (const faction of FACTIONS) {
    test(`${faction} draws the generated terrain, visible and remembered, at zooms 1, 2, 4 and 8`, async ({ page }) => {
      await mkdir(EVIDENCE, { recursive: true });
      const stronghold = MAP.strongholds[faction === 'rome' ? 0 : 1];
      if (stronghold === undefined) throw new Error('the map has no Stronghold for this Faction');

      // A watch out in the country, and then four tiles further on. What it saw
      // first is now *remembered* and what it sees now is *visible*, side by side —
      // the two states a played map is actually made of.
      const away = stronghold.x < MAP_WIDTH / 2 ? 1 : -1;
      const first = {
        x: Math.min(Math.max(stronghold.x + away * WATCH_AWAY, 2), MAP_WIDTH - 3),
        y: Math.min(Math.max(stronghold.y, 2), MAP_HEIGHT - 3),
      };
      const then = {
        x: Math.min(Math.max(first.x - away * WATCH_STEP, 2), MAP_WIDTH - 3),
        y: first.y,
      };
      // The edge of the watch's own vision: in view on the near side of it, memory on
      // the far side, and both inside one screen at every supported zoom.
      const edge = { x: Math.min(Math.max(then.x + away * LOOK_EDGE, 2), MAP_WIDTH - 3), y: then.y };

      for (const size of RESOLUTIONS) {
        await openMatch(page, faction, size);
        await showSquads(page, false);
        await lookFrom(page, first);
        await lookFrom(page, then);

        for (const zoom of ZOOMS) {
          await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);
          const stage = {
            x: edge.x * TERRAIN_TILE + TERRAIN_TILE / 2 + THEATRE_MARGIN,
            y: edge.y * TERRAIN_TILE + TERRAIN_TILE / 2 + THEATRE_MARGIN,
          };
          const view = await centreOn(page, stage);
          expect(view.camera.zoom).toBe(zoom);

          const states = await knowledge(page);
          const rects = await hudRects(page);
          const kept = groundPoints(view, states, rects);
          expect(kept.length, `zoom ${String(zoom)} has ground to read`).toBeGreaterThan(20);

          const drawn = await samples(
            page,
            'view',
            kept.map((entry) => entry.point),
          );
          let wrong = 0;
          let seen = 0;
          let remembered = 0;
          for (const [index, entry] of kept.entries()) {
            const wanted = expectedAt(states, entry.stage[0], entry.stage[1]);
            const got = drawn[index];
            if (wanted === null || got === undefined) continue;

            const at = tileAt(entry.stage[0], entry.stage[1]);
            if (states[at.y * MAP_WIDTH + at.x] === KNOWLEDGE.visible) seen += 1;
            else remembered += 1;
            const off = [0, 1, 2].some(
              (channel) => Math.abs((got[channel] ?? 0) - (wanted.colour[channel] ?? 0)) > wanted.tolerance,
            );
            if (off) wrong += 1;
          }

          expect(wrong, `${faction} ${String(size.width)}x${String(size.height)} at zoom ${String(zoom)}`).toBe(0);
          // Both states in every scene, so a scene of one of them cannot pass for
          // having covered both.
          expect(seen, 'ground in view').toBeGreaterThan(5);
          expect(remembered, 'ground remembered').toBeGreaterThan(5);
          test.info().annotations.push({
            type: 'ground-on-screen',
            description: `${faction} ${String(size.width)}x${String(size.height)} at zoom ${String(zoom)}: ${String(seen)} sampled points in view and ${String(remembered)} remembered, every one the generator's own pixel`,
          });

          await page.screenshot({
            path: join(
              EVIDENCE,
              `match-${faction}-${String(size.width)}x${String(size.height)}-zoom${String(zoom)}.png`,
            ),
          });
        }
      }
    });
  }

  test('the man in a Squad block is the loudest thing on the ground he stands on', async ({ page }) => {
    for (const faction of FACTIONS) {
      await openMatch(page, faction, RESOLUTIONS[0]);

      // A Squad of the Faction's own, raised the way a Player raises one: the
      // settlement's recruitment page, its own offer, one tick to stand the men up.
      // Nothing is placed by a fixture, so what is measured is a scene the rules
      // produced.
      const home = await page.evaluate(() => window.__SPQR.game?.state().visible.settlements[0]);
      expect(home, `${faction} holds a settlement`).toBeDefined();
      if (home === undefined) throw new Error('the Faction holds nothing');

      await select(page, { kind: 'settlement', id: home.id });
      const recruitment = await page.evaluate(() => window.__SPQR.game?.hudLayout().tabs
        .find((tab) => tab.tab === 'recruitment')?.rect);
      expect(recruitment, 'the settlement has a recruitment page').toBeDefined();
      if (recruitment === undefined) throw new Error('no recruitment tab');

      await press(page, recruitment);
      const offer = await page.evaluate((wanted) => window.__SPQR.game?.hud().commands
        .find((order) => order.id === `recruit:${wanted}`)?.id, faction === 'rome' ? 'hastati' : 'libyan-spear');
      expect(offer, `${faction} can raise its first line`).toBeDefined();
      if (offer === undefined) throw new Error('the recruitment page offers no first line');
      expect(
        await page.evaluate((id) => window.__SPQR.game?.perform(id), offer),
        `${faction}: the order was taken`,
      ).toBe(true);
      await advance(page, 1);
      await select(page, null);

      const view = await describeView(page);
      const rects = await hudRects(page);
      const reports = await squads(page);

      const nearest = reports.find((report) => {
        const at = stageToScreen(view.camera, report.rect.x, report.rect.y);

        return at.x >= 0 && at.y >= 0 && at.x < view.width && at.y < view.height;
      });
      expect(nearest, `${faction} has a Squad on screen`).toBeDefined();
      if (nearest === undefined) throw new Error('no Squad on screen to measure');

      // The block's own screen rectangle: the stage rectangle the men are drawn in,
      // magnified by the whole-number zoom. The block is measured in theatre pixels.
      const topLeft = stageToScreen(view.camera, nearest.rect.x, nearest.rect.y);
      const across = nearest.rect.width * view.camera.zoom;
      const down = nearest.rect.height * view.camera.zoom;
      type Pointed = {
        readonly point: [number, number];
        readonly tile: number;
        readonly stage: readonly [number, number];
      };
      const block: Pointed[] = [];
      for (let y = 0; y < down; y += 1) {
        for (let x = 0; x < across; x += 1) {
          const screenX = topLeft.x + x;
          const screenY = topLeft.y + y;
          if (screenX >= view.width || screenY >= view.height) continue;
          if (rects.some((rect) => covers(rect, screenX, screenY))) continue;

          const stageX = view.camera.x + Math.floor(screenX / view.camera.zoom);
          const stageY = view.camera.y + Math.floor(screenY / view.camera.zoom);
          const at = tileAt(stageX, stageY);
          block.push({ point: [screenX, screenY], tile: at.y * MAP_WIDTH + at.x, stage: [stageX, stageY] });
        }
      }
      expect(block.length, 'the block is on screen and off the interface').toBeGreaterThan(100);

      const range = (colours: readonly Rgba[]): number => {
        const values = colours.map((colour) => luminance(colour));

        return Math.max(...values) - Math.min(...values);
      };

      // The same pixels twice: with the men, and with the men hidden. What is compared
      // is the men's own range against a single tile of the ground under them — per
      // tile, because a block can straddle a river and a field, and the range of a
      // *landscape* is a fact about the map rather than about its texture. The question
      // U5 asks is whether the ground's repeated detail competes, so the ground's
      // number is one tile of it and not the whole neighbourhood.
      const withMen = range(await samples(page, 'view', block.map((entry) => entry.point)));
      await mkdir(EVIDENCE, { recursive: true });
      await page.screenshot({ path: join(EVIDENCE, `squad-${faction}-1280x720.png`) });
      await showSquads(page, false);
      const groundPixels = await samples(page, 'view', block.map((entry) => entry.point));
      await showSquads(page, true);

      // The middle of each tile and nothing else: a transition paints its outline and
      // its bands against a tile's edges, and a boundary is *meant* to be loud (the
      // ticket keeps boundaries and roads legible). What is measured here is the
      // ground's own repeated detail, which is what U5 quietened.
      const byTile = new Map<number, Rgba[]>();
      for (const [index, entry] of block.entries()) {
        const colour = groundPixels[index];
        if (colour === undefined) continue;

        const localX = (entry.stage[0] - THEATRE_MARGIN) & (TERRAIN_TILE - 1);
        const localY = (entry.stage[1] - THEATRE_MARGIN) & (TERRAIN_TILE - 1);
        if (localX < 4 || localX > 11 || localY < 4 || localY > 11) continue;

        const collected = byTile.get(entry.tile) ?? [];
        collected.push(colour);
        byTile.set(entry.tile, collected);
      }
      expect(byTile.size, 'the block covers whole tiles of ground').toBeGreaterThan(0);
      // The median tile rather than the loudest one: a block can stand over a Resource
      // marker, and a marker is a thing on the terrain that is *meant* to be louder
      // than it — U5's other half. What is measured here is the ground.
      const tileRanges = [...byTile.values()].map((colours) => range(colours)).sort((left, right) => left - right);
      const ground = Math.max(1, tileRanges[Math.floor(tileRanges.length / 2)] ?? 1);

      // The figure/ground claim, in the live frame: the men span several times the
      // brightness a tile of ground under them dares to use. A ground that grew loud
      // again — a return to whole-ramp dithering — fails here.
      expect(withMen, `${faction}: the men are drawn in contrast`).toBeGreaterThan(60);
      test.info().annotations.push({
        type: 'figure-over-ground',
        description: `${faction}: the block spans ${withMen.toFixed(1)} levels of brightness, the ground under it ${ground.toFixed(1)} — ${(withMen / ground).toFixed(2)} times as much`,
      });
      expect(withMen / ground, `${faction}: figure over ground`).toBeGreaterThan(2.5);
    }
  });

  test('a scene keeps its terrains apart after the quietening', async ({ page }) => {
    await mkdir(EVIDENCE, { recursive: true });
    await openMatch(page, 'rome', RESOLUTIONS[1]);
    await showSquads(page, false);

    // The whole theatre revealed is not a Player's view, but it is the fastest way to
    // put every material on one screen: this test is about the ground's own spread
    // and not about knowledge, which the fog suite owns.
    await page.evaluate(() => window.__SPQR.view?.inspect(true));
    await page.evaluate(() => window.__SPQR.view?.zoomTo(1));
    const view = await describeView(page);

    const centres = new Map<number, { x: number; y: number; count: number }>();
    for (let y = 4; y < view.height - 4; y += 3) {
      for (let x = 4; x < view.width - 4; x += 3) {
        const stageX = view.camera.x + x;
        const stageY = view.camera.y + y;
        const at = tileAt(stageX, stageY);
        const terrain = MAP.terrain[at.y * MAP_WIDTH + at.x];
        if (terrain === undefined) continue;

        // The middle of a tile is its own material, clear of every band a transition
        // paints at a cell's centre.
        const localX = (stageX - THEATRE_MARGIN) & (TERRAIN_TILE - 1);
        const localY = (stageY - THEATRE_MARGIN) & (TERRAIN_TILE - 1);
        if (localX < 4 || localX > 11 || localY < 4 || localY > 11) continue;

        const entry = centres.get(terrain) ?? { x: 0, y: 0, count: 0 };
        entry.x += x;
        entry.y += y;
        entry.count += 1;
        centres.set(terrain, entry);
      }
    }
    expect(centres.size, 'the screen holds several terrains').toBeGreaterThanOrEqual(5);

    const points = [...centres.values()].map((entry) => [Math.round(entry.x / entry.count), Math.round(entry.y / entry.count)] as [number, number]);
    const drawn = await samples(page, 'view', points);
    const values = drawn.map((colour) => luminance(colour));
    const spread = Math.max(...values) - Math.min(...values);

    // Terrains are told apart by colour first: the quietening kept every material on
    // its own base, so a screen holding five of them still spans a wide brightness.
    expect(spread, 'the terrains still differ').toBeGreaterThan(40);

    await page.screenshot({ path: join(EVIDENCE, 'match-rome-1920x1080-every-terrain.png') });
  });
});
