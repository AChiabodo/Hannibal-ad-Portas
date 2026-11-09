/**
 * Settlements and fortifications on the running page (ticket U6).
 *
 * Four claims, and each is asked of the page rather than of the generator alone:
 *
 * 1. **the drawing is where the page says it is** — the pixels inside the rectangle
 *    `sites()` reports are the sprite the generator produced, at every supported
 *    zoom, for both Factions;
 * 2. **a pointer click picks the structure it lands on** — a click near a town's
 *    corner opens that settlement's panel, and a click on the bare ground beside it
 *    does not, which is only true if picking follows the drawing and not the tile;
 * 3. **an armed action aimed at the drawn wall names the town** — the same
 *    submission path a Player's button and the shared hook use;
 * 4. **a settlement that is only remembered is drawn as a memory** — dimmed by the fog
 *    the ground under it is dimmed by, with no owner's banner and no damage, and its
 *    panel says so in words.
 *
 * The scenes are written outside the repository (the guard forbids committing image
 * files) and are the evidence a human reviewer looks at; what the test itself
 * asserts is pixels, clicks and Commands.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { capture } from './evidence';
import { pixelAt, type Rgba } from '../src/art/pixel-buffer';
import { siteSprite } from '../src/art/settlements';
import { screenToStage, stageToScreen } from '../src/render/camera';
import { REMEMBERED } from '../src/render/fog';
import { siteLook } from '../src/render/settlements';
import { tileAt } from '../src/render/terrain';
import type { ViewState } from '../src/render/boot';
import type { SiteReport } from '../src/render/game';
import { KNOWLEDGE, type Knowledge } from '../src/sim/fog';
import { GATE_HP } from '../src/sim/siege';
import { MAP_WIDTH, generateMap } from '../src/sim/map';
import { translate } from '../src/ui/strings';
import type { Rect } from '../src/ui/hud';
import {
  advance,
  applied,
  bootGame,
  covers,
  describeView,
  dismissFirstEntry,
  hud,
  hudRects,
  hudLayout,
  knowledge,
  samples,
  select,
  selection,
  sites,
  squads,
} from './hooks';

/** The seed the scenes are played on: the setup page's own fixture seed. */
const SEED = 7;

/** The two reference resolutions the shared constraints ask for. */
const RESOLUTIONS = [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
] as const;

/** The Factions, through the address the setup page builds. */
const FACTIONS = ['rome', 'carthage'] as const;
type Faction = (typeof FACTIONS)[number];

/** The magnifications a scene is walked at: the camera's coarsest, two between, and its finest. */
const ZOOMS = [1, 2, 4, 8] as const;

/** The theatre the page generates for the seed: where the two Strongholds stand. */
const MAP = generateMap(SEED);

/** Opens the real Match page, paused, at the viewport asked for. */
async function openMatch(
  page: Page,
  faction: Faction,
  size: { readonly width: number; readonly height: number },
): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await dismissFirstEntry(page);
  await page.goto(`/?play=1&seed=${String(SEED)}&faction=${faction}&difficulty=centurio`);
  await expect(page.locator('body')).toHaveAttribute('data-spqr-screen', 'match');
  await page.evaluate(() => {
    window.__SPQR.game?.pause();
  });
}

/** Puts the men's lens on or off: a town is compared with its own pixels, not with a Squad's. */
async function showSquads(page: Page, visible: boolean): Promise<void> {
  await page.evaluate((show) => {
    window.__SPQR.game?.showSquads(show);
  }, visible);
}

/** A click at a canvas point, through the canvas's own offset from the page's origin. */
async function clickAt(page: Page, x: number, y: number): Promise<void> {
  const box = await page.locator('#app canvas').boundingBox();
  if (box === null) throw new Error('the page has no canvas');

  await page.mouse.click(box.x + x, box.y + y);
}

