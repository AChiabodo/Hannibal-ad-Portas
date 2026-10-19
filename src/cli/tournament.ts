/**
 * The balance report: what a batch of Matches says about the game (E3).
 *
 * This is where "is the game balanced?" stops being an opinion. A tournament
 * plays a Match on each of a batch of distinct seeds and reduces what happened
 * to the four numbers the Definition of Done asks for (PLAN §5, DoD 5): the win
 * rate of each Faction, the median and the spread of how long a Match lasts, and
 * the share of Matches no Faction could win because the clock ended them. Playing
 * the Matches is `tournament-batch.ts`'s; this file is what they add up to.
 *
 * ## Why the report is a function of the seeds and nothing else
 *
 * It carries no timings, no paths, no wall clock and no "generated at" line, for
 * the reason a Match's own report does not (`report.ts`): two runs of the same
 * batch on the same build must print the same bytes, so a later ticket can gate
 * on the report, and a reader can diff this week's against last week's and see
 * only what actually changed in the game. A balance instrument whose output moves
 * when the machine is busy is not an instrument.
 *
 * That is also why the reading of the batch — which Matches were played, in what
 * order, and where their decision logs went — is not in here. The seeds the batch
 * played are, as `first` and `count`; a directory of files is the caller's to know,
 * and `--keep` writes one file per seed, by a rule (`<dir>/<seed>.json`) rather
 * than by a path in the report.
 *
 * ## Why it states measurements and not a verdict
 *
 * The Definition of Done names thresholds — 45% to 55%, 25 to 45 minutes, under
 * 5% by the clock — and it would be tempting to have the report say whether they
 * were met. It does not, deliberately: F1 is the ticket that decides what to do
 * about the numbers, and a report that also judged them would make F1's first job
 * auditing the judge. The numbers are here, exactly; the conclusion is not.
 *
 * ## Why the percentiles are nearest-rank
 *
 * Every duration in this report is a duration some Match actually had. An
 * interpolated percentile would put half a tick between two Matches, and a
 * "median of 26.5 minutes" that no Match lasted is a worse thing for a balance
 * discussion to argue about than the Match that did. Nearest rank is also the
 * percentile definition that needs the fewest words to state, which is what makes
 * the numbers checkable by hand from the report's own `matches` list.
 */

import type { DifficultyName } from '../ai/difficulty.ts';
import { TICK_HZ } from '../sim/clock.ts';
import type { Faction } from '../sim/faction.ts';
import type { MatchResult, VictoryReason } from '../sim/outcome.ts';

/**
 * One Match of a batch, as the report keeps it: enough to find it again and
 * enough to argue about it, and not one decision more.
 *
 * The decision log is the whole reason a Match can be inspected, and it is also
 * twenty megabytes of JSON, so it is not in here: `seed` is what retrieves it —
 * the Match is a function of its seed and the build, and `hash` is the proof that
 * the Match retrieved is the Match measured (E2).
 */
export interface MatchSummary {
  /** The seed the Match ran on: the whole of how to run it again. */
  readonly seed: number;

  /** How it ended: a victory, a draw the rules called, or the tick bound. */
  readonly outcome: MatchResult['kind'];

  /** The Faction that won, or `null` when nobody did. */
  readonly winner: Faction | null;

  /**
   * What fell, when a Faction won: a Stronghold, or everything the loser had.
   *
   * A code and not a sentence, which is the one place this differs from a Match's
   * own report: `MatchReport.reason` says why in words a reader wants, and this is
   * the same fact in the form a report about a *batch* can count and compare. It
   * is here because it is the one thing a batch can say about how decisive a
   * victory was — a Stronghold taken is a Match won, and a Faction left with
   * neither settlement nor Squad was taken apart — and because a reader told a
   * Match was lopsided wants to know which kind before opening its decision log.
   *
   * `null` for a Match nobody won.
   */
  readonly victoryReason: VictoryReason['kind'] | null;

  /** The tick the Match ended on: its duration, in game time. */
  readonly ticks: number;

  /** How many decisions the two AIs logged between them: how busy the Match was. */
  readonly decisions: number;

