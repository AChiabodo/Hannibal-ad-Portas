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
 */
import { createMatch, type MatchRules } from './match';

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
}

/** What a replay produced: the checkpoints two runs are compared by. */
export interface ReplayResult {
  readonly seed: number;
  readonly ticks: number;
  readonly checkpoints: readonly StateCheckpoint[];
}

/** A tick with nothing stamped on it, so replaying does not allocate one per tick. */
const NO_COMMANDS: readonly never[] = [];

/**
 * Runs a seed and a command log to `ticks` ticks, hashing as it goes.
 *
 * @throws RangeError when the log holds a Command stamped outside the run, or a
 *   stamp, run length or checkpoint interval that is not a whole number of ticks.
 * @throws StateSerializationError when a tick leaves anything but integers in state.
 */
export function replay<World, Command = unknown>(options: ReplayOptions<World, Command>): ReplayResult {
  const ticks = requireTicks(options.ticks, 'ticks', 0);
  const everyTicks =
    options.everyTicks === undefined ? 1 : requireTicks(options.everyTicks, 'everyTicks', 1);
  const schedule = scheduleByTick(options.log, ticks);

  const match = createMatch({ seed: options.seed, rules: options.rules });
  const checkpoints: StateCheckpoint[] = [{ tick: 0, hash: match.hash() }];

  for (let tick = 0; tick < ticks; tick += 1) {
    match.step(schedule.get(tick) ?? NO_COMMANDS);

    const reached = tick + 1;
    if (reached === ticks || reached % everyTicks === 0) {
      checkpoints.push({ tick: reached, hash: match.hash() });
    }
  }

  return { seed: match.state.seed, ticks, checkpoints };
}

/** The log, keyed by tick: the shape the tick loop wants to consume. */
function scheduleByTick<Command>(log: CommandLog<Command>, ticks: number): Map<number, Command[]> {
  const schedule = new Map<number, Command[]>();

  for (const entry of log) {
    const tick = requireTicks(entry.tick, 'a command log tick', 0);
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

/** @throws RangeError when a count is not a whole number of ticks at or above `minimum`. */
function requireTicks(value: number, what: string, minimum: number): number {
  if (!Number.isInteger(value) || value < minimum) {
    throw new RangeError(
      `${what} must be a whole number of ticks, ${minimum} or more, got ${String(value)}`,
    );
  }

  return value;
}
