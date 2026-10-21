import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createMilitaryBehaviour } from '../../src/ai/military.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { militaryRegistry } from '../../src/cli/ai-match.ts';
import { SQUAD_TYPES } from '../../src/content/squads.ts';
import { MATCHUP } from '../../src/content/arms.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { FATIGUE_MAX } from '../../src/sim/squad.ts';
import { observeSiege, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';

function ai() {
  return createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: militaryRegistry });
}

function battlefield(): SiegeVisible {
  const world = siegeMatchRules.createWorld(7);
  const home = world.economy.settlements[0]!;
  musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: home.x, y: home.y });
  const base = observeSiege(world, 'rome');
  const squad = base.squads[0]!;
  return { ...base, settlements: [{ ...base.settlements[0]!, x: 20, y: 20 }],
    squads: [0, 1, 2].map((id) => ({ ...squad, id, type: 'hastati', men: 120,
      morale: 10, fatigue: 0, routing: false, engaged: false, garrison: null,
      x: 20, y: 20, goal: null })),
    enemies: [{ id: 10, type: 'gaul', x: 25, y: 20 }],
  };
}

describe('the military Controller', () => {
  it('stands alone: registered without the economy or scouting, it still plans from its own contact memory', () => {
    const registry = createBehaviourRegistry<SiegeVisible, Command>([
      createMilitaryBehaviour({ squadTypes: SQUAD_TYPES, matchup: MATCHUP, fatigueMax: FATIGUE_MAX,
        ticksPerSecond: TICK_HZ }, DIFFICULTY.centurio),
    ]);
    const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry });
    const visible: SiegeVisible = { ...battlefield(), enemies: [],
      contacts: [{ kind: 'squad', id: 99, type: 'gaul', x: 30, y: 20, seen: 0 }] };
    const commands = controller.decide({ faction: 'rome', tick: 1, visible });
    expect(commands).toContainEqual({ kind: 'move', faction: 'rome', squads: [0], x: 30, y: 20 });
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.selected.behaviour).toBe('military');
  });

  it('allocates a line to a threatened settlement and logs a per-region threat assessment', () => {
    const controller = ai();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: battlefield() });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [0], target: 10 });
    expect(commands.some((command) => command.kind === 'hold' && command.squads.includes(2))).toBe(true);
    const tactical = controller.readLog().find((entry) => entry.layer === 'tactical')!;
    expect(tactical.selected.behaviour).toBe('military');
    expect(tactical.candidates.find((candidate) => candidate.id === 'threat-map')?.reason)
      .toContain('region 1,1');
    expect(tactical.candidates.find((candidate) => candidate.id === tactical.selected.id)?.reason)
      .toContain('settlement 0');
  });

  it('withdraws a beaten Squad and keeps it out of subsequent reinforcement orders', () => {
    const controller = ai();
    const base = battlefield();
    const visible = { ...base, squads: [{ ...base.squads[0]!, x: 24, morale: 3, men: 35, engaged: true },
      ...base.squads.slice(1)] };
    const first = controller.decide({ faction: 'rome', tick: 0, visible });
    expect(first).toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
    expect(first.filter((command) => command.kind === 'attack').every((command) => !command.squads.includes(0))).toBe(true);
    const next = controller.decide({ faction: 'rome', tick: 1, visible: { ...visible,
      squads: visible.squads.map((squad) => squad.id === 0 ? { ...squad, x: 22, engaged: false,
        goal: { x: 20, y: 20 } } : squad),
    } });
    expect(next.filter((command) => command.kind === 'attack').every((command) => !command.squads.includes(0))).toBe(true);
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.selected.id).toBe('withdraw');
  });

  it('commits the reserve only when the defensive line needs its strength and logs the commitment', () => {
    const controller = ai();
    const base = battlefield();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      enemies: [10, 11, 12].map((id) => ({ id, type: 'libyan-spear', x: 25, y: 20 })),
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [2], target: 10 });
    const tactical = controller.readLog().find((entry) => entry.layer === 'tactical')!;
    expect(tactical.selected.id).toBe('commit-reserve');
    expect(tactical.candidates.find((candidate) => candidate.id === 'commit-reserve')?.reason)
      .toContain('Commit reserve 2');
  });

  it('declines an overwhelming force instead of feeding the reserve into a lost engagement', () => {
    const base = battlefield();
    const controller = ai();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.map((squad) => squad.id === 0 ? { ...squad, x: 24, engaged: true } : squad),
      enemies: [10, 11, 12, 13, 14, 15].map((id) => ({ id, type: 'libyan-spear', x: 25, y: 20 })),
    } });
    expect(commands).toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
    expect(commands.filter((command) => command.kind === 'attack')).toEqual([]);
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.candidates
      .some((candidate) => candidate.reason.includes('Decline'))).toBe(true);
  });

  it('changes affordable recruitment to answer the observed composition while preserving Payroll and food reserves', () => {
    const base = battlefield();
    const developed: SiegeVisible = { ...base, treasury: 60, squads: [], settlements: [{
      ...base.settlements[0]!, tier: 3, population: 40,
      stocks: { grain: 100, timber: 100, stone: 100, iron: 100 },
      works: [{ building: 'villa', standing: false, remaining: 10 }],
    }] };
    const recruit = (type: string, change: Partial<SiegeVisible> = {}) => ai().decide({ faction: 'rome', tick: 0,
      visible: { ...developed, enemies: [{ id: 10, type, x: 25, y: 20 }], ...change },
    }).filter((command) => command.kind === 'recruit');
    expect(recruit('numidian-horse')).toEqual([
      { kind: 'recruit', faction: 'rome', settlement: 0, squadType: 'triarii', men: 24, count: 1 },
    ]);
    expect(recruit('balearic-slinger')).toEqual([
      { kind: 'recruit', faction: 'rome', settlement: 0, squadType: 'principes', men: 60, count: 1 },
    ]);
    expect(recruit('numidian-horse', { treasury: 0 })).toEqual([]);
  });

  it('uses regional exposure to defend the unprotected settlement first, including threats across a region edge', () => {
    const controller = ai();
    const base = battlefield();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      settlements: [base.settlements[0]!, { ...base.settlements[0]!, id: 2, x: 47, y: 20 }],
      enemies: [base.enemies[0]!, { id: 20, type: 'libyan-spear', x: 49, y: 20 },
        { id: 21, type: 'libyan-spear', x: 49, y: 20 }],
    } });
    expect(commands.filter((command) => command.kind === 'attack')[0])
      .toEqual({ kind: 'attack', faction: 'rome', squads: [0], target: 20 });
    const assigned = commands.flatMap((command) => 'squads' in command ? command.squads : []);
    expect(new Set(assigned).size).toBe(assigned.length);
  });

  it('attacks an observed weakness in the field and stops pursuing when it leaves sight', () => {
    const controller = ai();
    const base = battlefield();
    const visible = { ...base, squads: base.squads.map((squad) => ({ ...squad, x: 40, y: 40 })),
      enemies: [{ id: 10, type: 'gaul', x: 44, y: 40 }],
    };
    const commands = controller.decide({ faction: 'rome', tick: 0, visible });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [0], target: 10 });
    const next = controller.decide({ faction: 'rome', tick: 1, visible: { ...visible, enemies: [],
      squads: visible.squads.map((squad) => ({ ...squad, goal: { x: 44, y: 40 } })),
    } });
    expect(next).toContainEqual({ kind: 'hold', faction: 'rome', squads: [0] });
    expect(next.filter((command) => command.kind === 'attack')).toEqual([]);
  });

  it('replaces a beaten Squad\'s existing attack march with withdrawal', () => {
    const base = battlefield();
    const commands = ai().decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: [{ ...base.squads[0]!, x: 24, morale: 3, engaged: false, goal: { x: 25, y: 20 } }],
    } });
    expect(commands).toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
  });

  it('commits a nearby reserve to turn a winnable field fight rather than leaving the line unsupported', () => {
    const base = battlefield();
    const controller = ai();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.slice(0, 2).map((squad) => ({ ...squad, x: 40, y: 40, engaged: squad.id === 0 })),
      enemies: [10, 11].map((id) => ({ id, type: 'gaul', x: 41, y: 40 })),
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [1], target: 10 });
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.selected.id).toBe('commit-reserve');
  });

  it('withdraws from a lost engagement when the apparent support is already spent and departing', () => {
    const base = battlefield();
    const commands = ai().decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.map((squad) => ({ ...squad, x: 22, engaged: squad.id === 0,
        men: squad.id === 0 ? 120 : 60, goal: squad.id === 0 ? null : { x: 20, y: 20 } })),
      enemies: [10, 11].map((id) => ({ id, type: 'gaul', x: 23, y: 20 })),
    } });
    expect(commands).toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
    expect(commands.some((command) => command.kind === 'hold' && command.squads.includes(0))).toBe(false);
  });

  it('retains an unengaged reserve rather than calling a Squad already in contact a reserve', () => {
    const controller = ai();
    const base = battlefield();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.slice(0, 2).map((squad) => ({ ...squad, engaged: squad.id === 1 })),
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [1], target: 10 });
    expect(commands).toContainEqual({ kind: 'hold', faction: 'rome', squads: [0] });
  });
});
