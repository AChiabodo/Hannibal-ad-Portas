/** Explicit attacks against completed economic works. */
import { buildingOf, WORK_MAX_HP } from '../content/buildings.ts';
import { squadTypeOf } from '../content/squads.ts';
import type { GroundRect } from '../content/settlement-layout.ts';
import type { Command } from './command.ts';
import type { Work } from './economy.ts';
import { engagedWith, EXCHANGE_TICKS } from './combat.ts';
import { eyesOfEconomy } from './economy-match.ts';
import { factionCode } from './faction.ts';
import { eyeCovers } from './fog.ts';
import { MAP_HEIGHT, MAP_WIDTH } from './map.ts';
import { orderedSquads, orderSquadTo, routeCacheFor } from './movement.ts';
import { NO_REFUSAL, refusalCode } from './route.ts';
import { blockedTile, workGround, workOrdinal } from './settlement-space.ts';
import type { SiegeWorld } from './siege.ts';
import { FIELD, isRouting } from './squad.ts';

export interface WorkAttackOrder { readonly squad: number; readonly owner: number; readonly settlement: number; readonly work: number }

/** Construction and repair are invulnerable; a ruin cannot be damaged again. */
export function damageWork(work: Work, damage: number): boolean {
  if (work.remaining > 0 || work.repairTicks !== undefined || (work.hp ?? WORK_MAX_HP) <= 0 || damage <= 0) return false;
  work.hp = Math.max(0, (work.hp ?? WORK_MAX_HP) - damage);
  return true;
}

export function workAttackDistance(x: number, y: number, rect: GroundRect): number {
  const dx = Math.max(rect.x - x, 0, x - (rect.x + rect.width - 1));
  const dy = Math.max(rect.y - y, 0, y - (rect.y + rect.height - 1));
  return Math.max(dx, dy);
}

/** A blow cannot pass through walls or other occupied terrain on its way to a work. */
export function clearWorkLine(world: SiegeWorld, owner: number, x: number, y: number, rect: GroundRect): boolean {
  const targetX = Math.max(rect.x, Math.min(x, rect.x + rect.width - 1));
  const targetY = Math.max(rect.y, Math.min(y, rect.y + rect.height - 1));
  const dx = Math.abs(targetX - x), dy = Math.abs(targetY - y);
  const sx = x < targetX ? 1 : -1, sy = y < targetY ? 1 : -1;
  let error = dx - dy;
  while (x !== targetX || y !== targetY) {
    const twice = error * 2;
    if (twice > -dy) { error -= dy; x += sx; }
    if (twice < dx) { error += dx; y += sy; }
    if (x === targetX && y === targetY) break;
    if (blockedTile(world.map, owner, x, y)) return false;
  }
  return true;
}

function observed(world: SiegeWorld, owner: number, rect: GroundRect): boolean {
  const faction = owner === 0 ? 'rome' : 'carthage';
  const eyes = eyesOfEconomy(world, faction);
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      if (eyes.some((eye) => eyeCovers(eye, { x, y }))) return true;
    }
  }
  return false;
}

/** Choose an accessible point around the actual work, not one fixed side. */
function approachWork(world: SiegeWorld, squad: import('./economy.ts').Squad, owner: number, rect: GroundRect): void {
  const candidates: { x: number; y: number }[] = [];
  for (let y = rect.y - 2; y < rect.y + rect.height + 2; y += 1) {
    for (let x = rect.x - 2; x < rect.x + rect.width + 2; x += 1) {
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || workAttackDistance(x, y, rect) === 0 ||
        !clearWorkLine(world, owner, x, y, rect)) continue;
      candidates.push({ x, y });
    }
  }
  candidates.sort((a, b) => Math.abs(a.x - squad.x) + Math.abs(a.y - squad.y) -
    Math.abs(b.x - squad.x) - Math.abs(b.y - squad.y) || a.y - b.y || a.x - b.x);
  const routes = routeCacheFor(world.map);
  if (candidates.length === 0) squad.refused = refusalCode('unreachable');
  for (const candidate of candidates) {
    orderSquadTo(world.map, squad, candidate, routes);
    if (squad.refused === NO_REFUSAL) return;
  }
}

export function orderWorkAttacks(world: SiegeWorld, commands: readonly Command[]): void {
  world.workOrders ??= [];
  for (const command of commands) {
    if ('squads' in command && command.kind !== 'formation' && command.kind !== 'group') {
      const owner = factionCode(command.faction);
      world.workOrders = world.workOrders.filter((order) => order.owner !== owner || !command.squads.includes(order.squad));
    }
    if (command.kind !== 'attackStructure' || command.target.kind !== 'work') continue;
    const target = command.target;
    const owner = factionCode(command.faction);
    const site = world.economy.settlements[target.settlement];
    const index = site?.works.findIndex((work) => buildingOf(work.building)?.id === target.building &&
      workOrdinal(site, work) === target.ordinal) ?? -1;
    const work = site?.works[index];
    const rect = site === undefined ? undefined : workGround(world.economy, site, target.building, target.ordinal);
    const squads = orderedSquads(world.economy, owner, command.squads);
    if (site === undefined || site.owner === owner || work === undefined || work.remaining > 0 ||
      (work.hp ?? WORK_MAX_HP) <= 0 || work.repairTicks !== undefined || rect === undefined || !observed(world, owner, rect)) {
      for (const squad of squads) squad.refused = refusalCode('target-not-visible');
      continue;
    }
    for (const squad of squads) {
      if (squad.garrison !== FIELD) continue;
      if (workAttackDistance(squad.x, squad.y, rect) > 2 || !clearWorkLine(world, owner, squad.x, squad.y, rect)) {
        approachWork(world, squad, owner, rect);
        if (squad.refused !== NO_REFUSAL) continue;
      }
      world.workOrders.push({ squad: squad.id, owner, settlement: site.id, work: index });
    }
  }
}

export function advanceWorkAttacks(world: SiegeWorld, tick: number): void {
  world.workOrders = (world.workOrders ?? []).filter((order) => {
    const site = world.economy.settlements[order.settlement];
    const work = site?.works[order.work];
    const building = work === undefined ? undefined : buildingOf(work.building)?.id;
    const rect = site === undefined || work === undefined || building === undefined ? undefined :
      workGround(world.economy, site, building, workOrdinal(site, work));
    const squad = world.economy.squads.find((item) => item.id === order.squad && item.owner === order.owner);
    if (site === undefined || site.owner === order.owner || work === undefined || work.remaining > 0 ||
      (work.hp ?? WORK_MAX_HP) <= 0 || work.repairTicks !== undefined || rect === undefined || squad === undefined || squad.strength <= 0 ||
      squad.garrison !== FIELD || isRouting(squad) || !observed(world, order.owner, rect)) return false;
    if (engagedWith(world.economy, squad) !== undefined || tick % EXCHANGE_TICKS !== 0) return true;
    const type = squadTypeOf(squad.type);
    const reach = type?.arm === 'archers' ? 4 : 2;
    if (workAttackDistance(squad.x, squad.y, rect) > reach || !clearWorkLine(world, order.owner, squad.x, squad.y, rect)) return true;
    damageWork(work, type?.arm === 'cavalry' ? 2 : 4);
    return (work.hp ?? WORK_MAX_HP) > 0;
  });
}
