import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_FACTION,
  DEFAULT_OPPONENT,
  USAGE,
  parseAgentArguments,
  type AgentRunOptions,
} from '../../src/cli/agent-arguments';
import { DEFAULT_DEADLINE_MS, DEFAULT_DECISION_TICKS } from '../../src/cli/protocol';
import { DEFAULT_SEED, UsageError } from '../../src/cli/arguments';
import { HEADLESS_TICKS } from '../../src/sim/season';

/**
 * What the agent command's front door means (E1). It is the same discipline as
 * `arguments.test.ts` — a value it cannot read back is refused by name — plus the
 * one flag this command cannot run without.
 */
function options(...argv: readonly string[]): AgentRunOptions {
  const parsed = parseAgentArguments(argv);

  if (parsed.kind !== 'run') throw new Error('the command line asked for the usage');

  return parsed.options;
}

describe('the agent command line', () => {
  it('needs an agent, and says so by name when there is none', () => {
    expect(() => parseAgentArguments([])).toThrow(UsageError);
    expect(() => parseAgentArguments([])).toThrow(/--agent is required/);
  });

  it('plays Rome against the AI, on the documented defaults', () => {
    expect(options('--agent', 'ex.ts')).toEqual({
      agent: undefined,
      seed: DEFAULT_SEED,
      ticks: HEADLESS_TICKS,
      faction: DEFAULT_FACTION,
      opponent: DEFAULT_OPPONENT,
      difficulty: DEFAULT_DIFFICULTY,
      script: 'ex.ts',
      decisionTicks: DEFAULT_DECISION_TICKS,
      deadlineMs: DEFAULT_DEADLINE_MS,
      log: null,
      record: null,
      expectedHash: null,
    });
  });

  it('reads the Faction, the opponent and the difficulty', () => {
    const read = options(
      '--agent', 'ex.ts',
      '--seed', '7',
      '--ticks', '600',
      '--faction', 'carthage',
      '--opponent', 'idle',
      '--difficulty', 'imperator',
      '--decision-ticks', '25',
      '--deadline', '500',
      '--log', 'match.jsonl',
      '--record', 'match.json',
      '--expect-hash', '0123456789abcdef',
    );

    expect(read).toMatchObject({
      seed: 7,
      ticks: 600,
      faction: 'carthage',
      opponent: 'idle',
      difficulty: 'imperator',
      decisionTicks: 25,
      deadlineMs: 500,
      log: 'match.jsonl',
      record: 'match.json',
      expectedHash: '0123456789abcdef',
    });
  });

  it('asks for nothing but the usage on --help', () => {
    expect(parseAgentArguments(['--help'])).toEqual({ kind: 'help' });
    expect(USAGE.startsWith('Usage: npm run agent -- --agent <file> [options]')).toBe(true);
  });

  it('refuses a value it cannot read back, naming the flag', () => {
    expect(() => options('--agent', 'ex.ts', '--faction', 'gaul')).toThrow(/--faction must be one of rome or carthage/);
    expect(() => options('--agent', 'ex.ts', '--opponent', 'human')).toThrow(/--opponent must be one of ai or idle/);
    expect(() => options('--agent', 'ex.ts', '--difficulty', 'easy')).toThrow(/--difficulty must be one of/);
    expect(() => options('--agent', 'ex.ts', '--decision-ticks', '0')).toThrow(/--decision-ticks must be at least 1/);
    expect(() => options('--agent', 'ex.ts', '--deadline', '1.5')).toThrow(/--deadline must be a whole non-negative/);
    expect(() => options('--agent', 'ex.ts', '--seed', '4294967296')).toThrow(/--seed must be an unsigned 32-bit/);
    expect(() => options('--agent', 'ex.ts', '--expect-hash', 'nope')).toThrow(/--expect-hash must be a 16-digit/);
  });

  it('refuses a flag it does not know, a repeated flag and a value that never arrived', () => {
    expect(() => options('--agent', 'ex.ts', '--agents', 'other.ts')).toThrow(/--agents is not an option/);
    expect(() => options('--agent', 'ex.ts', '--seed', '1', '--seed', '2')).toThrow(/--seed is given twice/);
    expect(() => options('--agent')).toThrow(/--agent needs a value/);
  });
});
