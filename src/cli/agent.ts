/**
 * The external agent, as a Player: a process on the other end of a pipe (E1).
 *
 * This is the whole of "an agent that is not this codebase plays a Match": the
 * harness starts the agent, hands it its Faction's Observation once per decision
 * over standard input, reads the Commands it writes on standard output, and
 * applies them through the same driver the AI and the human go through. Nothing
 * here decides anything about the Match — that is the rules' — and nothing here
 * lets the agent see anything a Controller could not (`docs/PROTOCOL.md`).
 *
 * ## Two Players, and only one of them is a process
 *
 * The other Faction is played in this process, by the built-in AI at a stated
 * difficulty or by an idle Player that does nothing. An external agent is
 * therefore never alone in a Match: the harness owns the other side, and a Match
 * against an idle Player is the honest way to give an agent a whole theatre to
 * itself.
 *
 * ## A stopped Player is not a crashed harness
 *
 * The ticket's fourth rule, and the one that decides the shape of everything
 * else here: a malformed reply, a reply that never arrives and a process that
 * dies are all *the Player stopping*, not a failure of the Match. The harness
 * says so in its report, stops asking, and plays on with that Faction idle — the
 * same thing that happens when a human closes the tab and the Match is left to
 * its Rules. Nothing is thrown, and the CLI still exits 0: a Match was played.
 *
 * ## The clock, and why it is allowed here
 *
 * A deadline needs a wall clock, and a Match must not have one (ADR-0006). The
 * fence is that the clock decides only *whether the agent is still playing*: its
 * reading never enters the world, the state or the hash, and a Match is still
 * reproduced from its seed and the Command log it produced. A run that timed out
 * replays as the run the log describes, which is exactly what it was.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { Command } from '../sim/command.ts';
import { idleController, type Player, type Players } from '../sim/controller.ts';
import { runMatchAsync, type MatchRun, type Question } from '../sim/driver.ts';
import { requireTickCount } from '../sim/ticks.ts';
import type { Faction } from '../sim/faction.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { siegeMatchOutcome, siegeMatchRules, observeSiege, type SiegeVisible } from '../sim/siege.ts';
import type { DifficultyName } from '../ai/difficulty.ts';
import { createArmyController } from './ai-match.ts';
import {
  DEFAULT_DEADLINE_MS,
  DEFAULT_DECISION_TICKS,
  DEFAULT_GRACE_MS,
  ProtocolError,
  endMessage,
  formatMessage,
  helloMessage,
  observationMessage,
  readReply,
  stoppedMessage,
  type StopReason,
} from './protocol.ts';

/** Whom the agent is playing against: the built-in AI, or a Player that does nothing. */
export type Opponent = 'ai' | 'idle';

/** Everything a run of the protocol needs: which Match, who is playing it, and how long it may take. */
export interface AgentMatchOptions {
  /** The Match's seed: with the Command log, the whole reproducibility of the run. */
  readonly seed: number;

  /** The longest the Match may run, in whole ticks. The bound always terminates it. */
  readonly ticks: number;

  /** The Faction the external process plays. The other one is the harness's. */
  readonly faction: Faction;

  /** Who the harness plays on the other side. */
  readonly opponent: Opponent;

  /** The agent's file. It is run with this same Node, so it needs no packaging (ADR-0009). */
  readonly script: string;

  /** How often the agent is asked, in ticks. Default `DEFAULT_DECISION_TICKS`. */
  readonly decisionTicks?: number;

  /** How long a reply may take, in milliseconds. Default `DEFAULT_DEADLINE_MS`. */
  readonly deadlineMs?: number;

  /** How long the agent may take to exit after `end`. Default `DEFAULT_GRACE_MS`. */
  readonly graceMs?: number;

  /** The built-in AI's difficulty, when the opponent is the AI. */
  readonly difficulty?: DifficultyName;
}

