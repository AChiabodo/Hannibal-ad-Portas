import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import { bodyPerimeterDistance, type FormationSite, type Site } from './site.ts';
import { recordedGarrison, type Contact } from './contacts.ts';
import type { Observation } from '../sim/observation.ts';

type Faction = Observation<unknown>['faction'];

/** Only the visible siege work and known location needed to price its remaining shock. */
export interface AssaultObservation {
  readonly appearances?: readonly ObservedSettlement[];
  readonly contacts?: readonly (Site & { readonly id: number; readonly kind: Contact['kind'] })[];
  readonly fronts?: readonly {
    readonly settlement: number;
    readonly breached?: boolean;
    readonly garrison?: number;
    readonly garrisonMen?: number;
    readonly garrisonCapacity?: number;
    readonly structures?: readonly unknown[];
    readonly garrisonKnown?: boolean;
    readonly besieger: Faction | null;
    readonly siege?: 'assault' | 'blockade' | null;
    readonly ram: { readonly hp?: number; readonly built: boolean; readonly remaining?: number } | null;
  }[];
}

/** Shared by field recovery and siege allocation, so the two agree about readiness. */
export type AssaultReadiness = (faction: Faction, visible: AssaultObservation,
  squad: FormationSite & { readonly morale: number }) => boolean;

/** A paid ram can shelter an existing ring before its surviving men break. */
export function createAssaultReadiness(content: {
  readonly squadTypes?: readonly { readonly id: string; readonly figures?: number }[];
  readonly siegeRadius: number; readonly settlementRadius?: number; readonly assaultTicks: number; readonly wallShock: number;
}): AssaultReadiness {
  return (faction, visible, squad) => (visible.fronts ?? []).some((front) => {
    if (front.besieger !== faction || front.siege !== 'assault') return false;
    const target = visible.contacts?.find((contact) => contact.id === front.settlement &&
      (contact.kind === 'stronghold' || contact.kind === 'settlement')) ??
      visible.appearances?.find((site) => site.id === front.settlement && site.tiles.some((tile) => tile.structure !== undefined));
    if (target === undefined || bodyPerimeterDistance(squad, target, content.settlementRadius ?? 0, content.squadTypes?.find((type) => type.id === squad.type)?.figures === 1 ? 1 : squad.capacity) > content.siegeRadius) return false;
    // The known open, empty ring no longer charges wall shock: finish the
    // capture approach rather than withdrawing because a hidden ram is unread.
    const appearance = visible.appearances?.find((site) => site.id === front.settlement);
    const empty = front.garrisonKnown === false ? recordedGarrison(appearance) === false : front.garrison === 0;
    if ((front.breached === true || visible.appearances?.some((site) => site.id === front.settlement &&
      site.tiles.some((tile) => tile.structure?.condition === 'breached'))) && empty && squad.engaged !== true) return squad.morale > 0;
    if (front.ram === null || (front.ram.hp ?? 0) <= 0) return false;
    const remaining = front.ram.built ? 0 : front.ram.remaining;
    if (remaining === undefined) return false;
    // The round that completes construction is already sheltered; only earlier
    // rounds cost morale. Neither a future purchase nor a hidden defender is assumed.
    const exposedRounds = Math.max(0, Math.ceil(remaining / content.assaultTicks) - 1);
    return squad.morale > exposedRounds * content.wallShock;
  });
}
