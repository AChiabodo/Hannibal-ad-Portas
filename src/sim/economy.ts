/**
 * The economy: settlements, labour, the four resources, denarii, tiers and
 * Payroll (PLAN §4, ADR-0005, ticket B6).
 *
 * A real economy with nobody to click. Population is a **pool allocated to
 * buildings and land**, never units wandering about: a settlement's people are
 * staffed onto its works in the order it raised them, and whatever is left over
 * works the land, drawing on the resource nodes the map put within reach. There
 * are no villagers, no haulers and no supply lines, because ADR-0005 settled
 * that there would not be.
 *
 * What the module owns, in the order a Season walks it:
 *
 * - **Land and works.** `allocate` splits a settlement's population between its
 *   works and the four kinds of land; `seasonYield` turns that allocation into
 *   grain, timber, stone and iron. A work that is not staffed neither builds nor
 *   produces, which is what makes "production follows the allocation" true
 *   rather than decorative.
 * - **A timer.** `advanceConstruction` counts every work's ticks down while it
 *   is staffed. A building is not a construction site: it is a labour demand and
 *   a countdown (ADR-0005).
 * - **Stocks and a treasury.** Grain, timber, stone and iron accumulate **per
 *   settlement**, up to what that settlement can store; denarii are one
 *   **treasury per Faction**. `produceSeason` is the Season's work; `harvest` is
 *   the autumn peak.
 * - **Tiers.** A settlement's tier is raised by the building that raises it, and
 *   a Recruit of a Squad type above the settlement's tier is refused. The
 *   progression is the tiers and nothing else.
 * - **Payroll.** `chargePayroll` charges each Faction every Season for the
 *   Squads it keeps; a Squad the treasury could not pay loses morale and
 *   eventually deserts.
 *
 * ## Integer state, and what is derived
 *
 * Everything here is integer state (`serializeState` refuses anything else,
 * ADR-0006), so the economy's numbers are whole units of grain, whole denarii,
 * whole people and whole ticks. What is *not* state is the allocation: it is
 * recomputed from the population, the works and the map whenever it is needed,
 * so whether it was looked at cannot change a hash. A Squad's type and a work's
 * building are integers too — content codes (`content/`), not the ids a Command
 * carries — because state cannot hold a string.
 *
 * ## The land, and the map's nodes on it
 *
 * A settlement's **land** is the ground around it: farmland yields grain, forest
 * yields timber, hill yields stone, and a **resource node** inside the same reach
 * adds its `amount` of its own resource on top — the rich spot the map put
 * there. Nothing depletes. A depleting pile would either run the economy dry
 * inside a game year (the map's nodes hold single- and double-digit amounts) or
 * have to be refilled, which is a different game; the plan says the economy
 * draws on the land, so it draws on the land without exhausting it. Storage
 * capacity is what bounds a stock, not scarcity of ground. Iron is the
 * exception the map makes on purpose: only an iron node or a mine yields it, so
 * a settlement without one has to build for it.
 *
 * ## Ownership, and what is not here
 *
 * Only a settlement a Faction owns runs an economy: an unowned minor settlement
 * holds people and a stock but produces nothing until it is taken, and taking
 * one is C5's. The walls and the fall of a Stronghold are C5's too, and live in
 * `siege.ts`; the one thing this module gives it is `Supplied`, the predicate a
 * Season's production already needed — a blockaded settlement works nothing and
 * eats what its granary holds. Attrition outside friendly Territory is C6's.
 */
import {
  amountOf,
  buildingCode,
  buildingOf,
  isLegalSize,
  payrollBill,
  squadTypeCode,
  squadTypeOf,
  stockAt,
  stockOf,
  type BuildingType,
  type ResourceAmounts,
} from '../content/index.ts';
import type { Faction, FactionCode } from './faction.ts';
import { factionCode } from './faction.ts';
import { RESOURCE, RESOURCE_KINDS, MAP_HEIGHT, MAP_WIDTH, TERRAIN, terrainAt, type MapGrid, type Site } from './map.ts';
import type { BuildCommand, Command, RecruitCommand } from './command.ts';
import type { Season } from './season.ts';
import type { Block } from './squad.ts';
import { advancePendingOrders, enqueueOrder } from './pending-orders.ts';
import { bindEconomySpace } from './settlement-space.ts';