/**
 * How the external Player's part in the Match ended: what it did, or what
 * stopped it.
 *
 * A verdict rather than an error, because a stopped Player is a fact about the
 * Match and not a failure of one: every Match this harness plays returns one, and
 * the report prints it beside the outcome.
 */
export interface AgentVerdict {
  /** The Faction the process played. */
  readonly faction: Faction;

  /** Who was on the other side. */
  readonly opponent: Opponent;

  /** Whether the process played to the end, or stopped. */
  readonly status: 'played' | 'stopped';

  /** What stopped it, when it stopped: input that could not be read, a silent pipe, or a dead process. */
  readonly stoppedBy: StopReason | null;

  /** What happened, in a sentence — the field of the message that could not be read, or the silence. */
  readonly detail: string | null;

  /** How many Observations it was sent. */
  readonly decisions: number;

  /** How many Commands it issued that the harness accepted. */
  readonly commands: number;
}

/** What one Match played by an external agent produced: the run, and how its Player did. */
export interface AgentRun extends MatchRun {
  readonly agent: AgentVerdict;
}

/**
 * Plays a whole Match with an external process on one side.
 *
 * The Match is `siegeMatchRules`, the world an ordinary Match plays: the agent is
 * a Player like any other, so there is no reduced game on the other end of a
 * pipe. When the Match ends — a Stronghold fallen, a Faction annihilated, or the
 * bound — the harness says so with `end`, closes the agent's input and lets it
 * go; a process that will not go is killed, because a harness must not be held
 * open by the thing it is testing.
 *
 * @throws RangeError when the bound or the decision interval is not a whole
 *   number of ticks, or the deadline is not a positive number of milliseconds.
 * @throws StateSerializationError when a tick leaves anything but integers in state.
 */
export async function playAgentMatch(options: AgentMatchOptions): Promise<AgentRun> {
  const decisionTicks = requireTickCount(options.decisionTicks ?? DEFAULT_DECISION_TICKS, 'decisionTicks', 1);
  const deadlineMs = requireMilliseconds(options.deadlineMs ?? DEFAULT_DEADLINE_MS, 'deadlineMs');
  const graceMs = requireMilliseconds(options.graceMs ?? DEFAULT_GRACE_MS, 'graceMs');

  const conversation = openAgent(options.script);
  // The process plays this Faction, so its own Controller is the idle one and is
  // never asked: `answer` answers for it, out of the pipe. A Match still needs
  // two Players, because a Match is two Factions and the order they decide in is
  // the log's.
  const agentPlayer: Player<SiegeVisible> = { faction: options.faction, controller: idleController() };
  const other: Faction = options.faction === 'rome' ? 'carthage' : 'rome';
  const players: Players<SiegeVisible> = [
    agentPlayer,
    {
      faction: other,
      controller:
        options.opponent === 'ai' ? createArmyController(options.difficulty) : idleController<SiegeVisible>(),
    },
  ];

  const transcript: Transcript = { decisions: 0, commands: 0, stoppedBy: null, detail: null };

  const hello = helloMessage({
    faction: options.faction,
    seed: options.seed,
    ticks: options.ticks,
    ticksPerSecond: TICK_HZ,
    decisionTicks,
    deadlineMs,
  });

  try {
    conversation.send(formatMessage(hello));

    const run = await runMatchAsync(
      {
        seed: options.seed,
        ticks: options.ticks,
        rules: siegeMatchRules,
        observe: observeSiege,
        outcome: siegeMatchOutcome,
        players,
      },
      (question) => answer(question, options.faction, decisionTicks, deadlineMs, conversation, transcript),
    );

    conversation.send(formatMessage(endMessage(run.result, run.hash)));

    return {
      ...run,
      agent: {
        faction: options.faction,
        opponent: options.opponent,
        status: transcript.stoppedBy === null ? 'played' : 'stopped',
        stoppedBy: transcript.stoppedBy,
        detail: transcript.detail,
        decisions: transcript.decisions,
        commands: transcript.commands,
      },
    };
  } finally {
    await conversation.close(graceMs);
  }
}

