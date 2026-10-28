/** Owner-ordered repairs of completed economic works. */
import { buildingOf, WORK_MAX_HP, workRepairCost } from '../content/buildings.ts';
import { pay } from '../content/resources.ts';
import type { WorkRepairCommand } from './command.ts';
import { allocate, landCapacity } from './economy.ts';
import { factionCode } from './faction.ts';
import { workOrdinal } from './settlement-space.ts';
import type { SiegeWorld } from './siege.ts';

export function orderWorkRepair(world: SiegeWorld, command: WorkRepairCommand): boolean {
  const site = world.economy.settlements[command.settlement];
  if (site === undefined || site.owner !== factionCode(command.faction)) return false;
  const work = site.works.find((item) => buildingOf(item.building)?.id === command.building && workOrdinal(site, item) === command.ordinal);
  if (work === undefined) return false;
  if (command.kind === 'cancelWorkRepair') {
    if (work.repairTicks === undefined && work.repairRequest === undefined) return false;
    delete work.repairTicks; delete work.repairOrder; delete work.repairOwner; delete work.repairRequest;
    return true;
  }
  if (world.siege.fronts[site.id]?.path !== 0 || work.remaining > 0 || work.repairTicks !== undefined ||
    work.repairRequest !== undefined || (work.hp ?? WORK_MAX_HP) >= WORK_MAX_HP) return false;
  work.repairRequest = world.economy.nextPendingId ?? 1;
  world.economy.nextPendingId = work.repairRequest + 1;
  work.repairOwner = site.owner;
  startWorkRepairRequests(world);
  return true;
}

/** Requests stay unpaid and vulnerable until affordable and outside a Siege. */
export function startWorkRepairRequests(world: SiegeWorld): void {
  for (const site of world.economy.settlements) {
    for (const work of [...site.works].sort((a, b) => (a.repairRequest ?? Infinity) - (b.repairRequest ?? Infinity))) {
      if (work.repairRequest === undefined) continue;
      if (work.repairOwner !== site.owner) { delete work.repairRequest; delete work.repairOwner; continue; }
      if (world.siege.fronts[site.id]?.path !== 0) continue;
      const building = buildingOf(work.building);
      if (building === undefined || work.remaining > 0 || (work.hp ?? WORK_MAX_HP) >= WORK_MAX_HP) {
        delete work.repairRequest; delete work.repairOwner; continue;
      }
      const payment = pay(site.stocks, workRepairCost(building, work.hp ?? WORK_MAX_HP));
      if (!payment.affordable) continue;
      site.stocks.splice(0, site.stocks.length, ...payment.remaining);
      work.repairTicks = Math.max(1, (WORK_MAX_HP - (work.hp ?? WORK_MAX_HP)) * 3);
      work.repairOrder = work.repairRequest;
      delete work.repairRequest;
    }
  }
}

export function advanceWorkRepairs(world: SiegeWorld): void {
  for (const site of world.economy.settlements) {
    const staffed = allocate(site, landCapacity(world.map, site)).repairs ?? [];
    for (const work of site.works) {
      if (work.repairTicks === undefined) continue;
      if (work.repairOwner !== site.owner) { delete work.repairTicks; delete work.repairOrder; delete work.repairOwner; continue; }
      if (!staffed.includes(work.repairOrder ?? 0)) continue;
      work.repairTicks -= 1;
      if (work.repairTicks > 0) continue;
      work.hp = WORK_MAX_HP;
      delete work.repairTicks; delete work.repairOrder; delete work.repairOwner;
    }
  }
}
