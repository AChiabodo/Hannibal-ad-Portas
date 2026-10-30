import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createScoutingBehaviour } from '../../src/ai/scouting.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { scoutingRegistry, militaryRegistry } from '../../src/cli/ai-match.ts';
import { SQUAD_TYPES } from '../../src/content/squads.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { SQUAD_VISION, UNSEEN } from '../../src/sim/fog.ts';
import { MAP_WIDTH, MAP_HEIGHT, TERRAIN } from '../../src/sim/map.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { observeSiege, siegeMatchRules } from '../../src/sim/siege.ts';
import type { SiegeVisible } from '../../src/sim/siege.ts';

describe('the scouting Controller', () => {
  it('uses the faster known road to the frontier instead of pricing every tile as equally slow', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: home.x, y: home.y });
    const base = observeSiege(world, 'rome');
    const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT).fill(UNSEEN);
    for (let y = 0; y < 65; y += 1) for (let x = 0; x < 60; x += 1) terrain[y * MAP_WIDTH + x] = TERRAIN.plain;
    for (let y = 20; y <= 40; y += 1) terrain[y * MAP_WIDTH + 20] = TERRAIN.road;
    for (let x = 20; x < 60; x += 1) terrain[40 * MAP_WIDTH + x] = TERRAIN.road;
    const visible: SiegeVisible = { ...base, appearances: [], contacts: [], enemies: [],
      settlements: [{ ...base.settlements[0]!, x: 20, y: 20 }],
      squads: [{ ...base.squads[0]!, x: 20, y: 20, inQuarters: false, goal: null }],
      fog: { ...base.fog, terrain } };
    const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
      registry: createBehaviourRegistry<SiegeVisible, Command>([
        createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
          vision: SQUAD_VISION, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES, scoutTypes: ['hastati'],
          terrainCost: (ground) => ground === TERRAIN.road ? 1 : 4 }, DIFFICULTY.centurio),
      ]) });
    const move = controller.decide({ faction: 'rome', tick: 1, visible }).find((command) => command.kind === 'move');
    expect(move?.kind).toBe('move');
    if (move?.kind === 'move') expect(move.y).toBeGreaterThanOrEqual(38);
  });

  it('plans around a known lake as it would around an equally impassable river', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: home.x, y: home.y });
    const base = observeSiege(world, 'rome');
    const observed = (water: number): SiegeVisible => {
      const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
      for (let y = 0; y < MAP_HEIGHT; y += 1) {
        for (let x = 110; x < MAP_WIDTH; x += 1) terrain[y * MAP_WIDTH + x] = UNSEEN;
      }
      for (let y = 85; y < 125; y += 1) {
        for (let x = 110; x < 128; x += 1) terrain[y * MAP_WIDTH + x] = water;
      }
      return { ...base, appearances: [], fog: { ...base.fog, terrain } };
    };
    const decide = (water: number) => createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
      registry: createBehaviourRegistry<SiegeVisible, Command>([
        createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
          additionalWater: [TERRAIN.lake], vision: SQUAD_VISION, settlementRadius: 7, ticksPerSecond: TICK_HZ,
          squadTypes: SQUAD_TYPES, scoutTypes: ['hastati', 'gaul', 'numidian-horse'] }, DIFFICULTY.imperator),
      ]) }).decide({ faction: 'rome', tick: 0, visible: observed(water) });
    const river = decide(TERRAIN.river);
    expect(river.some((command) => command.kind === 'move')).toBe(true);
    expect(decide(TERRAIN.lake)).toEqual(river);
  });

  it('uses two distinct opening patrols at Imperator when a two-Squad army can provide them', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    for (let i = 0; i < 2; i += 1) musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', men: 24, x: home.x, y: home.y,
    });
    const visible = observeSiege(world, 'rome');
    const counts = Object.values(DIFFICULTY).map((difficulty) => {
      const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
        registry: createBehaviourRegistry<SiegeVisible, Command>([
          createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
            vision: SQUAD_VISION, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES,
            scoutTypes: ['hastati', 'gaul', 'numidian-horse'] }, difficulty),
        ]) });
      const moves = controller.decide({ faction: 'rome', tick: 0, visible }).filter((command) => command.kind === 'move');
      expect(new Set(moves.map((command) => `${command.x},${command.y}`)).size).toBe(moves.length);
      return moves.length;
    });
    expect(counts).toEqual([1, 1, 2]);
  });

  it('stands alone: registered without the field, it still sends a light Squad to the frontier', () => {
    const registry = createBehaviourRegistry<SiegeVisible, Command>([
      createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
        vision: SQUAD_VISION, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES,
        scoutTypes: ['hastati', 'gaul', 'numidian-horse'] }, DIFFICULTY.centurio),
    ]);
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: home.x, y: home.y });
    const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry });
    const commands = controller.decide({ faction: 'rome', tick: 0, visible: observeSiege(world, 'rome') });
    const move = commands.find((command) => command.kind === 'move');
    expect(move).toBeDefined();
    if (move?.kind !== 'move') return;
    expect(move.squads).toEqual([squad.id]);
    expect(controller.readLog().find((entry) => entry.layer === 'tactical')?.selected.behaviour).toBe('scouting');
  });

  it('plans a march against a recent last-known enemy and stops trusting it after two minutes', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    const squadIds: number[] = [];
    for (let i = 0; i < 3; i += 1) squadIds.push(musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', x: home.x, y: home.y,
    }).id);
    const base = observeSiege(world, 'rome');
    const visible: SiegeVisible = { ...base,
      contacts: [{ kind: 'squad', id: 99, type: 'gaul', x: home.x + 5, y: home.y, seen: 0 }],
    };
    const decide = (tick: number) => createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
      registry: militaryRegistry }).decide({ faction: 'rome', tick, visible });
    expect(decide(1)).toContainEqual({ kind: 'move', faction: 'rome', squads: [squadIds[0]], x: home.x + 5, y: home.y });
    expect(decide(1200).filter((command) => command.kind === 'move')).toEqual([]);
    expect(decide(1).filter((command) => command.kind === 'attack')).toEqual([]);
  });
  it('sends a light Squad to a known frontier immediately and the military lets it march', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    const squad = musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', x: home.x, y: home.y,
    });
    const visible = observeSiege(world, 'rome');
    const controller = createAi<typeof visible, Command>({ ticksPerSecond: TICK_HZ, registry: scoutingRegistry });
    const commands = controller.decide({ faction: 'rome', tick: 0, visible });
    const move = commands.find((command) => command.kind === 'move');
    expect(move).toBeDefined();
    if (move?.kind !== 'move') return;
    expect(move.squads).toEqual([squad.id]);
    expect(visible.fog.terrain[move.y * MAP_WIDTH + move.x]).not.toBe(255);
    expect(Math.max(Math.abs(move.x - home.x), Math.abs(move.y - home.y))).toBeGreaterThan(3);
    expect(commands.filter((command) => command.kind === 'hold').flatMap((command) => command.squads)).not.toContain(squad.id);
  });

  it('reduces the detachment after finding the enemy, keeps a patrol, and resumes exploration when the contact expires', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    for (let i = 0; i < 6; i += 1) musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', x: home.x, y: home.y,
    });
    const base = observeSiege(world, 'rome');
    const patrols = (tick: number, contacts: SiegeVisible['contacts']) =>
      createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: scoutingRegistry })
        .decide({ faction: 'rome', tick, visible: { ...base, contacts } })
        .filter((command) => command.kind === 'move');
    const known: SiegeVisible['contacts'] = [{ kind: 'stronghold', id: 1, type: null, x: 80, y: 50, seen: 0 }];
    expect(patrols(0, [])).toHaveLength(2);
    expect(patrols(1, known)).toHaveLength(1);
    expect(patrols(6000, known)).toHaveLength(2);
  });

  it('does not assign routed, garrisoned, engaged or beaten Squads to scouting', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: home.x, y: home.y });
    const base = observeSiege(world, 'rome');
    for (const change of [{ routing: true }, { garrison: 0 }, { engaged: true }, { morale: 2 }, { men: 20 }]) {
      const commands = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
        registry: createBehaviourRegistry<SiegeVisible, Command>([
          createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
            vision: SQUAD_VISION, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES,
            scoutTypes: ['hastati', 'gaul', 'numidian-horse'] }),
        ]) })
        .decide({ faction: 'rome', tick: 0, visible: { ...base, squads: [{ ...base.squads[0]!, ...change }] } });
      expect(commands.filter((command) => command.kind === 'move')).toEqual([]);
    }
  });

  it('keeps elephants out of the light detachment and prefers Numidian horse to the foot line', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[1]!;
    const elephant = musterSquad(world.economy, world.map, {
      faction: 'carthage', squadType: 'elephant', x: home.x, y: home.y,
    });
    const gaul = musterSquad(world.economy, world.map, {
      faction: 'carthage', squadType: 'gaul', x: home.x, y: home.y,
    });
    const horse = musterSquad(world.economy, world.map, {
      faction: 'carthage', squadType: 'numidian-horse', x: home.x, y: home.y,
    });
    const visible = observeSiege(world, 'carthage');
    const commands = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: scoutingRegistry })
      .decide({ faction: 'carthage', tick: 0, visible });
    const scouts = commands.filter((command) => command.kind === 'move').flatMap((command) => command.squads);
    expect(scouts).toEqual([horse.id]);
    expect(scouts).not.toContain(elephant.id);
    expect(scouts).not.toContain(gaul.id);
  });

  it('refreshes a remembered contact on a planned patrol and ignores it once stale', () => {
    const world = siegeMatchRules.createWorld(7);
    const home = world.economy.settlements[0]!;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: home.x, y: home.y });
    const base = observeSiege(world, 'rome');
    const terrain = new Uint8Array(96 * 96); // Worked example: already explored, walkable ground.
    const visible: SiegeVisible = { ...base, fog: { terrain, visible: new Uint8Array(96 * 96), contacts: [] },
      contacts: [{ kind: 'stronghold', id: 1, x: home.x + 12, y: home.y, seen: 0, type: null }],
    };
    const commands = (tick: number) => createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: scoutingRegistry })
      .decide({ faction: 'rome', tick, visible }).filter((command) => command.kind === 'move');
    const refresh = commands(301);
    expect(refresh).toHaveLength(1);
    const target = refresh[0]!;
    expect(Math.max(0, Math.abs(target.x - (home.x + 12)) - 7) ** 2 + Math.max(0, Math.abs(target.y - home.y) - 7) ** 2).toBeLessThanOrEqual(16);
    expect(commands(6000)).toEqual([]);
  });
});
