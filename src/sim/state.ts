/**
 * The authoritative state of a Match, and its one canonical form.
 *
 * Every number in a Match's state is an integer, and every structure is an
 * array, a plain object or an integer typed array. `serializeState` walks a
 * state and writes it down in a canonical way — object keys in sorted order, so
 * the hash cannot depend on the order someone happened to write fields in — and
 * **rejects** everything else.
 *
 * The rejection is the point of the module. A float that sneaks into state does
 * not merely hash differently: ECMA-262 leaves arithmetic beyond the integers
 * implementation-approximated, so the same seed and the same Commands would
 * produce different Matches on a machine nobody is looking at. A loud failure
 * while a test runs is worth a thousand quiet divergences in a tournament
 * (ADR-0006).
 *
 * The text form is also what a divergence report prints, so it is deliberately
 * boring: integers in decimal, arrays in brackets, plain objects in braces with
 * quoted keys. Every own field of an object is written, enumerable or not, so
 * two states serialize the same only when they really are the same state — and an
 * own property defined by an accessor, on a field or on an array index, is
 * refused rather than read, because invoking it would make the canonical form
 * change from call to call.
 *
 * A sequence is its indices, and nothing else. A plain array's own names are
 * exactly its indices plus `length`, which every array carries on itself; a
 * typed array's own names are exactly its indices, because its `length` is an
 * accessor on the prototype and never appears among them. Anything else on a
 * sequence — an extra named property, an own symbol key — is refused rather than
 * dropped, because the canonical form has nowhere to write it, and a sequence
 * that silently serializes as less than it holds makes two different states
 * hash alike, which is the one thing a state hash must never do.
 */

/** What a typed array of integers has in common with an array: a length, and cells. */
type IntegerCells = ArrayLike<unknown> & object;

/**
 * The refusal a symbol key earns, shared by records and sequences.
 *
 * One sentence in both places on purpose: whether a symbol key sits on a plain
 * object or on an array, it is state the canonical form cannot write, and a
 * reader of the failure should not have to work out whether the two cases differ.
 */
const SYMBOL_KEY_REASON = 'is keyed by a symbol, and state holds plain string keys only';

/**
 * Whether an own name is spelled the way an index is: `'0'`, `'1'`, `'42'`.
 *
 * A spelling and nothing more, because that is only half a predicate: whether the
 * name addresses a cell of the sequence in hand is `classifySequenceName`'s
 * question, and the other half of its answer comes from the sequence's own
 * length. Derived from `String(index)` rather than from a looser pattern, so
 * `'007'` and `'1.5'` are ordinary names — nobody spells an index that way.
 */
const INDEX_NAME = /^(?:0|[1-9]\d*)$/;

/** Typed arrays state may not hold, each with the sentence used to refuse it. */
const NON_INTEGER_VIEWS = new Map([
  ['DataView', 'is a DataView, and state holds integers only'],
  ['Float16Array', 'is a Float16Array, and state holds integers only'],
  ['Float32Array', 'is a Float32Array, and state holds integers only'],
  ['Float64Array', 'is a Float64Array, and state holds integers only'],
  ['BigInt64Array', 'is a BigInt64Array, and state holds plain numbers, not bigints'],
  ['BigUint64Array', 'is a BigUint64Array, and state holds plain numbers, not bigints'],
]);

/**
 * A state that cannot be serialized, and where it went wrong.
 *
 * Deriving `Error` rather than returning a result because there is no sensible
 * way to continue: a state the serializer refuses has no canonical form, so it
 * has no hash, so it cannot be replayed or compared.
 */
export class StateSerializationError extends Error {
  /** Where in the state the offending value is, e.g. `state.world.squads[2].strength`. */
  readonly path: string;

  constructor(path: string, reason: string) {
    super(`the state at ${path} ${reason}`);
    this.name = 'StateSerializationError';
    this.path = path;
  }
}

/**
 * Writes a state in its canonical text form.
 *
 * @throws StateSerializationError when the state holds a non-integer number, an
 *   integer beyond the exact range of a `number`, a value that is not an array
 *   or a plain object, an own name or symbol key on a sequence beyond its
 *   indices, an own property defined by an accessor, or a cycle.
 */
