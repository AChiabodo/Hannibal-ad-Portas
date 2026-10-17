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
import { TICK_HZ } from '../sim/clock.ts';
import { MAX_SEED } from '../sim/rng.ts';
import { DEFAULT_RULES, isRulesName, RULES, RULES_NAMES, type RulesName } from './rules.ts';

/** The seed a Match runs on when the command line does not name one. */
export const DEFAULT_SEED = 1;

/** A game year is four Seasons (PLAN §1). */
const SEASONS_PER_YEAR = 4;

/** A Season is three to four minutes; the plan's middle is three and a half (PLAN §4). */
const MINUTES_PER_SEASON = 3.5;

/** How long a headless Match may run before its bound ends it: three game years (PLAN §4). */
const HEADLESS_YEARS = 3;

/**
 * The tick bound a Match runs to when the command line does not name one.
 *
 * Three game years, which is the bound the plan puts on a headless Match so
 * that one always terminates (PLAN §4): a Season is three to four minutes, four
 * Seasons make a game year, and three and a half minutes a Season puts the
 * bound at 42 minutes of Match time, which at `TICK_HZ` is this many ticks.
 * B5 owns the season clock and gives a Match a bound it can reason about;
 * until then this is the horizon, and the empty Match's only ending.
 */
export const DEFAULT_TICKS = HEADLESS_YEARS * SEASONS_PER_YEAR * MINUTES_PER_SEASON * 60 * TICK_HZ;

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
}

/** A command line, read: either a Match to play or a request for the usage. */
export type ParsedArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly options: RunOptions };

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

/** One option as `--help` prints it: the flag, then its description in the shared column. */
function option(flag: string, description: string): string {
  return `  ${flag.padEnd(DESCRIPTION_COLUMN - 2)}${description}`;
}

/** A line continuing the option above it, starting where that option's description starts. */
function continuation(text: string): string {
  return `${' '.repeat(DESCRIPTION_COLUMN)}${text}`;
}

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
  option('--rules <name>', `Which Match to play (default ${DEFAULT_RULES}):`),
  ...RULES_MENU,
  option('--help, -h', 'Print this and play nothing.'),
].join('\n');

/** The one description of what this command accepts, printed verbatim by `--help`. */
export const USAGE = `Usage: npm run match -- [options]

${OPTION_LINES}

Plays one whole Match headless — no browser, no human and no AI — prints a JSON
report of it on standard output, and exits non-zero when a game invariant is
violated.

Exit codes: 0 the Match ran, 1 an invariant was violated, 2 the command line was
misused.`;

/** A value that must be sixteen lowercase hexadecimal digits, the shape `hashState` returns. */
const STATE_HASH = /^[0-9a-f]{16}$/;

/** A value that must be digits and nothing else: no sign, no fraction, no exponent. */
const DIGITS = /^[0-9]+$/;

/**
 * Reads a command line.
 *
 * @throws UsageError when a flag is unknown or repeated, a value is missing, or
 *   a value is not the kind of thing that flag takes.
 */
export function parseArguments(argv: readonly string[]): ParsedArguments {
  const asked: Asked = {
    seed: DEFAULT_SEED,
    ticks: DEFAULT_TICKS,
    rules: DEFAULT_RULES,
    expectedHash: null,
  };
  const given = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--help' || flag === '-h') return { kind: 'help' };
    if (flag === undefined) continue;

    const read = OPTIONS[flag];
    if (read === undefined) throw new UsageError(`${flag} is not an option this command knows`);

    requireFirstTime(given, flag);
    const value = requireValue(argv, index, flag);
    index += 1;
    read(asked, value);
  }

  return { kind: 'run', options: asked };
}

/** The options as the readers fill them in, before they leave as a `RunOptions`. */
interface Asked {
  seed: number;
  ticks: number;
  rules: RulesName;
  expectedHash: string | null;
}

/**
 * Every flag this command knows, and how it reads its value: one table, so an
 * option cannot be understood by the parser and forgotten by a reader, or the
 * other way round.
 *
 * The flag is looked up before its value is, so a typo is refused as a flag
 * nobody knows rather than as a value that never arrived, which is the message
 * whoever typed `--seeds 7` can act on.
 */
const OPTIONS: Readonly<Record<string, (asked: Asked, value: string) => void>> = {
  '--seed': (asked, value) => {
    asked.seed = readSeed(value);
  },

  '--ticks': (asked, value) => {
    asked.ticks = readWholeNumber(value, '--ticks');
  },

  '--expect-hash': (asked, value) => {
    asked.expectedHash = readStateHash(value);
  },

  '--rules': (asked, value) => {
    asked.rules = readRulesName(value);
  },
};

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
function readSeed(value: string): number {
  const seed = readWholeNumber(value, '--seed');

  if (seed > MAX_SEED) {
    throw new UsageError(`--seed must be an unsigned 32-bit integer, at most ${MAX_SEED}, got ${value}`);
  }

  return seed;
}

/** @throws UsageError when the value is not a whole non-negative number. */
function readWholeNumber(value: string, flag: string): number {
  const number = DIGITS.test(value) ? Number(value) : Number.NaN;

  if (!Number.isSafeInteger(number)) {
    throw new UsageError(`${flag} must be a whole non-negative number, got ${describe(value)}`);
  }

  return number;
}

/** @throws UsageError when the value is not the shape of a state hash. */
function readStateHash(value: string): string {
  if (!STATE_HASH.test(value)) {
    throw new UsageError(`--expect-hash must be a 16-digit hexadecimal state hash, got ${describe(value)}`);
  }

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
function describe(value: string): string {
  return value === '' ? 'an empty string' : value;
}
