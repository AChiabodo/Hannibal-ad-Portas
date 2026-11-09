/**
 * What the tournament command line means: a batch of Matches, and nothing else (E3).
 *
 * The same discipline as `arguments.ts`, `agent-arguments.ts` and
 * `replay-arguments.ts`, for the same reason: a harness whose front door guesses
 * is a harness whose results cannot be trusted. A batch is only worth measuring
 * if the command that started it says exactly what it measured, so every number
 * here is required to be the kind of number it claims to be, and the two ways a
 * batch can fail to be a batch at all — nought Matches, and seeds that run off
 * the end of the seed space — are refused rather than discovered halfway through.
 *
 * The defaults are the Definition of Done's own batch (PLAN §5, DoD 5): two
 * hundred Matches on distinct seeds, at one difficulty, each given the three game
 * years a headless Match is bound to. `npm run tournament` with no flags is
 * therefore the measurement the plan asks for, and every flag is a deliberate
 * departure from it.
 *
 * Nothing here touches `process.argv`, the filesystem or a core count: the
 * arguments arrive as strings and leave as a value, so every refusal below is a
 * test.
 */
import { availableParallelism } from 'node:os';
import { DIFFICULTY_NAMES, isDifficultyName } from '../ai/difficulty.ts';
import { MAX_SEED } from '../sim/rng.ts';
import { HEADLESS_TICKS } from '../sim/season.ts';
import { DEFAULT_DIFFICULTY, UsageError, describe, readPath, readWholeNumber } from './arguments.ts';
import type { BatchOptions } from './tournament-batch.ts';
import { continuationAt, optionAt } from './usage.ts';

/** How many Matches a batch plays when the command line does not say: the DoD's own two hundred. */
export const DEFAULT_SEEDS = 200;

/** The seed a batch starts at when the command line does not say. */
export const DEFAULT_FIRST_SEED = 1;

/** How many Matches a batch plays at once when the command line does not say: every core it has. */
export const DEFAULT_WORKERS = availableParallelism();

/** A command line, read: either a batch to play, or a request for the usage. */
export type ParsedTournamentArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'tournament'; readonly options: BatchOptions };

/** Where `--help` starts a description: every option line pads its flag to this column. */
const DESCRIPTION_COLUMN = 23;

/** One option as this command's `--help` prints it, in the shared layout (`usage.ts`). */
const option = (flag: string, description: string): string =>
  optionAt(DESCRIPTION_COLUMN, flag, description);

/** A line continuing the option above it, starting where its description starts. */
const continuation = (text: string): string => continuationAt(DESCRIPTION_COLUMN, text);

/** The one description of what this command accepts, printed verbatim by `--help`. */
export const USAGE = `Usage: npm run tournament -- [options]

${[
  option('--seeds <n>', `How many Matches to play, on that many seeds (default ${String(DEFAULT_SEEDS)}).`),
  option('--first-seed <n>', 'The seed the batch starts at; the ones after it follow'),
  continuation(`(default ${String(DEFAULT_FIRST_SEED)}).`),
  option('--ticks <n>', 'The bound each Match is given, in whole ticks, at ten a'),
  continuation(`second (default ${String(HEADLESS_TICKS)}, three game years).`),
  option('--difficulty <name>', 'The level both AIs play at:'),
  continuation(`${DIFFICULTY_NAMES.join(', ')} (default ${DEFAULT_DIFFICULTY}).`),
  option('--workers <n>', 'How many Matches to play at once (default: this'),
  continuation(`machine's ${String(DEFAULT_WORKERS)} cores).`),
  option('--keep <dir>', "Write each Match's decisions to <dir>/<seed>.json."),
  option('--help, -h', 'Print this and play nothing.'),
].join('\n')}

Plays a batch of AI-vs-AI Matches — one per distinct seed — and prints one JSON
report of what they add up to: the win rate of each Faction, the median and the
spread of how long a Match lasts, the share of Matches the clock decided, and the
seed of every Match that was lopsided or stalled. This is where the plan's
definition of a balanced game is measured (PLAN §5), and the report is a function
of the seeds and the build alone, so it can be diffed between builds and gated on
by later work.

