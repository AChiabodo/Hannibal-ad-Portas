import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import { distance, type Site } from './site.ts';
import type { Contact } from './contacts.ts';
import type { Observation } from '../sim/observation.ts';

type Faction = Observation<unknown>['faction'];

/** Only the visible siege work and known location needed to price its remaining shock. */
export interface AssaultObservation {
  readonly appearances?: readonly ObservedSettlement[];
  readonly contacts?: readonly (Site & { readonly id: number; readonly kind: Contact['kind'] })[];
  readonly fronts?: readonly {
    readonly settlement: number;
    readonly besieger: Faction | null;
    readonly siege?: 'assault' | 'blockade' | null;
    readonly ram: { readonly hp?: number; readonly built: boolean; readonly remaining?: number } | null;
  }[];
}

/** Shared by field recovery and siege allocation, so the two agree about readiness. */
export type AssaultReadiness = (faction: Faction, visible: AssaultObservation,
  squad: Site & { readonly morale: number }) => boolean;

/** A paid ram can shelter an existing ring before its surviving men break. */
export function createAssaultReadiness(content: {
  readonly siegeRadius: number; readonly settlementRadius?: number; readonly assaultTicks: number; readonly wallShock: number;
}): AssaultReadiness {
  return (faction, visible, squad) => (visible.fronts ?? []).some((front) => {
    if (front.besieger !== faction || front.siege !== 'assault' || front.ram === null ||
      (front.ram.hp ?? 0) <= 0) return false;
    const target = visible.contacts?.find((contact) => contact.id === front.settlement &&
      (contact.kind === 'stronghold' || contact.kind === 'settlement')) ??
      visible.appearances?.find((site) => site.id === front.settlement && site.tiles.some((tile) => tile.structure !== undefined));
    if (target === undefined || Math.max(0, distance(squad, target) - (content.settlementRadius ?? 0)) > content.siegeRadius) return false;
    const remaining = front.ram.built ? 0 : front.ram.remaining;
    if (remaining === undefined) return false;
    // The round that completes construction is already sheltered; only earlier
    // rounds cost morale. Neither a future purchase nor a hidden defender is assumed.
    const exposedRounds = Math.max(0, Math.ceil(remaining / content.assaultTicks) - 1);
    return squad.morale > exposedRounds * content.wallShock;
  });
}
