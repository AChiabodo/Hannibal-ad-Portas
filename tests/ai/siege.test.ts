import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { createSiegeBehaviour, type SiegeCommand, type SiegeObservation } from '../../src/ai/siege.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';

const CONTENT = { canAssault: (faction: string) => faction === 'rome',
  ramCost: 15, siegeRadius: 1, reliefRadius: 3, garrisonEstimate: 1200, ticksPerSecond: 10,
  squadTypes: [{ id: 'hastati', strength: 120, morale: 10 },
    { id: 'gaul', strength: 140, morale: 6 }, { id: 'triarii', strength: 100, morale: 14 }] };

function controller(level: keyof typeof DIFFICULTY = 'centurio') {
  return createAi<SiegeObservation, SiegeCommand>({ ticksPerSecond: 10,
    registry: createBehaviourRegistry<SiegeObservation, SiegeCommand>([
      createSiegeBehaviour(CONTENT, DIFFICULTY[level]),
    ]) });
}

interface Squad { x: number; y: number; id: number; type: string; men: number; morale: number;
  routing: boolean; garrison: number | null; goal: { x: number; y: number } | null }

function squad(id: number, x: number, y: number, overrides: Partial<Squad> = {}): Squad {
  return { id, type: 'hastati', x, y, men: 120, morale: 10,
    routing: false, garrison: null, goal: null, ...overrides };
}

const STRONGHOLD = { kind: 'stronghold', id: 1, x: 80, y: 80, seen: 0, type: null } as const;

function observation(overrides: Partial<SiegeObservation> = {}): SiegeObservation {
  return {
    year: 1, season: 'spring', treasury: 20,
    squads: [squad(1, 10, 10), squad(2, 10, 10), squad(3, 10, 10)],
    enemies: [], contacts: [STRONGHOLD], fronts: [],
    ...overrides,
  };
}

function decide(faction: 'rome' | 'carthage', visible: SiegeObservation,
  level: keyof typeof DIFFICULTY = 'centurio', tick = 0) {
  const ai = controller(level);
  const commands = ai.decide({ faction, tick, visible });
  return { commands, selected: ai.readLog().find((entry) => entry.layer === 'tactical')!.selected.id,
    reason: ai.readLog().find((entry) => entry.layer === 'tactical')!
      .candidates.find((candidate) => candidate.id === ai.readLog().find((entry) => entry.layer === 'tactical')!.selected.id)!.reason };
}

describe('the siege Controller', () => {
  it('waits while no enemy Stronghold has been seen', () => {
    const { commands, selected } = decide('rome', observation({ contacts: [] }));
    expect(selected).toBe('idle');
    expect(commands).toEqual([]);
  });

  it('does not make a Stronghold sighting older than the age limit a siege target', () => {
    const { commands, selected } = decide('rome', observation(), 'centurio', 6000);
    expect(selected).toBe('idle');
    expect(commands).toEqual([]);
  });

  it('keeps a Stronghold sighting refreshed inside the age limit as a target', () => {
    const visible = observation({ contacts: [{ ...STRONGHOLD, seen: 1 }] });
    const { commands, selected } = decide('rome', visible, 'centurio', 6000);
    expect(selected).toBe('assault');
    expect(commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [1, 2, 3], settlement: 1 });
  });

  it('states the age of the sighting it acted on in the log', () => {
    const visible = observation({ contacts: [{ ...STRONGHOLD, seen: 4 }] });
    const { reason } = decide('rome', visible, 'centurio', 100);
    expect(reason).toMatch(/ram/i);
    expect(reason).toMatch(/sighting is 96 ticks old/i);
  });

  it('chooses Assault for Rome on the ram it can pay for, with the grounds in the log', () => {
    const { commands, selected, reason } = decide('rome', observation());
    expect(commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [1, 2, 3], settlement: 1 });
    expect(selected).toBe('assault');
    expect(reason).toMatch(/ram/i);
  });

  it('chooses Blockade for Carthage rather than wait for a ram it can never build', () => {
    const { commands, selected, reason } = decide('carthage', observation());
    expect(commands).toContainEqual({ kind: 'blockade', faction: 'carthage', squads: [1, 2, 3], settlement: 1 });
    expect(selected).toBe('blockade');
    expect(reason).toMatch(/no ram|cannot assault|never/i);
  });

  it('blockades rather than assaults when it cannot pay for a ram', () => {
    const { selected, reason } = decide('rome', observation({ treasury: 5 }));
    expect(selected).toBe('blockade');
    expect(reason).toMatch(/no ram at the walls|starve it instead/i);
  });

  it('reinforces a siege with the reserve when a relieving army approaches', () => {
    const visible = observation({
      squads: [squad(1, 80, 80, { goal: { x: 80, y: 80 } }), squad(2, 80, 80, { goal: { x: 80, y: 80 } }),
        squad(3, 10, 10), squad(4, 10, 10)],
      enemies: [squad(9, 82, 80, { type: 'gaul' }), squad(10, 83, 80, { type: 'gaul' }),
        squad(11, 82, 82, { type: 'gaul' })],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', ram: { built: true }, garrison: 0 }],
    });
    const { commands, selected, reason } = decide('rome', visible);
    expect(selected).toBe('reinforce');
    expect(reason).toMatch(/relief/i);
    expect(commands.flatMap((command) => 'squads' in command ? command.squads : [])).toEqual([1, 2, 3, 4]);
  });

  it('abandons the siege when the relieving army cannot be matched and there is no reserve', () => {
    const visible = observation({
      squads: [squad(1, 80, 80, { goal: { x: 80, y: 80 } }), squad(2, 80, 80, { goal: { x: 80, y: 80 } })],
      enemies: [squad(9, 82, 80, { type: 'gaul' }), squad(10, 83, 80, { type: 'gaul' }),
        squad(11, 82, 82, { type: 'gaul' })],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', ram: { built: true }, garrison: 0 }],
    });
    const { commands, selected, reason } = decide('rome', visible);
    expect(selected).toBe('abandon');
    expect(reason).toMatch(/abandon|relief/i);
    expect(commands).toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [1, 2] });
    expect(commands.some((command) => command.kind === 'assault' || command.kind === 'blockade')).toBe(false);
  });

  it('keeps a committed siege going, and assaults a breach whatever the ram', () => {
    const visible = observation({
      treasury: 0,
      squads: [squad(1, 80, 80, { goal: { x: 80, y: 80 } }), squad(2, 80, 80, { goal: { x: 80, y: 80 } }),
        squad(3, 10, 10)],
      fronts: [{ settlement: 1, breached: true, besieger: 'rome', ram: null, garrison: 0 }],
    });
    const { commands, selected, reason } = decide('rome', visible);
    expect(selected).toBe('assault');
    expect(reason).toMatch(/breached/i);
    expect(commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [1, 2], settlement: 1 });
  });
});
