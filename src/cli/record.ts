/**
 * A Match's record: the file a replay is made of (E2).
 *
 * A record is a seed, the Commands that were applied and the tick each one
 * applied on, how long the Match ran and how it ended — and, on every checkpoint
 * the run was fingerprinted at, the state hash it had reached there. That is the
 * whole instrument: no video, no state snapshot, no timings. The seed and the log
 * are what reproduces the Match; the checkpoints are what proves that a replay
 * did reproduce it, and what turns "it looks the same" into a tick.
 *
 * ## Why the checkpoints are in the file
 *
 * A divergence report is a comparison, and a comparison needs both sides. The
 * Match is cheap to run again — integer state, a fixed step, a seeded generator —
 * so a replay does not need the state the record was made from: it needs the
 * fingerprints, which are eight bytes each. The alternative, exercising a rule
 * change and watching the *last* hash move, would say only that something
 * differs; a checkpoint a game second says since when (ADR-0006).
 *
 * ## Why one game second
 *
 * Hashing is the expensive half of a replay: `hashState` serializes the whole
 * world, so a three-year Match fingerprinted every tick spends longer hashing
 * than simulating. `CHECKPOINT_TICKS` is the compromise, and it is written into
 * the file rather than assumed by the reader, so a ticket that wants a finer or
 * coarser record changes the number and not the format. A divergence is reported
 * as the first checkpoint that disagrees *and* the last that agreed, so the
 * interval's cost is visible in the report rather than hidden behind it.
 *
 * ## Why recording runs the Match twice
 *
 * The driver does not hash as it goes — a Match that hashed every tick would be
 * slower than the thing it exists to test — so recording plays the Match and then
 * replays its own log to collect the checkpoints. That is not waste: it is the
 * one moment at which a Match can be checked against itself. A record whose log
 * does not reproduce the Match it was made from is not written at all, because a
 * record that does not replay is worse than no record: it is a bug report that
 * lies.
 *
 * ## Why reading is strict
 *
 * A record arrives as a text file from somewhere else: attached to an issue,
 * produced by an agent's run, mailed in as a bug. So it is read the way a Command
 * from outside is — every field checked, unknown fields refused by name, and the
 * checkpoints required to be the schedule a run keeps — rather than being
 * trusted because it is ours. `docs/PROTOCOL.md` is the same discipline over a
 * pipe, for the same reason.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CommandValidationError, validateCommand, type Command, type SiegePath } from '../sim/command.ts';
import type { MatchResult, MatchRun, VictoryReason } from '../sim/driver.ts';
import { FACTIONS, isFaction, type Faction } from '../sim/faction.ts';
import { sameEnding } from '../sim/outcome.ts';
import type { CommandLog, StateCheckpoint } from '../sim/replay.ts';
import { MAX_SEED } from '../sim/rng.ts';
import { requireTickCount } from '../sim/ticks.ts';
import { InputError } from './failure.ts';
import { endingWords } from './report.ts';
import { RULES, isRulesName, type RulesName } from './rules.ts';
import { isDifficultyName, type DifficultyName } from '../ai/difficulty.ts';

/**
 * How often a recorded Match is fingerprinted, in ticks: one game second.
 *
 * A checkpoint is sixteen hexadecimal digits, so this is the knob that trades a
 * divergence report's precision for the size of the file it travels in. One second
 * makes a Match that was settled in five minutes a record of some tens of
 * kilobytes, and one that ran its whole three-year bound about a hundred and
 * sixty — either of them a file that attaches to an issue, and the second one
 * replays in about ten seconds. It also puts a divergence inside a window a reader
 * can step through by hand.
 */
export const CHECKPOINT_TICKS = 10;

/**
 * Everything needed to replay a Match, as one small file.
 *
 * The field order is the order it is written in, and every field is required: a
 * record with a field missing is not a record of something older, it is a file
 * somebody edited.
 */
export interface MatchRecord {
  /** Shared raid difficulty, for Matches whose rules support it. */
  readonly difficulty?: DifficultyName;
  /** The Match's seed: with the log, the whole of its reproducibility. */
  readonly seed: number;

  /** Which Match this is, by the name `--rules` uses — the rules, and the world they build. */
  readonly rules: RulesName;

  /** How many ticks apart the fingerprints below were taken. */
  readonly everyTicks: number;

  /** How the Match ended, and on which tick: the ending a replay has to reach again. */
  readonly result: MatchResult;

