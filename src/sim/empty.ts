/**
 * The empty Match: a Match with the engine and the seam, and no systems at all.
 *
 * B1 to C5 build the world — the map, the seasons, the economy, the Squads,
 * combat and siege — and until one of them lands there is nothing for a tick to
 * do. That is not a reason for a whole Match to be unrunnable: A4's job is the
 * harness around it, and a Match that runs to its bound with nothing in it is
 * enough to prove that the seed, the two Factions, the tick loop, the event log
 * and the state hash all work end to end with no browser anywhere (ADR-0003).
 *
 * So this module is deliberately empty, in both senses:
 *
 * - The world holds nothing, because nothing exists to hold. It is still
 *   integer state, so it still serializes and still hashes.
 * - No rule decides anything. The Match ends by the bound its caller set, which
 *   is the driver's own explicit rule and the outcome a tournament counts as
 *   "decided by the clock" (§5 of the plan). B5 gives the Match a season clock
 *   and C5 the rules that end it sooner — an enemy Stronghold taken — and this
 *   module is what they replace.
 *
 * A Controller may emit whatever it likes into an empty Match: every Command in
 * the vocabulary is well formed, the driver logs it and ownership-checks it, and
 * the world has nothing that could care. That is the seam working, not a rule
 * missing.
 */
import type { Command } from './command.ts';
import type { MatchSetup } from './driver.ts';
import type { MatchRules } from './match.ts';

/**
 * What the rules own in a Match with no systems: nothing.
 *
 * `Record<never, never>` rather than an empty interface, because it says the
 * same thing and a reader cannot mistake it for a shape someone forgot to fill
 * in. State may hold it: `serializeState` writes it as `{}` and the hash covers
 * it like any other record.
 */
export type EmptyMatchWorld = Record<never, never>;

/** What a Faction may see of it: the same nothing, for the same reason (GLOSSARY: Observation). */
export type EmptyMatchVisible = Record<never, never>;

/**
 * The rules of the empty Match: build a world that holds nothing, and change
 * nothing when a tick goes by.
 *
 * The seed builds no world, and the rules draw nothing from the Match's random
 * source, so two empty Matches on the same seed and bound are the same Match —
 * which is what lets the CLI's hash be a golden value (ADR-0006).
 */
export const emptyMatchRules: MatchRules<EmptyMatchWorld, Command> = {
  createWorld: () => ({}),
  step: () => {},
};

/**
 * What a Faction may see: nothing, and the same nothing for both of them.
 *
 * An Observation is still an Observation — stamped with the Faction looking and
 * the tick being decided by the driver — but there is no world behind it yet,
 * and a Controller that reads it learns exactly that. The type is `MatchSetup`'s
 * own, so the driver's expectations and this cannot drift; the implementation
 * takes no world because in an empty Match there is nothing to project.
 */
export const observeEmptyMatch: MatchSetup<EmptyMatchWorld, EmptyMatchVisible>['observe'] = () => ({});

/**
 * The verdict of the empty Match: none, ever.
 *
 * Nothing in an empty Match can be lost, so no rule can call it won, lost or
 * drawn, and the run ends by the bound it was given. Returning `null` is the
 * empty Match's honest answer to "is it over?" — and the reason the CLI's
 * default run reports the clock, until C5 gives the rules something to decide.
 */
export const emptyMatchOutcome: MatchSetup<EmptyMatchWorld, EmptyMatchVisible>['outcome'] = () => null;
