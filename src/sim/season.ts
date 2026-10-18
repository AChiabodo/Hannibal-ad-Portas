/**
 * Seasons: the Match's strategic clock (GLOSSARY: Season).
 *
 * A game year is four Seasons, and the calendar is the Match's only clock:
 * spring and summer are the campaign season, autumn brings the harvest and
 * winter brings Attrition, and every system that cares is told when a Season
 * begins instead of counting the year itself — the economy on every boundary,
 * and the harvest and Attrition on the two that mean something extra. That is
 * the whole interface — one clock, advanced once per tick, announced to every
 * subscriber — and it is what keeps a Season meaning the same thing in the
 * economy, in supply and in the AI.
 *
 * Three rules shape the module:
 *
 * - **The calendar is integer state.** `SeasonCalendar` holds the year and an
 *   index into `SEASONS`, nothing else, so `serializeState` accepts it and the
 *   state hash covers it (ADR-0006). The season is a word only when it leaves
 *   state: a Controller reads `"autumn"` from its Observation, the way a
 *   Faction is `"rome"` on a Command and a code in a world.
 * - **The clock is a function of the tick.** `advanceCalendar` does not count
 *   its own steps; it puts the calendar at the season the Match's tick says it
 *   is in. A boundary therefore falls on the same tick in every run, and a
 *   replay that crossed it once crosses it again on the same tick rather than
 *   at the same distance from wherever it started.
 * - **A boundary is delivered once, to everyone.** Reading the same tick twice
 *   reports nothing the second time, so a rules step that advances the clock and
 *   a test that checks it cannot fire the harvest twice. Advancing the clock and
 *   announcing the boundary are separate calls on purpose: the clock is advanced
 *   once, and the same boundary is then announced to every system that
 *   subscribed, so a second system cannot be starved by whoever advanced it
 *   first.
 *
 * Harvest yields and winter Attrition values are deliberately *not* here: B6
 * owns the economy and C6 owns Attrition, and both arrive as hooks rather than
 * as numbers the clock would have to know about. The economy's hook is
 * `onSeason`, because production and Payroll are a Season's ordinary work; the
 * harvest is `onAutumn` on top of it.
 */
import type { Command } from './command.ts';
import { TICK_HZ } from './clock.ts';
import type { MatchSetup } from './driver.ts';
import type { MatchRules } from './match.ts';

/** The four Seasons of a game year, in the order the year walks them. */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** One quarter of a Match's game year (GLOSSARY: Season). */
export type Season = (typeof SEASONS)[number];

/** Four Seasons make a game year (PLAN §4). */
export const SEASONS_PER_YEAR = 4;

/**
 * How many ticks a Season lasts: three and a half minutes of Match time, the
 * middle of the plan's three to four (PLAN §4). 210 seconds at `TICK_HZ`, and a
 * whole number of ticks so a boundary always falls on one.
 */
export const SEASON_TICKS = 210 * TICK_HZ;

/** How many ticks a game year lasts: four Seasons, fourteen minutes of Match time. */
export const YEAR_TICKS = SEASON_TICKS * SEASONS_PER_YEAR;

/**
 * How many game years a headless Match may run (PLAN §4).
 *
 * A human Match has no time limit, but a headless or AI-versus-AI Match that can
 * never end is a test that can never finish, so the CLI's default bound is three
 * game years rather than an open horizon.
 */
export const HEADLESS_YEARS = 3;

/**
 * The bound of a headless Match, in ticks: three whole game years.
 *
 * A headless Match always terminates, and structurally so: `runMatch` requires a
 * whole, non-negative tick bound, so there is no way to ask for an unbounded one.
 * This is the length the CLI plays by default, and the three-game-year horizon
 * the plan puts on a headless or AI-versus-AI Match; a caller may deliberately
 * hand over another length for a tournament or a long test, but it cannot hand
 * over none.
 */
export const HEADLESS_TICKS = YEAR_TICKS * HEADLESS_YEARS;

/**
 * The authoritative calendar: the year, and which Season of it.
 *
 * `season` is an index into `SEASONS` rather than the word, because state holds
 * integers only (ADR-0006); `seasonOf` is how a word is read back out.
 */
export interface SeasonCalendar {
  /** The game year, counted from 1. */
  year: number;

  /** Which Season: 0 spring, 1 summer, 2 autumn, 3 winter. */
  season: number;
}

/** A Match begins in spring of its first year. */
export function startCalendar(): SeasonCalendar {
  return { year: 1, season: 0 };
}

/**
 * The word for a Season index.
 *
 * @throws RangeError when the index is not one of the four Seasons, so a
 *   calendar that has drifted is refused where it is read rather than shown to a
 *   Controller as `undefined`.
 */
