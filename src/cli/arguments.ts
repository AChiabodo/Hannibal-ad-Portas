/**
 * What the command line means: which Match to play, on which seed, for how long,
 * and nothing else.
 *
 * The CLI is the harness the four waves after this one test the Match through
 * (PLAN §7), so its surface is deliberately small and deliberately strict: it
 * takes exactly the things a reproducible Match needs, it refuses anything else
 * by name rather than guessing, and it never accepts a value it cannot read
 * back. A flag a reader cannot spell, or a number a reader cannot type, is a
 * usage error and says so — it is not a Match played on a quietly different
 * seed, which is the failure mode that costs an afternoon.
 *
 * Two mistakes are kept apart here, and the exit codes follow:
 *
 * - **Misused**: a flag nobody knows, a value that is not a number, a hash that
 *   is not a hash. This module refuses those, and the CLI exits 2.
 * - **Violated**: the command line was fine and a game invariant broke while
 *   the Match ran. That is `run.ts`'s business, and the CLI exits 1.
 *
 * Nothing here reads `process.argv` or writes anything: the arguments arrive as
 * a list of strings and leave as a value, so every refusal above is a test.
 */
import { DIFFICULTY_NAMES, isDifficultyName, type DifficultyName } from '../ai/difficulty.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { MAX_SEED } from '../sim/rng.ts';
import { HEADLESS_TICKS } from '../sim/season.ts';
import { DEFAULT_RULES, isRulesName, RULES, RULES_NAMES, type RulesName } from './rules.ts';
import { continuationAt, optionAt } from './usage.ts';

/** The seed a Match runs on when the command line does not name one. */
export const DEFAULT_SEED = 1;

/**
 * The tick bound a Match runs to when the command line does not name one.
 *
 * Three game years, which is the bound the plan puts on a headless Match so
 * that one always terminates (PLAN §4). The length of a Season and the number
 * of years are the clock's to say, so this is `HEADLESS_TICKS` and not a second
 * derivation of it: a Season that grew by a minute must not leave the CLI's
 * bound describing last year's calendar.
 */
export const DEFAULT_TICKS = HEADLESS_TICKS;

/** The level the built-in AI plays at when a command line does not say: the engine's baseline. */
export const DEFAULT_DIFFICULTY: DifficultyName = 'centurio';

/** What one command line asked for: a seed, a bound, which rules, and maybe a hash to expect. */
export interface RunOptions {
  /** The Match's seed: the whole reproducibility of the run hangs on it (ADR-0006). */
  readonly seed: number;

  /** The longest the Match may run, in whole ticks. The bound always terminates it. */
  readonly ticks: number;

  /**
   * Which rules to play, by name.
   *
   * Not game content and not part of the report: a name selects *which*
   * harness Match the CLI plays, which is how CI can gate a hash of a Match
   * that draws beside the hash of one that cannot (`rules.ts`).
   */
  readonly rules: RulesName;

  /**
   * The state hash the Match is required to end on, or `null` to accept any.
   *
   * This is how the CLI checks a game invariant rather than merely running: a
   * recorded hash is the one thing that turns "it ran" into "it ran the same
   * Match it ran before", and a mismatch is a non-zero exit with both numbers
   * in the message.
   */
  readonly expectedHash: string | null;

  /**
   * The level the built-in AI plays at, when `--rules` names a Match with an AI
   * on one side.
   *
   * Only `ai` has a level to name, and it is here for one reason: a tournament
   * plays its Matches at a chosen difficulty, so a Match of a batch can only be
   * replayed — its decision log retrieved, its hash confirmed — by a command that
   * can be told which level the batch played at (E3, ADR-0024).
   */
  readonly difficulty: DifficultyName;

  /**
   * Where to write the Match's record, or `null` to write none.
   *
   * A record is what a replay is made of — the seed, the Command log and the
   * state hashes the Match passed through (E2) — so this is the one flag that
   * turns a Match that ran into a Match somebody else can run again.
   */
  readonly record: string | null;
}

/** A command line, read: either a Match to play, a map to print, or a request for the usage. */
export type ParsedArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly options: RunOptions }
  | { readonly kind: 'map'; readonly seed: number };

/**
 * A command line this CLI will not run.
 *
 * Deriving `Error` rather than returning a result because there is nothing to
 * carry on with: an option nobody can read is not a Match, so it is refused
 * where it was written, with the offending text in the message (the CLI exits
 * 2 for these, the way `scripts/guard.mjs` does).
 */
export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Where `--help` starts a description: every option line pads its flag to this column. */
const DESCRIPTION_COLUMN = 23;

/** One option as this command's `--help` prints it, in the shared layout (`usage.ts`). */
const option = (flag: string, description: string): string =>
  optionAt(DESCRIPTION_COLUMN, flag, description);

