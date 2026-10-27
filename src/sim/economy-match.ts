/**
 * The Match whose world is the theatre, the economy and the Squads that walk on
 * it: B5's clock, B6's settlements and C1's movement in one `MatchState`
 * (PLAN §4).
 *
 * This is the Match that joins the world's systems so far, and the first whose
 * world holds all of them: the theatre a seed generated, the calendar, the
 * economy standing on the theatre, and the Squads the economy raises, which move
 * on the tiles the map laid down. A replay therefore begins on the same tiles,
 * crosses the same Season boundaries, pays the same Payroll and marches the same
 * route, because all of it is integer state the hash covers (ADR-0006).
 *
 * The tick does five things, in this order:
 *
 * 1. **Applies the Commands.** `build` and `recruit` are the economy's
 *    (`economy.ts`); `move`, `attackMove`, `hold` and `formation` are the
 *    movement's (`movement.ts`); `attack` and `withdraw` are combat's
 *    (`combat.ts`). Each ignores the kinds the others own; `assault`, `blockade`
 *    and `garrison` are the Siege's, and `siegeMatchRules` applies them before
 *    handing the tick to this function.
 * 2. **Moves the Squads one step along their routes** (`march`), once the tile
 *    each is crossing has been paid for.
 * 3. **Resolves the round of contact**, on the ticks a round falls on: the men
 *    it costs, the morale it shakes, and the fatigue, the missiles, the Supply
 *    and the rout and rally that follow (`combat.ts`). The men who fell are laid
 *    on the field as residue, which is drawn and swept and never hashed.
 * 4. **Counts the works down.** Construction is a timer plus the labour the
 *    allocation already gives it (ADR-0005).
 * 5. **Advances the calendar and announces the boundary.** The economy
 *    subscribes to `onSeason` for its ordinary production, Payroll, the morale a
 *    Squad cut off from its country loses and the resupply of the ones that are
 *    not, and to `onAutumn` for the harvest on top of it — the clock is advanced
 *    once, and the same report is handed to every subscriber: the economy's
 *    hooks, and C6's Attrition beside them, which charges the men a Season
 *    outside the Faction's own Territory costs.
 *
 * A Match on this world still cannot be won or lost on its own: this Match has no
 * Siege in it, so `economyMatchOutcome` returns `null` and the bound ends the
 * run. C5's `siegeMatchRules` is the same tick with a Siege beside it, and its
 * `siegeMatchOutcome` is where a Stronghold's fall decides a Match. What a fight
 * can do here is wear an army down and break it.
 *
 * The Observation is where B7 and D2 will read the economy from: the settlements
 * a Faction holds and where they stand, what is in their stocks, what they are
 * building for, how their people are divided, its treasury and its Squads — each
 * Squad where it stands, what shape it holds and where it is walking, beside the
 * Payroll, the morale, the fatigue, the missiles it has left and whether it has
 * broken (C3). C6 adds the country itself: the tiles the Faction's Territory
 * covers, and whether each Squad is in it and in a camp (`territory.ts`). An
 * enemy's settlement and its Squads are not in it, which is the one filtering
 * this Match can do without fog: ownership is the economy's own secret and it
 * keeps it.
 */
import {
  buildingOf,
  figuresOf,
  namedStock,
  payrollBill,
  squadTypeOf,
  type ResourceAmounts,
} from '../content/index.ts';
import type { Command, Formation } from './command.ts';
import {
  applyCombatCommands,
  bearing,
  engagedWith,
  fight,
  resupply,
  supplyMorale,
} from './combat.ts';
import {
  advanceConstruction,
  ALWAYS_SUPPLIED,
  applyEconomyCommand,
  allocate,
  chargePayroll,
  createEconomy,
  harvest,
  landCapacity,
  produceSeason,
  type Economy,
  type Settlement,
  type Squad,
  type Supplied,
} from './economy.ts';
import { factionCode, type Faction } from './faction.ts';
import { eyeOf, SETTLEMENT_VISION, SQUAD_VISION, type Eye } from './fog.ts';
import { generateMap, type MapGrid, type Site } from './map.ts';
import { applyMovementCommands, goalOf, march, routeCacheFor } from './movement.ts';
import { refusalOf, type RouteRefusal } from './route.ts';
import { pendingOrderCost } from './pending-orders.ts';
import { workOrdinal } from './settlement-space.ts';
import { WORK_MAX_HP } from '../content/buildings.ts';
import { fadeResidue, recordCasualties } from './residue.ts';
import { facingOf, FIELD, formationOf, isRouting, type Facing } from './squad.ts';
import {
  attritionSeasons,
  holdsTerritory,
  inCamp,
  inQuarters,
  territoryOf,
  territoryView,
  type Territory,
} from './territory.ts';
import type { MatchRules } from './match.ts';
import type { MatchSetup } from './driver.ts';
import {
  advanceCalendar,
  announceSeasons,
  seasonOf,
  startCalendar,
  type Season,
  type SeasonCalendar,
  type SeasonChange,
} from './season.ts';

