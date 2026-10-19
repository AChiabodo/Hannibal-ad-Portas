import { describe, expect, it } from 'vitest';
import {
  formatTournamentReport,
  tournamentReportOf,
  type MatchSummary,
  type TournamentSetup,
} from '../../src/cli/tournament';
import type { Faction } from '../../src/sim/faction';
import type { VictoryReason } from '../../src/sim/outcome';

/**
 * The balance report: what a batch of Matches says about the game (E3).
 *
 * The tests below are the ticket's acceptance criteria read as arithmetic. A
 * batch of played Matches arrives as a list of summaries and leaves as one
 * report, so every number in it can be checked against a batch small enough to
 * count by hand — which is the only way a *measurement* can be trusted: a report
 * whose median is produced by the code that also produces the durations would
 * agree with itself forever.
 *
 * Which Match was played, and how slowly, is `tournament-batch.test.ts`'s; what
 * a played Match is worth is this file's.
 */

/** The batch every report here was made of, unless a test says otherwise. */
const BATCH: TournamentSetup = { difficulty: 'centurio', bound: 25200, firstSeed: 1 };

/** One played Match, as the batch hands it over: a Stronghold taken unless told otherwise. */
function played(
  seed: number,
  ticks: number,
  winner: Faction | null = 'rome',
  victoryReason: VictoryReason['kind'] = 'stronghold',
): MatchSummary {
  return {
    seed,
    outcome: winner === null ? 'clock' : 'victory',
    winner,
    victoryReason: winner === null ? null : victoryReason,
    ticks,
    decisions: ticks * 2,
    commands: ticks,
    hash: `${String(seed).padStart(16, '0')}`,
  };
}

/** The seeds an outlier list names, in the order the report lists them. */
function seedsOf(summaries: readonly MatchSummary[]): readonly number[] {
  return summaries.map((summary) => summary.seed);
}

describe('the balance report of a batch', () => {
  it('counts a win for the Faction that won, and rates both over the whole batch', () => {
    const report = tournamentReportOf(
      [played(1, 8400, 'rome'), played(2, 8400, 'rome'), played(3, 8400, 'carthage')],
      BATCH,
    );

    expect(report.wins).toEqual({ rome: 2, carthage: 1, draws: 0 });
    expect(report.winRate).toEqual({ rome: 0.6667, carthage: 0.3333 });
  });

  it('counts the Matches the clock decided apart, and as no Faction\'s win', () => {
    const report = tournamentReportOf(
      [played(1, 8400, 'rome'), played(2, 25200, null), played(3, 25200, null), played(4, 8400, 'carthage')],
      BATCH,
    );

    expect(report.wins).toEqual({ rome: 1, carthage: 1, draws: 0 });
    expect(report.decidedByClock).toEqual({ matches: 2, share: 0.5 });
  });

  it('reports the duration as percentiles, in ticks and in game minutes', () => {
    const report = tournamentReportOf(
      [played(1, 6300), played(2, 6651), played(3, 8400), played(4, 10500), played(5, 25200, null)],
      BATCH,
    );

    // Nearest rank over the five durations in order: 6300, 6651, 8400, 10500, 25200.
    expect(report.duration.ticks).toEqual({ min: 6300, p10: 6300, median: 8400, p90: 25200, max: 25200 });

    // A game minute is 600 ticks (TICK_HZ 10), and 6651 ticks is 11.085 of them.
    expect(report.duration.minutes).toEqual({ min: 10.5, p10: 10.5, median: 14, p90: 42, max: 42 });
  });

  it('lists a victory over in half the usual time as lopsided, with its seed', () => {
    const report = tournamentReportOf(
      [played(11, 8400), played(12, 8400), played(13, 8400), played(14, 1200, 'carthage')],
      BATCH,
    );

    expect(seedsOf(report.outliers.lopsided)).toEqual([14]);
    expect(report.outliers.lopsided[0]).toMatchObject({ seed: 14, winner: 'carthage', ticks: 1200 });
    expect(report.outliers.stalled).toEqual([]);
  });

  it('lists a total defeat as lopsided however long it took, and says which it was', () => {
    const report = tournamentReportOf(
      [played(31, 25200), played(32, 25200), played(33, 25200, 'carthage', 'annihilation')],
      BATCH,
    );

    // Nothing here was quick: 25200 ticks each. A Faction left with neither
    // settlement nor Squad was taken apart anyway, and that is the walkover a
    // duration alone would call a normal Match.
    expect(report.outliers.lopsided.map((match) => match.seed)).toEqual([33]);
    expect(report.outliers.lopsided[0]).toMatchObject({ victoryReason: 'annihilation', winner: 'carthage' });
  });

  it('lists every Match the clock decided as stalled, with its seed', () => {
    const report = tournamentReportOf(
      [played(21, 8400), played(22, 25200, null), played(23, 25200, null)],
      BATCH,
    );

    expect(seedsOf(report.outliers.stalled)).toEqual([22, 23]);
    expect(report.outliers.stalled[0]).toMatchObject({ seed: 22, outcome: 'clock', winner: null });
  });

  it('states the batch it measured, and lists every Match it played', () => {
    const report = tournamentReportOf(
      [played(7, 8400), played(8, 8400, 'carthage')],
      { ...BATCH, difficulty: 'imperator', bound: 9000, firstSeed: 7 },
    );

    expect(report).toMatchObject({
      rules: 'ai',
      difficulty: 'imperator',
      bound: 9000,
      seeds: { first: 7, count: 2 },
    });
    expect(seedsOf(report.matches)).toEqual([7, 8]);
    expect(report.matches[0]).toMatchObject({ seed: 7, outcome: 'victory', winner: 'rome', ticks: 8400 });
  });

  it('reads the same report whatever order the Matches arrive in, and refuses a seed twice', () => {
    const batch = [played(1, 8400), played(2, 6300, 'carthage'), played(3, 25200, null)];

    const forward = formatTournamentReport(tournamentReportOf(batch, BATCH));
    const shuffled = formatTournamentReport(tournamentReportOf([batch[2]!, batch[0]!, batch[1]!], BATCH));

    expect(shuffled).toBe(forward);
    expect(() => tournamentReportOf([...batch, played(2, 8400)], BATCH)).toThrow(/seed 2/);
  });

  it('ends with a newline, so a shell prompt never lands on the closing brace', () => {
    const text = formatTournamentReport(tournamentReportOf([played(1, 8400)], BATCH));

    expect(text.endsWith('}\n')).toBe(true);
    expect(JSON.parse(text)).toMatchObject({ seeds: { first: 1, count: 1 } });
  });
});
