import { describe, expect, it } from 'vitest';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import { playAiMatch } from '../../src/cli/ai-match.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { HEADLESS_TICKS } from '../../src/sim/season.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules } from '../../src/sim/siege.ts';
import { economy } from './behaviours/economy.ts';
import { military } from './behaviours/military.ts';
import { scouting } from './behaviours/scouting.ts';

describe('two AI Controllers in a headless Match', () => {
  it('composes three independently written modules and can replay every emitted Command', () => {
    const registry = createBehaviourRegistry([scouting, military, economy]);
    const run = playAiMatch(7, 301, registry);
    expect(run.log).toHaveLength(4);
    expect(run.log.slice(0, 2)).toEqual([
      { tick: 0, command: { kind: 'build', faction: 'rome', settlement: 0, building: 'granary' } },
      { tick: 0, command: { kind: 'build', faction: 'carthage', settlement: 1, building: 'granary' } },
    ]);
    expect(run.decisions[0]?.selected).toEqual({ behaviour: 'military', id: 'defend' });
    expect(run.decisions[1]?.selected).toEqual({ behaviour: 'economy', id: 'granary' });
    expect(run.decisions[2]?.candidates).toContainEqual({
      behaviour: 'scouting', id: 'explore', utility: -1,
      reason: 'No light Squad has been observed.', commands: [],
    });
    const replay = runMatch({
      seed: 7, ticks: 301, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
      players: [
        { faction: 'rome', controller: scriptedController(run.log) },
        { faction: 'carthage', controller: scriptedController(run.log) },
      ],
    });
    expect(replay.hash).toBe(run.hash);
    expect(playAiMatch(7, 301, createBehaviourRegistry([economy, scouting, military]))).toEqual(run);
  });

  it('survives the full three-year bound with no registered behaviours and records every clock', () => {
    const run = playAiMatch(1, HEADLESS_TICKS);
    expect(run.result).toEqual({ kind: 'clock', tick: 25_200 });
    expect(run.log).toEqual([]);
    expect(run.decisions.filter((entry) => entry.layer === 'strategic')).toHaveLength(24);
    expect(run.decisions.filter((entry) => entry.layer === 'operational')).toHaveLength(168);
    expect(run.decisions.filter((entry) => entry.layer === 'tactical')).toHaveLength(50_400);
    expect(run.decisions.filter((entry) => entry.layer === 'strategic').at(-1)).toMatchObject({
      faction: 'carthage', year: 3, season: 'winter', tick: 23_100,
    });
  }, 30_000);
});
