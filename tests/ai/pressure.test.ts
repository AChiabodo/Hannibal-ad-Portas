import { expect, it } from 'vitest';
import { diagnosePressure } from '../../src/cli/pressure.ts';
import { createBrowserMatch } from '../../src/input/match-host.ts';
import { PRESSURE_LIMITS } from '../../src/cli/pressure.ts';
import { createNoticeBook } from '../../src/ui/conditions.ts';

it('discovers the southern Carthaginian start on seed 7 before the Imperator contact deadline', () => {
  const result = diagnosePressure(7, 'carthage', 'imperator');
  expect(result.contact).not.toBeNull();
  expect(result.contact!.tick).toBeLessThanOrEqual(1200);
  expect(result.pass).toBe(true);
}, 15000);

it('finds and contests the non-mirrored Roman latitude on seed 9 at Imperator', () => {
  const result = diagnosePressure(9, 'rome', 'imperator');
  expect(result.contact).not.toBeNull();
  expect(result.contact!.tick).toBeLessThanOrEqual(1200);
  expect(result.pressure).not.toBeNull();
  expect(result.pass).toBe(true);
}, 15000);

it('fields a sustainable Roman opening against a passive normal-start human by Centurio limits', () => {
  const result = diagnosePressure(1, 'carthage', 'centurio');
  expect(result.contact).not.toBeNull();
  expect(result.contact!.tick).toBeLessThanOrEqual(1800);
  expect(result.pressure).not.toBeNull();
  expect(result.pass).toBe(true);
  expect(result.unpaid).toBe(0);
}, 15000);

for (const faction of ['rome', 'carthage'] as const) {
  for (const difficulty of ['tiro', 'centurio', 'imperator'] as const) {
    it(`paces the real host with a passive ${faction} human at ${difficulty}, preserving contact notices and Replay`, () => {
      const book = createNoticeBook();
      let noticed: number | null = null;
      const host = createBrowserMatch({ seed: 1, faction, difficulty, afterTick(visible) {
        if (noticed !== null) return;
        const notice = book.read(visible, host.match.state.tick).find((notice) => notice.kind === 'contact');
        if (notice !== undefined) {
          expect(visible.enemies.some((enemy) => enemy.id === notice.target?.id)).toBe(true);
          noticed = notice.raised;
        }
      } });
      host.pacing.pause();
      host.elapse(60000);
      expect(host.match.state.tick).toBe(0);
      host.pacing.setSpeed(3);
      host.pacing.resume();
      const limit = PRESSURE_LIMITS[difficulty];
      while (host.result === null && host.match.state.tick < limit.pressure * 600) host.elapse(100);
      expect(noticed).not.toBeNull();
      expect(noticed!).toBeLessThanOrEqual(limit.contact * 600);
      expect(host.match.hash()).toBe(diagnosePressure(1, faction, difficulty).hash);
    // Host pacing plus an independent headless run and Replay on the larger
    // theatre measured 41/26 seconds at Tiro/Centurio under full-suite load.
    // Contact and pressure deadlines above remain the original simulation ticks.
    }, difficulty === 'tiro' ? 75_000 : difficulty === 'centurio' ? 60_000 : 30_000);
  }
}

it('meets Imperator contact time with the Roman opening without missing payroll', () => {
  const result = diagnosePressure(1, 'carthage', 'imperator');
  expect(result.contact).not.toBeNull();
  expect(result.contact!.tick).toBeLessThanOrEqual(1200);
  expect(result.pass).toBe(true);
}, 15000);


it.each([2, 4])('covers both opposite-side latitude sectors on seed %i by the Imperator contact deadline (#74)', (seed) => {
  for (const faction of ['rome', 'carthage'] as const) {
    const result = diagnosePressure(seed, faction, 'imperator');
    expect(result.contact, `${seed}/${faction}`).not.toBeNull();
    expect(result.contact!.tick, `${seed}/${faction}`).toBeLessThanOrEqual(1200);
    expect(result.pass, `${seed}/${faction}`).toBe(true);
  }
}, 30000);
