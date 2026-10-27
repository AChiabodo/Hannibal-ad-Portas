import { rememberSettlements } from './settlement-knowledge.ts';
import { squadTypeOf } from '../content/squads.ts';
import { eyesOfEconomy } from './economy-match.ts';
import { FACTIONS, factionCode, type Faction } from './faction.ts';
import { forgetContacts, observeContacts, refreshVision, type EnemyInSight } from './fog.ts';
import type { SiegeWorld } from './siege.ts';
import { FIELD } from './squad.ts';
import { UNOWNED } from './economy.ts';
import { MAP_WIDTH } from './map.ts';

/** Settlement ids are negative in the fog, so they never collide with Squad ids. */
const SETTLEMENT = 0;
const STRONGHOLD = 1;
const SQUAD = 2;

/**
 * What a remembered sighting is: an open settlement, held or unowned, or
 * a Stronghold, or a Squad with the type index it was last seen as.
 *
 * The fog's memory holds one integer per contact (ADR-0006), so a contact's kind
 * is a typed value here and `contactCode`/`contactKind` are the only two places
 * the category and the type index are packed or read. A reader never does the
 * arithmetic that tells a Stronghold from a Squad.
 */
export type ContactKind =
  | { readonly kind: 'settlement' | 'stronghold' }
  | { readonly kind: 'squad'; readonly type: number };

/** The integer the fog's memory holds for a contact kind. */
export function contactCode(kind: ContactKind): number {
  if (kind.kind === 'squad') return SQUAD + kind.type;
  return kind.kind === 'stronghold' ? STRONGHOLD : SETTLEMENT;
}

/** The typed kind a remembered contact's integer stands for. */
export function contactKind(code: number): ContactKind {
  if (code === SETTLEMENT) return { kind: 'settlement' };
  if (code === STRONGHOLD) return { kind: 'stronghold' };
  return { kind: 'squad', type: code - SQUAD };
}

export interface KnownContact {
  readonly kind: 'squad' | 'settlement' | 'stronghold';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly seen: number;
  readonly type: string | null;
  /** A village nobody holds, confirmed by current vision only; never a hidden ownership report. */
  readonly unowned?: true;
}

/** Writes knowledge during a tick, never while somebody reads an Observation. */
export function refreshSiegeFog(world: SiegeWorld, tick: number): void {
  for (const faction of FACTIONS) {
    const owner = factionCode(faction);
    const fog = world.fog[faction];
    refreshVision(fog, world.map, eyesOfEconomy(world, faction));
    for (const [id, camp] of (world.map.barbarianCamps ?? []).entries()) {
      if (fog.visible[camp.y * MAP_WIDTH + camp.x] !== 1) continue;
      const camps = fog.barbarianCamps ??= [];
      if (!camps.some((known) => known.id === id)) {
        camps.push({ id, ...camp });
        camps.sort((a, b) => a.id - b.id);
      }
    }
    const sightings: EnemyInSight[] = world.economy.squads
      .filter((squad) => squad.owner !== owner && squad.garrison === FIELD)
      .map((squad) => ({ id: squad.id, kind: contactCode({ kind: 'squad', type: squad.type }),
        x: squad.x, y: squad.y }));
    for (const settlement of world.economy.settlements) {
      if (settlement.owner === owner) continue;
      sightings.push({ id: -settlement.id - 1,
        kind: contactCode({ kind: world.siege.strongholds.includes(settlement.id) ? 'stronghold' : 'settlement' }),
        x: settlement.x, y: settlement.y });
    }
    // Looking at an empty last-known tile disproves the contact. Hidden death,
    // movement or capture alone must never erase another Faction's memory.
    const current = new Map(sightings.map((sighting) => [sighting.id, sighting]));
    forgetContacts(fog, fog.contacts.filter((contact) => {
      if (fog.visible[contact.y * MAP_WIDTH + contact.x] !== 1) return false;
      const now = current.get(contact.id);
      return now === undefined || now.x !== contact.x || now.y !== contact.y;
    }).map((contact) => contact.id));
    observeContacts(fog, sightings, tick);
    rememberSettlements(world, fog, tick);
  }
}

/** One fog memory, decoded into domain names; no live enemy fact is consulted. */
export function siegeContacts(world: SiegeWorld, faction: Faction): KnownContact[] {
  return world.fog[faction].contacts.map((contact) => {
    const kind = contactKind(contact.kind);
    const id = contact.id < 0 ? -contact.id - 1 : contact.id;
    return {
      kind: kind.kind,
      id,
      x: contact.x, y: contact.y, seen: contact.seen,
      type: kind.kind === 'squad' ? squadTypeOf(kind.type)?.id ?? 'unknown' : null,
      ...(kind.kind === 'settlement' && world.fog[faction].visible[contact.y * MAP_WIDTH + contact.x] === 1 &&
        world.economy.settlements[id]?.owner === UNOWNED ? { unowned: true as const } : {}),
    };
  });
}
