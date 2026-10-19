/**
 * Playing a batch of AI-vs-AI Matches, and spreading it over the machine (E3).
 *
 * A tournament is a batch of Matches that have nothing to do with each other: one
 * seed each, no shared state, no order. That is what makes the whole thing
 * cheap — the driver already runs ticks as fast as the processor allows, and the
 * independent Matches can run on the processor's other cores at the same time.
 *
 * ## Why worker threads, and why the report does not know
 *
 * A full batch is two hundred Matches of up to forty-two game minutes each, which
 * is around twenty seconds of simulation apiece: about an hour on one core, and
 * five minutes on twelve. That is the difference between "the balance number" and
 * "an overnight job", which is the whole reason the simulation ticks at ten hertz
 * (PLAN §3, §6). Node's `worker_threads` is the mechanism, and it is deliberately
 * the only place in this project that knows Machines Have More Than One Core.
 *
 * Nothing about the result may depend on it. Each Match is played to completion in
 * its own thread and answers with a summary; the summaries are collected here and
 * sorted by seed, so the report of a batch is the same bytes at one worker as at
 * twelve (`tournamentReportOf` sorts and refuses a seed twice). That equality is
 * a test, not a hope: a balance number that moved when the machine got busier
 * would be worth nothing.
 *
 * ## Why a Match that breaks breaks the batch
 *
 * A Match that throws is a bug in the rules — not a Match that could not be
 * played, but a build that cannot be measured. So the batch stops and names the
 * seed, rather than reporting a balance number computed over a sample nobody
 * knows the size of. The alternative, dropping the Match and carrying on, would
 * quietly change what the report is a report *of*.
 *
 * ## Why the decision logs are kept apart from the report
 *
 * A Match's decision log is twenty megabytes of JSON: every candidate every
 * behaviour proposed, on every tick, with the utility that decided it. Two
 * hundred of those is four gigabytes, so they are not in the report and are not
 * written by default — `--keep <dir>` writes them, one file per seed, and the
 * file is the very report `npm run match -- --rules ai --seed <seed>` prints for
 * that Match. Without `--keep` a Match is retrieved the same way, from the seed
 * the report names, and its `hash` is what proves the Match retrieved is the
 * Match measured (E2).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { DifficultyName } from '../ai/difficulty.ts';
import { playAiMatchAt, type AiMatchRun } from './ai-match.ts';
import { InputError } from './failure.ts';
import { formatReport, reportOf } from './report.ts';
import { tournamentReportOf, type MatchSummary, type TournamentReport, type TournamentSetup } from './tournament.ts';

/**
 * One Match of a batch, as it is handed to whichever thread plays it: which seed,
 * how long it may run, at what difficulty, and where its decision log goes.
 *
 * This is the whole message a worker receives, and it is all a Match needs — a
 * Match is a seed and a build, and the rest is the paperwork of a batch.
 */
export interface MatchRequest {
  readonly seed: number;
  readonly ticks: number;
  readonly difficulty: DifficultyName;

  /** The directory to write this Match's decision log to, or `null` to keep none. */
  readonly keep: string | null;
}

/**
 * What a worker answers with: a Match that was played, or the reason it was not.
 *
 * A failure carries its `kind` because the two are different mistakes with
 * different exit codes, and the thread is not allowed to flatten them into one:
 * a `match` is a build that cannot play a Match (exit 1), an `input` is a
 * decision log that could not be written where the caller asked for it (exit 2).
 * What the caller's path was is the caller's business, and it stays visible.
 */
export type MatchReply =
  | { readonly ok: true; readonly summary: MatchSummary }
  | { readonly ok: false; readonly error: string; readonly kind: 'input' | 'match' };

/**
 * What a tournament is asked to do: a batch of seeds, and how to spread them.
 *
 * The three fields that shape a Match are the ones `TournamentSetup` reports —
 * difficulty, bound, first seed — and the two that shape the *batch* are how many
 * Matches at once, and where the decision logs go if anywhere.
 */