/**
 * The owner a settlement nobody holds has.
 *
 * Not a `FactionCode`, which is 0 or 1 and nothing else: a minor settlement is
 * on the map from the first tick and belongs to nobody until it is taken, and
 * the number has to be one no Faction can be confused with.
 */
export const UNOWNED = -1;

/** How many people a settlement starts with: enough to work a little land and raise the first works. */
export const STARTING_POPULATION = 10;

/** How many more people a settlement can hold before it raises anything: the housing its walls and huts give it. */
export const BASE_HOUSING = 12;

/** How much of each resource a settlement can store before it raises anything. */
export const BASE_STORAGE = 30;

/** How many people a settlement gains in a Season it is fed and has room for. */
export const POPULATION_GROWTH = 1;

/** How many people one unit of grain feeds in a Season. */
export const GRAIN_PER_HEAD = 5;

/** How many people a settlement loses to a Season it cannot feed. */
export const STARVATION_LOSS = 1;

/** How much of its resource one worker on the land produces in a Season. */
export const LAND_YIELD = 1;

/** How much extra grain one worker on the land brings in at the autumn harvest, on top of the ordinary yield. */
export const HARVEST_YIELD = 3;

/** How far from a settlement its land reaches, in tiles: the ground within this is what it works. */
export const LAND_RADIUS = 14;

/**
 * How much of each resource every settlement works without anyone having to find
 * it: the settlement's own immediate ground.
 *
 * The kitchen gardens, the hedgerow timber, the village quarry and the bog iron
 * are always there, whatever the seed put within reach, and this is what lets a
 * Stronghold opened on a plain feed itself and raise its first buildings rather
 * than be unable to buy a single plank. The map's terrain and nodes are the
 * surplus above it, not the floor.
 */
export const BASE_LAND_CAPACITY = 2;

/** How many people make one denarius of tax in a Season. */
export const TAX_PER_DENARIUS = 4;

/** The most denarii one Faction's treasury can hold: a war chest, not an infinite ledger. */
export const TREASURY_CAP = 200;

/** What each Faction's treasury starts with. */
export const STARTING_DENARII = 20;

/**
 * What a settlement holds when a Match opens.
 *
 * A settlement is not founded on the morning of the Match: its granary, its
 * timber yard and its forge hold something, and this is what makes the opening
 * playable — a Faction that could not pay for its first building until a Season
 * had passed would open every Match by watching.
 */
export const STARTING_STOCKS: ResourceAmounts = { grain: 20, timber: 20, stone: 10, iron: 10 };

/** How much morale an unpaid Squad loses in a Season. */
export const MORALE_LOSS_PER_UNPAID_SEASON = 2;

/** How much morale a paid Squad recovers in a Season, up to the most its type comes with. */
export const MORALE_RECOVERY = 1;

/**
 * Whether a settlement is drawing supply: a blockaded one produces nothing (C5).
 *
 * The economy knows that production follows supply; *who* is cut off is the
 * Siege's answer, handed in as this predicate rather than imported, because
 * `siege.ts` reads the economy and the economy must not read it back. A Match
 * with no Siege in it passes nothing and every settlement is supplied, which is
 * why the other Matches are byte-identical without it.
 */
export type Supplied = (settlement: Settlement) => boolean;

/** The predicate of a world where nothing is besieged: every settlement is fed. */
export const ALWAYS_SUPPLIED: Supplied = () => true;

/**
 * A work, standing or being built: one building in one settlement.
 *
 * `remaining` is the timer. A work with ticks left is being built: it is staffed
 * out of the settlement's population every tick, and the ticks come down while
 * it is. A work with none is standing and producing, and is staffed the same way
 * — the same allocation, because a building is labour whether it is going up or
 * working (ADR-0005).
 */