export function seasonName(index: number): Season {
  const season = SEASONS[index];
  if (season === undefined) {
    const last = SEASONS_PER_YEAR - 1;
    throw new RangeError(
      `season ${String(index)} is not one of the ${SEASONS_PER_YEAR} Seasons, 0 to ${last}`,
    );
  }

  return season;
}

/** The Season a calendar stands in, as the word an Observation carries. */
export function seasonOf(calendar: SeasonCalendar): Season {
  return seasonName(calendar.season);
}

/** A Season boundary the clock has just crossed. */
export interface SeasonChange {
  /** The first tick of the new Season: a whole multiple of `SEASON_TICKS`. */
  readonly tick: number;

  /** The game year the new Season belongs to. */
  readonly year: number;

  /** The Season that has begun. */
  readonly season: Season;
}

/**
 * What other systems are told when a Season begins.
 *
 * `onSeason` is every Season — spring, summer, autumn and winter alike — and it
 * is what the economy subscribes to: production, the people who eat it and
 * Payroll are a Season's ordinary work, not a harvest or an attrition event.
 * B6 is why it exists; B5 wrote this seam expecting it (`docs/adr/0010`), and the
 * ADR's rejection of a hook per Season was about spring and summer opening a
 * campaign season *nothing* had to react to. Something does now, so the clock
 * tells it, and a system still never counts the year itself.
 *
 * Autumn and winter have their own hooks because they mean something specific
 * on top of the Season: autumn is the harvest, winter is Attrition and winter
 * quarters. A subscriber that handles both gets `onSeason` first, so the
 * Season's ordinary work lands before the harvest it belongs to.
 *
 * A hook must not change the calendar: it is handed the boundary that has
 * already been written, and the clock moves on its own. One subscriber object
 * per system, passed to `announceSeasons` — a system never advances the clock
 * itself, which is what makes "no system computes its own calendar" true rather
 * than merely intended.
 */
export interface SeasonHooks {
  /** Any Season has begun: the economy's ordinary production, population and Payroll (B6). */
  readonly onSeason?: (change: SeasonChange) => void;

  /** Autumn has begun: the harvest (B6 gives it a yield). */
  readonly onAutumn?: (change: SeasonChange) => void;

  /** Winter has begun: Attrition outside friendly Territory, and the defender is favoured (C6). */
  readonly onWinter?: (change: SeasonChange) => void;
}

/** No boundaries, shared by every tick that is not one. */
const NO_CHANGES: readonly SeasonChange[] = [];

/**
 * Puts the calendar at the Season of the tick that follows `tick`, and reports
 * the boundaries that crossed.
 *
 * `tick` is the tick being *left*, exactly as `MatchRules.step` receives it: a
 * Match that has stepped ticks `0..T` stands at `T + 1`, so the clock is
 * advanced with `tick = T` and the calendar then says what `T + 1` is. This is
 * what makes a boundary fall on the same tick in every run: the calendar is
 * derived from the Match's clock, not accumulated beside it.
 *
 * It reports and does not announce: a caller hands the boundaries to
 * `announceSeasons` once for every system that subscribes. Keeping the two apart
 * is what stops a second system from starving — the clock is advanced once, and
 * the report is announced as often as there are subscribers.
 *
 * Calling it twice with the same tick is harmless — the second call has nothing
 * to report, because the boundary was already delivered. If the calendar is
 * behind by more than one tick (a rules step that forgot to call it), every
 * boundary crossed is reported in order, so a catch-up cannot silently swallow a
 * harvest.
 *
 * @returns The boundaries crossed, oldest first; empty on almost every tick.
 * @throws RangeError when `tick` is not a whole tick.
 */
export function advanceCalendar(
  calendar: SeasonCalendar,
  tick: number,
): readonly SeasonChange[] {
  requireWholeTick(tick);

  const target = absoluteSeasonOfTick(tick + 1);
  const current = absoluteSeason(calendar);
  if (target <= current) return NO_CHANGES;

  const changes: SeasonChange[] = [];

  for (let absolute = current + 1; absolute <= target; absolute += 1) {
    calendar.year = yearOf(absolute);
    calendar.season = absolute % SEASONS_PER_YEAR;

    const change: SeasonChange = {
      tick: absolute * SEASON_TICKS,
      year: calendar.year,
      season: seasonName(calendar.season),
    };
    changes.push(change);
  }

  return changes;
}

