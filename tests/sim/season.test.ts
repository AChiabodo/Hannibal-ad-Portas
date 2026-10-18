import { describe, expect, it } from 'vitest';
import { idleController, type Controller } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import { TICK_HZ } from '../../src/sim/clock';
import { replay } from '../../src/sim/replay';
import {
  advanceCalendar,
  announceSeasons,
  HEADLESS_TICKS,
  HEADLESS_YEARS,
  observeSeasonMatch,
  SEASON_TICKS,
  seasonMatchOutcome,
  seasonMatchRules,
  seasonName,
  SEASONS_PER_YEAR,
  seasonOf,
  startCalendar,
  YEAR_TICKS,
  type Season,
  type SeasonChange,
  type SeasonHooks,
  type SeasonMatchVisible,
} from '../../src/sim/season';
import { createMatch } from '../../src/sim/match';

/** Runs the clock from tick zero for `ticks` ticks, announcing every boundary to `hooks`. */
function runClock(ticks: number, hooks: SeasonHooks = {}): readonly SeasonChange[] {
  const calendar = startCalendar();
  const changes: SeasonChange[] = [];

  for (let tick = 0; tick < ticks; tick += 1) {
    const crossed = advanceCalendar(calendar, tick);
    announceSeasons(crossed, hooks);
    changes.push(...crossed);
  }

  return changes;
}

/** What one Faction read from its Observations: the ticks on which the season or year changed. */
function boundaries(seed: number, ticks: number): readonly (SeasonMatchVisible & { tick: number })[] {
  const seen: (SeasonMatchVisible & { tick: number })[] = [];
  let last = '';

  const watching: Controller<SeasonMatchVisible> = {
    decide: (observation) => {
      const { season, year } = observation.visible;
      const now = `${year}:${season}`;

      if (now !== last) {
        last = now;
        seen.push({ tick: observation.tick, season, year });
      }

      return [];
    },
  };

  runMatch({
    seed,
    rules: seasonMatchRules,
    observe: observeSeasonMatch,
    outcome: seasonMatchOutcome,
    players: [
      { faction: 'rome', controller: watching },
      { faction: 'carthage', controller: idleController<SeasonMatchVisible>() },
    ],
    ticks,
  });

  return seen;
}

describe('the strategic clock', () => {
  it('gives a Season and a game year a length in whole ticks, so the clock is a decision and not a number in a rule', () => {
    // Three and a half minutes of Match time a Season, which is the middle of
    // the plan's three to four (PLAN §4): 210 seconds at 10 Hz.
    expect(SEASON_TICKS).toBe(210 * TICK_HZ);
    expect(SEASONS_PER_YEAR).toBe(4);
    expect(YEAR_TICKS).toBe(SEASON_TICKS * 4);

    // A headless Match runs bound to three game years (PLAN §4).
    expect(HEADLESS_YEARS).toBe(3);
    expect(HEADLESS_TICKS).toBe(YEAR_TICKS * HEADLESS_YEARS);
  });

  it('starts in spring of year one, as integer state the hash can cover', () => {
    const calendar = startCalendar();

    expect(calendar).toEqual({ year: 1, season: 0 });
    expect(seasonOf(calendar)).toBe('spring');
  });

  it('refuses a Season index or a tick it cannot read, rather than showing a Controller nonsense', () => {
    expect(() => seasonName(4)).toThrow(RangeError);
    expect(() => seasonName(-1)).toThrow(RangeError);
    expect(() => advanceCalendar(startCalendar(), -1)).toThrow(RangeError);
    expect(() => advanceCalendar(startCalendar(), 1.5)).toThrow(RangeError);
  });

  it('advances exactly on the boundary tick and not one tick before it', () => {
    const calendar = startCalendar();

    expect(advanceCalendar(calendar, SEASON_TICKS - 2)).toEqual([]);
    expect(seasonOf(calendar)).toBe('spring');

    expect(advanceCalendar(calendar, SEASON_TICKS - 1)).toEqual([
      { tick: SEASON_TICKS, year: 1, season: 'summer' },
    ]);
    expect(calendar).toEqual({ year: 1, season: 1 });
  });

  it('walks spring, summer, autumn and winter in order and turns the year over after winter', () => {
    const changes = runClock(YEAR_TICKS);

    expect(changes).toEqual([
      { tick: SEASON_TICKS, year: 1, season: 'summer' },
      { tick: SEASON_TICKS * 2, year: 1, season: 'autumn' },
      { tick: SEASON_TICKS * 3, year: 1, season: 'winter' },
      { tick: YEAR_TICKS, year: 2, season: 'spring' },
    ]);
  });

  it('fires the autumn and winter hooks once per game year, and no hook for spring or summer', () => {
    const fired: string[] = [];
    const hooks: SeasonHooks = {
      onAutumn: (change) => fired.push(`autumn ${change.year}`),
      onWinter: (change) => fired.push(`winter ${change.year}`),
    };

    const changes = runClock(HEADLESS_TICKS, hooks);

    expect(fired).toEqual([
      'autumn 1',
      'winter 1',
      'autumn 2',
      'winter 2',
      'autumn 3',
      'winter 3',
    ]);
    expect(changes).toHaveLength(HEADLESS_YEARS * 4);
  });

  it('delivers a boundary once: a second reading of the same tick reports nothing and fires no hook again', () => {
    const calendar = startCalendar();
    let autumns = 0;
    const hooks: SeasonHooks = { onAutumn: () => (autumns += 1) };

    announceSeasons(advanceCalendar(calendar, SEASON_TICKS * 2 - 1), hooks);

    expect(autumns).toBe(1);

    const again = advanceCalendar(calendar, SEASON_TICKS * 2 - 1);
    announceSeasons(again, hooks);

    expect(again).toEqual([]);
    expect(autumns).toBe(1);
  });

  it('announces one boundary to every subscriber, so a second system is not starved by the first', () => {
    const changes = advanceCalendar(startCalendar(), SEASON_TICKS * 2 - 1);
    const economy: number[] = [];
    const attrition: number[] = [];

    announceSeasons(changes, { onAutumn: (change) => economy.push(change.year) });
    announceSeasons(changes, { onAutumn: (change) => attrition.push(change.year) });

    // The call caught the clock up from spring, so it crossed summer too; only
    // autumn interests either subscriber.
    expect(changes.map((change) => change.season)).toEqual(['summer', 'autumn']);
    expect(economy).toEqual([1]);
    expect(attrition).toEqual([1]);
  });

  it('catches up over ticks it was not asked about, firing every boundary it crossed in order', () => {
    const calendar = startCalendar();
    const fired: Season[] = [];

    const changes = advanceCalendar(calendar, YEAR_TICKS - 1);
    announceSeasons(changes, {
      onAutumn: (change) => fired.push(change.season),
      onWinter: (change) => fired.push(change.season),
    });

    expect(changes.map((change) => change.season)).toEqual([
      'summer',
      'autumn',
      'winter',
      'spring',
    ]);
    expect(fired).toEqual(['autumn', 'winter']);
    expect(calendar).toEqual({ year: 2, season: 0 });
  });

  it('crosses the same boundaries twice from the same ticks: the clock is a pure function of the tick', () => {
    expect(runClock(HEADLESS_TICKS)).toEqual(runClock(HEADLESS_TICKS));
  });
});

