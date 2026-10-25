/** Procedural, per-Work settlement composition. Geometry is the rules' public plan. */
import { buildingLot, settlementLayout, turnRect, type GroundRect, type SettlementKind } from '../content/settlement-layout.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer, type Rgba } from './pixel-buffer.ts';
import { RAMPS, shadeAt } from './palette.ts';

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
  readonly works: readonly WorkAppearance[];
  readonly gateSide?: number;
  readonly gateBroken?: boolean;
  readonly breached?: readonly number[];
  readonly damaged?: readonly number[];
  readonly garrison?: boolean;
  readonly ram?: 'none' | 'building' | 'built';
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
  fillRect(out, x, y, w, h, stone(1));
  fillRect(out, x + 2, y + 2, w - 4, h - 4, stone(3));
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
    fillRect(out, x + 2, y + 2, w - 4, h - 4, wood(2));
    for (let dx = 4; dx < w - 3; dx += 6) fillRect(out, x + dx, y + 4, 3, h - 8, shadeAt(RAMPS.bronze, 5));
    fillRect(out, x + w - 17, y + 3, 14, 16, roof);
  } else if (work.building === 'quarry' || work.building === 'mine') {
    fillRect(out, x + 4, y + 4, w - 8, h - 8, stone(5));
    for (let dy = 8; dy < h - 5; dy += 7) fillRect(out, x + 5, y + dy, w - 10, 2, stone(2));
    fillRect(out, x + w / 2 - 6, y + h - 18, 12, 14, stone(0));
    if (work.building === 'mine') strokeRect(out, x + w / 2 - 8, y + h - 20, 16, 18, wood(4));
  } else if (work.building === 'lumber-camp') {
    for (let dy = 5; dy < h - 4; dy += 8) {
      fillRect(out, x + 4, y + dy, w - 8, 5, wood(3));
      fillRect(out, x + 4, y + dy, 5, 5, wood(5));
    }
  } else if (work.building === 'castrum') {
    strokeRect(out, x + 3, y + 3, w - 6, h - 6, wood(4));
    for (let dx = 7; dx < w - 5; dx += 15) fillRect(out, x + dx, y + 8, 10, h - 16, shadeAt(RAMPS.parchment, 3));
  } else if (work.building === 'forum') {
    fillRect(out, x + 4, y + 4, w - 8, h - 8, stone(4));
    for (let dx = 7; dx < w - 6; dx += 8) {
      fillRect(out, x + dx, y + 7, 4, h - 14, shadeAt(RAMPS.parchment, 5));
    }
    fillRect(out, x + 3, y + 2, w - 6, 6, roof);
  } else {
    fillRect(out, x + 2, y + 2, w - 4, h - 12, roof);
    if (flat) {
      strokeRect(out, x + 4, y + 4, w - 8, h - 16, shadeAt(RAMPS.parchment, 5));
      if (work.building === 'villa') fillRect(out, x + 12, y + 12, w - 24, h - 30, stone(2));
    } else {
      fillRect(out, x + 3, y + 3, w - 6, 3, shadeAt(RAMPS.blood, 5));
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
  const core = pixelRect(plan.core);
  const tier = Math.max(1, Math.min(3, look.tier));
  // Roads are ground, not selectable opaque rectangles over all reserved space.
  fillRect(out, 12 * TILE - 12, 5 * TILE, 40, 20 * TILE, wood(1));
  fillRect(out, core.x + 16, 12 * TILE - 8, core.width - 32, 24, wood(1));
  const square = pixelRect(turnRect(plan.capture, side));
  fillRect(out, square.x, square.y, square.width, square.height, stone(tier + 1));
  for (const work of look.works) {
    const lot = buildingLot(work.building, work.ordinal);
    if (lot !== undefined) drawWork(out, turnRect(lot, side), work);
  }
  if (look.kind === 'stronghold') {
    for (let edge = 0; edge < 4; edge += 1) {
      for (let tangent = -7; tangent <= 7; tangent += 1) {
        const isGate = edge === side && Math.abs(tangent) <= 1;
        const opening = look.breached?.includes(edge) === true && Math.abs(tangent - (edge === side ? -4 : 0)) <= 1;
        if (isGate || opening) continue;
        const tile = edge === 0 ? { x: tangent, y: -7 } : edge === 1 ? { x: 7, y: tangent } :
          edge === 2 ? { x: tangent, y: 7 } : { x: -7, y: tangent };
        const r = pixelRect({ ...tile, width: 1, height: 1 });
        fillRect(out, r.x, r.y, 16, 16, stone(1));
        fillRect(out, r.x + 1, r.y + 1, 14, 8 + tier * 2, stone(look.damaged?.includes(edge) === true ? 3 : 5));
        for (let dx = 2; dx < 15; dx += 5) fillRect(out, r.x + dx, r.y, 3, tier + 2, stone(6));
      }
    }
    for (const x of [-7, 7]) for (const y of [-7, 7]) {
      const r = pixelRect({ x, y, width: 1, height: 1 });
      fillRect(out, r.x, r.y, 16, 16, stone(1));
      fillRect(out, r.x + 1, r.y + 1, 14, 6 + tier * 3, stone(6));
      strokeRect(out, r.x + 3, r.y + 2, 10, 4 + tier * 3, stone(3));
    }
    const gate = pixelRect(turnRect(plan.gate, side));
    strokeRect(out, gate.x, gate.y, gate.width, gate.height, look.gateBroken === true ? wood(1) : stone(6));
    if (tier > 1 && look.gateBroken !== true) strokeRect(out, gate.x + 3, gate.y + 3, gate.width - 6, gate.height - 6, wood(tier + 2));
    if (look.garrison === true) {
      for (const x of [8, 16]) {
        fillRect(out, x * TILE + 4, core.y + 3, 4, 6, look.owner === 'carthage' ? shadeAt(RAMPS.blood, 5) : wood(6));
        fillRect(out, x * TILE + 4, core.y + 1, 3, 3, shadeAt(RAMPS.parchment, 4));
      }
    }
  }
  if (look.owner !== 'none') {
    fillRect(out, square.x + square.width - 5, square.y + 3, 2, 19, wood(3));
    fillRect(out, square.x + square.width - 3, square.y + 3, 9, 7,
      look.owner === 'rome' ? wood(6) : shadeAt(RAMPS.blood, 6));
  }
  return out;
}
