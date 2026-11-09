/**
 * The tournament, as a command (E3).
 *
 * One batch in, one report out: `npm run tournament` plays an AI-vs-AI Match on
 * each seed of a batch and prints the balance report that is the sum of them.
 * Standard output carries the report and nothing else, so a CI job can gate on it
 * with `jq`; standard error carries one line, prefixed `tournament:`, when
 * something went wrong.
 *
 * It is thin on purpose, like `main.ts`, `agent-main.ts` and `replay-main.ts`:
 * reading the command line is `tournament-arguments.ts`, playing the batch is
 * `tournament-batch.ts`, and what it adds up to is `tournament.ts`, so everything
 * except "which stream, which exit code" is a function a test can call directly.
 *
 * The contract, which the tests hold it to:
 *
 * - **Exit 0** the batch ran, however the game turned out. A report is a
 *   measurement, and a measurement of an unbalanced game is a report like any
 *   other: what to do about it is F1's question, not this command's.
 * - **Exit 1** a Match of the batch could not be played, naming its seed.
 * - **Exit 2** the command line was misused, or a decision log could not be
 *   written where `--keep` asked for it.
 *
 * A batch of any size takes minutes, so a run in a terminal says how far it has
 * got — on standard error, which is where a run's own chatter belongs, and only
 * when standard error is a terminal. A pipe or a CI log gets the report and
 * nothing else, which keeps the rule that standard output is the document and
 * the error stream is for failures: progress is not part of either.
 */
import { exitCodeFor, formatFailure } from './failure.ts';
import { formatTournamentReport } from './tournament.ts';
import { USAGE, parseTournamentArguments } from './tournament-arguments.ts';
import { runTournament } from './tournament-batch.ts';

try {
  const parsed = parseTournamentArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else {
    process.stdout.write(formatTournamentReport(await runTournament(parsed.options, progressBar())));
  }
} catch (error: unknown) {
  process.stderr.write(`${formatFailure(error, 'tournament', USAGE)}\n`);
  process.exitCode = exitCodeFor(error);
}

/**
 * How far the batch has got, for a reader watching a terminal — or nothing at all,
 * when nobody is watching one.
 *
 * One line, rewritten in place and finished with a newline, so a three-minute
 * batch is visibly working rather than apparently hung, and so the report that
 * follows it on standard output starts on a line of its own. The padding is what
 * stops `99 of 200` leaving the tail of `100 of 200` behind it.
 */
function progressBar(): ((done: number, total: number) => void) | undefined {
  if (!process.stderr.isTTY) return undefined;

  let written = 0;

  return (done, total) => {
    const line = `tournament: ${String(done)} of ${String(total)} Matches played`;
    process.stderr.write(`\r${line.padEnd(written)}${done === total ? '\n' : ''}`);
    written = line.length;
  };
}
