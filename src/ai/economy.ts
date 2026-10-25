import type { Observation } from '../sim/observation.ts';
import type { Season } from './calendar.ts';
import { objectiveOf, type Behaviour, type Candidate } from './registry.ts';
import { DIFFICULTY, type Difficulty } from './difficulty.ts';

type Faction = Observation<unknown>['faction'];
type Resources = Readonly<Record<'grain' | 'timber' | 'stone' | 'iron', number>>;

/** The two paths of a Siege, as an observed front reports them; the AI names its own. */
type SiegePath = 'assault' | 'blockade';

/** A working treasury on top of the Seasons of Payroll the plan holds back. */
const WORKING_TREASURY = 6;

/** The hands a work must leave on the land for the settlement to keep feeding itself. */
const LABOUR_FLOOR = 4;

/** The share of land grain still standing when winter arrives, as a divisor. */
const LAND_GRAIN_DIVISOR = 2;

/** The Seasons of population food below which raising a grain producer is urgent. */
const GRAIN_SHORTAGE_SEASONS = 3;

/** The stocks below which raising a producer of another resource is urgent. */
const RESOURCE_SHORTAGE: Readonly<Pick<Resources, 'timber' | 'stone' | 'iron'>> =
  { timber: 12, stone: 8, iron: 4 };

/** The Tier a villa raises a settlement to: the one that fields the next roster. */
const TIER_TWO = 2;

/** The free beds at which housing starts limiting the labour pool. */
const HOUSING_HEADROOM = 1;

interface Building {
  readonly id: string;
  readonly faction?: Faction;
  readonly tier: number;
  readonly cost: Resources;
  readonly labour: number;
  readonly yields: Resources;
  readonly denarii: number;
  readonly housing: number;
  readonly raisesTier: number;
  readonly storage: number;
  readonly buildTicks: number;
  readonly maxPerSettlement: number;
}

interface Settlement {
  readonly id: number;
  readonly tier: number;
  readonly population: number;
  readonly stocks: Resources;
  readonly land: Resources;
  readonly pending?: readonly { readonly kind: 'build' | 'recruit'; readonly building?: string | null; readonly squadType?: string | null }[];
  readonly works: readonly { readonly building: string; readonly standing: boolean; readonly remaining: number }[];
}

/** Only owned economic facts, plus the fronts the Faction can already observe. */
export interface EconomyObservation {
  readonly year: number;
  readonly season: Season;
  readonly treasury: number;
  readonly settlements: readonly Settlement[];
  readonly squads: readonly { readonly payroll: number; readonly unpaid: number; readonly type: string }[];
  readonly enemies?: readonly { readonly type: string }[];
  readonly fronts?: readonly { readonly settlement: number; readonly siege: SiegePath | null; readonly besieger: Faction | null }[];
}

type EconomyCommand = {
  readonly kind: 'build'; readonly faction: Faction; readonly settlement: number; readonly building: string;
} | {
  readonly kind: 'recruit'; readonly faction: Faction; readonly settlement: number;
  readonly squadType: string; readonly men: number; readonly count: number;
};