export interface BatchOptions {
  /** How many Matches to play: one per seed, and therefore how many seeds. */
  readonly seeds: number;

  /** The first seed; the batch plays it and the ones that follow. */
  readonly firstSeed: number;

  /** The bound each Match is given, in ticks. */
  readonly ticks: number;

  /** The level both AIs play at. */
  readonly difficulty: DifficultyName;

  /** How many Matches to play at once: the machine's cores, by default from the CLI. */
  readonly workers: number;

  /** Where to write each Match's decision log, or `null` to keep none. */
  readonly keep: string | null;
}

/**
 * A Match of the batch could not be played, and the batch cannot be measured
 * without it.
 *
 * It carries the seed because that is the one thing a reader needs: the Match is
 * reproducible from it, so the seed is how the broken one is played again by
 * hand. The message is whatever the rules threw, kept as it was thrown rather
 * than re-worded — a rules bug is read in the rules' own words.
 */
export class BrokenMatchError extends Error {
  /** The seed of the Match that broke. */
  readonly seed: number;

  constructor(seed: number, reason: string) {
    super(`the Match on seed ${String(seed)} could not be played: ${reason}`);
    this.name = 'BrokenMatchError';
    this.seed = seed;
  }
}

/**
 * Plays a whole tournament: one Match for each seed of the batch, and the report
 * of what they add up to.
 *
 * The Matches are played in parallel up to `workers` at a time and collected
 * here, so the report is in seed order whatever order they finished in.
 *
 * `played` is told how many Matches are done each time one is, because a batch
 * takes minutes and a command that says nothing for minutes is indistinguishable
 * from one that has hung. It is the only part of a batch that knows how long a
 * batch has been running, and it deliberately cannot reach the report: a
 * tournament's numbers are a function of the seeds and the build, and how long
 * the machine took over them is not one of them (ADR-0024).
 *
 * @throws BrokenMatchError when a Match of the batch could not be played — a bound
 *   the rules refuse, a rule that threw, a thread that died. A Match that cannot
 *   exist is reported as one that broke, because from the batch's side the two are
 *   one thing: a seed whose result is missing.
 * @throws InputError when the directory the decision logs go to cannot be made, or
 *   one of them could not be written — the caller's path either way, so the
 *   command exits 2 for it and not as a broken Match.
 * @throws RangeError when the batch cannot exist at all: no seeds, or a seed twice.
 */
export async function runTournament(
  options: BatchOptions,
  played?: (done: number, total: number) => void,
): Promise<TournamentReport> {
  const seeds = seedsOf(options);
  requireKeepDirectory(options.keep);

  return tournamentReportOf(await playBatch(seeds, options, played), setupOf(options));
}

/**
 * Makes the directory the decision logs are to be written to, before the batch
 * starts, and refuses it if it cannot be made.
 *
 * This is the caller's path, and the caller's mistake, so it is reported as one
 * (exit 2) and it is reported *first*: a directory that cannot be written to is
 * worth knowing about in the first second rather than after four minutes of
 * Matches whose logs all went nowhere. The Matches then write into a directory
 * that is known to exist, which is the whole of what a thread needs to know.
 *
 * @throws InputError when the path cannot be made: a file where a directory was
 *   asked for, or a directory this process may not write to.
 */
