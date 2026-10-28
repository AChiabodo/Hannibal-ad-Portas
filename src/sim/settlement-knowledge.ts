/** Numeric, authoritative settlement sightings; projection never reads the live world. */
import { buildingOf } from '../content/index.ts';
import { WORK_MAX_HP } from '../content/buildings.ts';
import { fortificationHp } from '../content/fortifications.ts';
import { containsTile, settlementGroundFeatures } from '../content/settlement-layout.ts';
import type { ObservedSettlement, ObservedSettlementTile } from '../content/settlement-appearance.ts';
import type { Settlement, Work } from './economy.ts';
import type { Fog } from './fog.ts';
import { MAP_HEIGHT, MAP_WIDTH, tileIndex } from './map.ts';
import { settlementSide, workGround, workOrdinal } from './settlement-space.ts';
import type { Front, SiegeWorld } from './siege.ts';

/** All values in state are integers; unseen cells have seen=-1. */
export interface SettlementMemory {
  readonly id: number;
  readonly kind: number;
  readonly x: number;
  readonly y: number;
  readonly gateSide: number;
  readonly cells: Int32Array;
}
const WIDTH = 25;
const HALF = 12;
const SEEN = 0, TIER = 1, OWNER = 2, ORIGIN = 3, BUILDING = 4, ORDINAL = 5, STAGE = 6,
  WORK_ORIGIN = 7, STRUCTURE = 8, SIDE = 9, CONDITION = 10, GARRISON = 11, RAM = 12;
const STRIDE = 13;
const UNKNOWN_OWNER = -2;
const FRAMES = new WeakMap<Settlement, { readonly signature: string; readonly cells: Int32Array }>();

/** Called after current vision is refreshed. Every write is guarded by that cell's visibility. */
export function rememberSettlements(world: SiegeWorld, fog: Fog, tick: number): void {
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError('a settlement sighting requires a non-negative integer tick');
  const memories = fog.settlements ??= [];
  for (const site of world.economy.settlements) {
    let memory = memories.find((entry) => entry.id === site.id);
    let frame: Int32Array | undefined;
    for (let cell = 0; cell < WIDTH * WIDTH; cell += 1) {
      const x = site.x - HALF + cell % WIDTH;
      const y = site.y - HALF + Math.floor(cell / WIDTH);
      if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT || fog.visible[tileIndex(x, y)] !== 1) continue;
      frame ??= appearanceFrame(world, site);
      if (memory === undefined) {
        if (!revealsSite(world, site, cell, frame)) continue;
        memory = { id: site.id, kind: world.siege.strongholds.includes(site.id) ? 1 : 0,
          x: site.x, y: site.y, gateSide: settlementSide(world.economy, site), cells: new Int32Array(WIDTH * WIDTH * STRIDE).fill(-1) };
        memories.push(memory);
        cell = -1;
        continue;
      }
      const offset = cell * STRIDE;
      for (let field = 1; field < STRIDE; field += 1) memory.cells[offset + field] = frame[offset + field]!;
      memory.cells[offset + SEEN] = tick;
    }
  }
  memories.sort((one, other) => one.id - other.id);
}

