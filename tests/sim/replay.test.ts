import { describe, expect, it } from 'vitest';
import { CommandValidationError, type Command } from '../../src/sim/command';
import { createMatch, type MatchRules } from '../../src/sim/match';
import type { Outcome } from '../../src/sim/outcome';
import {
  divergenceOf,
  replay,
  replayCommands,
  type CommandLog,
  type StateCheckpoint,
} from '../../src/sim/replay';
import { toyRules, type ToyCommand, type ToyWorld } from './toy-rules';

/** Two Commands on the same tick, because a busy tick is normal rather than special. */
const LOG: CommandLog<ToyCommand> = [
  { tick: 0, command: 'levy' },
  { tick: 47, command: 'double' },
  { tick: 47, command: 'levy' },
  { tick: 199, command: 'double' },
];

/**
 * A log as it arrives from outside a Match: text that was parsed, not checked.
 *
 * The cast is the point. Whoever parses an external agent's recording — or a bug
 * report that came in as a small text file — has no way to know the values are
 * Commands until something reads them through the vocabulary, so the type here
 * says only what the caller hopes is true.
 */
function logFromOutside(text: string): CommandLog<Command> {
  return JSON.parse(text) as CommandLog<Command>;
}

/** One march, as an external agent would send it. */
const OUTSIDE_VALID = `[
  { "tick": 3, "command": { "kind": "move", "faction": "rome", "squads": [1], "x": 2, "y": 3 } }
]`;

/** The march, and then a word the vocabulary has never heard of, three ticks later. */
const OUTSIDE_UNKNOWN_KIND = `[
  { "tick": 0, "command": { "kind": "move", "faction": "rome", "squads": [1], "x": 2, "y": 3 } },
  { "tick": 3, "command": { "kind": "teleport", "faction": "rome" } }
]`;

/** The world these tests replay into: it counts the Commands a tick applied. */
interface VocabularyWorld {
  applied: number;
}

/**
 * Rules over the closed vocabulary, so a Command the world received is visible in
 * the hash — and, when a test wants to look, so is the object the rules were
 * handed.
 */
function vocabularyRules(into: Command[] = []): MatchRules<VocabularyWorld, Command> {
  return {
    createWorld: () => ({ applied: 0 }),
    step: (world, _rng, _tick, commands) => {
      world.applied += commands.length;
      into.push(...commands);
    },
  };
}

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

/** Checkpoints as a run produces them: one a tick, so a test can read the ticks off the indices. */
function checkpoints(...hashes: readonly string[]): StateCheckpoint[] {
  return hashes.map((hash, tick) => ({ tick, hash }));
}

/** Two runs of three ticks: the first two agree, the third does not. */
const AGREES_EARLY: readonly string[] = ['aaa0', 'aaa1', 'aaa2'];
const AGREES_LATER: readonly string[] = ['aaa0', 'bbb1', 'bbb2'];

describe('the ending a replay reaches', () => {
  /** The rules' verdict, as a Match's `outcome` gives it: a draw once `draws` has reached `by`. */
  const decidedAfter = (by: number) => (world: ToyWorld): Outcome | null =>
    world.draws >= by ? { kind: 'draw' } : null;

  it('is not asked for at all when the caller gave no verdict', () => {
    expect(replay({ seed: 1, rules: toyRules, log: [], ticks: 5 }).ending).toBeNull();
  });

  it('is the clock at the bound when no tick decided the Match', () => {
    const replayed = replay({ seed: 1, rules: toyRules, log: [], ticks: 5, outcome: () => null });

    expect(replayed.ending).toEqual({ kind: 'clock', tick: 5 });
  });

  it('is the first decision the rules gave, stamped with the tick it was given on', () => {
    const replayed = replay({ seed: 1, rules: toyRules, log: [], ticks: 10, outcome: decidedAfter(3) });

    // The rules for tick T turn the world from T into T+1, so a Match decided by
    // the world at T ended at T — and the first decision is the one that counts.
    expect(replayed.ending).toEqual({ kind: 'draw', tick: 3 });
  });

  it('notices a decision on the very last tick, which no step is left to carry', () => {
    expect(replay({ seed: 1, rules: toyRules, log: [], ticks: 10, outcome: decidedAfter(10) }).ending).toEqual(
      { kind: 'draw', tick: 10 },
    );
  });

  it('says the hash the run ended on, which is the last checkpoint it took', () => {
    const replayed = replay({ seed: 1, rules: toyRules, log: [], ticks: 25, everyTicks: 10 });

    expect(replayed.hash).toBe(replayed.checkpoints.at(-1)?.hash);
  });
});