/**
 * One question of the Match, answered by whoever owns that Player.
 *
 * The harness's own Faction is answered by its Controller, in this process, at
 * once. The agent's Faction is answered by the pipe — but only on a decision
 * tick: in between, the answer is silence, which is a legal answer for any
 * Controller and the reason a decision interval exists at all.
 */
async function answer(
  question: Question<SiegeVisible>,
  faction: Faction,
  decisionTicks: number,
  deadlineMs: number,
  conversation: Conversation,
  transcript: Transcript,
): Promise<readonly Command[]> {
  if (question.observation.faction !== faction) {
    return question.player.controller.decide(question.observation);
  }

  if (transcript.stoppedBy !== null) return [];
  if (question.observation.tick % decisionTicks !== 0) return [];

  const tick = question.observation.tick;
  transcript.decisions += 1;

  const reply = await conversation.exchange(
    formatMessage(observationMessage(tick, question.observation.visible)),
    deadlineMs,
  );

  if (reply.kind === 'timeout') {
    return stop(conversation, transcript, 'timeout',
      `no reply to the observation at tick ${tick} within ${deadlineMs} ms`);
  }

  if (reply.kind === 'gone') {
    return stop(conversation, transcript, 'gone', reply.detail);
  }

  try {
    const commands = readReply(reply.line, { faction, tick });

    transcript.commands += commands.commands.length;

    return commands.commands;
  } catch (error) {
    if (!(error instanceof ProtocolError)) throw error;

    return stop(conversation, transcript, 'malformed', `${error.message}: ${truncate(reply.line)}`);
  }
}

/**
 * What the harness has heard from the agent, as the run goes: what it asked, what
 * came back, and what stopped it if anything did.
 *
 * Counters rather than a log, because a whole Match is thousands of questions and
 * what a reader needs afterwards is the tally and the one reason it ended — the
 * log itself is the Command log the Match writes.
 */
interface Transcript {
  /** How many Observations were sent. */
  decisions: number;
  /** How many Commands came back and were accepted. */
  commands: number;
  /** What stopped the Player, or `null` while it is still playing. */
  stoppedBy: StopReason | null;
  /** What happened, in a sentence, when it stopped. */
  detail: string | null;
}

/**
 * The Player stops: the harness says why, once, and then asks nothing more.
 *
 * The Match is not the agent's to end, so this returns the silence that stands in
 * for a Controller with nothing to say, and the run carries on without it.
 */
function stop(
  conversation: Conversation,
  transcript: Transcript,
  reason: StopReason,
  detail: string,
): readonly Command[] {
  transcript.stoppedBy = reason;
  transcript.detail = detail;
  conversation.send(formatMessage(stoppedMessage(reason, detail)));

  return [];
}

/** A line as a verdict can carry it: the whole line when it is short enough to read. */
function truncate(line: string): string {
  const LIMIT = 300;

  return line.length <= LIMIT ? line : `${line.slice(0, LIMIT)}…`;
}

/**
 * A whole number of milliseconds the harness needs to be positive.
 *
 * Milliseconds and not ticks, which is why this is not `requireTickCount`: a
 * deadline is the one number here that is a duration of wall clock, and a name
 * that said "ticks" would be a lie about it.
 *
 * @throws RangeError when the value is not a whole number of at least one.
 */