  /** How many Commands the Match applied. */
  readonly commands: number;

  /** The state hash the Match ended on: what proves a re-run is this Match (ADR-0006). */
  readonly hash: string;
}

/**
 * The batch a report was made of: what the Matches were played at, which seeds
 * they were, and how long each of them was allowed to run.
 *
 * The difficulty is part of it because a win rate means nothing without it — the
 * Definition of Done's numbers are the numbers of two equal opponents — and the
 * bound is part of it because it is where a stalled Match ends.
 */
export interface TournamentSetup {
  /** The level both AIs played at. Equal difficulty is the DoD's own condition. */
  readonly difficulty: DifficultyName;

  /** The tick bound each Match was given: where a Match the rules never decided ended. */
  readonly bound: number;

  /** The first seed of the batch; the rest follow it, one per Match. */
  readonly firstSeed: number;
}

/**
 * A distribution of durations, as five numbers rather than a histogram: the
 * extremes, the middle, and one on each side of it.
 *
 * `p10` and `p90` are the spread — the DoD calls for a median *and* a spread, and
 * a spread is the half of a balance report that says whether "the usual Match is
 * half an hour" is a description of most Matches or of none of them.
 */
export interface DurationSpread {
  /** The shortest Match in the batch. */
  readonly min: number;

  /** The tenth percentile: a Match this length or shorter is one Match in ten. */
  readonly p10: number;

  /** The median: the middle Match of the batch, or the lower of the two middles. */
  readonly median: number;

  /** The ninetieth percentile: a Match this length or longer is one Match in ten. */
  readonly p90: number;

  /** The longest Match in the batch. */
  readonly max: number;
}

/** The report of one batch of Matches, in the order it is written to standard output. */
export interface TournamentReport {
  /** Which Matches were played. A tournament is AI against AI, at one level. */
  readonly rules: 'ai';

  /** The difficulty both AIs played at. */
  readonly difficulty: DifficultyName;

  /** The tick bound each Match was given. */
  readonly bound: number;

  /** Which seeds the batch played: `first` and the `count` that follow it. */
  readonly seeds: { readonly first: number; readonly count: number };

  /** How the batch ended, counted: the two Factions' victories and the rules' draws. */
  readonly wins: { readonly rome: number; readonly carthage: number; readonly draws: number };

  /**
   * Each Faction's share of the whole batch, as a fraction of four decimal places.
   *
   * Over the whole batch and not over the decided Matches: the DoD asks for a win
   * rate *and* a separate share of Matches the clock decided, and a denominator
   * that quietly excluded those would make the two numbers add to 100% about
   * different things.
   */
  readonly winRate: { readonly rome: number; readonly carthage: number };

  /** The Matches nobody won because the bound ended them, and their share of the batch. */
  readonly decidedByClock: { readonly matches: number; readonly share: number };

  /** How long a Match lasted, in ticks and in game minutes. One set of matches, said twice. */
  readonly duration: { readonly ticks: DurationSpread; readonly minutes: DurationSpread };

  /**
   * The Matches a balance reader has to look at, listed by seed rather than left
   * to be found in a distribution: the ones that were not contests.
   */
  readonly outliers: {
    /**
     * Victories that were not a contest: won in at most half the batch's median
     * duration, or won outright by taking everything the loser had.
     */
    readonly lopsided: readonly MatchSummary[];

    /** Matches no Faction won, because the clock ended them: the game did not resolve. */
    readonly stalled: readonly MatchSummary[];
  };

  /** Every Match of the batch, in seed order: the report's own evidence. */
  readonly matches: readonly MatchSummary[];
}

/**
 * How much shorter than the median a victory has to be to be called lopsided.
 *
 * Two, because "half the usual time" is a line a reader can argue with and check:
 * the report names the median it compared against, so a Match listed as lopsided
 * is one a reader can see is under half of it. `LOPSIDED_SHARE` is what keeps the
 * comparison in whole numbers — a duration in ticks multiplied by it, against the
 * median, with no rounding anywhere.
 */
const LOPSIDED_SHARE = 2;

