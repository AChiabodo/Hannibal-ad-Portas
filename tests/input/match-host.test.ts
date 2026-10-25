import { expect, it } from 'vitest';
import { createBrowserMatch } from '../../src/input/match-host.ts';
import { assault, build, recruit } from '../../src/sim/command.ts';
import { idleController, scriptedController } from '../../src/sim/controller.ts';
import { siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { observeSiege, siegeMatchOutcome } from '../../src/sim/siege.ts';

it('hands the opponent only its own copied Observation and rejects foreign Commands before a tick', () => {
  const populations: number[] = [];
  const host = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro', opponent: {
    decide(observation) {
      expect(observation.faction).toBe('carthage');
      expect(observation.visible.settlements.map(({ id }) => id)).toEqual([1]);
      expect(observation.visible.fronts.map(({ settlement }) => settlement)).toEqual([1]);
      populations.push(observation.visible.settlements[0]!.population);
      Object.assign(observation.visible.settlements[0]!, { population: 0 });
      return [];
    },
  } });
  host.advance(2);
  expect(populations).toEqual([10, 10]);
  const foreign = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro', opponent: {
    decide: () => [build('rome', 0, 'farm')],
  } });
  expect(() => foreign.advance(1)).toThrow(/Controller emitted a command for rome/);
  expect(foreign.match.state.tick).toBe(0);
});

it('takes a Stronghold through a human Siege Command, stops there and refuses further orders', () => {
  const rules = { ...siegeMatchRules, createWorld(seed: number) {
    const world = siegeMatchRules.createWorld(seed);
    const target = world.economy.settlements[1]!;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'principes', x: target.x, y: target.y });
    for (const structure of world.siege.fronts[1]!.structures) structure.hp = 0;
    return world;
  } };
  const host = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'centurio', rules,
    opponent: idleController<SiegeVisible>() });
  host.human.submit(assault('rome', [1], 1));
  host.advance(200);
  expect(host.result).toEqual({ kind: 'victory', winner: 'rome',
    reason: { kind: 'stronghold', stronghold: 1, path: 'assault' }, tick: 101 });
  expect(host.pacing.paused).toBe(true);
  expect(host.human.submit(build('rome', 0, 'farm'))).toBe(false);
  expect(() => host.advance(1)).toThrow(/ended/);
});

for (const faction of ['rome', 'carthage'] as const) {
  it(`recruits as ${faction} and matches the headless driver on the same seed and Commands`, () => {
    const host = createBrowserMatch({ seed: 13, faction, difficulty: 'imperator', opponent: idleController<SiegeVisible>() });
    const command = recruit(faction, faction === 'rome' ? 0 : 1, faction === 'rome' ? 'hastati' : 'gaul', 24, 1);
    expect(host.human.submit(command)).toBe(true);
    expect(host.human.submit({ ...command, faction: faction === 'rome' ? 'carthage' : 'rome' })).toBe(false);
    host.advance(1);
    expect(host.observe().squads).toHaveLength(1);
    expect(host.observe().squads[0]).toMatchObject({
      men: 24, capacity: 24, payroll: faction === 'rome' ? 3 : 2,
    });
    const run = runMatch({ seed: 13, ticks: 1, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(host.applied()) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(host.applied()) }] });
    expect(host.match.hash()).toBe(run.hash);
  });
}

it('holds both Players while paused, and advances the same rules at each pace without charging paused time', () => {
  const host = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro' });
  host.pacing.pause();
  host.elapse(60000);
  expect(host.match.state.tick).toBe(0);
  expect(host.applied()).toEqual([]);
  host.pacing.resume();
  for (const speed of [1, 2, 3] as const) {
    host.pacing.setSpeed(speed);
    host.elapse(100);
  }
  expect(host.match.state.tick).toBe(6);
});

it('opens the complete rules without a demonstration army and queues human construction beside AI decisions', () => {
  const host = createBrowserMatch({ seed: 7, faction: 'carthage', difficulty: 'centurio' });
  expect(host.observe().squads).toEqual([]);
  expect(host.observe().fronts).toHaveLength(1);
  host.human.submit(build('carthage', 1, 'farm'));
  host.advance(1);
  expect(host.applied()).toContainEqual({ tick: 0, command: build('carthage', 1, 'farm') });
  expect(host.applied().some(({ command }) => command.faction === 'rome')).toBe(true);
});
