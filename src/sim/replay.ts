/**
 * Replay: a seed plus a command log, and nothing else (PLAN §3).
 *
 * A Match is reproducible by construction — integer state, a seeded generator,
 * a fixed step — so replaying it is not a feature bolted on afterwards; it is
 * the same loop run twice. What `replay` adds is the *comparison*: a hash at
 * every checkpoint, which is what turns "it looks the same" into a list of ticks
 * that agree and, when they stop agreeing, the first tick that differs.
 *
 * There is no video anywhere in this design and no need for one. A bug reported
 * by an external agent arrives as a small text file, and it replays on the
 * machine of whoever fixes it (ADR-0003).
 *
 * The awkward possibility is a log that does not match its Match — a stamp past
 * the end of the run, a fraction of a tick. Those throw, because a replay that
 * quietly ignores a Command is worse than one that refuses to start.
 *
 * A log arrives from one of two places, and this module is the entry point for
 * each of them: `replay` re-enacts a log the caller already holds, and
 * `replayCommands` closes the Command vocabulary on one that arrived from
 * outside. Which one a caller wants, and why, is `replayCommands`'s own note.
 */
import { validateCommand, type Command } from './command.ts';
import { createMatch, type MatchRules } from './match.ts';
import type { MatchResult, Outcome } from './outcome.ts';
import { requireTickCount } from './ticks.ts';

/** A Command a Controller emitted, stamped with the tick it takes effect on. */
export interface LoggedCommand<Command> {
  readonly tick: number;
  readonly command: Command;
}

/** Everything a Match needs to happen again, besides its seed and its rules. */
export type CommandLog<Command> = readonly LoggedCommand<Command>[];

/** A Match's state hash at one tick. */
export interface StateCheckpoint {
  readonly tick: number;
  readonly hash: string;
}

export interface ReplayOptions<World, Command> {
  readonly seed: number;
  readonly rules: MatchRules<World, Command>;
  /** The Commands that were emitted, in the order they were emitted. */
  readonly log: CommandLog<Command>;
  /** How many ticks to run. Every Command in the log must fall inside them. */
  readonly ticks: number;
  /** Hash every this many ticks. The first and the last are always hashed. Default 1. */
  readonly everyTicks?: number;

  /**
   * The verdict, or `null` while the Match is still on — the rules' own
   * `MatchSetup['outcome']`, asked the way the driver asks it (ADR-0021).
   *
   * Given it, a replay also says *how the Match ended*: the first tick the rules
   * decided on, or the clock at the bound when they never did. That is not a
   * second way of checking the hashes — a rule can change when a Match ends
   * without changing a single number in the world, and that is exactly the class
   * of change a record has to catch (E2).
   *
   * Without it the replay is a comparison of hashes and nothing more, which is
   * all a caller that has no rules-level verdict to ask for can be given.
   */
  readonly outcome?: (world: World) => Outcome | null;
}

/** What a replay produced: the checkpoints two runs are compared by, and the ending it reached. */
export interface ReplayResult {
  readonly seed: number;
  readonly ticks: number;
  readonly checkpoints: readonly StateCheckpoint[];

  /** The state hash the run ended on: the last checkpoint's, spelled once. */
  readonly hash: string;

  /**
   * How the Match ended, as the rules say it did — see `ReplayOptions.outcome`.
   *
   * `null` when the caller gave no verdict to ask for. Otherwise it is the
   * `MatchResult` the driver would have reported: the first decision, stamped
   * with the tick it was given on, or `clock` at the bound when no tick decided
   * it.
   */
  readonly ending: MatchResult | null;
}

/**
 * Where two runs of the same Match stopped being the same run.
 *
 * The report a bug needs: not "the hashes differ" but since when. It quotes both
 * values because the interesting question a reader has is never "did they
 * differ" — it is "what did this build reach instead" — and it names the last
 * checkpoint the two still agreed on, because a record is fingerprinted at an
 * interval and the divergence is somewhere after that tick rather than exactly
 * at this one (`agreedAt`).
 *
 * `agreedAt` is `null` when the two runs disagree at tick 0, which means they
 * never agreed at all: the world a seed builds is not the world the record was
 * made on, so nothing after it can be replayed.
 */
export interface Divergence {
  /** The first checkpoint, in ascending tick order, whose two hashes differ. */
  readonly tick: number;

  /** The hash the record holds at `tick`: what the Match was when it was recorded. */
  readonly recorded: string;

  /** The hash this run reached at `tick`: what the Match is now. */
  readonly replayed: string;