/** The theatre, the clock and the economy: everything the rules of this Match own. */
export interface EconomyWorld {
  /** The theatre the Match is played on, generated from the Match's seed (B1). */
  readonly map: MapGrid;

  /** The strategic clock (B5). */
  readonly calendar: SeasonCalendar;

  /** The settlements, the four resources, the denarii and the Squads (B6). */
  readonly economy: Economy;

  /** How many autumns have begun: the harvest hooks that fired. */
  autumns: number;

  /** How many winters have begun: the attrition hooks that fired. */
  winters: number;
}

/** What a Faction sees of one settlement's stock or land: the four resources by name, not by index. */
export type VisibleStocks = ResourceAmounts;

/** What a Faction sees of one work: what it is building, and how far along it is. */
export interface VisibleWork {
  readonly hp?: number;
  readonly maxHp?: number;
  readonly ordinal?: number;
  readonly origin?: Faction;
  /** The building's id, so a Controller can name it in a Build Command. */
  readonly building: string;

  /** Ticks left before it stands: 0 when it is standing and producing. */
  readonly remaining: number;

  /** Whether it is standing. */
  readonly standing: boolean;
}

/** What a Faction sees of one settlement it holds: what it is, what it has, where its people are. */
export interface VisiblePendingOrder {
  readonly cost?: ResourceAmounts;
  readonly id: number;
  readonly kind: 'build' | 'recruit';
  readonly building: string;
  readonly squadType: string;
  readonly men: number;
  readonly count: number;
  readonly reason: 'space' | 'resources';
}

export interface VisibleSettlement {
  readonly pending?: readonly VisiblePendingOrder[];
  /** Its id, as a Build or Recruit Command names it. */
  readonly id: number;

  /** The tile it stands on. */
  readonly x: number;

  /** The tile it stands on, downwards. */
  readonly y: number;

  /** Its tier: 1, 2 or 3. */
  readonly tier: number;

  /** The people in it. */
  readonly population: number;

  /** What it holds of each resource, per settlement and not shared. */
  readonly stocks: VisibleStocks;

  /** How its people are divided between the works and the land, the other half of `stocks`. */
  readonly land: VisibleStocks;

  /** Its buildings, in the order it raised them. */
  readonly works: readonly VisibleWork[];
}

/** What a Faction sees of one Squad it keeps: what it is, where it stands and what it costs to keep. */
export interface VisibleSquad {
  readonly passage?: {
    readonly settlement: number;
    readonly phase: 'approaching' | 'waiting' | 'entering' | 'leaving';
    readonly remaining: number;
    readonly reason?: string;
  };
  /** Its id, as a Command names it. */
  readonly id: number;

  /** Its type, by the id a Recruit Command would name. */
  readonly type: string;

  /** The tile it stands on (C1). */
  readonly x: number;

  /** The tile it stands on, downwards. */
  readonly y: number;

  /** How many men are left in it: what a drawing code thins out as they fall (C1, C3). */
  readonly men: number;

  /**
   * The men it was recruited with: its capacity, fixed for its life (ADR-0026).
   *
   * Survivors are read against this rather than against the type's largest
   * possible size, so a 60-man Squad that has lost half its men reads as 30/60
   * and never as 30/120. It is hashed state, so a replay preserves it.
   */
  readonly capacity: number;

  /**
   * How many figures it is drawn as right now (C4).
   *
   * The men it has left, for a body of men, so a Squad thins on screen as it is
   * worn down; one, for a type that is a Squad of a single figure — an elephant,
   * whose `men` is the staying power that one figure is worth. A drawing code
   * lays out this many figures, so a beast neither thins nor grows a rank.
   */
  readonly figures: number;

  /** The shape it holds. */
  readonly formation: Formation;

  /** The way it faces. */
  readonly facing: Facing;

  /** The tile it is still walking to, or `null` when it has nowhere left to walk (C1). */
  readonly goal: Site | null;

