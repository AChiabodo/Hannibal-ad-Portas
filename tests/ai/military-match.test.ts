import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { createArmyController, militaryRegistry, playAiMatch } from '../../src/cli/ai-match.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { createEconomy } from '../../src/sim/economy.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { createSiege, observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible, type SiegeWorld } from '../../src/sim/siege.ts';
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
  it('brings the exhausted seed 9 scout home instead of abandoning it after the second Season', () => {
    let final: SiegeVisible | undefined;
    const run = runMatch({ seed: 9, ticks: 5501, rules: siegeMatchRules, observe: observeSiege,
      outcome(world) { final = observeSiege(world, 'carthage'); return siegeMatchOutcome(world); },
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>([]) },
        { faction: 'carthage', controller: createArmyController('tiro') }],
    });
    expect(run.log).toContainEqual({ tick: 4200, command: { kind: 'withdraw', faction: 'carthage', squads: [1] } });
    expect(final!.squads.find((squad) => squad.id === 1)).toMatchObject({ x: 84, y: 34, goal: null, routing: false });
    const replay = runMatch({ seed: 9, ticks: 5501, rules: siegeMatchRules, observe: observeSiege,
      outcome: siegeMatchOutcome, players: [
        { faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) },
      ] });
    expect(replay.hash).toBe(run.hash);
  }, 15000);

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
    expect(first.visible.enemies).toEqual([
      { id: 2, type: 'gaul', x: 28, y: 20 },
      { id: 3, type: 'gaul', x: 24, y: 24 },
      { id: 4, type: 'gaul', x: 33, y: 20 },
    ]);
    expect(run(90)).toEqual(first);
  });

  it('executes withdrawal to friendly quarters without feeding the beaten Squad back in, and replays the same hash', () => {
    const rules = { ...siegeMatchRules, createWorld() {
      const world = theatre();
      const beaten = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 23, y: 20 });
      beaten.strength = 35;
      beaten.morale = 3;
      for (let i = 0; i < 2; i += 1) {
        musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 20, y: 20 });
      }
      musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', x: 24, y: 20 });
      return world;
    } };
    const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: militaryRegistry });
    let final: SiegeVisible | undefined;
    const run = runMatch({ seed: 7, ticks: 60, rules, observe: observeSiege,
      outcome(world) { final = observeSiege(world, 'rome'); return siegeMatchOutcome(world); },
      players: [{ faction: 'rome', controller }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
    });
    expect(run.log).toContainEqual({ tick: 0, command: { kind: 'withdraw', faction: 'rome', squads: [1] } });
    expect(final!.squads.find((squad) => squad.id === 1)).toMatchObject({ x: 20, y: 20, routing: false });
    expect(run.log.some(({ command }) => command.kind === 'attack' && command.squads.includes(1))).toBe(false);
    const replay = runMatch({ seed: 7, ticks: 60, rules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }],
    });
    expect(replay.hash).toBe(run.hash);
  });
});
