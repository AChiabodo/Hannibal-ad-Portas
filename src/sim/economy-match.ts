/**
 * The Match whose world is the theatre and the economy: B5's clock and B6's
 * settlements in one `MatchState` (PLAN §4).
 *
 * This is the ticket after B5's clock and B1's map, and it is the first Match
 * whose world holds both: the theatre a seed generated, the calendar, and the
 * economy standing on the theatre. A replay therefore begins on the same tiles,
 * crosses the same Season boundaries and pays the same Payroll, because all
 * three are integer state the hash covers (ADR-0006).
 *
 * The tick does three things, in this order:
 *
 * 1. **Applies the Commands.** Only `build` and `recruit` are the economy's;
 *    everything else belongs to the tickets that own it and is left alone.
 * 2. **Counts the works down.** Construction is a timer plus the labour the
 *    allocation already gives it (ADR-0005).
 * 3. **Advances the calendar and announces the boundary.** The economy
 *    subscribes to `onSeason` for its ordinary production and Payroll, and to
 *    `onAutumn` for the harvest on top of it — the clock is advanced once, and
 *    the same report is handed to the one subscriber that cares.
 *
 * A Match on this world cannot be won or lost yet. Nothing takes a settlement
 * (C5) and nothing fights (C3), so the rules never decide one and the bound
 * ends it; `economyMatchOutcome` returns `null` and says so.
 *
 * The Observation is where B7 and D2 will read the economy from: the settlements
 * a Faction holds and where they stand, what is in their stocks, what they are
 * building for, how their people are divided, its treasury and its Squads. An
 * enemy's settlement is not in it, which is the one filtering this ticket can
 * do without fog: ownership is the economy's own secret and it keeps it.
 */
import { buildingOf, namedStock, squadTypeOf, type ResourceAmounts } from '../content/index.ts';
import type { Command } from './command.ts';
import {
  advanceConstruction,
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
} from './economy.ts';
import { factionCode } from './faction.ts';
import { generateMap, type MapGrid } from './map.ts';
import type { MatchRules } from './match.ts';
import type { MatchSetup } from './driver.ts';
import {
  advanceCalendar,
  announceSeasons,
  seasonOf,
  startCalendar,
  type Season,
  type SeasonCalendar,
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
  /** The building's id, so a Controller can name it in a Build Command. */
  readonly building: string;

  /** Ticks left before it stands: 0 when it is standing and producing. */
  readonly remaining: number;

  /** Whether it is standing. */
  readonly standing: boolean;
}

/** What a Faction sees of one settlement it holds: what it is, what it has, where its people are. */
export interface VisibleSettlement {
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

/** What a Faction sees of one Squad it keeps: the terms Payroll is charged on. */
export interface VisibleSquad {
  /** Its id, as a Command names it. */
  readonly id: number;

  /** Its type, by the id a Recruit Command would name. */
  readonly type: string;

  /** What it has left to fight with. */
  readonly morale: number;

  /** What it owes its Faction each Season: the term Payroll is charged on. */
  readonly payroll: number;

  /** Seasons in a row it has gone unpaid. */
  readonly unpaid: number;

  /** The settlement that raised it. */
  readonly home: number;
}

/** Everything a Faction may know of the economy: its own, and nothing of the other's. */
export interface EconomyVisible {
  /** The Season it stands in. */
  readonly season: Season;

  /** The game year, counted from one. */
  readonly year: number;

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
    for (const command of commands) applyEconomyCommand(world.economy, command);

    advanceConstruction(world.map, world.economy);

    const changes = advanceCalendar(world.calendar, tick);
    announceSeasons(changes, {
      onSeason: (change) => {
        produceSeason(world.map, world.economy, change.season);
        chargePayroll(world.economy);
      },
      onAutumn: () => {
        harvest(world.map, world.economy);
        world.autumns += 1;
      },
      onWinter: () => {
        world.winters += 1;
      },
    });
  },
};

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

  return {
    season: seasonOf(world.calendar),
    year: world.calendar.year,
    treasury: world.economy.treasuries[owner] ?? 0,
    settlements: world.economy.settlements
      .filter((settlement) => settlement.owner === owner)
      .map((settlement) => visibleSettlement(world.map, settlement)),
    squads: world.economy.squads
      .filter((squad) => squad.owner === owner)
      .map((squad) => visibleSquad(squad)),
  };
};

/** A settlement, as its holder reads it: where it is, and how its people are spent. */
function visibleSettlement(map: MapGrid, settlement: Settlement): VisibleSettlement {
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
      building: buildingOf(work.building)?.id ?? 'unknown',
      remaining: work.remaining,
      standing: work.remaining === 0,
    })),
  };
}

/** A Squad, as its owner reads it: what it costs to keep, and whether it has been paid. */
function visibleSquad(squad: Squad): VisibleSquad {
  const type = squadTypeOf(squad.type);

  return {
    id: squad.id,
    type: type?.id ?? 'unknown',
    morale: squad.morale,
    payroll: type?.payroll ?? 0,
    unpaid: squad.unpaid,
    home: squad.home,
  };
}

/**
 * The verdict of a Match with an economy and no war: none, ever.
 *
 * Nothing can be lost in a world where no one can fight or take a settlement, so
 * C5 is where a Match learns to end sooner than its bound; until then the bound
 * is the ending, and it is always reached.
 */
export const economyMatchOutcome: MatchSetup<EconomyWorld, EconomyVisible>['outcome'] = () => null;
