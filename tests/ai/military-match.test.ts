import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createArmyController, militaryRegistry, playAiMatch } from '../../src/cli/ai-match.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import { blockade, type Command } from '../../src/sim/command.ts';
import { createMatch } from '../../src/sim/match.ts';
import { MAP_HEIGHT, TERRAIN, tileIndex } from '../../src/sim/map.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { createEconomy } from '../../src/sim/economy.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { createSiege, observeSiege, siegeMatchOutcome, siegeMatchRules, siegeMatchRulesForDifficulty, type SiegeVisible, type SiegeWorld } from '../../src/sim/siege.ts';
import { plainMap } from '../sim/test-map.ts';
import { createFogs } from '../../src/sim/fog.ts';

function theatre(): SiegeWorld {
  const map = { ...plainMap(), strongholds: [{ x: 20, y: 20 }, { x: 80, y: 80 }] as const };
  const economy = createEconomy(map);
  return { map, economy, calendar: startCalendar(), siege: createSiege(map, economy), fog: createFogs(), autumns: 0, winters: 0 };
}

function scenario(hiddenX = 70): SiegeWorld {
  const world = theatre();
  const { map, economy } = world;
  musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', x: 29, y: 20 });
  for (const [x, y] of [[28, 20], [24, 24], [33, 20], [hiddenX, 70]]) {
    musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', x: x!, y: y! });
  }
  // Just outside the Squad's circular vision, and a garrison inside it.
  musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', x: 33, y: 21 });
  const garrison = musterSquad(economy, map, { faction: 'carthage', squadType: 'gaul', x: 28, y: 20 });
  garrison.garrison = 1;
  return world;
}

