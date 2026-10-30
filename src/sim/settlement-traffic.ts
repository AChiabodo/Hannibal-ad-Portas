/** One authoritative FIFO per physical opening, shared by field and wall-duty journeys. */
import { containsTile, intersects, type GroundRect } from '../content/settlement-layout.ts';
import { squadTypeOf } from '../content/squads.ts';
import type { Economy, Squad } from './economy.ts';
import { tileX, tileY, type MapGrid, type Terrain } from './map.ts';
import { canOccupy, coreOf, nearAccess, occupiedGround, physicalAccesses, squadGround, type PhysicalAccess } from './settlement-space.ts';
import { FIELD } from './squad.ts';
import { NO_REFUSAL, paceCost } from './route.ts';

function same(one: NonNullable<Squad['access']>, other: NonNullable<Squad['access']>): boolean {
  return one.settlement === other.settlement && one.passage === other.passage;
}

function onRoute(squad: Squad, access: PhysicalAccess): boolean {
  return squad.steps.some((tile) => containsTile(access.rect, tileX(tile), tileY(tile)));
}

/** A bridge is claimed by the earliest predicted arrival; ties use ticket order. */
function before(other: Squad, squad: Squad, access: PhysicalAccess, map: MapGrid): boolean {
  const one = other.access;
  const two = squad.access;
  if (one === undefined || two === undefined || !same(one, two)) return false;
  if (access.settlement !== -1) return one.active === 1 || one.ticket < two.ticket || (one.ticket === two.ticket && other.id < squad.id);
  if (one.active !== two.active) return one.active === 1;
  if (one.active === 1) return one.ticket < two.ticket || (one.ticket === two.ticket && other.id < squad.id);
  const arrival = (body: Squad): number => {
    const index = body.steps.findIndex((tile) => containsTile(access.rect, tileX(tile), tileY(tile)));
    if (index < 0) return Number.POSITIVE_INFINITY;
    const pace = squadTypeOf(body.type)?.pace ?? 1;
    return body.wait + body.steps.slice(1, index + 1).reduce((sum, tile) =>
      sum + paceCost(map.terrain[tile] as Terrain, pace), 0);
  };
  const theirs = arrival(other), ours = arrival(squad);
  return theirs < ours || (theirs === ours && (one.ticket < two.ticket || (one.ticket === two.ticket && other.id < squad.id)));
}

/** The column faces each actual leg, including its first rotation in place. */
function routeBodies(squad: Squad): readonly GroundRect[] {
  const result: GroundRect[] = [];
  let x = squad.x;
  let y = squad.y;
  for (const tile of squad.steps) {
    const nx = tileX(tile);
    const ny = tileY(tile);
    const facing = ny < y ? 0 : nx > x ? 1 : ny > y ? 2 : 3;
    result.push(squadGround(squad, x, y, 1, facing), squadGround(squad, nx, ny, 1, facing));
    x = nx;
    y = ny;
  }
  return result;
}

/** Registration precedes any movement, making simultaneous arrivals stable by Squad id. */
export function prepareTraffic(economy: Economy, map: MapGrid, send: (squad: Squad, target: { x: number; y: number }) => void): void {
  for (const squad of [...economy.squads].sort((a, b) => a.id - b.id)) {
    const accesses = physicalAccesses(map, squad.owner);
    const current = squad.access;
    if (current !== undefined) {
      const access = accesses.find((at) => at.settlement === current.settlement && at.passage === current.passage);
      // A completed field order is no longer an admission in progress, even
      // when the column's tail touches the Gate. Keeping its ticket makes the
      // Controller wait forever for a journey which has already arrived.
      const arrived = current.settlement >= 0 && current.yielding === 0 && squad.steps.length === 0 && squad.garrisonJourney === undefined;
      if (access === undefined || arrived || (squad.garrisonJourney?.phase !== 1 && current.yielding === 0 && !onRoute(squad, access) && !intersects(squadGround(squad), access.rect) &&
        (!nearAccess(squadGround(squad), access) || squad.steps.length === 0))) delete squad.access;
    }
    if (squad.access !== undefined || squad.garrison !== FIELD) continue;
    const admission = squad.garrisonJourney?.phase === 1 && squad.garrisonJourney.fromOutside === 1;
    const access = accesses.find((at) => nearAccess(squadGround(squad), at) &&
      (onRoute(squad, at) || (admission && at.settlement === squad.garrisonJourney?.settlement && at.passage === 0) ||
        squad.steps.length > 0 && economy.squads.some((other) => other.id !== squad.id && other.owner === squad.owner &&
          other.access?.settlement === at.settlement && other.access.passage === at.passage &&
          routeBodies(other).some((rect) => intersects(rect, squadGround(squad))))));
    if (access === undefined) continue;
    const ticket = squad.garrisonJourney?.ticket || (economy.nextAccessTicket ?? 1);
    economy.nextAccessTicket = Math.max(economy.nextAccessTicket ?? 1, ticket + 1);
    const goal = squad.steps.at(-1);
    squad.access = { settlement: access.settlement, passage: access.passage, ticket, active: 0, reason: 0,
      yielding: 0, goalX: goal === undefined ? squad.x : tileX(goal), goalY: goal === undefined ? squad.y : tileY(goal) };
  }
  for (const squad of economy.squads) {
    const waiting = squad.access;
    if (waiting === undefined || waiting.active === 1) continue;
    const passage = physicalAccesses(map, squad.owner).find((at) => at.settlement === waiting.settlement && at.passage === waiting.passage);
    const leader = passage === undefined ? undefined : economy.squads.find((other) => other.id !== squad.id &&
      (waiting.settlement !== -1 || other.owner === squad.owner) && before(other, squad, passage, map));
    if (waiting.yielding !== 0) {
      if (squad.steps.length === 0) {
        if (leader === undefined) {
          waiting.yielding = 0;
          send(squad, { x: waiting.goalX, y: waiting.goalY });
        } else waiting.yielding = 2;
      }
      continue;
    }
    if (leader === undefined) continue;
    const lane = routeBodies(leader);
    if (!lane.some((rect) => intersects(rect, squadGround(squad)))) continue;
    const access = physicalAccesses(map, squad.owner).find((at) => at.settlement === waiting.settlement && at.passage === waiting.passage);
    if (access === undefined) continue;
    const shifts = [-4, 4, -8, 8, -12, 12].flatMap((offset) => access.settlement === -1 ? [
      { x: offset, y: 0 }, { x: 0, y: offset },
    ] : [
      { x: access.rect.width === 3 ? offset : 0, y: access.rect.height === 3 ? offset : 0 },
      { x: access.rect.height === 3 ? offset : 0, y: access.rect.width === 3 ? offset : 0 },
    ]);
    for (const shift of shifts) {
      const x = squad.x + shift.x;
      const y = squad.y + shift.y;
      const rect = squadGround(squad, x, y);
      if (!canOccupy(map, squad, x, y) || occupiedGround(economy, rect, squad.id) || lane.some((body) => intersects(body, rect))) continue;
      waiting.yielding = 1;
      send(squad, { x, y });
      if (squad.refused !== NO_REFUSAL) { waiting.yielding = 0; continue; }
      break;
    }
  }
}