/** Painted ink of an observed structure, rather than the transparent grounds padding. */
function structurePoint(site: SiteReport, kind: 'gate' | 'wall' = 'wall'): { readonly x: number; readonly y: number } {
  const tile = site.appearance?.tiles.find((cell) => cell.structure?.kind === kind);
  if (tile === undefined) throw new Error(`no observed ${kind} at settlement ${site.id}`);
  const sprite = siteSprite(siteLook(site));
  const left = (tile.cell % 25) * 16, top = Math.floor(tile.cell / 25) * 16;
  for (let y = top + 4; y < top + 16; y += 1) for (let x = left + 4; x < left + 16; x += 1)
    if (pixelAt(sprite, x, y)[3] !== 0) return { x: site.rect.x + x, y: site.rect.y + y };
  throw new Error(`the observed ${kind} has no painted ink`);
}

/** Pans the camera so one stage point is in the middle of the viewport. */
async function centreOn(page: Page, stage: { readonly x: number; readonly y: number }): Promise<ViewState> {
  const before = await describeView(page);
  const area = (await hudLayout(page)).theatre ?? { x: 0, y: 0, width: before.width, height: before.height };
  const wantedX = Math.round(stage.x - (area.x + area.width / 2) / before.camera.zoom);
  const wantedY = Math.round(stage.y - (area.y + area.height / 2) / before.camera.zoom);
  await page.evaluate(
    ({ dx, dy }) => window.__SPQR.view?.panBy(dx, dy),
    { dx: wantedX - before.camera.x, dy: wantedY - before.camera.y },
  );

  return describeView(page);
}

/** One theatre pixel as the remembered veil leaves it: the compositor's own source-over blend. */
function veiled(colour: Rgba): readonly number[] {
  const alpha = REMEMBERED[3] / 255;

  return [0, 1, 2].map((channel) => (REMEMBERED[channel] ?? 0) * alpha + (colour[channel] ?? 0) * (1 - alpha));
}

/** Whether two colours agree, within the slack a float blend on the GPU is allowed. */
function same(got: Rgba | undefined, wanted: readonly number[], tolerance: number): boolean {
  if (got === undefined) return false;

  return [0, 1, 2].every((channel) => Math.abs((got[channel] ?? 0) - (wanted[channel] ?? 0)) <= tolerance);
}

/** The knowledge state of the tile a stage pixel stands on. */
function knowledgeAt(states: readonly Knowledge[], x: number, y: number): Knowledge {
  const tile = tileAt(x, y);

  return states[tile.y * MAP_WIDTH + tile.x] ?? KNOWLEDGE.unexplored;
}

/**
 * The points inside a settlement's rectangle that are worth comparing: painted pixels of
 * the drawing, on screen, and not behind a panel.
 */
function samplePoints(
  site: SiteReport,
  view: ViewState,
  rects: readonly Rect[],
): { readonly point: readonly [number, number]; readonly stage: readonly [number, number]; readonly from: readonly [number, number] }[] {
  const sprite = siteSprite(siteLook(site));
  const kept: { point: readonly [number, number]; stage: readonly [number, number]; from: [number, number] }[] = [];

  for (let sy = 0; sy < sprite.height; sy += 3) {
    for (let sx = 0; sx < sprite.width; sx += 3) {
      if (pixelAt(sprite, sx, sy)[3] === 0) continue;

      const stage = { x: site.rect.x + sx, y: site.rect.y + sy };
      const screen = stageToScreen(view.camera, stage.x, stage.y);
      if (screen.x < 0 || screen.y < 0 || screen.x >= view.width || screen.y >= view.height) continue;
      if (rects.some((rect) => covers(rect, screen.x, screen.y))) continue;

      kept.push({ point: [screen.x, screen.y], stage: [stage.x, stage.y], from: [sx, sy] });
    }
  }

  return kept;
}

/**
 * Asserts the page draws one settlement exactly as the generator does, through the fog.
 *
 * Visible ground is exact; remembered ground is allowed a step either way, because
 * the veil is composited by the GPU in floating point; unexplored ground is skipped,
 * because what is there is the fog and not the settlement.
 */
