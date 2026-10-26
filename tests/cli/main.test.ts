import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { MatchReport } from '../../src/cli/report';

/**
 * The command the harness itself runs, from the repository root and through the
 * same Node that is running these tests. Nothing is imported: what A4 promises
 * is a *command*, so it is the process — its exit code, its standard output and
 * its standard error — that is under test here.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = fileURLToPath(new URL('../../src/cli/main.ts', import.meta.url));

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function match(...args: readonly string[]): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    // The early patrol now contributes scored Commands on every tactical tick.
    maxBuffer: 4 * 1024 * 1024,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The report the command printed, so a failure says why it could not be read. */
function reportOf(result: Ran): MatchReport {
  const report: unknown = JSON.parse(result.stdout);
  return report as MatchReport;
}

describe('one command plays a Match end to end, with no browser anywhere', () => {
  it('plays two economy and military AIs and prints every scored decision after the Match', () => {
    const ran = match('--seed', '1', '--ticks', '301', '--rules', 'ai');
    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    const report = reportOf(ran);
    // Physical muster traffic adds real waits between the two funded opening patrols.
    expect(report.commands).toBe(516);
    expect(report.decisions).toHaveLength(608);
    expect(report.decisions?.slice(0, 3).map((entry) => [entry.faction, entry.layer, entry.tick])).toEqual([
      ['rome', 'strategic', 0], ['rome', 'operational', 0], ['rome', 'tactical', 0],
    ]);
    expect(report.decisions?.at(-1)).toMatchObject({
      faction: 'carthage', tick: 300, layer: 'tactical',
      candidates: expect.arrayContaining([
        expect.objectContaining({ id: 'idle', utility: 0, reason: 'Keep the current plan and emit no Commands.' }),
        expect.objectContaining({ behaviour: 'military', id: 'threat-map' }),
      ]),
      selected: { behaviour: 'scouting', id: 'explore' },
    });
    expect(report.decisions?.[1]?.selected.behaviour).toBe('economy');
    expect(match('--seed', '1', '--ticks', '301', '--rules', 'ai').stdout).toBe(ran.stdout);
  });

  it('plays a whole Match and prints a JSON report of it', () => {
    const ran = match('--seed', '7', '--ticks', '120');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');

    const report = reportOf(ran);
    expect(report).toMatchObject({
      seed: 7,
      ticks: 120,
      outcome: 'clock',
      winner: null,
      reason: 'the Match reached its tick bound of 120 ticks without a decision',
      commands: 0,
    });
    expect(report.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('plays a Match with no arguments at all, on the documented defaults', () => {
    const ran = match();

    expect(ran.status).toBe(0);
    expect(reportOf(ran).seed).toBe(1);

    // The documented default bound: three game years (PLAN §4). Spelled out
    // here rather than imported, so changing it is visible in a review.
    expect(reportOf(ran).ticks).toBe(25_200);
  });

  it('prints the very same bytes for the very same command, so runs can be diffed', () => {
    expect(match('--seed', '3', '--ticks', '60').stdout).toBe(match('--seed', '3', '--ticks', '60').stdout);
    expect(match('--seed', '3', '--ticks', '60').stdout).not.toBe(match('--seed', '4', '--ticks', '60').stdout);
  });
});

describe('a Match that draws, played from the command line', () => {
  it('plays the drawing Match by name, and reports it like any other Match', () => {
    const ran = match('--seed', '1', '--ticks', '600', '--rules', 'draws');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');

    const report = reportOf(ran);
    expect(report).toMatchObject({
      seed: 1,
      ticks: 600,
      outcome: 'clock',
      winner: null,
      commands: 0,
    });
    expect(report.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('hashes the drawing Match differently from the one the command line plays by default, so the gate covers the draw loop', () => {
    expect(reportOf(match('--seed', '1', '--ticks', '600', '--rules', 'draws')).hash).not.toBe(
      reportOf(match('--seed', '1', '--ticks', '600')).hash,
    );
  });

  it('plays the economy Match when no rules are named, byte for byte the same command', () => {
    expect(match('--seed', '1', '--ticks', '600').stdout).toBe(
      match('--seed', '1', '--ticks', '600', '--rules', 'economy').stdout,
    );
    expect(match('--seed', '1', '--ticks', '600').stdout).not.toBe(
      match('--seed', '1', '--ticks', '600', '--rules', 'empty').stdout,
    );
  });

  it('plays the march Match, which walks a dozen Squads across the seeded theatre', () => {
    const ran = match('--seed', '1', '--ticks', '600', '--rules', 'march');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(reportOf(ran)).toMatchObject({ seed: 1, ticks: 600, outcome: 'clock', commands: 2 });
  });

  it('exits 1 on a mismatch for the drawing Match too, and prints the report first', () => {
    const ran = match(
      '--seed',
      '1',
      '--ticks',
      '600',
      '--rules',
      'draws',
      '--expect-hash',
      '0000000000000000',
    );

    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('expected 0000000000000000');
    expect(ran.stderr).toContain(reportOf(ran).hash);
    expect(reportOf(ran).outcome).toBe('clock');
  });
});

describe('a map dumped from the command line', () => {
  it('prints the map a seed generates, and plays no Match', () => {
    const ran = match('--seed', '7', '--map');

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(ran.stdout).toContain('seed 7');
    expect(ran.stdout).toContain(`Rome's Stronghold`);
    expect(ran.stdout).not.toContain('"hash"');
  });

  it('prints the very same bytes for the very same seed, so two maps can be diffed', () => {
    expect(match('--seed', '7', '--map').stdout).toBe(match('--seed', '7', '--map').stdout);
    expect(match('--seed', '7', '--map').stdout).not.toBe(match('--seed', '8', '--map').stdout);
  });

  it('exits 2, with the offending flag in the message, when --map comes with a Match to play', () => {
    const ran = match('--map', '--ticks', '10');

    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('--map prints a map and plays nothing, so --ticks');
    expect(ran.stderr).toContain('Usage:');
  });
});

describe('a deliberately violated invariant', () => {
  it('accepts the hash a Match really ended on, which is the determinism gate (ADR-0006)', () => {
    const first = match('--seed', '11', '--ticks', '90');
    const decided = reportOf(first).hash;

    const second = match('--seed', '11', '--ticks', '90', '--expect-hash', decided);

    expect(second.status).toBe(0);
    expect(reportOf(second).hash).toBe(decided);
  });

  it('exits non-zero, with a readable message, when the Match ended on another hash', () => {
    const ran = match('--seed', '11', '--ticks', '90', '--expect-hash', '0000000000000000');

    expect(ran.status).toBe(1);
    expect(ran.stderr).toContain('expected 0000000000000000');
    expect(ran.stderr).toContain(reportOf(ran).hash);
    expect(ran.stderr).toContain('cli:');
  });

  it('still prints the report, so the hash it did end on is right there', () => {
    const ran = match('--seed', '11', '--ticks', '90', '--expect-hash', '0000000000000000');

    expect(reportOf(ran).outcome).toBe('clock');
  });
});

describe('a misused command line', () => {
  it('prints the usage and plays nothing when asked for help', () => {
    for (const flag of ['--help', '-h']) {
      const ran = match(flag);

      expect(ran.status).toBe(0);
      expect(ran.stdout).toContain('Usage:');
      expect(ran.stdout).toContain('--seed');
      expect(ran.stdout).toContain('--rules');
      expect(ran.stdout).toContain('draws');
      expect(ran.stdout).toContain('--map');
      expect(ran.stdout).not.toContain('hash":');
    }
  });

  it('exits 2, with the offending argument in the message, when a flag is not one it knows', () => {
    const ran = match('--speed', '3');

    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('--speed is not an option this command knows');
    expect(ran.stderr).toContain('Usage:');
  });

  it('exits 2, with the offending name in the message, when a rules name is not one it knows', () => {
    const ran = match('--rules', 'nope');

    expect(ran.status).toBe(2);
    expect(ran.stdout).toBe('');
    expect(ran.stderr).toContain('nope');
    expect(ran.stderr).toContain('Usage:');
  });

  it('exits 2 when a flag arrived without its value, or with a value it cannot read', () => {
    expect(match('--seed').stderr).toContain('--seed needs a value');
    expect(match('--seed').status).toBe(2);
    expect(match('--ticks', 'half').status).toBe(2);
    expect(match('--expect-hash', 'zzz').status).toBe(2);
    expect(match('--rules').status).toBe(2);
  });
});
