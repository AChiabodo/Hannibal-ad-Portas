/**
 * A battle and a Siege on the running page, with #66's force rule in view.
 *
 * The headless comparisons (`tests/sim/balance.test.ts`) are where the numbers of
 * the new force model are measured. This is the one **normal-browser** scene the
 * ticket asks for beside them: the real Match on the real page, driven the way a
 * Player drives it, and read back through the page's own hooks — because a rule
 * that only holds when nobody is looking is not a rule a Player can rely on.
 *
 * Three claims:
 *
 * 1. **the panel says what the force is** — a Squad's own bearing (`Forza`) is
 *    its men, which is the fact the exchange, a wall's defence and the AI's
 *    estimate all read;
 * 2. **a wall is worked at a body's rate, not a Squad's** — three Roman bodies
 *    under the wall chip it no faster than one, so drawing three Squads where
 *    there could have been one buys no free Siege power;
 * 3. **equal bodies pay equally** — the three of them bring the same force, and
 *    the walls cost each of them the same men over the same rounds.
 *
 * Nothing here arranges a rule: the scene is `e2e/siege-fixture.ts`, which is the
 * real Match with an army at Carthage's walls and an idle opponent.
 */
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import type { ViewState } from '../src/render/boot';
import type { SiteReport } from '../src/render/game';
import { stageToScreen } from '../src/render/camera';
import { DEFAULT_SEED } from '../src/render/view';
import { generateMap } from '../src/sim/map';
import { ASSAULT_TICKS, ESCALADE_DAMAGE } from '../src/sim/siege';
import { translate } from '../src/ui/strings';
import { turnPoint } from '../src/content/settlement-layout';
import { tilePixel } from '../src/render/terrain';
import { advance, applied, describeView, hud, hudLayout, select, selection, sites, squads } from './hooks';

/** The theatre the fixture's Match opens on, so its Strongholds are known here. */
const MAP = generateMap(DEFAULT_SEED);

/** Carthage's Stronghold: the walled place the fixture's army stands before. */
const TARGET = MAP.strongholds[1];

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

/** Carthage's Stronghold as the page reports it, after the tick that makes it the enemy's. */
async function theWalls(page: Page) {
  await advance(page, 1);
  const site = (await sites(page)).find(
    (candidate) => candidate.kind === 'stronghold' && candidate.x === TARGET?.x && candidate.y === TARGET?.y,
  );
  if (site === undefined) throw new Error('the fixture has no Carthaginian Stronghold on the map');

  return site;
}

/**
 * The hit points left on every stretch of wall, added up.
 *
 * A gate is left out on purpose: the ram is the engine that breaks it, and what
 * this measures is the *men's* work at the walls under it.
 */
function wallHp(site: SiteReport | undefined, sides: ReadonlySet<string>): number {
  return (site?.front?.structures ?? [])
    .filter((structure) => structure.kind === 'wall' && sides.has(structure.side))
    .reduce((total, structure) => total + structure.hp, 0);
}

test('works a wall at a body’s rate on the real page, and says what each Reparto’s force is', async ({ page }) => {
  await page.goto('/e2e/siege-fixture.html');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  const army = await squads(page);
  expect(army.length, 'the scene mustered an army').toBe(3);

  // The panel's own force figure: an infantry man is worth one point, so the
  // bearing the rules fight with is the men a Player already reads (#66).
  await select(page, { kind: 'squad', id: army[0]!.id });
  await advance(page, 1);
  const panel = await hud(page);
  const force = panel.detail?.lines.find((line) => line.label === translate('ui.force'));
  expect(force, 'the Squad panel states its force').toBeDefined();
  expect(Number(force?.value)).toBe(army[0]?.men);

  // The town, and the army picked the way a Player picks it: a box over the men.
  await page.evaluate(() => window.__SPQR.view?.zoomTo(2));
  const target = await theWalls(page);
  const view = await centreOn(page, {
    x: army.reduce((sum, squad) => sum + squad.rect.x + squad.rect.width / 2, 0) / army.length,
    y: army.reduce((sum, squad) => sum + squad.rect.y + squad.rect.height / 2, 0) / army.length,
  });
  const corners = (await squads(page)).map((squad) => ({
    left: stageToScreen(view.camera, squad.rect.x, squad.rect.y),
    right: stageToScreen(view.camera, squad.rect.x + squad.rect.width, squad.rect.y + squad.rect.height),
  }));
  await page.evaluate(
    ({ from, to }) => window.__SPQR.game?.selectIn(from.x, from.y, to.x, to.y),
    {
      from: {
        x: Math.min(...corners.map((corner) => corner.left.x)) - 4,
        y: Math.min(...corners.map((corner) => corner.left.y)) - 4,
      },
      to: {
        x: Math.max(...corners.map((corner) => corner.right.x)) + 4,
        y: Math.max(...corners.map((corner) => corner.right.y)) + 4,
      },
    },
  );

  expect((await selection(page)).squads, 'the box picked the army').toHaveLength(army.length);

  // An Assault, aimed at the town in the drawing: the click lands on the
  // gatehouse a Player can see, not on the one tile the rules name it by.
  expect(await page.evaluate(() => window.__SPQR.game?.perform('assault'))).toBe(true);
  const side = target.front!.structures.find((structure) => structure.kind === 'gate')!.side;
  const offset = turnPoint({ x: 0, y: 7 }, ['north', 'east', 'south', 'west'].indexOf(side));
  const gateTile = tilePixel(target.x + offset.x, target.y + offset.y);
  const gate = stageToScreen(view.camera, gateTile.x, gateTile.y);
  expect(await page.evaluate(({ x, y }) => window.__SPQR.game?.targetAt(x, y), gate)).toBe(true);
  expect(await page.evaluate(() => window.__SPQR.game?.targeting())).toBeNull();

  // The order is queued, not applied: one tick is what releases it, exactly as
  // any other Command.
  await advance(page, 1);
  expect((await applied(page)).some((entry) => entry.command.kind === 'assault')).toBe(true);
  const seenWalls = target.front!.structures.filter((structure) => structure.kind === 'wall');
  expect(seenWalls.length, 'the army sees the wall it is attacking').toBeGreaterThan(0);
  const sides = new Set(seenWalls.map((wall) => wall.side));

  // Five assault rounds and no more: the walls may lose a body's worth of hit
  // points a round however many bodies are under them.
  const before = wallHp(await theWalls(page), sides);
  const rounds = 5;
  await advance(page, ASSAULT_TICKS * rounds);
  const done = before - wallHp(await theWalls(page), sides);

  expect(done, 'the men at the wall are actually working it').toBeGreaterThan(0);
  // A round of slack, because five rounds need not fall on a round boundary.
  expect(done).toBeLessThanOrEqual(ESCALADE_DAMAGE * (rounds + 1));

  // And three bodies of the same force pay the walls equally: the same men for
  // the same rounds, whatever number of Squads they are drawn as.
  const maimed = await squads(page);
  const losses = maimed.map((squad) => (army.find((was) => was.id === squad.id)?.men ?? 0) - squad.men);
  expect(losses.every((lost) => lost > 0), 'the walls cost every body men').toBe(true);
  expect(Math.max(...losses) - Math.min(...losses)).toBeLessThanOrEqual(1);
});