export interface Work {
  /** Permanent copy number and original builder, preserved on conquest. */
  readonly ordinal?: number;
  origin?: number;
  /** Which building it is, as a content code — state holds numbers, not ids. */
  readonly building: number;

  /** Ticks left before it is built: 0 when it is standing. */
  remaining: number;
}

/**
 * A Squad: the terms Payroll is charged on, and the block that walks.
 *
 * The two halves of one entity, and the split is deliberate. What it costs to
 * keep, what type it is, where it was raised and whether it has been paid are
 * the economy's; **where it stands, how many men are left in it, what shape it
 * holds, the way it faces and the route it is walking are C1's** — the `Block`
 * `squad.ts` defines, which says of itself that it is the half of a Squad the
 * economy carries the other half of. `morale` is folded in here because Payroll
 * is the first thing that moves it and "unpaid Squads lose morale and eventually
 * desert" is this ticket's.
 *
 * C3 takes men off `strength` and moves `morale` in a fight; C1 moves the block;
 * none of them owns a Squad of its own, which is the point of the two halves
 * being one interface.
 */
export interface Squad extends Block {
  /** What a Command names it by, and what an Observation reports: an id is never reused. */
  readonly id: number;

  /** The Faction that owns it, as state holds a Faction. */
  readonly owner: FactionCode;

  /** Its type, as a content code. */
  readonly type: number;

  /**
   * The men it was raised with: its recruited capacity, fixed for its life.
   *
   * Kept apart from `strength`, which is the men still standing, so a Squad that
   * has lost half its men still knows what it was bought as — what a panel reads
   * its survivors against, and what a replay hashes. Payroll does **not** use
   * it: the bill follows the survivors (ADR-0026, ADR-0027).
   */
  readonly capacity: number;

  /** The settlement that raised it: where Payroll and desertion say it belongs. */
  readonly home: number;

  /** What it has left to fight with (C3 owns the model; Payroll is the first hand on it). */
  morale: number;

  /** Seasons in a row it has gone unpaid: the road to desertion. */
  unpaid: number;
}

/** How a settlement's people are divided, at one moment, between its works and its land. */
export interface Allocation {
  /** Workers staffed on each work, in the settlement's own work order: 0 when it is not staffed. */
  readonly works: readonly number[];

  /** Workers on the land, per resource, indexed by `RESOURCE`. */
  readonly land: readonly number[];
}

/** One settlement: what the economy owns on one tile of the map. */
export interface Settlement {
  /** Construction tradition persists through conquest, independently of holder. */
  origin?: number;
  /** Its id: the index it takes in the economy's list, which is what a Command names. */
  readonly id: number;

  /** The tile it stands on. */
  readonly x: number;

  /** The tile it stands on, downwards. */
  readonly y: number;

  /** The Faction that holds it, or `UNOWNED`. */
  owner: number;

  /** Its tier: 1, 2 or 3, raised by the building that raises it. */
  tier: number;

  /** The people in it: the pool every allocation divides. */
  population: number;

  /** What it holds of each resource, indexed by `RESOURCE`. */
  readonly stocks: number[];

  /** Its buildings, in the order it raised them: the order the allocation staffs them in. */
  readonly works: Work[];
}

/** Everything the economy is: the settlements, the two treasuries, and the Squads. */
export interface Economy {
  nextAccessTicket?: number;
  pending?: PendingOrder[];
  nextPendingId?: number;
  /** Every settlement on the map, owned or not, by id. */
  readonly settlements: Settlement[];

  /** Each Faction's denarii, indexed by `FactionCode`: one treasury per Faction, not per settlement. */
  readonly treasuries: number[];

  /** Every Squad either Faction keeps, in the order it was raised. */
  squads: Squad[];

  /** The id the next Squad raised will take: ids are never reused. */
  nextSquadId: number;
}

/**
 * Opens the economy the map describes.
 *
 * Pure in the map, which is pure in the seed, so two Matches on one seed open
 * the same settlements with the same people and the same empty stocks (ADR-0006).
 * The two Strongholds are Rome's and Carthage's, in the order `MapGrid` keeps
 * them; every minor settlement belongs to nobody until a Faction takes it (C5).
 */
