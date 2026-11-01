import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { createSiegeBehaviour, type SiegeCommand, type SiegeObservation } from '../../src/ai/siege.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';

const CONTENT = { canAssault: (faction: string) => faction === 'rome',
  ramCost: 15, siegeRadius: 1, reliefRadius: 3, garrisonEstimate: 1200, ticksPerSecond: 10,
  squadTypes: [{ id: 'hastati', strength: 120, impact: 1, morale: 10 },
    { id: 'gaul', strength: 140, impact: 1, morale: 6 },
    { id: 'triarii', strength: 100, impact: 1, morale: 14 }] };

function controller(level: keyof typeof DIFFICULTY = 'centurio') {
  return createAi<SiegeObservation, SiegeCommand>({ ticksPerSecond: 10,
    registry: createBehaviourRegistry<SiegeObservation, SiegeCommand>([
      createSiegeBehaviour(CONTENT, DIFFICULTY[level]),
    ]) });
}

interface Squad { x: number; y: number; id: number; type: string; men: number; capacity: number; morale: number;
  routing: boolean; garrison: number | null; goal: { x: number; y: number } | null }

function squad(id: number, x: number, y: number, overrides: Partial<Squad> = {}): Squad {
  return { id, type: 'hastati', x, y, men: 120, capacity: 120, morale: 10,
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
  it('keeps a Roman blockade viable when new treasury could buy an unsupported assault', () => {
    const visible = observation({ treasury: 20, squads: [squad(1, 80, 80, { men: 24, capacity: 24 })],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'blockade', ram: null, garrison: 1 }] });
    expect(decide('rome', visible).commands)
      .toEqual([{ kind: 'blockade', faction: 'rome', squads: [1], settlement: 1 }]);
    expect(decide('rome', { ...visible, squads: [...visible.squads, squad(2, 10, 10), squad(3, 10, 10)] }).commands)
      .toEqual([{ kind: 'assault', faction: 'rome', squads: [1, 2, 3], settlement: 1 }]);
  });

  it('prices a Roman blockade separately from a paid assault whose ram is hidden', () => {
    const visible = observation({ treasury: 0, squads: [squad(1, 80, 80, { men: 24, capacity: 24 })],
      fronts: [{ settlement: 1, breached: false, besieger: null, ram: null, ramKnown: true, garrison: 1 }] });
    expect(decide('rome', visible).commands)
      .toEqual([{ kind: 'blockade', faction: 'rome', squads: [1], settlement: 1 }]);
    const paid = { ...visible, fronts: visible.fronts.map((front) => ({ ...front,
      siege: 'assault' as const, besieger: 'rome' as const, ramKnown: false })) };
    expect(decide('rome', paid).commands)
      .toEqual([{ kind: 'withdraw', faction: 'rome', squads: [1] }]);
  });

  it('blockades a stronger wall garrison with Carthage while still refusing an unmatched field relief', () => {
    const visible = observation({ squads: [squad(1, 80, 80, { type: 'gaul', men: 24, capacity: 24, morale: 6 })],
      fronts: [{ settlement: 1, breached: false, besieger: null, ram: null, garrison: 1 }] });
    expect(decide('carthage', visible).commands)
      .toEqual([{ kind: 'blockade', faction: 'carthage', squads: [1], settlement: 1 }]);
    expect(decide('carthage', { ...visible, enemies: [{ type: 'hastati', x: 81, y: 80, appearance: { men: 120 } }] }).commands)
      .toEqual([{ kind: 'withdraw', faction: 'carthage', squads: [1] }]);
  });

  it('prices visible relief using its observed formation and assumes the roster size when appearance is absent', () => {
    const relief = { type: 'gaul', x: 82, y: 80 };
    const visible = observation({ squads: [squad(1, 80, 80, { men: 24, capacity: 24 })],
      enemies: [{ ...relief, appearance: { men: 24 } }],
      fronts: [{ settlement: 1, breached: false, besieger: null, ram: null, garrison: 0 }] });
    expect(decide('rome', visible).commands.some((command) => command.kind === 'assault')).toBe(true);
    expect(decide('rome', { ...visible, enemies: [relief] }).commands)
      .toContainEqual({ kind: 'withdraw', faction: 'rome', squads: [1] });
  });
  it('does not emit an empty withdrawal for a front whose Squads are already returning', () => {
    const { commands } = decide('rome', observation({ squads: [],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', ram: null, garrison: 1 }],
    }));
    expect(commands).toEqual([]);
  });

  it('does not count a spent Squad as power available to sustain the ring', () => {
    const { commands, selected } = decide('rome', observation({
      squads: [squad(1, 80, 80), squad(2, 80, 80, { men: 60 })],
      fronts: [{ settlement: 1, breached: false, besieger: 'rome', ram: null, garrison: 1 }],
    }));
    expect(selected).toBe('abandon');
    expect(commands).toEqual([{ kind: 'withdraw', faction: 'rome', squads: [1, 2] }]);
  });

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