/**
 * What an annihilation says about a Match: that it was not a contest either.
 *
 * Duration is one way to be lopsided and not the only one. A Faction left with
 * neither settlement nor Squad was taken apart over however long it took, and a
 * report that listed only the quick ones would say "nothing to see" about the
 * most complete defeat a Match can be — which is exactly the reading a balance
 * discussion must not be given. So a victory is lopsided if it was quick *or* if
 * it was total, and the summary's `reason` is what says which.
 */
const LOPSIDED_REASONS: readonly VictoryReason['kind'][] = ['annihilation'];

/** How many decimal places a rate keeps: enough to read, few enough to diff. */
const RATE_DECIMALS = 4;

/** How many decimal places a duration in minutes keeps: a tenth of a minute is six seconds. */
const MINUTE_DECIMALS = 1;

/**
 * Reduces a batch of played Matches to its report.
 *
 * The list arrives in whatever order the Matches finished, which is a fact about
 * the machine and not about the game, so it is sorted by seed here: the report is
 * a function of the batch and the build, and running the same batch on a machine
 * with more cores must not change a byte of it.
 *
 * @throws RangeError when the batch is empty, when a seed appears twice, or when
 *   a summary contradicts itself about how its Match ended.
 */
export function tournamentReportOf(
  matches: readonly MatchSummary[],
  setup: TournamentSetup,
): TournamentReport {
  const ordered = bySeed(matches);
  const durations = ordered.map((match) => match.ticks).sort((left, right) => left - right);
  const wins = winsOf(ordered);
  const clock = ordered.filter((match) => match.outcome === 'clock').length;
  const median = percentile(durations, 50);
  const ticks: DurationSpread = {
    min: percentile(durations, 0),
    p10: percentile(durations, 10),
    median,
    p90: percentile(durations, 90),
    max: percentile(durations, 100),
  };

  return {
    rules: 'ai',
    difficulty: setup.difficulty,
    bound: setup.bound,
    seeds: { first: setup.firstSeed, count: ordered.length },
    wins,
    winRate: {
      rome: shareOf(wins.rome, ordered.length),
      carthage: shareOf(wins.carthage, ordered.length),
    },
    decidedByClock: { matches: clock, share: shareOf(clock, ordered.length) },
    duration: {
      ticks,
      minutes: {
        min: minutesOf(ticks.min),
        p10: minutesOf(ticks.p10),
        median: minutesOf(median),
        p90: minutesOf(ticks.p90),
        max: minutesOf(ticks.max),
      },
    },
    outliers: {
      lopsided: ordered.filter((match) => isLopsided(match, median)),
      stalled: ordered.filter((match) => match.outcome === 'clock'),
    },
    matches: ordered,
  };
}

/**
 * The report as the text the command writes: pretty-printed JSON and a final
 * newline, exactly as a Match's own report is written.
 *
 * Pretty-printed rather than compact because this one is meant to be read by a
 * person as well as piped into `jq`: the match list is a hundred lines of seed
 * and outcome, and a single line of it is a worse thing to look at.
 */
