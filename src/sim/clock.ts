/**
 * The Match's clock (PLAN §3).
 *
 * Time in a Match is counted in whole ticks and nothing else. The Match never
 * sees a delta, a framerate or a wall clock, which is half of what makes a seed
 * and a command log reproduce it exactly (ADR-0006); the other half is in
 * `rng.ts` and `state.ts`.
 *
 * The tick rate lives here, in one constant: everything else in the repository
 * that needs it derives it from `TICK_HZ` rather than writing a rate down.
 *
 * Turning real time into ticks is the driver's job — the browser loop, or the
 * headless runner's loop — which accumulates elapsed milliseconds until they
 * fill a tick. That accumulator belongs to the driver because its remainder is
 * a display concern: it never feeds state or the state hash, and the browser is
 * free to interpolate between ticks while the simulation stays on whole ones.
 */

/**
 * Ticks per second of Match time.
 *
 * Ten hertz is the plan's decision, and the reason is measurement: a headless
 * Match runs about ten times faster than real time, which is what turns a
 * balance tournament from an overnight job into a coffee break (PLAN §3, §6).
 * Changing it is a decision, never an accident, so it is written down once.
 */
export const TICK_HZ = 10;

/** Milliseconds of Match time in one tick: the clock's other unit, derived. */
export const TICK_MS = 1000 / TICK_HZ;
