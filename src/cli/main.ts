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
 * Match is `run.ts`, printing a map is `dump.ts`, and writing the report is
 * `report.ts`, so that everything except "which stream, which exit code" is a
 * function a test can call directly.
 *
 * The contract, which the tests hold it to:
 *
 * - **Standard output** carries the report and nothing else, so `| jq` works —
 *   or, with `--map`, the map and nothing else, so the grid can be read and
 *   diffed, or, with `--record`, nothing but the report while the record goes to
 *   the file it named.
 * - **Standard error** carries one message, prefixed `cli:`, when something went
 *   wrong; the usage accompanies a misuse.
 * - **Exit 0** the Match ran; **1** a game invariant was violated, the expected
 *   hash included; **2** the command line was misused — the same three codes
 *   `scripts/guard.mjs` uses, so a wrapper script can treat them alike.
 *
 * A violated hash is reported *after* the report is printed: the interesting
 * number is the one the Match ended on, and a reader who gets only an exit code
 * has to run it again to find out. A record is written before that check for the
 * same reason — a Match that failed its hash is exactly the Match somebody wants
 * to replay — and it is written before the process exits either way.
 */
import { parseArguments, USAGE } from './arguments.ts';
import { exitCodeFor, formatFailure } from './failure.ts';
import { formatMap } from './dump.ts';
import { recordOf, writeRecord } from './record.ts';
import { formatReport, reportOf } from './report.ts';
import { playMatch, requireExpectedHash } from './run.ts';

try {
  const parsed = parseArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else if (parsed.kind === 'map') {
    process.stdout.write(formatMap(parsed.seed));
  } else {
    const run = playMatch(parsed.options);
    process.stdout.write(formatReport(reportOf(run)));

    if (parsed.options.record !== null) {
      writeRecord(parsed.options.record, recordOf(run, parsed.options.rules,
        parsed.options.rules === 'ai' ? parsed.options.difficulty : undefined));
    }

    requireExpectedHash(run, parsed.options);
  }
} catch (error: unknown) {
  process.stderr.write(`${formatFailure(error, 'cli', USAGE)}\n`);
  process.exitCode = exitCodeFor(error);
}
