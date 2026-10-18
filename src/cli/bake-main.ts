/**
 * The bake step as a command: standard output, standard error, exit codes.
 *
 * Thin on purpose, like `main.ts` beside it: the baking is `bake.ts`, and what is
 * here is only which stream a line goes to and what the shell sees afterwards.
 * Standard output carries the table and nothing else, so it pipes; standard error
 * carries one `bake:`-prefixed line when something went wrong.
 */
import { USAGE, bakeAll, formatBake, parseBakeArguments } from './bake.ts';
import { exitCodeFor, formatFailure } from './failure.ts';

try {
  const parsed = parseBakeArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else {
    process.stdout.write(formatBake(bakeAll(parsed.out)));
  }
} catch (error: unknown) {
  process.stderr.write(`${formatFailure(error, 'bake', USAGE)}\n`);
  process.exitCode = exitCodeFor(error);
}
