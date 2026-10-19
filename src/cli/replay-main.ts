/**
 * The replay, as a command (E2).
 *
 * One record in, one verdict out: `npm run replay -- <record>` re-runs the Match
 * the record describes and prints whether it still happens. Standard output
 * carries the report and nothing else, so a CI job can gate on it; standard error
 * carries one line, prefixed `replay:`, when something went wrong.
 *
 * It is thin on purpose, like `main.ts` and `agent-main.ts`: reading the command
 * line is `replay-arguments.ts`, reading and writing records is `record.ts`, the
 * comparison is `replay.ts`, and everything except "which stream, which exit
 * code" is a function a test can call directly.
 *
 * The contract, which the tests hold it to:
 *
 * - **Exit 0** the record reproduced: the Match it describes is the Match this
 *   build plays.
 * - **Exit 1** the replay diverged from the record — the divergence is on
 *   standard error, naming the tick and quoting both hashes — or the Match broke
 *   an invariant on the way. The report is printed first, for the same reason a
 *   violated hash is printed after a Match's report: the interesting thing is
 *   what happened, and an exit code alone would make a reader run it again.
 * - **Exit 2** the command line was misused, or the file is not a record.
 */
import { USAGE, parseReplayArguments } from './replay-arguments.ts';
import { exitCodeFor, formatFailure } from './failure.ts';
import { readRecordFile } from './record.ts';
import { formatReplayReport, replayRecord, requireReproduced } from './replay.ts';

try {
  const parsed = parseReplayArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else {
    const report = replayRecord(readRecordFile(parsed.path));

    process.stdout.write(formatReplayReport(report));
    requireReproduced(report);
  }
} catch (error: unknown) {
  process.stderr.write(`${formatFailure(error, 'replay', USAGE)}\n`);
  process.exitCode = exitCodeFor(error);
}
