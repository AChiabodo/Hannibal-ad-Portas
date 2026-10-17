/**
 * The headless Match, as a command.
 *
 * This is the entry point the rest of the project is tested through: one command
 * plays a whole Match with no browser, no human and no AI, prints a JSON report
 * of what happened and why it ended, and exits non-zero when a game invariant is
 * violated (PLAN §7 A4, ADR-0003). Nothing about the web page is involved: the
 * simulation is Node code, and this command is what plays it.
 *
 * It is thin on purpose. Reading the command line is `arguments.ts`, playing the
 * Match is `run.ts`, and writing the report is `report.ts`, so that everything
 * except "which stream, which exit code" is a function a test can call directly.
 *
 * The contract, which the tests hold it to:
 *
 * - **Standard output** carries the report and nothing else, so `| jq` works.
 * - **Standard error** carries one message, prefixed `cli:`, when something went
 *   wrong; the usage accompanies a misuse.
 * - **Exit 0** the Match ran; **1** a game invariant was violated, the expected
 *   hash included; **2** the command line was misused — the same three codes
 *   `scripts/guard.mjs` uses, so a wrapper script can treat them alike.
 *
 * A violated hash is reported *after* the report is printed: the interesting
 * number is the one the Match ended on, and a reader who gets only an exit code
 * has to run it again to find out.
 */
import { parseArguments, USAGE, UsageError } from './arguments.ts';
import { formatReport, reportOf } from './report.ts';
import { playMatch, requireExpectedHash } from './run.ts';

try {
  const parsed = parseArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else {
    const run = playMatch(parsed.options);
    process.stdout.write(formatReport(reportOf(run)));
    requireExpectedHash(run, parsed.options);
  }
} catch (error: unknown) {
  process.stderr.write(`${failure(error)}\n`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

/** One readable line about what went wrong, with the usage when the command line was the problem. */
function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  return error instanceof UsageError ? `cli: ${message}\n\n${USAGE}` : `cli: ${message}`;
}
