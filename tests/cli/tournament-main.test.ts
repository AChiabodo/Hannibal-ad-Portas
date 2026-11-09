import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { TournamentReport } from '../../src/cli/tournament';

/**
 * `npm run tournament`, through the process: its exit code, its standard output
 * and its standard error (E3).
 *
 * The report itself is `tournament.test.ts`'s and the batch is
 * `tournament-batch.test.ts`'s, in this process; what is under test here is the
 * command line around them, and the one contract the ticket asks of it as a
 * command — that one invocation plays a batch of Matches on distinct seeds and
 * prints a report a machine can read, with nothing else on the stream.
 *
 * Every batch here is a handful of Matches of forty ticks: this file is about the
 * command, and a two-hundred-Match balance run is what the command is *for* and
 * not what a test suite should sit through.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const TOURNAMENT = fileURLToPath(new URL('../../src/cli/tournament-main.ts', import.meta.url));
const MATCH = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));
const REPLAY = fileURLToPath(new URL('../../src/cli/replay-main.ts', import.meta.url));

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Runs a command through the same Node that is running the tests. */
function ran(cli: string, ...args: readonly string[]): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [cli, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 120_000,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Runs `npm run tournament`. */
function run(...args: readonly string[]): Ran {
  return ran(TOURNAMENT, ...args);
}

/** Runs `npm run match`. */
function match(...args: readonly string[]): Ran {
  return ran(MATCH, ...args);
}

/** The report the command printed, so a failure says why it could not be read. */
function reportOf(result: Ran): TournamentReport {
  return JSON.parse(result.stdout) as TournamentReport;
}

/** A directory of this test's own, so a decision log never lands in the repository. */
function workspace(): string {
  return mkdtempSync(join(tmpdir(), 'spqr-tournament-main-'));
}

describe('the tournament command', () => {
  it('retrieves and replays a tournament Match with the same difficulty', () => {
    const batch = reportOf(run('--seeds', '1', '--first-seed', '2', '--ticks', '20', '--difficulty', 'imperator', '--workers', '1'));
    const record = join(workspace(), 'tournament-match.json');
    const retrieved = match('--rules', 'ai', '--seed', '2', '--ticks', '20', '--difficulty', 'imperator',
      '--expect-hash', batch.matches[0]!.hash, '--record', record);
    expect(retrieved.stderr).toBe('');
    expect(retrieved.status).toBe(0);
    expect(JSON.parse(readFileSync(record, 'utf8'))).toMatchObject({ difficulty: 'imperator' });
    const replayed = ran(REPLAY, record);
    expect(replayed.stderr).toBe('');
    expect(replayed.status).toBe(0);
    expect(JSON.parse(replayed.stdout)).toMatchObject({ verdict: 'reproduced', hash: batch.matches[0]!.hash });
  }, 60000);
  it('plays a batch of Matches on distinct seeds and prints one report of it', () => {
    const ran = run('--seeds', '3', '--first-seed', '11', '--ticks', '40', '--workers', '2');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');

    const report = reportOf(ran);
    expect(report.matches.map((match) => match.seed)).toEqual([11, 12, 13]);
    expect(report).toMatchObject({ seeds: { first: 11, count: 3 }, bound: 40, difficulty: 'centurio' });
    expect(report.decidedByClock).toEqual({ matches: 3, share: 1 });
  }, 120_000);

  it('writes a decision log per seed where --keep asks, and reports the same batch', () => {
    const keep = workspace();
    const kept = run('--seeds', '2', '--ticks', '40', '--keep', keep, '--workers', '2');
    const dropped = run('--seeds', '2', '--ticks', '40', '--workers', '2');

    expect(kept.status).toBe(0);
    expect(kept.stderr).toBe('');
    expect(kept.stdout).toBe(dropped.stdout);
    expect(readdirSync(keep).sort()).toEqual(['1.json', '2.json']);
  }, 120_000);

  it('retrieves a Match of the batch: the same seed, level and bound, to the same hash', () => {
    const batch = reportOf(run('--seeds', '2', '--ticks', '40', '--difficulty', 'tiro', '--workers', '2'));
    const second = batch.matches[1]!;

    const retrieved = match('--rules', 'ai', '--seed', String(second.seed), '--ticks', '40',
      '--difficulty', 'tiro', '--expect-hash', second.hash);

    expect(retrieved.status).toBe(0);
    expect(retrieved.stderr).toBe('');
    expect(JSON.parse(retrieved.stdout)).toMatchObject({ seed: second.seed, hash: second.hash,
      ticks: second.ticks, decisions: expect.any(Array) });
  }, 120_000);

  it('keeps, per seed, the very report npm run match prints for that Match', () => {
    const keep = workspace();
    const report = reportOf(run('--seeds', '2', '--ticks', '40', '--keep', keep, '--workers', '2'));
    const alone = match('--rules', 'ai', '--seed', String(report.matches[1]!.seed), '--ticks', '40');

    expect(alone.status).toBe(0);
    expect(readFileSync(join(keep, `${String(report.matches[1]!.seed)}.json`), 'utf8')).toBe(alone.stdout);
  }, 120_000);

  it('refuses a command line it cannot run, with the usage after it', () => {
    const ran = run('--seeds', '0');

    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('tournament: a tournament is at least one Match');
    expect(ran.stderr).toContain('Usage: npm run tournament');
  }, 60_000);

  it('answers --help with the usage, and plays nothing', () => {
    const ran = run('--help');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(ran.stdout).toContain('Usage: npm run tournament -- [options]');
  }, 60_000);
});
