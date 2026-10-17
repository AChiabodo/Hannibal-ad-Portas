import type { MatchRules } from '../../src/sim/match';
import type { Rng } from '../../src/sim/rng';

/**
 * The rules A2's tests drive.
 *
 * A2 ships no game rules — they arrive with the tickets that need them — so the
 * tests bring their own: a small deterministic world that draws from the
 * Match's random source, obeys two Commands, and remembers what it was told, so
 * a test can read back which tick a Command took effect on.
 *
 * The world holds integers only, which is the rule for all state (ADR-0006):
 * a Command arrives as a word, and the world records the number it maps to. The
 * hash would refuse it otherwise, as it refuses any string in state.
 */
export type ToyCommand = 'levy' | 'double';

/** Command codes, because state holds numbers and not words. */
export const LEVY = 1;
export const DOUBLE = 2;

export interface ToyWorld {
  /** A running integer the rules mutate, so hashed state has something to cover. */
  total: number;
  /** How many draws the rules have made, so the random cursor is observable. */
  draws: number;
  /** Every Command the rules received, as flat `tick, code` pairs. */
  applied: number[];
}

export const toyRules: MatchRules<ToyWorld, ToyCommand> = {
  createWorld: (seed) => ({ total: seed, draws: 0, applied: [] }),

  step: (world: ToyWorld, rng: Rng, tick: number, commands: readonly ToyCommand[]): void => {
    world.draws += 1;
    world.total += rng.nextInt(0, 9);

    for (const command of commands) {
      world.applied.push(tick, command === 'levy' ? LEVY : DOUBLE);
      if (command === 'levy') world.total += 100;
      else world.total *= 2;
    }
  },
};
