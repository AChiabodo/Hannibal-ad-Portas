import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { economyRegistry } from '../../src/cli/ai-match.ts';
import type { Command } from '../../src/sim/command.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import { observeSiege, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { isLegalSize, squadTypeCode, squadTypeOf, type SquadType } from '../../src/content/index.ts';

function economyAi() {
  return createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: economyRegistry });
}

describe('the economy Controller', () => {
  it('opens with a payable detachment or the market needed to fund one before a Tier objective', () => {
    const world = siegeMatchRules.createWorld(7);
    for (const [faction, command] of [
      ['rome', { kind: 'build', faction: 'rome', settlement: 0, building: 'market' }],
      ['carthage', { kind: 'recruit', faction: 'carthage', settlement: 1, squadType: 'gaul', men: 24, count: 1 }],
    ] as const) {
      const ai = economyAi();
      expect(ai.decide({ faction, tick: 0, visible: observeSiege(world, faction) })).toEqual([command]);
      expect(ai.readLog()[0]?.selected.behaviour).toBe('economy');
    }
  });

  it('buys only a real size, for both Factions, out of the Observation it is given', () => {
    const world = siegeMatchRules.createWorld(7);
    for (const faction of ['rome', 'carthage'] as const) {
      const base = observeSiege(world, faction);
      const developed: SiegeVisible = { ...base, treasury: 30, squads: [], settlements: [{
        ...base.settlements[0]!, tier: 2, population: 16,
        stocks: { grain: 30, timber: 30, stone: 30, iron: 30 },
        works: ['villa', 'farm', 'market', 'house'].map((building) => ({ building, standing: true, remaining: 0 })),
      }] };

      const recruits = economyAi().decide({ faction, tick: 0, visible: developed })
        .filter((command) => command.kind === 'recruit');
      expect(recruits.length, faction).toBeGreaterThan(0);
      for (const command of recruits) {
        if (command.kind !== 'recruit') continue;
        const code = squadTypeCode(command.squadType);
        const type: SquadType | undefined = code === undefined ? undefined : squadTypeOf(code);
        expect(type, command.squadType).toBeDefined();
        if (type === undefined) continue;
        expect(isLegalSize(type, command.men), `${faction} ${command.squadType} ${String(command.men)}`).toBe(true);
        expect(command.count).toBeGreaterThan(0);
      }
    }
  });

  it('funds the first detachment from a staffed market finishing before Payroll, never one finishing afterwards', () => {
    const visible = observeSiege(siegeMatchRules.createWorld(7), 'rome');
    for (const [tick, recruits] of [[300, true], [2000, false], [2100, false]] as const) {
      const commands = economyAi().decide({ faction: 'rome', tick,
        visible: { ...visible, settlements: [{ ...visible.settlements[0]!,
          works: [{ building: 'market', standing: false, remaining: 200 }],
        }] } });
      expect(commands.some((command) => command.kind === 'recruit')).toBe(recruits);
    }
  });

  it('puts available labour into the resource actually short, even with the same posture', () => {
    const visible = observeSiege(siegeMatchRules.createWorld(7), 'rome');
    const settlement = { ...visible.settlements[0]!, population: 16, tier: 2,
      works: [{ building: 'villa', remaining: 0, standing: true }] };
    for (const [stocks, building] of [
      [{ grain: 1, timber: 20, stone: 20, iron: 10 }, 'farm'],
      [{ grain: 30, timber: 4, stone: 20, iron: 10 }, 'lumber-camp'],
    ] as const) {
      const commands = economyAi().decide({ faction: 'rome', tick: 0,
        visible: { ...visible, settlements: [{ ...settlement, stocks }] } });
      expect(commands).toEqual([{ kind: 'build', faction: 'rome', settlement: 0, building }]);
    }
  });

  it('waits for construction and does not queue works that its population cannot staff', () => {
    const visible = observeSiege(siegeMatchRules.createWorld(7), 'rome');
    for (const remaining of [200, 0]) {
      const commands = economyAi().decide({ faction: 'rome', tick: 0, visible: { ...visible,
        settlements: [{ ...visible.settlements[0]!, population: 6,
          works: [{ building: 'villa', remaining, standing: remaining === 0 }] }],
      } });
      expect(commands.filter((command) => command.kind === 'build' && command.building !== 'house')).toEqual([]);
    }
  });

  it('recruits from recurring Payroll capacity and protects two Seasons of reserve', () => {
    const visible = observeSiege(siegeMatchRules.createWorld(7), 'rome');
    const developed: SiegeVisible = { ...visible, treasury: 30, settlements: [{
      ...visible.settlements[0]!, tier: 2, population: 16,
      stocks: { grain: 30, timber: 30, stone: 30, iron: 30 },
      works: ['villa', 'farm', 'market', 'house'].map((building) => ({ building, standing: true, remaining: 0 })),
    }] };
    expect(economyAi().decide({ faction: 'rome', tick: 0, visible: developed }))
      .toEqual([{ kind: 'recruit', faction: 'rome', settlement: 0, squadType: 'principes', men: 24, count: 1 }]);
    for (const change of [
      { treasury: 0 },
      { squads: [{ ...visible.squads[0]!, type: 'hastati', payroll: 7, unpaid: 0 }] },
      { squads: [{ ...visible.squads[0]!, type: 'hastati', payroll: 3, unpaid: 1 }] },
      { fronts: [{ ...visible.fronts[0]!, settlement: 0, siege: 'blockade' as const, besieger: 'carthage' as const }] },
    ]) {
      expect(economyAi().decide({ faction: 'rome', tick: 0, visible: { ...developed, ...change } })
        .filter((command) => command.kind === 'recruit')).toEqual([]);
    }
  });
});