/** Only stored knowledge and the current visibility mask enter this public DTO. */
export function settlementAppearances(fog: Fog): readonly ObservedSettlement[] {
  return (fog.settlements ?? []).map((memory) => {
    const tiles: ObservedSettlementTile[] = [];
    let owner: ObservedSettlement['owner'] = null;
    let ownerSeen = -1, tierSeen = -1;
    let tier: number | undefined;
    let visible = false;
    const features = settlementGroundFeatures(memory.kind === 1 ? 'stronghold' : 'settlement', memory.gateSide);
    for (let cell = 0; cell < WIDTH * WIDTH; cell += 1) {
      const offset = cell * STRIDE;
      const seen = memory.cells[offset + SEEN]!;
      if (seen < 0) continue;
      // Authoritative memory keeps every observed cell. The DTO omits only ground
      // with no ink or public architectural fact, reducing copied object graphs.
      const localX = cell % WIDTH - HALF, localY = Math.floor(cell / WIDTH) - HALF;
      const painted = memory.cells[offset + BUILDING]! >= 0 || memory.cells[offset + STRUCTURE]! >= 0 ||
        memory.cells[offset + RAM]! > 0 || memory.cells[offset + TIER]! >= 1 || memory.cells[offset + OWNER]! >= 0 ||
        features.roads.some((road) => containsTile(road, localX, localY));
      if (!painted) continue;
      const at = (field: number) => memory.cells[offset + field]!;
      const x = memory.x - HALF + cell % WIDTH;
      const y = memory.y - HALF + Math.floor(cell / WIDTH);
      const inView = x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT && fog.visible[tileIndex(x, y)] === 1;
      visible ||= inView;
      const knownOwner = at(OWNER);
      if (knownOwner >= -1 && seen >= ownerSeen) { ownerSeen = seen; owner = knownOwner === 0 ? 'rome' : knownOwner === 1 ? 'carthage' : null; }
      if (at(TIER) >= 1 && seen >= tierSeen) { tierSeen = seen; tier = at(TIER); }
      const building = buildingOf(at(BUILDING));
      tiles.push({ cell, seen, visible: inView,
        ...(at(TIER) < 1 ? {} : { tier: at(TIER) }),
        ...(knownOwner < -1 ? {} : { owner: knownOwner === 0 ? 'rome' as const : knownOwner === 1 ? 'carthage' as const : 'none' as const }),
        ...(at(ORIGIN) < 0 ? {} : { origin: at(ORIGIN) === 1 ? 'carthage' as const : 'rome' as const }),
        ...(building === undefined ? {} : { work: { building: building.id, ordinal: at(ORDINAL), stage: at(STAGE), origin: at(WORK_ORIGIN) === 1 ? 'carthage' as const : 'rome' as const } }),
        ...(at(STRUCTURE) < 0 ? {} : { structure: { kind: at(STRUCTURE) === 0 ? 'gate' as const : 'wall' as const, side: at(SIDE), condition: at(CONDITION) === 2 ? 'breached' as const : at(CONDITION) === 1 ? 'damaged' as const : 'intact' as const } }),
        ...(at(GARRISON) < 0 ? {} : { garrison: at(GARRISON) === 1 }),
        ...(at(RAM) < 1 ? {} : { ram: at(RAM) === 2 ? 'built' as const : 'building' as const }),
      });
    }
    return { id: memory.id, kind: memory.kind === 1 ? 'stronghold' as const : 'settlement' as const,
      x: memory.x, y: memory.y, gateSide: memory.gateSide, memory: visible ? 'seen' as const : 'remembered' as const,
      owner, ...(tier === undefined ? {} : { tier }), tiles };
  });
}

