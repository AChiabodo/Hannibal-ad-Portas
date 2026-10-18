import type { Observation } from '../sim/observation.ts';
import type { Behaviour, Candidate } from './registry.ts';
import { DIFFICULTY, type Difficulty } from './difficulty.ts';

type Faction = Observation<unknown>['faction'];
type Resources = Readonly<Record<'grain' | 'timber' | 'stone' | 'iron', number>>;

/** A working treasury on top of the Seasons of Payroll the plan holds back. */
const WORKING_TREASURY = 6;

interface Building {
  readonly id: string;
  readonly faction?: Faction;
  readonly tier: number;
  readonly cost: Resources;
  readonly labour: number;
  readonly yields: Resources;
  readonly denarii: number;
  readonly housing: number;
  readonly maxPerSettlement: number;
}

interface Settlement {
  readonly id: number;
  readonly tier: number;
  readonly population: number;
  readonly stocks: Resources;
  readonly land: Resources;
  readonly works: readonly { readonly building: string; readonly standing: boolean }[];
}

/** Only owned economic facts, plus the fronts the Faction can already observe. */
export interface EconomyObservation {
  readonly year: number;
  readonly season: string;
  readonly treasury: number;
  readonly settlements: readonly Settlement[];
  readonly squads: readonly { readonly payroll: number; readonly unpaid: number; readonly type: string }[];
  readonly enemies?: readonly { readonly type: string }[];
  readonly fronts?: readonly { readonly settlement: number; readonly siege: string | null; readonly besieger: Faction | null }[];
}

type EconomyCommand = {
  readonly kind: 'build'; readonly faction: Faction; readonly settlement: number; readonly building: string;
} | {
  readonly kind: 'recruit'; readonly faction: Faction; readonly settlement: number;
  readonly squadType: string; readonly count: number;
};

