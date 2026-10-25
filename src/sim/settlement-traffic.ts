/** One authoritative FIFO per physical opening, shared by field and wall-duty journeys. */
import { containsTile, intersects, type GroundRect } from '../content/settlement-layout.ts';
import type { Economy, Squad } from './economy.ts';
import { tileX, tileY, type MapGrid } from './map.ts';
import { canOccupy, coreOf, occupiedGround, physicalAccesses, squadGround, type PhysicalAccess } from './settlement-space.ts';
import { FIELD } from './squad.ts';
import { NO_REFUSAL } from './route.ts';

function same(one: NonNullable<Squad['access']>, other: NonNullable<Squad['access']>): boolean {
  return one.settlement === other.settlement && one.passage === other.passage;
}

function near(rect: GroundRect, access: PhysicalAccess): boolean {
  return intersects(rect, { x: access.rect.x - 10, y: access.rect.y - 10, width: access.rect.width + 20, height: access.rect.height + 20 });
}

function onRoute(squad: Squad, access: PhysicalAccess): boolean {
  return squad.steps.some((tile) => containsTile(access.rect, tileX(tile), tileY(tile)));
}

/** Registration precedes any movement, making simultaneous arrivals stable by Squad id. */
export function prepareTraffic(economy: Economy, map: MapGrid, send: (squad: Squad, target: { x: number; y: number }) => void): void {
  for (const squad of [...economy.squads].sort((a, b) => a.id - b.id)) {
    const accesses = physicalAccesses(map, squad.owner);
    const current = squad.access;
    if (current !== undefined) {
      const access = accesses.find((at) => at.settlement === current.settlement && at.passage === current.passage);
      if (access === undefined || (squad.garrisonJourney?.phase !== 1 && current.yielding === 0 && !onRoute(squad, access) && !intersects(squadGround(squad), access.rect) &&
        (!near(squadGround(squad), access) || squad.steps.length === 0))) delete squad.access;
    }
    if (squad.access !== undefined || squad.garrison !== FIELD) continue;
    const admission = squad.garrisonJourney?.phase === 1 && squad.garrisonJourney.fromOutside === 1;
    const access = accesses.find((at) => near(squadGround(squad), at) &&
      (onRoute(squad, at) || (admission && at.settlement === squad.garrisonJourney?.settlement && at.passage === 0)));
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
    const leader = economy.squads.find((other) => other.id !== squad.id && other.access !== undefined && same(waiting, other.access) &&
      (other.access.active === 1 || other.access.ticket < waiting.ticket));
    if (waiting.yielding !== 0) {
      if (squad.steps.length === 0) {
        if (leader === undefined) {
          waiting.yielding = 0;
          send(squad, { x: waiting.goalX, y: waiting.goalY });
        } else waiting.yielding = 2;
      }
      continue;
    }
    if (leader === undefined || !leader.steps.some((tile) => intersects(squadGround(leader, tileX(tile), tileY(tile), 1), squadGround(squad)))) continue;
    const access = physicalAccesses(map, squad.owner).find((at) => at.settlement === waiting.settlement && at.passage === waiting.passage);
    if (access === undefined) continue;
    for (const offset of [-4, 4, -8, 8]) {
      const x = squad.x + (access.rect.width === 3 ? offset : 0);
      const y = squad.y + (access.rect.height === 3 ? offset : 0);
      const rect = squadGround(squad, x, y, 1);
      if (!canOccupy(map, squad, x, y, 1) || occupiedGround(economy, rect, squad.id)) continue;
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
  if (access !== undefined) {
    const older = economy.squads.some((other) => other.id !== squad.id && other.access !== undefined && same(access, other.access) &&
      (other.access.active === 1 || other.access.ticket < access.ticket || (other.access.ticket === access.ticket && other.id < squad.id))) ||
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
  }
  const rect = squadGround(squad, x, y, formation, facing);
  const changed = squadGround(squad, squad.x, squad.y, formation, facing);
  const nearby = physicalAccesses(map, squad.owner).some((at) => near(rect, at));
  if (nearby && economy.squads.some((other) => other.id !== squad.id && other.garrison === FIELD &&
    (intersects(rect, squadGround(other)) || intersects(changed, squadGround(other))))) {
    if (access !== undefined) access.reason = 2;
    return false;
  }
  if (access !== undefined) { if (access.yielding === 0) access.active = 1; access.reason = access.yielding === 0 ? 0 : 1; }
  return true;
}