/** A line continuing the option above it, starting where its description starts. */
const continuation = (text: string): string => continuationAt(DESCRIPTION_COLUMN, text);

/** Wide enough for the longest rules name, plus the gap before its description. */
const RULES_NAME_WIDTH = Math.max(...RULES_NAMES.map((name) => name.length)) + 2;

/**
 * The names `--rules` accepts, as `--help` lists them: read out of the table in
 * `rules.ts`, so a Match cannot be playable and undocumented.
 */
const RULES_MENU = RULES_NAMES.map((name) =>
  continuation(`${name.padEnd(RULES_NAME_WIDTH)}${RULES[name].description}`),
);

/**
 * Every option, in the order `--help` prints them.
 *
 * The block is built from the same column constant as the menu above, so
 * reflowing the usage cannot silently misalign the generated lines.
 */
const OPTION_LINES = [
  option('--seed <n>', `The Match's seed: an unsigned 32-bit integer (default ${DEFAULT_SEED}).`),
  option('--ticks <n>', 'The tick bound: how long the Match may run, in whole ticks,'),
  continuation(`at ${TICK_HZ} ticks a second (default ${DEFAULT_TICKS}, three game years).`),
  option('--expect-hash <hex>', 'Fail unless the Match ends on this 16-digit state hash.'),
  option('--difficulty <name>', "The AI's level, with --rules ai:"),
  continuation(`${DIFFICULTY_NAMES.join(', ')} (default centurio).`),
  option('--record <file>', 'Write the record `npm run replay` re-runs here.'),
  option('--rules <name>', `Which Match to play (default ${DEFAULT_RULES}):`),
  ...RULES_MENU,
  option('--map', 'Print the map this seed generates, and play nothing.'),
  option('--help, -h', 'Print this and play nothing.'),
].join('\n');

/** The one description of what this command accepts, printed verbatim by `--help`. */
export const USAGE = `Usage: npm run match -- [options]

${OPTION_LINES}

Plays one whole Match headless — no browser, no human and no AI — prints a JSON
report of it on standard output, and exits non-zero when a game invariant is
violated. With --map it prints the theatre a seed generates instead, and plays
nothing.

Exit codes: 0 the Match ran, 1 an invariant was violated, 2 the command line was
misused.`;

/** A value that must be sixteen lowercase hexadecimal digits, the shape `hashState` returns. */
const STATE_HASH = /^[0-9a-f]{16}$/;

/** A value that must be digits and nothing else: no sign, no fraction, no exponent. */
const DIGITS = /^[0-9]+$/;

/**
 * Reads a command line.
 *
 * @throws UsageError when a flag is unknown or repeated, a value is missing, a
 *   value is not the kind of thing that flag takes, or `--map` was asked for
 *   beside a flag that only means something to a Match.
 */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const asked: Asked = {
    seed: DEFAULT_SEED,
    ticks: DEFAULT_TICKS,
    rules: DEFAULT_RULES,
    difficulty: DEFAULT_DIFFICULTY,
    expectedHash: null,
    record: null,
    map: false,
  };
  const given = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--help' || flag === '-h') return { kind: 'help' };
    if (flag === undefined) continue;

    const option = OPTIONS[flag];
    if (option === undefined) throw new UsageError(`${flag} is not an option this command knows`);

    requireFirstTime(given, flag);

    if (option.value === 'none') {
      option.read(asked);
      continue;
    }

    const value = requireValue(argv, index, flag);
    index += 1;
    option.read(asked, value);
  }

  if (asked.map) {
    requireNothingToPlay(given);
    return { kind: 'map', seed: asked.seed };
  }

  requireDifficultyWhereItMeansSomething(given, asked.rules);

  return {
    kind: 'run',
    options: {
      seed: asked.seed,
      ticks: asked.ticks,
      rules: asked.rules,
      difficulty: asked.difficulty,
      expectedHash: asked.expectedHash,
      record: asked.record,
    },
  };
}

/** The options as the readers fill them in, before they leave as a `RunOptions`. */
interface Asked {
  seed: number;
  ticks: number;
  rules: RulesName;
  difficulty: DifficultyName;
  expectedHash: string | null;
  record: string | null;
  map: boolean;
}

/**
 * One flag, and how the parser reads it.
 *
 * Whether it takes a value is part of the option and not a convention, so that
 * a flag which stands alone cannot be given a value by a reader who typed one,
 * and a flag which takes one cannot be left without it: the parser knows the
 * difference from this table and nothing else has to remember.
 *
 * The flag is looked up before its value is, so a typo is refused as a flag
 * nobody knows rather than as a value that never arrived, which is the message
 * whoever typed `--seeds 7` can act on.
 */