describe('military decisions in a headless Match', () => {
  it('defends an observed blockade with tired infantry already in the Stronghold', () => {
    const world = theatre();
    const defender = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 18, x: 20, y: 20 });
    defender.morale = 4;
    const attacker = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 29, y: 20 });
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step([blockade('carthage', [attacker.id], 0)]);
    const controller = createArmyController('centurio');
    let reachedWalls = false;
    for (let tick = 0; tick < 100; tick += 1) {
      const visible = observeSiege(world, 'rome');
      if (visible.squads.find((squad) => squad.id === defender.id)?.garrison === 0) reachedWalls = true;
      match.step(controller.decide({ faction: 'rome', tick: match.state.tick, visible }));
    }
    expect(reachedWalls).toBe(true);
  });
  it('does not repeat an unreachable recall after ordinary route validation refuses it', () => {
    const world = theatre();
    for (let y = 0; y < MAP_HEIGHT; y += 1) world.map.terrain[tileIndex(50, y)] = TERRAIN.river;
    const defender = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 65, y: 40 });
    const attacker = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 29, y: 20 });
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step([blockade('carthage', [attacker.id], 0)]);
    const controller = createArmyController('centurio');
    const first = controller.decide({ faction: 'rome', tick: match.state.tick, visible: observeSiege(world, 'rome') });
    expect(first).toContainEqual({ kind: 'garrison', faction: 'rome', squads: [defender.id], settlement: 0 });
    match.step(first);
    const refused = observeSiege(world, 'rome');
    expect(refused.squads.find((squad) => squad.id === defender.id)?.refused).toBe('unreachable');
    const second = controller.decide({ faction: 'rome', tick: match.state.tick, visible: refused });
    expect(second.some((command) => command.kind === 'garrison' && command.squads.includes(defender.id))).toBe(false);
  });
  it('recalls an unengaged scout to the walls of its blockaded Stronghold', () => {
    const rome = createArmyController('tiro'), carthage = createArmyController('tiro');
    let blockadeSeen = false, defenderOnWalls = false;
    runMatch({ seed: 7, ticks: 2100, rules: siegeMatchRulesForDifficulty('tiro'), observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: rome }, { faction: 'carthage', controller: { decide(observation) {
        const front = observation.visible.fronts.find((entry) => entry.settlement === 1);
        if (front?.siege === 'blockade' && front.besieger === 'rome') blockadeSeen = true;
        if (blockadeSeen && front !== undefined && front.garrison > 0 &&
          observation.visible.squads.some((squad) => squad.garrison === 1)) defenderOnWalls = true;
        return carthage.decide(observation);
      } } }] });
    expect(blockadeSeen).toBe(true);
    expect(defenderOnWalls).toBe(true);
  }, 30000);
  it('sends a ready defender to its own empty walls when an observed blockade begins', () => {
    const rome = createArmyController('centurio'), carthage = createArmyController('centurio');
    let blockadeSeen = false, defenderOnWalls = false;
    runMatch({ seed: 7, ticks: 1800, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: rome }, { faction: 'carthage', controller: { decide(observation) {
        const front = observation.visible.fronts.find((entry) => entry.settlement === 1);
        if (front?.siege === 'blockade' && front.besieger === 'rome') blockadeSeen = true;
        if (blockadeSeen && front !== undefined && front.garrison > 0 &&
          observation.visible.squads.some((squad) => squad.garrison === 1)) defenderOnWalls = true;
        return carthage.decide(observation);
      } } }] });
    expect(blockadeSeen).toBe(true);
    expect(defenderOnWalls).toBe(true);
  }, 30000);
  it('clears a stationary friendly body blocking an entering squad at its own gate', () => {
    const rome = createArmyController('centurio'), carthage = createArmyController('centurio');
    let blocked: { id: number; blocker: number; x: number; y: number } | undefined;
    let cleared = false;
    runMatch({ seed: 7, ticks: 1000, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: rome }, { faction: 'carthage', controller: { decide(observation) {
        const squads = observation.visible.squads;
        if (blocked === undefined) {
          const waiting = squads.find((squad) => squad.passage?.reason === 'exit-blocked');
          const blocker = squads.find((squad) => squad.id !== waiting?.id && squad.inQuarters && squad.goal === null &&
            waiting !== undefined && Math.max(Math.abs(squad.x - waiting.x), Math.abs(squad.y - waiting.y)) <= 4);
          if (waiting !== undefined && blocker !== undefined) blocked = { id: waiting.id, blocker: blocker.id, x: blocker.x, y: blocker.y };
        } else {
          const waiting = squads.find((squad) => squad.id === blocked!.id);
          const blocker = squads.find((squad) => squad.id === blocked!.blocker);
          if (waiting?.passage?.reason !== 'exit-blocked' && blocker !== undefined &&
            (blocker.x !== blocked.x || blocker.y !== blocked.y)) cleared = true;
        }
        return carthage.decide(observation);
      } } }] });
    expect(blocked).toBeDefined();
    expect(cleared).toBe(true);
  }, 30000);
  it('brings the exhausted seed 9 scout home instead of abandoning it after the second Season', () => {
    let final: SiegeVisible | undefined;
    let scoutId: number | undefined;
    const run = runMatch({ seed: 9, ticks: 5501, rules: siegeMatchRules, observe: observeSiege,
      outcome(world) {
        final = observeSiege(world, 'carthage');
        scoutId ??= final.squads[0]?.id;
        return siegeMatchOutcome(world);
      },
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>([]) },
        { faction: 'carthage', controller: createArmyController('tiro') }],
    });
    expect(scoutId).toBeDefined();
    expect(run.log).toContainEqual({ tick: 4200, command: { kind: 'withdraw', faction: 'carthage', squads: [scoutId] } });
    expect(final!.squads.find((squad) => squad.id === scoutId)).toMatchObject({ inQuarters: true, goal: null, routing: false });
    const replay = runMatch({ seed: 9, ticks: 5501, rules: siegeMatchRules, observe: observeSiege,
      outcome: siegeMatchOutcome, players: [
        { faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) },
      ] });
    expect(replay.hash).toBe(run.hash);
  // The live AI and its complete Replay both cross the expanded physical theatre.
  }, 60000);

  it('installs military decisions in the shipped AI harness', () => {
    expect(playAiMatch(7, 1).decisions.some((entry) => entry.selected.behaviour === 'military')).toBe(true);
  });

  it('sees only field enemies in settlement or Squad vision and makes the same decisions with a different hidden army', () => {
    function run(hiddenX: number) {
      const observations: SiegeVisible[] = [];
      const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: militaryRegistry });
      runMatch({ seed: 7, ticks: 1, observe: observeSiege, outcome: siegeMatchOutcome,
        rules: { ...siegeMatchRules, createWorld: () => scenario(hiddenX) },
        players: [{ faction: 'rome', controller: { decide(observation) {
          observations.push(observation.visible);
          return controller.decide(observation);
        } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
      });
      return { visible: observations[0]!, decisions: controller.readLog() };
    }
    const first = run(70);
    expect(first.visible.enemies).toMatchObject([
      { id: 2, type: 'gaul', x: 28, y: 20 },
      { id: 3, type: 'gaul', x: 24, y: 24 },
      { id: 4, type: 'gaul', x: 33, y: 20 },
    ]);
    expect(run(90)).toEqual(first);
  });

  it('executes withdrawal to friendly quarters without feeding the beaten Squad back in, and replays the same hash', () => {
    const rules = { ...siegeMatchRules, createWorld() {
      const world = theatre();
      const beaten = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 29, y: 20 });
      beaten.strength = 35;
      beaten.morale = 3;
      beaten.facing = 3;
      for (const y of [12, 28]) {
        musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 29, y });
      }
      musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', x: 36, y: 20 });
      return world;
    } };
    const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: militaryRegistry });
    let final: SiegeVisible | undefined;
    const run = runMatch({ seed: 7, ticks: 250, rules, observe: observeSiege,
      outcome(world) { final = observeSiege(world, 'rome'); return siegeMatchOutcome(world); },
      players: [{ faction: 'rome', controller }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
    });
    expect(run.log).toContainEqual({ tick: 0, command: { kind: 'withdraw', faction: 'rome', squads: [1] } });
    expect(final!.squads.find((squad) => squad.id === 1)).toMatchObject({ inQuarters: true, routing: false });
    expect(run.log.some(({ command }) => command.kind === 'attack' && command.squads.includes(1))).toBe(false);
    const replay = runMatch({ seed: 7, ticks: 250, rules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }],
    });
    expect(replay.hash).toBe(run.hash);
  });
});
