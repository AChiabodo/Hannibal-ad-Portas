import { describe, expect, it } from 'vitest';
import { USAGE, parseReplayArguments } from '../../src/cli/replay-arguments';
import { UsageError } from '../../src/cli/arguments';

/**
 * The replay command's command line: one record, and nothing else.
 *
 * Refusals are the point of the parser, as they are for every command this
 * project ships: a typo has to be a typo, not a replay of something else. There
 * is one thing this command takes — the file `--record` wrote — so the whole
 * surface is a positional path, `--help`, and a sentence for everything else.
 */
describe('the replay command line', () => {
  it('reads the record to replay', () => {
    expect(parseReplayArguments(['artifacts/seed-7.json'])).toEqual({
      kind: 'replay',
      path: 'artifacts/seed-7.json',
    });
  });

  it('asks for the usage, and replays nothing, on --help anywhere on the line', () => {
    expect(parseReplayArguments(['--help'])).toEqual({ kind: 'help' });
    expect(parseReplayArguments(['-h'])).toEqual({ kind: 'help' });
    expect(parseReplayArguments(['seed-7.json', '--help'])).toEqual({ kind: 'help' });
  });

  it('refuses a line that names no record at all', () => {
    expect(() => parseReplayArguments([])).toThrow(UsageError);
    expect(() => parseReplayArguments([])).toThrow(/record to replay is required/);
  });

  it('refuses a flag, because this command has none but --help', () => {
    expect(() => parseReplayArguments(['--seed', '7'])).toThrow(UsageError);
    expect(() => parseReplayArguments(['--seed', '7'])).toThrow(/--seed is not an option/);
  });

  it('refuses two records, because a replay is a comparison of one', () => {
    expect(() => parseReplayArguments(['one.json', 'two.json'])).toThrow(/one record at a time/);
  });

  it('describes itself in one place, so the usage message cannot drift from the parser', () => {
    expect(USAGE).toContain('npm run replay -- <record>');
    expect(USAGE).toContain('--help');
  });
});
