import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match';
import { replay, type CommandLog } from '../../src/sim/replay';
import { toyRules, type ToyCommand } from './toy-rules';

/** Two Commands on the same tick, because a busy tick is normal rather than special. */
const LOG: CommandLog<ToyCommand> = [
  { tick: 0, command: 'levy' },
  { tick: 47, command: 'double' },
  { tick: 47, command: 'levy' },
  { tick: 199, command: 'double' },
];

describe('a replay', () => {
  it('reproduces a seed and a command log, hash for hash, every run', () => {
    const once = replay({ seed: 99, rules: toyRules, log: LOG, ticks: 200 });
    const again = replay({ seed: 99, rules: toyRules, log: LOG, ticks: 200 });

    expect(again).toEqual(once);
    expect(once.seed).toBe(99);
    expect(once.ticks).toBe(200);
  });

  it('hashes every tick by default, starting before the first one', () => {
    const result = replay({ seed: 99, rules: toyRules, log: [], ticks: 3 });

    expect(result.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 1, 2, 3]);
  });

  it('checkpoints at an interval, and always at the last tick', () => {
    const ticked = replay({ seed: 99, rules: toyRules, log: [], ticks: 250, everyTicks: 100 });
    const exact = replay({ seed: 99, rules: toyRules, log: [], ticks: 200, everyTicks: 100 });

    expect(ticked.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 100, 200, 250]);
    expect(exact.checkpoints.map((checkpoint) => checkpoint.tick)).toEqual([0, 100, 200]);
  });

  it('drives a Match exactly the way a caller holding the log would', () => {
    const replayed = replay({ seed: 5, rules: toyRules, log: LOG, ticks: 200 });

    const match = createMatch({ seed: 5, rules: toyRules });
    const byHand = [match.hash()];
    for (let tick = 0; tick < 200; tick += 1) {
      const commands = LOG.filter((entry) => entry.tick === tick).map((entry) => entry.command);
      match.step(commands);
      byHand.push(match.hash());
    }

    expect(replayed.checkpoints.map((checkpoint) => checkpoint.hash)).toEqual(byHand);
  });

  it('runs a different Match when the log differs, so the log is really applied', () => {
    const withCommands = replay({ seed: 5, rules: toyRules, log: [{ tick: 0, command: 'levy' }], ticks: 100 });
    const without = replay({ seed: 5, rules: toyRules, log: [], ticks: 100 });

    expect(withCommands.checkpoints).not.toEqual(without.checkpoints);
  });

  it('refuses a command log it cannot reach', () => {
    expect(() =>
      replay({ seed: 1, rules: toyRules, log: [{ tick: 10, command: 'levy' }], ticks: 10 }),
    ).toThrow(/tick 10/);
  });

  it('refuses a log that is not stamped with whole ticks', () => {
    for (const tick of [-1, 1.5, Number.NaN]) {
      expect(() =>
        replay({ seed: 1, rules: toyRules, log: [{ tick, command: 'levy' }], ticks: 10 }),
      ).toThrow(/tick/);
    }
  });

  it('refuses a run length that is not a whole number of ticks', () => {
    expect(() => replay({ seed: 1, rules: toyRules, log: [], ticks: 1.5 })).toThrow(/ticks/);
    expect(() => replay({ seed: 1, rules: toyRules, log: [], ticks: -1 })).toThrow(/ticks/);
    expect(() => replay({ seed: 1, rules: toyRules, log: [], ticks: 5, everyTicks: 0 })).toThrow(/everyTicks/);
  });
});
