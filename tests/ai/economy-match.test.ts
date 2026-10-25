import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { economyRegistry, economyRegistryAt } from '../../src/cli/ai-match.ts';
import { DIFFICULTY } from '../../src/ai/difficulty.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { scriptedController, type Player } from '../../src/sim/controller.ts';
import { applyEconomyCommand } from '../../src/sim/economy.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { HEADLESS_TICKS } from '../../src/sim/season.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { buildingCode } from '../../src/content/index.ts';
import { musterSquad } from '../../src/sim/movement.ts';

describe('an unopposed economy across three Years', () => {
  it.each(['tiro', 'centurio', 'imperator'] as const)('builds storage, grows stocks and recruits with the same economy at %s', (level) => {
    const difficulty = DIFFICULTY[level];
    const ai = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
      operationalSeconds: difficulty.reactionSeconds, registry: economyRegistryAt(difficulty) });
    let stored = 0;
    let unpaid = 0;
    const run = runMatch({ seed: 7, ticks: HEADLESS_TICKS, rules: { ...siegeMatchRules, createWorld(seed) {
      const world = siegeMatchRules.createWorld(seed);
      const home = world.economy.settlements[0]!;
      home.tier = 3;
      home.population = 40;
      home.stocks.fill(40);
      for (const building of ['villa', 'forum', 'farm', 'farm', 'farm', 'farm', 'market', 'market',
        'house', 'house', 'house', 'house']) home.works.push({ building: buildingCode(building)!, remaining: 0 });
      world.economy.treasuries[0] = 150;
      musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: home.x, y: home.y });
      return world;
    } }, observe: observeSiege, outcome: () => null, players: [
      { faction: 'rome', controller: { decide(observation) {
        stored = Math.max(stored, observation.visible.settlements[0]!.stocks.grain);
        unpaid = Math.max(unpaid, ...observation.visible.squads.map((squad) => squad.unpaid));
        return ai.decide(observation);
      } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) },
    ] });
    const granary = run.log.find(({ command }) => command.kind === 'build' && command.building === 'granary');
    const purchase = run.log.find(({ tick, command }) => tick > 400 && command.kind === 'recruit' && command.squadType === 'triarii');
    expect(granary).toBeDefined();
    expect(stored).toBeGreaterThan(40);
    // Imperator's 40-grain food floor plus a 24-man Triarii's 10-grain price
    // exceeds the former capacity of 40; the other levels retain lower floors.
    expect(purchase).toBeDefined();
    expect(purchase!.tick).toBeGreaterThan(granary!.tick);
    expect(unpaid).toBe(0);
  });

  it.each(['rome', 'carthage'] as const)('completes a sustainable Forum and buys the upper roster as %s', (faction) => {
    const ai = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: economyRegistry });
    let final: SiegeVisible | undefined;
    const run = runMatch({ seed: 7, ticks: 2401, rules: { ...siegeMatchRules, createWorld(seed) {
      const world = siegeMatchRules.createWorld(seed);
      const home = world.economy.settlements[faction === 'rome' ? 0 : 1]!;
      home.tier = 2;
      home.population = 40;
      home.stocks.fill(40);
      for (const building of ['villa', 'granary', 'farm', 'farm', 'farm', 'farm', 'market', 'market',
        'house', 'house', 'house', 'house']) home.works.push({ building: buildingCode(building)!, remaining: 0 });
      world.economy.treasuries[faction === 'rome' ? 0 : 1] = 150;
      musterSquad(world.economy, world.map, { faction, squadType: faction === 'rome' ? 'hastati' : 'gaul',
        men: 24, x: home.x, y: home.y });
      return world;
    } }, observe: observeSiege, outcome(world) {
      final = observeSiege(world, faction);
      return null;
    }, players: [{ faction, controller: ai },
      { faction: faction === 'rome' ? 'carthage' : 'rome', controller: scriptedController<SiegeVisible>([]) }] });
    expect(final!.settlements[0]!.tier).toBe(3);
    expect(final!.squads.some((squad) => faction === 'rome' ? squad.type === 'triarii'
      : squad.type === 'numidian-horse' || squad.type === 'elephant')).toBe(true);
    expect(run.log.some(({ command }) => command.kind === 'build' && command.building === 'forum')).toBe(true);
    expect(final!.squads.every((squad) => squad.unpaid === 0)).toBe(true);
  });

  it.each([1, 7, 42])('grows and pays both Factions without exhausting or hoarding the treasury (seed %i)', (seed) => {
    const snapshots: Record<string, SiegeVisible[]> = { rome: [], carthage: [] };
    let final: SiegeVisible[] = [];
    let checks = 0;
    function player(faction: 'rome' | 'carthage'): Player<SiegeVisible> {
      const ai = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: economyRegistry });
      return { faction, controller: { decide(observation) {
        const history = snapshots[observation.faction]!;
        if (history.at(-1)?.season !== observation.visible.season) history.push(observation.visible);
        return ai.decide(observation);
      } } };
    }
    const run = runMatch({
      seed, ticks: HEADLESS_TICKS, rules: siegeMatchRules, observe: observeSiege,
      outcome(world) {
        if (++checks === HEADLESS_TICKS + 1) final = (['rome', 'carthage'] as const).map((faction) =>
          observeSiege(world, faction));
        return siegeMatchOutcome(world);
      },
      players: [player('rome'), player('carthage')],
    });
    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    for (const visible of final) {
      expect(visible.settlements.some((settlement) => settlement.tier >= 2)).toBe(true);
      expect(visible.squads.length).toBeGreaterThanOrEqual(2);
      expect(visible.treasury).toBeGreaterThanOrEqual(6);
      expect(visible.treasury).toBeLessThan(100);
    }
    for (const history of Object.values(snapshots)) {
      for (const visible of history.concat(final)) {
        expect(visible.squads.every((squad) => squad.unpaid === 0)).toBe(true);
        expect(visible.settlements[0]!.population).toBeGreaterThanOrEqual(10);
      }
    }
    const builds = (faction: string) => run.log.flatMap(({ command }) =>
      command.faction === faction && command.kind === 'build' ? [command.building] : []);
    expect(builds('rome')[0]).toBe('market');
    expect(builds('carthage')[0]).toBe('market');
    expect(final[0]!.squads.map((squad) => squad.type)).not.toEqual(final[1]!.squads.map((squad) => squad.type));
    if (seed === 7) {
      const replay = runMatch({ seed, ticks: HEADLESS_TICKS, rules: siegeMatchRules, observe: observeSiege,
        outcome: siegeMatchOutcome, players: [
          { faction: 'rome', controller: scriptedController(run.log) },
          { faction: 'carthage', controller: scriptedController(run.log) },
        ] });
      expect(replay.hash).toBe(run.hash);
    }
  }, 30_000);

  it('removes actual unpaid Squads from a deliberately bankrupted AI Observation', () => {
    const ai = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: economyRegistry });
    const history: SiegeVisible[] = [];
    runMatch({ seed: 7, ticks: HEADLESS_TICKS, observe: observeSiege, outcome: siegeMatchOutcome,
      rules: { ...siegeMatchRules, createWorld(seed) {
        const world = siegeMatchRules.createWorld(seed);
        const settlement = world.economy.settlements[1]!;
        settlement.tier = 3;
        settlement.population = 1;
        settlement.stocks.fill(100);
        applyEconomyCommand(world.economy, { kind: 'recruit', faction: 'carthage', settlement: 1,
          squadType: 'elephant', men: 24, count: 3 });
        settlement.stocks.fill(30);
        world.economy.treasuries[1] = 0;
        return world;
      } },
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>([]) },
        { faction: 'carthage', controller: { decide(observation) {
          if (history.at(-1)?.season !== observation.visible.season) history.push(observation.visible);
          return ai.decide(observation);
        } } }],
    });
    expect(history[0]!.squads.map((squad) => squad.id)).toEqual([1, 2, 3]);
    expect(history.some((visible) => visible.squads.some((squad) => squad.unpaid >= 2))).toBe(true);
    const deserted = [1, 2, 3].filter((id) => !history.at(-1)!.squads.some((squad) => squad.id === id));
    expect(deserted.length).toBeGreaterThan(0);
    expect(ai.readLog().filter((entry) => entry.layer === 'strategic')
      .some((entry) => entry.candidates.some((candidate) => candidate.plan?.posture === 'recovery'))).toBe(true);
  }, 30_000);
});
