import { describe, expect, it } from 'vitest';
import { createAi } from '../../src/ai/controller.ts';
import type { Season } from '../../src/ai/calendar.ts';
import { DIFFICULTY, attackPercent, type Difficulty } from '../../src/ai/difficulty.ts';
import { createBehaviourRegistry } from '../../src/ai/registry.ts';
import { armyRegistry } from '../../src/cli/ai-match.ts';
import type { Command } from '../../src/sim/command.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import type { Observation } from '../../src/sim/observation.ts';

function operationalTicks(reactionSeconds: number): number[] {
  const ai = createAi<{ year: number; season: Season }, never>({
    ticksPerSecond: 10, operationalSeconds: reactionSeconds, registry: createBehaviourRegistry([]),
  });
  const ticks: number[] = [];
  for (let tick = 0; tick <= reactionSeconds * 10 + 1; tick += 1) {
    const observation: Observation<{ year: number; season: Season }> = {
      faction: 'rome', tick, visible: { year: 1, season: 'spring' },
    };
    ai.decide(observation);
    if (ai.readLog().some((entry) => entry.tick === tick && entry.layer === 'operational') && tick !== 0) {
      ticks.push(tick);
    }
  }
  return ticks;
}

describe('the three difficulty levels', () => {
  it('names Tiro, Centurio and Imperator and differs on all four axes', () => {
    const levels = [DIFFICULTY.tiro, DIFFICULTY.centurio, DIFFICULTY.imperator];
    expect(levels.map((level) => level.name)).toEqual(['tiro', 'centurio', 'imperator']);
    for (const axis of ['reactionSeconds', 'aggression', 'horizonSeasons', 'scoutsPer', 'scoutsPerFound',
      'refreshSeconds'] as const) {
      expect(new Set(levels.map((level) => level[axis])).size).toBe(3);
    }
  });

  it('keeps Centurio exactly on the numbers D2, D3 and D4 shipped', () => {
    // The `4/5` the field shipped with, a two-Season payroll reserve, and the
    // three-Season grain floor `food * 3`: changing any of them silently is a
    // balance change to the default AI, not a difficulty knob.
    expect(attackPercent(DIFFICULTY.centurio)).toBe(125);
    expect(DIFFICULTY.centurio.horizonSeasons).toBe(2);
    expect(DIFFICULTY.centurio.reactionSeconds).toBe(30);
    expect([DIFFICULTY.centurio.scoutsPer, DIFFICULTY.centurio.scoutsPerFound,
      DIFFICULTY.centurio.refreshSeconds]).toEqual([3, 8, 30]);
  });

  it('decides operational windows on the level reaction time, and Centurio is the default', () => {
    expect(operationalTicks(DIFFICULTY.centurio.reactionSeconds)).toEqual([300]);
    expect(operationalTicks(DIFFICULTY.imperator.reactionSeconds)).toEqual([150]);
    expect(operationalTicks(DIFFICULTY.tiro.reactionSeconds)).toEqual([600]);
  });

  it('carries decision knobs only: there is nowhere for a resource or vision bonus to hide', () => {
    const axes = ['aggression', 'horizonSeasons', 'name', 'openingScouts', 'reactionSeconds', 'refreshSeconds',
      'scoutsPer', 'scoutsPerFound'];
    for (const level of Object.values(DIFFICULTY)) {
      expect(Object.keys(level).sort()).toEqual(axes);
    }
  });

  it('hands every level the same rule-filtered Observation', () => {
    const seen: SiegeVisible[] = [];
    for (const [index, level] of (['tiro', 'centurio', 'imperator'] as const).entries()) {
      const ai = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
        operationalSeconds: DIFFICULTY[level].reactionSeconds, registry: armyRegistry });
      runMatch({ seed: 1, ticks: 1, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
        players: [{ faction: 'rome', controller: { decide(observation) {
          seen[index] = structuredClone(observation.visible);
          return ai.decide(observation);
        } } }, { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
      });
    }
    expect(seen[0]).toEqual(seen[1]);
    expect(seen[1]).toEqual(seen[2]);
  }, 20000);

  it('makes a more aggressive general accept a slimmer margin, and never a weaker one', () => {
    expect(attackPercent(DIFFICULTY.tiro)).toBeGreaterThan(attackPercent(DIFFICULTY.centurio));
    expect(attackPercent(DIFFICULTY.centurio)).toBeGreaterThan(attackPercent(DIFFICULTY.imperator));
    for (const level of Object.values(DIFFICULTY) as Difficulty[]) {
      expect(attackPercent(level)).toBeGreaterThanOrEqual(100);
      expect(Number.isSafeInteger(attackPercent(level))).toBe(true);
    }
  });
});
