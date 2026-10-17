import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { StateSerializationError, serializeState } from '../../src/sim/state';

describe('the state serializer', () => {
  it('writes integers, arrays and plain objects in one canonical form', () => {
    expect(serializeState(3)).toBe('3');
    expect(serializeState(-17)).toBe('-17');
    expect(serializeState([1, 2, 3])).toBe('[1,2,3]');
    expect(serializeState({ tick: 0, seed: 12345 })).toBe('{"seed":12345,"tick":0}');
  });

  it('does not care what order the fields were written in', () => {
    expect(serializeState({ b: 2, a: 1 })).toBe(serializeState({ a: 1, b: 2 }));
    expect(serializeState({ world: { squads: [1] }, tick: 2 })).toBe(
      serializeState({ tick: 2, world: { squads: [1] } }),
    );
  });

  it('keeps the boundaries between the values it is given', () => {
    expect(serializeState([1, 23])).not.toBe(serializeState([12, 3]));
    expect(serializeState([1, 2])).not.toBe(serializeState([[1], [2]]));
  });

  it('writes negative zero as zero, because they are the same integer', () => {
    expect(serializeState(-0)).toBe('0');
  });

  it('accepts the integer typed arrays a grid wants', () => {
    expect(serializeState(new Uint8Array([1, 2]))).toBe('[1,2]');
    expect(serializeState(new Int32Array([1, -2, 3]))).toBe('[1,-2,3]');
  });

  it('accepts an object with no prototype', () => {
    const bare = Object.create(null) as Record<string, unknown>;
    bare['a'] = 1;

    expect(serializeState(bare)).toBe('{"a":1}');
  });

  it('rejects a float, and says which field it is in', () => {
    const state = { world: { squads: [{ strength: 1.5 }] } };

    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(/state\.world\.squads\[0\]\.strength is not an integer: 1\.5/);
  });

  it('rejects the numbers that are not integers at all', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => serializeState({ value })).toThrow(/is not an integer/);
    }
  });

  it('rejects an integer too large to be exact', () => {
    expect(() => serializeState({ value: 2 ** 53 })).toThrow(/exact range/);
  });

  it('rejects everything that is not an integer, a plain object or an array', () => {
    class Squad {
      readonly strength = 1;
    }

    const rejected: readonly [string, unknown][] = [
      ['a string', 'one'],
      ['a boolean', true],
      ['null', null],
      ['undefined', undefined],
      ['a bigint', 1n],
      ['a symbol', Symbol('squad')],
      ['a function', () => 1],
      ['a Date', new Date(0)],
      ['a Map', new Map()],
      ['a Set', new Set()],
      ['a class instance', new Squad()],
      ['a Float64Array', new Float64Array([1])],
      ['a Float32Array', new Float32Array([1])],
      ['a BigInt64Array', new BigInt64Array([1n])],
      ['a DataView', new DataView(new ArrayBuffer(4))],
    ];

    for (const [what, value] of rejected) {
      expect(() => serializeState({ value }), what).toThrow(StateSerializationError);
    }
  });

  it('writes every own field, even one that hides from a plain enumeration', () => {
    const state: Record<string, unknown> = { visible: 1 };
    Object.defineProperty(state, 'hidden', { value: 2, enumerable: false });

    expect(serializeState(state)).toBe('{"hidden":2,"visible":1}');
  });

  it('rejects a float that hides from a plain enumeration', () => {
    const state: Record<string, unknown> = {};
    Object.defineProperty(state, 'morale', { value: 0.5, enumerable: false });

    expect(() => serializeState(state)).toThrow(/morale is not an integer: 0\.5/);
  });

  it('rejects a field defined by a getter instead of calling it, and names the field', () => {
    let calls = 0;
    const state: Record<string, unknown> = { strength: 1 };
    Object.defineProperty(state, 'morale', {
      get: () => {
        calls += 1;
        return 3;
      },
      enumerable: true,
    });

    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(
      /state\.morale is defined by an accessor, and state holds plain data/,
    );
    expect(calls).toBe(0);
  });

  it('rejects a getter nested in the world, and names the path to it', () => {
    const squad: Record<string, unknown> = { id: 1 };
    Object.defineProperty(squad, 'strength', { get: () => 3, enumerable: false });

    expect(() => serializeState({ world: { squads: [squad] } })).toThrow(
      /state\.world\.squads\[0\]\.strength is defined by an accessor/,
    );
  });

  it('rejects a getter on an array index, and leaves a typed array unchecked', () => {
    const grid: unknown[] = [1, 2, 3];
    Object.defineProperty(grid, '1', { get: () => 99, enumerable: true, configurable: true });

    expect(() => serializeState(grid)).toThrow(StateSerializationError);
    expect(() => serializeState(grid)).toThrow(
      /state\[1\] is defined by an accessor, and state holds plain data/,
    );

    expect(serializeState(new Uint8Array([1, 2, 3]))).toBe('[1,2,3]');
  });

  it('hashes an accepted state the same way twice, so a stable state has a stable fingerprint', () => {
    // A regression guard on an accepted state, not the proof that an accessor is
    // refused: no accessor can reach here, because `serializeState` refuses one
    // before reading it.
    const state = { tick: 4, tiles: new Uint8Array([0, 1]), world: { squads: [{ id: 1, strength: 3 }] } };

    expect(hashState(state)).toBe(hashState(state));
    expect(hashState({ ...state })).toBe(hashState(state));
  });

  it('rejects a symbol-keyed field instead of ignoring it', () => {
    expect(() => serializeState({ [Symbol('strength')]: 1 })).toThrow(/symbol/);
  });

  it('rejects a cycle instead of recursing until the stack gives out', () => {
    const world: Record<string, unknown> = {};
    world['itself'] = world;

    expect(() => serializeState(world)).toThrow(/cycle/);
  });
});
