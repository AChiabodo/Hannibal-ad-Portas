/**
 * What the replay command's command line means: one record, and nothing else (E2).
 *
 * The same discipline as `arguments.ts` and `agent-arguments.ts`, for the same
 * reason: a harness whose front door guesses is a harness whose results cannot be
 * trusted. There is only one thing to name here — the file `--record` wrote — so
 * the whole surface is a positional path, `--help`, and a sentence for everything
 * else, and the file's own content is `record.ts`'s to read.
 *
 * Nothing here touches the filesystem or a process: the arguments arrive as
 * strings and leave as a value, so every refusal below is a test.
 */
import { UsageError, describe } from './arguments.ts';

/** A command line, read: either a record to replay, or a request for the usage. */
export type ParsedReplayArguments =
  | { readonly kind: 'help' }
  | { readonly kind: 'replay'; readonly path: string };

/** The one description of what this command accepts, printed verbatim by `--help`. */
export const USAGE = `Usage: npm run replay -- <record>

  --help, -h            Print this and replay nothing.

Replays a Match recorded by \`npm run match -- --record <file>\` or
\`npm run agent -- --record <file>\`: the same seed, the same Command log, and
every state hash the record was made with. Prints a JSON report of the replay on
standard output — the ending this build reaches, the hash this run reached, and
whether the two agree.

A departure is reported at the first checkpoint whose hashes disagree, quoting
both, or at the ending when every hash agrees and the rules end the Match
differently. Nothing in a replay needs a browser, a Controller or a video: a Match
is a seed and a Command log, so a bug report from an external agent is a small text
file that runs anywhere this build runs.

Exit codes: 0 the record reproduced, 1 the replay parted from the record — the
hashes, or the ending — 2 the command line was misused or the file is not a record.`;

/** Reads a command line. @throws UsageError when it is not one this command can run. */
export function parseReplayArguments(argv: readonly string[]): ParsedReplayArguments {
  let path: string | null = null;

  for (const argument of argv) {
    if (argument === '--help' || argument === '-h') return { kind: 'help' };

    if (argument.startsWith('-')) {
      throw new UsageError(`${argument} is not an option this command knows`);
    }

    if (path !== null) {
      throw new UsageError(
        'this command replays one record at a time, and it was given two: ' +
          `${describe(path)} and ${describe(argument)}`,
      );
    }

    if (argument === '') throw new UsageError('the record to replay cannot be an empty path');

    path = argument;
  }

  if (path === null) {
    throw new UsageError(
      'the record to replay is required: name the file that `npm run match -- --record` wrote',
    );
  }

  return { kind: 'replay', path };
}
