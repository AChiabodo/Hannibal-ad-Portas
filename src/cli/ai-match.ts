import { createAi, bestCandidate, type AiController, type AiDecision } from '../ai/controller.ts';
import { createEconomyBehaviour } from '../ai/economy.ts';
import { createMilitaryBehaviour, createMilitaryRecruitment } from '../ai/military.ts';
import { createScoutingBehaviour } from '../ai/scouting.ts';
import { createSiegeBehaviour } from '../ai/siege.ts';
import { createBehaviourRegistry, type Behaviour, type BehaviourContext, type BehaviourRegistry,
  type Candidate, type Contribution } from '../ai/registry.ts';
import { DIFFICULTY, type Difficulty, type DifficultyName } from '../ai/difficulty.ts';
import { BUILDINGS } from '../content/buildings.ts';
import { MATCHUP } from '../content/arms.ts';
import { payrollBill, recruitCost, SQUAD_TYPES } from '../content/squads.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { BASE_HOUSING, BASE_STORAGE, GRAIN_PER_HEAD, TAX_PER_DENARIUS } from '../sim/economy.ts';
import type { Command } from '../sim/command.ts';
import { runMatch, type MatchRun } from '../sim/driver.ts';
import { RELIEF_RADIUS, RAM_COST, SIEGE_RADIUS, canAssault, observeSiege, siegeMatchOutcome, siegeMatchRules,
  type SiegeVisible } from '../sim/siege.ts';
import { FATIGUE_MAX } from '../sim/squad.ts';
import { MAP_WIDTH, MAP_HEIGHT, TERRAIN } from '../sim/map.ts';
import { SQUAD_VISION, UNSEEN } from '../sim/fog.ts';
import { ticksUntilSeason } from '../sim/season.ts';

/** A headless AI run retains explanations beside the replayable Command log. */
export interface AiMatchRun extends MatchRun {
  readonly decisions: readonly AiDecision<Command>[];
}

const economyContent = { buildings: BUILDINGS, squadTypes: SQUAD_TYPES,
  recruitCost, payrollBill,
  grainPerHead: GRAIN_PER_HEAD, baseHousing: BASE_HOUSING, baseStorage: BASE_STORAGE, taxPerDenarius: TAX_PER_DENARIUS,
  ticksUntilPayroll: ticksUntilSeason };
const militaryContent = { squadTypes: SQUAD_TYPES, matchup: MATCHUP, fatigueMax: FATIGUE_MAX, ticksPerSecond: TICK_HZ };
const scoutingContent = { width: MAP_WIDTH, height: MAP_HEIGHT, unseen: UNSEEN, water: TERRAIN.river,
  vision: SQUAD_VISION, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES,
  scoutTypes: ['hastati', 'gaul', 'numidian-horse'] };
// One garrison is worth the strongest Tier-1 Squad a Faction can raise, since an
// unseen front reports how many Squads man it and not which. Since #66 "strongest"
// is men brought to bear (strength × impact) as well as nerve, so the estimate is
// in the same units as the rest of a Controller's power.
const garrisonEstimate = Math.max(...SQUAD_TYPES.filter((type) => type.tier === 1)
  .map((type) => type.strength * type.impact * type.morale));
const siegeContent = { canAssault, ramCost: RAM_COST, siegeRadius: SIEGE_RADIUS, reliefRadius: RELIEF_RADIUS,
  garrisonEstimate, ticksPerSecond: TICK_HZ, squadTypes: SQUAD_TYPES };

/** Economy alone at one difficulty: what `economyRegistry` is to Centurio. */
export function economyRegistryAt(difficulty: Difficulty = DIFFICULTY.centurio):
BehaviourRegistry<SiegeVisible, Command> {
  return createBehaviourRegistry<SiegeVisible, Command>([
    createEconomyBehaviour(economyContent, difficulty),
  ]);
}

/** Economy and the field army at one difficulty: the economy owns the operational clock. */
export function militaryRegistryAt(difficulty: Difficulty = DIFFICULTY.centurio):
BehaviourRegistry<SiegeVisible, Command> {
  return createBehaviourRegistry<SiegeVisible, Command>([
    createEconomyBehaviour({ ...economyContent,
      recruitmentPreference: createMilitaryRecruitment(militaryContent) }, difficulty),
    createMilitaryBehaviour(militaryContent, difficulty),
  ]);
}