async function expectDrawn(
  page: Page,
  site: SiteReport,
  view: ViewState,
  context: string,
): Promise<number> {
  const rects = await hudRects(page);
  const states = await knowledge(page);
  const points = samplePoints(site, view, rects);
  expect(points.length, `${context}: the settlement is on screen`).toBeGreaterThan(15);

  const sprite = siteSprite(siteLook(site));
  const read = await samples(page, 'view', points.map((entry) => entry.point));
  let compared = 0;

  for (const [index, entry] of points.entries()) {
    const ground = knowledgeAt(states, entry.stage[0], entry.stage[1]);
    if (ground === KNOWLEDGE.unexplored) continue;

    const colour = pixelAt(sprite, entry.from[0], entry.from[1]);
    const wanted = ground === KNOWLEDGE.visible ? [colour[0], colour[1], colour[2]] : veiled(colour);
    expect(same(read[index], wanted, ground === KNOWLEDGE.visible ? 0 : 2),
      `${context}: (${String(entry.from[0])},${String(entry.from[1])})`).toBe(true);
    compared += 1;
  }

  return compared;
}

test.describe('a settlement drawn on the map', () => {
  for (const faction of FACTIONS) {
    test(`${faction} draws its own Stronghold from the generator’s own pixels, at zooms 1, 2, 4 and 8`, async ({ page }) => {
      for (const size of RESOLUTIONS) {
        await openMatch(page, faction, size);
        await showSquads(page, false);

        const drawn = await sites(page);
        const own = drawn.find((site) => site.kind === 'stronghold' && site.owner === faction);
        expect(own, 'the Faction has its own Stronghold on the map').toBeDefined();

        // Nothing unseen is on the map: the enemy's Stronghold has not been looked at.
        expect(drawn.filter((site) => site.kind === 'stronghold' && site.owner !== faction)).toHaveLength(0);

        for (const zoom of ZOOMS) {
          await page.evaluate((level) => window.__SPQR.view?.zoomTo(level), zoom);
          const view = await centreOn(page, {
            x: own!.rect.x + Math.floor(own!.rect.width / 2),
            y: own!.rect.y + Math.floor(own!.rect.height / 2),
          });
          expect(view.camera.zoom).toBe(zoom);

          const compared = await expectDrawn(page, own!, view, `${faction} ${String(size.width)}x${String(size.height)} zoom ${String(zoom)}`);
          expect(compared, `zoom ${String(zoom)}`).toBeGreaterThan(15);
        }

        await capture(page, `stronghold-${faction}-${String(size.width)}x${String(size.height)}`, 'issue57');
      }
    });
  }

  test('picks the structure a pointer lands on, not the tile it stands on', async ({ page }) => {
    await openMatch(page, 'rome', RESOLUTIONS[0]);
    await showSquads(page, false);
    await page.evaluate(() => window.__SPQR.view?.zoomTo(1));

    const own = (await sites(page)).find((site) => site.kind === 'stronghold');
    if (own === undefined) throw new Error('Rome has no Stronghold on the map');
    const view = await centreOn(page, {
      x: own.rect.x + Math.floor(own.rect.width / 2),
      y: own.rect.y + Math.floor(own.rect.height / 2),
    });
    const rects = await hudRects(page);

    // An observed wall, far from the central Tile: picking must follow its ink.
    const painted = structurePoint(own);
    const corner = stageToScreen(view.camera, painted.x, painted.y);
    expect(rects.some((rect) => covers(rect, corner.x, corner.y)), 'the corner is on the theatre').toBe(false);

    await clickAt(page, corner.x, corner.y);
    expect(await selection(page)).toEqual({ squads: [], settlement: own.id });

    const model = await hud(page);
    expect(model.detail?.title).toBe(`${translate('ui.stronghold')} ${String(own.id)}`);
    // The panel and the drawing agree: the settlement clicked is the settlement described.
    expect(model.detail?.lines.length).toBeGreaterThan(3);

    await capture(page, 'selected-stronghold-rome', 'issue57');

    // Bare ground beside the town clears the selection: the rectangle is the
    // structure's, and the ground is not part of it.
    const beside = stageToScreen(view.camera, own.rect.x - 20, own.rect.y - 20);
    await clickAt(page, beside.x, beside.y);
    expect(await selection(page)).toEqual({ squads: [], settlement: null });
  });

  test('remembers a settlement it has stopped watching, and says so in words', async ({ page }) => {
    await dismissFirstEntry(page);
    await page.setViewportSize(RESOLUTIONS[0]);
    await page.goto('/e2e/siege-fixture.html');
    await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();
    await showSquads(page, false);

    const enemy = MAP.strongholds[1];
    const home = MAP.strongholds[0];
    if (enemy === undefined || home === undefined) throw new Error('the map has no Strongholds');

    const enemyOf = (drawn: readonly SiteReport[]): SiteReport | undefined =>
      drawn.find((site) => site.kind === 'stronghold' && site.owner !== 'rome');

    // Nothing of the enemy's is on the map before anybody looks: the unseen
    // Stronghold is not drawn at all.
    expect(enemyOf(await sites(page)), 'nothing unseen is on the map').toBeUndefined();

    // The fixture's real army observes the architecture through the Match;
    // moving a debug lens alone cannot create authoritative appearance records.
    await advance(page, 1);
    const seen = enemyOf(await sites(page));
    expect(seen, 'the enemy Stronghold is on the map once it has been seen').toBeDefined();
    expect(seen?.memory).toBe('seen');

    for (const squad of await squads(page)) {
      await select(page, { kind: 'squad', id: squad.id });
      expect(await page.evaluate(() => window.__SPQR.game?.perform('withdraw'))).toBe(true);
    }
    await advance(page, 300);
    const remembered = enemyOf(await sites(page));
    expect(remembered).toBeDefined();
    expect(remembered?.memory).toBe('remembered');
    expect(remembered?.front, 'memory carries no front').toBeNull();

    // The drawing is the remembered one: the same settlement, drawn as stone, under the
    // same veil the ground around it is under.
    await page.evaluate(() => window.__SPQR.view?.zoomTo(1));
    const view = await centreOn(page, {
      x: remembered!.rect.x + Math.floor(remembered!.rect.width / 2),
      y: remembered!.rect.y + Math.floor(remembered!.rect.height / 2),
    });
    const compared = await expectDrawn(page, remembered!, view, 'remembered stronghold');
    expect(compared).toBeGreaterThan(15);

    // Recorded architecture retains the last observed phase, with every cell
    // explicitly remembered; the fog comparison above verifies its dimming.
    expect(remembered!.appearance?.memory).toBe('remembered');
    expect(remembered!.appearance?.tiles.every((tile) => !tile.visible)).toBe(true);

    await capture(page, 'remembered-stronghold-rome', 'issue57');

    // Clicking it opens the settlement's panel, which says what kind of knowledge it is.
    const paintedWall = structurePoint(remembered!);
    const wall = stageToScreen(view.camera, paintedWall.x, paintedWall.y);
    await clickAt(page, wall.x, wall.y);
    expect((await selection(page)).settlement).toBe(remembered!.id);

    const model = await hud(page);
    expect(model.detail?.title).toBe(`${translate('ui.stronghold')} ${String(remembered!.id)}`);
    const words = model.detail?.lines.map((line) => `${line.label} ${line.value}`) ?? [];
    expect(words).toContain(`${translate('ui.siteState')} ${translate('ui.lastKnown')}`);
    // No wall condition is read out of the memory, because the memory holds none.
    expect(words).toContain(`${translate('ui.walls')} ${translate('ui.frontUnknown')}`);
  });
});
test.describe('a fortification under siege', () => {
  test('draws the damage the rules do: an assault breaks a gate on the map', async ({ page }) => {
    // The fortification scene (U6): the real Match, three Roman Squads at Carthage's
    // walls and nobody else on the field. Nothing about the walls is arranged — they
    // are `createSiege`'s, at their own hit points.
    await page.goto('/e2e/siege-fixture.html');
    await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

    const enemy = MAP.strongholds[1];
    if (enemy === undefined) throw new Error('the map has no Carthaginian Stronghold');

    // The scene is arranged outside a tick, so the page's first frame has the ground
    // in view but no contact written yet: one tick is what makes the Stronghold the
    // enemy's, in the Observation and therefore in the drawing and the panel.
    await advance(page, 1);
    const target = (await sites(page)).find((site) => site.kind === 'stronghold' && site.x === enemy.x);
    expect(target, 'the Stronghold is in the army’s sight').toBeDefined();
    // The gate is visible from outside; the central owner's banner is not.
    expect(target?.owner).toBeNull();
    expect(target?.appearance?.tiles.some((tile) => tile.structure?.kind === 'gate')).toBe(true);
    expect(target?.front?.structures.every((structure) => structure.standing)).toBe(true);

    // The camera on the town, so what a Player would do is what the test does.
    await page.evaluate(() => window.__SPQR.view?.zoomTo(2));
    const view = await centreOn(page, {
      x: target!.rect.x + Math.floor(target!.rect.width / 2),
      y: target!.rect.y + Math.floor(target!.rect.height / 2),
    });

    await capture(page, 'siege-before-rome', 'issue57');

    // The army, picked the way a Player picks it: a box drawn over the men.
    const army = await squads(page);
    expect(army.length, 'the scene mustered an army').toBeGreaterThan(0);
    const corners = army.map((squad) => ({
      left: stageToScreen(view.camera, squad.rect.x, squad.rect.y),
      right: stageToScreen(view.camera, squad.rect.x + squad.rect.width, squad.rect.y + squad.rect.height),
    }));
    const box = {
      left: Math.min(...corners.map((corner) => corner.left.x)) - 4,
      top: Math.min(...corners.map((corner) => corner.left.y)) - 4,
      right: Math.max(...corners.map((corner) => corner.right.x)) + 4,
      bottom: Math.max(...corners.map((corner) => corner.right.y)) + 4,
    };
    await page.evaluate(
      ({ from, to }) => window.__SPQR.game?.selectIn(from.x, from.y, to.x, to.y),
      { from: { x: box.left, y: box.top }, to: { x: box.right, y: box.bottom } },
    );
    expect((await selection(page)).squads, 'the box picked the army').toHaveLength(army.length);

    // An Assault, aimed at the structure a Player can see: the click lands on the
    // gatehouse in the drawing, and the order is to do it.
    expect(await page.evaluate(() => window.__SPQR.game?.perform('assault'))).toBe(true);
    const paintedGate = structurePoint(target!, 'gate');
    const aim = await centreOn(page, paintedGate);
    const gate = stageToScreen(aim.camera, paintedGate.x, paintedGate.y);
    await clickAt(page, gate.x, gate.y);
    expect(await page.evaluate(() => window.__SPQR.game?.targeting())).toBeNull();

    // Ten seconds at a time until the ram has hurt the gate: the engine has to be
    // paid for and built first (`RAM_BUILD_TICKS`), and the Match must not run to its
    // end while a scene is being taken.
    let hurt: SiteReport | undefined;
    for (let step = 0; step < 40; step += 1) {
      await advance(page, 10);
      const now = (await sites(page)).find((site) => site.id === target!.id);
      const gate = now?.front?.structures.find((structure) => structure.kind === 'gate');
      if (gate !== undefined && (!gate.standing || gate.hp < GATE_HP)) {
        hurt = now;
        break;
      }
    }

    expect(hurt, 'the ram reaches the gate').toBeDefined();
    const after = hurt!.front!.structures;
    expect(after.some((structure) => structure.kind === 'gate' && (!structure.standing || structure.hp < GATE_HP)),
      'the gate took the ram').toBe(true);

    // The drawing is the condition: the gate the rules have hurt is the gate drawn
    // damaged or broken, and a ram stands at it.
    const art = siteLook(hurt!);
    expect(art.appearance?.tiles.some((tile) => tile.structure?.kind === 'gate' &&
      (tile.structure.condition === 'damaged' || tile.structure.condition === 'breached'))).toBe(true);
    expect(art.appearance?.tiles.some((tile) => tile.ram === 'building' || tile.ram === 'built')).toBe(true);
    expect(art.appearance?.gateSide).toBe(3);

    await capture(page, 'siege-under-the-ram-rome', 'issue57');

    // The drawing is compared with the army out of the picture: the men are standing
    // at the walls, which is where the town is.
    await showSquads(page, false);
    const damaged = await describeView(page);
    const compared = await expectDrawn(page, hurt!, damaged, 'a Stronghold under the ram');
    expect(compared).toBeGreaterThan(15);

    // One blow at a time until the gate is *broken*: the map has to show three
    // states a Player can tell apart — a whole gate, a hurt one and a breach.
    let broken: SiteReport | undefined;
    for (let step = 0; step < 20; step += 1) {
      await advance(page, 10);
      const now = (await sites(page)).find((site) => site.id === target!.id);
      const gate = now?.front?.structures.find((structure) => structure.kind === 'gate');
      if (gate !== undefined && !gate.standing) {
        broken = now;
        break;
      }
    }

    expect(broken, 'the gate breaks before the Match ends').toBeDefined();
    expect(siteLook(broken!).appearance?.tiles.some((tile) => tile.structure?.kind === 'gate' &&
      tile.structure.condition === 'breached')).toBe(true);

    const brokenView = await describeView(page);
    const read = await expectDrawn(page, broken!, brokenView, 'a Stronghold with its gate broken');
    expect(read).toBeGreaterThan(15);
    await capture(page, 'siege-breached-rome', 'issue57');

    // And the panel says the same thing in words, from the same front.
    await select(page, { kind: 'settlement', id: target!.id });
    const model = await hud(page);
    const words = model.detail?.lines.map((line) => `${line.label} ${line.value}`) ?? [];
    expect(words).toContain(`${translate('ui.siteState')} ${translate('ui.inSight')}`);
    expect(words.some((line) => line.startsWith(translate('ui.walls')) || line.startsWith(translate('ui.gate')))).toBe(true);
  });
});

