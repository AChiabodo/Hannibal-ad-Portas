/** Unpaid orders and atomic start/payment, shared by every Controller (#74). */
import { buildingOf, NOTHING, pay, recruitCost, squadTypeOf, times, type ResourceAmounts } from '../content/index.ts';
import { containsTile, intersects, settlementLayout } from '../content/settlement-layout.ts';
import type { Economy, PendingOrder, Settlement, Squad } from './economy.ts';
import { invalidateSpace, occupiedGround, settlementSide, siteRect, squadGround, workGround } from './settlement-space.ts';
import { standingAt } from './squad.ts';

export function enqueueOrder(economy: Economy, order: Omit<PendingOrder, 'id' | 'reason'>): void {
  const id = economy.nextPendingId ?? 1;
  economy.nextPendingId = id + 1;
  (economy.pending ??= []).push({ ...order, id, reason: 1 });
  advancePendingOrders(economy);
}

export function pendingOrderCost(order: PendingOrder): ResourceAmounts {
  if (order.kind === 0) return buildingOf(order.content)?.cost ?? NOTHING;
  const type = squadTypeOf(order.content);
  return type === undefined ? NOTHING : times(recruitCost(type, order.men), order.count);
}

/** Stable arrival order, no charges or mutations for a request which still waits. */
export function advancePendingOrders(economy: Economy): void {
  const kept: PendingOrder[] = [];
  for (const order of economy.pending ?? []) {
    const site = economy.settlements[order.settlement];
    if (site === undefined || site.owner !== order.owner) continue;
    if (!startOrder(economy, site, order)) kept.push(order);
  }
  economy.pending = kept;
}

function startOrder(economy: Economy, site: Settlement, order: PendingOrder): boolean {
  const building = order.kind === 0 ? buildingOf(order.content) : undefined;
  const type = order.kind === 1 ? squadTypeOf(order.content) : undefined;
  if (type !== undefined) return startRecruitment(economy, site, order);
  if (building === undefined) return true;
  const cost = pendingOrderCost(order);
  const payment = pay(site.stocks, cost);
  if (!payment.affordable) { order.reason = 2; return false; }
  const lot = workGround(economy, site, building.id, order.ordinal);
  if (lot === undefined) return true;
  if (occupiedGround(economy, lot)) { order.reason = 1; return false; }
  site.stocks.splice(0, site.stocks.length, ...payment.remaining);
  const queueOrder = site.repairOrders === undefined ? undefined : economy.nextPendingId ?? 1;
  if (queueOrder !== undefined) economy.nextPendingId = queueOrder + 1;
  site.works.push({ building: order.content, remaining: building.buildTicks, ordinal: order.ordinal, origin: order.owner,
    ...(queueOrder === undefined ? {} : { queueOrder }) });
  invalidateSpace(economy);
  return true;
}

/** Each purchased Squad remains atomic; a batch can leave its unpaid remainder queued. */
function startRecruitment(economy: Economy, site: Settlement, order: PendingOrder): boolean {
  while (order.count > 0) {
    const single = { ...order, count: 1 };
    const payment = pay(site.stocks, pendingOrderCost(single));
    if (!payment.affordable) { order.reason = 2; return false; }
    const raised = musterPositions(economy, site, single);
    if (raised.length === 0) { order.reason = 1; return false; }
    site.stocks.splice(0, site.stocks.length, ...payment.remaining);
    economy.squads.push(...raised);
    economy.nextSquadId += 1;
    order.count -= 1;
  }
  return true;
}

function musterPositions(economy: Economy, site: Settlement, order: PendingOrder): Squad[] {
  const type = squadTypeOf(order.content);
  if (type === undefined) return [];
  const area = siteRect(economy, site, settlementLayout(site.id < 2 ? 'stronghold' : 'settlement').muster);
  const result: Squad[] = [];
  for (let y = area.y; y < area.y + area.height; y += 1) {
    for (let x = area.x; x < area.x + area.width; x += 1) {
      const squad: Squad = { ...standingAt(x, y, order.men, type.ammunition),
        facing: settlementSide(economy, site), id: economy.nextSquadId + result.length,
        owner: order.owner as 0 | 1, type: order.content, capacity: order.men, home: site.id,
        morale: type.morale, unpaid: 0 };
      const ground = squadGround(squad);
      if (!containsTile(area, ground.x, ground.y) ||
        !containsTile(area, ground.x + ground.width - 1, ground.y + ground.height - 1)) continue;
      if (occupiedGround(economy, ground) || result.some((other) => intersects(ground, squadGround(other)))) continue;
      result.push(squad);
      if (result.length === order.count) return result;
    }
  }
  return result;
}
