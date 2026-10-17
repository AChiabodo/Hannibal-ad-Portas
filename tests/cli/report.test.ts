import { describe, expect, it } from 'vitest';
import { formatReport, reportOf } from '../../src/cli/report';
import { hold, move, type Command } from '../../src/sim/command';
import type { MatchResult, MatchRun } from '../../src/sim/driver';
import type { CommandLog } from '../../src/sim/replay';

/** The hash the toys below end on: sixteen hexadecimal digits, the shape `hashState` returns. */
const HASH = '0123456789abcdef';

/** A Match that ran and ended however the test needs it to have ended. */
function ran(result: MatchResult, log: CommandLog<Command> = []): MatchRun {
  return { seed: 7, result, log, hash: HASH };
}

describe('the JSON report of a Match', () => {
  it('names the seed, the outcome, the tick it ended on and the reason, in a fixed order', () => {
    const report = ran({ kind: 'victory', winner: 'rome', tick: 25 }, [
      { tick: 0, command: move('rome', [1], 4, 4) },
      { tick: 24, command: hold('carthage', [3]) },
    ]);

    expect(formatReport(reportOf(report))).toBe(
      `{
  "seed": 7,
  "ticks": 25,
  "outcome": "victory",
  "winner": "rome",
  "reason": "rome won the Match",
  "commands": 2,
  "hash": "0123456789abcdef"
}
`,
    );
  });

  it('names the winner of a victory and nobody else', () => {
    const report = reportOf(ran({ kind: 'victory', winner: 'carthage', tick: 900 }));

    expect(report.outcome).toBe('victory');
    expect(report.winner).toBe('carthage');
    expect(report.reason).toBe('carthage won the Match');
  });

  it('reports a draw the rules called as a draw, with no winner', () => {
    const report = reportOf(ran({ kind: 'draw', tick: 0 }));

    expect(report.outcome).toBe('draw');
    expect(report.winner).toBeNull();
    expect(report.reason).toBe('the rules called the Match a draw');
  });

  it('reports a Match the rules never decided as one that ran out of ticks, and says which bound', () => {
    const report = reportOf(ran({ kind: 'clock', tick: 18_000 }));

    expect(report.outcome).toBe('clock');
    expect(report.winner).toBeNull();
    expect(report.reason).toBe('the Match reached its tick bound of 18000 ticks without a decision');
  });

  it('is the very same text for the very same Match, because it is meant to be diffed', () => {
    const once = formatReport(reportOf(ran({ kind: 'draw', tick: 3 })));
    const again = formatReport(reportOf(ran({ kind: 'draw', tick: 3 })));

    expect(again).toBe(once);
    expect(once.endsWith('\n')).toBe(true);
    expect(JSON.parse(once)).toEqual(reportOf(ran({ kind: 'draw', tick: 3 })));
  });
});
