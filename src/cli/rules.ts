/**
 * The Matches the command line can play, by name: which rules each name selects.
 *
 * The word is "rules" and not "scenario": these are the `MatchRules` the command
 * plays, and the glossary reserves "scenario" for something a Match is not
 * (GLOSSARY: Match, whose _Avoid_ list includes it).
 *
 * This is a harness concern, not game content, which is why it lives here and
 * not under `sim/`: the world the game will have is built by B1 to C5, and
 * nothing in this file is part of it. What a name is for is one small thing —
 * to hand the driver a Match the CLI can play, so that CI can record the state
 * hash it ends on and fail when that hash moves (ADR-0003, ADR-0006).
 *
 * There are two names, and the second exists for one reason. The **empty**
 * Match draws nothing: `emptyMatchRules.step` is a no-op, so its golden hash is
 * the seed expanded, the clock at the bound and the world it started with —
 * a real proof that `xmur3`'s expansion, the canonical form and the hash are
 * portable across machines, and no proof at all about the draw loop, which is
 * where `Math.imul`, `| 0` and `>>> 0` live and where an implementation that
 * disagreed between engines would hide (A5 review, F5). The **drawing** Match
 * below draws on every tick, so the same gate covers `sfc32` itself.
 *
 * The rules here hold integers only, for the ordinary reason: they are
 * authoritative state, `serializeState` accepts nothing else, and the hash is
 * what CI compares (ADR-0006).
 *
 * The two Matches have different worlds and different visibilities, so the
 * table below holds a function per name and not a `MatchSetup`: each entry
 * plays *its own* Match, in the only types that Match has, and one common type
 * would have to be a lie about one of them.
 */
import {
  emptyMatchOutcome,
  emptyMatchRules,
  idleController,
  observeEmptyMatch,
  runMatch,
  type Command,
  type EmptyMatchVisible,
  type EmptyMatchWorld,
  type MatchRules,
  type MatchRun,
  type MatchSetup,
  type Players,
} from '../sim/index.ts';

/**
 * What the rules own in the drawing Match: integers, and nothing else.
 *
 * Every field is a draw's own output, put in state rather than discarded, so
 * the hash is a function of what the generator produced: a draw that quietly
 * stopped happening would move the hash rather than pass unnoticed. There is
 * no counter of ticks here, because the cursor already says how far the stream
 * has been read and `MatchState.tick` says how long the Match has run.
 */
export interface DrawsWorld {
  /** The last whole word drawn: the output of `nextUint32`, an integer in [0, 2^32). */
  word: number;

  /** The last digit drawn, in [0, 9]: `nextInt`, which goes through the unbiased rejection path. */
  digit: number;

  /** The digits added up as they arrive, so the world carries arithmetic the draws fed. */
  total: number;
}

/**
 * What a Faction may see of it: the same three numbers, and nothing else.
 *
 * A type of its own rather than the world's, because an Observation is not
 * Match state and must never become it (`sim/observation.ts`): the projection
 * below is what a Controller may read, so it says so even where there is
 * nothing to hide.
 */
interface DrawsVisible {
  readonly word: number;
  readonly digit: number;
  readonly total: number;
}

/**
 * The rules of the drawing Match: draw from the Match's random source twice on
 * every tick and remember what came out. No Commands matter, because nothing in
 * this world can be commanded; the tick's whole work is the draws.
 *
 * Both draw paths are exercised deliberately. `nextUint32` is the loop itself,
 * where `Math.imul`, `| 0` and `>>> 0` live; `nextInt(0, 9)` is the rejection
 * loop in `nextBelow`, a second way for the same words to reach state. A Match
 * that drew through only one of them would leave the other ungated.
 */
export const drawsRules: MatchRules<DrawsWorld, Command> = {
  // A world nobody has drawn in yet. The seed is already in the Match's clock
  // and cursor, where the hash covers it (ADR-0006), so it is not repeated here.
  createWorld: () => ({ word: 0, digit: 0, total: 0 }),

  step: (world, rng) => {
    world.word = rng.nextUint32();
    world.digit = rng.nextInt(0, 9);
    world.total += world.digit;
  },
};