/** A derived cache avoids rebuilding the identical geometry on every visibility refresh. */
function appearanceFrame(world: SiegeWorld, site: Settlement): Int32Array {
  const front = world.siege.fronts[site.id];
  const garrison = world.economy.squads.some((squad) => squad.garrison === site.id && squad.strength > 0);
  const origin = (site as Settlement & { readonly origin?: number }).origin ?? (site.id === 1 ? 1 : 0);
  const signature = `${site.owner}:${origin}:${site.tier}:${front?.structures.map((part) => part.hp).join(',') ?? ''}:${front?.ram ?? 0}:${front?.ramTicks === 0 ? 2 : 1}:${garrison ? 1 : 0}:` +
    site.works.map((work) => `${work.building}.${workOrdinal(site, work)}.${work.origin ?? site.owner}.${workStage(work)}`).join(',');
  const cached = FRAMES.get(site);
  if (cached?.signature === signature) return cached.cells;
  const cells = new Int32Array(WIDTH * WIDTH * STRIDE).fill(-1);
  const side = settlementSide(world.economy, site);
  const features = settlementGroundFeatures(world.siege.strongholds.includes(site.id) ? 'stronghold' : 'settlement', side);
  const square = features.square;
  const ram = features.ram;
  for (let cell = 0; cell < WIDTH * WIDTH; cell += 1) {
    const offset = cell * STRIDE;
    const at = { x: cell % WIDTH - HALF, y: Math.floor(cell / WIDTH) - HALF };
    cells[offset + OWNER] = UNKNOWN_OWNER;
    cells[offset + RAM] = front !== undefined && front.ram > 0 && containsTile(ram, at.x, at.y) ? front.ramTicks === 0 ? 2 : 1 : 0;
    if (containsTile(square, at.x, at.y)) cells[offset + TIER] = site.tier;
    if (containsTile(features.landmark, at.x, at.y)) {
      cells[offset + TIER] = site.tier;
      cells[offset + ORIGIN] = origin;
    }
    // The flag extends slightly right and below its pole's cell.
    if (containsTile(features.flag, at.x, at.y)) cells[offset + OWNER] = site.owner;
    const structure = structureAt(front, side, at.x, at.y);
    if (structure !== undefined) {
      cells[offset + TIER] = site.tier;
      cells[offset + ORIGIN] = origin;
      cells[offset + STRUCTURE] = structure.kind;
      cells[offset + SIDE] = structure.side;
      cells[offset + CONDITION] = structure.hp <= 0 ? 2 : structure.hp < fortificationHp(site.tier, structure.kind === 0) ? 1 : 0;
      cells[offset + GARRISON] = garrison ? 1 : 0;
      if (garrison) cells[offset + OWNER] = site.owner;
    }
  }
  for (const work of site.works) {
    const type = buildingOf(work.building);
    if (type === undefined) continue;
    const ordinal = workOrdinal(site, work);
    const rect = workGround(world.economy, site, type.id, ordinal);
    if (rect === undefined) continue;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const cell = (y - site.y + HALF) * WIDTH + x - site.x + HALF;
      if (cell < 0 || cell >= WIDTH * WIDTH) continue;
      const offset = cell * STRIDE;
      cells[offset + BUILDING] = work.building;
      cells[offset + ORDINAL] = ordinal;
      cells[offset + STAGE] = workStage(work);
      cells[offset + WORK_ORIGIN] = work.origin ?? (site.owner === 1 ? 1 : 0);
    }
  }
  FRAMES.set(site, { signature, cells });
  return cells;
}

function workStage(work: Work): number {
  if (work.remaining > 0) return work.remaining * 2 > (buildingOf(work.building)?.buildTicks ?? 0) ? 0 : 1;
  if (work.repairTicks !== undefined) return 5;
  if (work.hp === 0) return 4;
  return (work.hp ?? WORK_MAX_HP) < WORK_MAX_HP ? 3 : 2;
}

function structureAt(front: Front | undefined, gateSide: number, x: number, y: number): Front['structures'][number] | undefined {
  if (front === undefined) return undefined;
  const side = y === -7 ? 0 : x === 7 ? 1 : y === 7 ? 2 : x === -7 ? 3 : -1;
  if (side < 0 || Math.abs(x) > 7 || Math.abs(y) > 7) return undefined;
  const tangent = side % 2 === 0 ? x : y;
  return front.structures.find((part) => part.kind === (side === gateSide && Math.abs(tangent) <= 1 ? 0 : 1) && part.side === side);
}


/** Reserved but empty ground alone does not disclose an unknown settlement. */
function revealsSite(world: SiegeWorld, site: Settlement, cell: number, frame: Int32Array): boolean {
  const offset = cell * STRIDE;
  if (frame[offset + BUILDING]! >= 0 || frame[offset + STRUCTURE]! >= 0 || frame[offset + RAM]! > 0 || frame[offset + TIER]! >= 1) return true;
  const side = settlementSide(world.economy, site);
  const x = cell % WIDTH - HALF, y = Math.floor(cell / WIDTH) - HALF;
  return settlementGroundFeatures(world.siege.strongholds.includes(site.id) ? 'stronghold' : 'settlement', side).roads.some((road) => containsTile(road, x, y));
}