/** A waiting body stays where it is, exposed if fielded, until its lane and next space are free. */
export function trafficStep(economy: Economy, map: MapGrid, squad: Squad, x: number, y: number, formation: number, facing: number): boolean {
  const access = squad.access;
  const rect = squadGround(squad, x, y, formation, facing);
  if (access !== undefined) {
    const passage = physicalAccesses(map, squad.owner).find((at) => at.settlement === access.settlement && at.passage === access.passage);
    const older = (passage !== undefined && economy.squads.some((other) => other.id !== squad.id &&
      (access.settlement !== -1 || other.owner === squad.owner) && before(other, squad, passage, map))) ||
      (access.passage === 0 && economy.squads.some((other) => {
        const journey = other.garrisonJourney;
        if (other.id === squad.id || journey?.settlement !== access.settlement || journey.ticket <= 0 || journey.ticket >= access.ticket ||
          (journey.phase !== 1 && journey.phase !== 3)) return false;
        const site = economy.settlements[access.settlement];
        // A field body already inside must be allowed to vacate the assembly
        // space on which the protected departure is waiting.
        if (journey.phase === 3 && other.garrison !== FIELD && site !== undefined &&
          containsTile(coreOf(economy, site), squad.x, squad.y)) return false;
        return true;
      }));
    if (older && access.active === 0 && access.yielding !== 1) { access.reason = 1; return false; }
    if (access.settlement === -1 && access.active === 0 && access.yielding === 0) {
      const bridge = physicalAccesses(map, squad.owner).find((at) => at.settlement === -1 && at.passage === access.passage);
      if (bridge !== undefined && intersects(rect, bridge.rect) && !bridgeExitClear(economy, squad, bridge)) {
        access.reason = 2;
        return false;
      }
    }
  }
  const changed = squadGround(squad, squad.x, squad.y, formation, facing);
  const nearby = physicalAccesses(map, squad.owner).some((at) => nearAccess(rect, at));
  if (nearby && economy.squads.some((other) => other.id !== squad.id && other.garrison === FIELD &&
    (intersects(rect, squadGround(other)) || intersects(changed, squadGround(other))))) {
    if (access !== undefined) access.reason = 2;
    return false;
  }
  if (access !== undefined) {
    const bridge = access.settlement === -1 ? physicalAccesses(map, squad.owner).find((at) => at.settlement === -1 && at.passage === access.passage) : undefined;
    if (access.yielding === 0 && (access.settlement !== -1 || (bridge !== undefined && intersects(rect, bridge.rect)))) access.active = 1;
    access.reason = access.yielding === 0 ? 0 : 1;
  }
  return true;
}

/** A stationary friendly body must leave the bridge and its far landing clear. */
function bridgeExitClear(economy: Economy, squad: Squad, bridge: PhysicalAccess): boolean {
  let x = squad.x, y = squad.y, entered = false;
  for (const tile of squad.steps) {
    const nx = tileX(tile), ny = tileY(tile);
    const facing = ny < y ? 0 : nx > x ? 1 : ny > y ? 2 : 3;
    const rect = squadGround(squad, nx, ny, 1, facing);
    const crossing = intersects(rect, bridge.rect);
    if (crossing) entered = true;
    if (entered && economy.squads.some((other) => other.id !== squad.id && other.owner === squad.owner &&
      other.garrison === FIELD && other.steps.length === 0 && intersects(rect, squadGround(other)))) return false;
    if (entered && !crossing) return true;
    x = nx; y = ny;
  }
  return true;
}
