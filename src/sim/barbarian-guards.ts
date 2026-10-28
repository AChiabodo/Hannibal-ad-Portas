/** A neutral camp's defenders use the ordinary Squad movement and combat rules. */
import { squadTypeCode, squadTypeOf } from '../content/squads.ts';
import { intersects } from '../content/settlement-layout.ts';
import { buildingOf, WORK_MAX_HP } from '../content/buildings.ts';
import { FIELD, isRouting, standingAt } from './squad.ts';
import { engagedWith, enemyWithin } from './combat.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './map.ts';
import { orderSquadTo, routeCacheFor } from './movement.ts';
import { canOccupy, coreOf, occupiedGround, squadGround, workGround, workOrdinal } from './settlement-space.ts';
import type { Squad } from './economy.ts';
import { clearWorkLine, damageWork, workAttackDistance } from './work-combat.ts';
import { damageFortification, defendAgainstBarbarian, siegePosition, STRUCTURE, type SiegeWorld } from './siege.ts';
import { insideCore, outsideCore, perimeterDistance } from './settlement-siege-geometry.ts';

/** Not a player Faction and never a valid Command issuer. */
export const BARBARIAN_OWNER = 2;
export type BarbarianDifficulty = 'tiro' | 'centurio' | 'imperator';
export const BARBARIAN_RAID_PERIOD: Readonly<Record<BarbarianDifficulty, number>> = {
  tiro: 1800, centurio: 1200, imperator: 600,
};
const GUARD_MEN = 24;
const REINFORCEMENT_TICKS = 600;
const RAID_RADIUS = 24;
const RAID_DURATION = 400;

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
  for (const front of world.siege.fronts) {
    if (front.barbarianAssault !== 1) continue;
    const site = world.economy.settlements[front.settlement];
    const active = site !== undefined && world.economy.squads.some((squad) => squad.owner === BARBARIAN_OWNER &&
      squad.barbarianRaidTarget === site.id && tick < (squad.barbarianRaidUntil ?? 0) && !isRouting(squad) &&
      squad.strength > 0 && perimeterDistance(world.economy, site, squad) <= 2);
    if (!active) delete front.barbarianAssault;
  }
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
        delete guard.barbarianRaidTarget;
        delete guard.barbarianRaidUntil;
      }
      // Orphans never seek a fight: stop before wandering into another Squad.
      // If an enemy closes into contact the normal combat rules let them defend.
      if (enemyWithin(world.economy, guard, 5) !== undefined) {
        guard.steps = [];
        guard.wait = 0;
        continue;
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
    const period = world.barbarianRaidPeriod ?? BARBARIAN_RAID_PERIOD.centurio;
    if (tick > 0 && tick % period === 0) {
      const sites = world.economy.settlements.filter((site) => (site.owner === 0 || site.owner === 1) &&
        Math.max(Math.abs(site.x - home.x), Math.abs(site.y - home.y)) <= RAID_RADIUS);
      sites.sort((a, b) => Math.max(Math.abs(a.x - home.x), Math.abs(a.y - home.y)) -
        Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y)) || a.id - b.id);
      if (sites[0] !== undefined) {
        guard.barbarianRaidTarget = sites[0].id;
        guard.barbarianRaidUntil = tick + RAID_DURATION;
      }
    }
    if (engagedWith(world.economy, guard) !== undefined) continue;
    const targets = world.economy.squads.filter((squad) => squad.owner !== BARBARIAN_OWNER && squad.garrison === FIELD &&
      Math.max(Math.abs(squad.x - home.x), Math.abs(squad.y - home.y)) <= 8);
    targets.sort((a, b) => Math.max(Math.abs(a.x - guard.x), Math.abs(a.y - guard.y)) -
      Math.max(Math.abs(b.x - guard.x), Math.abs(b.y - guard.y)) || a.id - b.id);
    const target = targets[0];
    if (target !== undefined) { orderSquadTo(world.map, guard, target, routes); continue; }
    const settlement = guard.barbarianRaidTarget === undefined ? undefined : world.economy.settlements[guard.barbarianRaidTarget];
    if (settlement !== undefined && tick < (guard.barbarianRaidUntil ?? 0) &&
      (settlement.owner === 0 || settlement.owner === 1)) {
      const core = coreOf(world.economy, settlement);
      const front = world.siege.fronts[settlement.id];
      const fortified = front !== undefined && front.structures.length > 0 &&
        front.structures.every((structure) => structure.hp > 0);
      if (front?.barbarianAssault === 1 && insideCore(world.economy, settlement, guard)) {
        defendAgainstBarbarian(world, settlement.id, guard, tick);
        if (guard.strength <= 0 || isRouting(guard)) continue;
      }
      const works = settlement.works.flatMap((work) => {
        const name = buildingOf(work.building)?.id;
        if (name === undefined || work.remaining > 0 || work.repairTicks !== undefined || (work.hp ?? WORK_MAX_HP) <= 0) return [];
        const rect = workGround(world.economy, settlement, name, workOrdinal(settlement, work));
        return rect === undefined || fortified && intersects(core, rect) ? [] : [{ work, rect }];
      });
      works.sort((a, b) => workAttackDistance(guard.x, guard.y, a.rect) - workAttackDistance(guard.x, guard.y, b.rect));
      const targetWork = works[0];
      if (targetWork !== undefined) {
        const { work, rect } = targetWork;
        if (workAttackDistance(guard.x, guard.y, rect) <= 2 && clearWorkLine(world, guard.owner, guard.x, guard.y, rect)) {
          damageWork(work, 4);
        } else {
          const x = guard.x < rect.x ? rect.x - 2 : guard.x >= rect.x + rect.width ? rect.x + rect.width + 1 : guard.x;
          const y = guard.y < rect.y ? rect.y - 2 : guard.y >= rect.y + rect.height ? rect.y + rect.height + 1 : guard.y;
          orderSquadTo(world.map, guard, { x, y }, routes);
        }
        continue;
      }
      if (front !== undefined && front.structures.length > 0 && fortified) {
        if (outsideCore(world.economy, settlement, guard) && perimeterDistance(world.economy, settlement, guard) <= 1) {
          const dx = guard.x - settlement.x, dy = guard.y - settlement.y;
          const side = Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 1 : 3 : dy >= 0 ? 2 : 0;
          const gate = front.structures.find((structure) => structure.kind === STRUCTURE.gate && structure.side === side);
          const aligned = side % 2 === 0 ? Math.abs(dx) <= 2 : Math.abs(dy) <= 2;
          const piece = gate !== undefined && aligned ? gate :
            front.structures.find((structure) => structure.kind === STRUCTURE.wall && structure.side === side);
          if (piece !== undefined) {
            front.barbarianAssault = 1;
            damageFortification(piece, 3);
            defendAgainstBarbarian(world, settlement.id, guard, tick);
          }
        } else {
          const target = siegePosition(world, settlement, guard, []);
          if (target !== undefined) orderSquadTo(world.map, guard, target, routes);
        }
        continue;
      }
      const x = Math.max(core.x - 1, Math.min(core.x + core.width, home.x));
      const y = Math.max(core.y - 1, Math.min(core.y + core.height, home.y));
      orderSquadTo(world.map, guard, { x, y }, routes);
    } else {
      delete guard.barbarianRaidTarget;
      delete guard.barbarianRaidUntil;
      if (Math.max(Math.abs(guard.x - home.x), Math.abs(guard.y - home.y)) > 2) orderSquadTo(world.map, guard, home, routes);
    }
  }
}
