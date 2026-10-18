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
 * - `empty.ts` — the Match with no systems in it: the engine and the seam, and
 *   nothing else. It stays as the harness that gates the seed expansion and the
 *   canonical form on their own (A5 review, F5).
 *
 * B1 built the first piece of that world:
 *
 * - `map.ts` — a whole theatre generated from a seed: terrain, rivers crossed by
 *   fords, resources, settlements, Strongholds and roads, with the invariants a
 *   fair map has to satisfy asserted over a thousand seeds. It is a pure
 *   function of the seed, and the map is integer state like everything else
 *   (ADR-0006), so the Match that eventually runs on it replays exactly.
 *
 * B4 made the Observation's promise a fact rather than a hope:
 *
 * - `fog.ts` — the fog of war: a visibility grid per Faction with three states
 *   (unexplored, remembered, in view), vision by radius from the Faction's own
 *   eyes, the terrain memory that outlives them, the last known enemy contacts,
 *   and the view a Controller may read. Memory is *state* — who saw what decides
 *   what can be decided — so it is hashed and replayed like everything else
 *   (ADR-0013). `inspectionView` is the debugging mode: the whole map known, and
 *   deliberately not a Player.
 * - `fog-match.ts` — the theatre, both Factions' memory of it, and the
 *   Observation built from that memory, recomputed on every tick from the
 *   settlements the Faction holds.
 *
 * B5 gave the Match its strategic clock, which the CLI plays today:
 *
 * - `season.ts` — the calendar: four Seasons to a game year, autumn and winter
 *   as the only two hooks another system needs, and a Season Match whose
 *   Observation carries the season and the year. The headless bound of three
 *   game years is `HEADLESS_TICKS` here, so the clock and the bound cannot
 *   disagree about how long a year is.
 * - `pacing.ts` — the three speeds, the pause, and the orders given in it: a
 *   paused loop steps no ticks, and a `PausableController` holds what a Player
 *   decides until the Match resumes. Neither ever reaches state or the hash.
 *
 * B6 gave the Match an economy with nobody to click, and put the theatre the map
 * generated inside `MatchState` at last (ADR-0005):
 *
 * - `economy.ts` — settlements, the population allocated to their works and their
 *   land, the four resources held per settlement and the denarii held once per
 *   Faction, the autumn harvest, construction as a labour allocation plus a
 *   timer, the three tiers that gate recruitment, and the Payroll that moves
 *   morale and, eventually, deserts.
 * - `economy-match.ts` — the Match that joins B1's map, B5's clock and B6's
 *   economy: the first world whose hash covers the tiles a Match begins on.
 *   `content/` is where the buildings and Squad types it reads are written down.
 *
 * C1 added the half of the Squad that walks, to the Squad B6 had already put in
 * the world: the economy held where a Squad stands and what it costs to keep
 * apart on purpose (`economy.ts` says so), and the two halves are one entity now,
 * moving on the tiles the economy's Match already carries.
 *
 * - `route.ts` — what crossing a tile costs, A* over the grid to find the
 *   cheapest way to another, a reason when there is none, and a per-theatre
 *   memory of the routes already worked out.
 * - `squad.ts` — the block a Squad is: the four facings and the two formations as
 *   state holds them, and the frontage, the depth and the places of its men
 *   derived from the formation it holds and the men it has left, never stored.
 * - `movement.ts` — the moving half of the Squad: the route it walks, what a
 *   refused order says, and the `move`, `attackMove`, `hold` and `formation`
 *   Commands `economyMatchRules` obeys. Recruitment puts a Squad on its
 *   settlement's tile, and `observeEconomy` reports where it stands beside what
 *   it costs to keep.
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

export { FACTIONS, factionCode, factionOf, isFaction } from './faction.ts';
export type { Faction, FactionCode } from './faction.ts';
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
export { ForeignCommandError, ObservationProjectionError, runMatch } from './driver.ts';
export type { MatchResult, MatchRun, MatchSetup, Outcome } from './driver.ts';
export { emptyMatchOutcome, emptyMatchRules, observeEmptyMatch } from './empty.ts';
export type { EmptyMatchVisible, EmptyMatchWorld } from './empty.ts';

export { createPacing, isSpeed, NORMAL_SPEED, SPEEDS } from './pacing.ts';
export type { Pacing, PausableController, Speed } from './pacing.ts';

export {
  advanceCalendar,
  announceSeasons,
  HEADLESS_TICKS,
  HEADLESS_YEARS,
  observeSeasonMatch,
  SEASON_TICKS,
  SEASONS,
  SEASONS_PER_YEAR,
  seasonMatchOutcome,
  seasonMatchRules,
  seasonName,
  seasonOf,
  startCalendar,
  YEAR_TICKS,
} from './season.ts';
export type {
  Season,
  SeasonCalendar,
  SeasonChange,
  SeasonHooks,
  SeasonMatchVisible,
  SeasonMatchWorld,
} from './season.ts';

export {
  advanceConstruction,
  allocate,
  applyEconomyCommand,
  BASE_HOUSING,
  BASE_LAND_CAPACITY,
  BASE_STORAGE,
  chargePayroll,
  createEconomy,
  GRAIN_PER_HEAD,
  harvest,
  harvestYield,
  HARVEST_YIELD,
  housingCapacity,
  isHeld,
  landCapacity,
  LAND_RADIUS,
  LAND_YIELD,
  MORALE_LOSS_PER_UNPAID_SEASON,
  MORALE_RECOVERY,
  POPULATION_GROWTH,
  produceSeason,
  seasonYield,
  standingWorks,
  STARTING_DENARII,
  STARTING_POPULATION,
  STARTING_STOCKS,
  STARVATION_LOSS,
  storageCapacity,
  TAX_PER_DENARIUS,
  TREASURY_CAP,
  UNOWNED,
} from './economy.ts';
export type { Allocation, Economy, Settlement, Squad, Work } from './economy.ts';

export { economyMatchOutcome, economyMatchRules, observeEconomy } from './economy-match.ts';
export type {
  EconomyVisible,
  EconomyWorld,
  VisibleSettlement,
  VisibleSquad,
  VisibleStocks,
  VisibleWork,
} from './economy-match.ts';

export {
  createRouteCache,
  findRoute,
  moveCost,
  NO_REFUSAL,
  refusalCode,
  refusalOf,
  ROUTE_CACHE_LIMIT,
  ROUTE_REFUSALS,
} from './route.ts';
export type { Route, RouteCache, RouteRefusal } from './route.ts';

export {
  depth,
  FACING,
  FACINGS,
  facingCode,
  facingOf,
  FORMATION,
  formationCode,
  formationOf,
  frontage,
  menOf,
  standingAt,
} from './squad.ts';
export type { Block, Facing, Man, Shape } from './squad.ts';

export {
  applyMovementCommands,
  goalOf,
  march,
  musterSquad,
  routeCacheFor,
} from './movement.ts';
export type { Placement } from './movement.ts';

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

export {
  believedTerrain,
  createFog,
  createFogs,
  eyeOf,
  forgetContacts,
  inspectionView,
  KNOWLEDGE,
  knows,
  observeContacts,
  refreshVision,
  requireTile,
  SETTLEMENT_VISION,
  UNSEEN,
  viewOf,
} from './fog.ts';
export type { EnemyInSight, Eye, Fog, FogView, Knowledge, LastKnownContact } from './fog.ts';

export { createFogMatchWorld, eyesOf, fogMatchOutcome, fogMatchRules, observeFogMatch } from './fog-match.ts';
export type { FogMatchVisible, FogMatchWorld } from './fog-match.ts';