  /** Why the last move Command it was given could not be carried out, or `null` (C1). */
  readonly refused: RouteRefusal | null;

  /** What it has left to fight with: the primary resource of a fight (C3). */
  readonly morale: number;

  /** How tired it is, 0 to the top of the fatigue scale: a tired Squad strikes weakly (C3). */
  readonly fatigue: number;

  /** How many volleys of missiles it still carries: the first rounds of a contact are worth more (C3). */
  readonly ammunition: number;

  /**
   * Whether it has broken and is running for safety (C3).
   *
   * A routed Squad is not in good order: it fights weakly, cannot be given an
   * order, and forms up again on its own once the ground behind it is quiet.
   */
  readonly routing: boolean;

  /**
   * Whether an enemy Squad is in contact with it right now (C3).
   *
   * Contact is one tile, which is well inside any Squad's own eyes, so this is
   * the Faction seeing the men it is already fighting and not the fog leaking
   * an enemy it could not know about (B4).
   */
  readonly engaged: boolean;

  /**
   * What it owes its Faction at the next Season boundary: its Payroll bill,
   * priced on the men still standing rather than on its recruited capacity.
   *
   * A quoted bill, the rules' own deduction and the Forecast all read this same
   * number, which is what makes them agree (ADR-0027).
   */
  readonly payroll: number;

  /** Seasons in a row it has gone unpaid. */
  readonly unpaid: number;

  /**
   * The force it brings into a fight: its surviving men times its type's
   * `impact` (#66, ADR-0028).
   *
   * This is the number `sim/combat.ts` moves men and nerve by, the number a
   * Siege's ram defence and wall work are read from, and the number a Controller
   * prices its own line with — so the interface, the AI and the rules quote one
   * fact and cannot drift apart. It is a fact about **this Faction's own** Squad:
   * Siege sight reports an enemy's visible headcount (ADR-0029), but not its
   * private condition or this derived bearing field.
   */
  readonly bearing: number;

  /** The settlement it is garrisoning, or `null` when it is in the field (C5). */
  readonly garrison: number | null;

  /** The settlement that raised it. */
  readonly home: number;

  /**
   * Whether it stands in its own Faction's Territory, and so draws supply (C6).
   *
   * One tile is all it takes to be cut off, which is what the country on this
   * Observation is for: a Controller can read where the boundary is and see
   * which of its Squads are the wrong side of it.
   */
  readonly inTerritory: boolean;

  /**
   * Whether it is in a camp: holding position in the ground a standing Castrum
   * makes into quarters (C6).
   *
   * Never true for Carthage: `canCamp` is Rome's alone, and a Roman camp that
   * changed hands with the village it stands in is not Carthage's to winter in.
   */
  readonly inCamp: boolean;
  readonly inQuarters?: boolean;
}

/** Everything a Faction may know of the economy: its own, and nothing of the other's. */
export interface EconomyVisible {
  /** The Season it stands in. */
  readonly season: Season;

  /** The game year, counted from one. */
  readonly year: number;

  /**
   * The tiles its Territory covers, one to a tile of the theatre: `1` where the
   * Faction draws supply and `0` everywhere else (C6).
   *
   * Indexed the way the theatre is (`tileIndex(x, y)`), so the boundary a
   * Controller reads is the same shape of ground the map is. It holds its own
   * country and nothing of the other Faction's: whose settlements give a distant
   * tile its supply is that Faction's business.
   */
  readonly territory: Uint8Array;

  /** Its denarii: one treasury per Faction. */
  readonly treasury: number;

  /** The settlements it holds, by id, with where they stand and what they have. */
  readonly settlements: readonly VisibleSettlement[];

  /** The Squads it keeps, with the Payroll terms they are charged on. */
  readonly squads: readonly VisibleSquad[];
}

/**
 * The rules of the Match on the theatre and the economy.
 *
 * Every number it writes is an integer and the map it opens on is a pure
 * function of the seed, so two Matches on one seed are the same Match
 * (ADR-0006). It draws nothing from the random source: the economy is a
 * function of the map, the calendar and the Commands, so the Match's own draws
 * are still A2's, and the cursor moves only if a later rule makes it.
 */
export const economyMatchRules: MatchRules<EconomyWorld, Command> = {
  createWorld: (seed) => {
    const map = generateMap(seed);

    return {
      map,
      calendar: startCalendar(),
      economy: createEconomy(map),
      autumns: 0,
      winters: 0,
    };
  },

  step: (world, _rng, tick, commands) => {
    stepEconomyWorld(world, tick, commands);
  },
};

