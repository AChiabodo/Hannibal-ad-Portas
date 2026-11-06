import { formationFootprint } from '../../src/content/formation.ts';
import { MAP_WIDTH, MAP_HEIGHT, TERRAIN } from '../../src/sim/map.ts';
import { UNSEEN } from '../../src/sim/fog.ts';
import { describe, expect, it } from 'vitest';
import { createMatch } from '../../src/sim/match.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { createSiege, observeSiege, siegeMatchRules, type SiegeVisible, type SiegeWorld } from '../../src/sim/siege.ts';
import { createAi } from '../../src/ai/controller.ts';
import { militaryRegistry, scoutingRegistry, playAiMatch, createArmyController } from '../../src/cli/ai-match.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { createFogs } from '../../src/sim/fog.ts';
import { createEconomy } from '../../src/sim/economy.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { plainMap } from '../sim/test-map.ts';

function theatre(): SiegeWorld {
  const map = { ...plainMap(), strongholds: [{ x: 20, y: 20 }, { x: 80, y: 80 }] as const };
  const economy = createEconomy(map);
  return { map, economy, calendar: startCalendar(), siege: createSiege(map, economy),
    fog: createFogs(), autumns: 0, winters: 0 };
}

describe('scouting through a Match Observation', () => {
  it('refreshes a last-known contact when a route returns near it, freezes hidden movement, and disproves an empty tile', () => {
    const match = createMatch({ seed: 7, rules: { ...siegeMatchRules, createWorld: theatre } });
    const { world } = match.state;
    const scout = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 40, y: 40 });
    const enemy = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', x: 44, y: 40 });
    const march = (faction: 'rome' | 'carthage', id: number, x: number) => {
      match.step([{ kind: 'move', faction, squads: [id], x, y: 40 }]);
      for (let i = 0; i < 79; i += 1) match.step();
    };
    const contact = () => observeSiege(world, 'rome').contacts.find((contact) => contact.kind === 'squad' && contact.id === enemy.id);
    match.step();
    const first = contact()!;
    expect(first).toMatchObject({ x: 44, y: 40, seen: 1, type: 'gaul' });
    march('rome', scout.id, 36);
    expect(contact()).toMatchObject({ x: 44, y: 40 });
    const remembered = contact();
    match.step();
    expect(contact()).toEqual(remembered);
    march('rome', scout.id, 40);
    expect(contact()!.seen).toBeGreaterThan(first.seen);
    march('rome', scout.id, 36);
    const last = contact();
    march('carthage', enemy.id, 60);
    expect(contact()).toEqual(last);
    march('rome', scout.id, 40);
    expect(contact()).toBeUndefined();
  });

  it('makes identical decisions when hidden enemies move elsewhere', () => {
    function decide(hiddenX: number) {
      const match = createMatch({ seed: 7, rules: { ...siegeMatchRules, createWorld: theatre } });
      const { world } = match.state;
      musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 20, y: 20 });
      musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', x: hiddenX, y: 70 });
      match.step();
      const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: scoutingRegistry });
      const visible = observeSiege(world, 'rome');
      return { visible: structuredClone(visible), commands: controller.decide({ faction: 'rome', tick: 1, visible }),
        decisions: controller.readLog() };
    }
    expect(decide(70)).toEqual(decide(90));
  });

  it('ships early scouting and replays its Commands to the same fog-inclusive hash', () => {
    const run = playAiMatch(7, 601);
    expect(run.log.some((entry) => entry.tick <= 301 && entry.command.kind === 'move')).toBe(true);
    expect(run.decisions.some((entry) => entry.selected.behaviour === 'scouting')).toBe(true);
    const replay = runMatch({ seed: 7, ticks: 601, rules: siegeMatchRules, observe: observeSiege, outcome: () => null,
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }],
    });
    expect(replay.hash).toBe(run.hash);
  });

  it('attributes a composed scouting decision to the field and the patrols that authored its Commands', () => {
    const run = playAiMatch(7, 601);
    const entry = run.decisions.find((decision) => decision.selected.behaviour === 'scouting')!;
    const selected = entry.candidates.find((candidate) => candidate.id === entry.selected.id)!;
    expect(entry.selected.contributions.map((contribution) => contribution.behaviour)).toEqual(['military', 'scouting']);
    expect(entry.selected.contributions).toEqual(selected.contributions);
    const patrols = entry.selected.contributions.find((contribution) => contribution.behaviour === 'scouting')!.commands;
    expect(patrols.length).toBeGreaterThan(0);
    expect(patrols.every((command) => command.kind === 'move')).toBe(true);
  }, 30000);

  it('does not expose changes to an unobserved minor settlement front', () => {
    const world = siegeMatchRules.createWorld(7);
    const before = structuredClone(observeSiege(world, 'rome'));
    const hidden = world.economy.settlements.find((settlement) => settlement.id > 1 &&
      before.fog.visible[settlement.y * MAP_WIDTH + settlement.x] === 0)!;
    world.siege.fronts[hidden.id]!.hold = 2;
    expect(observeSiege(world, 'rome')).toEqual(before);
  });
  it.each([1, 7, 42])('locates the enemy substantially sooner than the same AI without scouting on seed %i', (seed) => {
    const bound = 12000;
    function play(scouting: boolean) {
      const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
        registry: scouting ? scoutingRegistry : militaryRegistry });
      let found = bound;
      runMatch({ seed, ticks: bound, rules: { ...siegeMatchRules, createWorld(seed) {
        const world = siegeMatchRules.createWorld(seed);
        const home = world.economy.settlements[0]!;
        for (const [dx, dy] of [[15, 0], [-3, -3], [-3, 3]]) musterSquad(world.economy, world.map, {
          faction: 'rome', squadType: 'hastati', men: 24, x: home.x + dx!, y: home.y + dy!,
        });
        return world;
      } }, observe: observeSiege, outcome: () => null,
      players: [{ faction: 'rome', controller: { decide(observation) {
        if (observation.visible.contacts.some((contact) => contact.kind === 'stronghold') ||
          observation.visible.appearances?.some((site) => site.kind === 'stronghold' &&
            !observation.visible.settlements.some((own) => own.id === site.id) && site.tiles.some((tile) => tile.structure !== undefined))) {
          found = Math.min(found, observation.tick);
        }
        return controller.decide(observation);
      } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
      });
      return found;
    }
    const exploring = play(true);
    const baseline = play(false);
    expect(exploring).toBeLessThan(baseline / 2);
  }, 120_000);

  it('remembers an enemy Stronghold only after a Squad has seen it', () => {
    const match = createMatch({ seed: 7, rules: siegeMatchRules });
    const { world } = match.state;
    expect(observeSiege(world, 'rome').contacts).toEqual([]);
    const enemy = world.economy.settlements[1]!;
    musterSquad(world.economy, world.map, {
      faction: 'rome', squadType: 'hastati', men: 24, x: enemy.x - 9, y: enemy.y,
    });
    match.step();
    const known = observeSiege(world, 'rome');
    expect(known.contacts.some((contact) => contact.kind === 'stronghold')).toBe(false);
    expect(known.appearances?.some((site) => site.id === 1 && site.tiles.some((tile) => tile.structure !== undefined))).toBe(true);
    expect(observeSiege(world, 'carthage').contacts.some((contact) => contact.kind === 'stronghold')).toBe(false);
  });
});