function requireKeepDirectory(directory: string | null): void {
  if (directory === null) return;

  try {
    mkdirSync(directory, { recursive: true });
  } catch (error) {
    throw new InputError(
      `the decision logs cannot be written to ${JSON.stringify(directory)}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/**
 * Plays one Match of a batch, in this thread: the AI Match at the requested level,
 * and its decision log written where the batch asked for it.
 *
 * Exported because the worker is another module and this is the whole of what it
 * does: `tournament-worker.ts` is a message handler around this one function, so
 * that the work is somewhere it can be read and called in the ordinary way. It is
 * exercised through a real thread by `tournament-batch.test.ts`, which plays
 * batches and reads the files they wrote.
 *
 * @throws InputError when the decision log cannot be written: the caller named a
 *   directory that cannot be made, or cannot be written to.
 * @throws whatever the rules throw, which `playBatch` reports as a broken Match.
 */
export function playTournamentMatch(request: MatchRequest): MatchSummary {
  const run = playAiMatchAt(request.seed, request.ticks, request.difficulty);

  if (request.keep !== null) writeDecisionLog(request.keep, run);

  return summaryOf(run);
}

/**
 * Where a Match's decision log goes: one file per seed, named after the seed.
 *
 * By a rule rather than by a path in the report, so that the report does not
 * depend on whether logs were kept (see the note at the top of this file): a
 * reader who typed `--keep tour` knows where seed 17's log is, and a report that
 * had to carry the path would be a different report every time it was written
 * somewhere else.
 */
function decisionLogPath(directory: string, seed: number): string {
  return join(directory, `${String(seed)}.json`);
}

/**
 * The one summary a Match contributes to the report, read off its own report.
 *
 * Off the report rather than off the run wherever the report has the answer,
 * because the decision log this batch writes *is* that report (`formatReport`): a
 * summary computed a second way would be a second opinion about what a Match did,
 * and the two would drift the first time the report gained a field.
 *
 * `victoryReason` is the one field the report cannot supply. A Match's report says
 * why it ended in a sentence — "rome won the Match: the carthage Stronghold fell
 * to an assault" — because that is what a reader of one Match wants, and a batch
 * wants the code: the reason a Match is classed lopsided is a value to compare,
 * not a sentence to parse. So it is read from the result the rules gave, which is
 * where the sentence was written from in the first place.
 */
function summaryOf(run: AiMatchRun): MatchSummary {
  const report = reportOf(run);

  return {
    seed: report.seed,
    outcome: report.outcome,
    winner: report.winner,
    victoryReason: run.result.kind === 'victory' ? run.result.reason.kind : null,
    ticks: report.ticks,
    decisions: report.decisions?.length ?? 0,
    commands: report.commands,
    hash: report.hash,
  };
}

/**
 * Writes one Match's decision log: the report `npm run match -- --rules ai`
 * prints for it, decisions and all.
 *
 * Written as a whole file rather than appended to, because a Match's log is a
 * document about one Match and nothing else: a second run of the same seed would
 * overwrite it with a log that says exactly the same thing (the seed and the build
 * are the Match), so there is nothing to append and no ordering to preserve.
 *
 * @throws InputError when the directory cannot be made or the file cannot be
 *   written — the caller's path, reported as the caller's mistake.
 */
function writeDecisionLog(directory: string, run: AiMatchRun): void {
  try {
    mkdirSync(directory, { recursive: true });
    writeFileSync(decisionLogPath(directory, run.seed), formatReport(reportOf(run)));
  } catch (error) {
    throw new InputError(
      `the decision log for seed ${String(run.seed)} could not be written to ${JSON.stringify(directory)}: ` +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/**
 * The seeds of the batch: `firstSeed` and the `seeds - 1` that follow it.
 *
 * Distinct by construction, which is what the ticket asks of a batch: a balance
 * number measured on the same seed twice is a measurement of that seed.
 */
function seedsOf(options: BatchOptions): readonly number[] {
  return Array.from({ length: options.seeds }, (_, index) => options.firstSeed + index);
}

/** The batch as the report states it: what the Matches were played at. */
function setupOf(options: BatchOptions): TournamentSetup {
  return { difficulty: options.difficulty, bound: options.ticks, firstSeed: options.firstSeed };
}

/**
 * Plays every seed of the batch, filling `workers` slots until the seeds run out.
 *
 * A slot is a thread, spawned once and handed one Match at a time until there is
 * nothing left to play, rather than a thread per Match: loading this project's
 * module graph costs more than a short Match does, and a hundred Matches would pay
 * that cost a hundred times.
 *
 * The seeds are handed out from one counter, and the counter is only ever touched
 * between two `await`s, so no two slots can take the same seed without a lock.
 */
async function playBatch(
  seeds: readonly number[],
  options: BatchOptions,
  played?: (done: number, total: number) => void,
): Promise<readonly MatchSummary[]> {
  if (seeds.length === 0) {
    throw new RangeError('a tournament is a batch of Matches, and this batch asks for none');
  }

  const base: Omit<MatchRequest, 'seed'> = { ticks: options.ticks, difficulty: options.difficulty, keep: options.keep };
  const size = Math.min(Math.max(1, options.workers), seeds.length);
  const summaries: MatchSummary[] = [];
  let next = 0;

  const take = (): number | undefined => {
    const seed = seeds[next];
    if (seed === undefined) return undefined;

    next += 1;
    return seed;
  };

  const drain = async (): Promise<void> => {
    const slot = openSlot(base);

    try {
      for (let seed = take(); seed !== undefined; seed = take()) {
        summaries.push(await slot.play(seed));
        played?.(summaries.length, seeds.length);
      }
    } finally {
      await slot.close();
    }
  };

  await Promise.all(Array.from({ length: size }, drain));

  return summaries;
}

/** One thread of the batch: a worker, and the one Match it is playing right now. */
interface Slot {
  /** Plays one Match in this thread, and answers with what it did. */
  play(seed: number): Promise<MatchSummary>;

  /** Stops the thread. The batch's slots are not reused by anything else. */
  close(): Promise<void>;
}

/** A Match a slot is waiting on: its seed, and who to tell when the answer is in. */
interface Pending {
  readonly seed: number;
  readonly resolve: (summary: MatchSummary) => void;
  readonly reject: (error: Error) => void;
}

/** The thread entry point: the one file that is a worker and not a module to import. */
const WORKER = new URL('./tournament-worker.ts', import.meta.url);

/**
 * A thread to play Matches in, and the protocol of one question and one answer.
 *
 * The worker is asked one Match at a time and answers before it is asked again, so
 * a reply belongs to the one question outstanding. That is what makes this small:
 * there is no queue of replies to match up, and no id to match them by.
 *
 * A thread that dies has nothing to answer with, so the Match it was playing is
 * reported as broken rather than waited for: a worker that crashed or exited is
 * exactly the "cannot be played" this batch stops on.
 */
function openSlot(base: Omit<MatchRequest, 'seed'>): Slot {
  const worker = new Worker(WORKER);
  let pending: Pending | null = null;
  let broken: string | null = null;

  const fail = (reason: string): void => {
    broken ??= reason;
    const waiting = pending;
    pending = null;
    waiting?.reject(new BrokenMatchError(waiting.seed, reason));
  };

  worker.on('message', (reply: MatchReply) => {
    const waiting = pending;
    pending = null;
    if (waiting === null) return;

    if (reply.ok) waiting.resolve(reply.summary);
    else if (reply.kind === 'input') waiting.reject(new InputError(reply.error));
    else waiting.reject(new BrokenMatchError(waiting.seed, reply.error));
  });

  worker.on('error', (error: unknown) => {
    fail(error instanceof Error ? error.message : String(error));
  });

  worker.on('exit', (code) => {
    if (pending !== null) fail(`the thread it was playing in stopped with code ${String(code)}`);
  });

  return {
    play(seed: number): Promise<MatchSummary> {
      if (broken !== null) return Promise.reject(new BrokenMatchError(seed, broken));

      return new Promise<MatchSummary>((resolve, reject) => {
        pending = { seed, resolve, reject };
        worker.postMessage({ ...base, seed } satisfies MatchRequest);
      });
    },

    async close(): Promise<void> {
      await worker.terminate();
    },
  };
}