/**
 * The composition root owns simulation values and concrete types; `ai/` owns
 * neither. D4 composed economy, military and scouting; D5 adds the siege and the
 * difficulty level. A siege owns the Squads it commits, so a `hold` from the
 * field cannot stand down a Squad already at the walls; patrols and the field
 * share what is left. `militaryRegistry` and `economyRegistry` remain available
 * for isolated scenarios, and `scoutingRegistry` is the D4 army without a siege.
 */
export function difficultyRegistry(name: DifficultyName = 'centurio'): BehaviourRegistry<SiegeVisible, Command> {
  return armyAt(DIFFICULTY[name], true);
}

/** Economy, field, patrols and — when asked — the siege, at one difficulty. */
function armyAt(difficulty: Difficulty, withSiege: boolean): BehaviourRegistry<SiegeVisible, Command> {
  const economy = createEconomyBehaviour({ ...economyContent,
    recruitmentPreference: createMilitaryRecruitment(militaryContent) }, difficulty);
  const military = createMilitaryBehaviour(militaryContent, difficulty);
  const scouting = createScoutingBehaviour(scoutingContent, difficulty);
  const siege = createSiegeBehaviour(siegeContent, difficulty);

  const fieldOf = (context: BehaviourContext<SiegeVisible>) => bestCandidate(military.tactical!(context));

  /** One candidate the scouting behaviour proposed: a march, and the reason for it. */
  type Patrol = ReturnType<NonNullable<typeof scouting.tactical>>[number];

  /**
   * The patrols planned for one Observation, worked out once.
   *
   * The scouting behaviour is asked twice in a tick — once as a behaviour in its
   * own right, and once again by whoever is sharing out the Squads that are left
   * — and what it answers is a function of the Observation and nothing else. The
   * answer is expensive in a way the other behaviours' are not: it walks the
   * whole theatre looking for ground nobody has seen, per light Squad, on every
   * tick. Asking it once per Observation and handing both callers the same plan is
   * therefore worth the four lines, and it changes no decision: the second answer
   * would have been the first answer.
   *
   * Keyed by the Observation itself, so nothing is cached across a tick: the
   * driver builds a fresh one for each Player each tick, which makes "the same
   * Observation" mean "the same question", and a `WeakMap` means the answers go
   * away with the Observations they were for (E3 found this: a Match spent most of
   * its time planning patrols that had already been planned).
   */
  const patrolsPlanned = new WeakMap<object, readonly Patrol[]>();

  const patrolsOf = (context: BehaviourContext<SiegeVisible>): readonly Patrol[] => {
    const cached = patrolsPlanned.get(context.observation);
    if (cached !== undefined) return cached;

    const planned = scouting.tactical!(context);
    patrolsPlanned.set(context.observation, planned);

    return planned;
  };

  /** The flat batch a candidate emits, in contribution order. */
  const commandsOf = (contributions: readonly Contribution<Command>[]): readonly Command[] =>
    contributions.flatMap((contribution) => contribution.commands);

  /**
   * The field's orders for the Squads it keeps, then patrols on what is left
   * over, each attributed to the behaviour that authored it. A `hold` yields to
   * a patrol so one Squad is not told both to stand and to march, and a Squad in
   * `exclusions` belongs to neither. A contribution may name a behaviour whose
   * every order was superseded: it took part, and says so with no Commands.
   */
  function share<C extends Command & { readonly squads: readonly number[] }>(
    context: BehaviourContext<SiegeVisible>,
    field: Candidate<C> | undefined,
    exclusions: ReadonlySet<number>,
  ): readonly Contribution<Command>[] {
    const held = (field?.commands ?? []).flatMap((command) => {
      const squads = command.squads.filter((id) => !exclusions.has(id));
      return squads.length === 0 ? [] : [{ ...command, squads }];
    });
    const owned = new Set(held.filter((command) => command.kind !== 'hold').flatMap((command) => command.squads));
    const blocked = new Set([...exclusions, ...owned]);
    const patrols = patrolsOf(context).flatMap((candidate) => candidate.commands)
      .filter((command) => !command.squads.some((id) => blocked.has(id)));
    const scouts = new Set(patrols.flatMap((command) => command.squads));
    return [
      { behaviour: military.id, commands: held.filter((command) =>
        command.kind !== 'hold' || !command.squads.some((id) => scouts.has(id))) },
      { behaviour: scouting.id, commands: patrols },
    ];
  }

  /** The D4 army: the field's orders, with patrols on the Squads the field left, each named. */
  const scoutingBehaviour: Behaviour<SiegeVisible, Command> = { ...scouting, tactical: (context) => {
    const field = fieldOf(context);
    const contributions = share(context, field, new Set());
    return patrolsOf(context).map((candidate) => ({ ...candidate,
      reason: `${candidate.reason} ${field?.reason ?? ''}`.trim(),
      commands: commandsOf(contributions), contributions }));
  } };

  /** The D5 army: the siege owns its Squads, and the field owns the rest. */
  const siegeBehaviour: Behaviour<SiegeVisible, Command> = { ...siege, tactical: (context) => {
    const field = fieldOf(context);
    // Recovery owns both a new withdrawal and the march it leaves on later
    // ticks. Remove those Squads before the siege evaluates its available power.
    const withdrawn = new Set(field?.commands.filter((command) => command.kind === 'withdraw')
      .flatMap((command) => command.squads) ?? []);
    const { visible } = context.observation;
    const squads = visible.squads.filter((squad) => !withdrawn.has(squad.id) &&
      !(squad.goal !== null && visible.settlements.some((site) =>
        site.x === squad.goal!.x && site.y === squad.goal!.y)));
    const proposed = siege.tactical!({ ...context, observation: { ...context.observation,
      visible: { ...visible, squads } } });
    if (proposed.length === 0) return [];
    const committed = new Set(proposed.flatMap((candidate) => candidate.commands)
      .flatMap((command) => command.squads));
    const shared = share(context, field, committed);
    return proposed.map((candidate) => {
      const contributions: readonly Contribution<Command>[] = [
        { behaviour: siege.id, commands: candidate.commands }, ...shared,
      ];
      return { ...candidate,
        reason: `${candidate.reason} ${field?.reason ?? ''}`.trim(),
        commands: commandsOf(contributions), contributions };
    });
  } };

  const behaviours: Behaviour<SiegeVisible, Command>[] = [economy, military, scoutingBehaviour];
  if (withSiege) behaviours.push(siegeBehaviour);
  return createBehaviourRegistry<SiegeVisible, Command>(behaviours);
}