  /** The state hash at each checkpoint, in ascending tick order, from tick 0 to the last. */
  readonly checkpoints: readonly StateCheckpoint[];

  /** Every Command applied, stamped with the tick it applied on, in application order. */
  readonly log: CommandLog<Command>;
}

/**
 * A Match that cannot be recorded: replaying its own log did not reproduce it.
 *
 * Not a failure of the record but a failure of the Match, and the reason it is
 * worth a class of its own: it says that a Match which played is not a Match that
 * replays, which is the one thing E2 exists to make impossible. The usual cause
 * is a harness Match that builds armies onto its world outside its `createWorld`,
 * so a replay starts from the bare world and parts from the run at tick zero.
 */
export class UnreplayableMatchError extends Error {
  /** What replaying the Match's own log produced instead, in a sentence. */
  readonly reason: string;

  constructor(reason: string) {
    super(
      `this Match cannot be recorded: ${reason}. ` +
        'A Match that does not replay is a Match nothing can be said about later (ADR-0006)',
    );
    this.name = 'UnreplayableMatchError';
    this.reason = reason;
  }
}

/**
 * Records a Match that has been played: its seed, its log, its ending, and the
 * state hashes it passed through.
 *
 * Recording is also the one moment a Match is checked against itself: the log is
 * replayed here, and the record is written only when that replay reaches the hash
 * the Match ended on *and* the ending the Match reported. A record that does not
 * replay is worse than no record — it is a bug report that lies — so the check
 * happens before the file exists rather than when somebody reads it.
 *
 * @throws UnreplayableMatchError when replaying the Match's own log reaches a
 *   different hash, or the same world with a different ending.
 */
export function recordOf(run: MatchRun, rules: RulesName, difficulty?: DifficultyName): MatchRecord {
  if (difficulty !== undefined && (!isDifficultyName(difficulty) || (rules !== 'ai' && rules !== 'siege'))) {
    throw new InputError('record.difficulty must name a supported difficulty on an ai or siege Match');
  }
  const replayed = RULES[rules].replay({
    seed: run.seed,
    log: run.log,
    ticks: run.result.tick,
    everyTicks: CHECKPOINT_TICKS,
    ...(difficulty === undefined ? {} : { difficulty }),
  });

  if (replayed.hash !== run.hash) {
    throw new UnreplayableMatchError(
      `it ended on ${run.hash}, and replaying its own log reached ${replayed.hash}`,
    );
  }

  if (!sameEnding(replayed.ending, run.result)) {
    throw new UnreplayableMatchError(
      `it ended ${endingWords(run.result)}, and replaying its own log ended ${endingWords(replayed.ending)}`,
    );
  }

  return {
    seed: run.seed,
    rules,
    ...(difficulty === undefined ? {} : { difficulty }),
    everyTicks: CHECKPOINT_TICKS,
    result: run.result,
    checkpoints: replayed.checkpoints,
    log: run.log,
  };
}

