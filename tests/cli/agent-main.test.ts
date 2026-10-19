import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MatchReport } from '../../src/cli/report';
import type { Command } from '../../src/sim/command';
import { replayCommands } from '../../src/sim/replay';
import { siegeMatchRules } from '../../src/sim/siege';

/**
 * The command a human or a CI job runs, through the process: its exit code, its
 * standard output and its standard error (E1).
 *
 * The Match itself is `agent.test.ts`'s, played in this process against a real
 * child; this is the thin shell around it — the report on standard output, the
 * log on disk, and the three exit codes `npm run match` also uses.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = fileURLToPath(new URL('../../src/cli/agent-main.ts', import.meta.url));
const AGENT = fileURLToPath(new URL('../../examples/agent.ts', import.meta.url));
const SILENT = fileURLToPath(new URL('./agents/silent.ts', import.meta.url));

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function agent(...args: readonly string[]): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The report the command printed, so a failure says why it could not be read. */
function reportOf(result: Ran): MatchReport {
  return JSON.parse(result.stdout) as MatchReport;
}

describe('the agent command', () => {
  it('plays a whole Match with an outside process and prints the report on standard output', () => {
    const ran = agent('--agent', AGENT, '--seed', '7', '--opponent', 'idle');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');

    const report = reportOf(ran);
    expect(report).toMatchObject({ seed: 7, outcome: 'victory', winner: 'rome' });
    expect(report.reason).toContain('the carthage Stronghold fell to an assault');
    expect(report.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(report.agent).toMatchObject({ faction: 'rome', opponent: 'idle', status: 'played' });
  }, 120_000);

  it('exits 0 when the agent stopped, because a Match was still played', () => {
    const ran = agent('--agent', SILENT, '--ticks', '100', '--deadline', '100');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(reportOf(ran)).toMatchObject({
      ticks: 100,
      outcome: 'clock',
      agent: { status: 'stopped', stoppedBy: 'timeout' },
    });
  }, 60_000);

  it('writes the Command log with --log: the file a replay is made of', () => {
    const directory = mkdtempSync(join(tmpdir(), 'spqr-log-'));
    const log = join(directory, 'match.jsonl');
    const ran = agent('--agent', AGENT, '--seed', '7', '--opponent', 'idle', '--log', log);

    expect(ran.status).toBe(0);

    const report = reportOf(ran);
    const entries = readFileSync(log, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { readonly tick: number; readonly command: Command });

    expect(entries).toHaveLength(report.commands ?? 0);
    expect(entries[0]).toMatchObject({ tick: 0, command: { faction: 'rome' } });

    const replayed = replayCommands({
      seed: report.seed,
      rules: siegeMatchRules,
      log: entries,
      ticks: report.ticks,
      everyTicks: report.ticks,
    });

    expect(replayed.checkpoints.at(-1)?.hash).toBe(report.hash);
  }, 120_000);

  it('prints the usage on --help, and plays nothing', () => {
    const ran = agent('--help');

    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('Usage: npm run agent -- --agent <file> [options]');
    expect(ran.stdout).toContain('--opponent <name>');
  });

  it('exits 2 when the command line asks for no agent at all', () => {
    const ran = agent();

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('agent: --agent is required');
    expect(ran.stderr).toContain('Usage: npm run agent');
  });

  it('exits 2 when --agent names a file that is not there, because a typo is not a crash', () => {
    const ran = agent('--agent', join(ROOT, 'no-such-agent.ts'));

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('--agent must name a file that exists');
  });

  it('exits 2 when a flag is not one this command knows', () => {
    const ran = agent('--agent', AGENT, '--opponents', 'ai');

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('--opponents is not an option this command knows');
  });

  it('exits 1 when the Match does not end on the hash it was required to', () => {
    const ran = agent('--agent', AGENT, '--seed', '7', '--opponent', 'idle', '--ticks', '200', '--expect-hash', '0000000000000000');

    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('the Match is not the Match that was expected');
    expect(ran.stdout).not.toBe('');
  }, 60_000);
});
