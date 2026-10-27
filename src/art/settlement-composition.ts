/** Procedural, per-Work settlement composition. Geometry is the rules' public plan. */
import { buildingLot, settlementLayout, settlementGroundFeatures, turnRect, perimeterPoint, gateTile, breachTile, type GroundRect, type SettlementKind } from '../content/settlement-layout.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer, type Rgba } from './pixel-buffer.ts';
import { RAMPS, shadeAt } from './palette.ts';
import type { ObservedSettlement, ObservedSettlementTile } from '../content/settlement-appearance.ts';

export interface WorkAppearance {
  readonly building: string;
  readonly ordinal: number;
  readonly stage: number;
  readonly origin: 'rome' | 'carthage';
}
export interface SettlementComposition {
  readonly kind: SettlementKind;
  readonly owner: 'rome' | 'carthage' | 'none';
  readonly tier: number;
  readonly origin?: 'rome' | 'carthage';
  readonly works: readonly WorkAppearance[];
  readonly gateSide?: number;
  readonly gateBroken?: boolean;
  readonly breached?: readonly number[];
  readonly damaged?: readonly number[];
  readonly garrison?: boolean;
  readonly ram?: 'none' | 'building' | 'built';
  /** Absent structures in a filtered cell must never be invented. */
  readonly structures?: boolean;
}

const TILE = 16;
const stone = (shade: number): Rgba => shadeAt(RAMPS.stone, shade);
const wood = (shade: number): Rgba => shadeAt(RAMPS.bronze, shade);

function pixelRect(rect: GroundRect): GroundRect {
  return { x: (rect.x + 12) * TILE, y: (rect.y + 12) * TILE, width: rect.width * TILE, height: rect.height * TILE };
}