type Option =
  | { readonly value: 'none'; readonly read: (asked: Asked) => void }
  | { readonly value: 'one'; readonly read: (asked: Asked, value: string) => void };

/** Every flag this command knows, and how it reads its value: one table, so an option cannot be
 * understood by the parser and forgotten by a reader, or the other way round. */
const OPTIONS: Readonly<Record<string, Option>> = {
  '--seed': {
    value: 'one',
    read: (asked, value) => {
      asked.seed = readSeed(value);
    },
  },

  '--ticks': {
    value: 'one',
    read: (asked, value) => {
      asked.ticks = readWholeNumber(value, '--ticks');
    },
  },

  '--difficulty': {
    value: 'one',
    read: (asked, value) => {
      if (!isDifficultyName(value)) {
        throw new UsageError(
          `--difficulty must name a level — ${DIFFICULTY_NAMES.join(', ')} — got ${describe(value)}`,
        );
      }

      asked.difficulty = value;
    },
  },

  '--expect-hash': {
    value: 'one',
    read: (asked, value) => {
      asked.expectedHash = readStateHash(value);
    },
  },

  '--rules': {
    value: 'one',
    read: (asked, value) => {
      asked.rules = readRulesName(value);
    },
  },

  '--record': {
    value: 'one',
    read: (asked, value) => {
      asked.record = readPath(value, '--record');
    },
  },

  '--map': {
    value: 'none',
    read: (asked) => {
      asked.map = true;
    },
  },
};

/**
 * @throws UsageError when a flag that only says something about a Match was
 *   asked for beside `--map`, which plays no Match.
 */
function requireNothingToPlay(given: ReadonlySet<string>): void {
  for (const flag of ['--ticks', '--expect-hash', '--rules', '--record', '--difficulty']) {
    if (!given.has(flag)) continue;

    throw new UsageError(`--map prints a map and plays nothing, so ${flag} cannot come with it`);
  }
}

/**
 * @throws UsageError when `--difficulty` names a level for a Match that has no AI
 *   to play at it.
 *
 * Only `ai` is two AIs. The other names are harness Matches played by scripted or
 * idle Controllers, and a level that changed nothing about them would be a flag
 * that lies: accepted, and pointless.
 */
function requireDifficultyWhereItMeansSomething(given: ReadonlySet<string>, rules: RulesName): void {
  if (!given.has('--difficulty') || rules === 'ai') return;

  throw new UsageError(
    `--difficulty names the level an AI plays at, and --rules ${rules} has no AI in it: ` +
      'give it with --rules ai',
  );
}

/** @throws UsageError when the same flag is given twice, because one of the two was not meant. */
function requireFirstTime(given: Set<string>, flag: string): void {
  if (given.has(flag)) throw new UsageError(`${flag} is given twice`);

  given.add(flag);
}

/** @throws UsageError when a flag is the last thing on the line, so its value never arrived. */
function requireValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined) throw new UsageError(`${flag} needs a value`);

  return value;
}

/** @throws UsageError when the value is not a seed the random source would accept. */
export function readSeed(value: string): number {
  const seed = readWholeNumber(value, '--seed');

  if (seed > MAX_SEED) {
    throw new UsageError(`--seed must be an unsigned 32-bit integer, at most ${MAX_SEED}, got ${value}`);
  }

  return seed;
}

/** @throws UsageError when the value is not a whole non-negative number. */
export function readWholeNumber(value: string, flag: string): number {
  const number = DIGITS.test(value) ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(number)) {
    throw new UsageError(`${flag} must be a whole non-negative number, got ${describe(value)}`);
  }

  return number;
}

/** @throws UsageError when the value is not the shape of a state hash. */
export function readStateHash(value: string): string {
  if (!STATE_HASH.test(value)) {
    throw new UsageError(`--expect-hash must be a 16-digit hexadecimal state hash, got ${describe(value)}`);
  }

  return value;
}

/**
 * A path a command writes to or reads from: anything a shell can hand over, but
 * not nothing, because `--record ''` names no file and saying so is cheaper than
 * a filesystem error about it.
 *
 * @throws UsageError when the value is empty.
 */
export function readPath(value: string, flag: string): string {
  if (value === '') throw new UsageError(`${flag} must name a file, got ${describe(value)}`);

  return value;
}

/**
 * @throws UsageError when no rules have that name, naming the name it was given
 *   and every name that exists — the mistake is a typo, and the list is the
 *   answer to it.
 */
function readRulesName(value: string): RulesName {
  if (!isRulesName(value)) {
    throw new UsageError(
      `--rules must name a Match this command can play — ${RULES_NAMES.join(', ')} — got ${describe(value)}`,
    );
  }

  return value;
}

/** A value as a failure message says it: an empty string would otherwise trail off after "got ". */
export function describe(value: string): string {
  return value === '' ? 'an empty string' : value;
}