test.describe('an armed action aimed at a structure', () => {
  test('names the settlement whose drawn wall a Player clicks', async ({ page }) => {
    await bootGame(page, { paused: true });

    const army = await squads(page);
    expect(army.length, 'the fixture musters an army').toBeGreaterThan(0);
    await select(page, { kind: 'squad', id: army[0]!.id });
    expect((await selection(page)).squads).toHaveLength(1);

    const own = (await sites(page)).find((site) => site.kind === 'stronghold');
    if (own === undefined) throw new Error('Rome has no Stronghold on the map');

    await page.evaluate(() => window.__SPQR.view?.zoomTo(1));
    const view = await centreOn(page, { x: own.rect.x + own.rect.width / 2, y: own.rect.y + own.rect.height / 2 });
    const rects = await hudRects(page);
    const painted = structurePoint(own);
    const target = stageToScreen(view.camera, painted.x, painted.y);
    expect(rects.some((rect) => covers(rect, target.x, target.y))).toBe(false);

    // A Garrison is offered for a walled settlement of one's own, and it needs a
    // target: the panel's button is pressed through the shared hook, then the click
    // on the drawing completes it — the same path the pointer takes.
    expect(await page.evaluate(() => window.__SPQR.game?.perform('garrison'))).toBe(true);
    expect(await page.evaluate(() => window.__SPQR.game?.targeting())).toBe('garrison');

    await clickAt(page, target.x, target.y);
    expect(await page.evaluate(() => window.__SPQR.game?.targeting())).toBeNull();

    await advance(page, 1);
    const log = await applied(page);
    const command = log.at(-1)?.command;
    expect(command?.kind).toBe('garrison');
    expect(command).toMatchObject({ settlement: own.id });

    // The painted wall is far from the settlement centre, so centre-only picking
    // could not have accepted this target.
    const stage = screenToStage(view.camera, target.x, target.y);
    expect(Math.abs(stage.x - (own.rect.x + own.rect.width / 2)))
      .toBeGreaterThan(own.rect.width / 4);
  });
});


