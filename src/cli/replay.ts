/**
 * Replaying a record, and reading the verdict (E2).
 *
 * This is the other half of `record.ts`: a record says what happened, and this
 * says whether it still happens. There is nothing clever in it — the Match is
 * re-enacted from the seed and the log through the same `replay` the engine has
 * always had — and the one thing it adds is the comparison, which is what turns a
 * replay into an instrument.
 *
 * ## Two ways a record stops being true
 *
 * A replay can part from its record in either of two ways, and they are different
 * kinds of news:
 *
 * - **The hashes**, at a tick. The world this build computes is not the world the
 *   record was made on: a rule that moves a number, a content table edit, a draw
 *   taken at the wrong moment. That is the divergence a bug report is made of, and
 *   it names the first checkpoint that disagrees — quoting both — beside the last
 *   checkpoint the two still agreed on, so the window is the reader's to see
 *   rather than the report's to hide.
 * - **The ending**, at the tick the record says the Match ended. Not every rule
 *   change moves the world: a Match can be *decided* differently — sooner, later,
 *   by a different winner, or not at all — while every checkpoint still matches,
 *   because "is this Match over" is a question about the world and the rules
 *   together and the hash only covers the world. So the ending is derived again,
 *   from this build's own verdict for the name, and compared with the record's.
 *
 * The hash divergence is reported first when both happen, because it is the one
 * that names a tick; the ending is in the report either way, said in the words a
 * Match's own report would use.
 */
import { sameEnding } from '../sim/outcome.ts';
import type { MatchResult } from '../sim/outcome.ts';
import { divergenceOf, type Divergence } from '../sim/replay.ts';
import { RULES, type MatchReplay } from './rules.ts';
import type { MatchRecord } from './record.ts';
import { endingWords, verdictOf, type Verdict } from './report.ts';

/**
 * Where a replay stopped being its record.
 *
 * Tagged rather than two optional fields, so a caller cannot read a half-filled
 * report and so the two kinds can be reported in the words each of them needs: a
 * tick and two hashes for one, two endings for the other.
 */
export type Departure =
  | {
      /** The runs part at a tick, and the two hashes there are what says so. */
      readonly kind: 'hashes';
      readonly divergence: Divergence;
    }
  | {
      /** Every checkpoint matches, and the rules end the Match differently anyway. */
      readonly kind: 'ending';
      readonly recorded: MatchResult;
      readonly replayed: MatchResult;
    };

/** What replaying a record produced: the ending this build reaches, and whether it is the record's. */
export interface ReplayReport extends Verdict {
  /** The seed the Match ran on: the record's, unchanged. */
  readonly seed: number;

  /** Which Match was replayed, by the name `--rules` uses. */
  readonly rules: MatchRecord['rules'];

  /** The tick the Match ended on, which is how many ticks were replayed. */
  readonly ticks: number;

  /** How many ticks apart the record's fingerprints were taken. */
  readonly everyTicks: number;

  /** How many checkpoints were compared: what `reproduced` is a statement about. */
  readonly checkpoints: number;

  /** The state hash this replay ended on: the record's own, when it reproduced. */
  readonly hash: string;

  /** Whether the Match happened again exactly, or parted from its record. */
  readonly verdict: 'reproduced' | 'diverged';

  /** Where it parted, when it did. */
  readonly departure?: Departure;
}

/**
 * Replays a record and reports whether the Match it describes still happens.
 *
 * No Controllers anywhere: a record is replayed from its seed and its log, which
 * is what makes an agent's Match — a Match whose Players were processes — replay
 * in a process that could not talk to them. The ending beside it is this build's
 * own verdict on the world it reached, not the record's repeated back.
 */
export function replayRecord(record: MatchRecord): ReplayReport {
  const ticks = record.result.tick;
  const replayed = RULES[record.rules].replay({
    seed: record.seed,
    log: record.log,
    ticks,
    everyTicks: record.everyTicks,
    ...(record.difficulty === undefined ? {} : { difficulty: record.difficulty }),
  });
  const departure = departureOf(record, replayed);

  return {
    seed: record.seed,
    rules: record.rules,
    ticks,
    everyTicks: record.everyTicks,
    checkpoints: record.checkpoints.length,
    ...verdictOf(replayed.ending),
    hash: replayed.hash,
    verdict: departure === undefined ? 'reproduced' : 'diverged',
    ...(departure === undefined ? {} : { departure }),
  };
}

/** Where, if anywhere, the replay stopped being the Match the record describes. */
function departureOf(record: MatchRecord, replayed: MatchReplay): Departure | undefined {
  const divergence = divergenceOf(record.checkpoints, replayed.checkpoints);

  if (divergence !== null) return { kind: 'hashes', divergence };
  if (!sameEnding(replayed.ending, record.result)) {
    return { kind: 'ending', recorded: record.result, replayed: replayed.ending };
  }

  return undefined;
}

/**
 * A replay that did not reproduce the Match it was given.
 *
 * Not a broken harness: the harness worked, and that is the news. A departure is
 * what a change to a game rule is supposed to produce, so this is the loud,
 * readable form of "this build is not the build that record was made on", with the
 * tick and both hashes — or both endings — in the sentence a CI log will hold.
 */
export class DivergenceError extends Error {
  /** Where the two runs stopped agreeing, and what each of them was there. */
  readonly divergence: Divergence;

  constructor(divergence: Divergence) {
    super(sentenceOf(divergence));
    this.name = 'DivergenceError';
    this.divergence = divergence;
  }
}

/** The rules ended the Match differently, with every checkpoint still matching. */
export class EndingError extends Error {
  /** How the record says the Match ended. */
  readonly recorded: MatchResult;

  /** How this build's rules ended it instead. */
  readonly replayed: MatchResult;

  constructor(recorded: MatchResult, replayed: MatchResult) {
    super(
      `the record and this replay ended differently: the record says "${endingWords(recorded)}", and ` +
        `this build's rules say "${endingWords(replayed)}". The world agrees — every checkpoint matches — ` +
        'so what changed is when, or whether, the rules end a Match',
    );
    this.name = 'EndingError';
    this.recorded = recorded;
    this.replayed = replayed;
  }
}

/**
 * @throws DivergenceError when the runs part at a tick, and `EndingError` when only
 *   the ending they reach does — either way, the command exits non-zero on the one
 *   thing this instrument is for.
 */
export function requireReproduced(report: ReplayReport): void {
  const departure = report.departure;
  if (departure === undefined) return;

  throw departure.kind === 'hashes'
    ? new DivergenceError(departure.divergence)
    : new EndingError(departure.recorded, departure.replayed);
}

/**
 * A divergence in one sentence: the tick, both hashes, and how far back the two
 * runs were still the same Match.
 *
 * The "before" clause is what stops the sentence being read as a precision it
 * does not have: the checkpoints are taken at an interval, so the runs were
 * already different somewhere in the window and this is the first place a
 * fingerprint could see it.
 */
function sentenceOf(divergence: Divergence): string {
  const prefix =
    `the record and this replay diverged at tick ${String(divergence.tick)}: ` +
    `the record has ${divergence.recorded}, and this run reached ${divergence.replayed}`;

  if (divergence.agreedAt === null) {
    return `${prefix}. The two never agreed: the world this seed builds is not the world the record was made on`;
  }

  return `${prefix}. They were still the same Match at tick ${String(divergence.agreedAt)}`;
}

/** The report as the text the command writes: pretty-printed JSON and a final newline. */
export function formatReplayReport(report: ReplayReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