/**
 * The shipped registries, at the level D2, D3 and D4 shipped them (Centurio).
 * `economyRegistry` and `militaryRegistry` remain available for isolated
 * scenarios; `scoutingRegistry` is the D4 field and its patrols, without a
 * siege; `armyRegistry` is the complete D5 army.
 */
export const economyRegistry = economyRegistryAt(DIFFICULTY.centurio);
export const militaryRegistry = militaryRegistryAt(DIFFICULTY.centurio);
export const scoutingRegistry = armyAt(DIFFICULTY.centurio, false);
export const armyRegistry = difficultyRegistry('centurio');

/**
 * One fresh AI on the complete Siege Match: the opponent an external agent is
 * matched against when it is not playing alone (E1).
 *
 * A Match with an outside process on one side is still a Match with two Players,
 * and this is the one the harness puts on the other side. It shares the registry
 * with any other Controller of the same Match, exactly as `playAiMatch` does.
 */
export function createArmyController(
  name: DifficultyName = 'centurio',
  registry: BehaviourRegistry<SiegeVisible, Command> = difficultyRegistry(name),
): AiController<SiegeVisible, Command> {
  const difficulty = DIFFICULTY[name];

  return createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
    operationalSeconds: difficulty.reactionSeconds, registry });
}

/**
 * Two fresh AIs against the complete Siege Match, at a stated difficulty. The
 * difficulty reaches only the behaviours and the Controller's operational clock;
 * the rules are the same Match at every level.
 */
export function playAiMatch(
  seed: number,
  ticks: number,
  registry: BehaviourRegistry<SiegeVisible, Command> = armyRegistry,
  difficulty: Difficulty = DIFFICULTY.centurio,
): AiMatchRun {
  const rome = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
    operationalSeconds: difficulty.reactionSeconds, registry });
  const carthage = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ,
    operationalSeconds: difficulty.reactionSeconds, registry });
  const run = runMatch({
    seed, ticks, rules: siegeMatchRules, observe: observeSiege, outcome: siegeMatchOutcome,
    players: [{ faction: 'rome', controller: rome }, { faction: 'carthage', controller: carthage }],
  });
  // Stable sort preserves strategic → operational → tactical within a Faction.
  const decisions = [...rome.readLog(), ...carthage.readLog()].sort((a, b) =>
    a.tick - b.tick || (a.faction === b.faction ? 0 : a.faction === 'rome' ? -1 : 1));
  return { ...run, decisions };
}

/** A Match played at one named difficulty, with the registry that level builds. */
export function playAiMatchAt(seed: number, ticks: number, name: DifficultyName = 'centurio'): AiMatchRun {
  return playAiMatch(seed, ticks, difficultyRegistry(name), DIFFICULTY[name]);
}
