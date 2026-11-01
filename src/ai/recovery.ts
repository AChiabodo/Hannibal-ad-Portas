import { distance, type Site } from './site.ts';

/** Paid recovery is slow: do not restart a campaign as soon as morale clears half. */
export function restingAtHome(squad: Site & { readonly morale: number; readonly inCamp?: boolean; readonly inQuarters?: boolean }, homes: readonly Site[],
  nominalMorale: number): boolean {
  return squad.morale < nominalMorale && (squad.inQuarters ?? squad.inCamp ?? homes.some((home) => distance(home, squad) === 0));
}


/** Physical return orders name a gate waypoint before the final sheltered place. */
export function returningHome(squad: {
  readonly goal: Site | null;
  readonly inQuarters?: boolean;
  readonly passage?: { readonly settlement: number; readonly phase: string; readonly purpose?: 'garrison' | 'field' };
}, homes: readonly (Site & { readonly id?: number })[]): boolean {
  // Wall admission is still under way after the body's centre reaches the
  // quarters. A temporary end to the siege must not let Hold cancel assembly.
  if (squad.passage !== undefined && squad.passage.phase !== 'leaving' &&
    (squad.passage.purpose === 'garrison' || squad.inQuarters !== true) &&
    homes.some((home) => home.id === squad.passage!.settlement)) return true;
  return squad.goal !== null && homes.some((home) => distance(home, squad.goal!) === 0);
}
