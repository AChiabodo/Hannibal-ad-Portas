import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SEED,
  DEFAULT_TICKS,
  parseArguments,
  UsageError,
  USAGE,
} from '../../src/cli/arguments';
import { DEFAULT_RULES, RULES, RULES_NAMES, type RulesName } from '../../src/cli/rules';
import { MAX_SEED } from '../../src/sim/rng';

/** The options a well-formed command line parses into, with the defaults filled in. */
function run(
  overrides: Partial<{
    seed: number;
    ticks: number;
    expectedHash: string | null;
    rules: RulesName;
  }> = {},
) {
  return {
    kind: 'run',
    options: {
      seed: DEFAULT_SEED,
      ticks: DEFAULT_TICKS,
      expectedHash: null,
      rules: DEFAULT_RULES,
      ...overrides,
    },
  };
}

describe('the command line', () => {
  it('plays a Match with no arguments at all, on documented defaults', () => {
    expect(parseArguments([])).toEqual(run());
  });

  it('takes a seed, a tick bound and an expected hash', () => {
    expect(parseArguments(['--seed', '7', '--ticks', '300', '--expect-hash', '0a1b2c3d4e5f6071'])).toEqual(
      run({ seed: 7, ticks: 300, expectedHash: '0a1b2c3d4e5f6071' }),
    );
  });

  it('takes the largest seed the random source accepts, and the smallest bound', () => {
    expect(parseArguments(['--seed', String(MAX_SEED), '--ticks', '0'])).toEqual(
      run({ seed: MAX_SEED, ticks: 0 }),
    );
  });

  it('plays the empty Match by default, and takes which rules to play by name', () => {
    expect(parseArguments([])).toEqual(run({ rules: 'empty' }));
    expect(parseArguments(['--rules', 'draws'])).toEqual(run({ rules: 'draws' }));
    expect(parseArguments(['--rules', 'empty', '--seed', '3'])).toEqual(
      run({ seed: 3, rules: 'empty' }),
    );
  });

  it('refuses a rules name it does not have, naming the name it was given', () => {
    for (const value of ['nope', '', 'Empty', 'draws ']) {
      expect(() => parseArguments(['--rules', value])).toThrow(UsageError);
      expect(() => parseArguments(['--rules', value])).toThrow(/rules/);
    }

    expect(() => parseArguments(['--rules', 'nope'])).toThrow(/nope/);
    expect(() => parseArguments(['--rules', ''])).toThrow(/an empty string/);
  });

  it('asks for help with --help or -h, and nothing else', () => {
    for (const flag of ['--help', '-h']) {
      expect(parseArguments([flag])).toEqual({ kind: 'help' });
      expect(parseArguments([flag, '--seed', '7'])).toEqual({ kind: 'help' });
    }
  });

  it('refuses a flag it does not know, and names it, whether or not a value follows', () => {
    expect(() => parseArguments(['--speed', '3'])).toThrow(UsageError);
    expect(() => parseArguments(['--speed', '3'])).toThrow(/--speed/);
    expect(() => parseArguments(['--speed'])).toThrow(/--speed is not an option this command knows/);
  });

  it('refuses an argument that is not a flag at all', () => {
    expect(() => parseArguments(['7'])).toThrow(/7/);
  });

  it('prints the map a seed generates when asked for one, and plays no Match', () => {
    expect(parseArguments(['--map'])).toEqual({ kind: 'map', seed: DEFAULT_SEED });
    expect(parseArguments(['--map', '--seed', '7'])).toEqual({ kind: 'map', seed: 7 });
    expect(parseArguments(['--seed', '7', '--map'])).toEqual({ kind: 'map', seed: 7 });
  });

  it('refuses a flag that only says something about a Match beside --map, which plays none', () => {
    expect(() => parseArguments(['--map', '--ticks', '10'])).toThrow(UsageError);
    expect(() => parseArguments(['--map', '--ticks', '10'])).toThrow(/--map prints a map and plays nothing, so --ticks/);
    expect(() => parseArguments(['--map', '--expect-hash', '0a1b2c3d4e5f6071'])).toThrow(/--expect-hash/);
    expect(() => parseArguments(['--map', '--rules', 'draws'])).toThrow(/--rules/);
  });

  it('refuses --map twice like any other flag', () => {
    expect(() => parseArguments(['--map', '--map'])).toThrow(/--map is given twice/);
  });

  it('refuses a flag with no value after it', () => {
    expect(() => parseArguments(['--seed'])).toThrow(/--seed needs a value/);
    expect(() => parseArguments(['--ticks'])).toThrow(/--ticks needs a value/);
    expect(() => parseArguments(['--expect-hash'])).toThrow(/--expect-hash needs a value/);
    expect(() => parseArguments(['--rules'])).toThrow(/--rules needs a value/);
  });

  it('refuses a flag given twice, rather than guessing which one was meant', () => {
    expect(() => parseArguments(['--seed', '1', '--seed', '2'])).toThrow(/--seed is given twice/);
    expect(() => parseArguments(['--ticks', '1', '--ticks', '2'])).toThrow(/--ticks is given twice/);
    expect(() =>
      parseArguments(['--expect-hash', 'aaaabbbbccccdddd', '--expect-hash', 'eeeeffff00001111']),
    ).toThrow(/--expect-hash is given twice/);
    expect(() => parseArguments(['--rules', 'empty', '--rules', 'draws'])).toThrow(
      /--rules is given twice/,
    );
  });

  it('refuses a seed that is not an unsigned 32-bit integer, and says what a seed is', () => {
    for (const value of ['abc', '-1', '1.5', String(MAX_SEED + 1), '']) {
      expect(() => parseArguments(['--seed', value])).toThrow(UsageError);
      expect(() => parseArguments(['--seed', value])).toThrow(/seed/);
    }
  });

  it('refuses a tick bound that is not a whole number of ticks', () => {
    for (const value of ['1.5', '-1', 'lots', '']) {
      expect(() => parseArguments(['--ticks', value])).toThrow(UsageError);
      expect(() => parseArguments(['--ticks', value])).toThrow(/ticks/);
    }
  });

  it('refuses an expected hash that is not sixteen lowercase hexadecimal digits', () => {
    for (const value of ['', 'xyz', '0a1b2c3d4e5f607', '0a1b2c3d4e5f60711', '0A1B2C3D4E5F6071']) {
      expect(() => parseArguments(['--expect-hash', value])).toThrow(UsageError);
      expect(() => parseArguments(['--expect-hash', value])).toThrow(/hash/);
    }
  });

  it('describes itself in one place, so the usage message cannot drift from the parser', () => {
    for (const flag of ['--seed', '--ticks', '--expect-hash', '--rules', '--map', '--help']) {
      expect(USAGE).toContain(flag);
    }
    expect(USAGE).toContain(DEFAULT_TICKS.toString());
    expect(USAGE).toContain(`default ${DEFAULT_SEED}`);
  });

  it('lists every Match it can play, read out of the table rather than written twice', () => {
    for (const name of RULES_NAMES) {
      expect(USAGE).toContain(name);
      expect(USAGE).toContain(RULES[name].description);
    }

    expect(USAGE).toContain(DEFAULT_RULES);
  });
});
