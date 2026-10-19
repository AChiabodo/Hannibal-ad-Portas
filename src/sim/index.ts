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
 * C1 made the Squads walk, and C3 made them fight:
 *
 * - `squad.ts` — the block a Squad is: its facings, its formations, its fatigue
 *   and its nerve, and where its men stand (the last two derived).
 * - `route.ts` and `movement.ts` — what crossing a tile costs, A* over the
 *   theatre, refusals, and the Commands that move a Squad.
 * - `combat.ts` — the fight: contact, the matchup matrix, flanking and rear
 *   attacks, terrain, fatigue, missiles, Supply, and the rout and rally that
 *   follow. Morale is the primary resource and a round of it is one simultaneous
 *   exchange (ADR-0015).
 * - `residue.ts` — the men a fight costs, kept *beside* the Match: corpses are
 *   drawn, fade, and never enter the state hash.
 *
 * B5 gave the Match its strategic clock, which the CLI plays today:
 *
 * - `season.ts` — the calendar: four Seasons to a game year, autumn and winter
 *   as the only two hooks another system needs, and a Season Match whose
 *   Observation carries the season and the year. A Match's horizon of three
 *   game years is `MATCH_TICKS` here — `HEADLESS_TICKS` is the same number under
 *   the name the CLI reads it by — so the clock, the CLI's default bound and the
 *   page's bound cannot disagree about how long a year or a Match is.
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
 *
 * C2 put men on the map and a hand on them, and the half of that which is the
 * simulation's is small on purpose: the rules already knew where every man in a
 * block stood, and drawing them is `art/` and `render/`. What was missing was
 * eyes. A Squad sees (`SQUAD_VISION`), and `eyesOfEconomy` is the one list of a
 * Faction's eyes — its settlements' watches and its marching Squads' — that the
 * page refreshes its fog from (ADR-0013). The Player's selection and control
 * groups are not here at all: they are `input/`'s, and not state (ADR-0014).
 *
 * C4 filled both rosters out, and what it added to the simulation is two numbers
 * a type now states. `paceCost` (`route.ts`) divides a tile's cost by the
 * walker's own `pace`, and the search and its cache are priced in that pace, so
 * a horse is routed as a horse (ADR-0017). A type may also state how many
 * `figures` a full-strength Squad of it is drawn as — one, for an elephant whose
 * `strength` is the staying power that figure is worth — and the Observation
 * carries it beside the men (ADR-0016). The fight reads `strength` and knows
 * nothing about either.
 *
 * C5 is where a Match first ends sooner than its bound (ADR-0008, ADR-0018):
 *
 * - `siege.ts` — the walls of every settlement as structures with their own hit
 *   points, the Roman ram built on the spot and vulnerable to the garrison, the
 *   Assault through a breach, the Blockade that cuts a settlement's supply and
 *   starves it, the minor settlement taken by holding its centre, and the fall of
 *   a Stronghold that ends the Match and says why. A garrison is a posture of an
 *   ordinary Squad (`Block.garrison`), so there is no second kind of army.
 * - `siegeMatchRules`, `observeSiege` and `siegeMatchOutcome` are the Match that
 *   joins all of it: the economy's tick with the blockaded settlements cut out
 *   of production, the Siege's own Commands and clocks, and the verdict.
 *
 * C6 makes supply a place on the map (ADR-0005):
 *
 * - `territory.ts` — the country a Faction's settlements give it, inferred
 *   afresh from who holds what and handed to an Observation as a grid of its
 *   own; the Attrition a Season outside that country takes off a Squad's men;
 *   and the quarters that shield it — a settlement's walls, its centre, or the
 *   ground a standing Castrum makes into a camp — Rome's alone, and still Rome's
 *   when the village it stands in changes hands (`canCamp`). It
 *   subscribes to the Season boundary beside the economy (`attritionSeasons`),
 *   and C3's `inSupply` asks the same question rather than guessing it from a
 *   radius, so a Squad's nerve and its men are cut off by one boundary and not
 *   two.
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
  SiegePath,
  WithdrawCommand,
} from './command.ts';
export type { Observation } from './observation.ts';
export { scriptedController, idleController } from './controller.ts';
export type { Controller, Player, Players } from './controller.ts';
export {
  ForeignCommandError,
  ObservationProjectionError,
  matchQuestions,
  runMatch,
  runMatchAsync,
} from './driver.ts';
export type {
  Answer,
  MatchResult,
  MatchRun,
  MatchSetup,
  Outcome,
  Question,
  VictoryReason,
} from './driver.ts';
export { emptyMatchOutcome, emptyMatchRules, observeEmptyMatch } from './empty.ts';
export type { EmptyMatchVisible, EmptyMatchWorld } from './empty.ts';

export { createPacing, isSpeed, NORMAL_SPEED, SPEEDS } from './pacing.ts';
export type { Pacing, PausableController, Speed } from './pacing.ts';

