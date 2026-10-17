/**
 * `sim/` — the Match: map, visibility, seasons, economy, Squads, combat, siege
 * and victory (PLAN §3).
 *
 * Pure TypeScript, and the fences matter: nothing reachable from here may
 * import `pixi.js`, nothing anywhere may call `Math.random`, and nothing
 * reachable from here may use arithmetic ECMA-262 leaves
 * implementation-approximated. `npm run guard` fails the build on all three,
 * because a simulation that needs a browser, a global generator or a particular
 * libm cannot be replayed (ADR-0001, ADR-0006).
 *
 * A2 lays the deterministic core the rest of the simulation is built on:
 *
 * - `clock.ts` — the fixed tick, and the one constant that sets its rate.
 * - `rng.ts` — `sfc32` seeded through `xmur3`, drawing integers and nothing else.
 * - `state.ts` — the authoritative state's canonical form, and what it refuses.
 * - `hash.ts` — the state hash, which is what makes two runs comparable.
 * - `match.ts` — the tick itself: a clock, a world, a cursor, and a hash of all three.
 * - `replay.ts` — a seed plus a command log, run again and compared.
 */
export { TICK_HZ, TICK_MS } from './clock';
export { MAX_SEED, makeRng, rngFromState } from './rng';
export type { Rng, RngState } from './rng';
export { StateSerializationError, serializeState } from './state';
export { hashState } from './hash';
export { createMatch } from './match';
export type { Match, MatchOptions, MatchRules, MatchState } from './match';
export { replay } from './replay';
export type {
  CommandLog,
  LoggedCommand,
  ReplayOptions,
  ReplayResult,
  StateCheckpoint,
} from './replay';
