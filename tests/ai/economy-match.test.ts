import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import { economyRegistry } from '../../src/cli/ai-match.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Command } from '../../src/sim/command.ts';
import { scriptedController, type Player } from '../../src/sim/controller.ts';
import { applyEconomyCommand } from '../../src/sim/economy.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { HEADLESS_TICKS } from '../../src/sim/season.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';

describe('an unopposed economy across three Years', () => {
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