export function createEconomy(map: MapGrid): Economy {
  const settlements: Settlement[] = [];

  for (const [owner, site] of map.strongholds.entries()) {
    settlements.push(openSettlement(settlements.length, site, owner));
  }

  for (const site of map.settlements) {
    settlements.push(openSettlement(settlements.length, site, UNOWNED));
  }

  return bindEconomySpace(map, {
    settlements,
    treasuries: [STARTING_DENARII, STARTING_DENARII],
    squads: [],
    nextSquadId: 1,
    pending: [],
    nextPendingId: 1,
  });
}

/** Unpaid, integer-only requests. A pending request is not yet a Work or Squad. */
export interface PendingOrder {
  readonly id: number;
  readonly owner: number;
  readonly settlement: number;
  /** 0: construction; 1: recruitment. */
  readonly kind: number;
  readonly content: number;
  readonly ordinal: number;
  readonly men: number;
  readonly count: number;
  /** 1: occupied ground; 2: insufficient stock. */
  reason: number;
}

/** A settlement at the opening of a Match: its people, and the four empty stocks. */
function openSettlement(id: number, site: Site, owner: number): Settlement {
  return {
    origin: owner === 1 ? 1 : 0,
    id,
    x: site.x,
    y: site.y,
    owner,
    tier: 1,
    population: STARTING_POPULATION,
    stocks: stockOf(STARTING_STOCKS),
    works: [],
  };
}

/**
 * Whether a settlement runs an economy: only one a Faction holds does.
 *
 * A type guard rather than a plain predicate, so a caller that has asked is
 * handed an `owner` that is a `FactionCode` and does not have to cast it back.
 */
export function isHeld(settlement: Settlement): settlement is Settlement & { owner: FactionCode } {
  return settlement.owner === 0 || settlement.owner === 1;
}

/** How many people a settlement can hold: its walls, the houses it raised, and the villa that grew. */
export function housingCapacity(settlement: Settlement): number {
  return standingWorks(settlement).reduce(
    (room, building) => room + building.housing,
    BASE_HOUSING,
  );
}

/** How much of each resource a settlement can store: what it has built to keep things in. */
export function storageCapacity(settlement: Settlement): number {
  return standingWorks(settlement).reduce(
    (room, building) => room + building.storage,
    BASE_STORAGE,
  );
}

/** The buildings a settlement has finished, in the order it raised them. */
export function standingWorks(settlement: Settlement): readonly BuildingType[] {
  return settlement.works
    .filter((work) => work.remaining === 0)
    .map((work) => buildingOf(work.building))
    .filter((building): building is BuildingType => building !== undefined);
}

/**
 * How much land of each kind a settlement can work: its own immediate ground,
 * plus the terrain within `LAND_RADIUS` of it, plus the resource nodes standing
 * on that ground.
 *
 * `BASE_LAND_CAPACITY` of each is always there. Above it, farmland yields grain,
 * forest timber and hill stone, a tile each; a node adds its own amount of its
 * own resource, which is what makes a node worth marching to. Iron has no
 * terrain of its own — a hill yields stone — so iron above the base comes from a
 * node or from a mine, and a settlement with neither has only its own ground.
 *
 * Read from the map rather than stored, because it is a fact about where the
 * settlement stands and storing it would let a later change to the map pass
 * unremarked. The distance is Chebyshev — whole tiles, no square root, no
 * transcendentals (ADR-0006) — which makes the settlement's land a square, and
 * a tile off the map simply does not count.
 *
 * ## Why there is a cache, and why it is not state
 *
 * This is not a cheap call — a square of up to 29×29 tiles, per settlement — and
 * the driver asks a Controller for an Observation on **every tick**, so the
 * Observation must not pay for it each time. The map a Match runs on never
 * changes after it is generated, so the answer is a pure function of that map
 * and the settlement's id, and it is remembered here. Like C1's route cache this
 * is a derived value and not state (ADR-0006): nothing hashes it, a replay that
 * computed it a different number of times computes the same numbers, and the
 * returned array is shared — so a caller reads it and does not write it.
 */
