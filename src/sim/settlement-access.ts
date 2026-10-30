/** Real, aggregate journeys between the field and wall duty (#74). */
import { garrisonCapacity } from '../content/fortifications.ts';
import { formationShape } from '../content/formation.ts';
import { squadTypeOf } from '../content/squads.ts';
import { containsTile, intersects, settlementLayout, type GroundPoint, type GroundRect } from '../content/settlement-layout.ts';
import type { Economy, Settlement, Squad } from './economy.ts';
import type { SiegeWorld } from './siege.ts';
import { FIELD, isRouting } from './squad.ts';
import { NO_REFUSAL, refusalCode } from './route.ts';
import { canOccupy, coreOf, occupiedGround, settlementSide, sitePoint, squadGround } from './settlement-space.ts';

type Send = (squad: Squad, target: GroundPoint) => void;
type Journey = NonNullable<Squad['garrisonJourney']>;

export function requestDeparture(squad: Squad, target: GroundPoint): void {
  if (squad.garrisonJourney?.phase === 3) {
    squad.garrisonJourney.goalX = target.x;
    squad.garrisonJourney.goalY = target.y;
    return;
  }
  squad.garrisonJourney = { settlement: squad.garrison, phase: 3, remaining: 0, ticket: 0, goalX: target.x, goalY: target.y, fromOutside: 0 };
  squad.steps = [];
  squad.wait = 0;
  squad.refused = NO_REFUSAL;
}

export function requestGarrison(world: SiegeWorld, siteId: number, owner: number, ids: readonly number[], send: Send): boolean {
  const site = world.economy.settlements[siteId];
  if (site === undefined || site.owner !== owner || (world.siege.fronts[siteId]?.structures.length ?? 0) === 0) return false;
  let accepted = false;
  for (const squad of world.economy.squads) {
    if (!ids.includes(squad.id) || squad.owner !== owner || isRouting(squad)) continue;
    const type = squadTypeOf(squad.type);
    if (type === undefined || type.arm === 'cavalry' || type.figures === 1) {
      squad.refused = refusalCode('garrison-type');
      continue;
    }
    if (squad.garrison === siteId || squad.garrisonJourney?.settlement === siteId) { accepted = true; continue; }
    if (squad.garrison !== FIELD) continue;
    const inside = fullyInside(world.economy, site, squadGround(squad));
    const target = inside ? { x: squad.x, y: squad.y } : approachPoint(world, site, squad);
    if (target === undefined) { squad.refused = refusalCode('no-space'); continue; }
    // Wall duty continues an existing arrival through the same Gate. A new
    // ticket would put its admission behind the field bodies already waiting
    // for this Squad's active passage, making each wait for the other forever.
    const ticket = squad.access?.settlement === siteId && squad.access.passage === 0 ? squad.access.ticket : 0;
    squad.garrisonJourney = { settlement: siteId, phase: inside ? 1 : 0, remaining: 0, ticket, goalX: target.x, goalY: target.y, fromOutside: inside ? 0 : 1 };
    if (!inside) send(squad, target);
    else { squad.steps = []; squad.wait = 0; squad.refused = NO_REFUSAL; }
    if (squad.refused !== NO_REFUSAL) delete squad.garrisonJourney;
    else accepted = true;
  }
  return accepted;
}

export function advanceGarrisonJourneys(world: SiegeWorld, send: Send): void {
  const economy = world.economy;
  for (const squad of economy.squads) {
    const journey = squad.garrisonJourney;
    if (journey === undefined) continue;
    const site = economy.settlements[journey.settlement];
    if (site === undefined || site.owner !== squad.owner || isRouting(squad)) {
      delete squad.garrisonJourney;
      continue;
    }
    if (journey.phase === 0) {
      if (squad.steps.length > 0) continue;
      if (squad.x !== journey.goalX || squad.y !== journey.goalY) { fail(squad, 'unreachable'); continue; }
      journey.phase = 1;
    }
    if (journey.phase === 1) {
      ticket(economy, journey);
      if (!queueHead(economy, squad, journey)) { journey.reason = 1; continue; }
      delete journey.reason;
      const occupied = economy.squads.filter((other) => other.garrison === site.id).reduce((men, other) => men + other.strength, 0);
      if (occupied + squad.strength > garrisonCapacity(site.tier)) { fail(squad, 'garrison-full'); continue; }
      const target = admissionPoint(world, site, squad);
      if (target === undefined) { journey.reason = 1; continue; }
      journey.phase = 2;
      journey.remaining = assemblyTicks(squad);
      journey.goalX = target.x;
      journey.goalY = target.y;
      send(squad, target);
      if (squad.refused !== NO_REFUSAL) fail(squad, 'unreachable');
      continue;
    }
    if (journey.phase === 2) {
      journey.remaining = Math.max(0, journey.remaining - 1);
      if (squad.steps.length > 0 || journey.remaining > 0) continue;
      if (!fullyInside(economy, site, squadGround(squad))) { fail(squad, 'unreachable'); continue; }
      const occupied = economy.squads.filter((other) => other.garrison === site.id).reduce((men, other) => men + other.strength, 0);
      if (occupied + squad.strength > garrisonCapacity(site.tier)) { fail(squad, 'garrison-full'); continue; }
      squad.garrison = site.id;
      squad.refused = NO_REFUSAL;
      delete squad.garrisonJourney;
      continue;
    }
    if (journey.phase === 3) {
      if (squad.garrison !== FIELD) {
        ticket(economy, journey);
        if (!queueHead(economy, squad, journey)) { journey.reason = 1; continue; }
        const position = departurePoint(world, site, squad, journey);
        if (position === undefined) { journey.reason = 2; continue; }
        delete journey.reason;
        squad.x = position.x;
        squad.y = position.y;
        squad.facing = position.facing;
        if (squad.marchFormation === undefined) squad.marchFormation = squad.formation;
        squad.formation = 1;
        squad.garrison = FIELD;
        journey.remaining = assemblyTicks(squad);
        send(squad, { x: journey.goalX, y: journey.goalY });
      } else {
        journey.remaining = Math.max(0, journey.remaining - 1);
        const point = sitePoint(economy, site, settlementLayout('stronghold').assembly);
        const atPost = intersects(squadGround(squad), { x: point.x - 1, y: point.y - 1, width: 3, height: 3 });
        if (journey.remaining === 0 && (!atPost || squad.steps.length === 0)) delete squad.garrisonJourney;
      }
    }
  }
}

