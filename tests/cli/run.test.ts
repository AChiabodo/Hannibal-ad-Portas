import { describe, expect, it } from 'vitest';
import type { RunOptions } from '../../src/cli/arguments';
import { HashMismatchError, playMatch, requireExpectedHash } from '../../src/cli/run';
import { DEFAULT_RULES } from '../../src/cli/rules';

/** What the CLI plays unless a test says otherwise. */
function options(overrides: Partial<RunOptions> = {}): RunOptions {
  return { seed: 7, ticks: 120, expectedHash: null, rules: DEFAULT_RULES, ...overrides };
}

describe('playing a Match headless', () => {
  it('runs a whole Match and ends it by the tick bound, on the documented defaults', () => {
    const run = playMatch(options());

    expect(run.seed).toBe(7);
    expect(run.result).toEqual({ kind: 'clock', tick: 120 });
    expect(run.log).toEqual([]);
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('plays the rules the command line named, rather than the Match on the clock', () => {
    const drawing = playMatch(options({ rules: 'draws' }));

    expect(drawing.result).toEqual({ kind: 'clock', tick: 120 });
    expect(drawing.hash).not.toBe(playMatch(options()).hash);
  });

  it('plays the same Match again from the same seed, hash for hash', () => {
    expect(playMatch(options())).toEqual(playMatch(options()));
  });

  it('plays a different Match on a different seed', () => {
    expect(playMatch(options({ seed: 8 })).hash).not.toBe(playMatch(options()).hash);
  });

  it('plays a hundred short Matches in a time that makes batch runs routine', () => {
    const started = performance.now();
    const hashes = Array.from({ length: 100 }, (_, index) =>
      playMatch(options({ seed: index + 1, ticks: 300 })).hash,
    );
    const elapsed = performance.now() - started;

    expect(new Set(hashes).size).toBe(100);
    // Generous on purpose: this is a batch-runs-are-practical fence, not a
    // benchmark. A hundred empty Matches take single-digit milliseconds here,
    // and anything that made them take seconds would have to be a real change
    // of design rather than a slow machine.
    expect(elapsed).toBeLessThan(5_000);
  });
});

describe('the invariant the CLI checks: the Match ended on the hash it was required to', () => {
  it('accepts any Match when no hash was expected', () => {
    expect(() => requireExpectedHash(playMatch(options()), options())).not.toThrow();
  });

  it('accepts a Match that ended on the expected hash', () => {
    const run = playMatch(options());
    const expected = options({ expectedHash: run.hash });

    expect(() => requireExpectedHash(run, expected)).not.toThrow();
  });

  it('refuses a Match that ended on any other hash, naming both numbers', () => {
    const run = playMatch(options());
    const expected = options({ expectedHash: '0000000000000000' });

    expect(() => requireExpectedHash(run, expected)).toThrow(HashMismatchError);
    expect(() => requireExpectedHash(run, expected)).toThrow(
      new RegExp(`expected 0000000000000000, got ${run.hash}`),
    );
  });
});
