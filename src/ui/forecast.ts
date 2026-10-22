/**
 * The economy's forecast: what the next Season boundary will do to the Treasury,
 * and only when the Faction's own knowledge makes that answer exact (#58, Q16).
 *
 * ## Why this is not a guess
 *
 * The boundary has one order, and the rules already state it
 * (`sim/economy-match.ts` → `sim/economy.ts`): every settlement **produces** and
 * **earns its tax** first, then **Payroll** is charged out of one Treasury, oldest
 * Squad first, and only then does Supply move Morale. So the next Treasury is a
 * function of numbers the Faction can read in its own Observation:
 *
 * - its Treasury now;
 * - each settlement's people, and the denarii its staffed, standing works earn —
 *   the allocation is automatic and deterministic, so it is recomputed here from
 *   the same content tables the rules read;
 * - each Squad's Payroll term and its Morale, in the order Payroll charges them;
 * - and whether a settlement is blockaded, because a cut-off settlement works
 *   nothing and sells nothing.
 *
 * ## When it says nothing
 *
 * A forecast is shown **only** when it is derivable. Today the one thing that
 * makes it underivable is an own settlement under blockade: whether the blockade
 * holds until the boundary is not something the Faction knows, so the tax it
 * would earn is not a fact and the estimate is refused with the reason rather
 * than guessed low. A current Treasury on its own proves nothing about future
 * nonpayment, and this module never draws that conclusion: it pays the Squads out
 * in the rules' own order.
 *
 * This is presentation. It issues nothing, changes no rule and is never hashed;
 * it re-reads the same content and the same Observation a panel does.
 */
import { TICK_HZ } from '../sim/clock.ts';
import { resourceBill } from './construction.ts';
import { amountOf, buildingCode, buildingOf } from '../content/index.ts';
import {
  BASE_HOUSING,
  BASE_STORAGE,
  GRAIN_PER_HEAD,
  HARVEST_YIELD,
  LAND_YIELD,
  MORALE_LOSS_PER_UNPAID_SEASON,
  POPULATION_GROWTH,
  STARVATION_LOSS,
  TAX_PER_DENARIUS,
  TREASURY_CAP,
} from '../sim/economy.ts';
import { RESOURCE, RESOURCE_KINDS } from '../sim/map.ts';
import type { EconomyVisible, VisibleSettlement } from '../sim/economy-match.ts';
import type { SiegeVisible } from '../sim/siege.ts';
import type { Season } from '../sim/season.ts';
import { nextBoundary } from './conditions.ts';
import { message, translate } from './strings.ts';

/** What the next boundary will do, when it can be worked out from what is known. */
export interface TreasuryForecast {
  /** The Treasury the boundary would leave, after tax and Payroll. */
  readonly resulting: number;
  /** The denarii the Faction's settlements would earn first. */
  readonly income: number;
  /** The denarii Payroll would charge. */
  readonly payroll: number;
  /** The Squads that would still be owed when the Treasury ran out. */
  readonly unpaid: number;
  /** The Squads whose Morale would reach none and desert (the rules decide). */
  readonly deserters: number;
  /** The Season that begins at that boundary. */
  readonly season: Season;
  /** How many ticks away it is. */
  readonly ticks: number;
}

/** Either the forecast, or the one reason it is not derivable. */
export type Forecast =
  | { readonly available: true; readonly value: TreasuryForecast }
  | { readonly available: false; readonly reason: 'blockaded' };

/** The one line the interface shows, ready to draw: an estimate, labelled as one. */
export interface ForecastLine {
  readonly label: string;
  readonly value: string;
  /** Whether the figure is an estimate; a refusal is not, and says why instead. */
  readonly estimate: boolean;
}

/**
 * Works out the next Season boundary's effect on the Treasury.
 *
 * @throws RangeError when the tick is not a whole, non-negative tick.
 */
export function forecastTreasury(visible: EconomyVisible | SiegeVisible, tick: number): Forecast {
  if (!Number.isSafeInteger(tick) || tick < 0) {
    throw new RangeError(`a forecast reads a whole, non-negative tick, got ${String(tick)}`);
  }

  // A blockaded settlement earns nothing while the blockade holds, and whether it
  // holds is not known. The estimate is refused rather than guessed.
  if (visible.settlements.some((settlement) => blockaded(visible, settlement))) {
    return { available: false, reason: 'blockaded' };
  }

  const boundary = nextBoundary(visible.season, tick);
  const income = visible.settlements.reduce(
    (total, settlement) => total + settlementIncome(settlement, boundary.season),
    0,
  );
  let treasury = Math.min(TREASURY_CAP, visible.treasury + income);

  let payroll = 0;
  let unpaid = 0;
  let deserters = 0;

  // The rules pay in the list's own order and stop when the coffer is empty; a
  // Squad is charged whole, so the ones after it go unpaid even if a cheaper term
  // would have fitted.
  for (const squad of visible.squads) {
    const owed = squad.payroll;
    payroll += owed;

    if (treasury >= owed) {
      treasury -= owed;

      continue;
    }

    unpaid += 1;
    if (squad.morale - MORALE_LOSS_PER_UNPAID_SEASON <= 0) deserters += 1;
  }

  return {
    available: true,
    value: { resulting: treasury, income, payroll, unpaid, deserters, season: boundary.season, ticks: boundary.ticks },
  };
}

/**
 * The forecast as one labelled line, in Italian, or `null` when there is nothing
 * a Player would gain by reading it: an empty army with no income says nothing
 * that the Treasury readout does not already say.
 */