/** One cached-component-friendly building; all paint stays in its physical lot. */
function drawWork(out: PixelBuffer, rect: GroundRect, work: WorkAppearance): void {
  const { x, y, width: w, height: h } = pixelRect(rect);
  const flat = work.origin === 'carthage';
  const roof = flat ? shadeAt(RAMPS.parchment, 3) : shadeAt(RAMPS.blood, 3);
  fillRect(out, x + 4, y + 5, w - 5, h - 6, stone(0));
  fillRect(out, x + 2, y + 3, w - 6, h - 6, stone(2));
  if (work.stage === 0) {
    for (let dx = 4; dx < w - 3; dx += 7) {
      fillRect(out, x + dx, y + 3, 2, h - 6, wood(3));
    }
    return;
  }
  fillRect(out, x + 3, y + 4, w - 6, h - 7, shadeAt(RAMPS.parchment, 4));
  if (work.stage === 1) {
    strokeRect(out, x + 2, y + 2, w - 4, h - 4, wood(4));
    for (let dy = 6; dy < h; dy += 9) fillRect(out, x, y + dy, w, 2, wood(2));
    return;
  }
  if (work.building === 'farm') {
    fillRect(out, x + 2, y + 2, w - 4, h - 4, wood(1));
    for (let dx = 4; dx < w - 3; dx += 6) fillRect(out, x + dx, y + 4, 3, h - 8, shadeAt(RAMPS.bronze, 5));
    fillRect(out, x + w - 17, y + 3, 14, 16, roof);
  } else if (work.building === 'quarry' || work.building === 'mine') {
    fillRect(out, x + 3, y + 3, w - 6, h - 6, stone(2));
    for (let dy = 5; dy < h - 12; dy += 8) {
      const inset = Math.floor((dy % 13) / 2);
      fillRect(out, x + 4 + inset, y + dy, w - 12 - inset, 5, stone(4));
      fillRect(out, x + 5 + inset, y + dy, w - 14 - inset, 2, stone(6));
    }
    fillRect(out, x + w / 2 - 6, y + h - 18, 12, 14, stone(0));
    if (work.building === 'mine') strokeRect(out, x + w / 2 - 8, y + h - 20, 16, 18, wood(4));
  } else if (work.building === 'lumber-camp') {
    for (let dy = 5; dy < h - 4; dy += 8) {
      fillRect(out, x + 4, y + dy, w - 8, 5, wood(3));
      fillRect(out, x + 4, y + dy, 5, 5, wood(5));
      fillRect(out, x + 5, y + dy + 1, 2, 2, wood(2));
    }
  } else if (work.building === 'castrum') {
    strokeRect(out, x + 3, y + 3, w - 6, h - 6, wood(4));
    for (let dx = 7; dx < w - 10; dx += 15) {
      fillRect(out, x + dx, y + 9, 12, h - 17, shadeAt(RAMPS.parchment, 2));
      for (let line = 0; line < 5; line += 1) fillRect(out, x + dx + line, y + 7 + line, 12 - line * 2, 2, shadeAt(RAMPS.parchment, 5 - Math.floor(line / 2)));
      fillRect(out, x + dx + 5, y + h - 17, 3, 7, wood(0));
    }
  } else if (work.building === 'forum') {
    fillRect(out, x + 4, y + 4, w - 8, h - 8, stone(4));
    for (let dx = 7; dx < w - 6; dx += 8) {
      fillRect(out, x + dx, y + 7, 4, h - 14, shadeAt(RAMPS.parchment, 5));
    }
    fillRect(out, x + 3, y + 2, w - 6, 6, roof);
  } else {
    // A lit upper plane, shaded slope and front wall keep the existing 3/4 view.
    fillRect(out, x + 4, y + 8, w - 7, h - 12, stone(1));
    fillRect(out, x + 3, y + 7, w - 8, h - 12, shadeAt(RAMPS.parchment, flat ? 4 : 3));
    fillRect(out, x + 2, y + 2, w - 4, h - 14, roof);
    if (flat) {
      strokeRect(out, x + 4, y + 4, w - 8, h - 16, shadeAt(RAMPS.parchment, 5));
      if (work.building === 'villa') fillRect(out, x + 12, y + 12, w - 24, h - 30, stone(2));
    } else {
      const ridge = Math.max(5, Math.floor((h - 14) / 2));
      fillRect(out, x + 3, y + 3, w - 6, ridge - 2, shadeAt(RAMPS.blood, 4));
      fillRect(out, x + 3, y + ridge, w - 6, 2, shadeAt(RAMPS.blood, 6));
      fillRect(out, x + 3, y + h - 14, w - 6, 2, stone(0));
      for (let dy = 10; dy < h - 12; dy += 5) fillRect(out, x + 3, y + dy, w - 6, 1, shadeAt(RAMPS.blood, 2));
    }
    fillRect(out, x + w / 2 - 3, y + h - 12, 6, 10, wood(1));
    if (work.building === 'market') {
      for (let dx = 4; dx < w - 4; dx += 8) fillRect(out, x + dx, y + h - 18, 4, 6, shadeAt(RAMPS.bronze, 6));
    }
    if (work.building === 'granary') {
      for (let dx = 4; dx < w - 4; dx += 8) fillRect(out, x + dx, y + h - 10, 5, 5, wood(5));
    }
  }
}

