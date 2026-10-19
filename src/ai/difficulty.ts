/**
 * The three difficulty levels an AI opponent plays at (PLAN §4, D5).
 *
 * Difficulty changes the opponent's *thinking* and nothing else. It never
 * grants a Faction resources, production or vision: those are the rules', and a
 * difficulty that reached them would be dishonest against the Observation
 * contract and would make balance impossible to measure. Every number here is a
 * threshold or a clock the behaviours read, so a Match at a harder level is the
 * same Match decided better — or at least sooner, and more boldly.
 *
 * Four axes, in the plan's own words:
 *
 * - **Planning horizon** (`horizonSeasons`) — how many Seasons of Payroll and
 *   food the plan holds back before it spends. A longer horizon is a general who
 *   has thought past this Season.
 * - **Aggression** (`aggression`) — how slim an observed advantage is enough to
 *   attack on. `attackPercent` turns the score into the margin a line needs.
 * - **Reaction time** (`reactionSeconds`) — how often the operational clock
 *   decides. A slower general is not weaker; he is later.
 * - **Scouting quality** (`scoutsPer`, `refreshSeconds`) — how large a share of
 *   the army explores, and how soon a last-known contact is worth refreshing.
 *
 * Nothing about the level belongs to the simulation: it lives in `ai/` and
 * leaves as Commands an ordinary Controller could have emitted.
 */

/** The three levels, from the rawest recruit to the general who wins wars. */
export type DifficultyName = 'tiro' | 'centurio' | 'imperator';

/**
 * The three levels, in the order a menu offers them: the rawest first.
 *
 * The names a caller can type, spelled once: `--difficulty` on the tournament
 * command reads this list, its refusal quotes it, and the table below is keyed by
 * it, so a level cannot exist without being playable or be playable without
 * existing.
 */
export const DIFFICULTY_NAMES: readonly DifficultyName[] = ['tiro', 'centurio', 'imperator'];

/** One level's numbers: four axes, and the name they add up to. */
export interface Difficulty {
  /** Which difficulty this is. */
  readonly name: DifficultyName;

  /** Reaction time: the seconds between operational decisions. */
  readonly reactionSeconds: number;

  /** Aggression, 0 to 100: higher attacks on a slimmer margin. */
  readonly aggression: number;

  /** Planning horizon: Seasons of Payroll and food the plan holds back. */
  readonly horizonSeasons: number;

  /** Scouting quality: one light Squad explores per this many, before the enemy is found. */
  readonly scoutsPer: number;

  /** Scouting quality: one light Squad patrols per this many, once the enemy is found. */
  readonly scoutsPerFound: number;

  /** Scouting quality: how stale, in seconds, a contact is before a patrol refreshes it. */
  readonly refreshSeconds: number;
}

/**
 * Tiro, Centurio and Imperator, hardest last.
 *
 * Tiro decides every minute, attacks only with a clear edge, keeps a short
 * horizon and barely scouts. Imperator decides every fifteen seconds, accepts a
 * slim margin, plans three Seasons ahead and sends half the army to look. D2's,
 * D3's and D4's shipped numbers are Centurio's — 125%, a two-Season payroll and
 * a three-Season grain floor — so the engine's baseline is the middle of the
 * three rather than one extreme.
 */
export const DIFFICULTY: Readonly<Record<DifficultyName, Difficulty>> = Object.freeze({
  tiro: Object.freeze({ name: 'tiro', reactionSeconds: 60, aggression: 30,
    horizonSeasons: 1, scoutsPer: 5, scoutsPerFound: 12, refreshSeconds: 60 }),
  centurio: Object.freeze({ name: 'centurio', reactionSeconds: 30, aggression: 45,
    horizonSeasons: 2, scoutsPer: 3, scoutsPerFound: 8, refreshSeconds: 30 }),
  imperator: Object.freeze({ name: 'imperator', reactionSeconds: 15, aggression: 75,
    horizonSeasons: 3, scoutsPer: 2, scoutsPerFound: 5, refreshSeconds: 15 }),
});

/** Whether a string names a level: what a command line asks before refusing one. */
export function isDifficultyName(value: string): value is DifficultyName {
  return (DIFFICULTY_NAMES as readonly string[]).includes(value);
}

/**
 * The friendly power, as a percent of the observed threat, that justifies a
 * fight: 115% for the most aggressive general, 130% for the least.
 *
 * It is a function rather than a column so the two cannot drift apart, and it
 * never falls to 100 or below: no level is allowed to call an even fight a
 * favourable one. Centurio's 125% is exactly the `4/5` the field shipped with.
 */
export function attackPercent(difficulty: Difficulty): number {
  return 140 - Math.floor(difficulty.aggression / 3);
}
