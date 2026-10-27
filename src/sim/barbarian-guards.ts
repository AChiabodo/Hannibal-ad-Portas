/** A neutral camp's defenders use the ordinary Squad movement and combat rules. */
import { squadTypeCode, squadTypeOf } from '../content/squads.ts';
import { FIELD, isRouting, standingAt } from './squad.ts';
import { engagedWith } from './combat.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './map.ts';
import { orderSquadTo, routeCacheFor } from './movement.ts';
import { canOccupy, occupiedGround, squadGround } from './settlement-space.ts';
import type { Squad } from './economy.ts';
import type { SiegeWorld } from './siege.ts';

/** Not a player Faction and never a valid Command issuer. */
export const BARBARIAN_OWNER = 2;
const GUARD_MEN = 24;
const REINFORCEMENT_TICKS = 600;

/** Create a finite initial field force at each generated camp. */
export function createCampGuards(world: SiegeWorld): void {
  for (const campId of (world.map.barbarianCamps ?? []).keys()) spawnGuard(world, campId);
}

function spawnGuard(world: SiegeWorld, campId: number): void {
  const site = world.map.barbarianCamps?.[campId];
  if (site === undefined) return;
  const code = squadTypeCode('gaul');
  const type = code === undefined ? undefined : squadTypeOf(code);
  if (code === undefined || type === undefined) throw new Error('Barbarian guard needs an infantry type');
  for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [-2, 0], [0, 2], [0, -2]]) {
    const x = site.x + (dx ?? 0), y = site.y + (dy ?? 0);
    const guard: Squad = { ...standingAt(x, y, GUARD_MEN, type.ammunition),
      id: world.economy.nextSquadId, owner: BARBARIAN_OWNER, type: code, capacity: GUARD_MEN,
      home: -1, morale: type.morale, unpaid: 0, barbarianCamp: campId };
    if (!canOccupy(world.map, guard, x, y) || occupiedGround(world.economy, squadGround(guard))) continue;
    world.economy.squads.push(guard);
    world.economy.nextSquadId += 1;
    return;
  }
}

/** Defend the surrounding ground; surviving orphans wander without raiding. */
export function advanceCampGuards(world: SiegeWorld, tick: number): void {
  if (tick > 0 && tick % REINFORCEMENT_TICKS === 0) {
    for (const [campId, camp] of (world.barbarianCamps ?? []).entries()) {
      if (camp.hp <= 0 || world.economy.squads.some((squad) => squad.barbarianCamp === campId)) continue;
      spawnGuard(world, campId);
    }
  }
  const routes = routeCacheFor(world.map);
  for (const guard of world.economy.squads) {
    if (guard.owner !== BARBARIAN_OWNER || guard.barbarianCamp === undefined || isRouting(guard)) continue;
    const home = world.map.barbarianCamps?.[guard.barbarianCamp];
    if (home === undefined) continue;
    const camp = world.barbarianCamps?.[guard.barbarianCamp];
    if (camp === undefined || camp.hp <= 0) {
      if (guard.barbarianRetired === undefined) {
        guard.steps = [];
        guard.wait = 0;
        guard.barbarianRetired = 1;
      }
      if (guard.steps.length === 0 && engagedWith(world.economy, guard) === undefined && tick % 120 === 0) {
        const direction = (guard.id + Math.floor(tick / 120)) % 4;
        const x = Math.max(0, Math.min(MAP_WIDTH - 1, guard.x + (direction === 0 ? 3 : direction === 2 ? -3 : 0)));
        const y = Math.max(0, Math.min(MAP_HEIGHT - 1, guard.y + (direction === 1 ? 3 : direction === 3 ? -3 : 0)));
        orderSquadTo(world.map, guard, { x, y }, routes);
      }
      continue;
    }
    if (tick % 20 !== 0) continue;
    if (engagedWith(world.economy, guard) !== undefined) continue;
    const targets = world.economy.squads.filter((squad) => squad.owner !== BARBARIAN_OWNER && squad.garrison === FIELD &&
      Math.max(Math.abs(squad.x - home.x), Math.abs(squad.y - home.y)) <= 8);
    targets.sort((a, b) => Math.max(Math.abs(a.x - guard.x), Math.abs(a.y - guard.y)) -
      Math.max(Math.abs(b.x - guard.x), Math.abs(b.y - guard.y)) || a.id - b.id);
    const target = targets[0];
    if (target !== undefined) orderSquadTo(world.map, guard, target, routes);
    else if (Math.max(Math.abs(guard.x - home.x), Math.abs(guard.y - home.y)) > 2) orderSquadTo(world.map, guard, home, routes);
  }
}
