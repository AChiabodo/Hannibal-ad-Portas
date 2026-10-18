/**
 * The bake step (ticket B2, PLAN §3, ADR-0002).
 *
 * Two claims are held here. The bake writes *the catalogue* — every named
 * artefact plus the plate, one file each, none missing — and what it prints is the
 * pixel hash of what it wrote, so a reader can tell a changed generator from a
 * changed layout without opening a file. The command's own streams and exit codes
 * are `bake-main.ts`, and they are checked the way the Match CLI's are: as a
 * process.
 */
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogue, cataloguePlate } from '../../src/art/catalogue';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';
import { DEFAULT_OUT, PLATE_NAME, artefactsToBake, bakeAll, formatBake, parseBakeArguments } from '../../src/cli/bake';
import { UsageError } from '../../src/cli/arguments';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const CLI = fileURLToPath(new URL('../../src/cli/bake-main.ts', import.meta.url));

let out: string | undefined;

afterEach(() => {
  if (out !== undefined) rmSync(out, { recursive: true, force: true });
  out = undefined;
});

/** A fresh directory to bake into, cleaned up afterwards. */
function scratch(): string {
  out = mkdtempSync(join(tmpdir(), 'spqr-bake-'));
  return out;
}

interface Ran {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

function bake(...args: readonly string[]): Ran {
  const result: SpawnSyncReturns<string> = spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
  });

  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('baking the catalogue', () => {
  it('writes one PNG per artefact, plus the plate, and answers with what it wrote', () => {
    const directory = scratch();
    const baked = bakeAll(directory);

    expect(baked.length).toBe(catalogue().length + 1);
    expect(baked.map((artefact) => artefact.name)).toEqual(artefactsToBake().map((artefact) => artefact.name));
    expect(baked[baked.length - 1]?.name).toBe(PLATE_NAME);

    for (const artefact of baked) {
      expect(existsSync(join(directory, artefact.file)), artefact.file).toBe(true);
      expect(readFileSync(join(directory, artefact.file)).length).toBeGreaterThan(0);
    }

    const files = readdirSync(directory).sort();
    expect(files.length).toBe(baked.length);
    expect(new Set(baked.map((artefact) => artefact.file)).size).toBe(baked.length);
    expect(files.every((file) => file.endsWith('.png'))).toBe(true);
  });

  it('reports the pixel hash of every artefact, which is the number CI pins', () => {
    const baked = bakeAll(scratch());
    const hashes = new Map(baked.map((artefact) => [artefact.name, artefact.hash]));

    expect(hashes.get(PLATE_NAME)).toBe(hashPixelBuffer(cataloguePlate()));
    for (const entry of catalogue()) {
      expect(hashes.get(entry.name), entry.name).toBe(hashPixelBuffer(entry.buffer));
    }
  });

  it('creates the directory it was pointed at, however deep', () => {
    const directory = join(scratch(), 'one', 'two');

    expect(bakeAll(directory).length).toBeGreaterThan(0);
    expect(existsSync(directory)).toBe(true);
  });

  it('prints a table free of paths and clocks, so two runs are the same text', () => {
    const first = formatBake(bakeAll(scratch()));
    const second = formatBake(bakeAll(scratch()));

    expect(first).toBe(second);
    expect(first.startsWith('artefact')).toBe(true);
    // No output directory, no path separators, no clock: the table is the catalogue
    // and nothing about this machine.
    expect(first).not.toMatch(/artifacts|[/\\]/);
    expect(first.split('\n').length).toBe(artefactsToBake().length + 2);
  });
});

describe('reading a bake command line', () => {
  it('defaults the output directory and takes one when it is given', () => {
    expect(parseBakeArguments([])).toEqual({ kind: 'bake', out: DEFAULT_OUT });
    expect(parseBakeArguments(['--out', 'somewhere'])).toEqual({ kind: 'bake', out: 'somewhere' });
    expect(parseBakeArguments(['--help'])).toEqual({ kind: 'help' });
  });

  it('refuses an unknown flag, a repeated one, and one with no value', () => {
    expect(() => parseBakeArguments(['--out'])).toThrow(UsageError);
    expect(() => parseBakeArguments(['--out', '--help'])).toThrow(UsageError);
    expect(() => parseBakeArguments(['--out', 'a', '--out', 'b'])).toThrow(UsageError);
    expect(() => parseBakeArguments(['--everywhere'])).toThrow(UsageError);
  });
});

describe('the bake command', () => {
  it('bakes into a directory the caller names and prints the table', () => {
    const directory = scratch();
    const ran = bake('--out', directory);

    expect(ran.status).toBe(0);
    expect(ran.stderr).toBe('');
    expect(ran.stdout.split('\n').length).toBe(artefactsToBake().length + 2);
    expect(readdirSync(directory).length).toBe(artefactsToBake().length);
  });

  it('describes itself when asked, and exits non-zero on a command line it does not know', () => {
    const asked = bake('--help');
    expect(asked.status).toBe(0);
    expect(asked.stdout).toContain('Usage: node src/cli/bake-main.ts');

    const misused = bake('--out');
    expect(misused.status).toBe(2);
    expect(misused.stderr).toContain('bake:');
    expect(misused.stderr).toContain('Usage:');
    expect(misused.stdout).toBe('');
  });
});