const LAND_CACHE = new WeakMap<MapGrid, Map<number, readonly number[]>>();

export function landCapacity(map: MapGrid, settlement: Settlement): readonly number[] {
  let bySettlement = LAND_CACHE.get(map);
  if (bySettlement === undefined) {
    bySettlement = new Map();
    LAND_CACHE.set(map, bySettlement);
  }

  const remembered = bySettlement.get(settlement.id);
  if (remembered !== undefined) return remembered;

  const capacity = measureLand(map, settlement);
  bySettlement.set(settlement.id, capacity);

  return capacity;
}

/** The land a map puts within a settlement's reach, measured once and remembered above. */
function measureLand(map: MapGrid, settlement: Settlement): readonly number[] {
  const capacity = RESOURCE_KINDS.map(() => BASE_LAND_CAPACITY);

  for (let y = settlement.y - LAND_RADIUS; y <= settlement.y + LAND_RADIUS; y += 1) {
    if (y < 0 || y >= MAP_HEIGHT) continue;

    for (let x = settlement.x - LAND_RADIUS; x <= settlement.x + LAND_RADIUS; x += 1) {
      if (x < 0 || x >= MAP_WIDTH) continue;

      const terrain = terrainAt(map, x, y);
      if (terrain === TERRAIN.farmland) capacity[RESOURCE.grain] = (capacity[RESOURCE.grain] ?? 0) + 1;
      else if (terrain === TERRAIN.forest) capacity[RESOURCE.timber] = (capacity[RESOURCE.timber] ?? 0) + 1;
      else if (terrain === TERRAIN.hill) capacity[RESOURCE.stone] = (capacity[RESOURCE.stone] ?? 0) + 1;
    }
  }

  for (const node of map.resources) {
    if (Math.abs(node.x - settlement.x) > LAND_RADIUS) continue;
    if (Math.abs(node.y - settlement.y) > LAND_RADIUS) continue;
    capacity[node.kind] = (capacity[node.kind] ?? 0) + node.amount;
  }

  return capacity;
}

/**
 * How a settlement's people are divided between its works and its land.
 *
 * The works first, in the order the settlement raised them: each takes its
 * `labour` out of the pool if the pool can cover it, and one it cannot cover
 * gets nobody and waits. What is left over works the land, one worker at a time
 * around the four kinds, so the leftovers are spread as evenly as the land
 * allows and never put where there is no land for them.
 *
 * All-or-nothing per work on purpose: a building half-staffed is a building that
 * produces a fraction, and a fraction of an integer stock is a float in state
 * (ADR-0006). A work is either worked or it is not, which is also the honest
 * picture of a settlement that has run out of hands.
 */
export function allocate(settlement: Settlement, capacity: readonly number[]): Allocation {
  let available = settlement.population;

  const works = settlement.works.map((work) => {
    const building = buildingOf(work.building);
    if (building === undefined) return 0;
    if (available < building.labour) return 0;

    available -= building.labour;
    return building.labour;
  });

  const land = RESOURCE_KINDS.map(() => 0);
  let remaining = available;

  while (remaining > 0) {
    let placed = false;

    for (const kind of RESOURCE_KINDS) {
      if (remaining === 0) break;
      if ((land[kind] ?? 0) >= (capacity[kind] ?? 0)) continue;

      land[kind] = (land[kind] ?? 0) + 1;
      remaining -= 1;
      placed = true;
    }

    if (!placed) break;
  }

  return { works, land };
}

/**
 * What a settlement's staffed works and worked land yield in one Season.
 *
 * Staffed and standing only: a work still going up yields nothing, and one with
 * no workers yields nothing, which is what ties production to the allocation.
 * Winter halves what the land yields and leaves the works alone — the plan's
 * winter is the reason a campaign season ends, and the land is what feels it.
 */
