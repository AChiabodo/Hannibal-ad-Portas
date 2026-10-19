/**
 * What the agent command's command line means: which agent, on which side of
 * which Match, and nothing else (E1).
 *
 * The same discipline as `arguments.ts`, for the same reason: a harness whose
 * front door guesses is a harness whose results cannot be trusted, so a flag
 * nobody knows, a value that cannot be read back and a missing `--agent` are all
 * refused by name rather than absorbed. The readers are shared with the Match
 * command rather than copied, so a `--seed` means the same thing on both.
 *
 * Nothing here touches the filesystem or a process: the arguments arrive as
 * strings and leave as a value, so every refusal below is a test. Whether the
 * file `--agent` names exists is `agent-main.ts`'s question, because it is the
 * one that can open it.
 */
import { DEFAULT_DEADLINE_MS, DEFAULT_DECISION_TICKS } from './protocol.ts';
import { FACTIONS, isFaction, type Faction } from '../sim/faction.ts';
import { DIFFICULTY } from '../ai/difficulty.ts';
import type { DifficultyName } from '../ai/difficulty.ts';
import { HEADLESS_TICKS } from '../sim/season.ts';
import {
  DEFAULT_SEED,
  UsageError,
  describe,
  readSeed,
  readStateHash,
  readWholeNumber,
} from './arguments.ts';
import type { Opponent } from './agent.ts';

/** The opponents this command can put on the other side of a Match. */
export const OPPONENTS: readonly Opponent[] = ['ai', 'idle'];

/** The Faction an agent plays when the command line does not say. */
export const DEFAULT_FACTION: Faction = 'rome';

/** The opponent an agent meets when the command line does not say: the built-in AI. */
export const DEFAULT_OPPONENT: Opponent = 'ai';

/** The difficulty the built-in AI plays at when the command line does not say. */
export const DEFAULT_DIFFICULTY: DifficultyName = 'centurio';

/** What one command line asked for: an agent, a Match, and how long it may take. */
export interface AgentRunOptions {
  /** The Match's seed, and with the Command log the whole reproducibility of the run. */
  readonly seed: number;

  /** The longest the Match may run, in whole ticks. The bound always terminates it. */
  readonly ticks: number;

  /** The Faction the external process plays. */
  readonly faction: Faction;

  /** Who the harness plays on the other side. */
  readonly opponent: Opponent;

  /** The agent's file, run by this same Node. */
  readonly script: string;

  /** How often the agent is asked, in ticks. */
  readonly decisionTicks: number;

  /** How long one reply may take, in milliseconds. */
  readonly deadlineMs: number;

  /** The built-in AI's difficulty, when the opponent is the AI. */
  readonly difficulty: DifficultyName;

  /** Where to write the Command log, or `null` to write none. */
  readonly log: string | null;

  /** The state hash the Match is required to end on, or `null` to accept any. */
  readonly expectedHash: string | null;
}

/** A command line, read: either a Match to play, or a request for the usage. */
export type ParsedAgentArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'run'; readonly options: AgentRunOptions };

/** Where a description starts: every option line pads its flag to this column. */
const DESCRIPTION_COLUMN = 26;

/** One option as `--help` prints it: the flag, then its description in the shared column. */
function option(flag: string, description: string): string {
  return `  ${flag.padEnd(DESCRIPTION_COLUMN - 2)}${description}`;
}

/** A line continuing the option above it, starting where that option's description starts. */
function continuation(text: string): string {
  return `${' '.repeat(DESCRIPTION_COLUMN)}${text}`;
}

/** The one description of what this command accepts, printed verbatim by `--help`. */
export const USAGE = `Usage: npm run agent -- --agent <file> [options]

${[
  option('--agent <file>', 'The agent to play against: a file run by this same Node,'),
  continuation('whose standard input and output carry the protocol. Required.'),
  option('--seed <n>', `The Match's seed: an unsigned 32-bit integer (default ${DEFAULT_SEED}).`),
  option('--ticks <n>', `The tick bound (default ${HEADLESS_TICKS}, three game years).`),
  option('--faction <name>', `The Faction the agent plays: ${FACTIONS.join(' or ')} (default ${DEFAULT_FACTION}).`),
  option('--opponent <name>', `Who plays the other Faction: ${OPPONENTS.join(' or ')} (default ${DEFAULT_OPPONENT}).`),
  option('--difficulty <name>', `The AI's difficulty: ${Object.keys(DIFFICULTY).join(', ')}`),
  continuation(`(default ${DEFAULT_DIFFICULTY}).`),
  option('--decision-ticks <n>', `How often the agent is asked, in ticks (default ${DEFAULT_DECISION_TICKS}).`),
  option('--deadline <ms>', `How long one reply may take, in ms (default ${DEFAULT_DEADLINE_MS}).`),
  option('--log <file>', 'Write the Match\'s Command log here, one JSON line per Command.'),
  option('--expect-hash <hex>', 'Fail unless the Match ends on this 16-digit state hash.'),
  option('--help, -h', 'Print this and play nothing.'),
].join('\n')}