/**
 * What a Faction may see of the drawing Match: the three numbers the rules own,
 * projected field by field.
 *
 * Field by field rather than by handing the world over, because a projection
 * that aliases the world is exactly the hole the seam exists to close — a
 * Controller handed it could write authoritative state with no Command and no
 * log (A5 review, F2). Nothing here decides anything, so there is nobody to
 * leak to today; a harness that models the wrong shape is still the wrong shape
 * to copy from tomorrow.
 */
const observeDraws: MatchSetup<DrawsWorld, DrawsVisible>['observe'] = (world) => ({
  word: world.word,
  digit: world.digit,
  total: world.total,
});

/**
 * A drawing Match never decides anything either: nothing in this world can be
 * lost, so it ends by the bound its caller set, exactly as the empty one does.
 */
const drawsOutcome: MatchSetup<DrawsWorld, DrawsVisible>['outcome'] = () => null;

/** The two Players every harness Match runs on: Controllers that watch and decide nothing. */
function idlePlayers<Visible>(): Players<Visible> {
  return [
    { faction: 'rome', controller: idleController<Visible>() },
    { faction: 'carthage', controller: idleController<Visible>() },
  ];
}

/** Plays the empty Match: no systems, no draws, and the tick bound is what ends it. */
function playEmpty(seed: number, ticks: number): MatchRun {
  return runMatch<EmptyMatchWorld, EmptyMatchVisible>({
    seed,
    rules: emptyMatchRules,
    observe: observeEmptyMatch,
    outcome: emptyMatchOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/** Plays the drawing Match: the same driver, onto a world whose rules draw on every tick. */
function playDraws(seed: number, ticks: number): MatchRun {
  return runMatch<DrawsWorld, DrawsVisible>({
    seed,
    rules: drawsRules,
    observe: observeDraws,
    outcome: drawsOutcome,
    players: idlePlayers(),
    ticks,
  });
}

/**
 * The names `--rules` accepts, in the order `--help` lists them.
 *
 * Where `RulesName` is read from, and where the menu's order comes from: the
 * table below is checked against this list in both directions, so a name with
 * no rules, or rules under a name nobody can type, is a type error rather than
 * a use that fails at whatever hour CI runs. `DEFAULT_RULES` spells `empty` a
 * second time, and its type is this list's, so the two cannot disagree.
 */
export const RULES_NAMES = ['empty', 'draws'] as const;

/** A name `--rules` accepts, which is also the only thing the table below is keyed by. */
export type RulesName = (typeof RULES_NAMES)[number];

/** What the table holds for one name: the line `--help` prints, and the Match it plays. */
interface RulesEntry {
  /** One line for `--help`, in the same words the menu and the refusal use. */
  readonly description: string;

  /**
   * Plays this Match from a seed for a bound, through the one driver everything
   * else plays through.
   *
   * A run, not a `MatchSetup`: what a caller wants from a name is the run's
   * result, its log and, above all, the hash CI records. The bound always
   * terminates the Match, so this always returns.
   */
  readonly play: (seed: number, ticks: number) => MatchRun;
}

/**
 * What each name plays, keyed by the name that selects it: one name, one Match,
 * so a name `--rules` accepts and a Match `playMatch` can play cannot disagree.
 */
export const RULES = {
  empty: {
    description: 'the Match with no systems in it: the bound ends it',
    play: playEmpty,
  },

  draws: {
    description: 'a Match whose rules draw every tick, so CI gates the draw loop',
    play: playDraws,
  },
} as const satisfies Readonly<Record<RulesName, RulesEntry>>;

/** The Match played when the command line names no rules. */
export const DEFAULT_RULES: RulesName = 'empty';

/** Whether a string names a Match this command can play: what the CLI asks before refusing one. */
export function isRulesName(value: string): value is RulesName {
  return Object.hasOwn(RULES, value);
}