export function formatTournamentReport(report: TournamentReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * The batch in seed order, refusing a seed that appears twice.
 *
 * A seed twice is not a bigger batch, it is the same Match counted twice: it
 * would move the win rate and the median towards whatever that Match did. The
 * batch's own planner cannot produce one — the seeds are `firstSeed + index` —
 * so this is a refusal for the caller who assembles a batch by hand.
 *
 * @throws RangeError when two Matches were played on the same seed, or the batch
 *   is empty.
 */
function bySeed(matches: readonly MatchSummary[]): readonly MatchSummary[] {
  if (matches.length === 0) {
    throw new RangeError('a tournament is a batch of Matches, and this batch has none to report');
  }

  const ordered = [...matches].sort((left, right) => left.seed - right.seed);

  ordered.forEach((match, index) => {
    const previous = ordered[index - 1];

    if (previous !== undefined && previous.seed === match.seed) {
      throw new RangeError(
        `the batch played two Matches on seed ${String(match.seed)}: ` +
          'a seed is one Match, and counting it twice would move every number in the report',
      );
    }
  });

  return ordered;
}

/**
 * How the batch ended, counted by Faction.
 *
 * A draw is the rules' own verdict and is counted apart, because it is neither
 * Faction's victory: it is the game saying the two sides are even, which is the
 * most interesting thing a balance report can say and the easiest to lose inside
 * a "not a win" bucket.
 *
 * @throws RangeError when a summary says `victory` without naming a winner, or
 *   names a winner without saying `victory` — a summary is read, not trusted.
 */
function winsOf(matches: readonly MatchSummary[]): TournamentReport['wins'] {
  const wins = { rome: 0, carthage: 0, draws: 0 };

  for (const match of matches) {
    if (match.outcome === 'victory') {
      if (match.winner === null) {
        throw new RangeError(`the Match on seed ${String(match.seed)} says it was a victory and names no winner`);
      }

      wins[match.winner] += 1;
      continue;
    }

    if (match.winner !== null) {
      throw new RangeError(
        `the Match on seed ${String(match.seed)} says it ended by the ${match.outcome} ` +
          `and names ${match.winner} as the winner`,
      );
    }

    if (match.outcome === 'draw') wins.draws += 1;
  }

  return wins;
}

/**
 * Whether a Match was a walkover: a victory won in at most a half of the batch's
 * median duration, or a victory that took everything the loser had.
 *
 * Only victories: a Match the clock ended is not lopsided, it is stalled, and a
 * draw is a Match nobody could decide. The duration comparison is
 * `ticks * LOPSIDED_SHARE` against the median so that it stays in whole ticks — a
 * Match is under half the median, or it is not, and no rounding gets a vote. The
 * other half of the rule is `LOPSIDED_REASONS`'.
 */
function isLopsided(match: MatchSummary, median: number): boolean {
  if (match.outcome !== 'victory') return false;

  return match.ticks * LOPSIDED_SHARE <= median ||
    (match.victoryReason !== null && LOPSIDED_REASONS.includes(match.victoryReason));
}

/**
 * One percentile of a sorted list of durations, by nearest rank: the value at
 * position `ceil(percent / 100 * n)`, counted from one, and never outside the list.
 *
 * Nearest rank because the alternative — interpolating between the two values
 * either side — invents a duration no Match had (see the note at the top of this
 * file). The clamps at both ends are what make `0` and `100` the shortest and the
 * longest Match rather than an off-by-one: a hundredth percentile that returned
 * nothing would be a report with no longest Match in it.
 *
 * @throws RangeError when the list is empty, which is a batch with nothing in it.
 */
function percentile(sorted: readonly number[], percent: number): number {
  if (sorted.length === 0) {
    throw new RangeError(`there is no ${String(percent)}th percentile of no durations at all`);
  }

  const rank = Math.ceil((percent / 100) * sorted.length) - 1;
  const index = Math.min(Math.max(rank, 0), sorted.length - 1);
  const value = sorted[index];

  if (value === undefined) {
    throw new RangeError(`the ${String(percent)}th percentile of ${String(sorted.length)} durations is not in it`);
  }

  return value;
}

/**
 * A count as a share of the batch, to `RATE_DECIMALS` places.
 *
 * Rounded rather than left as the division's own double, so that a report reads
 * as `0.515` and not as `0.5149999999999999`: a balance report is compared by eye
 * across builds, and the sixteenth digit of a fraction is noise in that reading.
 * The counts beside every share are the exact numbers, so nothing is lost by it.
 */
function shareOf(count: number, total: number): number {
  return roundTo(count / total, RATE_DECIMALS);
}

/** A duration in ticks as game minutes (TICK_HZ ticks a second), to a tenth. */
function minutesOf(ticks: number): number {
  return roundTo(ticks / (TICK_HZ * 60), MINUTE_DECIMALS);
}

/**
 * A number to a fixed number of decimal places.
 *
 * `Math.round` on a scaling of ten is the whole of it: the values here are counts,
 * ticks and their quotients, and the rounding is a presentation decision rather
 * than an arithmetic one, so it must be the same decision on every machine, which
 * scaling by a power of ten and rounding gives.
 */
function roundTo(value: number, decimals: number): number {
  const scale = 10 ** decimals;

  return Math.round(value * scale) / scale;
}
