import { createAi, type AiDecision } from '../ai/controller.ts';
import { createEconomyBehaviour } from '../ai/economy.ts';
import { createMilitaryBehaviour, createMilitaryRecruitment } from '../ai/military.ts';
import { createScoutingBehaviour } from '../ai/scouting.ts';
import { createBehaviourRegistry, type BehaviourRegistry } from '../ai/registry.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { MATCHUP } from '../content/arms.ts';
import { SQUAD_TYPES } from '../content/squads.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { BASE_HOUSING, GRAIN_PER_HEAD, TAX_PER_DENARIUS } from '../sim/economy.ts';
import type { Command } from '../sim/command.ts';
import { runMatch, type MatchRun } from '../sim/driver.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../sim/siege.ts';
import { FATIGUE_MAX } from '../sim/squad.ts';
import { MAP_WIDTH, MAP_HEIGHT, TERRAIN } from '../sim/map.ts';
import { SQUAD_VISION, UNSEEN } from '../sim/fog.ts';

/** A headless AI run retains explanations beside the replayable Command log. */
export interface AiMatchRun extends MatchRun {
  readonly decisions: readonly AiDecision<Command>[];
}

export const economyRegistry = createBehaviourRegistry<SiegeVisible, Command>([
  createEconomyBehaviour({ buildings: BUILDINGS, squadTypes: SQUAD_TYPES,
    grainPerHead: GRAIN_PER_HEAD, baseHousing: BASE_HOUSING, taxPerDenarius: TAX_PER_DENARIUS }),
]);

const militaryContent = { squadTypes: SQUAD_TYPES, matchup: MATCHUP, fatigueMax: FATIGUE_MAX, ticksPerSecond: TICK_HZ };

export const militaryRegistry = createBehaviourRegistry<SiegeVisible, Command>([
  createEconomyBehaviour({ buildings: BUILDINGS, squadTypes: SQUAD_TYPES,
    grainPerHead: GRAIN_PER_HEAD, baseHousing: BASE_HOUSING, taxPerDenarius: TAX_PER_DENARIUS,
    recruitmentPreference: createMilitaryRecruitment(militaryContent) }),
  createMilitaryBehaviour(militaryContent),
]);

const scouting = createScoutingBehaviour({ width: MAP_WIDTH, height: MAP_HEIGHT,
  unseen: UNSEEN, water: TERRAIN.river, vision: SQUAD_VISION, ticksPerSecond: TICK_HZ,
  squadTypes: SQUAD_TYPES, scoutTypes: ['hastati', 'gaul', 'numidian-horse'] });
const military = createMilitaryBehaviour(militaryContent);

/** Military attacks and withdrawals take precedence; idle holds release the scouts. */
export const scoutingRegistry = createBehaviourRegistry<SiegeVisible, Command>([
  ...militaryRegistry.behaviours,
  { ...scouting, tactical(context) {
    const proposed = scouting.tactical!(context);
    const field = military.tactical!(context).reduce((best, candidate) => candidate.utility > best.utility ? candidate : best);
    return proposed.map((candidate) => {
      const occupied = new Set(field.commands.filter((command) => command.kind !== 'hold')
        .flatMap((command) => command.squads));
      const patrols = candidate.commands.filter((command) => !command.squads.some((id) => occupied.has(id)));
      const scouts = new Set(patrols.flatMap((command) => command.squads));
      return { ...candidate, reason: `${candidate.reason} ${field.reason}`,
        commands: [...field.commands.filter((command) => command.kind !== 'hold' || !command.squads.some((id) => scouts.has(id))), ...patrols] };
    });
  } },
]);

/**
 * The composition root owns simulation values and concrete types; ai/ owns
 * neither. Behaviours can be composed here without changing the AI registry.
 * D4 composes economy, military and scouting; callers may supply an independent registry.
 */
export function playAiMatch(
  seed: number,
  ticks: number,
  registry: BehaviourRegistry<SiegeVisible, Command> = scoutingRegistry,
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
