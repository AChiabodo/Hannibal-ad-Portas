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

export interface KnownContact {
  readonly kind: 'squad' | 'settlement' | 'stronghold';
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly seen: number;
  readonly type: string | null;
}

/** Writes knowledge during a tick, never while somebody reads an Observation. */
export function refreshSiegeFog(world: SiegeWorld, tick: number): void {
  for (const faction of FACTIONS) {
    const owner = factionCode(faction);
    const fog = world.fog[faction];
    refreshVision(fog, world.map, eyesOfEconomy(world, faction));
    const sightings: EnemyInSight[] = world.economy.squads
      .filter((squad) => squad.owner !== owner && squad.garrison === FIELD)
      .map((squad) => ({ id: squad.id, kind: SQUAD + squad.type, x: squad.x, y: squad.y }));
    for (const settlement of world.economy.settlements) {
      if (settlement.owner === UNOWNED || settlement.owner === owner) continue;
      sightings.push({ id: -settlement.id - 1,
        kind: world.siege.strongholds.includes(settlement.id) ? STRONGHOLD : SETTLEMENT,
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
  }
}

/** One fog memory, decoded into domain names; no live enemy fact is consulted. */
export function siegeContacts(world: SiegeWorld, faction: Faction): KnownContact[] {
  return world.fog[faction].contacts.map((contact) => ({
    kind: contact.kind === STRONGHOLD ? 'stronghold' : contact.kind === SETTLEMENT ? 'settlement' : 'squad',
    id: contact.id < 0 ? -contact.id - 1 : contact.id,
    x: contact.x, y: contact.y, seen: contact.seen,
    type: contact.kind < SQUAD ? null : squadTypeOf(contact.kind - SQUAD)?.id ?? 'unknown',
  }));
}
