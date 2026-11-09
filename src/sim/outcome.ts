/**
 * The verdict: how a Match ended, and why (GLOSSARY: Match).
 *
 * Three words and two tagged records, in a module of their own because two
 * things that are not the driver need them. The rules' answer to "has this Match
 * ended" is what a *replay* asks of a world it has just re-enacted (E2), and the
 * ending a record carries is a `MatchResult` — neither is about asking a
 * Controller anything, so neither should have to reach into the loop that does
 * (ADR-0022). The driver imports them from here and re-exports them, so the
 * vocabulary a caller already uses has not moved.
 *
 * The split is the one C5 drew: an **Outcome** is what the rules decided and says
 * nothing about when — the tick belongs to the run — and a **MatchResult** is
 * that decision placed on a tick, or the clock reaching its bound. A record holds
 * a `MatchResult`, because "it ended" and "when it ended" are one fact about a
 * Match that has been played.
 */
import type { Faction } from './faction.ts';
import type { SiegePath } from './command.ts';

/**
 * Why the rules ended a Match: what fell, and how it fell.
 *
 * A sentence would be the report's job and a code would say too little, so a
 * reason is a small tagged record: the winner is in the `Outcome`, the tick is
 * the run's, and this is the one thing left — what happened. C5 is the first
 * system that can name one, and the union grows with the reasons a later rule
 * decides rather than with the report's vocabulary.
 */
export type VictoryReason =
  | {
      /** An enemy Stronghold fell: the Match is over (GLOSSARY: Stronghold). */
      readonly kind: 'stronghold';
      /** The settlement id of the Stronghold that fell. */
      readonly stronghold: number;
      /** Which path of the Siege took it (ADR-0008). */
      readonly path: SiegePath;
    }
  | {
      /** The enemy has neither settlements nor Squads left. */
      readonly kind: 'annihilation';
    };

/**
 * What the rules say about a Match that has ended: who won, or that nobody did.
 *
 * The *reason* — a Stronghold fallen, an army annihilated — is the rules' to
 * name, because only they saw what happened; C5 is where a Match first ends
 * sooner than its bound, and the reason is what makes "why did I lose" a
 * question with an answer. A Match the rules never decide ends by the clock
 * instead, which is a fact about the run and not about the world, so it is
 * `MatchResult`'s to carry.
 */
export type Outcome =
  | { readonly kind: 'victory'; readonly winner: Faction; readonly reason: VictoryReason }
  | { readonly kind: 'draw' };

/** How a Match ended: what the rules decided, or that it ran out of ticks. */
export type MatchResult =
  | {
      readonly kind: 'victory';
      readonly winner: Faction;
      readonly reason: VictoryReason;
      readonly tick: number;
    }
  | { readonly kind: 'draw'; readonly tick: number }
  | { readonly kind: 'clock'; readonly tick: number };

/**
 * Whether two endings are the same ending.
 *
 * Compared field by field rather than by identity or by JSON, because the two are
 * built in different places — one by a record's reader off a file, the other by a
 * replay from a world — and what E2 asks is whether they *say* the same thing, not
 * whether they were made the same way.
 */
export function sameEnding(left: MatchResult, right: MatchResult): boolean {
  switch (left.kind) {
    case 'clock':
      return right.kind === 'clock' && left.tick === right.tick;

    case 'draw':
      return right.kind === 'draw' && left.tick === right.tick;

    case 'victory':
      return (
        right.kind === 'victory' &&
        left.tick === right.tick &&
        left.winner === right.winner &&
        sameReason(left.reason, right.reason)
      );
  }
}

/** Whether two reasons say the same thing: which settlement fell, and by which path of the Siege. */
function sameReason(left: VictoryReason, right: VictoryReason): boolean {
  switch (left.kind) {
    case 'stronghold':
      return (
        right.kind === 'stronghold' && left.stronghold === right.stronghold && left.path === right.path
      );

    case 'annihilation':
      return right.kind === 'annihilation';
  }
}
