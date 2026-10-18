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

/** The exit code a failure means: 2 for a misused command line, 1 for anything else. */
export function exitCodeFor(error: unknown): number {
  return error instanceof UsageError ? 2 : 1;
}
