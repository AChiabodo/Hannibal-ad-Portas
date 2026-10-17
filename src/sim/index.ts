/**
 * `sim/` — the Match: map, visibility, seasons, economy, Squads, combat, siege
 * and victory (PLAN §3).
 *
 * Pure TypeScript, and the fence matters: nothing reachable from here may
 * import `pixi.js`, and nothing here may call `Math.random`. `npm run guard`
 * fails the build if either happens, because a simulation that needs a browser
 * or a global generator cannot be replayed headlessly (ADR-0001, ADR-0006).
 *
 * A2 fills this in with the deterministic core.
 */
export {};