it('does not repeatedly send a scout onto a riverbank that cannot hold any arrival pose (#74)', () => {
  const ai = createArmyController('imperator');
  let checked = 0;
  runMatch({ seed: 7, ticks: 500, rules: siegeMatchRules, observe: observeSiege, outcome: () => null,
    players: [{ faction: 'rome', controller: { decide(observation) {
      const commands = ai.decide(observation);
      for (const command of commands) {
        if (command.kind !== 'move') continue;
        for (const id of command.squads) {
          const squad = observation.visible.squads.find((entry) => entry.id === id)!;
          const fits = (['north', 'east', 'south', 'west'] as const).some((facing) => {
            const rect = formationFootprint(squad.capacity, 'column', facing);
            for (let y = command.y + rect.y; y < command.y + rect.y + rect.height; y += 1)
              for (let x = command.x + rect.x; x < command.x + rect.x + rect.width; x += 1) {
                if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return false;
                const terrain = observation.visible.fog.terrain[y * MAP_WIDTH + x];
                if (terrain === TERRAIN.river || terrain === UNSEEN) return false;
              }
            return true;
          });
          expect(fits, `tick ${observation.tick}: Squad ${id} to ${command.x},${command.y}`).toBe(true);
          checked += 1;
        }
      }
      return commands;
    } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
  });
  expect(checked).toBeGreaterThan(0);
}, 15000);