describe('the divergence between a record and its replay', () => {
  it('catches a rule that changed: the same seed and log part at the first tick the rule bites', () => {
    // A levy is worth a hundred, and a levy is worth a hundred and one. Nothing
    // else changes: same seed, same log, same ticks.
    const paid = (bonus: number): MatchRules<ToyWorld, ToyCommand> => ({
      ...toyRules,
      step: (world, rng, tick, commands) => {
        toyRules.step(world, rng, tick, commands);
        if (commands.includes('levy') && tick >= 47) world.total += bonus;
      },
    });
    const log: CommandLog<ToyCommand> = [
      { tick: 47, command: 'levy' },
      { tick: 120, command: 'levy' },
    ];

    const before = replay({ seed: 5, rules: paid(0), log, ticks: 200, everyTicks: 10 });
    const after = replay({ seed: 5, rules: paid(1), log, ticks: 200, everyTicks: 10 });

    expect(divergenceOf(before.checkpoints, after.checkpoints)).toEqual({
      tick: 50,
      recorded: before.checkpoints[5]?.hash,
      replayed: after.checkpoints[5]?.hash,
      agreedAt: 40,
    });
  });

  it('finds no divergence when the two runs agree at every checkpoint', () => {
    expect(divergenceOf(checkpoints(...AGREES_EARLY), checkpoints(...AGREES_EARLY))).toBeNull();
  });

  it('names the first tick the two disagree at, quoting both hashes and the last they agreed on', () => {
    expect(divergenceOf(checkpoints(...AGREES_EARLY), checkpoints(...AGREES_LATER))).toEqual({
      tick: 1,
      recorded: 'aaa1',
      replayed: 'bbb1',
      agreedAt: 0,
    });
  });

  it('says so when the runs had already parted before the first tick', () => {
    const recorded = checkpoints('aaa0', 'aaa1');
    const replayed = checkpoints('zzz0', 'zzz1');

    expect(divergenceOf(recorded, replayed)).toEqual({
      tick: 0,
      recorded: 'aaa0',
      replayed: 'zzz0',
      agreedAt: null,
    });
  });

  it('finds the first difference, not the last: a later one does not move the report', () => {
    const recorded = checkpoints('aaa0', 'aaa1', 'aaa2', 'aaa3');
    const replayed = checkpoints('aaa0', 'bbb1', 'bbb2', 'aaa3');

    expect(divergenceOf(recorded, replayed)?.tick).toBe(1);
  });

  it('refuses two runs whose checkpoints are not the same schedule', () => {
    expect(() => divergenceOf(checkpoints('aaa0'), checkpoints('aaa0', 'aaa1'))).toThrow(/tick 1/);
    expect(() => divergenceOf(checkpoints('aaa0', 'aaa1'), checkpoints('aaa0'))).toThrow(/tick 1/);
  });

  it('refuses a run that stamps two checkpoints on the same tick', () => {
    const twice: StateCheckpoint[] = [
      { tick: 0, hash: 'aaa0' },
      { tick: 0, hash: 'aaa0' },
    ];

    expect(() => divergenceOf(twice, checkpoints('aaa0'))).toThrow(/two checkpoints at tick 0/);
  });
});

describe('replaying a log that arrived from outside', () => {
  it('refuses a Command outside the vocabulary before any tick runs', () => {
    const ticks: number[] = [];
    const watched: MatchRules<VocabularyWorld, Command> = {
      ...vocabularyRules(),
      step: (_world, _rng, tick) => {
        ticks.push(tick);
      },
    };

    expect(() =>
      replayCommands({ seed: 1, rules: watched, log: logFromOutside(OUTSIDE_UNKNOWN_KIND), ticks: 5 }),
    ).toThrow(CommandValidationError);

    expect(ticks).toEqual([]);
  });

  it('replays a log it accepted to the same checkpoints as replay, handing the rules the validated copy', () => {
    const log = logFromOutside(OUTSIDE_VALID);
    const delivered: Command[] = [];

    expect(replayCommands({ seed: 7, rules: vocabularyRules(delivered), log, ticks: 6 })).toEqual(
      replay({ seed: 7, rules: vocabularyRules(), log, ticks: 6 }),
    );

    const sent = log[0]?.command;
    expect(delivered).toEqual([sent]);
    expect(delivered[0]).not.toBe(sent);
  });
});
