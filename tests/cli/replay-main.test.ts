import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MatchReport } from '../../src/cli/report';
import type { ReplayReport } from '../../src/cli/replay';

/**
 * `npm run replay`, through the process: its exit code, its standard output and
 * its standard error (E2).
 *
 * The comparison itself is `replay.test.ts`'s, in this process; what is under
 * test here is the command line around it, and the one thing the ticket asks of
 * the whole chain — that a Match played and recorded by one command replays in
 * another, with no browser, no Controller and no video anywhere.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const REPLAY = fileURLToPath(new URL('../../src/cli/replay-main.ts', import.meta.url));
const MATCH = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));
const AGENT = fileURLToPath(new URL('../../src/cli/agent-main.ts', import.meta.url));
const RECRUITER = fileURLToPath(new URL('./agents/recruiter.ts', import.meta.url));

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs one of the CLI's commands through the same Node that is running the tests. */
function run(cli: string, ...args: readonly string[]): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** A directory of this test's own, so a record never lands in the repository. */
function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'spqr-replay-'));
}

/** The report the command printed, so a failure says why it could not be read. */
function reportOf(result: Ran): ReplayReport {
  return JSON.parse(result.stdout) as ReplayReport;
}

/** A record of a short march Match, written by the command that plays it. */
function recordedMatch(): { readonly path: string; readonly report: MatchReport } {
  const path = join(workspace(), 'march.json');
  const played = run(MATCH, '--rules', 'march', '--seed', '1', '--ticks', '40', '--record', path);

  expect(played.status).toBe(0);
  expect(played.stderr).toBe('');

  return { path, report: JSON.parse(played.stdout) as MatchReport };
}

describe('the replay command', () => {
  for (const difficulty of ['tiro', 'imperator'] as const) {
    it(`records and replays an AI Match with ${difficulty} raid rules`, () => {
      const path = join(workspace(), `ai-${difficulty}.json`);
      const played = run(MATCH, '--rules', 'ai', '--seed', '1', '--ticks', '20', '--difficulty', difficulty, '--record', path);
      expect(played.stderr).toBe('');
      expect(played.status).toBe(0);
      expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ difficulty });
      const replayed = run(REPLAY, path);
      expect(replayed.stderr).toBe('');
      expect(replayed.status).toBe(0);
      expect(reportOf(replayed).verdict).toBe('reproduced');
    }, 60_000);
  }

  it('records and replays the chosen difficulty when an external agent plays', () => {
    const path = join(workspace(), 'agent-imperator.json');
    const played = run(AGENT, '--agent', RECRUITER, '--seed', '1', '--opponent', 'idle',
      '--difficulty', 'imperator', '--ticks', '20', '--record', path);
    expect(played.stderr).toBe('');
    expect(played.status).toBe(0);
    expect(JSON.parse(readFileSync(path, 'utf8'))).toMatchObject({ difficulty: 'imperator' });
    const replayed = run(REPLAY, path);
    expect(replayed.stderr).toBe('');
    expect(replayed.status).toBe(0);
    expect(reportOf(replayed).verdict).toBe('reproduced');
  }, 60_000);
  it('replays a recorded Match and reports that it reproduced', () => {
    const { path, report } = recordedMatch();
    const ran = run(REPLAY, path);

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');

    const replayed = reportOf(ran);
    expect(replayed).toMatchObject({ seed: 1, rules: 'march', ticks: 40, verdict: 'reproduced' });
    expect(replayed.hash).toBe(report.hash);
    expect(replayed.departure).toBeUndefined();
  }, 60_000);

  it('replays a Match recorded while an outside process played one side', () => {
    const path = join(workspace(), 'agent.json');
    const played = run(
      AGENT,
      '--agent',
      RECRUITER,
      '--seed',
      '1',
      '--opponent',
      'idle',
      '--ticks',
      '300',
      '--record',
      path,
    );

    expect(played.status).toBe(0);
    expect(played.stderr).toBe('');

    const ran = run(REPLAY, path);
    expect(ran.status).toBe(0);
    expect(reportOf(ran)).toMatchObject({ seed: 1, rules: 'siege', ticks: 300, verdict: 'reproduced' });
  }, 120_000);

  it('exits 1, quoting both hashes, when the replay parts from the record', () => {
    const { path } = recordedMatch();
    const record = JSON.parse(readFileSync(path, 'utf8')) as {
      checkpoints: { tick: number; hash: string }[];
    };
    const changed = {
      ...record,
      checkpoints: record.checkpoints.map((checkpoint, index) =>
        index === 2 ? { tick: checkpoint.tick, hash: '0'.repeat(16) } : checkpoint,
      ),
    };
    writeFileSync(path, JSON.stringify(changed));

    const ran = run(REPLAY, path);

    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('replay: the record and this replay diverged at tick 20');
    expect(ran.stderr).toContain('the record has 0000000000000000');
    expect(ran.stderr).toContain(record.checkpoints[2]?.hash ?? 'unreachable');
    expect(reportOf(ran)).toMatchObject({
      verdict: 'diverged',
      departure: { kind: 'hashes', divergence: { tick: 20, agreedAt: 10 } },
    });
  }, 60_000);

  it('prints the usage on --help, and replays nothing', () => {
    const ran = run(REPLAY, '--help');

    expect(ran.status).toBe(0);
    expect(ran.stdout).toContain('Usage: npm run replay -- <record>');
  });

  it('exits 2 when the command line names no record', () => {
    const ran = run(REPLAY);

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('replay: the record to replay is required');
    expect(ran.stderr).toContain('Usage: npm run replay');
  });

  it('exits 2 when there is no file where the record should be', () => {
    const ran = run(REPLAY, join(ROOT, 'no-such-record.json'));

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('replay: there is no record at');
    expect(ran.stdout).toBe('');
  });

  it('exits 2 when the file is not a record, naming the field it cannot believe', () => {
    const path = join(workspace(), 'not-a-record.json');
    writeFileSync(path, '{"seed": "seven"}');

    const ran = run(REPLAY, path);

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('replay: record.seed is not an unsigned 32-bit integer');
  });
});

describe('recording a Match from the command that plays it', () => {
  it('exits 2 when --record asks for a file that cannot be written', () => {
    const ran = run(
      MATCH,
      '--seed',
      '1',
      '--ticks',
      '10',
      '--record',
      join(ROOT, 'no-such-directory', 'record.json'),
    );

    expect(ran.status).toBe(2);
    expect(ran.stderr).toContain('cli: the record could not be written');
  }, 60_000);
});