  /** The last checkpoint before `tick` the two runs agreed on, or `null` for none. */
  readonly agreedAt: number | null;
}

/** A tick with nothing stamped on it, so replaying does not allocate one per tick. */
const NO_COMMANDS: readonly never[] = [];

/**
 * Runs a seed and a command log to `ticks` ticks, hashing as it goes.
 *
 * This re-enacts a log its caller already holds, so it checks the stamps and not
 * the Commands: a log a Match's own driver produced has been through
 * `validateCommand` once per entry already. For a log that arrived from outside
 * a Match, see `replayCommands`.
 *
 * Given `outcome`, it also says how the Match ended, and a replay is then a
 * comparison of two things rather than one: the checkpoints, and the ending. A
 * Match is over when its rules say so, and a rule can change that without moving
 * a number in the world, so the ending is derived again here and not taken from
 * whoever asked (E2).
 *
 * @throws RangeError when the log holds a Command stamped outside the run, or a
 *   stamp, run length or checkpoint interval that is not a whole number of ticks.
 * @throws StateSerializationError when a tick leaves anything but integers in state.
 */
export function replay<World, Command = unknown>(options: ReplayOptions<World, Command>): ReplayResult {
  const ticks = requireTickCount(options.ticks, 'ticks', 0);
  const everyTicks =
    options.everyTicks === undefined ? 1 : requireTickCount(options.everyTicks, 'everyTicks', 1);
  const schedule = scheduleByTick(options.log, ticks);

  const match = createMatch({ seed: options.seed, rules: options.rules });
  const checkpoints: StateCheckpoint[] = [{ tick: 0, hash: match.hash() }];
  const decided = verdicts(options.outcome, match.state.world);

  for (let tick = 0; tick < ticks; tick += 1) {
    // Asked before the step, as the driver asks it: the rules for tick T turn the
    // world into T+1, so a Match decided by the world at T ended at T.
    decided.at(tick);

    match.step(schedule.get(tick) ?? NO_COMMANDS);

    const reached = tick + 1;
    if (reached === ticks || reached % everyTicks === 0) {
      checkpoints.push({ tick: reached, hash: match.hash() });
    }
  }

  // And once past the last step, because a Match the rules decide on its very last
  // tick is decided by the world at `ticks`, which the loop above never looked at.
  decided.at(ticks);

  return {
    seed: match.state.seed,
    ticks,
    checkpoints,
    hash: lastHashOf(checkpoints),
    ending: decided.ending(ticks),
  };
}

/**
 * Runs a seed and a log that arrived from outside, refusing anything outside the
 * vocabulary before the first tick.
 *
 * The difference from `replay` is where the log has been. `replay` re-enacts a
 * log its caller already holds — A2's tests hand it the rules' own Command type,
 * and the driver produced its log through `validateCommand`, so it trusts what
 * it is given. This is the entry point for the log that came back as a small
 * text file or from an external agent: nothing has read it, so nothing has said
 * its entries are Commands. Every entry goes through `validateCommand` here, and
 * the whole log is validated before the first tick runs, so an unknown kind is
 * refused at the boundary with a sentence naming the field instead of reaching
 * the rules as a shape the closed vocabulary was supposed to have made
 * impossible.
 *
 * The Commands the rules are handed are the validated copies — `validateCommand`
 * copies what it accepts — which is the same promise the driver makes when a
 * Controller emits one: a log cannot keep a hand on the Match through the object
 * it handed over.
 *
 * @throws CommandValidationError when an entry is not a Command of the vocabulary.
 * @throws RangeError when the log holds a Command stamped outside the run, or a
 *   stamp, run length or checkpoint interval that is not a whole number of ticks.
 * @throws StateSerializationError when a tick leaves anything but integers in state.
 */
export function replayCommands<World>(options: ReplayOptions<World, Command>): ReplayResult {
  return replay({ ...options, log: readLog(options.log) });
}

/** The log, every entry read through the vocabulary and kept with its stamp. */
function readLog(log: CommandLog<Command>): CommandLog<Command> {
  return log.map((entry) => ({ tick: entry.tick, command: validateCommand(entry.command) }));
}

/**
 * Where two runs of the same Match stopped agreeing: `null` when they are the
 * same run, all the way to the last checkpoint.
 *
 * The comparison is the other half of the replay, and the reason a checkpoint is
 * a *tick and a hash* rather than a hash alone: a replay re-enacted on the wrong
 * schedule could otherwise be compared by luck. Both lists are what a run
 * produced, in the order it produced them — ascending ticks, starting at 0 — so
 * a checkpoint at a tick the other run did not reach is not a divergence but a
 * caller comparing two different Matches, and says so.
 *
 * @throws RangeError when the two lists are not the same schedule of checkpoints:
 *   a tick in one and not the other, or a tick stamped twice.
 */