/** Content is supplied at composition; the AI has no path to simulation modules. */
export function createEconomyBehaviour(content: {
  readonly recruitmentPreference?: (observation: Observation<EconomyObservation>, type: string) => {
    readonly utility: number; readonly reason: string;
  };
  readonly buildings: readonly Building[];
  readonly grainPerHead: number;
  readonly baseHousing: number;
  readonly baseStorage: number;
  readonly taxPerDenarius: number;
  /** Projection supplied by the calendar owner; policies do not derive Season boundaries. */
  readonly ticksUntilPayroll: (tick: number) => number;
  readonly squadTypes: readonly {
    readonly id: string; readonly faction: Faction; readonly tier: number;
    readonly strength: number; readonly sizes: readonly number[];
    readonly payroll: number; readonly cost: Resources;
  }[];
  /** The content table's own price for a real size, so the AI quotes what the rules charge. */
  readonly recruitCost: (type: { readonly cost: Resources }, men: number) => Resources;
  /** The content table's own survivor-based bill, so affordability uses the paid number. */
  readonly payrollBill: (type: { readonly payroll: number }, men: number) => number;
}, difficulty: Difficulty = DIFFICULTY.centurio): Behaviour<EconomyObservation, EconomyCommand> {
  const buildings = new Map(content.buildings.map((building) => [building.id, building]));
  const horizon = difficulty.horizonSeasons;
  const requiredReserve = (payroll: number) => WORKING_TREASURY + payroll * horizon;
  // One Season of grain is eaten as it is grown, so the floor is the horizon
  // plus one: Centurio's three Seasons are `food * 3`, exactly as D2 shipped.
  const grainFloorSeasons = horizon + 1;
  const grainFloor = (food: number) => food * grainFloorSeasons;
  const blockaded = (observation: Observation<EconomyObservation>, settlement: number) =>
    observation.visible.fronts?.some((front) => front.settlement === settlement &&
      front.siege === 'blockade' && front.besieger !== null && front.besieger !== observation.faction) ?? false;
  function budget(observation: Observation<EconomyObservation>) {
    const visible = observation.visible;
    let income = 0;
    for (const settlement of visible.settlements) {
      if (blockaded(observation, settlement.id)) continue;
      let available = settlement.population;
      income += Math.floor(settlement.population / content.taxPerDenarius);
      for (const work of settlement.works) {
        const building = buildings.get(work.building);
        if (building === undefined || building.labour > available) continue;
        available -= building.labour;
        // Payroll is charged at the next Season boundary. A staffed market
        // finishing before then can fund that bill; it need not be standing
        // on the recruitment tick. No future population growth is assumed.
        const untilPayroll = content.ticksUntilPayroll(observation.tick);
        if (work.standing || work.remaining < untilPayroll) income += building.denarii;
      }
    }
    const payroll = visible.squads.reduce((sum, squad) => sum + squad.payroll, 0);
    return { income, payroll, reserve: requiredReserve(payroll) };
  }
  return {
    id: 'economy',
    strategic: ({ observation }) => [{
      id: 'develop', utility: 10, reason: 'Grow an army-producing settlement on recurring income.', commands: [],
      plan: { posture: observation.visible.squads.some((squad) => squad.unpaid > 0) ? 'recovery'
        : observation.faction === 'rome' ? 'growth' : 'commerce',
        budget: budget(observation), objective: objectiveOf(observation.visible.settlements[0]?.id) },
    }],
    operational: ({ observation, plan }) => {
      const candidates: Candidate<EconomyCommand>[] = [];
      const funds = budget(observation);
      for (const settlement of observation.visible.settlements) {
        const food = Math.max(1, Math.floor(settlement.population / content.grainPerHead));
        let grainCapacityNeeded = grainFloor(food);
        if (!observation.visible.squads.some((squad) => squad.unpaid > 0)) {
          for (const type of content.squadTypes) {
            if (type.faction !== observation.faction || type.tier > settlement.tier ||
              settlement.pending?.some((order) => order.kind === 'recruit' && order.squadType === type.id)) continue;
            const count = observation.visible.squads.filter((squad) => squad.type === type.id).length;
            const preference = content.recruitmentPreference?.(observation, type.id);
            // A type offers several real sizes; the AI prices each one with the
            // content table's own arithmetic and keeps only the ones its
            // Observation says it can afford now and keep each Season.
            for (const men of type.sizes) {
              const cost = content.recruitCost(type, men);
              const payroll = funds.payroll + content.payrollBill(type, men);
              if (payroll > funds.income || observation.visible.treasury < requiredReserve(payroll) ||
                Object.entries(cost).some(([key, amount]) => key !== 'grain' &&
                  settlement.stocks[key as keyof Resources] < amount)) continue;
              grainCapacityNeeded = Math.max(grainCapacityNeeded, cost.grain + grainFloor(food));
              if (settlement.stocks.grain - cost.grain < grainFloor(food)) continue;
              candidates.push({ id: `recruit-${settlement.id}-${type.id}-${men}`,
                // Establish eyes in the field before spending the opening stocks on a Tier.
                utility: (observation.visible.squads.length === 0 ? 100 : 45) + type.tier * 5 - count * 4 +
                  Math.floor((10 * men) / type.strength) +
                  (preference?.utility ?? 0),
                reason: `Payroll ${payroll} is covered by income ${funds.income}; retain ${requiredReserve(payroll)} denarii.${preference === undefined ? '' : ` ${preference.reason}`}`,
                commands: [{ kind: 'recruit', faction: observation.faction, settlement: settlement.id,
                  squadType: type.id, men, count: 1 }],
              });
            }
          }
        }
        if (settlement.works.some((work) => !work.standing)) continue;
        const works = settlement.works.flatMap((work) => {
          const building = buildings.get(work.building);
          return building === undefined ? [] : [building];
        });
        const available = settlement.population - works.reduce((sum, work) => sum + work.labour, 0);
        const grain = works.reduce((sum, work) => sum + work.yields.grain, 0);
        const housing = content.baseHousing + works.reduce((sum, work) => sum + work.housing, 0);
        const storage = content.baseStorage + works.reduce((sum, work) => sum + work.storage, 0);
        for (const building of content.buildings) {
          if (settlement.pending?.some((order) => order.kind === 'build' && order.building === building.id)) continue;
          if (building.tier > settlement.tier ||
            (building.faction !== undefined && building.faction !== observation.faction) ||
            settlement.works.filter((work) => work.building === building.id).length >= building.maxPerSettlement ||
            Object.entries(building.cost).some(([key, amount]) => settlement.stocks[key as keyof Resources] < amount)) continue;
          // A work claims labour permanently. Keep hands on the land unless
          // staffed grain works can feed the population without it.
          const spare = available - building.labour;
          if (building.labour > 0 && (spare < 0 || (spare < LABOUR_FLOOR && grain + building.yields.grain < food))) continue;
          let utility = 0;
          let reason = '';
          if (building.id === 'granary' && storage < grainCapacityNeeded) {
            utility = 105;
            reason = `Storage ${storage} cannot hold the ${grainCapacityNeeded} grain needed for reserves and sustainable recruitment.`;
          } else if (building.raisesTier > settlement.tier) {
            utility = building.raisesTier > TIER_TWO || plan.posture === 'growth' ? 80 : 60;
            reason = `Pursue Tier ${building.raisesTier} to field the next roster.`;
          } else if (building.id === 'market') {
            const markets = works.filter((work) => work.denarii > 0).length;
            // A second market must not consume the hands reserved for the villa.
            utility = markets > 0 && settlement.tier < TIER_TWO ? 0
              : markets === 0 ? 90 : 50;
            reason = 'Recurring denarii fund Payroll.';
          } else if (building.id === 'house' && settlement.population >= housing - HOUSING_HEADROOM) {
            utility = 110;
            reason = 'Housing is limiting the labour pool.';
          } else {
            const needs: Resources = { grain: food * GRAIN_SHORTAGE_SEASONS,
              timber: RESOURCE_SHORTAGE.timber, stone: RESOURCE_SHORTAGE.stone, iron: RESOURCE_SHORTAGE.iron };
            for (const resource of ['grain', 'timber', 'stone', 'iron'] as const) {
              if (building.yields[resource] <= 0) continue;
              if (settlement.stocks[resource] < needs[resource]) {
                utility = 120 + building.yields[resource] +
                  Math.floor(20 * (needs[resource] - settlement.stocks[resource]) / needs[resource]);
                reason = `${resource} shortage: put ${building.labour} people into ${building.id}.`;
              } else if (resource === 'grain' && grain + Math.floor(settlement.land.grain / LAND_GRAIN_DIVISOR) < food) {
                utility = 70 + building.yields.grain;
                reason = 'Staff grain production before winter and recruitment drain the stock.';
              }
            }
          }
          if (utility === 0) continue;
          const commands: EconomyCommand[] = [{ kind: 'build', faction: observation.faction,
            settlement: settlement.id, building: building.id }];
          // If the first army cannot be paid from existing income, a work that
          // finishes before Payroll may fund it in the same plan. Both purchases
          // are priced together; no resource or completion is assumed for free.
          if (observation.visible.squads.length === 0 && building.denarii > 0 &&
            !blockaded(observation, settlement.id) &&
            building.buildTicks < content.ticksUntilPayroll(observation.tick) &&
            !candidates.some((candidate) => candidate.commands.some((command) => command.kind === 'recruit'))) {
            firstDetachment: for (const type of content.squadTypes) {
              if (type.faction !== observation.faction || type.tier > settlement.tier ||
              settlement.pending?.some((order) => order.kind === 'recruit' && order.squadType === type.id)) continue;
              for (const men of type.sizes) {
                const cost = content.recruitCost(type, men);
                const payroll = funds.payroll + content.payrollBill(type, men);
                if (payroll > funds.income + building.denarii || observation.visible.treasury < requiredReserve(payroll) ||
                  settlement.stocks.grain - building.cost.grain - cost.grain < grainFloor(food) ||
                  Object.entries(cost).some(([key, amount]) =>
                    settlement.stocks[key as keyof Resources] < amount + building.cost[key as keyof Resources])) continue;
                commands.push({ kind: 'recruit', faction: observation.faction, settlement: settlement.id,
                  squadType: type.id, men, count: 1 });
                utility += 100;
                reason += ` Complete before Payroll and fund the first ${men}-man detachment; retain ${requiredReserve(payroll)} denarii.`;
                break firstDetachment;
              }
            }
          }
          candidates.push({ id: `build-${settlement.id}-${building.id}`, utility,
            reason: `${plan.posture}: ${reason}`,
            commands,
          });
        }
      }
      return candidates;
    },
  };
}
