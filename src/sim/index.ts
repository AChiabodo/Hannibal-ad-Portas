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
 * A2 laid the deterministic core everything else is built on:
 *
 * - `clock.ts` — the fixed tick, and the one constant that sets its rate.
 * - `ticks.ts` — what a whole number of ticks is, in one place for every count.
 * - `rng.ts` — `sfc32` seeded through `xmur3`, drawing integers and nothing else.
 * - `state.ts` — the authoritative state's canonical form, and what it refuses.
 * - `hash.ts` — the state hash, which is what makes two runs comparable.
 * - `match.ts` — the tick itself: a clock, a world, a cursor, and a hash of all three.
 * - `replay.ts` — a seed plus a command log, run again and compared; `replay`
 *   re-enacts a log the caller holds, `replayCommands` closes the vocabulary on
 *   one that arrived from outside.
 *
 * A3 made the seam real: one place where a decision enters the game.
 *
 * - `faction.ts` — the two Factions, as words rather than state.
 * - `command.ts` — the closed vocabulary, its constructors and its reader;
 *   documented for an agent author in `docs/COMMANDS.md`.
 * - `observation.ts` — everything a Controller is allowed to know, and nothing else.
 * - `controller.ts` — the interface the human, the AI, a script and an agent all
 *   implement, plus the idle and scripted Controllers a headless Match runs on.
 * - `driver.ts` — the loop that asks two Controllers for Commands and runs a
 *   Match to a result, with no browser anywhere.
 * - `empty.ts` — the Match with no systems in it yet, which is the one the CLI
 *   can play today (A4); B1–C5 fill the world in behind it.
 *
 * B1 built the first piece of that world:
 *
 * - `map.ts` — a whole theatre generated from a seed: terrain, rivers crossed by
 *   fords, resources, settlements, Strongholds and roads, with the invariants a
 *   fair map has to satisfy asserted over a thousand seeds. It is a pure
 *   function of the seed, and the map is integer state like everything else
 *   (ADR-0006), so the Match that eventually runs on it replays exactly.
 */
export { TICK_HZ, TICK_MS } from './clock.ts';
export { requireTickCount } from './ticks.ts';
export { MAX_SEED, makeRng, rngFromState } from './rng.ts';
export type { Rng, RngState } from './rng.ts';
export { StateSerializationError, serializeState } from './state.ts';
export { hashState } from './hash.ts';
export { createMatch } from './match.ts';
export type { Match, MatchOptions, MatchRules, MatchState } from './match.ts';
export { replay, replayCommands } from './replay.ts';
export type {
  CommandLog,
  LoggedCommand,
  ReplayOptions,
  ReplayResult,
  StateCheckpoint,
} from './replay.ts';

export { FACTIONS, isFaction } from './faction.ts';
export type { Faction } from './faction.ts';
export {
  assault,
  attack,
  attackMove,
  blockade,
  build,
  COMMAND_KINDS,
  CommandValidationError,
  FORMATIONS,
  formation,
  garrison,
  group,
  hold,
  move,
  recruit,
  validateCommand,
  withdraw,
} from './command.ts';
export type {
  AssaultCommand,
  AttackCommand,
  AttackMoveCommand,
  BlockadeCommand,
  BuildCommand,
  Command,
  CommandBase,
  CommandKind,
  Formation,
  FormationCommand,
  GarrisonCommand,
  GroupCommand,
  HoldCommand,
  MoveCommand,
  RecruitCommand,
  WithdrawCommand,
} from './command.ts';
export type { Observation } from './observation.ts';
export { scriptedController, idleController } from './controller.ts';
export type { Controller, Player, Players } from './controller.ts';
export { ForeignCommandError, runMatch } from './driver.ts';
export type { MatchResult, MatchRun, MatchSetup, Outcome } from './driver.ts';
export { emptyMatchOutcome, emptyMatchRules, observeEmptyMatch } from './empty.ts';
export type { EmptyMatchVisible, EmptyMatchWorld } from './empty.ts';

export {
  generateMap,
  halfOf,
  isTerrain,
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  MAX_SETTLEMENTS,
  MIN_FORDS_PER_RIVER,
  MIN_SETTLEMENTS,
  MIN_STRONGHOLD_DISTANCE,
  RESOURCE,
  RESOURCE_KINDS,
  RESOURCE_TOLERANCE_PERCENT,
  resourceTotals,
  TERRAIN,
  terrainAt,
  TILE_COUNT,
  TILE_SIZE,
  tileIndex,
  tileX,
  tileY,
} from './map.ts';
export type {
  Half,
  MapGrid,
  ResourceKind,
  ResourceNode,
  ResourceTotals,
  River,
  Road,
  Site,
  Terrain,
} from './map.ts';