export function divergenceOf(
  recorded: readonly StateCheckpoint[],
  replayed: readonly StateCheckpoint[],
): Divergence | null {
  const record = byTick(recorded, 'the record');
  const reached = byTick(replayed, 'this replay');
  let agreedAt: number | null = null;

  for (const [tick, recordedHash] of record) {
    const replayedHash = reached.get(tick);

    if (replayedHash === undefined) {
      throw new RangeError(
        `the record holds a checkpoint at tick ${String(tick)}, and this replay did not reach one: ` +
          'two runs with different checkpoints are not the same run, and cannot be compared',
      );
    }

    reached.delete(tick);

    if (replayedHash !== recordedHash) {
      return { tick, recorded: recordedHash, replayed: replayedHash, agreedAt };
    }

    agreedAt = tick;
  }

  if (reached.size > 0) {
    throw new RangeError(
      `this replay holds a checkpoint at tick ${String(Math.min(...reached.keys()))}, and the record ` +
        'does not: two runs with different checkpoints are not the same run, and cannot be compared',
    );
  }

  return null;
}

/**
 * The checkpoints of a run, keyed by tick, so a comparison asks a tick rather
 * than an index: an index would agree with any list of the same length.
 *
 * @throws RangeError when the same tick is stamped twice, which no run does and
 *   which would leave the comparison silently reading one of the two.
 */
function byTick(checkpoints: readonly StateCheckpoint[], what: string): Map<number, string> {
  const hashes = new Map<number, string>();

  for (const checkpoint of checkpoints) {
    if (hashes.has(checkpoint.tick)) {
      throw new RangeError(`${what} has two checkpoints at tick ${String(checkpoint.tick)}`);
    }

    hashes.set(checkpoint.tick, checkpoint.hash);
  }

  return hashes;
}

/**
 * The verdict a replay is looking for, wrapped so the loop can ask it a tick at a
 * time without carrying the hook around.
 *
 * A small object rather than three variables because a replay asks the same
 * question twice in the same breath — "has it ended, and if so at which tick" —
 * and the answer has to be recorded once: the *first* tick that decided, not the
 * last one that still says the same thing.
 */
interface Verdicts {
  /** Asks the rules about the world at `tick`, and remembers the first decision. */
  at(tick: number): void;

  /** The ending this run reached, or `null` when the caller gave no verdict to ask for. */
  ending(ticks: number): MatchResult | null;
}

/** @param outcome The rules' verdict, or `undefined` when the caller has none to ask. */
function verdicts<World>(
  outcome: ((world: World) => Outcome | null) | undefined,
  world: World,
): Verdicts {
  let decided: Outcome | null = null;
  let decidedAt: number | null = null;

  return {
    at(tick: number): void {
      if (outcome === undefined || decided !== null) return;

      decided = outcome(world);
      if (decided !== null) decidedAt = tick;
    },

    ending(ticks: number): MatchResult | null {
      if (outcome === undefined) return null;

      return decided === null
        ? { kind: 'clock', tick: ticks }
        : { ...decided, tick: decidedAt ?? ticks };
    },
  };
}

/** The log, keyed by tick: the shape the tick loop wants to consume. */
function scheduleByTick<Command>(log: CommandLog<Command>, ticks: number): Map<number, Command[]> {
  const schedule = new Map<number, Command[]>();

  for (const entry of log) {
    const tick = requireTickCount(entry.tick, 'a command log tick', 0);
    if (tick >= ticks) {
      throw new RangeError(
        `the command log holds a command for tick ${tick}, but this replay runs ${ticks} tick(s)`,
      );
    }

    const commands = schedule.get(tick);
    if (commands === undefined) schedule.set(tick, [entry.command]);
    else commands.push(entry.command);
  }

  return schedule;
}

/**
 * The hash a run ended on: its last checkpoint's, which `replay` always takes.
 *
 * @throws RangeError when a list of checkpoints is empty, which no run produces
 *   and which would otherwise have to be answered with a hash-shaped nothing.
 */
export function lastHashOf(checkpoints: readonly StateCheckpoint[]): string {
  const last = checkpoints.at(-1);

  if (last === undefined) {
    throw new RangeError('a replay has at least one checkpoint, at tick 0, and this has none');
  }

  return last.hash;
}