for (const faction of FACTIONS) test(`repairs a damaged Work and wall through the management panel: ${faction} (#76)`, async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await dismissFirstEntry(page);
  await page.goto('/e2e/hud-fixture.html');
  await page.evaluate(async (faction) => {
    const bootPath = '/src/render/boot.ts';
    const siegePath = '/src/sim/siege.ts';
    const buildingsPath = '/src/content/buildings.ts';
    const controllerPath = '/src/sim/controller.ts';
    const { bootRenderer } = await import(bootPath);
    const { siegeMatchRules } = await import(siegePath);
    const { buildingCode } = await import(buildingsPath);
    const { idleController } = await import(controllerPath);
    const view = await bootRenderer(document.getElementById('app')!, { seed: 7, faction,
      opponent: idleController(), rules: { ...siegeMatchRules, createWorld(seed: number) {
        const world = siegeMatchRules.createWorld(seed);
        const owner = faction === 'rome' ? 0 : 1;
        const home = world.economy.settlements[owner]!;
        home.stocks.fill(30);
        home.works.push({ building: buildingCode('farm')!, remaining: 0, ordinal: 0, hp: 40 });
        const wall = world.siege.fronts[owner]!.structures.find((item: { kind: number; side: number }) => item.kind === 1 && item.side === 0)!;
        wall.hp = 40;
        return world;
      } } });
    view.pause();
    window.__SPQR = { boot: { booted: true, render: view.probe }, game: view, view, atelier: null };
  }, faction);
  const owner = faction === 'rome' ? 0 : 1;
  await select(page, { kind: 'settlement', id: owner });
  const management = (await hudLayout(page)).buttons.find((button) => button.action === 'settlement:management')!;
  await clickAt(page, management.rect.x + 4, management.rect.y + 4);
  async function activate(action: string) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const layout = await hudLayout(page);
      const button = layout.buttons.find((button) => button.action === action);
      if (button !== undefined) {
        expect(button.enabled).toBe(true);
        await clickAt(page, button.rect.x + 4, button.rect.y + 4);
        await advance(page, 1);
        return;
      }
      const next = layout.buttons.find((button) => button.action === 'detailNext');
      if (next === undefined || !next.enabled) break;
      await clickAt(page, next.rect.x + 4, next.rect.y + 4);
    }
    throw new Error(`No management action ${action}`);
  }
  await activate('repairWork:farm:0');
  expect((await applied(page)).at(-1)?.command).toMatchObject({ kind: 'repairWork', faction, settlement: owner });
  await capture(page, `work-repair-${faction}`, 'issue76');
  await activate('repairFortification:wall:north');
  expect((await applied(page)).at(-1)?.command).toMatchObject({ kind: 'repairFortification', faction, settlement: owner });
  await capture(page, `wall-repair-${faction}`, 'issue76');
  await advance(page, 200);
  const shown = await page.evaluate((owner) => {
    const visible = window.__SPQR.game!.state().visible;
    return { farm: visible.settlements.find((site) => site.id === owner)!.works.find((work) => work.building === 'farm'),
      wall: visible.fronts.find((front) => front.settlement === owner)!.structures.find((item) => item.kind === 'wall' && item.side === 'north') };
  }, owner);
  expect(shown.farm).toMatchObject({ hp: 60, repairing: false });
  expect(shown.wall).toMatchObject({ hp: 60, repairing: false });
});
