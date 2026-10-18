import type { Observation } from '../sim/observation.ts';
import { createBehaviourRegistry, type BehaviourRegistry, type StrategicCandidate, type StrategicPlan } from './registry.ts';

/** The calendar facts an AI reads; the simulation remains the calendar's owner. */
export interface CalendarVisible {
  readonly year: number;
  readonly season: string;
}

export type AiLayer = 'strategic' | 'operational' | 'tactical';

/** A scored alternative, including the Commands a selected alternative emits. */
export interface ScoredCandidate<Command> extends StrategicCandidate<Command> {
  readonly behaviour: string | null;
}

/** One clock's decision, retained independently of the simulation's Command log. */
export interface AiDecision<Command> {
  readonly faction: Observation<unknown>['faction'];
  readonly tick: number;
  readonly year: number;
  readonly season: string;
  readonly layer: AiLayer;
  readonly candidates: readonly ScoredCandidate<Command>[];
  readonly selected: { readonly behaviour: string | null; readonly id: string };
}

/** Structurally a Controller: only Observation crosses in, only Commands cross out. */
export interface AiController<Visible, Command> {
  decide(observation: Observation<Visible>): readonly Command[];
  /** A detached snapshot: inspecting a decision cannot rewrite its history. */
  readLog(): readonly AiDecision<Command>[];
}

/**
 * A fresh Controller per Faction per Match. The composition root supplies the
 * tick rate, so the AI imports no simulation value, clock or world type.
 * Command is a type parameter for the same reason: the driver owns validation.
 */
export function createAi<Visible extends CalendarVisible, Command = never>(
  options: {
    readonly ticksPerSecond: number;
    readonly registry?: BehaviourRegistry<Visible, Command>;
  },
): AiController<Visible, Command> {
  if (!Number.isSafeInteger(options.ticksPerSecond) || options.ticksPerSecond < 1) {
    throw new RangeError('ticksPerSecond must be a positive whole number');
  }
  const log: AiDecision<Command>[] = [];
  const registry = createBehaviourRegistry(options.registry?.behaviours);
  const operationalTicks = options.ticksPerSecond * 30;
  let calendar: { year: number; season: string } | undefined;
  let operationalWindow = -1;
  let plan: StrategicPlan = { posture: null, budget: {}, objective: null };
  let faction: Observation<unknown>['faction'] | undefined;
  let lastTick = -1;

  return {
    decide(observation) {
      if (faction !== undefined && faction !== observation.faction) {
        throw new Error('use a fresh AI Controller for each Faction and Match');
      }
      if (!Number.isSafeInteger(observation.tick) || observation.tick <= lastTick) {
        throw new RangeError('AI decisions require a strictly increasing non-negative tick');
      }
      faction = observation.faction;
      lastTick = observation.tick;
      const layers: AiLayer[] = [];
      const { year, season } = observation.visible;
      if (calendar === undefined || calendar.year !== year || calendar.season !== season) {
        layers.push('strategic');
        calendar = { year, season };
      }
      const window = Math.floor(observation.tick / operationalTicks);
      if (window !== operationalWindow) {
        layers.push('operational');
        operationalWindow = window;
      }
      layers.push('tactical');

      const commands: Command[] = [];
      for (const layer of layers) {
        const candidates: ScoredCandidate<Command>[] = [
          { behaviour: null, id: 'idle', utility: 0,
            reason: 'Keep the current plan and emit no Commands.', commands: [] },
        ];
        for (const behaviour of registry.behaviours) {
          const proposed = behaviour[layer]?.({ observation, plan: structuredClone(plan) }) ?? [];
          const ids = new Set<string>();
          for (const candidate of [...proposed].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
            const name = `${behaviour.id}/${candidate.id} on ${layer}`;
            if (candidate.id.trim() === '' || ids.has(candidate.id)) {
              throw new Error(`${name}: candidate id must be nonempty and unique`);
            }
            if (!Number.isSafeInteger(candidate.utility)) {
              throw new Error(`${name}: utility must be a signed safe integer`);
            }
            if (candidate.reason.trim() === '') throw new Error(`${name}: a reason is required`);
            ids.add(candidate.id);
            candidates.push(structuredClone({ ...candidate, behaviour: behaviour.id }));
          }
        }
        // First wins a tie: idle at zero, then behaviour id and candidate id.
        let selected = candidates[0]!;
        for (const candidate of candidates) {
          if (candidate.utility > selected.utility) selected = candidate;
        }
        if (layer === 'strategic' && selected.plan !== undefined) {
          plan = structuredClone(selected.plan);
        }
        log.push({
          faction: observation.faction, tick: observation.tick,
          year: observation.visible.year, season: observation.visible.season, layer,
          candidates,
          selected: { behaviour: selected.behaviour, id: selected.id },
        });
        commands.push(...structuredClone(selected.commands));
      }
      return commands;
    },
    readLog: () => structuredClone(log),
  };
}