export function seasonYield(
  settlement: Settlement,
  allocation: Allocation,
  season: Season,
): readonly number[] {
  const produced = RESOURCE_KINDS.map(() => 0);

  settlement.works.forEach((work, index) => {
    if (work.remaining > 0) return;
    if (!isStaffed(work, allocation, index)) return;

    const building = buildingOf(work.building);
    if (building === undefined) return;

    for (const kind of RESOURCE_KINDS) {
      produced[kind] = (produced[kind] ?? 0) + amountOf(building.yields, kind);
    }
  });

  const winter = season === 'winter';
  for (const kind of RESOURCE_KINDS) {
    const worked = (allocation.land[kind] ?? 0) * LAND_YIELD;
    produced[kind] = (produced[kind] ?? 0) + (winter ? Math.floor(worked / 2) : worked);
  }

  return produced;
}

/**
 * What a settlement's land brings in at the autumn harvest, on top of the
 * Season's ordinary grain: the peak in the year's production.
 *
 * It is the people on the grain land and the richness of the ground under them,
 * and nothing else. A settlement that put its hands into a mine and left the
 * fields has a poor harvest, which is the trade the allocation is for.
 */
export function harvestYield(allocation: Allocation): number {
  return (allocation.land[RESOURCE.grain] ?? 0) * HARVEST_YIELD;
}

/**
 * Works a Season for every settlement a Faction holds: production, the people
 * who eat it, and the denarii it earns.
 *
 * The order is the order the settlement's year depends on: what the land and the
 * works produced is added to the stock, the people eat out of it and grow if
 * there is enough left over, and the tax is collected on the people who are
 * still there. The autumn harvest is deliberately not here — it arrives as the
 * `onAutumn` hook (`harvest`), so a Season's ordinary work and the harvest are
 * two things a reader can see apart.
 */
export function produceSeason(
  map: MapGrid,
  economy: Economy,
  season: Season,
  supplied: Supplied = ALWAYS_SUPPLIED,
): void {
  for (const settlement of economy.settlements) {
    if (!isHeld(settlement)) continue;

    const fed = supplied(settlement);
    const allocation = allocate(settlement, landCapacity(map, settlement));

    // A cut-off settlement is not a settlement that skipped a Season: it works
    // nothing, sells nothing, and eats what its granary holds until it is empty.
    // The order is the year's own — produce, eat, tax the people still there —
    // and it is the same order whether the fields were cut or not.
    if (fed) addStock(settlement, seasonYield(settlement, allocation, season));

    feedAndGrow(settlement, fed);

    if (fed) earn(settlement, allocation, economy);
  }
}

/**
 * The autumn harvest: the extra grain the land yields in the Season the harvest
 * begins.
 *
 * Called from the `onAutumn` hook, after the Season's ordinary production, so
 * the harvest is a distinct number a test can read rather than a multiplier
 * buried in `seasonYield`.
 */
export function harvest(
  map: MapGrid,
  economy: Economy,
  supplied: Supplied = ALWAYS_SUPPLIED,
): void {
  for (const settlement of economy.settlements) {
    if (!isHeld(settlement)) continue;
    if (!supplied(settlement)) continue;

    const allocation = allocate(settlement, landCapacity(map, settlement));
    addStock(settlement, [harvestYield(allocation), 0, 0, 0]);
  }
}

/**
 * Advances every work whose timer is still running, by one tick, where the
 * settlement has the hands to staff it.
 *
 * A work with no staff does not count down: the timer and the allocation are one
 * mechanism, so a settlement that over-reached simply builds slower. A work that
 * reaches zero is standing, and if it raises the settlement's tier it raises it
 * then — the building is the tier, and there is no separate upgrade.
 */
export function advanceConstruction(map: MapGrid, economy: Economy): void {
  advancePendingOrders(economy);
  for (const settlement of economy.settlements) {
    if (settlement.works.every((work) => work.remaining === 0)) continue;

    const allocation = allocate(settlement, landCapacity(map, settlement));

    settlement.works.forEach((work, index) => {
      if (work.remaining <= 0) return;
      if (!isStaffed(work, allocation, index)) return;

      work.remaining -= 1;
      const building = buildingOf(work.building);
      if (work.remaining === 0 && building !== undefined && building.raisesTier !== 0) {
        settlement.tier = building.raisesTier;
      }
    });
  }
}

