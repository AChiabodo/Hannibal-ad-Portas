import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatTournamentReport } from '../../src/cli/tournament';
import { InputError } from '../../src/cli/failure';
import { BrokenMatchError, runTournament, type BatchOptions } from '../../src/cli/tournament-batch';

/**
 * Playing a batch of Matches, and the report it becomes (E3).
 *
 * The aggregation is `tournament.test.ts`'s, on summaries small enough to count
 * by hand; what is under test here is the batch itself: one Match per distinct
 * seed, the same report whatever the machine's cores, and — the criterion that
 * makes the report an instrument rather than a result — a decision log per Match
 * that can be read afterwards.
 *
 * Most of these play forty ticks apiece, which is enough for a Match to exist and
 * end by its bound and far too few to be a game. One of them plays a Match to a
 * real victory, because a batch of stalled Matches would pass every other test in
 * this file while measuring nothing.
 */

/** A batch of `count` Matches starting at `firstSeed`, with everything else stated. */
function batch(options: Partial<BatchOptions> = {}): BatchOptions {
  return { seeds: 2, firstSeed: 5, ticks: 40, difficulty: 'centurio', workers: 2, keep: null, ...options };
}

/** A directory of this test's own, so a decision log never lands in the repository. */
function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'spqr-tournament-'));
}

describe('a batch of AI-vs-AI Matches', () => {
  it('plays one Match on each seed of the batch, and reports them in seed order', async () => {
    const report = await runTournament(batch({ seeds: 3, firstSeed: 11, workers: 3 }));

    expect(report.seeds).toEqual({ first: 11, count: 3 });
    expect(report.matches.map((match) => match.seed)).toEqual([11, 12, 13]);
    expect(report.matches[0]).toMatchObject({ outcome: 'clock', winner: null, ticks: 40 });
    expect(report).toMatchObject({ rules: 'ai', difficulty: 'centurio', bound: 40 });
  });

  it('reports the same batch identically however many Matches it plays at once', async () => {
    const one = await runTournament(batch({ seeds: 4, workers: 1 }));
    const four = await runTournament(batch({ seeds: 4, workers: 4 }));

    // The same seeds, the same build: a second core is a scheduling fact about the
    // machine and not a fact about the game, so it cannot reach the report.
    expect(formatTournamentReport(four)).toBe(formatTournamentReport(one));
  });

  it('writes one decision log per Match when a directory is kept, and reports the same batch', async () => {
    const keep = workspace();
    const kept = await runTournament(batch({ keep }));
    const dropped = await runTournament(batch({ keep: null }));

    expect(readdirSync(keep).sort()).toEqual(['5.json', '6.json']);
    expect(formatTournamentReport(kept)).toBe(formatTournamentReport(dropped));

    const log = JSON.parse(readFileSync(join(keep, '5.json'), 'utf8')) as {
      readonly seed: number;
      readonly hash: string;
      readonly decisions: readonly { readonly tick: number; readonly selected: { readonly id: string } }[];
    };

    // The file is the report `npm run match -- --rules ai` prints for that seed, so
    // the decisions read back here are the ones the batch measured.
    expect(log).toMatchObject({ seed: 5, hash: kept.matches[0]?.hash });
    expect(log.decisions).toHaveLength(kept.matches[0]?.decisions ?? -1);
    expect(log.decisions[0]?.tick).toBe(0);
  }, 60_000);

  it('plays a real Match: one seed, to a victory, with the decisions it took to win it', async () => {
    // #71's opening changes the outcome baseline. Seed 13 at Tiro remains a
    // real blockade victory; the fixed 1–10 pressure matrix retains every failure.
    const report = await runTournament(batch({ seeds: 1, firstSeed: 13, difficulty: 'tiro', ticks: 7000, workers: 1 }));

    expect(report.matches[0]).toMatchObject({ seed: 13, outcome: 'victory', winner: 'carthage', ticks: 6300 });
    expect(report.winRate).toEqual({ rome: 0, carthage: 1 });
    expect(report.outliers.lopsided).toEqual([]);
    expect(report.outliers.stalled).toEqual([]);
  }, 120_000);

  it('retains the historical Centurio seed 6 stall instead of counting submitted Orders as victory', async () => {
    const report = await runTournament(batch({ seeds: 1, firstSeed: 6, ticks: 7000, workers: 1 }));
    expect(report.matches[0]).toMatchObject({ seed: 6, outcome: 'clock', winner: null, ticks: 7000 });
    expect(report.winRate).toEqual({ rome: 0, carthage: 0 });
  }, 120_000);

  it("refuses a directory it cannot write decision logs to, before playing anything", async () => {
    const blocked = join(workspace(), 'not-a-directory');
    writeFileSync(blocked, 'a file, where a directory was asked for');

    await expect(runTournament(batch({ keep: blocked }))).rejects.toThrow(/cannot be written to/);
    await expect(runTournament(batch({ keep: blocked }))).rejects.toThrow(InputError);
  });

  it('fails the batch, naming the seed, when a Match cannot be played at all', async () => {
    const broken = runTournament(batch({ seeds: 1, ticks: -1, workers: 1 }));

    await expect(broken).rejects.toThrow(BrokenMatchError);
    await expect(broken).rejects.toThrow(/seed 5/);
  }, 60_000);
});
