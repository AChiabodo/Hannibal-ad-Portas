/**
 * The last-known contact memory every planning policy reads, and the age limit
 * that turns a sighting from evidence into history (D4).
 *
 * The memory itself arrives on the Observation — the fog's own contacts, filtered
 * by the rules — but *which* of them are still worth planning against is the AI's
 * decision, and it is one decision. Scouting, the field and the siege all read the
 * same limit here rather than each carrying a copy, so a behaviour module depends
 * on this leaf and never on another behaviour.
 */

import type { Site } from './site.ts';

/** How long a Squad sighting stays planning evidence, in seconds (D4). */
const SQUAD_CONTACT_SECONDS = 120;

/** How long a settlement sighting stays planning evidence, in seconds (D4). */
const SETTLEMENT_CONTACT_SECONDS = 600;

/** One remembered enemy thing, as a planning policy may read it: never a live position. */
export interface Contact extends Site {
  readonly id: number;
  readonly kind: 'squad' | 'settlement' | 'stronghold';
  /** The tick it was last seen on. */
  readonly seen: number;
  /** The type it was last seen as, or `null` for a settlement or an unread roster. */
  readonly type: string | null;
}

/** Stale sightings remain historical fog data, but cease to be planning evidence. */
export function planningContacts(contacts: readonly Contact[], tick: number, ticksPerSecond: number): Contact[] {
  return contacts.filter((contact) => tick >= contact.seen && tick - contact.seen <
    ticksPerSecond * (contact.kind === 'squad' ? SQUAD_CONTACT_SECONDS : SETTLEMENT_CONTACT_SECONDS));
}
