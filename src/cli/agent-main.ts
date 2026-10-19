/**
 * A whole Match, played by a process that is not this codebase (E1).
 *
 * This is the command the ticket is about: `npm run agent -- --agent <file>`
 * starts the agent, speaks the protocol in `docs/PROTOCOL.md` to it over its
 * standard input and output, and plays the Match to its end. Standard output
 * carries the JSON report and nothing else — the protocol lives on the *agent's*
 * pipes, not on this command's — so the report still pipes into `jq`, and
 * `--log` writes the Command log a replay is made of.
 *
 * It is thin on purpose, like `main.ts`: reading the command line is
 * `agent-arguments.ts`, playing the Match is `agent.ts`, the messages are
 * `protocol.ts`, and writing the report is `report.ts`. Everything except "which
 * stream, which exit code" is a function a test can call directly, which is why
 * the tests that play a Match do not spawn this command twice.
 *
 * Three outcomes, and only one of them is about the agent:
 *
 * - **Exit 0** a Match was played. It does not matter whether the agent won,
 *   played badly, timed out or died: a Player who stops is a Player who stops,
 *   and the report says which happened. A stopped agent is not a broken build.
 * - **Exit 1** an invariant of the game was violated, the expected hash
 *   included — the same numbers `npm run match` uses, so one wrapper can read
 *   both.
 * - **Exit 2** the command line was misused, or `--agent` names a file that is
 *   not there. A typo is not an agent that crashed.
 */
import { existsSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { USAGE, parseAgentArguments } from './agent-arguments.ts';
import { UsageError, describe } from './arguments.ts';
import { playAgentMatch } from './agent.ts';
import { formatFailure, exitCodeFor } from './failure.ts';
import { requireExpectedHash } from './run.ts';
import { agentReportOf, formatCommandLog, formatReport } from './report.ts';

try {
  const parsed = parseAgentArguments(process.argv.slice(2));

  if (parsed.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
  } else {
    const script = requireScript(parsed.options.script);
    const run = await playAgentMatch({ ...parsed.options, script });

    process.stdout.write(formatReport(agentReportOf(run)));
    if (parsed.options.log !== null) writeFileSync(parsed.options.log, formatCommandLog(run.log));

    requireExpectedHash(run, parsed.options);
  }
} catch (error: unknown) {
  process.stderr.write(`${formatFailure(error, 'agent', USAGE)}\n`);
  process.exitCode = exitCodeFor(error);
}

/**
 * The agent's file, as a path this command can hand to Node.
 *
 * A missing file is a misuse of the command line and not a crashed agent: an
 * agent that cannot be started has not played anything, and reporting it as a
 * Player who stopped would hide a typo behind a plausible story.
 *
 * @throws UsageError when there is no file at that path.
 */
function requireScript(script: string): string {
  const path = resolve(script);

  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new UsageError(`--agent must name a file that exists, and there is none at ${describe(script)}`);
  }

  return path;
}