/** The record as the text of a file: pretty-printed JSON and a final newline. */
export function formatRecord(record: MatchRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

/**
 * Writes a record where a replay can read it: the one thing `--record` does.
 *
 * @throws InputError when the file cannot be written — a directory that is not
 *   there, a path that is one: the caller's mistake, reported as one.
 */
export function writeRecord(path: string, record: MatchRecord): void {
  try {
    writeFileSync(resolve(path), formatRecord(record));
  } catch (error) {
    throw new InputError(`the record could not be written to ${describe(path)}: ${describe(error)}`);
  }
}

/**
 * Reads a record off disk.
 *
 * A file being absent is the same failure as its content being wrong — there is
 * nothing to replay either way — so both arrive as the same refusal, naming the
 * path the caller gave rather than the absolute path this resolved it to.
 *
 * @throws InputError when there is no file at that path, or it is not a record.
 */
export function readRecordFile(path: string): MatchRecord {
  let text: string;

  try {
    text = readFileSync(resolve(path), 'utf8');
  } catch (error) {
    throw new InputError(`there is no record at ${describe(path)}: ${describe(error)}`);
  }

  return readRecord(text);
}

/** The fields a record carries, in the order it is written in. */
const FIELDS = ['seed', 'rules', 'difficulty', 'everyTicks', 'result', 'checkpoints', 'log'] as const;

/** A value that must be sixteen lowercase hexadecimal digits, the shape `hashState` returns. */
const STATE_HASH = /^[0-9a-f]{16}$/;

/** The two paths of a Siege, as a victory's reason names one (ADR-0008). */
const SIEGE_PATHS: readonly SiegePath[] = ['assault', 'blockade'];

/**
 * Reads a record off a file's text, refusing anything that is not one.
 *
 * Every field is checked and unknown fields are refused, so a record edited into
 * something a replay cannot use is reported by the field that was edited rather
 * than by a hash that quietly differs. The checkpoints are required to be the
 * schedule a run keeps — the first tick, every `everyTicks` after it, and the
 * last — because a replay rebuilds that schedule, and a record that disagrees
 * with it is a record of a different length, not a Match that diverged.
 *
 * @throws InputError when the text is not a record: not JSON, not a plain
 *   object, a field missing or unknown, or a value that cannot be what it says.
 */
export function readRecord(text: string): MatchRecord {
  const record = requireObject(parse(text), 'a record');
  requireOnlyFields(record);

  const seed = readSeed(record.seed);
  const rules = readRules(record.rules);
  const difficulty = record.difficulty;
  if (difficulty !== undefined && (typeof difficulty !== 'string' || !isDifficultyName(difficulty) || (rules !== 'ai' && rules !== 'siege'))) {
    throw new InputError('record.difficulty must name a supported difficulty on an ai or siege Match');
  }
  const everyTicks = readEveryTicks(record.everyTicks);
  const result = readResult(record.result);
  const checkpoints = readCheckpoints(record.checkpoints);
  const log = readLog(record.log, result.tick);
  requireSchedule(checkpoints, everyTicks, result.tick);

  return { seed, rules, ...(difficulty === undefined ? {} : { difficulty }), everyTicks, result, checkpoints, log };
}

/** @throws InputError when the text is not JSON at all. */
function parse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new InputError(`a record is JSON, and this is not: ${describe(error)}`);
  }
}

/**
 * @throws InputError when the record carries a field the format does not name.
 *
 * Only the unknown ones: a field that is missing is named by the reader that
 * wanted it, so a record with several problems is reported one field at a time in
 * the order the format writes them, rather than all at once.
 */
function requireOnlyFields(record: Record<string, unknown>): void {
  for (const field of Object.keys(record)) {
    if (!(FIELDS as readonly string[]).includes(field)) {
      throw new InputError(`record.${field} is not a field of a record: a record has ${FIELDS.join(', ')}`);
    }
  }
}

/** @throws InputError when the value is not a seed the random source would accept. */
function readSeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > MAX_SEED) {
    throw new InputError(`record.seed is not an unsigned 32-bit integer: ${describe(value)}`);
  }

  return value;
}

/** @throws InputError when no Match has that name: the mistake is a typo, and the list is the answer. */
function readRules(value: unknown): RulesName {
  if (typeof value !== 'string' || !isRulesName(value)) {
    throw new InputError(
      `record.rules must name a Match this command can replay, and ${describe(value)} does not`,
    );
  }

  return value;
}

/** @throws InputError when the value is not a whole number of ticks to fingerprint at. */
function readEveryTicks(value: unknown): number {
  return readTicks(value, 'record.everyTicks', 1);
}

/** @throws InputError when the value is not a whole number of ticks, at least `minimum`. */
function readTicks(value: unknown, path: string, minimum: number): number {
  if (typeof value !== 'number') {
    throw new InputError(`${path} is not a whole number of ticks: ${describe(value)}`);
  }

  try {
    return requireTickCount(value, path, minimum);
  } catch (error) {
    throw new InputError(describe(error));
  }
}

/** @throws InputError when the value is not how a Match can have ended. */
function readResult(value: unknown): MatchResult {
  const result = requireObject(value, 'record.result');
  const tick = readTicks(result.tick, 'record.result.tick', 0);

  switch (result.kind) {
    case 'clock':
    case 'draw':
      return { kind: result.kind, tick };

    case 'victory':
      return {
        kind: 'victory',
        winner: readFaction(result.winner, 'record.result.winner'),
        reason: readReason(result.reason),
        tick,
      };

    default:
      throw new InputError(
        'record.result.kind is not how a Match can end: expected victory, draw or clock, got ' +
          describe(result.kind),
      );
  }
}

