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
 * two states serialize the same only when they really are the same state.
 */

/** What a typed array of integers has in common with an array: a length, and cells. */
type IntegerCells = ArrayLike<unknown> & object;

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
 *   or a plain object, or a cycle.
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

  const parts: string[] = [];
  for (let index = 0; index < items.length; index += 1) {
    parts.push(write(items[index], `${path}[${index}]`, seen));
  }

  seen.delete(items);
  return `[${parts.join(',')}]`;
}

function writeRecord(value: Record<string, unknown> & object, path: string, seen: WeakSet<object>): string {
  enter(value, path, seen);

  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new StateSerializationError(path, 'is keyed by a symbol, and state holds plain string keys only');
  }

  // Own names, not `Object.keys`: a field that hides from a plain enumeration is
  // still state, and a float hiding there would otherwise never reach the hash.
  const parts = Object.getOwnPropertyNames(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${write(value[key], `${path}.${key}`, seen)}`);

  seen.delete(value);
  return `{${parts.join(',')}}`;
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
