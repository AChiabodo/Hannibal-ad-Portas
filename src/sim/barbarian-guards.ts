/** A neutral camp's defenders use the ordinary Squad movement and combat rules. */
import { squadTypeCode, squadTypeOf } from '../content/squads.ts';
import { standingAt } from './squad.ts';
import type { SiegeWorld } from './siege.ts';

/** Not a player Faction and never a valid Command issuer. */
export const BARBARIAN_OWNER = 2;
const GUARD_MEN = 24;

/** Create a finite initial field force at each generated camp. */
export function createCampGuards(world: SiegeWorld): void {
  const code = squadTypeCode('gaul');
  const type = code === undefined ? undefined : squadTypeOf(code);
  if (code === undefined || type === undefined) throw new Error('Barbarian guard needs an infantry type');
  for (const [campId, site] of (world.map.barbarianCamps ?? []).entries()) {
    world.economy.squads.push({ ...standingAt(site.x, site.y, GUARD_MEN, type.ammunition),
      id: world.economy.nextSquadId++, owner: BARBARIAN_OWNER, type: code, capacity: GUARD_MEN,
      home: -1, morale: type.morale, unpaid: 0, barbarianCamp: campId });
  }
}