Plays one whole Match with an external process on one side, speaking the
protocol in docs/PROTOCOL.md over its standard input and output, prints a JSON
report of what happened on standard output, and writes the Command log with
--log. A malformed reply, a reply that never arrives and a process that dies are
all a Player who stopped playing: the Match carries on without it, the report
says so, and the command still exits 0.

Exit codes: 0 the Match ran, 1 an invariant was violated, 2 the command line was
misused.`;

/** Reads a command line. @throws UsageError when it is not one this command can run. */
export function parseAgentArguments(argv: readonly string[]): ParsedAgentArguments {
  const asked: Asked = {
    seed: DEFAULT_SEED,
    ticks: HEADLESS_TICKS,
    faction: DEFAULT_FACTION,
    opponent: DEFAULT_OPPONENT,
    difficulty: DEFAULT_DIFFICULTY,
    script: null,
    decisionTicks: DEFAULT_DECISION_TICKS,
    deadlineMs: DEFAULT_DEADLINE_MS,
    log: null,
    expectedHash: null,
  };
  const given = new Set<string>();

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];

    if (flag === '--help' || flag === '-h') return { kind: 'help' };
    if (flag === undefined) continue;

    const read = OPTIONS[flag];
    if (read === undefined) throw new UsageError(`${flag} is not an option this command knows`);
    if (given.has(flag)) throw new UsageError(`${flag} is given twice`);

    given.add(flag);

    const value = argv[index + 1];
    if (value === undefined) throw new UsageError(`${flag} needs a value`);
    index += 1;
    read(asked, value);
  }

  if (asked.script === null) {
    throw new UsageError('--agent is required: it names the file that plays the Match');
  }

  return {
    kind: 'run',
    options: {
      seed: asked.seed,
      ticks: asked.ticks,
      faction: asked.faction,
      opponent: asked.opponent,
      difficulty: asked.difficulty,
      script: asked.script,
      decisionTicks: asked.decisionTicks,
      deadlineMs: asked.deadlineMs,
      log: asked.log,
      expectedHash: asked.expectedHash,
    },
  };
}

/** The options as the readers fill them in, before they leave as an `AgentRunOptions`. */
interface Asked {
  seed: number;
  ticks: number;
  faction: Faction;
  opponent: Opponent;
  difficulty: DifficultyName;
  script: string | null;
  decisionTicks: number;
  deadlineMs: number;
  log: string | null;
  expectedHash: string | null;
}

/**
 * Every flag this command knows, and how it reads its value.
 *
 * A table rather than a chain of `if`s, so an option cannot be understood by the
 * parser and forgotten by a reader: the flag is looked up before its value is,
 * which is what makes `--agents` a flag nobody knows rather than a value that
 * never arrived.
 */
const OPTIONS: Readonly<Record<string, (asked: Asked, value: string) => void>> = {
  '--agent': (asked, value) => {
    asked.script = value;
  },
  '--seed': (asked, value) => {
    asked.seed = readSeed(value);
  },
  '--ticks': (asked, value) => {
    asked.ticks = readWholeNumber(value, '--ticks');
  },
  '--faction': (asked, value) => {
    asked.faction = readFaction(value);
  },
  '--opponent': (asked, value) => {
    asked.opponent = readOpponent(value);
  },
  '--difficulty': (asked, value) => {
    asked.difficulty = readDifficulty(value);
  },
  '--decision-ticks': (asked, value) => {
    asked.decisionTicks = readPositive(value, '--decision-ticks');
  },
  '--deadline': (asked, value) => {
    asked.deadlineMs = readPositive(value, '--deadline');
  },
  '--log': (asked, value) => {
    asked.log = value;
  },
  '--expect-hash': (asked, value) => {
    asked.expectedHash = readStateHash(value);
  },
};

/** @throws UsageError when the value is not one of the two Factions. */
function readFaction(value: string): Faction {
  if (!isFaction(value)) {
    throw new UsageError(`--faction must be one of ${FACTIONS.join(' or ')}, got ${describe(value)}`);
  }

  return value;
}

/** @throws UsageError when the value is not an opponent this command can play. */
function readOpponent(value: string): Opponent {
  const opponent = OPPONENTS.find((candidate) => candidate === value);
  if (opponent === undefined) {
    throw new UsageError(`--opponent must be one of ${OPPONENTS.join(' or ')}, got ${describe(value)}`);
  }

  return opponent;
}

/** @throws UsageError when the value is not one of the AI's difficulty levels. */
function readDifficulty(value: string): DifficultyName {
  const name = Object.keys(DIFFICULTY).find((candidate) => candidate === value);
  if (name === undefined) {
    throw new UsageError(
      `--difficulty must be one of ${Object.keys(DIFFICULTY).join(', ')}, got ${describe(value)}`,
    );
  }

  return name as DifficultyName;
}

/** @throws UsageError when the value is not a whole number of at least one. */
function readPositive(value: string, flag: string): number {
  const number = readWholeNumber(value, flag);
  if (number < 1) throw new UsageError(`${flag} must be at least 1, got ${value}`);

  return number;
}