export {
  advanceCalendar,
  announceSeasons,
  HEADLESS_TICKS,
  HEADLESS_YEARS,
  MATCH_TICKS,
  MATCH_YEARS,
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
  ALWAYS_SUPPLIED,
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
export type { Allocation, Economy, Settlement, Squad, Supplied, Work } from './economy.ts';

export { economyMatchOutcome, economyMatchRules, eyesOfEconomy, observeEconomy, stepEconomyWorld } from './economy-match.ts';
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
  paceCost,
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
  FATIGUE_MAX,
  FIELD,
  FORMATION,
  formationCode,
  formationOf,
  frontage,
  isRouting,
  menOf,
  ROUTING,
  standingAt,
} from './squad.ts';
export type { Block, Facing, Man, Shape } from './squad.ts';

export {
  applyMovementCommands,
  goalOf,
  march,
  musterSquad,
  orderedSquads,
  orderSquadTo,
  ownedSquads,
  paceOf,
  routeCacheFor,
} from './movement.ts';
export type { Placement } from './movement.ts';

export {
  ADVANTAGE_RATIO,
  applyCombatCommands,
  armOfType,
  ASPECT_SHOCK,
  ASPECT_STRIKE,
  aspectOf,
  BASE_SHOCK,
  BREAKING_MORALE,
  engagedPairs,
  engagedWith,
  enemyWithin,
  exchangeOf,
  EXCHANGE_TICKS,
  FATIGUE_PENALTY,
  fight,
  FORD_DISORDER,
  FORD_SHOCK,
  FOREST_CAVALRY,
  HILL_DEFENCE,
  inContact,
  inSupply,
  MATCHUP_SHOCK,
  VOLLEY_STRIKE,
  AMMUNITION_PER_VOLLEY,
  moraleCeiling,
  RALLY_MORALE,
  RALLY_RADIUS,
  resupply,
  ROUTED_STRIKE,
  safetyFor,
  scaledBy,
  supplyMorale,
  STRIKE,
  SUPPLY_MORALE_LOSS,
  VOLLEY_SHOCK,
  woundsOf,
} from './combat.ts';
export type { Aspect, Exchange, Ratio, Wound } from './combat.ts';

export {
  CORPSE_FADE_TICKS,
  CORPSE_LIMIT,
  CORPSE_TICKS,
  corpsesOf,
  fadeResidue,
  isLying,
  recordCasualties,
  residueFor,
} from './residue.ts';
export type { Corpse, Fallen, Residue } from './residue.ts';

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
  SQUAD_VISION,
  UNSEEN,
  viewOf,
} from './fog.ts';
export type { EnemyInSight, Eye, Fog, FogView, Knowledge, LastKnownContact } from './fog.ts';

export { createFogMatchWorld, eyesOf, fogMatchOutcome, fogMatchRules, observeFogMatch } from './fog-match.ts';
export type { FogMatchVisible, FogMatchWorld } from './fog-match.ts';

export {
  applyAttrition,
  ATTRITION_FIELD_WINTER_PERCENT,
  attritionSeasons,
  ATTRITION_PERCENT,
  ATTRITION_WINTER_PERCENT,
  attritionPercent,
  CAMP_RADIUS,
  canCamp,
  holdsTerritory,
  inCamp,
  inQuarters,
  territoryAt,
  territoryOf,
  territoryView,
  TERRITORY_RADIUS,
} from './territory.ts';
export type { Territory } from './territory.ts';

export {
  applySiegeCommand,
  ASSAULT_TICKS,
  besiege,
  BLOCKADE_GRAIN_LOSS,
  BLOCKADE_MORALE_LOSS,
  BLOCKADE_POPULATION_LOSS,
  breached,
  canAssault,
  CAPTURE_HOLDS,
  CAPTURE_TICKS,
  createSiege,
  createSiegeWorld,
  ESCALADE_DAMAGE,
  frontAt,
  GATE_HP,
  gateOf,
  garrisonOf,
  isBlockaded,
  isWalled,
  observeSiege,
  RAM_BUILD_TICKS,
  RAM_COST,
  RAM_DAMAGE,
  RAM_FILES_PER_BLOW,
  RAM_HP,
  RELIEF_RADIUS,
  SIEGE,
  SIEGE_RADIUS,
  settlementIdAt,
  siegeMatchOutcome,
  siegeMatchRules,
  starveBlockades,
  STRUCTURE,
  STRUCTURE_KINDS,
  suppliedBy,
  WALL_ASSAULT_LOSS,
  WALL_HP,
  WALL_SECTIONS,
  WALL_SHOCK,
} from './siege.ts';
export type {
  Front,
  Siege,
  SiegeCode,
  SiegeVisible,
  SiegeWorld,
  Structure,
  StructureKind,
  VisibleFront,
  VisibleRam,
  VisibleStructure,
} from './siege.ts';