/** Content is supplied at composition; the AI has no path to simulation modules. */
export function createEconomyBehaviour(content: {
  readonly recruitmentPreference?: (observation: Observation<EconomyObservation>, type: string) => {
    readonly utility: number; readonly reason: string;
  };
  readonly buildings: readonly Building[];
  readonly grainPerHead: number;
  readonly baseHousing: number;
  readonly taxPerDenarius: number;
  readonly squadTypes: readonly {
    readonly id: string; readonly faction: Faction; readonly tier: number;
    readonly payroll: number; readonly cost: Resources;
  }[];
}, difficulty: Difficulty = DIFFICULTY.centurio): Behaviour<EconomyObservation, EconomyCommand> {
  const buildings = new Map(content.buildings.map((building) => [building.id, building]));
  const horizon = difficulty.horizonSeasons;
  const requiredReserve = (payroll: number) => WORKING_TREASURY + payroll * horizon;
  // One Season of grain is eaten as it is grown, so the floor is the horizon
  // plus one: Centurio's three Seasons are `food * 3`, exactly as D2 shipped.
  const grainFloor = (food: number) => food * (horizon + 1);
  function budget(observation: Observation<EconomyObservation>) {
    const visible = observation.visible;
    let income = 0;
    for (const settlement of visible.settlements) {
      if (visible.fronts?.some((front) => front.settlement === settlement.id &&
        front.siege === 'blockade' && front.besieger !== null && front.besieger !== observation.faction)) continue;
      let available = settlement.population;
      income += Math.floor(settlement.population / content.taxPerDenarius);
      for (const work of settlement.works) {
        const building = buildings.get(work.building);
        if (building === undefined || building.labour > available) continue;
        available -= building.labour;
        if (work.standing) income += building.denarii;
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
        budget: budget(observation), objective: String(observation.visible.settlements[0]?.id ?? '') },
    }],
    operational: ({ observation, plan }) => {
      const candidates: Candidate<EconomyCommand>[] = [];
      const funds = budget(observation);
      for (const settlement of observation.visible.settlements) {
        if (!observation.visible.squads.some((squad) => squad.unpaid > 0)) {
          for (const type of content.squadTypes) {
            const payroll = funds.payroll + type.payroll;
            const food = Math.max(1, Math.floor(settlement.population / content.grainPerHead));
            if (type.faction !== observation.faction || type.tier > settlement.tier ||
              payroll > funds.income || observation.visible.treasury < requiredReserve(payroll) ||
              settlement.stocks.grain - type.cost.grain < grainFloor(food) ||
              Object.entries(type.cost).some(([key, amount]) => settlement.stocks[key as keyof Resources] < amount)) continue;
            const count = observation.visible.squads.filter((squad) => squad.type === type.id).length;
            const preference = content.recruitmentPreference?.(observation, type.id);
            candidates.push({ id: `recruit-${settlement.id}-${type.id}`,
              utility: 45 + type.tier * 5 - count * 4 + (preference?.utility ?? 0),
              reason: `Payroll ${payroll} is covered by income ${funds.income}; retain ${requiredReserve(payroll)} denarii.${preference === undefined ? '' : ` ${preference.reason}`}`,
              commands: [{ kind: 'recruit', faction: observation.faction, settlement: settlement.id, squadType: type.id, count: 1 }],
            });
          }
        }
        if (settlement.works.some((work) => !work.standing)) continue;
        const works = settlement.works.flatMap((work) => {
          const building = buildings.get(work.building);
          return building === undefined ? [] : [building];
        });
        const available = settlement.population - works.reduce((sum, work) => sum + work.labour, 0);
        const food = Math.max(1, Math.floor(settlement.population / content.grainPerHead));
        const grain = works.reduce((sum, work) => sum + work.yields.grain, 0);
        const housing = content.baseHousing + works.reduce((sum, work) => sum + work.housing, 0);
        for (const building of content.buildings) {
          if (building.tier > settlement.tier ||
            (building.faction !== undefined && building.faction !== observation.faction) ||
            settlement.works.filter((work) => work.building === building.id).length >= building.maxPerSettlement ||
            Object.entries(building.cost).some(([key, amount]) => settlement.stocks[key as keyof Resources] < amount)) continue;
          // A work claims labour permanently. Keep hands on the land unless
          // staffed grain works can feed the population without it.
          const spare = available - building.labour;
          if (building.labour > 0 && (spare < 0 || (spare < 4 && grain + building.yields.grain < food))) continue;
          let utility = 0;
          let reason = '';
          if (building.id === 'villa' && settlement.tier < 2) {
            utility = plan.posture === 'growth' ? 80 : 60;
            reason = 'Pursue Tier 2 to field the next roster.';
          } else if (building.id === 'market') {
            const markets = works.filter((work) => work.denarii > 0).length;
            // A second market must not consume the hands reserved for the villa.
            utility = markets > 0 && settlement.tier < 2 ? 0
              : markets === 0 && plan.posture === 'commerce' ? 90 : 50;
            reason = 'Recurring denarii fund Payroll.';
          } else if (building.id === 'house' && settlement.population >= housing - 1) {
            utility = 110;
            reason = 'Housing is limiting the labour pool.';
          } else {
            const needs: Resources = { grain: food * 3, timber: 12, stone: 8, iron: 4 };
            for (const resource of ['grain', 'timber', 'stone', 'iron'] as const) {
              if (building.yields[resource] <= 0) continue;
              if (settlement.stocks[resource] < needs[resource]) {
                utility = 120 + building.yields[resource] +
                  Math.floor(20 * (needs[resource] - settlement.stocks[resource]) / needs[resource]);
                reason = `${resource} shortage: put ${building.labour} people into ${building.id}.`;
              } else if (resource === 'grain' && grain + Math.floor(settlement.land.grain / 2) < food) {
                utility = 70 + building.yields.grain;
                reason = 'Staff grain production before winter and recruitment drain the stock.';
              }
            }
          }
          if (utility === 0) continue;
          candidates.push({ id: `build-${settlement.id}-${building.id}`, utility,
            reason: `${plan.posture}: ${reason}`,
            commands: [{ kind: 'build', faction: observation.faction, settlement: settlement.id, building: building.id }],
          });
        }
      }
      return candidates;
    },
  };
}
