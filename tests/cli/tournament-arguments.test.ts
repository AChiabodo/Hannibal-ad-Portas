import { availableParallelism } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIRST_SEED,
  DEFAULT_SEEDS,
  USAGE,
  parseTournamentArguments,
} from '../../src/cli/tournament-arguments';
import { DEFAULT_DIFFICULTY, UsageError } from '../../src/cli/arguments';
import type { BatchOptions } from '../../src/cli/tournament-batch';
import { HEADLESS_TICKS } from '../../src/sim/season';
import { MAX_SEED } from '../../src/sim/rng';

/**
 * The tournament command line, read (E3).
 *
 * The same discipline as the other commands' arguments, for the same reason: a
 * batch is only worth measuring if the command that started it says exactly what
 * it measured. A flag nobody knows, a count of nought Matches and a batch that
 * runs off the end of the seed space are all refused here, by name, before a
 * single Match is played.
 */

/** The options of a command line that parsed, for the tests that only care about them. */
function optionsOf(argv: readonly string[]): BatchOptions {
  const parsed = parseTournamentArguments(argv);

  if (parsed.kind !== 'tournament') throw new Error('this command line asked for the usage');

  return parsed.options;
}

/** Why a command line was refused, for the tests that expect it to be. */
function refusalOf(argv: readonly string[]): string {
  try {
    parseTournamentArguments(argv);
  } catch (error) {
    if (error instanceof UsageError) return error.message;

    throw error;
  }

  throw new Error('this command line was accepted, and a refusal was expected');
}

describe('the tournament command line', () => {
  it('defaults to the batch the Definition of Done is written about', () => {
    expect(optionsOf([])).toEqual({
      seeds: DEFAULT_SEEDS,
      firstSeed: DEFAULT_FIRST_SEED,
      ticks: HEADLESS_TICKS,
      difficulty: DEFAULT_DIFFICULTY,
      workers: availableParallelism(),
      keep: null,
    });

    expect(DEFAULT_SEEDS).toBe(200);
    expect(DEFAULT_DIFFICULTY).toBe('centurio');
  });

  it('reads every flag it has, and says so in its usage', () => {
    expect(optionsOf(['--seeds', '3', '--first-seed', '17', '--ticks', '9000', '--difficulty', 'imperator',
      '--workers', '2', '--keep', 'tour'])) 
      .toEqual({ seeds: 3, firstSeed: 17, ticks: 9000, difficulty: 'imperator', workers: 2, keep: 'tour' });

    for (const flag of ['--seeds', '--first-seed', '--ticks', '--difficulty', '--workers', '--keep', '--help']) {
      expect(USAGE).toContain(flag);
    }

    expect(USAGE).toContain('Usage: npm run tournament');
  });

  it('refuses a batch of no Matches, and one that plays none at once', () => {
    expect(refusalOf(['--seeds', '0'])).toContain('at least one Match');
    expect(refusalOf(['--workers', '0'])).toContain('at least one Match at a time');
  });

  it('refuses a batch that would run off the end of the seed space', () => {
    expect(refusalOf(['--first-seed', String(MAX_SEED), '--seeds', '2'])).toMatch(/past the largest seed/);
    expect(refusalOf(['--first-seed', String(MAX_SEED + 1)])).toContain('--first-seed');
  });

  it('refuses what is not a number, a level or a file, naming the flag', () => {
    expect(refusalOf(['--seeds', '200.5'])).toContain('--seeds');
    expect(refusalOf(['--workers', '-2'])).toContain('--workers');
    expect(refusalOf(['--ticks'])).toContain('--ticks needs a value');
    expect(refusalOf(['--difficulty', 'proconsul'])).toContain('--difficulty');
    expect(refusalOf(['--keep', ''])).toContain('--keep');
  });

  it('refuses a flag it does not have, and one given twice', () => {
    expect(refusalOf(['--seed', '3'])).toContain('--seed is not an option this command knows');
    expect(refusalOf(['--seeds', '3', '--seeds', '4'])).toContain('--seeds is given twice');
  });

  it('answers --help with the usage and plays nothing', () => {
    expect(parseTournamentArguments(['--help'])).toEqual({ kind: 'help' });
    expect(parseTournamentArguments(['-h'])).toEqual({ kind: 'help' });
  });
});