A Match's decisions are not in the report — one Match's log is some twenty
megabytes — so --keep writes them beside it, one file per seed, each the report
\`npm run match\` prints for that Match. Without --keep a Match is retrieved by
playing it again, which determinism makes exact: name the seed the report names,
at the --difficulty and --ticks it states, and the hash it gives that Match is
what proves the Match retrieved is the Match measured.

  npm run match -- --rules ai --seed 10 --difficulty centurio --ticks 25200

Exit codes: 0 the batch ran, 1 a Match of it could not be played, 2 the command
line was misused or a decision log could not be written.`;

/**
 * Reads a command line.
 *
 * @throws UsageError when a flag is unknown or repeated, a value is missing, a
 *   value is not the kind of thing that flag takes, the batch asks for no
 *   Matches, or the batch would run past the largest seed.
 */
export function parseTournamentArguments(argv: readonly string[]): ParsedTournamentArguments {
  const asked: Asked = {
    seeds: DEFAULT_SEEDS,
    firstSeed: DEFAULT_FIRST_SEED,
    ticks: HEADLESS_TICKS,
    difficulty: DEFAULT_DIFFICULTY,
    workers: DEFAULT_WORKERS,
    keep: null,
  };
  const given = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--help' || flag === '-h') return { kind: 'help' };
    if (flag === undefined) continue;
    if (!Object.hasOwn(OPTIONS, flag)) throw new UsageError(`${flag} is not an option this command knows`);

    if (given.has(flag)) throw new UsageError(`${flag} is given twice`);
    given.add(flag);

    const value = argv[index + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);

    index += 1;
    OPTIONS[flag]!(asked, value);
  }

  requireRoomFor(asked);

  return { kind: 'tournament', options: asked };
}

/** The options as the readers fill them in, before they leave as a `BatchOptions`. */
type Asked = { -readonly [Key in keyof BatchOptions]: BatchOptions[Key] };

/** Every flag this command knows, and how it reads its value: one table, one reader each. */
const OPTIONS: Readonly<Record<string, (asked: Asked, value: string) => void>> = {
  '--seeds': (asked, value) => {
    const seeds = readWholeNumber(value, '--seeds');

    if (seeds < 1) {
      throw new UsageError(`a tournament is at least one Match, and --seeds asked for ${describe(value)}`);
    }

    asked.seeds = seeds;
  },

  '--first-seed': (asked, value) => {
    const firstSeed = readWholeNumber(value, '--first-seed');

    if (firstSeed > MAX_SEED) {
      throw new UsageError(
        `--first-seed must be an unsigned 32-bit integer, at most ${String(MAX_SEED)}, got ${describe(value)}`,
      );
    }

    asked.firstSeed = firstSeed;
  },

  '--ticks': (asked, value) => {
    asked.ticks = readWholeNumber(value, '--ticks');
  },

  '--difficulty': (asked, value) => {
    if (!isDifficultyName(value)) {
      throw new UsageError(
        `--difficulty must name a level both AIs play at — ${DIFFICULTY_NAMES.join(', ')} — ` +
          `got ${describe(value)}`,
      );
    }

    asked.difficulty = value;
  },

  '--workers': (asked, value) => {
    const workers = readWholeNumber(value, '--workers');

    if (workers < 1) {
      throw new UsageError(
        `a batch plays at least one Match at a time, and --workers asked for ${describe(value)}`,
      );
    }

    asked.workers = workers;
  },

  '--keep': (asked, value) => {
    asked.keep = readPath(value, '--keep');
  },
};

/**
 * @throws UsageError when the batch would run past the largest seed there is.
 *
 * Refused here rather than discovered on the seed that could not be played: the
 * seeds of a batch are `firstSeed` upwards, so the last of them is known before
 * the first Match is played, and a batch that asked for a seed the generator cannot
 * make is a mistyped number rather than a broken Match.
 */
function requireRoomFor(asked: Asked): void {
  const last = asked.firstSeed + asked.seeds - 1;

  if (last > MAX_SEED) {
    throw new UsageError(
      `a batch of ${String(asked.seeds)} seeds starting at ${String(asked.firstSeed)} would run past the ` +
        `largest seed (${String(MAX_SEED)}): give it fewer seeds, or start it lower`,
    );
  }
}
