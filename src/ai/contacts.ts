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

import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import type { Site } from './site.ts';

/** How long a Squad sighting stays planning evidence, in seconds (D4). */
const SQUAD_CONTACT_SECONDS = 120;

/** How long a settlement sighting stays planning evidence, in seconds (D4). */
const SETTLEMENT_CONTACT_SECONDS = 600;

/** One remembered settlement or enemy Squad: never a live position or current ownership. */
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


/** Merge centre sightings with permitted architectural sightings, never live map identities. */
export function permittedContacts(visible: {
  readonly contacts?: readonly Contact[];
  readonly appearances?: readonly ObservedSettlement[];
  readonly settlements?: readonly { readonly id?: number }[];
}): readonly Contact[] {
  const owned = new Set((visible.settlements ?? []).map((site) => site.id));
  const contacts = new Map((visible.contacts ?? []).filter((contact) => contact.kind === 'squad' || !owned.has(contact.id))
    .map((contact) => [`${contact.kind === 'squad' ? 'unit' : 'site'}:${contact.id}`, contact]));
  for (const appearance of visible.appearances ?? []) {
    if (owned.has(appearance.id)) continue;
    const features = appearance.tiles.filter((tile) => tile.work !== undefined || tile.structure !== undefined || tile.tier !== undefined || tile.ram !== undefined);
    if (features.length === 0) continue;
    const seen = Math.max(...features.map((tile) => tile.seen));
    const key = `site:${appearance.id}`;
    const existing = contacts.get(key);
    if (existing !== undefined && existing.seen >= seen) continue;
    contacts.set(key, { id: appearance.id, kind: appearance.kind, x: appearance.x, y: appearance.y, seen, type: null });
  }
  return [...contacts.values()];
}