/**
 * One tick of the economy's Match, and the Season boundaries it crossed.
 *
 * Exported because a Match that stands on this one — C5's Siege — has to run the
 * same tick in the same order and add its own work to it, rather than play a
 * second, subtly different economy beside this one. `supplied` is the one thing
 * another system can change about it: a blockaded settlement works nothing, and
 * the Siege is the one that knows which settlements those are (`economy.ts`'s
 * `Supplied`).
 *
 * The boundaries are returned, not merely announced, so that a caller can do its
 * own Season work on the same clock: the economy's work lands first, and a
 * blockade starves the town after it has eaten.
 */
export function stepEconomyWorld(
  world: EconomyWorld,
  tick: number,
  commands: readonly Command[],
  supplied: Supplied = ALWAYS_SUPPLIED,
  economyCommandsApplied = false,
): readonly SeasonChange[] {
  // The Commands first, in the order they arrived: the economy's own (build and
  // recruit), the movement's (move, attackMove, hold, formation) and combat's
  // (attack, withdraw), each ignoring the kinds the others own. Then the ground
  // the Squads cover, then the round of contact they fight, and then the works
  // and the calendar, which do not depend on where anybody is.
  if (!economyCommandsApplied) for (const command of commands) applyEconomyCommand(world.economy, command);
  applyMovementCommands(world.economy, world.map, commands, routeCacheFor(world.map));
  applyCombatCommands(world.economy, world.map, commands, routeCacheFor(world.map));
  march(world.economy, world.map);

  // The dead are the one product of a fight that is not state: they are laid on
  // the field for a drawing code and swept off it, and the world's hash covers
  // neither (`sim/residue.ts`).
  const fallen = fight(world.economy, world.map, tick, routeCacheFor(world.map));
  recordCasualties(world.economy, fallen, tick);
  fadeResidue(world.economy, tick);

  advanceConstruction(world.map, world.economy);

  const changes = advanceCalendar(world.calendar, tick);
  announceSeasons(changes, {
    onSeason: (change) => {
      produceSeason(world.map, world.economy, change.season, supplied);
      chargePayroll(world.economy);
      supplyMorale(world.economy);
      resupply(world.economy);
    },
    onAutumn: () => {
      harvest(world.map, world.economy, supplied);
      world.autumns += 1;
    },
    onWinter: () => {
      world.winters += 1;
    },
  }, attritionSeasons(world.economy));

  return changes;
}

/**
 * What one Faction may see of the economy: its own settlements and Squads, its
 * treasury, and the date.
 *
 * The date is not a secret the fog keeps, so both Factions see it; everything
 * else is filtered by ownership, because a stock is not visible from the far
 * side of the theatre even before fog (B4) arrives to hide it.
 */
export const observeEconomy: MatchSetup<EconomyWorld, EconomyVisible>['observe'] = (world, faction) => {
  const owner = factionCode(faction);
  const territory = territoryOf(world.economy);

  return {
    season: seasonOf(world.calendar),
    year: world.calendar.year,
    territory: territoryView(territory, owner),
    treasury: world.economy.treasuries[owner] ?? 0,
    settlements: world.economy.settlements
      .filter((settlement) => settlement.owner === owner)
      .map((settlement) => visibleSettlement(world.map, settlement, world.economy)),
    squads: world.economy.squads
      .filter((squad) => squad.owner === owner)
      .map((squad) => visibleSquad(world.economy, territory, squad)),
  };
};

/**
 * Every eye a Faction has in this world: its settlements' watches, and the
 * Squads that march between them (PLAN §4, B4).
 *
 * Vision is a rule and not a drawing decision, so the radii are `fog.ts`'s and
 * the composition — a settlement watches its centre and core corners with radius
 * eight, a Squad its own position with radius four — is here, where
 * the settlements and the Squads are both in hand. The page refreshes its fog
 * from exactly this list, which is what makes what a Player sees on the map and
 * what the Faction's Controller is allowed to know one answer rather than two.
 */
export function eyesOfEconomy(world: EconomyWorld, faction: Faction): readonly Eye[] {
  const owner = factionCode(faction);

  return [
    ...world.economy.settlements
      .filter((settlement) => settlement.owner === owner)
      .flatMap((settlement) => [eyeOf(settlement, SETTLEMENT_VISION), ...[-6, 6].flatMap((dx) => [-6, 6].map((dy) =>
        eyeOf({ x: settlement.x + dx, y: settlement.y + dy }, SETTLEMENT_VISION)))]),
    ...world.economy.squads
      .filter((squad) => squad.owner === owner)
      .map((squad) => eyeOf(squad, SQUAD_VISION)),
  ];
}