/** Fully procedural image; neither simulation state nor random source is read. */
export function settlementComposition(look: SettlementComposition): PixelBuffer {
  const plan = settlementLayout(look.kind);
  const out = createPixelBuffer(plan.grounds.width * TILE, plan.grounds.height * TILE);
  const side = look.gateSide ?? 2;
  const features = settlementGroundFeatures(look.kind, side);
  const tradition = look.origin ?? (look.owner === 'carthage' ? 'carthage' : 'rome');
  const tier = Math.max(1, Math.min(3, look.tier));
  // Roads are ground, not selectable opaque rectangles over all reserved space.
  const lane = pixelRect(features.roads[0]!);
  fillRect(out, lane.x, lane.y, lane.width, lane.height, wood(1));
  const cross = pixelRect(features.roads[1]!);
  fillRect(out, cross.x, cross.y, cross.width, cross.height, wood(1));
  const square = pixelRect(features.square);
  fillRect(out, square.x, square.y, square.width, square.height, stone(tier + 1));
  for (const work of look.works) {
    const lot = buildingLot(work.building, work.ordinal);
    if (lot !== undefined) drawWork(out, turnRect(lot, side), work);
  }
  if (look.kind === 'stronghold' && look.structures !== false) {
    for (let edge = 0; edge < 4; edge += 1) {
      for (let tangent = -7; tangent <= 7; tangent += 1) {
        const isGate = gateTile(side, edge, tangent);
        const opening = look.breached?.includes(edge) === true && breachTile(side, edge, tangent);
        if (isGate || opening) continue;
        const tile = perimeterPoint(edge, tangent);
        const r = pixelRect({ ...tile, width: 1, height: 1 });
        // Paint along the wall's tangent. Vertical sides must join across the
        // full tile height, with their outer face on the appropriate side.
        const paint = (x: number, y: number, width: number, height: number, color: Rgba): void => {
          if (edge % 2 === 0) fillRect(out, r.x + x, r.y + y, width, height, color);
          else fillRect(out, r.x + (edge === 1 ? y : TILE - y - height), r.y + x, height, width, color);
        };
        paint(0, 5, 16, 11, stone(1));
        const face = tier === 1 ? wood(3) : tradition === 'carthage' ? shadeAt(RAMPS.parchment, 3) : stone(4);
        paint(1, 7, 14, 8, face);
        paint(1, 8 - tier * 2, 14, tier * 2, look.damaged?.includes(edge) === true ? stone(3) : tier === 1 ? wood(5) : stone(6));
        paint(1, 13, 14, 2, stone(2));
        if (tier > 1) paint(7, 10, 2, 4, stone(1));
        if (tier === 3) for (const dx of [2, 11]) paint(dx, 7, 2, 7, stone(3));
        if (look.garrison === true && tangent % 4 === 0) {
          fillRect(out, r.x + 6, r.y + 1, 4, 6, look.owner === 'carthage' ? shadeAt(RAMPS.blood, 5) : wood(6));
          fillRect(out, r.x + 6, r.y, 3, 3, shadeAt(RAMPS.parchment, 4));
        }
        const flat = tradition === 'carthage';
        for (let dx = flat ? 1 : 2; dx < 15; dx += flat ? 8 : 5)
          paint(dx, 6 - tier * 2, flat ? 5 : 3, tier + 2, tier === 1 ? wood(4) : stone(6));
      }
    }
    for (const x of [-7, 7]) for (const y of [-7, 7]) {
      const r = pixelRect({ x, y, width: 1, height: 1 });
      fillRect(out, r.x, r.y + 5, 16, 11, stone(1));
      fillRect(out, r.x + 2, r.y + 5, 12, 10, tradition === 'carthage' ? shadeAt(RAMPS.parchment, 3) : stone(4));
      fillRect(out, r.x + 1, r.y + 4 - tier, 14, 6, stone(6));
      strokeRect(out, r.x + 3, r.y + 5 - tier, 10, 4, stone(3));
      fillRect(out, r.x + 7, r.y + 10, 2, 4, stone(0));
      if (tier === 3) for (const dx of [1, 6, 11]) fillRect(out, r.x + dx, r.y, 4, 3, stone(6));
      if (tradition === 'carthage') {
        // Broad flat parapets contrast with the Roman towers' raised merlons,
        // including the empty Tier-I fortress before its first Work exists.
        fillRect(out, r.x, r.y + 1, 16, 3, shadeAt(RAMPS.parchment, 4));
        fillRect(out, r.x + 2, r.y, 12, 2, stone(6));
      }
    }
    const gate = pixelRect(turnRect(plan.gate, side));
    strokeRect(out, gate.x, gate.y, gate.width, gate.height, look.gateBroken === true ? wood(1) : stone(6));
    if (look.gateBroken !== true) {
      const material = tier === 1 ? wood(4) : stone(5);
      if (gate.width > gate.height) {
        fillRect(out, gate.x, gate.y, 5 + tier, gate.height, material);
        fillRect(out, gate.x + gate.width - 5 - tier, gate.y, 5 + tier, gate.height, material);
        fillRect(out, gate.x, gate.y, gate.width, 2 + tier, stone(6));
      } else {
        fillRect(out, gate.x, gate.y, gate.width, 5 + tier, material);
        fillRect(out, gate.x, gate.y + gate.height - 5 - tier, gate.width, 5 + tier, material);
        fillRect(out, gate.x, gate.y, 2 + tier, gate.height, stone(6));
      }
    }
    if (tier > 1 && look.gateBroken !== true) strokeRect(out, gate.x + 3, gate.y + 3, gate.width - 6, gate.height - 6, wood(tier + 2));

  }
  if (look.ram !== undefined && look.ram !== 'none') {
    const ram = pixelRect(features.ram);
    fillRect(out, ram.x + 2, ram.y + 8, ram.width - 4, ram.height - 12, wood(2));
    strokeRect(out, ram.x + 3, ram.y + 4, ram.width - 6, ram.height - 8, wood(5));
    if (look.ram === 'built') {
      fillRect(out, ram.x + 5, ram.y + 8, ram.width - 10, 7, shadeAt(RAMPS.parchment, 3));
      for (const dx of [4, ram.width - 9]) fillRect(out, ram.x + dx, ram.y + ram.height - 8, 5, 6, stone(0));
    }
  }
  if (look.owner !== 'none') {
    fillRect(out, square.x + square.width - 5, square.y + 3, 2, 19, wood(3));
    fillRect(out, square.x + square.width - 3, square.y + 3, 9, 7,
      look.owner === 'rome' ? wood(6) : shadeAt(RAMPS.blood, 6));
  }
  return out;
}

