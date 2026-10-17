/**
 * The Observation: everything a Controller is allowed to know (GLOSSARY).
 *
 * An Observation is not Match state and must never become it. It is the state
 * seen through one Faction's eyes — the shape the rules' projection decides —
 * and it is the *only* thing a Controller is handed. There is no path from an
 * Observation back to the Match: the driver copies the projection, and a test
 * in `controller.test.ts` makes reaching past the type a compile error rather
 * than a promise.
 *
 * The fog is not built yet (B4 owns it). Until it lands, `observe` returns
 * whatever the rules say a Faction sees, and this module owns only the seam —
 * the Faction, the tick, and the copy that keeps the Controller off the world.
 * Copying disconnects the Observation from the Match; it does not filter.
 *
 * The projection itself belongs to the rules, because only they know what the
 * world is made of. The driver stamps it with the Faction that is looking and
 * the tick that is being decided, so a rule cannot claim to be another Faction,
 * or to be another tick.
 */
import type { Faction } from './faction.ts';

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
   *
   * This is the driver's copy of what the rules projected, not the object the
   * rules built. The driver deep-copies the projection before a Controller sees
   * it, so writing through `visible` — and through anything inside it — reaches
   * the world and the rules nowhere. A rules author may therefore return a
   * reference to the world, or to part of it, without giving a Controller a way
   * to change it; the copy carries only structured-cloneable plain data, and
   * `driver.ts`'s `decide` says what that rules out. The copy disconnects the
   * Observation from the Match, and filtering what it holds remains the rules'
   * job.
   */
  readonly visible: Visible;
}
