import { describe, expect, it } from 'vitest';
import { createMatch, type MatchRules } from '../../src/sim/match';
import { makeRng } from '../../src/sim/rng';
import { StateSerializationError } from '../../src/sim/state';
import { toyRules, DOUBLE, LEVY, type ToyWorld } from './toy-rules';

/** The hash of a Match on the given seed, before each step, for `ticks` steps. */
function hashes(seed: number, ticks: number): string[] {
  const match = createMatch({ seed, rules: toyRules });
  const seen = [match.hash()];

  for (let tick = 0; tick < ticks; tick += 1) {
    match.step();
    seen.push(match.hash());
  }

  return seen;
}

describe('a Match', () => {
  it('starts at tick zero, on its seed, with the world that seed builds', () => {
    const match = createMatch({ seed: 12345, rules: toyRules });

    expect(match.state.tick).toBe(0);
    expect(match.state.seed).toBe(12345);
    expect(match.state.world.total).toBe(12345);
    expect(match.state.world.applied).toEqual([]);
  });

  it('starts its random cursor at the stream its seed names', () => {
    const match = createMatch({ seed: 99, rules: toyRules });

    expect({ ...match.state.rng }).toEqual({ ...makeRng(99).state });
  });

  it('advances exactly one tick per step', () => {
    const match = createMatch({ seed: 1, rules: toyRules });

    for (let step = 0; step < 3; step += 1) match.step();

    expect(match.state.tick).toBe(3);
  });

  it('gives each tick the Commands stamped for it, and no others', () => {
    const match = createMatch({ seed: 1, rules: toyRules });

    match.step(['levy']);
    match.step([]);
    match.step(['double', 'levy']);

    expect(match.state.world.applied).toEqual([0, LEVY, 2, DOUBLE, 2, LEVY]);
  });

  it('hashes the same way for a thousand ticks on the same seed', () => {
    expect(hashes(12345, 1000)).toEqual(hashes(12345, 1000));
  });

  it('hashes differently on a different seed', () => {
    expect(hashes(1, 1000)).not.toEqual(hashes(2, 1000));
    expect(hashes(1, 1)[0]).not.toBe(hashes(2, 1)[0]);
  });

  it('covers the world in the hash, not only the clock', () => {
    const elsewhere: MatchRules<ToyWorld, never> = {
      ...toyRules,
      createWorld: () => ({ total: 0, draws: 0, applied: [] }),
    };

    const fromSeed = createMatch({ seed: 7, rules: toyRules });
    const fromNothing = createMatch({ seed: 7, rules: elsewhere });

    expect(fromSeed.state.tick).toBe(fromNothing.state.tick);
    expect(fromSeed.hash()).not.toBe(fromNothing.hash());
  });

  it('covers the random cursor, so one diverging draw diverges the Match', () => {
    const drawing: MatchRules<{ drawn: number }, never> = {
      createWorld: () => ({ drawn: 0 }),
      step: (world, rng) => {
        world.drawn += rng.nextUint32();
      },
    };
    const still: MatchRules<{ drawn: number }, never> = { createWorld: () => ({ drawn: 0 }), step: () => {} };

    const draws = createMatch({ seed: 7, rules: drawing });
    const doesNot = createMatch({ seed: 7, rules: still });

    expect(draws.hash()).toBe(doesNot.hash());

    draws.step();
    doesNot.step();

    expect(draws.hash()).not.toBe(doesNot.hash());
  });

  it('fails loudly when the world holds a float, rather than hashing it quietly', () => {
    const floaty: MatchRules<{ morale: number }, never> = {
      createWorld: () => ({ morale: 0.5 }),
      step: () => {},
    };

    const match = createMatch({ seed: 1, rules: floaty });

    expect(() => match.hash()).toThrow(StateSerializationError);
  });

  it('refuses a seed the random source cannot take', () => {
    expect(() => createMatch({ seed: -1, rules: toyRules })).toThrow(/seed/);
    expect(() => createMatch({ seed: 1.5, rules: toyRules })).toThrow(/seed/);
  });
});