export function forecastLine(visible: EconomyVisible | SiegeVisible, tick: number): ForecastLine | null {
  const forecast = forecastTreasury(visible, tick);
  if (!forecast.available) {
    return {
      label: translate('forecast.title'),
      value: message('forecast.unavailable', { reason: translate('forecast.blockaded') }),
      estimate: false,
    };
  }

  const value = forecast.value;
  if (visible.squads.length === 0 && value.income === 0) return null;

  return {
    label: translate('forecast.title'),
    value: message('economy.boundary', { seconds: Math.ceil(value.ticks / TICK_HZ), income: value.income,
      payroll: value.payroll, resulting: value.resulting, unpaid: value.unpaid, assumption: translate('economy.assumption') }),
    estimate: true,
  };
}

/** Whether a settlement is cut off by an enemy blockade the Faction can see. */
function blockaded(visible: EconomyVisible | SiegeVisible, settlement: VisibleSettlement): boolean {
  if (!('fronts' in visible)) return false;

  const front = visible.fronts.find((candidate) => candidate.settlement === settlement.id);

  return front !== undefined && front.siege === 'blockade' && front.besieger !== null;
}

/**
 * What one settlement adds to the Treasury at the boundary.
 *
 * The boundary's own order matters, and this is why the estimate is exact rather
 * than plausible: the settlement **produces** first (its staffed, standing works
 * and its worked land, the land halved in winter), the people **eat and grow**
 * out of the granary that production filled, and only then is the tax collected on
 * the people who are still there (`sim/economy.ts`: `produceSeason`,
 * `feedAndGrow`, `earn`). So the tax is charged on the population *after*
 * feeding — a village of seven that grows to eight pays two denarii, not one —
 * and the granary's cap is the one it has built to.
 *
 * The allocation is recomputed from the same content tables the rules read: works
 * take their labour in the order they were built, and the land is the allocation
 * the Observation already carries. Nothing here is a second rule; it is the same
 * arithmetic over the same numbers, which is what the ticket means by
 * "derivable correctly from known data".
 */
export interface SettlementProjection {
  readonly income: number;
  readonly stocks: VisibleSettlement['stocks'];
  readonly population: number;
  readonly housing: number;
  readonly storage: number;
  readonly staffed: number;
  readonly needed: number;
  /** Whether each current work receives all its workers, in the visible order. */
  readonly workStaffing: readonly boolean[];
  /** Autumn reallocation after growth cannot be derived from worked land alone. */
  readonly harvestUncertain: boolean;
}

function settlementIncome(settlement: VisibleSettlement, season: Season): number {
  return projectSettlement(settlement, season).income;
}

/** Boundary projection with today's works and staff; no future orders or hidden nodes. */
export function projectSettlement(settlement: VisibleSettlement, season: Season): SettlementProjection {
  let available = settlement.population;
  let denarii = 0;
  const produced = { grain: 0, timber: 0, stone: 0, iron: 0 };
  let staffed = 0;
  let needed = 0;
  let housing = BASE_HOUSING;
  let storage = BASE_STORAGE;
  const workStaffing: boolean[] = [];

  for (const work of settlement.works) {
    const code = buildingCode(work.building);
    const building = code === undefined ? undefined : buildingOf(code);
    if (building === undefined) { workStaffing.push(false); continue; }
    workStaffing.push(available >= building.labour);

    needed += building.labour;
    // A work's housing and storage count once it stands; its labour is claimed
    // in build order whether it stands or is still going up.
    if (work.standing) {
      housing += building.housing;
      storage += building.storage;
    }

    // A work with no hands does not take any, and does not block the next one.
    if (available < building.labour) continue;

    available -= building.labour;
    staffed += building.labour;
    if (!work.standing) continue;

    denarii += building.denarii;
    for (const kind of RESOURCE_KINDS) {
      const key = (['grain', 'timber', 'stone', 'iron'] as const)[kind]!;
      produced[key] += amountOf(building.yields, kind);
    }
  }

  const keys = ['grain', 'timber', 'stone', 'iron'] as const;
  const stocks = { ...settlement.stocks };
  for (const kind of RESOURCE_KINDS) {
    const key = keys[kind]!;
    const land = amountOf(settlement.land, kind) * LAND_YIELD;
    stocks[key] = Math.min(storage, stocks[key] + produced[key] + (season === 'winter' ? Math.floor(land / 2) : land));
  }
  const grain = stocks.grain;

  const eaten = Math.max(1, Math.floor(settlement.population / GRAIN_PER_HEAD));
  const population = grain < eaten
    ? Math.max(1, settlement.population - STARVATION_LOSS)
    : settlement.population < housing && grain - eaten >= eaten
      ? settlement.population + POPULATION_GROWTH
      : settlement.population;

  stocks.grain = Math.max(0, grain - eaten);
  const harvestUncertain = season === 'autumn' && population !== settlement.population;
  if (season === 'autumn' && !harvestUncertain) {
    stocks.grain = Math.min(storage, stocks.grain + amountOf(settlement.land, RESOURCE.grain) * HARVEST_YIELD);
  }
  return { income: Math.floor(population / TAX_PER_DENARIUS) + denarii,
    stocks, population, housing, storage, staffed, needed, workStaffing, harvestUncertain };
}

/** The selected settlement's stock estimate; uncertain autumn land is explicitly refused. */
export function settlementForecastLine(visible: EconomyVisible | SiegeVisible, settlement: VisibleSettlement, tick: number): string {
  if (blockaded(visible, settlement)) return translate('forecast.blockaded');
  const boundary = nextBoundary(visible.season, tick);
  const projected = projectSettlement(settlement, boundary.season);
  if (projected.harvestUncertain) return translate('forecast.harvestUnknown');
  return `${resourceBill(projected.stocks)}. ${translate('economy.assumption')}`;
}