it('can target an observed fortress wall without ever seeing its centre (#74)', () => {
  const visible = observation({ contacts: [], appearances: [{ id: 1, kind: 'stronghold', x: 80, y: 80,
    gateSide: 3, owner: null, memory: 'seen', tiles: [{ cell: 137, seen: 10, visible: true,
      structure: { kind: 'wall', side: 0, condition: 'intact' } }] }] });
  expect(decide('rome', visible, 'centurio', 11).commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [1, 2, 3], settlement: 1 });
});


it('prices observed sentry presence without inventing an unseen full garrison (#74)', () => {
  const visible = observation({ contacts: [], squads: [squad(1, 71, 80, { men: 24, capacity: 24 })],
    appearances: [{ id: 1, kind: 'stronghold', x: 80, y: 80, gateSide: 3, owner: null, memory: 'seen',
      tiles: [{ cell: 137, seen: 10, visible: true, garrison: false,
        structure: { kind: 'wall', side: 0, condition: 'intact' } }] }] });
  expect(decide('rome', visible, 'centurio', 11).commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 });
  const guarded = { ...visible, appearances: visible.appearances!.map((site) => ({ ...site, tiles: site.tiles.map((tile) => ({ ...tile, garrison: true })) })) };
  expect(decide('rome', guarded, 'centurio', 11).commands).toEqual([]);
});


it('keeps an accepted physical perimeter approach assigned to its active siege (#74)', () => {
  const ai = createAi<SiegeObservation, SiegeCommand>({ ticksPerSecond: 10,
    registry: createBehaviourRegistry([createSiegeBehaviour({ ...CONTENT, settlementRadius: 7 })]) });
  const visible = observation({ squads: [squad(1, 87, 69, { men: 24, capacity: 24, goal: { x: 85, y: 71 } })],
    fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault', ram: null, garrison: 0 }] });
  expect(ai.decide({ faction: 'rome', tick: 0, visible })).toEqual([{ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 }]);
});


it('counts a real body already adjacent to a wall rather than only its anchor (#74)', () => {
  const ai = createAi<SiegeObservation, SiegeCommand>({ ticksPerSecond: 10,
    registry: createBehaviourRegistry([createSiegeBehaviour({ ...CONTENT, settlementRadius: 7 })]) });
  const visible = observation({ squads: [{ ...squad(1, 70, 80), formation: 'line', facing: 'south' }],
    fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault', ram: null, garrison: 0 }] });
  expect(ai.decide({ faction: 'rome', tick: 0, visible })).toEqual([{ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 }]);
});


it('continues an assault through a remembered breach when the ram is hidden and already paid (#74)', () => {
  const visible = observation({ treasury: 0, squads: [squad(1, 80, 80)],
    fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault', ram: null, garrison: 0 }],
    appearances: [{ id: 1, kind: 'stronghold', x: 80, y: 80, gateSide: 3, memory: 'seen', owner: null,
      tiles: [{ cell: 305, seen: 10, visible: false, structure: { kind: 'gate', side: 3, condition: 'breached' } }] }] });
  expect(decide('rome', visible, 'centurio', 11).commands).toEqual([{ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 }]);
});

it('keeps an active assault when its ram is outside sight, but blockades when its absence is visible', () => {
  const visible = observation({ treasury: 0, squads: [squad(1, 80, 80)],
    fronts: [{ settlement: 1, breached: false, besieger: 'rome', siege: 'assault',
      ram: null, ramKnown: false, garrison: 0 }] });
  expect(decide('rome', visible).commands).toEqual([{ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 }]);
  const seen = { ...visible, fronts: visible.fronts.map(front => ({ ...front, ramKnown: true })) };
  expect(decide('rome', seen).commands).toEqual([{ kind: 'blockade', faction: 'rome', squads: [1], settlement: 1 }]);
  const paid = { ...seen, fronts: seen.fronts.map(front => ({ ...front, ram: { built: false } })) };
  expect(decide('rome', paid).commands).toEqual([{ kind: 'assault', faction: 'rome', squads: [1], settlement: 1 }]);
  const uncommitted = { ...visible, fronts: visible.fronts.map(front => ({ ...front, siege: null, besieger: null })) };
  expect(decide('rome', uncommitted).commands).toEqual([{ kind: 'blockade', faction: 'rome', squads: [1], settlement: 1 }]);
});
