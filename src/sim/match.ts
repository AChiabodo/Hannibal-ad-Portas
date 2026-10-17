/**
 * The deterministic tick: a Match that advances in fixed steps through integer
 * state, with a seeded random source and a hash of the whole thing (PLAN §3).
 *
 * The engine owns the three things a replay must never be able to argue with:
 * the clock (one step, one tick), the seed, and where the cursor of the random
 * source starts. The game rules own everything else, in the `world`, and they
 * are handed that world as a value — so a rule cannot move the clock or choose
 * a new starting point for the generator, however tempting `state.tick = …`
 * becomes. Drawing from the generator is theirs to do, and that is the point.
 *
 * A Command here is whatever a Controller emits; A3 defines that vocabulary.
 * The engine knows only what it must: Commands arrive stamped for a tick, and
 * the tick they are stamped for is the one that applies them.
 */
import { hashState } from './hash';
import { makeRng, type Rng, type RngState } from './rng';

/**
 * The authoritative state of a Match: integers all the way down, and exactly
 * what the state hash covers.
 */
export interface MatchState<World> {
  /** Ticks elapsed since the Match was created. */
  readonly tick: number;
  /** The seed the Match was created from. */
  readonly seed: number;
  /** The cursor of the random source: a diverging draw diverges the hash here. */
  readonly rng: Readonly<RngState>;
  /**
   * Everything the game rules own — the map, settlements, Squads, the season,
   * whatever the wave that builds it decides. A2 ships no rules yet.
   */
  readonly world: World;
}

/**
 * The one part of a Match the engine cannot supply by itself: the game rules.
 *
 * A2 needs rules to be able to prove that a seed and a command log reproduce a
 * Match, so the seam exists from here; the tickets that build the world are the
 * ones that fill it in.
 */
export interface MatchRules<World, Command = unknown> {
  /** Builds the world a Match starts from. Must be a pure function of the seed. */
  readonly createWorld: (seed: number) => World;

  /**
   * Runs one tick of rules.
   *
   * `tick` is the tick being *left*: the rules for tick T turn the Match from T
   * into T+1, and `commands` are the Commands stamped for that same tick T.
   */
  readonly step: (world: World, rng: Rng, tick: number, commands: readonly Command[]) => void;
}

/** A Match in progress. */
export interface Match<World, Command = unknown> {
  /** The state as it stands. Read-only: only `step` moves a Match forward. */
  readonly state: MatchState<World>;

  /**
   * Runs the rules for the current tick, then advances the clock by one.
   *
   * A Command stamped with tick T takes effect during the step that carries the
   * Match from T to T+1, so a replay's log and a Match's steps line up one to one.
   */
  step(commands?: readonly Command[]): void;

  /**
   * The hash of the whole state, integers checked.
   *
   * @throws StateSerializationError when the world holds anything but integers.
   */
  hash(): string;
}

export interface MatchOptions<World, Command> {
  readonly seed: number;
  readonly rules: MatchRules<World, Command>;
}

/** The engine's own view of the state, the one where the clock may move. */
interface MutableState<World> {
  tick: number;
  readonly seed: number;
  readonly rng: Readonly<RngState>;
  readonly world: World;
}

/**
 * Starts a Match. The seed fixes the world, the random cursor and, from there,
 * every tick that follows.
 *
 * @throws RangeError when the seed is not an unsigned 32-bit integer.
 */
export function createMatch<World, Command = unknown>(
  options: MatchOptions<World, Command>,
): Match<World, Command> {
  // The seed is checked by the random source, before any world is built from it.
  const rng = makeRng(options.seed);
  const state: MutableState<World> = {
    tick: 0,
    seed: options.seed,
    rng: rng.state,
    world: options.rules.createWorld(options.seed),
  };

  return {
    state,

    step(commands: readonly Command[] = []): void {
      options.rules.step(state.world, rng, state.tick, commands);
      state.tick += 1;
    },

    hash(): string {
      return hashState(state);
    },
  };
}