/**
 * Tells every subscriber about the boundaries the clock crossed, in order.
 *
 * The same list can be announced to one system after another, because announcing
 * consumes nothing. That is the shape the rules compose: advance the clock once,
 * then hand the report to the economy's hooks and to Attrition's hooks and to
 * the AI's, each of which sees the same year turn rather than racing for the one
 * call that moved the calendar.
 *
 * Announcing an empty list — as almost every tick does — is a no-op.
 */
export function announceSeasons(
  changes: readonly SeasonChange[],
  ...subscribers: readonly SeasonHooks[]
): void {
  for (const change of changes) {
    for (const subscriber of subscribers) {
      subscriber.onSeason?.(change);
      if (change.season === 'autumn') subscriber.onAutumn?.(change);
      else if (change.season === 'winter') subscriber.onWinter?.(change);
    }
  }
}

/**
 * @throws RangeError when `tick` is not a whole, non-negative number of ticks.
 *
 * Not `requireTickCount` from `ticks.ts`, because this argument is a tick rather
 * than a count of them: it is the same tick `MatchRules.step` was handed, and
 * "0 or more" is the whole of what has to be true of it.
 */
function requireWholeTick(tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(
      `a tick must be a whole, non-negative number of ticks, got ${String(tick)}`,
    );
  }
}

/** Which Season of which year an absolute season number is: 0 is spring of year 1. */
function yearOf(absolute: number): number {
  return Math.floor(absolute / SEASONS_PER_YEAR) + 1;
}

/** The season number an absolute quarter names, in `0..SEASONS_PER_YEAR-1`. */
function absoluteSeason(calendar: SeasonCalendar): number {
  return (calendar.year - 1) * SEASONS_PER_YEAR + calendar.season;
}

/** The absolute season a tick falls in: tick 0 is the first tick of spring, year 1. */
function absoluteSeasonOfTick(tick: number): number {
  return Math.floor(tick / SEASON_TICKS);
}

/**
 * What the rules own in the Match that has nothing but the clock.
 *
 * `autumns` and `winters` count the boundaries the hooks were told about — not
 * how much the harvest yielded, which is B6's, and not how much Attrition cost,
 * which is C6's. They are gating instrumentation in state on purpose: a hook
 * that stopped firing would move the state hash rather than pass unnoticed,
 * which is the cheapest way to keep the clock wired into the Match it belongs
 * to, and they are the numbers the CLI's three-year golden hash covers.
 */
export interface SeasonMatchWorld {
  /** The Match's strategic clock. */
  readonly calendar: SeasonCalendar;

  /** How many autumns have begun: the harvest hooks that fired. */
  autumns: number;

  /** How many winters have begun: the Attrition hooks that fired. */
  winters: number;
}

/**
 * What a Faction may know of the clock: which Season it is, and which year.
 *
 * A projection of its own type rather than the calendar itself, because an
 * Observation is not Match state (`observation.ts`): a Controller reads the
 * season as a word and the year as a number, and the index the world stores
 * never leaves it.
 */
export interface SeasonMatchVisible {
  readonly season: Season;
  readonly year: number;
}

/**
 * The rules of the Match that has the clock and nothing else.
 *
 * Every tick advances the calendar and counts the two transitions that matter.
 * It does not draw from the Match's random source, so two Matches on the same
 * seed and the same bound are the same Match — which is what lets the CLI's
 * hash for this Match be a golden value (ADR-0006). The world's fields are
 * built from the seed in the only sense that matters here: the clock starts at
 * spring of year one whatever the seed is, because a Match's first year is not a
 * random fact.
 */
export const seasonMatchRules: MatchRules<SeasonMatchWorld, Command> = {
  createWorld: () => ({ calendar: startCalendar(), autumns: 0, winters: 0 }),

  step: (world, _rng, tick) => {
    const changes = advanceCalendar(world.calendar, tick);

    announceSeasons(changes, {
      onAutumn: () => {
        world.autumns += 1;
      },
      onWinter: () => {
        world.winters += 1;
      },
    });
  },
};

/**
 * What a Faction sees of the clock: the two facts an Observation carries, field
 * by field, so the projection cannot alias the world it was read from.
 */
export const observeSeasonMatch: MatchSetup<SeasonMatchWorld, SeasonMatchVisible>['observe'] = (
  world,
) => ({ season: seasonOf(world.calendar), year: world.calendar.year });

/**
 * The verdict of the Match with only a clock: none, ever.
 *
 * Nothing can be lost in a world that holds no army and no settlement, so C5 is
 * where a Match learns to end sooner than its bound; until then the bound is the
 * ending, and it is always reached.
 */
export const seasonMatchOutcome: MatchSetup<SeasonMatchWorld, SeasonMatchVisible>['outcome'] =
  () => null;
