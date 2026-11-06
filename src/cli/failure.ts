/**
 * What a command says when it fails.
 *
 * The two commands in `cli/` fail in the same two ways — the command line was
 * misused, or the work itself went wrong — and they must answer the same way:
 * one line on standard error, prefixed with the command's name, with the usage
 * after it when the command line was the problem. That is a contract a wrapper
 * script reads, so it lives in one place rather than in two entries that would
 * drift the first time either is edited.
 */
import { UsageError } from './arguments.ts';

/**
 * The input a command was given is not the thing it claims to be.
 *
 * A command line is one such input and a file is another: a record attached to an
 * issue is not a record because a command says it is one, so the reader refuses it
 * in the same breath as a mistyped flag, and the CLI exits 2 for both. Deriving
 * `Error` rather than returning a result for the ordinary reason: there is nothing
 * to carry on with, and nothing a caller could do but fix the input.
 */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

/**
 * One line about what went wrong, and the usage when nothing could have been run.
 *
 * @param error What was thrown.
 * @param command The name a reader sees, e.g. `match` or `bake`.
 * @param usage The command's usage text.
 */
export function formatFailure(error: unknown, command: string, usage: string): string {
  const message = error instanceof Error ? error.message : String(error);

  return error instanceof UsageError ? `${command}: ${message}\n\n${usage}` : `${command}: ${message}`;
}

/**
 * The exit code a failure means: 2 for an input that cannot be used, 1 for
 * anything else.
 *
 * A command line and a file are the same mistake from the caller's side — "what
 * you handed me is not what I asked for" — so they come to the same code, and a
 * wrapper script treats them alike. Everything else is a Match that broke, which
 * is what 1 is for.
 */
export function exitCodeFor(error: unknown): number {
  return error instanceof UsageError || error instanceof InputError ? 2 : 1;
}
