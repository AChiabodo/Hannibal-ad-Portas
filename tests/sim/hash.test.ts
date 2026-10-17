import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { StateSerializationError } from '../../src/sim/state';

describe('the state hash', () => {
  it('is written as sixteen hexadecimal digits, whatever the state is', () => {
    for (const state of [0, { tick: 0 }, [1, 2, 3], { world: { squads: [{ x: 3, y: 4 }] } }]) {
      expect(hashState(state)).toMatch(/^[0-9a-f]{16}$/);
    }
  });

  it('records the hash of one fixed state, so changing the algorithm is a decision', () => {
    // Recorded once. If this fails, either the state these fields describe or the
    // hash itself changed, and the state hash is part of the tick contract:
    // changing it is a decision, never an accident (PLAN §3).
    expect(hashState({ tick: 0, seed: 12345 })).toBe('51f7428b508661c8');
  });

  it('gives the same state the same hash, however it was built', () => {
    const built = { tick: 7, world: { squads: [{ x: 1 }, { x: 2 }] } };
    const rebuilt = { world: { squads: [{ x: 1 }, { x: 2 }] }, tick: 7 };

    expect(hashState(built)).toBe(hashState(rebuilt));
  });

  it('notices a change anywhere in the state', () => {
    const before = hashState({ tick: 7, world: { squads: [{ x: 12, y: 3 }] } });

    const mutations: readonly unknown[] = [
      { tick: 8, world: { squads: [{ x: 12, y: 3 }] } },
      { tick: 7, world: { squads: [{ x: 13, y: 3 }] } },
      { tick: 7, world: { squads: [{ x: 12, y: 4 }] } },
      { tick: 7, world: { squads: [{ x: 12, y: 3 }, { x: 0, y: 0 }] } },
      { tick: 7, world: { squads: [] } },
      { tick: 7, world: {} },
      { tick: 7 },
    ];

    for (const mutated of mutations) {
      expect(hashState(mutated)).not.toBe(before);
    }
  });

  it('refuses to hash a state holding a float, rather than hash it differently', () => {
    expect(() => hashState({ tick: 0, morale: 0.5 })).toThrow(StateSerializationError);
  });
});
