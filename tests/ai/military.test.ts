import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createMilitaryBehaviour } from '../../src/ai/military.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { createArmyController, militaryRegistry } from '../../src/cli/ai-match.ts';
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
  it('funds a defensive approach with the power the line retains after marching', () => {
    const base = battlefield();
    for (const count of [2, 3]) {
      const commands = ai().decide({ faction: 'rome', tick: 1, visible: { ...base,
        squads: base.squads.slice(0, count).map((squad) => ({ ...squad, men: 24, capacity: 24 })),
        enemies: [{ id: 10, type: 'gaul', x: 25, y: 20 }],
      } });
      const sent = commands.flatMap((command) => command.kind === 'attack' ? command.squads : []);
      expect(sent).toEqual(count === 2 ? [] : [0, 1, 2]);
    }
  });

  it('allows a rested-enough line to defend home while it is recovering for the next campaign', () => {
    const base = battlefield();
    const commands = ai().decide({ faction: 'rome', tick: 2101, visible: { ...base,
      season: 'summer', squads: base.squads.map((squad) => ({ ...squad, morale: 6 })),
      enemies: [{ id: 10, type: 'gaul', x: 25, y: 20 }],
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [0], target: 10 });
  });

  it('does not divert the defensive line to economic expansion', () => {
    const base = battlefield();
    const visible: SiegeVisible = { ...base, season: 'summer',
      squads: base.squads.map((squad) => squad.id === 2 ? { ...squad, x: 76, y: 80 } : squad),
      enemies: [{ id: 10, type: 'gaul', x: 28, y: 20 }],
      contacts: [{ kind: 'stronghold', id: 1, type: null, x: 80, y: 80, seen: 2100 },
        { kind: 'settlement', id: 2, type: null, x: 40, y: 40, seen: 2000 }],
      fronts: [{ settlement: 1, breached: false, besieger: null, siege: null, ram: null,
        garrison: 4, hold: 0, structures: [] }],
    };
    const commands = createArmyController('centurio').decide({ faction: 'rome', tick: 2101, visible });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [0], target: 10 });
    expect(commands.some((command) => command.kind === 'move' && command.squads.includes(0))).toBe(false);
  });

  it('lets returned Squads recover fully before starting another campaign', () => {
    const base = battlefield();
    const controller = createArmyController('centurio');
    const visible: SiegeVisible = { ...base, enemies: [],
      contacts: [{ kind: 'stronghold', id: 1, type: null, x: 80, y: 80, seen: 0 }],
      fronts: [{ settlement: 1, breached: true, besieger: null, siege: null, ram: null,
        garrison: 0, hold: 0, structures: [] }],
      squads: [{ ...base.squads[0]!, morale: 6 }],
    };
    const resting = controller.decide({ faction: 'rome', tick: 1, visible });
    expect(resting.filter((command) => command.kind === 'move' || command.kind === 'assault' || command.kind === 'blockade'))
      .toEqual([]);
    const recovered = controller.decide({ faction: 'rome', tick: 2,
      visible: { ...visible, squads: [{ ...visible.squads[0]!, morale: 10 }] } });
    expect(recovered).toContainEqual({ kind: 'assault', faction: 'rome', squads: [0], settlement: 1 });
  });

  it('finishes a payable ram instead of withdrawing just before its shelter becomes available', () => {
    const base = battlefield();
    const target = { kind: 'stronghold', id: 1, type: null, x: 80, y: 80, seen: 840 } as const;
    const visible = { ...base, enemies: [], contacts: [target],
      squads: [{ ...base.squads[0]!, capacity: 24, men: 19, morale: 5, x: 80, y: 80, goal: { x: 80, y: 80 } }],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault',
        ram: { hp: 60, remaining: 10, built: false }, garrison: 0, hold: 0, structures: [] }],
    } satisfies SiegeVisible;
    const controller = createArmyController('tiro');
    const commands = controller.decide({ faction: 'rome', tick: 841, visible });
    expect(commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [0], settlement: 1 });
    expect(commands.some((command) => command.kind === 'withdraw')).toBe(false);
  });

  it('still withdraws when the ram cannot shelter the ring before it breaks or a superior enemy arrives', () => {
    const base = battlefield();
    for (const [morale, men, remaining, relief] of [[1, 19, 30, false], [5, 12, 10, false],
      [5, 19, 10, true], [0, 19, 0, false]] as const) {
      const visible: SiegeVisible = { ...base,
        enemies: relief ? [{ id: 10, type: 'gaul', x: 80, y: 81 }] : [],
        contacts: [{ kind: 'stronghold', id: 1, type: null, x: 80, y: 80, seen: 840 }],
        squads: [{ ...base.squads[0]!, capacity: 24, men, morale, x: 80, y: 80, goal: { x: 80, y: 80 } }],
        fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault',
          ram: { hp: 60, remaining, built: remaining === 0 }, garrison: 0, hold: 0, structures: [] }],
      };
      expect(createArmyController('tiro').decide({ faction: 'rome', tick: 841, visible }))
        .toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
    }
  });

  it('keeps an ongoing withdrawal owned by the field when the composed siege could use that Squad', () => {
    const base = battlefield();
    const controller = createArmyController('imperator');
    const commands = controller.decide({ faction: 'rome', tick: 1, visible: { ...base,
      enemies: [], contacts: [{ kind: 'stronghold', id: 1, type: null, x: 80, y: 80, seen: 0 }],
      fronts: [{ settlement: 1, breached: false, besieger: null, siege: null, ram: null, garrison: 0, hold: 0, structures: [] }],
      squads: [{ ...base.squads[0]!, x: 30, y: 30, goal: { x: 20, y: 20 } }],
    } });
    expect(commands.filter((command) => 'squads' in command && command.squads.includes(0))).toEqual([]);
  });

  it('recalls an exhausted scout outside combat and preserves its march home', () => {
    const controller = ai();
    const base = battlefield();
    const visible = { ...base, enemies: [], contacts: [], squads: [{ ...base.squads[0]!,
      x: 50, y: 50, morale: 5, goal: { x: 60, y: 50 } }] };
    expect(controller.decide({ faction: 'rome', tick: 0, visible }))
      .toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [0] });
    const continuing = controller.decide({ faction: 'rome', tick: 1, visible: { ...visible,
      squads: [{ ...visible.squads[0]!, goal: { x: 20, y: 20 } }],
    } });
    expect(continuing.filter((command) => 'squads' in command && command.squads.includes(0))).toEqual([]);
    const arrived = controller.decide({ faction: 'rome', tick: 2, visible: { ...visible,
      squads: [{ ...visible.squads[0]!, x: 20, y: 20, goal: null }],
    } });
    expect(arrived.filter((command) => 'squads' in command && command.squads.includes(0))).toEqual([]);
  });

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
      squads: base.squads.map((squad) => ({ ...squad, x: squad.id === 2 ? 23 : 24,
        engaged: squad.id !== 2 })),
      enemies: [10, 11, 12, 13, 14, 15].map((id) => ({ id, type: 'libyan-spear', x: 25, y: 20 })),
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [2], target: 10 });
    const tactical = controller.readLog().find((entry) => entry.layer === 'tactical')!;
    expect(tactical.selected.id).toBe('commit-reserve');
    expect(tactical.candidates.find((candidate) => candidate.id === 'commit-reserve')?.reason)
      .toContain('Commit reserve 2');
  });

  it('retains the same six-Spear threat as an unwinnable approach from five tiles away', () => {
    const commands = ai().decide({ faction: 'rome', tick: 0, visible: { ...battlefield(),
      enemies: [10, 11, 12, 13, 14, 15].map((id) => ({ id, type: 'libyan-spear', x: 25, y: 20 })),
    } });
    expect(commands.some((command) => command.kind === 'attack')).toBe(false);
  });

  it('declines an overwhelming force instead of feeding the reserve into a lost engagement', () => {
    const base = battlefield();
    const controller = ai();
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.map((squad) => squad.id === 0 ? { ...squad, x: 24, engaged: true } : squad),
      enemies: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map((id) => ({ id, type: 'libyan-spear', x: 25, y: 20 })),
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
      // Four Gauls are 192 men priced at their own nerve: more than one Roman
      // line is comfortable with at Centurio's 125% margin, and not more than two
      // (#66 recalibrated what a body of men is worth).
      enemies: [10, 11, 12, 13].map((id) => ({ id, type: 'gaul', x: 41, y: 40 })),
    } });
    expect(commands).toContainEqual({ kind: 'attack', faction: 'rome', squads: [1], target: 10 });
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.selected.id).toBe('commit-reserve');
  });

  it('withdraws from a lost engagement when the apparent support is already spent and departing', () => {
    const base = battlefield();
    const commands = ai().decide({ faction: 'rome', tick: 0, visible: { ...base,
      squads: base.squads.map((squad) => ({ ...squad, x: 22, engaged: squad.id === 0,
        men: squad.id === 0 ? 120 : 60, goal: squad.id === 0 ? null : { x: 20, y: 20 } })),
      // Five Gauls are 240 men to this one line's 120, and the two half-strength
      // Squads that could have helped are going home.
      enemies: [10, 11, 12, 13, 14].map((id) => ({ id, type: 'gaul', x: 23, y: 20 })),
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
