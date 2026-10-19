import { describe, expect, it } from 'vitest';
import {
  CHECKPOINT_TICKS,
  formatRecord,
  readRecord,
  recordOf,
  type MatchRecord,
} from '../../src/cli/record';
import { RULES } from '../../src/cli/rules';
import type { MatchResult } from '../../src/sim/driver';

/**
 * A Match's record: the file a replay is made of (E2).
 *
 * Two things are under test here and they are different questions. The first is
 * what recording *writes*: a seed, the Commands stamped with the ticks they
 * applied on, and the fingerprints that let a replay prove it re-ran the same
 * Match — and nothing else, because a record is meant to be small enough to
 * attach to an issue. The second is what reading *accepts*: a record arrives as
 * a text file from somewhere else in the world, so it is read through a strict
 * reader that names the field it cannot believe rather than replaying whatever
 * it found.
 */
const HASH = /^[0-9a-f]{16}$/;

/** A record as a value a test can edit, before it is written back out as text. */
type Editable = Record<string, unknown>;

/** A record this test's edits start from: two ticks of a Match, ending by the clock. */
function valid(): MatchRecord {
  const result: MatchResult = { kind: 'clock', tick: 2 };

  return {
    seed: 7,
    rules: 'economy',
    everyTicks: 1,
    result,
    checkpoints: [
      { tick: 0, hash: '0000000000000000' },
      { tick: 1, hash: '1111111111111111' },
      { tick: 2, hash: '2222222222222222' },
    ],
    log: [],
  };
}

/** The valid record as text, with one thing changed. */
function edited(change: (record: Editable) => void): string {
  const value = JSON.parse(formatRecord(valid())) as Editable;
  change(value);

  return JSON.stringify(value);
}

describe('recording a Match', () => {
  it('writes the seed, the log and the checkpoints, and nothing else', () => {
    const run = RULES.march.play(1, 40);
    const record = recordOf(run, 'march');

    expect(record.seed).toBe(1);
    expect(record.rules).toBe('march');
    expect(record.result).toEqual(run.result);
    expect(record.log).toEqual(run.log);
    expect(record.everyTicks).toBe(CHECKPOINT_TICKS);
    expect(record.checkpoints[0]).toEqual({ tick: 0, hash: expect.stringMatching(HASH) as string });
    expect(record.checkpoints.at(-1)).toEqual({ tick: run.result.tick, hash: run.hash });
    expect(Object.keys(record).sort()).toEqual([
      'checkpoints',
      'everyTicks',
      'log',
      'result',
      'rules',
      'seed',
    ]);
  });

  it('fingerprints a Match at the checkpoints a replay keeps, and at its last tick', () => {
    const record = recordOf(RULES.march.play(1, 40), 'march');

    expect(record.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([
      0, 10, 20, 30, 40,
    ]);
  });

  it('writes a Match it can replay, and refuses one its own log does not replay', () => {
    const run = RULES.march.play(1, 40);

    expect(recordOf(run, 'march').checkpoints.at(-1)?.hash).toBe(run.hash);
    // The same Match with the log thrown away: the two Commands it was played by
    // are gone, so replaying what is left is no longer the Match that ran.
    expect(() => recordOf({ ...run, log: [] }, 'march')).toThrow(/cannot be recorded/);
  });
});

describe('a record is a text file, and the file is the record', () => {
  it('reads back exactly what it wrote', () => {
    const record = recordOf(RULES.march.play(1, 40), 'march');

    expect(readRecord(formatRecord(record))).toEqual(record);
  });

  it('round-trips a Match won by a Stronghold falling, reason and all', () => {
    const record: MatchRecord = {
      ...valid(),
      everyTicks: 1,
      result: {
        kind: 'victory',
        winner: 'rome',
        reason: { kind: 'stronghold', stronghold: 1, path: 'blockade' },
        tick: 2,
      },
    };

    expect(readRecord(formatRecord(record))).toEqual(record);
    expect(readRecord(formatRecord(record)).result).toEqual(record.result);
  });

  it('reads the log it wrote, one entry a Command with the tick it applied on', () => {
    const record: MatchRecord = {
      ...valid(),
      log: [{ tick: 1, command: { kind: 'hold', faction: 'rome', squads: [3] } }],
    };

    expect(readRecord(formatRecord(record)).log).toEqual(record.log);
  });
});

describe('a record that is not a record is refused, by name', () => {
  const refusals: readonly (readonly [string, string, RegExp])[] = [
    ['text that is not JSON', 'not a record at all', /JSON/],
    ['a list where the record should be', '[]', /plain object/],
    ['a field nobody has', edited((record) => (record.video = 'replay.mp4')), /video/],
    ['a seed that is not a seed', edited((record) => (record.seed = 'one')), /seed/],
    ['a seed past the random source', edited((record) => (record.seed = 2 ** 32)), /seed/],
    ['rules nobody can play', edited((record) => (record.rules = 'nope')), /rules/],
    ['a checkpoint interval of zero', edited((record) => (record.everyTicks = 0)), /everyTicks/],
    ['a result of no kind', edited((record) => (record.result = { tick: 2 })), /result\.kind/],
    ['a result with no tick', edited((record) => (record.result = { kind: 'clock' })), /result\.tick/],
    [
      'a victory that names no winner',
      edited((record) => (record.result = { kind: 'victory', tick: 2 })),
      /result\.winner/,
    ],
    [
      'a hash that is not a hash',
      edited(
        (record) =>
          (record.checkpoints = [
            { tick: 0, hash: 'nope' },
            { tick: 1, hash: '1'.repeat(16) },
            { tick: 2, hash: '2'.repeat(16) },
          ]),
      ),
      /checkpoints\[0\]\.hash/,
    ],
    [
      'checkpoints on a schedule no run keeps',
      edited(
        (record) =>
          (record.checkpoints = [
            { tick: 0, hash: '0'.repeat(16) },
            { tick: 2, hash: '2'.repeat(16) },
          ]),
      ),
      /checkpoints\[1\]\.tick/,
    ],
    [
      'a record that stops short of the tick it says it ended on',
      edited(
        (record) =>
          (record.checkpoints = [
            { tick: 0, hash: '0'.repeat(16) },
            { tick: 1, hash: '1'.repeat(16) },
          ]),
      ),
      /checkpoints/,
    ],
    [
      'a Command stamped after the Match ended',
      edited(
        (record) =>
          (record.log = [{ tick: 2, command: { kind: 'hold', faction: 'rome', squads: [1] } }]),
      ),
      /log\[0\]\.tick/,
    ],
    [
      'a log entry that is not a Command',
      edited((record) => (record.log = [{ tick: 0, command: { kind: 'teleport', faction: 'rome' } }])),
      /log\[0\]\.command/,
    ],
  ];

  for (const [what, text, expected] of refusals) {
    it(`refuses ${what}`, () => {
      expect(() => readRecord(text)).toThrow(expected);
    });
  }
});
