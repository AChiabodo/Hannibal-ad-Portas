/** Shared physical geometry: no renderer, no extra soldier entities, no hidden knowledge. */
import { buildingOf, squadTypeOf } from '../content/index.ts';
import { formationFootprint } from '../content/formation.ts';
import { buildingLot, containsTile, intersects, settlementLayout, turnPoint, turnRect, perimeterPoint, gateTile, breachTile,
  type GroundPoint, type GroundRect } from '../content/settlement-layout.ts';
import type { Economy, Settlement, Squad, Work } from './economy.ts';
import { facingOf, formationOf, FIELD } from './squad.ts';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, tileIndex, type MapGrid } from './map.ts';
import type { Siege } from './siege.ts';

interface PhysicalSpace { readonly economy: Economy; siege?: Siege; signature: string; readonly blocked: Map<number, Uint8Array> }
const SPACES = new WeakMap<MapGrid, PhysicalSpace>();
const MAPS = new WeakMap<Economy, MapGrid>();

/** Derived navigation indices are owned by this Match, never authoritative state. */
export function bindEconomySpace(map: MapGrid, economy: Economy): Economy {
  MAPS.set(economy, map);
  SPACES.set(map, { economy, signature: '', blocked: new Map() });
  return economy;
}

export function bindSiegeSpace(map: MapGrid, siege: Siege): Siege {
  const space = SPACES.get(map);
  if (space !== undefined) { space.siege = siege; space.signature = ''; space.blocked.clear(); }
  return siege;
}

export function hasPhysicalSpace(map: MapGrid): boolean { return SPACES.has(map); }
export interface PhysicalAccess { readonly settlement: number; readonly passage: number; readonly rect: GroundRect }

/** Main Gate and destroyed Wall sections are separate physical lanes. */
export function physicalAccesses(map: MapGrid, owner: number): readonly PhysicalAccess[] {
  const space = SPACES.get(map);
  if (space === undefined) return [];
  const result: PhysicalAccess[] = [];
  for (const site of space.economy.settlements.slice(0, 2)) {
    const front = space.siege?.fronts[site.id];
    const gate = front?.structures.find((structure) => structure.kind === 0);
    if (front === undefined || gate === undefined) continue;
    const rectAt = (side: number, tangent: number): GroundRect => side % 2 === 0 ?
      { x: site.x + tangent - 1, y: site.y + (side === 0 ? -7 : 7), width: 3, height: 1 } :
      { x: site.x + (side === 1 ? 7 : -7), y: site.y + tangent - 1, width: 1, height: 3 };
    if (owner === site.owner || gate.hp <= 0) result.push({ settlement: site.id, passage: 0, rect: rectAt(gate.side, 0) });
    for (const wall of front.structures) if (wall.kind === 1 && wall.hp <= 0)
      result.push({ settlement: site.id, passage: wall.side + 1, rect: rectAt(wall.side, wall.side === gate.side ? -4 : 0) });
  }
  return result;
}
export function physicalSignature(map: MapGrid): string { return SPACES.get(map)?.signature ?? ''; }

export function refreshPhysicalSpace(map: MapGrid): void {
  const space = SPACES.get(map);
  if (space === undefined) return;
  const signature = space.economy.settlements.map((site) => `${site.owner}:${site.works.map((work) => `${work.building}.${work.ordinal ?? -1}`).join(',')}`).join(';') +
    '/' + (space.siege?.fronts.map((front) => front.structures.map((wall) => wall.hp > 0 ? 1 : 0).join('')).join(';') ?? '');
  if (space.signature !== signature) { space.signature = signature; space.blocked.clear(); }
}

export function invalidateSpace(economy: Economy): void {
  const map = MAPS.get(economy);
  const space = map === undefined ? undefined : SPACES.get(map);
  if (space !== undefined) { space.signature = ''; space.blocked.clear(); }
}

export function blockedTile(map: MapGrid, owner: number, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return true;
  const space = SPACES.get(map);
  if (space === undefined) return map.terrain[tileIndex(x, y)] === TERRAIN.river;
  let grid = space.blocked.get(owner);
  if (grid === undefined) {
    grid = Uint8Array.from(map.terrain, (terrain) => terrain === TERRAIN.river ? 1 : 0);
    for (const site of space.economy.settlements) {
      for (const work of site.works) {
        const name = buildingOf(work.building)?.id;
        const rect = name === undefined ? undefined : workGround(space.economy, site, name, workOrdinal(site, work));
        if (rect !== undefined) paintObstacle(grid, rect);
      }
      const front = space.siege?.fronts[site.id];
      if (front === undefined || front.structures.length === 0) continue;
      const gate = front.structures.find((structure) => structure.kind === 0);
      const side = gate?.side ?? settlementSide(space.economy, site);
      for (let edge = 0; edge < 4; edge += 1) {
        const wall = front.structures.find((structure) => structure.kind === 1 && structure.side === edge);
        for (let tangent = -7; tangent <= 7; tangent += 1) {
          if (gateTile(side, edge, tangent) && (owner === site.owner || (gate?.hp ?? 0) <= 0)) continue;
          if ((wall?.hp ?? 1) <= 0 && breachTile(side, edge, tangent)) continue;
          const at = perimeterPoint(edge, tangent);
          paintObstacle(grid, { x: site.x + at.x, y: site.y + at.y, width: 1, height: 1 });
        }
      }
    }
    space.blocked.set(owner, grid);
  }
  return grid[tileIndex(x, y)] === 1;
}

