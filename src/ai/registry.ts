import type { Observation } from '../sim/observation.ts';

/**
 * Which behaviour authored which Commands, when more than one contributed to a
 * candidate. A contribution may be empty: the behaviour took part but every
 * order it authored was superseded by another's.
 */
export interface Contribution<Command> {
  readonly behaviour: string;
  readonly commands: readonly Command[];
}

/** One proposed alternative; a signed whole utility and a reason explain its value. */
export interface Candidate<Command> {
  readonly id: string;
  readonly utility: number;
  readonly reason: string;
  readonly commands: readonly Command[];
  /**
   * Who authored these Commands, when the composition root merged more than one
   * behaviour into this candidate. A behaviour that stands alone leaves it unset
   * and the Controller names it; the log always carries the attribution either way.
   */
  readonly contributions?: readonly Contribution<Command>[];
}

/** AI memory, never Match state. Its meaning belongs to the registered behaviours. */
export interface StrategicPlan {
  readonly posture: string | null;
  readonly budget: Readonly<Record<string, number>>;
  readonly objective: string | null;
}

export interface StrategicCandidate<Command> extends Candidate<Command> {
  /** Replaces the plan only if this strategic candidate is selected. */
  readonly plan?: StrategicPlan;
}

export interface BehaviourContext<Visible> {
  readonly observation: Observation<Visible>;
  readonly plan: StrategicPlan;
}

type Propose<Visible, Command> = (context: BehaviourContext<Visible>) => readonly Candidate<Command>[];

/**
 * Economy, military and scouting each export one of these from their own module.
 * Registration needs no edit to this file or the Controller. A missing hook
 * contributes nothing on that clock; an empty list is equally valid.
 */
export interface Behaviour<Visible, Command> {
  readonly id: string;
  readonly strategic?: (context: BehaviourContext<Visible>) => readonly StrategicCandidate<Command>[];
  readonly operational?: Propose<Visible, Command>;
  readonly tactical?: Propose<Visible, Command>;
}

/** Immutable registration, reusable by fresh Controllers in independent Matches. */
export interface BehaviourRegistry<Visible, Command> {
  readonly behaviours: readonly Behaviour<Visible, Command>[];
}

/** IDs define tie order, independently of the order modules were registered. */
export function createBehaviourRegistry<Visible, Command>(
  behaviours: readonly Behaviour<Visible, Command>[] = [],
): BehaviourRegistry<Visible, Command> {
  const sorted = behaviours.map((behaviour) => Object.freeze({ ...behaviour }))
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const ids = new Set<string>();
  for (const behaviour of sorted) {
    if (behaviour.id.trim() === '' || ids.has(behaviour.id)) {
      throw new Error(`behaviour id must be nonempty and unique: ${behaviour.id}`);
    }
    ids.add(behaviour.id);
  }
  return Object.freeze({ behaviours: Object.freeze(sorted) });
}
