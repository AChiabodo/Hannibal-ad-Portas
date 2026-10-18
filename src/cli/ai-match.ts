import { createAi, type AiDecision } from '../ai/controller.ts';
import { createEconomyBehaviour } from '../ai/economy.ts';
import { createBehaviourRegistry, type BehaviourRegistry } from '../ai/registry.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { SQUAD_TYPES } from '../content/squads.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { BASE_HOUSING, GRAIN_PER_HEAD, TAX_PER_DENARIUS } from '../sim/economy.ts';
import type { Command } from '../sim/command.ts';
import { runMatch, type MatchRun } from '../sim/driver.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../sim/siege.ts';

/** A headless AI run retains explanations beside the replayable Command log. */
export interface AiMatchRun extends MatchRun {
  readonly decisions: readonly AiDecision<Command>[];
}

export const economyRegistry = createBehaviourRegistry<SiegeVisible, Command>([
  createEconomyBehaviour({ buildings: BUILDINGS, squadTypes: SQUAD_TYPES,
    grainPerHead: GRAIN_PER_HEAD, baseHousing: BASE_HOUSING, taxPerDenarius: TAX_PER_DENARIUS }),
]);

/**
 * The composition root owns simulation values and concrete types; ai/ owns
 * neither. Behaviours can be composed here without changing the AI registry.
 * D2 installs the economy; callers can still supply an independent registry.
 */
export function playAiMatch(
  seed: number,
  ticks: number,
  registry: BehaviourRegistry<SiegeVisible, Command> = economyRegistry,
): AiMatchRun {
  const rome = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry });
  const carthage = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry });
  const run = runMatch({
    seed, ticks, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
    players: [{ faction: 'rome', controller: rome }, { faction: 'carthage', controller: carthage }],
  });
  // Stable sort preserves strategic → operational → tactical within a Faction.
  const decisions = [...rome.readLog(), ...carthage.readLog()].sort((a, b) =>
    a.tick - b.tick || (a.faction === b.faction ? 0 : a.faction === 'rome' ? -1 : 1));
  return { ...run, decisions };
}
