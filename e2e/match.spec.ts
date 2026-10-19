/**
 * A whole Match, played through the page (ticket E4).
 *
 * The rest of the browser suite inspects the game; this plays one. The page's
 * Match has a bound — a Match's own horizon, three game years, the same bound a
 * headless Match runs to (ADR-0022) — and the two hooks E4 asks for are how a
 * test, or an agent, drives it to that end from outside:
 *
 * - **pause** stops the clock, and nothing about the wall clock gets past it;
 * - **fast-forward** skips the wall clock entirely and plays the Match to its
 *   bound, which is how 42 minutes of Match time is asserted in about a second of
 *   test time without the answer depending on how fast the machine is.
 *
 * Both are the same code path a Player's `Space` bar and the frame loop use, so
 * what the browser proves here is the game's own clock and not a test harness's.
 * The Match is then read back through the snapshot (`state()`), which is the
 * evidence an inspector gets instead of a screenshot: the tick it ended on, the
 * result, the hash of the state, and the Command log a replay is made of.
 */
import { expect, test } from './fixtures';
import { MATCH_TICKS } from '../src/sim/season';
import { advance, applied, bootGame, fastForward, select, squads, state, tickOf } from './hooks';

/**
 * The bound the page plays to, written out here rather than read back off the
 * page: a test that asked the page how long a Match is and then checked the
 * page's answer would be checking nothing.
 */
const BOUND = MATCH_TICKS;

test('fast-forwards a whole Match to its end, and says how it ended', async ({ page }) => {
  await bootGame(page, { paused: true });

  const opening = await state(page);
  expect(opening.bound).toBe(BOUND);
  expect(opening.tick).toBeLessThan(BOUND);
  expect(opening.result, 'the Match is still on').toBeNull();

  const result = await fastForward(page);

  // Nothing in this world can be won — it has an economy and no Siege — so the
  // end is the clock's, on the very bound the page reported.
  expect(result).toEqual({ kind: 'clock', tick: BOUND });

  const ended = await state(page);
  expect(ended.tick).toBe(BOUND);
  expect(ended.result).toEqual(result);

  // The loop is stopped with it: a Match that has ended does not keep playing,
  // and the wall clock gets no say in a page left open for a while. The wait is
  // the price of asserting that nothing happens — a fixed span of real time is
  // exactly what a "no tick appeared" claim is about.
  await page.waitForTimeout(200);
  expect(await tickOf(page)).toBe(BOUND);
});

test('refuses to step a Match past its own end', async ({ page }) => {
  await bootGame(page, { paused: true });
  const result = await fastForward(page);

  await expect(advance(page, 1)).rejects.toThrow(/ended on tick/);

  // And the refusal left the Match where it was, rather than half-stepping it.
  expect(await state(page)).toMatchObject({ tick: result.tick, result });

  // A second fast-forward answers with the ending the Match already had, because
  // re-playing a Match that is over is not a thing the clock can do.
  expect(await fastForward(page)).toEqual(result);
});

test('refuses an advance that would run past the bound, and names the fast-forward', async ({ page }) => {
  await bootGame(page, { paused: true });

  await expect(advance(page, BOUND + 1)).rejects.toThrow(/past the Match's end/);
  expect(await tickOf(page)).toBeLessThan(BOUND);
});

test('pauses and resumes the clock from outside the game', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('body[data-spqr-booted="true"]')).toBeAttached();

  await page.evaluate(() => window.__SPQR.game?.pause());
  const paused = await state(page);
  expect(paused.paused).toBe(true);

  // A paused Match steps no ticks however much wall time passes: the time spent
  // thinking is not banked and then replayed as a burst (B5).
  await page.waitForTimeout(250);
  expect(await tickOf(page)).toBe(paused.tick);

  await page.evaluate(() => window.__SPQR.game?.resume());
  expect((await state(page)).paused).toBe(false);

  // And a running Match does step on its own, which is what makes the pause a
  // pause rather than a test's convention.
  await expect.poll(() => tickOf(page), { timeout: 5000 }).toBeGreaterThan(paused.tick);
});

test('plays the Match a Player was playing, orders and all, and it still ends', async ({ page }) => {
  await bootGame(page, { paused: true });

  // An order given before the fast-forward is a Player's Command, and it reaches
  // the Match on the next tick the Match decides — the pause is what holds it
  // until then (B5).
  const [squad] = await squads(page);
  if (squad === undefined) throw new Error('the opening army mustered nobody');

  await select(page, { kind: 'squad', id: squad.id });
  await page.evaluate(() => window.__SPQR.game?.resume());
  await page.evaluate(() => window.__SPQR.game?.orderNow('hold'));
  await advance(page, 1);
  await page.evaluate(() => window.__SPQR.game?.pause());

  const ordered = (await applied(page)).filter((entry) => entry.command.kind === 'hold');
  expect(ordered).toHaveLength(1);
  expect(ordered[0]?.command).toMatchObject({ kind: 'hold', faction: 'rome', squads: [squad.id] });

  await fastForward(page);

  const ended = await state(page);
  expect(ended.result).toEqual({ kind: 'clock', tick: BOUND });
  // The log survives the fast-forward, stamped with the tick it applied on — the
  // shape a replay of this page's Match is made of (E2), bounded like the window
  // it is rather than the whole Match's worth.
  expect(ended.applied.map((entry) => entry.command.kind)).toContain('hold');
  expect(ended.applied.every((entry) => entry.command.faction === ended.faction)).toBe(true);
});