export function serializeState(state: unknown): string {
  return write(state, 'state', new WeakSet());
}

function write(value: unknown, path: string, seen: WeakSet<object>): string {
  if (typeof value === 'number') return writeInteger(value, path);
  if (Array.isArray(value)) return writeSequence(value, path, seen);
  if (ArrayBuffer.isView(value)) return writeView(value, path, seen);
  if (isPlainObject(value)) return writeRecord(value, path, seen);

  throw new StateSerializationError(path, describe(value));
}

function writeInteger(value: number, path: string): string {
  if (!Number.isInteger(value)) {
    throw new StateSerializationError(path, `is not an integer: ${String(value)}`);
  }
  if (!Number.isSafeInteger(value)) {
    throw new StateSerializationError(
      path,
      `is an integer beyond the exact range of a number: ${String(value)}`,
    );
  }

  return String(value);
}

function writeSequence(items: ArrayLike<unknown> & object, path: string, seen: WeakSet<object>): string {
  enter(items, path, seen);
  requireOnlyIndices(items, path);

  // A plain array can carry a getter on an index — `Object.defineProperty(a, '1', …)`
  // — and reading it would invoke it, so its elements are checked the way a
  // record's fields are. A typed array cannot carry one: the specification makes
  // its indices plain data properties, and asking for a descriptor per cell would
  // tax the grid the hash walks at every checkpoint. So the guard reads
  // descriptors only for the kind of sequence that can lie.
  const mayHoldAccessors = Array.isArray(items);

  const parts: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const element = `${path}[${index}]`;
    if (mayHoldAccessors) requireDataProperty(items, String(index), element);
    parts.push(write(items[index], element, seen));
  }

  seen.delete(items);
  return `[${parts.join(',')}]`;
}

function writeRecord(value: Record<string, unknown> & object, path: string, seen: WeakSet<object>): string {
  enter(value, path, seen);
  requireNoSymbolKeys(value, path);

  // Own names, not `Object.keys`: a field that hides from a plain enumeration is
  // still state, and a float hiding there would otherwise never reach the hash.
  const parts = Object.getOwnPropertyNames(value)
    .sort()
    .map((key) => {
      const field = `${path}.${key}`;
      requireDataProperty(value, key, field);
      return `${JSON.stringify(key)}:${write(value[key], field, seen)}`;
    });

  seen.delete(value);
  return `{${parts.join(',')}}`;
}

/**
 * Refuses an own symbol key, on a record or on a sequence.
 *
 * A symbol has no spelling and no order, so the canonical form has nowhere to
 * put one: writing it is impossible and dropping it would make two different
 * states hash alike. One function for both paths, so a symbol key is the same
 * refusal whether it hides on an array or on a plain object.
 */
function requireNoSymbolKeys(value: object, path: string): void {
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new StateSerializationError(path, SYMBOL_KEY_REASON);
  }
}

/**
 * Refuses an own name a sequence has beyond its indices.
 *
 * Writing only `0..length-1` would be a lie by omission: an array can carry an
 * ordinary property (`a.extra = 5`), and a state that serializes as `[1,2]`
 * whether or not it holds one gives two different states one hash — exactly what
 * a state hash exists to prevent (ADR-0006). So the extra is refused where it is
 * found, the way a float is, and `length` is not extra on an array: every array
 * carries it as a non-enumerable own property of its own, and it only restates the
 * indices. An ordinary typed array has no own `length` at all — its `length` is an
 * accessor on the prototype — so a `length` found on one is an extra like any
 * other name here.
 *
 * The cost is one enumeration of the sequence's own names per sequence, and that
 * enumeration is linear in the same length the walk which follows it already
 * traverses cell by cell: knowing whether a sequence holds more than its cells is
 * not free. Unlike the descriptor lookup that guards an array index against an
 * accessor, though, it adds nothing per element beyond that one enumeration.
 */