const OBSERVED_CACHE = new Map<string, PixelBuffer>();
const PART_CACHE = new Map<string, PixelBuffer>();
const CACHE_LIMIT = 32;

/** Sighting time is historical metadata; it never invalidates identical pixels. */
export function observedSettlementKey(site: ObservedSettlement): string {
  return JSON.stringify([site.kind, site.gateSide, site.tiles.map((tile) => [tile.cell, tile.visible,
    tile.tier, tile.origin, tile.owner, tile.work, tile.structure, tile.garrison, tile.ram])]);
}

/** Compose only cells actually present in the filtered Observation, including old phases. */
export function observedSettlementSprite(site: ObservedSettlement): PixelBuffer {
  const key = observedSettlementKey(site);
  const known = OBSERVED_CACHE.get(key);
  if (known !== undefined) return known;
  const plan = settlementLayout(site.kind);
  const size = plan.grounds.width * TILE;
  const out = createPixelBuffer(size, plan.grounds.height * TILE);
  for (const tile of site.tiles) {
    if (!Number.isInteger(tile.cell) || tile.cell < 0 || tile.cell >= plan.grounds.width * plan.grounds.height) continue;
    const source = partSource(site, tile);
    const x = (tile.cell % plan.grounds.width) * TILE;
    const y = Math.floor(tile.cell / plan.grounds.width) * TILE;
    for (let row = y; row < y + TILE; row += 1) {
      const offset = (row * size + x) * 4;
      out.pixels.set(source.pixels.subarray(offset, offset + TILE * 4), offset);
    }
  }
  remember(OBSERVED_CACHE, key, out);
  return out;
}

function partSource(site: ObservedSettlement, tile: ObservedSettlementTile): PixelBuffer {
  const structure = tile.structure;
  const look: SettlementComposition = {
    structures: structure !== undefined,
    ...(tile.origin === undefined ? {} : { origin: tile.origin }),
    kind: site.kind, gateSide: site.gateSide, tier: tile.tier ?? 1, owner: tile.owner ?? 'none',
    works: tile.work === undefined ? [] : [tile.work],
    ...(structure?.kind === 'gate' ? { gateBroken: structure.condition === 'breached' } : {}),
    breached: structure?.kind === 'wall' && structure.condition === 'breached' ? [structure.side] : [],
    damaged: structure?.kind === 'wall' && structure.condition === 'damaged' ? [structure.side] : [],
    ...(tile.garrison === undefined ? {} : { garrison: tile.garrison }),
    ram: tile.ram ?? 'none',
  };
  const key = JSON.stringify(look);
  const known = PART_CACHE.get(key);
  if (known !== undefined) return known;
  const source = settlementComposition(look);
  remember(PART_CACHE, key, source);
  return source;
}

function remember(cache: Map<string, PixelBuffer>, key: string, buffer: PixelBuffer): void {
  cache.set(key, buffer);
  if (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}