/** A settlement, as its holder reads it: where it is, and how its people are spent. */
function visibleSettlement(map: MapGrid, settlement: Settlement, economy: Economy): VisibleSettlement {
  const allocation = allocate(settlement, landCapacity(map, settlement));

  return {
    id: settlement.id,
    x: settlement.x,
    y: settlement.y,
    tier: settlement.tier,
    population: settlement.population,
    stocks: namedStock(settlement.stocks),
    land: namedStock(allocation.land),
    works: settlement.works.map((work) => ({
      ordinal: workOrdinal(settlement, work),
      origin: (work.origin ?? settlement.origin ?? settlement.owner) === 1 ? 'carthage' : 'rome',
      building: buildingOf(work.building)?.id ?? 'unknown',
      remaining: work.remaining,
      ...(work.remaining === 0 ? { hp: work.hp ?? WORK_MAX_HP, maxHp: WORK_MAX_HP } : {}),
      standing: work.remaining === 0,
    })),
    pending: (economy.pending ?? []).filter((order) => order.settlement === settlement.id).map((order) => ({
      id: order.id, kind: order.kind === 0 ? 'build' : 'recruit',
      cost: pendingOrderCost(order),
      building: order.kind === 0 ? buildingOf(order.content)?.id ?? 'unknown' : '',
      squadType: order.kind === 1 ? squadTypeOf(order.content)?.id ?? 'unknown' : '',
      men: order.men, count: order.count, reason: order.reason === 2 ? 'resources' : 'space',
    })),
  };
}

/** A Squad, as its owner reads it: where it stands, what it costs to keep, and how the fight is going. */
function visibleSquad(economy: Economy, territory: Territory, squad: Squad): VisibleSquad {
  const type = squadTypeOf(squad.type);

  return {
    id: squad.id,
    ...(squad.garrisonJourney === undefined ? {} : { passage: {
      settlement: squad.garrisonJourney.settlement,
      phase: (['approaching', 'waiting', 'entering', 'leaving'] as const)[squad.garrisonJourney.phase] ?? 'waiting',
      remaining: squad.garrisonJourney.remaining,
      ...(squad.garrisonJourney.reason === 1 ? { reason: 'access-busy' as const } :
        squad.garrisonJourney.reason === 2 ? { reason: 'exit-blocked' as const } : {}),
    } }),
    ...(squad.garrisonJourney !== undefined || squad.access === undefined ? {} : { passage: {
      settlement: squad.access.settlement,
      phase: squad.access.active === 1 ? 'entering' as const : 'waiting' as const,
      remaining: 0,
      ...(squad.access.reason === 1 ? { reason: 'access-busy' as const } :
        squad.access.reason === 2 ? { reason: 'exit-blocked' as const } : {}),
    } }),
    type: type?.id ?? 'unknown',
    x: squad.x,
    y: squad.y,
    men: squad.strength,
    capacity: squad.capacity,
    figures: type === undefined ? squad.strength : figuresOf(type, squad.strength),
    formation: formationOf(squad.formation),
    facing: facingOf(squad.facing),
    goal: goalOf(squad),
    refused: refusalOf(squad.refused),
    morale: squad.morale,
    fatigue: squad.fatigue,
    ammunition: squad.ammunition,
    routing: isRouting(squad),
    engaged: engagedWith(economy, squad) !== undefined,
    payroll: type === undefined ? 0 : payrollBill(type, squad.strength),
    unpaid: squad.unpaid,
    bearing: bearing(squad),
    garrison: squad.garrison === FIELD ? null : squad.garrison,
    home: squad.home,
    inTerritory: holdsTerritory(territory, squad.owner, squad),
    inCamp: inCamp(economy, squad),
    inQuarters: inQuarters(economy, squad),
  };
}

/**
 * The verdict of a Match with an economy and no Siege: none, ever.
 *
 * Nothing can be lost in this world — no settlement can change hands, because the
 * walls and the Commands that take one are `siege.ts`'s and this Match has none
 * of them — so the bound is the ending, and it is always reached. A Match that
 * can be won is `siegeMatchOutcome`.
 */
export const economyMatchOutcome: MatchSetup<EconomyWorld, EconomyVisible>['outcome'] = () => null;
