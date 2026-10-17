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
 * This re-enacts a log its caller already holds, so it checks the stamps and not
 * the Commands: a log a Match's own driver produced has been through
 * `validateCommand` once per entry already. For a log that arrived from outside
 * a Match, see `replayCommands`.
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

  for (let tick = 0; tick < ticks; tick += 1) {
    match.step(schedule.get(tick) ?? NO_COMMANDS);

    const reached = tick + 1;
    if (reached === ticks || reached % everyTicks === 0) {
      checkpoints.push({ tick: reached, hash: match.hash() });
    }
  }

  return { seed: match.state.seed, ticks, checkpoints };
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