function requireMilliseconds(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive whole number of milliseconds, got ${String(value)}`);
  }

  return value;
}

/** Whether a promise settled within `ms`, without waiting for it if it did not. */
async function within(settled: Promise<void>, ms: number): Promise<boolean> {
  const timer = new Promise<false>((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, ms).unref();
  });

  return Promise.race([settled.then(() => true), timer]);
}

/** What came back from the agent's side of the pipe for one question. */
type Received =
  | { readonly kind: 'line'; readonly line: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'gone'; readonly detail: string };

/** The pipe to a running agent: lines out, lines back, and the end of it. */
interface Conversation {
  /** Writes one line to the agent. A write to a process that is gone is not an error: it is `gone`. */
  send(line: string): void;

  /**
   * Sends one line and waits for one line back.
   *
   * The deadline is the only place the protocol spends time: on it, the read
   * answers `timeout` and the harness stops asking, so a silent agent costs one
   * deadline and not the whole Match.
   */
  exchange(line: string, deadlineMs: number): Promise<Received>;

  /** Says nothing more, and lets the process go — killing it if it will not go on its own. */
  close(graceMs: number): Promise<void>;
}

/**
 * Starts the agent and opens the pipe.
 *
 * The agent is run by this same Node, so it is a file and not a packaged
 * artifact, and it needs nothing installed to be an agent: `process.execPath` is
 * the interpreter every Match already runs under (ADR-0009). Its standard output
 * is the protocol; its standard error is its own, passed straight through so an
 * agent author can debug one without a second channel in the protocol.
 */
function openAgent(script: string): Conversation {
  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [script], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.pipe(process.stderr, { end: false });

  /** Lines that have arrived and not been read yet. */
  const queued: string[] = [];
  /** What the process's end was, once it has ended. */
  let ended: Received | null = null;
  /** Whoever is waiting for the next line. One question at a time, by construction. */
  let waiting: ((result: Received) => void) | null = null;
  let buffer = '';

  const deliver = (result: Received): void => {
    if (waiting === null) return;

    const resolve = waiting;
    waiting = null;
    resolve(result);
  };

  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;

    let newline = buffer.indexOf('\n');
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);

      if (waiting === null) queued.push(line);
      else deliver({ kind: 'line', line });

      newline = buffer.indexOf('\n');
    }
  });

  child.stdin.on('error', () => {
    // A write to a process that has gone is a Player who stopped, not a failure
    // of the harness: the exit is what the run reports, and the EPIPE is the
    // sound of it already having happened.
  });

  const finish = (detail: string): void => {
    if (ended !== null) return;

    ended = { kind: 'gone', detail };
    deliver(ended);
  };

  child.on('close', (code, signal) => {
    const partial = buffer.length === 0 ? '' : ` after a partial line: ${truncate(buffer)}`;
    finish(`the agent exited (${signal ?? `code ${String(code)}`}) before answering${partial}`);
  });

  child.on('error', (error: Error) => {
    finish(`the agent could not be started: ${error.message}`);
  });

  const exited = new Promise<void>((resolve) => {
    child.on('close', () => {
      resolve();
    });
  });

  return {
    send: (line) => {
      if (ended !== null || !child.stdin.writable) return;

      child.stdin.write(line);
    },

    exchange: (line, deadlineMs) => {
      if (ended !== null) return Promise.resolve(ended);

      // The question is always asked, even when an answer is already waiting: a
      // line that arrived before it was asked for is an agent answering out of
      // turn, and reading it as the answer to this question would be the harness
      // covering for it. `readReply` refuses it on the tick instead.
      if (child.stdin.writable) child.stdin.write(line);

      const earlier = queued.shift();
      if (earlier !== undefined) return Promise.resolve({ kind: 'line', line: earlier });

      return new Promise<Received>((resolve) => {
        const timer = setTimeout(() => {
          waiting = null;
          resolve({ kind: 'timeout' });
        }, deadlineMs);

        waiting = (result) => {
          clearTimeout(timer);
          resolve(result);
        };
      });
    },

    close: async (graceMs) => {
      // It is let go before it is killed: a process that has stopped playing has
      // already been told so, and closing its input is the last thing it hears.
      if (ended === null && child.stdin.writable) child.stdin.end();
      if (await within(exited, graceMs)) return;

      if (child.exitCode === null && child.signalCode === null) child.kill();
      if (await within(exited, graceMs)) return;

      // A process that will not go is not allowed to hold the harness open.
      child.kill('SIGKILL');
      await exited;
    },
  };
}
