/**
 * The game's state, as an inspector sees it (ticket E4).
 *
 * The page stopped being a black box here: `state()` hands back everything the
 * running Match believes — the tick, the result, the hash of the state, the
 * Faction's Observation, the interface's model, the picked set, the Squads, the
 * dead and the Command log — in one plain-data copy. Three properties are what
 * make that useful rather than decorative, and each is a test:
 *
 * - **it is whole**: one call answers what an inspecting agent would otherwise
 *   have to ask nine hooks for, at nine different ticks;
 * - **it is data**: it survives `structuredClone`, so it can be kept, diffed and
 *   carried across a browser bridge;
 * - **it is a copy**: writing through what came back reaches neither the Match,
 *   the interface nor the fog, which is the seam's rule applied to inspection.
 *
 * The last test here is about failure instead of success: it reads the account a
 * *failing* test would have attached — the boot report, the snapshot, the console
 * and the DOM — because evidence nobody has checked is evidence nobody should
 * trust at two in the morning.
 */
import { expect, test } from './fixtures';
import { MAP_HEIGHT, MAP_WIDTH } from '../src/sim/map';
import { DEFAULT_SEED, VIEWED_FACTION } from '../src/render/view';
import { bootGame, state } from './hooks';

test('exposes the whole of what an inspector asks about, in one call', async ({ page }) => {
  await bootGame(page, { paused: true });

  const snapshot = await state(page);

  expect(snapshot.seed).toBe(DEFAULT_SEED);
  expect(snapshot.faction).toBe(VIEWED_FACTION);
  expect(snapshot.bound).toBeGreaterThan(snapshot.tick);
  expect(snapshot.result).toBeNull();
  expect(snapshot.paused).toBe(true);
  expect(snapshot.speed).toBe(1);

  // The Match's own fingerprint: what two runs of the same Match agree on.
  expect(snapshot.hash).toMatch(/^[0-9a-f]{16}$/);

  // The Faction's window on the economy, and its fog at the map's own shape.
  expect(snapshot.visible.settlements.length).toBeGreaterThan(0);
  expect(snapshot.visible.squads.length).toBeGreaterThan(0);
  expect(snapshot.knowledge).toHaveLength(MAP_WIDTH * MAP_HEIGHT);

  // The interface, the picked set, the men and the log.
  expect(snapshot.hud.readouts.length).toBeGreaterThan(0);
  expect(snapshot.selection).toEqual({ squads: [], settlement: null });
  expect(snapshot.squads.map((squad) => squad.id)).toEqual(
    snapshot.visible.squads.map((squad) => squad.id),
  );
  expect(snapshot.applied).toEqual([]);
  expect(Array.isArray(snapshot.corpses)).toBe(true);
});

test('hands back plain data, so a caller may keep it or send it anywhere', async ({ page }) => {
  await bootGame(page, { paused: true });

  const copied = await page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    const snapshot = game.state();

    return {
      // `structuredClone` refuses a function, a proxy or a handle, so a snapshot
      // it can copy is the plain data the seam promises a Controller.
      cloned: structuredClone(snapshot).tick === snapshot.tick,
      functions: Object.entries(snapshot)
        .filter(([, value]) => typeof value === 'function')
        .map(([name]) => name),
    };
  });

  expect(copied).toEqual({ cloned: true, functions: [] });
});

test('is a copy: writing through it reaches neither the Match nor the interface', async ({ page }) => {
  await bootGame(page, { paused: true });

  const before = await state(page);

  const after = await page.evaluate(() => {
    const game = window.__SPQR.game;
    if (game === null) throw new Error('the page published no game hooks');

    const snapshot = game.state();
    // `Object.assign` rather than assignment, because the snapshot is a readonly
    // type: a caller is not *supposed* to do this, which is exactly why the page
    // must survive it happening anyway.
    Object.assign(snapshot, { tick: -1, hash: 'tampered' });
    Object.assign(snapshot.visible, { treasury: -1 });
    Object.assign(snapshot.hud, { readouts: [] });

    const again = game.state();

    return { tick: again.tick, treasury: again.visible.treasury, readouts: again.hud.readouts.length };
  });

  expect(after.tick).toBe(before.tick);
  expect(after.treasury).toBe(before.visible.treasury);
  expect(after.readouts).toBe(before.hud.readouts.length);
});

test('fingerprints the state: the same tick hashes the same, and the next one does not have to', async ({ page }) => {
  await bootGame(page, { paused: true });

  const first = await state(page);
  expect((await state(page)).hash).toBe(first.hash);

  await page.evaluate(() => window.__SPQR.game?.advance(10));

  const later = await state(page);
  expect(later.tick).toBe(first.tick + 10);
  expect(later.hash).not.toBe(first.hash);
});

test('keeps the evidence a failing test would need, without a picture', async ({ page, spqr }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  await page.evaluate(() => {
    console.error('a deliberate line a diagnosis has to keep');
  });

  const diagnosis = await spqr.diagnosis();

  expect(diagnosis.url).toContain('127.0.0.1');
  expect(diagnosis.boot).toMatchObject({ booted: true });
  expect(diagnosis.view).toMatchObject({ seed: DEFAULT_SEED, inspection: false });
  expect(diagnosis.state).toMatchObject({ seed: DEFAULT_SEED, faction: VIEWED_FACTION });
  expect(diagnosis.console.join('\n')).toContain('a deliberate line a diagnosis has to keep');
  expect(diagnosis.dom).toContain('<canvas');
  expect(diagnosis.errors).toEqual([]);
});
