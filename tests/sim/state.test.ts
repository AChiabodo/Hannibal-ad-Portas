import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { StateSerializationError, serializeState } from '../../src/sim/state';

/**
 * The canonical form of a state, or a note saying that it was refused.
 *
 * A state the serializer must reject has no text form, so a case that wants to
 * say "these two states do not share a canonical form" — the property the state
 * hash exists for — cannot compare the two strings directly. This keeps the
 * comparison available without pretending a refusal is a text form.
 */
function canonicalFormOf(state: unknown): string {
  try {
    return serializeState(state);
  } catch (error) {
    if (!(error instanceof StateSerializationError)) throw error;

    return `<refused at ${error.path}>`;
  }
}

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

  it('refuses an extra own property on an array instead of dropping it, and names the property', () => {
    const state = Object.assign([1, 2], { extra: 5 });

    // Two different states must not share a canonical form. Before the refusal
    // they did: this one serialized as `[1,2]`, byte for byte the plain array's
    // text. Stated as a difference rather than only as a throw, because that is
    // the defect — dropping the property is what made the two hash alike.
    expect(canonicalFormOf(state)).not.toBe(canonicalFormOf([1, 2]));

    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(/state\.extra is an own property /);

    expect(serializeState([1, 2])).toBe('[1,2]');
  });

  it('refuses a subscript past the largest array index, and keeps it on the bracket form', () => {
    const state: unknown[] = [1, 2];
    Object.defineProperty(state, '4294967295', { value: 1, enumerable: true });

    // 2³²−1 is the first number past the largest array index, so the name is an
    // ordinary property and the array's length stays 2. The name is spelled like
    // an index and addresses no cell of this sequence — the two halves of the
    // predicate the refusal is built on — and the refusal still points at it with
    // a subscript, because that is how a reader would reach for it.
    expect(state.length).toBe(2);
    expect(canonicalFormOf(state)).not.toBe(canonicalFormOf([1, 2]));

    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(/state\[4294967295\] is an own property /);
  });

  it('still fails a hole through the cell the array does not have, naming that cell', () => {
    // The one case the new refusal must not swallow: a hole is not an extra own
    // name — there is no own name there at all — so it keeps failing the way it
    // always has, at the cell the walk reads as `undefined`.
    const state: unknown[] = [1, 2, 3];
    delete state[1];

    expect(Object.getOwnPropertyNames(state)).not.toContain('1');
    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(/state\[1\] is undefined/);
  });

  it('refuses an own symbol key on an array, in the words the record path uses', () => {
    const state: unknown[] = [1, 2];
    (state as unknown as Record<symbol, unknown>)[Symbol('x')] = 1;

    expect(canonicalFormOf(state)).not.toBe(canonicalFormOf([1, 2]));

    expect(() => serializeState(state)).toThrow(StateSerializationError);
    expect(() => serializeState(state)).toThrow(
      /^the state at state is keyed by a symbol, and state holds plain string keys only$/,
    );
  });

  it('refuses an extra own property on a typed array, and names the path to it', () => {
    const tiles = Object.assign(new Uint8Array([1, 2]), { extra: 5 });

    expect(canonicalFormOf({ tiles })).not.toBe(canonicalFormOf({ tiles: new Uint8Array([1, 2]) }));

    expect(() => serializeState({ tiles })).toThrow(StateSerializationError);
    expect(() => serializeState({ tiles })).toThrow(/state\.tiles\.extra is an own property /);

    expect(serializeState({ tiles: new Uint8Array([1, 2]) })).toBe('{"tiles":[1,2]}');
  });

  it('refuses an own symbol key on a typed array', () => {
    const tiles = new Uint8Array([1, 2]);
    (tiles as unknown as Record<symbol, unknown>)[Symbol('x')] = 1;

    expect(canonicalFormOf({ tiles })).not.toBe(canonicalFormOf({ tiles: new Uint8Array([1, 2]) }));

    expect(() => serializeState({ tiles })).toThrow(StateSerializationError);
    expect(() => serializeState({ tiles })).toThrow(/state\.tiles is keyed by a symbol/);
  });

  it("writes a sequence as its indices, taking a plain array's own `length` as part of it", () => {
    const grid: unknown[] = [1, 2, 3];
    expect(Object.getOwnPropertyNames(grid)).toContain('length');
    expect(serializeState(grid)).toBe('[1,2,3]');

    const cells = new Uint8Array([4, 5]);
    expect(Object.getOwnPropertyNames(cells)).not.toContain('length');
    expect(serializeState(cells)).toBe('[4,5]');
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