/**
 * Charges every Faction the Payroll it owes for the Squads it keeps, and moves
 * the morale of the ones it could not pay (GLOSSARY: Payroll).
 *
 * Squads are paid in the order they were raised, out of one treasury, until it
 * runs out: a Faction that cannot cover its army pays the oldest first, and the
 * rest go unpaid. A bill is `payrollBill(type, squad.strength)`: the type's rate
 * per 24 *surviving* men, rounded up, not the men the Squad was recruited with
 * (ADR-0027). An unpaid Squad loses morale and counts the Seasons it has been
 * owed; a paid one recovers a point of it, up to the most its type comes with. A
 * Squad whose morale reaches none **deserts** — it leaves the list, and the id it
 * held is not reused.
 *
 * Deterministic on purpose: a treasury and a list in id order decide everything,
 * so the same Season pays the same Squads on every engine.
 */
export function chargePayroll(economy: Economy): void {
  for (const owner of [0, 1] as const) {
    let available = economy.treasuries[owner] ?? 0;
    const kept: Squad[] = [];

    for (const squad of economy.squads) {
      if (squad.owner !== owner) {
        kept.push(squad);
        continue;
      }

      const type = squadTypeOf(squad.type);
      const owed = type === undefined ? 0 : payrollBill(type, squad.strength);

      if (available >= owed) {
        available -= owed;
        squad.unpaid = 0;
        squad.morale = Math.min(type?.morale ?? squad.morale, squad.morale + MORALE_RECOVERY);
        kept.push(squad);
        continue;
      }

      squad.unpaid += 1;
      squad.morale -= MORALE_LOSS_PER_UNPAID_SEASON;
      if (squad.morale > 0) kept.push(squad);
    }

    economy.treasuries[owner] = available;
    economy.squads = kept;
  }
}

/**
 * Applies an economy Command, if the economy can honour it, and reports whether
 * it did.
 *
 * Only two of the twelve Commands are the economy's: `build` and `recruit`.
 * Everything else belongs to the tickets that own it, and is left alone rather
 * than half-obeyed. A Command the economy cannot honour — a settlement it does
 * not hold, a building it cannot afford, a Squad type above the settlement's
 * tier, a name no table knows — changes nothing and reports `false`; refusing it
 * loudly is a matter for whoever shows a Player why (B7, C5), and the rules must
 * not invent a message the interface cannot say.
 */
export function applyEconomyCommand(economy: Economy, command: Command): boolean {
  switch (command.kind) {
    case 'build':
      return applyBuild(economy, command);
    case 'recruit':
      return applyRecruit(economy, command);
    case 'cancelPending': {
      if (heldSettlement(economy, command.settlement, command.faction) === undefined) return false;
      const previous = economy.pending ?? [];
      economy.pending = previous.filter((order) => order.id !== command.order || order.settlement !== command.settlement || order.owner !== factionCode(command.faction));
      return economy.pending.length !== previous.length;
    }
    default:
      return false;
  }
}

/** Starts one building in one settlement, if the settlement holds it and can pay. */
function applyBuild(economy: Economy, command: BuildCommand): boolean {
  const settlement = heldSettlement(economy, command.settlement, command.faction);
  if (settlement === undefined) return false;

  const code = buildingCode(command.building);
  if (code === undefined) return false;

  const building = buildingOf(code);
  if (building === undefined) return false;
  if (building.faction !== undefined && building.faction !== command.faction) return false;
  if (building.tier > settlement.tier) return false;

  const used = new Set([
    ...settlement.works.filter((work) => work.building === code).map((work, ordinal) => work.ordinal ?? ordinal),
    ...(economy.pending ?? []).filter((order) => order.settlement === settlement.id && order.kind === 0 && order.content === code).map((order) => order.ordinal),
  ]);
  let ordinal = 0;
  while (used.has(ordinal)) ordinal += 1;
  if (ordinal >= building.maxPerSettlement) return false;
  enqueueOrder(economy, { owner: factionCode(command.faction), settlement: settlement.id,
    kind: 0, content: code, ordinal, men: 0, count: 1 });

  return true;
}