describe('a Match on the strategic clock', () => {
  it('shows the season and the year in the Observation a Controller is handed', () => {
    // The boundary ticks, as a Controller sees them: tick 0 is spring of year
    // one, and each boundary belongs to the season that begins on it.
    expect(boundaries(7, YEAR_TICKS + 1)).toEqual([
      { tick: 0, season: 'spring', year: 1 },
      { tick: SEASON_TICKS, season: 'summer', year: 1 },
      { tick: SEASON_TICKS * 2, season: 'autumn', year: 1 },
      { tick: SEASON_TICKS * 3, season: 'winter', year: 1 },
      { tick: YEAR_TICKS, season: 'spring', year: 2 },
    ]);
  });

  it('shows both Factions the same clock, because the date is not a secret the fog keeps', () => {
    const world = seasonMatchRules.createWorld(1);

    expect(observeSeasonMatch(world, 'rome')).toEqual(observeSeasonMatch(world, 'carthage'));
  });

  it('gives two runs of the same seed the same season boundaries, replay after replay', () => {
    const once = boundaries(11, HEADLESS_TICKS + 1);
    const again = boundaries(11, HEADLESS_TICKS + 1);

    expect(again).toEqual(once);
    expect(once).toHaveLength(HEADLESS_YEARS * 4 + 1);
    expect(once.map((boundary) => boundary.tick)).toEqual(
      Array.from({ length: HEADLESS_YEARS * 4 + 1 }, (_, index) => index * SEASON_TICKS),
    );
  });

  it('runs the calendar and counts the transitions in the world, so the hash covers them', () => {
    const match = createMatch({ seed: 3, rules: seasonMatchRules });

    for (let tick = 0; tick < HEADLESS_TICKS; tick += 1) match.step();

    expect(match.state.world.autumns).toBe(HEADLESS_YEARS);
    expect(match.state.world.winters).toBe(HEADLESS_YEARS);
    expect(seasonOf(match.state.world.calendar)).toBe('spring');
    expect(match.state.world.calendar.year).toBe(HEADLESS_YEARS + 1);
  });

  it('is bound to three game years headless, and terminates: the bound is the ending', () => {
    const run = runMatch({
      seed: 3,
      rules: seasonMatchRules,
      observe: observeSeasonMatch,
      outcome: seasonMatchOutcome,
      players: [
        { faction: 'rome', controller: idleController<SeasonMatchVisible>() },
        { faction: 'carthage', controller: idleController<SeasonMatchVisible>() },
      ],
      ticks: HEADLESS_TICKS,
    });

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
  });

  it('replays the same three game years, hash for hash and boundary for boundary', () => {
    const first = replay({
      seed: 3,
      rules: seasonMatchRules,
      log: [],
      ticks: HEADLESS_TICKS,
      everyTicks: SEASON_TICKS,
    });
    const second = replay({
      seed: 3,
      rules: seasonMatchRules,
      log: [],
      ticks: HEADLESS_TICKS,
      everyTicks: SEASON_TICKS,
    });

    expect(second).toEqual(first);
    expect(first.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual(
      Array.from({ length: HEADLESS_YEARS * 4 + 1 }, (_, index) => index * SEASON_TICKS),
    );
  });
});