function ticket(economy: Economy, journey: Journey): void {
  if (journey.ticket !== 0) return;
  journey.ticket = economy.nextAccessTicket ?? 1;
  economy.nextAccessTicket = journey.ticket + 1;
}

function queueHead(economy: Economy, squad: Squad, journey: Journey): boolean {
  if (squad.access?.yielding) return false;
  return !economy.squads.some((other) => {
    const access = other.access;
    if (other.id !== squad.id && access?.settlement === journey.settlement && access.passage === 0 &&
      (access.active === 1 || access.ticket < journey.ticket)) return true;
    const waiting = other.garrisonJourney;
    if (other.id === squad.id || waiting === undefined || waiting.settlement !== journey.settlement) return false;
    if (waiting.phase === 2 || (waiting.phase === 3 && other.garrison === FIELD)) return true;
    return waiting.ticket > 0 && waiting.ticket < journey.ticket && (waiting.phase === 1 || waiting.phase === 3);
  });
}

function fullyInside(economy: Economy, site: Settlement, rect: GroundRect): boolean {
  const core = coreOf(economy, site);
  const inside = { x: core.x + 1, y: core.y + 1, width: core.width - 2, height: core.height - 2 };
  return containsTile(inside, rect.x, rect.y) && containsTile(inside, rect.x + rect.width - 1, rect.y + rect.height - 1);
}

function approachPoint(world: SiegeWorld, site: Settlement, squad: Squad): GroundPoint | undefined {
  const facing = (settlementSide(world.economy, site) + 2) % 4;
  for (const depth of [10, 14, 18]) for (const offset of [0, -4, 4, -8, 8]) {
    const point = sitePoint(world.economy, site, { x: offset, y: depth });
    const rect = squadGround(squad, point.x, point.y, 1, facing);
    if (!canOccupy(world.map, squad, point.x, point.y, 1, facing) || occupiedGround(world.economy, rect, squad.id)) continue;
    const reserved = world.economy.squads.some((other) => {
      const waiting = other.garrisonJourney;
      return other.id !== squad.id && waiting?.phase === 0 &&
        intersects(rect, squadGround(other, waiting.goalX, waiting.goalY, 1, facing));
    });
    if (!reserved) return point;
  }
  return undefined;
}

function admissionPoint(world: SiegeWorld, site: Settlement, squad: Squad): GroundPoint | undefined {
  const inside = fullyInside(world.economy, site, squadGround(squad));
  const facing = (settlementSide(world.economy, site) + (inside ? 0 : 2)) % 4;
  for (let depth = settlementLayout('stronghold').assembly.y; depth >= -4; depth -= 1) {
    const point = sitePoint(world.economy, site, { x: 0, y: depth });
    const shape = squadGround(squad, point.x, point.y, inside ? squad.formation : 1, facing);
    if (fullyInside(world.economy, site, shape) && canOccupy(world.map, squad, point.x, point.y, inside ? squad.formation : 1, facing) &&
      !occupiedGround(world.economy, shape, squad.id)) return point;
  }
  return undefined;
}

function departurePoint(world: SiegeWorld, site: Settlement, squad: Squad, journey: Journey): (GroundPoint & { facing: number }) | undefined {
  const outward = settlementSide(world.economy, site);
  const post = sitePoint(world.economy, site, settlementLayout('stronghold').assembly);
  if (occupiedGround(world.economy, squadGround(squad, post.x, post.y, 1, outward), squad.id)) return undefined;
  const goalInside = containsTile(coreOf(world.economy, site), journey.goalX, journey.goalY);
  const facing = goalInside ? (outward + 2) % 4 : outward;
  for (let depth = settlementLayout('stronghold').assembly.y; depth >= -4; depth -= 1) {
    const point = sitePoint(world.economy, site, { x: 0, y: depth });
    const shape = squadGround(squad, point.x, point.y, 1, facing);
    if (fullyInside(world.economy, site, shape) && canOccupy(world.map, squad, point.x, point.y, 1, facing) &&
      !occupiedGround(world.economy, shape, squad.id)) return { ...point, facing };
  }
  return undefined;
}

function assemblyTicks(squad: Squad): number {
  const { ranks } = formationShape(squad.capacity, 'column');
  return Math.max(4, Math.ceil(ranks * 5 / 16) * 4);
}

function fail(squad: Squad, reason: 'garrison-full' | 'unreachable'): void {
  squad.refused = refusalCode(reason);
  squad.steps = [];
  squad.wait = 0;
  delete squad.garrisonJourney;
}
