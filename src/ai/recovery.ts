import { distance, type Site } from './site.ts';

/** Paid recovery is slow: do not restart a campaign as soon as morale clears half. */
export function restingAtHome(squad: Site & { readonly morale: number; readonly inCamp?: boolean }, homes: readonly Site[],
  nominalMorale: number): boolean {
  return squad.morale < nominalMorale && (squad.inCamp ?? homes.some((home) => distance(home, squad) === 0));
}
