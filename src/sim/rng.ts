/**
 * The Match's random source: `sfc32`, seeded through `xmur3` (ADR-0006).
 *
 * Two properties matter here and nothing else does.
 *
 * The stream is **reproducible**: a seed fixes it exactly, on any engine,
 * because `sfc32` is integer arithmetic and `Math.imul` is exact. The cursor is
 * **authoritative state**: the four words live in `MatchState.rng`, so a replay
 * diverges in the state hash the moment a draw diverges, before the divergence
 * has had a chance to change anything a test can see.
 *
 * Draws are integers. Nothing here returns a fraction, because a fraction in
 * the simulation becomes a fraction in the hash (ADR-0006).
 */

/** Seeds are unsigned 32-bit integers: small enough to type into a CLI argument. */
export const MAX_SEED = 0xffff_ffff;

/** The largest bound `nextBelow` accepts, which is also the whole word range. */
const WORD_RANGE = 0x1_0000_0000;

/**
 * The cursor of the generator: four 32-bit words, and the whole of its memory.
 * Mutable, because drawing moves it; `MatchState.rng` exposes it read-only.
 */
export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** A seeded stream of integers. */
export interface Rng {
  /** The cursor, as state: hash it to turn a diverging draw into a diverging Match. */
  readonly state: Readonly<RngState>;
  /** The next word of the stream: an integer in [0, 2^32). */
  nextUint32(): number;
  /** An unbiased integer in [0, bound). */
  nextBelow(bound: number): number;
  /** An unbiased integer in [min, max], both ends included. */
  nextInt(min: number, max: number): number;
}

/** A fresh stream for a seed, for callers that carry no cursor of their own. */
export function makeRng(seed: number): Rng {
  return rngFromState(seedState(seed));
}

/** Continues the stream a cursor was in the middle of — how a replay resumes one. */
export function rngFromState(state: RngState): Rng {
  return {
    state,
    nextUint32: () => nextUint32(state),
    nextBelow: (bound) => nextBelow(state, bound),
    nextInt: (min, max) => {
      requireRange(min, max);
      return min + nextBelow(state, max - min + 1);
    },
  };
}

/** The four words a seed expands to. */
function seedState(seed: number): RngState {
  requireSeed(seed);

  const words = xmur3(String(seed));
  return { a: words(), b: words(), c: words(), d: words() };
}

/**
 * `xmur3` (ADR-0006): expands a seed into as many well-mixed 32-bit words as a
 * caller asks for. `sfc32` wants four, and taking them from the one number a
 * Match was created with is exactly the job this function exists to do: a
 * generator whose four words are all the seed itself starts badly.
 */
function xmur3(seed: string): () => number {
  let hash = 1779033703 ^ seed.length;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3432918353);
    hash = (hash << 13) | (hash >>> 19);
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 16), 2246822507);
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };
}

/**
 * One step of `sfc32` (the reference generator from the author, with the float
 * division left out: the draw is the whole word).
 *
 * The words are stored unsigned so that hashed state is never negative, and
 * read back signed because that is the arithmetic the generator was designed
 * around. `| 0` and `>>> 0` are both exact.
 */
function nextUint32(state: RngState): number {
  const a = state.a | 0;
  const b = state.b | 0;
  const c = state.c | 0;
  const d = state.d | 0;

  const draw = (((a + b) | 0) + d) | 0;

  state.a = (b ^ (b >>> 9)) >>> 0;
  state.b = ((c + (c << 3)) | 0) >>> 0;
  state.c = ((((c << 21) | (c >>> 11)) + draw) | 0) >>> 0;
  state.d = ((d + 1) | 0) >>> 0;

  return draw >>> 0;
}

/**
 * An unbiased integer in [0, bound), by rejection rather than by remainder:
 * `nextUint32() % bound` favours the low values whenever the bound does not
 * divide 2^32, and a generator that favours one corner of the map is a balance
 * bug wearing a statistics costume. The loop is exact integer arithmetic, and
 * deterministic like everything else here.
 */
function nextBelow(state: RngState, bound: number): number {
  requireBound(bound);

  const limit = WORD_RANGE - (WORD_RANGE % bound);
  let draw = nextUint32(state);
  while (draw >= limit) draw = nextUint32(state);

  return draw % bound;
}

/** @throws RangeError when the seed is not an unsigned 32-bit integer. */
function requireSeed(seed: number): void {
  if (!Number.isInteger(seed) || seed < 0 || seed > MAX_SEED) {
    throw new RangeError(`a seed must be an integer in [0, ${MAX_SEED}], got ${String(seed)}`);
  }
}

/** @throws RangeError when the bound is not an integer in [1, 2^32]. */
function requireBound(bound: number): void {
  if (!Number.isInteger(bound) || bound < 1 || bound > WORD_RANGE) {
    throw new RangeError(`a random bound must be an integer in [1, ${WORD_RANGE}], got ${String(bound)}`);
  }
}

/** @throws RangeError when the range is not integers, ordered, and within one word. */
function requireRange(min: number, max: number): void {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min || max - min + 1 > WORD_RANGE) {
    throw new RangeError(
      `a random range must be integers that span at most 2^32 values, got [${String(min)}, ${String(max)}]`,
    );
  }
}
