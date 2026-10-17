/**
 * The Observation: everything a Controller is allowed to know (GLOSSARY).
 *
 * An Observation is not Match state and must never become it. It is the state
 * seen through one Faction's eyes — its own Squads, its own settlements, the
 * enemy only where it last saw them, the ground only where it has been — and it
 * is the *only* thing a Controller is handed. A Controller that wants to know
 * something the Faction does not know cannot reach for it: there is no path
 * from an Observation back to the Match, and a test in `controller.test.ts`
 * makes that a compile error rather than a promise.
 *
 * The projection itself belongs to the rules, because only they know what the
 * world is made of. The driver stamps the projection with the Faction that is
 * looking and the tick that is being decided, so a rule cannot claim to be
 * another Faction, or to be another tick (B4 owns the filtering).
 */
import type { Faction } from './faction';

/** Who is looking, and what they are allowed to see. */
export interface Observation<Visible> {
  /** The Faction this Observation was filtered for. */
  readonly faction: Faction;
  /** The tick it is stamped with: the tick being decided, before it is stepped. */
  readonly tick: number;
  /**
   * The world as this Faction may see it.
   *
   * `Visible` is the rules' own projection type: the smaller, filtered shape a
   * Controller reads instead of the world. What is not in it, a Controller
   * cannot ask for.
   */
  readonly visible: Visible;
}
