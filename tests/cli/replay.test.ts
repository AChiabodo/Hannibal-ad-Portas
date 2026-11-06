import { describe, expect, it } from 'vitest';
import {
  DivergenceError,
  EndingError,
  formatReplayReport,
  replayRecord,
  requireReproduced,
} from '../../src/cli/replay';
import { recordOf, type MatchRecord } from '../../src/cli/record';
import { RULES } from '../../src/cli/rules';

/**
 * Replaying a record and reading the verdict (E2).
 *
 * A replay re-enacts a seed and a Command log and compares the state hashes it
 * reaches against the ones the record was made with. The tests below are the
 * ticket's acceptance criteria at the seam: a Match reproduces hash for hash, a
 * Match that ended by the clock replays to the same ending, and a record that no
 * longer describes this build is reported as a divergence — at the first
 * checkpoint that disagrees, with both hashes quoted.
 */
describe('replaying a record', () => {
  it('reproduces a Match from its seed and its log, checkpoint for checkpoint', () => {
    const record = recordOf(RULES.march.play(1, 40), 'march');
    const report = replayRecord(record);

    expect(report).toMatchObject({
      seed: 1,
      rules: 'march',
      ticks: 40,
      everyTicks: record.everyTicks,
      checkpoints: record.checkpoints.length,
      verdict: 'reproduced',
      hash: record.checkpoints.at(-1)?.hash,
    });
    expect(report.departure).toBeUndefined();
  });

  it('reports a Match that ended by the clock as the same ending', () => {
    const run = RULES.economy.play(1, 40);
    expect(run.result).toEqual({ kind: 'clock', tick: 40 });

    const replayed = replayRecord(recordOf(run, 'economy'));

    // The ending in the report is the one *this build's* rules reach on the world
    // they replayed — a fact about the replay, not the record's verdict repeated.
    expect(replayed).toMatchObject({
      verdict: 'reproduced',
      outcome: 'clock',
      winner: null,
      ticks: 40,
      reason: 'the Match reached its tick bound of 40 ticks without a decision',
    });
  });

  it('reports a Match won by a Siege as the same ending, reason and all', () => {
    const run = RULES.assault.play(1, 4000);
    expect(run.result).toMatchObject({ kind: 'victory', winner: 'rome' });

    const report = replayRecord(recordOf(run, 'assault'));

    expect(report).toMatchObject({ verdict: 'reproduced', outcome: 'victory', winner: 'rome' });
    expect(report.reason).toBe('rome won the Match: the carthage Stronghold fell to an assault');
    expect(report.ticks).toBe(run.result.tick);
  }, 120_000);

  it('names the first checkpoint a changed build parts at, quoting both hashes', () => {
    const record = recordOf(RULES.march.play(1, 40), 'march');
    const [first, second, third, fourth, last] = record.checkpoints;

    // What a changed rule looks like from a replay's side: the fingerprint the
    // record holds is no longer the one this build reaches, from tick 30 on.
    const changed: MatchRecord = {
      ...record,
      checkpoints: [first, second, third, { tick: 30, hash: '0'.repeat(16) }, last].filter(
        (checkpoint) => checkpoint !== undefined,
      ),
    };

    const report = replayRecord(changed);

    expect(report.verdict).toBe('diverged');
    expect(report.departure).toEqual({
      kind: 'hashes',
      divergence: { tick: 30, agreedAt: 20, recorded: '0'.repeat(16), replayed: fourth?.hash },
    });
  });

  it('catches a Match ended differently, with every checkpoint still matching', () => {
    // What a change to the *ending* looks like: the world is untouched, so the
    // hashes agree — and the record claims a victory the rules do not reach.
    const record: MatchRecord = {
      ...recordOf(RULES.economy.play(1, 40), 'economy'),
      result: {
        kind: 'victory',
        winner: 'rome',
        reason: { kind: 'annihilation' },
        tick: 40,
      },
    };

    const report = replayRecord(record);

    expect(report.verdict).toBe('diverged');
    expect(report.departure).toEqual({
      kind: 'ending',
      recorded: record.result,
      replayed: { kind: 'clock', tick: 40 },
    });
    expect(report.hash).toBe(record.checkpoints.at(-1)?.hash);
  });

  it('says the two runs never agreed when the record is of another Match', () => {
    const record: MatchRecord = { ...recordOf(RULES.march.play(1, 40), 'march'), rules: 'empty' };
    const report = replayRecord(record);

    expect(report.departure).toMatchObject({ kind: 'hashes', divergence: { tick: 0, agreedAt: null } });
  });

  it('fails the command in one sentence, quoting both hashes, when it diverged', () => {
    const record: MatchRecord = { ...recordOf(RULES.march.play(1, 40), 'march'), rules: 'empty' };
    const report = replayRecord(record);
    const divergence = report.departure?.kind === 'hashes' ? report.departure.divergence : undefined;

    expect(() => requireReproduced(report)).toThrow(DivergenceError);
    expect(() => requireReproduced(report)).toThrow(/diverged at tick 0/);
    expect(() => requireReproduced(report)).toThrow(new RegExp(divergence?.recorded ?? 'unreachable'));
    expect(() => requireReproduced(report)).toThrow(new RegExp(divergence?.replayed ?? 'unreachable'));
  });

  it('fails the command in one sentence, quoting both endings, when the ending changed', () => {
    const record: MatchRecord = {
      ...recordOf(RULES.economy.play(1, 40), 'economy'),
      result: { kind: 'draw', tick: 40 },
    };

    const failing = (): void => requireReproduced(replayRecord(record));

    expect(failing).toThrow(EndingError);
    expect(failing).toThrow(/ended differently/);
    expect(failing).toThrow(/the rules called the Match a draw, at tick 40/);
    expect(failing).toThrow(/the Match reached its tick bound of 40 ticks without a decision/);
  });

  it('passes a report that reproduced, so the command exits zero', () => {
    const report = replayRecord(recordOf(RULES.march.play(1, 40), 'march'));

    expect(() => requireReproduced(report)).not.toThrow();
  });
});

describe('the report a replay prints', () => {
  it('is JSON, and the JSON is the report, so a reader can gate on it', () => {
    const replayed = replayRecord(recordOf(RULES.march.play(1, 40), 'march'));
    const written = formatReplayReport(replayed);

    expect(written.endsWith('}\n')).toBe(true);
    expect(JSON.parse(written)).toEqual(replayed);
  });
});