/** Raises Squads of one type in one settlement, if the tier allows it and the stock covers them. */
function applyRecruit(economy: Economy, command: RecruitCommand): boolean {
  const settlement = heldSettlement(economy, command.settlement, command.faction);
  if (settlement === undefined) return false;

  const code = squadTypeCode(command.squadType);
  if (code === undefined) return false;

  const type = squadTypeOf(code);
  if (type === undefined || type.faction !== command.faction) return false;
  if (type.tier > settlement.tier) return false;
  if (!isLegalSize(type, command.men)) return false;

  enqueueOrder(economy, { owner: factionCode(command.faction), settlement: settlement.id,
    kind: 1, content: code, ordinal: 0, men: command.men, count: command.count });

  return true;
}

/** The settlement a Command names, when the Command's Faction holds it; `undefined` when it may not. */
function heldSettlement(economy: Economy, id: number, faction: Faction): Settlement | undefined {
  const settlement = economy.settlements[id];
  if (settlement === undefined) return undefined;
  if (settlement.owner !== factionCode(faction)) return undefined;

  return settlement;
}

/** Adds what was produced to a settlement's stock, up to what it can store. */
function addStock(settlement: Settlement, produced: readonly number[]): void {
  const capacity = storageCapacity(settlement);

  for (const kind of RESOURCE_KINDS) {
    const held = stockAt(settlement.stocks, kind) + (produced[kind] ?? 0);
    settlement.stocks[kind] = Math.min(capacity, held);
  }
}

/**
 * Whether a work has the people it needs: exactly its building's labour demand,
 * or nobody at all.
 *
 * Comparing against the building's own demand rather than against zero, because
 * a building that needs nobody — a house its people raise themselves — is
 * staffed by definition, and treating `0` as "unstaffed" left it a work that
 * never counted down (a dead resource sink). `allocate` hands a work its demand
 * when it can cover it and zero when it cannot, and `0` is a real demand too.
 */
function isStaffed(work: Work, allocation: Allocation, index: number): boolean {
  const building = buildingOf(work.building);

  return building !== undefined && (allocation.works[index] ?? -1) === building.labour;
}

/**
 * The people eat, and grow when there is enough left over and the fields are
 * theirs; a settlement that cannot feed them starves.
 *
 * `mayGrow` is false for a settlement whose supply is cut: a blockaded town does
 * not raise more mouths on a granary it is emptying.
 */
function feedAndGrow(settlement: Settlement, mayGrow: boolean): void {
  const needed = Math.max(1, Math.floor(settlement.population / GRAIN_PER_HEAD));
  const held = stockAt(settlement.stocks, RESOURCE.grain);

  if (held < needed) {
    settlement.stocks[RESOURCE.grain] = 0;
    settlement.population = Math.max(1, settlement.population - STARVATION_LOSS);
    return;
  }

  settlement.stocks[RESOURCE.grain] = held - needed;

  const surplus = held - needed;
  if (mayGrow && settlement.population < housingCapacity(settlement) && surplus >= needed) {
    settlement.population += POPULATION_GROWTH;
  }
}

/** Collects the Season's denarii into the Faction's treasury, up to what a war chest holds. */
function earn(settlement: Settlement, allocation: Allocation, economy: Economy): void {
  if (!isHeld(settlement)) return;

  const owner = settlement.owner;
  let earned = Math.floor(settlement.population / TAX_PER_DENARIUS);

  settlement.works.forEach((work, index) => {
    if (work.remaining > 0) return;
    if (!isStaffed(work, allocation, index)) return;

    earned += buildingOf(work.building)?.denarii ?? 0;
  });

  economy.treasuries[owner] = Math.min(TREASURY_CAP, (economy.treasuries[owner] ?? 0) + earned);
}

/** Writes a paid cost back into a settlement's stock. */