/** @throws InputError when the value is not why a Match was won. */
function readReason(value: unknown): VictoryReason {
  const reason = requireObject(value, 'record.result.reason');

  switch (reason.kind) {
    case 'stronghold': {
      const stronghold = readTicks(reason.stronghold, 'record.result.reason.stronghold', 0);
      const path = SIEGE_PATHS.find((candidate) => candidate === reason.path);

      if (path === undefined) {
        throw new InputError(
          `record.result.reason.path is not a path of the Siege: expected ` +
            `${SIEGE_PATHS.join(' or ')}, got ${describe(reason.path)}`,
        );
      }

      return { kind: 'stronghold', stronghold, path };
    }

    case 'annihilation':
      return { kind: 'annihilation' };

    default:
      throw new InputError(
        'record.result.reason.kind is not why a Match was won: expected stronghold or ' +
          `annihilation, got ${describe(reason.kind)}`,
      );
  }
}

/** @throws InputError when the value is not one of the two Factions. */
function readFaction(value: unknown, path: string): Faction {
  if (!isFaction(value)) {
    throw new InputError(
      `${path} is not one of the two Factions (${FACTIONS.join(', ')}), got ${describe(value)}`,
    );
  }

  return value;
}

/** @throws InputError when the value is not a list of checkpoints, each a tick and a hash. */
function readCheckpoints(value: unknown): readonly StateCheckpoint[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new InputError('record.checkpoints is not a non-empty list of checkpoints');
  }

  return value.map((entry, index) => {
    const checkpoint = requireObject(entry, `record.checkpoints[${index}]`);

    return {
      tick: readTicks(checkpoint.tick, `record.checkpoints[${index}].tick`, 0),
      hash: readHash(checkpoint.hash, `record.checkpoints[${index}].hash`),
    };
  });
}

/** @throws InputError when the value is not the shape of a state hash. */
function readHash(value: unknown, path: string): string {
  if (typeof value !== 'string' || !STATE_HASH.test(value)) {
    throw new InputError(`${path} is not a 16-digit hexadecimal state hash: ${describe(value)}`);
  }

  return value;
}

/**
 * @throws InputError when the checkpoints are not the schedule a run keeps: the
 *   first tick, every `everyTicks` after it, and the tick the Match ended on.
 */
function requireSchedule(
  checkpoints: readonly StateCheckpoint[],
  everyTicks: number,
  ticks: number,
): void {
  checkpoints.forEach((checkpoint, index) => {
    const scheduled = Math.min(index * everyTicks, ticks);

    if (checkpoint.tick !== scheduled) {
      throw new InputError(
        `record.checkpoints[${index}].tick is ${String(checkpoint.tick)}, and a Match of ` +
          `${String(ticks)} ticks fingerprinted every ${String(everyTicks)} has its checkpoint ` +
          `${String(index)} at ${String(scheduled)}`,
      );
    }
  });

  const last = checkpoints.at(-1)?.tick;
  if (last !== ticks) {
    throw new InputError(
      `record.checkpoints ends at tick ${describe(last)}, and the Match it records ended at ` +
        String(ticks),
    );
  }
}

/**
 * @throws InputError when the value is not a list of applied Commands, each
 *   stamped with a tick the Match actually ran.
 */
function readLog(value: unknown, ticks: number): CommandLog<Command> {
  if (!Array.isArray(value)) {
    throw new InputError('record.log is not a list of Commands');
  }

  return value.map((entry, index) => {
    const logged = requireObject(entry, `record.log[${index}]`);
    const tick = readTicks(logged.tick, `record.log[${index}].tick`, 0);

    if (tick >= ticks) {
      throw new InputError(
        `record.log[${index}].tick is ${String(tick)}, and this Match ran ${String(ticks)} tick(s): ` +
          'a Command stamped after the end was never applied',
      );
    }

    return { tick, command: readCommand(logged.command, index) };
  });
}

/** @throws InputError when the value is not a Command of the vocabulary, naming the field. */
function readCommand(value: unknown, index: number): Command {
  try {
    return validateCommand(value);
  } catch (error) {
    if (error instanceof CommandValidationError) {
      throw new InputError(`record.log[${index}].command is not a Command: ${error.message}`);
    }

    throw error;
  }
}

/** @throws InputError when the value is not a plain object, which a record and its parts are. */
function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new InputError(`${path} is not a plain object: ${describe(value)}`);
  }

  return value as Record<string, unknown>;
}

/** A value as a failure message says it, without a JSON dump of something enormous. */
function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value instanceof Error) return value.message;
  if (typeof value === 'string') return value === '' ? 'an empty string' : `"${value}"`;
  if (typeof value === 'object') return value === null ? 'null' : 'an object';

  return String(value);
}