function paintObstacle(grid: Uint8Array, rect: GroundRect): void {
  for (let y = Math.max(0, rect.y); y < Math.min(MAP_HEIGHT, rect.y + rect.height); y += 1)
    for (let x = Math.max(0, rect.x); x < Math.min(MAP_WIDTH, rect.x + rect.width); x += 1) grid[tileIndex(x, y)] = 1;
}

export function canOccupy(map: MapGrid, squad: Squad, x: number, y: number, formation = squad.formation, facing = squad.facing): boolean {
  const rect = squadGround(squad, x, y, formation, facing);
  for (let row = rect.y; row < rect.y + rect.height; row += 1)
    for (let col = rect.x; col < rect.x + rect.width; col += 1)
      if (blockedTile(map, squad.owner, col, row)) return false;
  return true;
}

/** Do not pull a column's tail through a wall by restoring line too early. */
export function crossingPerimeter(map: MapGrid, squad: Squad, x = squad.x, y = squad.y, formation = squad.formation, facing = squad.facing): boolean {
  const space = SPACES.get(map);
  if (space === undefined) return false;
  const rect = squadGround(squad, x, y, formation, facing);
  return space.economy.settlements.slice(0, 2).some((site) => {
    if ((space.siege?.fronts[site.id]?.structures.length ?? 0) === 0) return false;
    const bounds = coreOf(space.economy, site);
    const core = { x: bounds.x + 1, y: bounds.y + 1, width: bounds.width - 2, height: bounds.height - 2 };
    return intersects(rect, bounds) && !(containsTile(core, rect.x, rect.y) &&
      containsTile(core, rect.x + rect.width - 1, rect.y + rect.height - 1));
  });
}

export function contactAllowed(economy: Economy, one: Squad, other: Squad): boolean {
  const map = MAPS.get(economy);
  return map === undefined || (!blockedTile(map, one.owner, other.x, other.y) && !blockedTile(map, other.owner, one.x, one.y));
}

export function settlementSide(economy: Economy, settlement: Settlement): number {
  if (settlement.id > 1) return 2;
  const other = economy.settlements[settlement.id === 0 ? 1 : 0];
  if (other === undefined) return 2;
  const dx = other.x - settlement.x;
  const dy = other.y - settlement.y;
  return Math.abs(dx) >= Math.abs(dy) ? dx >= 0 ? 1 : 3 : dy >= 0 ? 2 : 0;
}

export function siteRect(economy: Economy, settlement: Settlement, rect: GroundRect): GroundRect {
  const at = turnRect(rect, settlementSide(economy, settlement));
  return { ...at, x: settlement.x + at.x, y: settlement.y + at.y };
}

export function sitePoint(economy: Economy, settlement: Settlement, point: GroundPoint): GroundPoint {
  const at = turnPoint(point, settlementSide(economy, settlement));
  return { x: settlement.x + at.x, y: settlement.y + at.y };
}

export function workOrdinal(settlement: Settlement, work: Work): number {
  return work.ordinal ?? settlement.works.slice(0, Math.max(0, settlement.works.indexOf(work)))
    .filter((other) => other.building === work.building).length;
}

export function workGround(economy: Economy, settlement: Settlement, building: string, ordinal: number): GroundRect | undefined {
  const lot = buildingLot(building, ordinal);
  return lot === undefined ? undefined : siteRect(economy, settlement, lot);
}

export function squadGround(squad: Squad, x = squad.x, y = squad.y, formation = squad.formation, facing = squad.facing): GroundRect {
  const type = squadTypeOf(squad.type);
  const rect = formationFootprint(type?.figures === 1 ? 1 : squad.capacity, formationOf(formation), facingOf(facing));
  return { ...rect, x: rect.x + x, y: rect.y + y };
}

export function occupiedGround(economy: Economy, rect: GroundRect, except = -1): boolean {
  return economy.squads.some((squad) => squad.id !== except && squad.garrison === FIELD && intersects(rect, squadGround(squad)));
}

/** Rotations and formation changes cannot create overlap beside a busy access. */
export function clearFieldBody(map: MapGrid, squad: Squad, x = squad.x, y = squad.y, formation = squad.formation, facing = squad.facing): boolean {
  const space = SPACES.get(map);
  if (space === undefined) return true;
  const rect = squadGround(squad, x, y, formation, facing);
  const near = physicalAccesses(map, squad.owner).some((access) => intersects(rect,
    { x: access.rect.x - 10, y: access.rect.y - 10, width: access.rect.width + 20, height: access.rect.height + 20 }));
  return !near || !occupiedGround(space.economy, rect, squad.id);
}

/** Active foundations and finished roofs have the same physical footprint. */
export function buildingAt(economy: Economy, x: number, y: number): boolean {
  return economy.settlements.some((settlement) => settlement.works.some((work) => {
    const name = buildingOf(work.building)?.id;
    if (name === undefined) return false;
    const rect = workGround(economy, settlement, name, workOrdinal(settlement, work));
    return rect !== undefined && containsTile(rect, x, y);
  }));
}

export function coreOf(economy: Economy, settlement: Settlement): GroundRect {
  return siteRect(economy, settlement, settlementLayout(settlement.id < 2 ? 'stronghold' : 'settlement').core);
}
