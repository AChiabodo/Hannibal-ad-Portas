import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { playAgentMatch, type AgentMatchOptions } from '../../src/cli/agent';
import { replayCommands } from '../../src/sim/replay';
import { siegeMatchRules } from '../../src/sim/siege';

/**
 * A whole Match played by a process that is not this codebase (E1).
 *
 * These tests are the ticket's acceptance criteria with a pipe through them: a
 * real child process on the other end of standard input and output, the example
 * agent winning a Match through nothing but the protocol, and the three ways a
 * Player stops — malformed input, a deadline, a dead process — each of them a
 * Player who stopped playing rather than a crashed harness.
 */
const paths = {
  examples: fileURLToPath(new URL('../../examples/agent.ts', import.meta.url)),
  idle: fixture('idle.ts'),
  malformed: fixture('malformed.ts'),
  silent: fixture('silent.ts'),
  crashed: fixture('crashed.ts'),
  recruiter: fixture('recruiter.ts'),
};

/** One fixture agent, as the harness would spawn it. */
function fixture(name: string): string {
  return fileURLToPath(new URL(`./agents/${name}`, import.meta.url));
}

/** The options a test plays a Match with, and the short bound most of them need. */
function options(overrides: Partial<AgentMatchOptions> & { readonly script: string }): AgentMatchOptions {
  return { seed: 1, ticks: 200, faction: 'rome', opponent: 'idle', deadlineMs: 5000, ...overrides };
}

describe('an outside process plays a whole Match over the protocol', () => {
  it('runs a Match to its bound with a well-behaved agent, and asks it every decision', async () => {
    const run = await playAgentMatch(options({ script: paths.idle }));

    expect(run.result).toEqual({ kind: 'clock', tick: 200 });
    expect(run.agent).toEqual({
      faction: 'rome',
      opponent: 'idle',
      status: 'played',
      stoppedBy: null,
      detail: null,
      decisions: 20,
      commands: 0,
    });
    expect(run.log).toEqual([]);
  }, 20_000);

  it('plays the Faction the greeting names, and its Commands reach the Match', async () => {
    const run = await playAgentMatch(options({ script: paths.recruiter, faction: 'carthage' }));

    expect(run.agent.status).toBe('played');
    expect(run.agent.commands).toBe(1);
    expect(run.log[0]).toMatchObject({
      tick: 0,
      command: { kind: 'recruit', faction: 'carthage', squadType: 'libyan-spear' },
    });
  }, 20_000);

  it('plays the harness’s own Faction in this process, so the agent is never alone', async () => {
    const run = await playAgentMatch(options({ script: paths.idle, opponent: 'ai', ticks: 400 }));

    expect(run.result).toEqual({ kind: 'clock', tick: 400 });
    expect(run.log.some((entry) => entry.command.faction === 'carthage')).toBe(true);
  }, 20_000);

  it('wins a Match with the example agent: a Stronghold taken by an outside process', async () => {
    const run = await playAgentMatch(options({ script: paths.examples, seed: 7, ticks: 25_200 }));

    expect(run.result).toMatchObject({
      kind: 'victory',
      winner: 'rome',
      reason: { kind: 'stronghold', path: 'assault' },
    });
    expect(run.agent.status).toBe('played');
    expect(run.agent.commands).toBeGreaterThan(0);
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  }, 60_000);

  it('plays the same Match again from the same seed and the same agent', async () => {
    const first = await playAgentMatch(options({ script: paths.examples, seed: 7, ticks: 25_200 }));
    const second = await playAgentMatch(options({ script: paths.examples, seed: 7, ticks: 25_200 }));

    expect(second.hash).toBe(first.hash);
    expect(second.log).toEqual(first.log);
  }, 60_000);

  it('replays identically from its seed and Command log, hash for hash', async () => {
    const run = await playAgentMatch(options({ script: paths.examples, seed: 7, ticks: 25_200 }));
    // One checkpoint at the end: what a replay is *for* is the hash it ends on,
    // and hashing every tick of a three-year Match is an E2 question, not this one.
    const replayed = replayCommands({
      seed: run.seed,
      rules: siegeMatchRules,
      log: run.log,
      ticks: run.result.tick,
      everyTicks: run.result.tick,
    });

    expect(replayed.checkpoints.at(-1)).toEqual({ tick: run.result.tick, hash: run.hash });
  }, 60_000);
});

describe('a Player who stopped playing is not a crashed harness', () => {
  it('stops listening when a reply is malformed, naming the field, and plays on', async () => {
    const run = await playAgentMatch(options({ script: paths.malformed }));

    expect(run.agent).toMatchObject({
      status: 'stopped',
      stoppedBy: 'malformed',
      decisions: 1,
      commands: 0,
    });
    expect(run.agent.detail).toContain('message.commands[0].kind is not a Command kind');
    expect(run.result).toEqual({ kind: 'clock', tick: 200 });
  }, 20_000);

  it('stops listening when no reply arrives in time, and plays on', async () => {
    const run = await playAgentMatch(options({ script: paths.silent, deadlineMs: 100, ticks: 100 }));

    expect(run.agent).toMatchObject({ status: 'stopped', stoppedBy: 'timeout', decisions: 1 });
    expect(run.agent.detail).toContain('no reply to the observation at tick 0 within 100 ms');
    expect(run.result).toEqual({ kind: 'clock', tick: 100 });
  }, 20_000);

  it('treats a process that dies as a Player who left, not as a failure', async () => {
    const run = await playAgentMatch(options({ script: paths.crashed, ticks: 100 }));

    expect(run.agent).toMatchObject({ status: 'stopped', stoppedBy: 'gone', decisions: 1 });
    expect(run.agent.detail).toContain('the agent exited');
    expect(run.result).toEqual({ kind: 'clock', tick: 100 });
  }, 20_000);

  it('returns the same Match when the agent stopped as its log describes', async () => {
    const run = await playAgentMatch(options({ script: paths.malformed, ticks: 300 }));
    const replayed = replayCommands({
      seed: run.seed,
      rules: siegeMatchRules,
      log: run.log,
      ticks: run.result.tick,
      everyTicks: run.result.tick,
    });

    expect(replayed.checkpoints.at(-1)?.hash).toBe(run.hash);
  }, 20_000);
});