function requireOnlyIndices(items: ArrayLike<unknown> & object, path: string): void {
  requireNoSymbolKeys(items, path);

  for (const key of Object.getOwnPropertyNames(items)) {
    const name = classifySequenceName(items, key);
    const isOwnLength = name === 'named' && key === 'length' && Array.isArray(items);

    if (name === 'inRange' || isOwnLength) continue;

    throw new StateSerializationError(
      name === 'named' ? `${path}.${key}` : `${path}[${key}]`,
      'is an own property of a sequence beyond its indices, and state holds nothing there',
    );
  }
}

/**
 * What an own name of a sequence is: a cell of it, a subscript that names no
 * cell, or an ordinary name.
 *
 * One question asked once, and both the skip and the refusal are read off its
 * answer, so the two can never disagree about a name. The regex supplies the
 * spelling and the sequence's own length supplies the rest: `'4294967295'`, the
 * first number past the largest array index, is spelled like an index and
 * addresses nothing, which is why it is refused — with the subscript a reader
 * would reach for — rather than skipped as if it were a cell.
 */
function classifySequenceName(
  items: ArrayLike<unknown> & object,
  key: string,
): 'inRange' | 'outOfRange' | 'named' {
  if (!INDEX_NAME.test(key)) return 'named';

  return Number(key) < items.length ? 'inRange' : 'outOfRange';
}

/**
 * Refuses an own property defined by an accessor, before it is ever read.
 *
 * Reading an accessor is not reading state: a getter can compute, can count its
 * calls, can answer something different every time it is asked. The same state
 * would then hash to two different values, and a replay comparison would report a
 * divergence that is not one, naming a tick that agrees with itself. State holds
 * plain data, so a field of a record or an index of an array is refused here, the
 * way a float or a symbol key is, rather than quietly invoked.
 */
function requireDataProperty(value: object, key: string, path: string): void {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (descriptor === undefined) return;
  if (descriptor.get === undefined && descriptor.set === undefined) return;

  throw new StateSerializationError(path, 'is defined by an accessor, and state holds plain data');
}

/**
 * A typed array of integers is a perfectly good grid; anything else is not
 * state, and says so by name instead of quietly changing the hash.
 */
function writeView(value: object, path: string, seen: WeakSet<object>): string {
  if (!isIntegerCells(value)) {
    throw new StateSerializationError(path, NON_INTEGER_VIEWS.get(viewKind(value)) ?? 'is a typed array');
  }

  return writeSequence(value, path, seen);
}

function isIntegerCells(value: unknown): value is IntegerCells {
  return ArrayBuffer.isView(value) && !NON_INTEGER_VIEWS.has(viewKind(value));
}

/** The `Object.prototype.toString` name of a typed array: `Uint8Array`, `DataView`, … */
function viewKind(value: object): string {
  return Object.prototype.toString.call(value).slice(8, -1);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false;

  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}

/**
 * Marks a container as being written, so a cycle fails loudly instead of
 * overflowing the stack. A value that appears twice in a state is written
 * twice: sharing is not a cycle, and state has no way to say "the same array as
 * before".
 */
function enter(value: object, path: string, seen: WeakSet<object>): void {
  if (seen.has(value)) {
    throw new StateSerializationError(path, 'is part of a cycle, so it has no canonical form');
  }

  seen.add(value);
}

/** A short description of a value that cannot be state, for the failure message. */
function describe(value: unknown): string {
  const holds = 'and state holds integers, arrays and plain objects';

  if (value === null) return `is null, ${holds}`;
  if (typeof value === 'undefined') return `is undefined, ${holds}`;
  if (typeof value === 'bigint') return 'is a bigint, and state integers are plain numbers, not bigints';
  if (typeof value === 'object') return `is ${constructorName(value)}, ${holds}`;

  return `is a ${typeof value}, ${holds}`;
}

/** The constructor name of a value, for a failure message that names the culprit. */
function constructorName(value: object): string {
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null) return 'an object with no prototype';

  const constructor: unknown = (prototype as { constructor?: unknown }).constructor;
  if (typeof constructor !== 'function' || constructor.name === '') return 'an object';

  return `a ${constructor.name}`;
}
