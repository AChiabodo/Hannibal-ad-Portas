/**
 * What a selected Squad wears on the theatre: its condition, the way it faces and
 * where it was told to go (#58).
 *
 * The block itself is `render/squads.ts`'s — the simulation's own men, in the
 * simulation's own formation — and nothing here changes it. These are
 * **annotations about** it, drawn in their own layer so that a Squad's texture is
 * not rebuilt every time its Morale moves a point or a Player selects it:
 *
 * - a **condition plate** above the block: Morale as the primary indicator (five
 *   pips and the figure), plus the shape of up to two critical conditions;
 * - a **facing chevron** on the ground at the edge the Squad faces;
 * - the **destination mark**, a diamond for a move and a crossed diamond for an
 *   attack-move (the mark C2 drew, extended rather than replaced).
 *
 * Everything here is pure: a place, a shape and a Squad go in, a buffer or a
 * rectangle comes out. The engine adapter is `render/squad-layer.ts`, and the
 * mark pixels are `art/markers.ts` — so what a mark looks like is judged in the
 * Atelier and what it means is checked in Node.
 */
import { drawText } from '../art/font.ts';
import { FACING_MARK_SIZE, ORDER_MARKER_SIZE, conditionMark, facingMarker, orderMarker, type ConditionMarkKind, type OrderMarkKind } from '../art/markers.ts';
import { BASE, RAMPS, shadeAt } from '../art/palette.ts';
import { blit, createPixelBuffer, fillRect, strokeRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import type { VisibleSquad } from '../sim/economy-match.ts';
import type { Facing } from '../sim/squad.ts';
import {
  markedConditions,
  moraleOf,
  squadConditions,
  type SquadCondition,
} from '../ui/conditions.ts';
import { INSIGNIA_HEIGHT, INSIGNIA_WIDTH } from '../art/figures.ts';
import { blockPlacement, blockSize, type BlockShape } from './squads.ts';

/** How many pips the Morale bar has: enough to read a quarter of ten or sixteen. */
export const MORALE_PIPS = 5;

/** The width of a condition plate, in pixels: pips, the figure, and two condition shapes. */
export const CONDITION_PLATE_WIDTH = 42;

/** The height of a condition plate: one text line and its air. */
export const CONDITION_PLATE_HEIGHT = 11;

/** The plate's ground: the interface's own dark, so a glyph reads over any terrain. */
const PLATE = BASE.night;

/** The plate's edge. */
const PLATE_EDGE = shadeAt(RAMPS.stone, 2);

/** A filled Morale pip. */
const PIP_FULL = shadeAt(RAMPS.parchment, 6);

/** An empty one. */
const PIP_EMPTY = shadeAt(RAMPS.stone, 1);

/** A filled pip when the Morale is in the warning band: colour confirms the shape. */
const PIP_CRITICAL = shadeAt(RAMPS.blood, 5);

/** The figure on the plate: one shade under a filled pip, so the pips stay countable. */
const PLATE_INK = shadeAt(RAMPS.parchment, 5);

/** What a condition plate is drawn from: a Morale and the conditions beside it. */
export interface ConditionLook {
  /** The Squad's Morale now. */
  readonly morale: number;

  /** The most its type ever has, which is what the pips are a share of. */
  readonly maxMorale: number;

  /** The conditions it is in, in `ui/conditions.ts`'s ranking. */
  readonly conditions: readonly SquadCondition[];
}

/** The status of a Squad, as its plate is drawn from. */
export function conditionOf(squad: VisibleSquad): ConditionLook {
  return {
    morale: squad.morale,
    maxMorale: moraleOf(squad).max,
    conditions: squadConditions(squad),
  };
}

/**
 * The key a plate is cached on: everything it is drawn from, and nothing else.
 *
 * The layer keeps one sprite per Squad and re-textures it only when this changes,
 * so a Squad standing still with the same Morale uploads nothing, and a Morale
 * that moves by a point uploads a new plate.
 */
export function conditionKey(look: ConditionLook): string {
  return [look.morale, look.maxMorale, ...look.conditions].join(':');
}

/**
 * One Squad's condition plate.
 *
 * Morale is **the primary condition indicator**: five pips filled in proportion
 * to the share of the type's maximum, and the figure beside them. A low Morale is
 * drawn in the blood ramp *and* as hollow pips, because the ticket requires a
 * shape as well as a colour; the two critical conditions that do not have a pip
 * (a rout, an unpaid Season, a lost supply line, fatigue, spent missiles) are
 * drawn as their own silhouettes to the right of the figure.
 */
export function conditionPlate(look: ConditionLook): PixelBuffer {
  const plate = createPixelBuffer(CONDITION_PLATE_WIDTH, CONDITION_PLATE_HEIGHT);
  fillRect(plate, 0, 0, CONDITION_PLATE_WIDTH, CONDITION_PLATE_HEIGHT, PLATE);
  strokeRect(plate, 0, 0, CONDITION_PLATE_WIDTH, CONDITION_PLATE_HEIGHT, PLATE_EDGE);

  const low = look.conditions.includes('lowMorale');
  const share = look.maxMorale <= 0 ? 0 : look.morale / look.maxMorale;
  const filled = look.morale <= 0
    ? 0
    : Math.max(1, Math.min(MORALE_PIPS, Math.round(share * MORALE_PIPS)));
  const ink = low ? PIP_CRITICAL : PIP_FULL;

  for (let pip = 0; pip < MORALE_PIPS; pip += 1) {
    const x = 2 + pip * 3;
    const colour = pip < filled ? ink : PIP_EMPTY;

    if (pip < filled) {
      fillRect(plate, x, 3, 2, 3, colour);
      // Hollow when it is in the warning band: the same fill in another shape, so
      // a Player reading a desaturated screen still sees that the bar is low.
      if (low) {
        fillRect(plate, x, 4, 2, 1, PLATE);
      }
    } else {
      strokeRect(plate, x, 3, 2, 3, colour);
    }
  }

  // The figure, in whole bitmap glyphs: the pips say how much, this says how many.
  drawText(plate, String(look.morale), 19, 2, low ? PIP_CRITICAL : PLATE_INK);

  // Two shapes at most: the ranking in `ui/conditions.ts` decides which are the
  // two a Player needs first, and the panel carries the rest in words.
  for (const [index, condition] of markedConditions(look.conditions).slice(0, 2).entries()) {
    blit(plate, conditionMark(condition), 31 + index * 6, 3);
  }

  return plate;
}

/** The side of the small plate an unselected but troubled Squad wears. */
export const CONDITION_PIN_SIZE = 9;

/** The pin's ground and edge, the same inks the condition plate uses. */
const PIN_GROUND = PLATE;
const PIN_EDGE = PLATE_EDGE;

/**
 * The 9×9 plate an unselected Squad's condition wears.
 *
 * One shape and its ground: the whole of what a Squad in trouble carries when
 * nobody has picked it. It is composed here, with the rest of the annotation
 * art, so a Node test can hold it and the layer stays a thin adapter.
 */
export function conditionPin(condition: ConditionMarkKind): PixelBuffer {
  const pin = createPixelBuffer(CONDITION_PIN_SIZE, CONDITION_PIN_SIZE);
  fillRect(pin, 0, 0, CONDITION_PIN_SIZE, CONDITION_PIN_SIZE, PIN_GROUND);
  strokeRect(pin, 0, 0, CONDITION_PIN_SIZE, CONDITION_PIN_SIZE, PIN_EDGE);
  blit(pin, conditionMark(condition), 2, 2);

  return pin;
}

/** The facing chevrons, composed once each and shared by every Squad that way. */
const FACING_TEXTURES = new Map<Facing, PixelBuffer>();

/** The chevron that stands at the edge a Squad faces. */
export function facingMark(facing: Facing): PixelBuffer {
  const known = FACING_TEXTURES.get(facing);
  if (known !== undefined) return known;

  const drawn = facingMarker(facing);
  FACING_TEXTURES.set(facing, drawn);

  return drawn;
}

/** The destination marks, composed once each and shared. */
const ORDER_TEXTURES = new Map<OrderMarkKind, PixelBuffer>();

/** The mark a Squad's destination wears: a diamond for a move, a crossed one to fight. */
export function destinationMark(kind: OrderMarkKind): PixelBuffer {
  const known = ORDER_TEXTURES.get(kind);
  if (known !== undefined) return known;

  const drawn = orderMarker(kind);
  ORDER_TEXTURES.set(kind, drawn);

  return drawn;
}

/** Where the annotations about one block go, in theatre pixels. */
export interface MarkerPlacement {
  /** Top-left of the condition plate, above the block. */
  readonly condition: { readonly x: number; readonly y: number };
  /** Top-left of the facing chevron, just outside the block's front edge. */
  readonly facing: { readonly x: number; readonly y: number };
  /** Top-left of the Faction's standard, above the block and behind the men. */
  readonly standard: { readonly x: number; readonly y: number };
}

/** How far outside the block's front edge the chevron stands. */
const FACING_GAP = 2;

/** How far above the block the standard's cloth rises. */

/**
 * Where a Squad's annotations stand, from the tile it is on and the shape it holds.
 *
 * The **facing chevron** is placed on the block's own rectangle rather than on the
 * nominal tile: it sits just outside the edge the Squad faces, which is the edge a
 * Player is looking at. The **condition plate** is centred above the block, and the
 * **standard** rises above its top edge — both outside the men, so neither covers
 * a soldier.
 *
 * `FIGURE_SIZE` is the facing mark's side (`art/markers.ts`); it is centred on its
 * point rather than anchored by a corner, so a chevron on a one-man block and one
 * on a hundred and twenty are in the same place relative to the men.
 */
export function markerPlacement(
  at: { readonly x: number; readonly y: number },
  shape: BlockShape,
): MarkerPlacement {
  const size = blockSize(shape);
  const place = blockPlacement(at, shape);
  const middleX = place.x + Math.floor(size.width / 2);
  const middleY = place.y + Math.floor(size.height / 2);
  const half = Math.floor(FACING_MARK_SIZE / 2);

  const front = (): { readonly x: number; readonly y: number } => {
    switch (shape.facing) {
      case 'south':
        return { x: middleX, y: place.y + size.height + FACING_GAP + half };
      case 'north':
        return { x: middleX, y: place.y - FACING_GAP - half };
      case 'east':
        return { x: place.x + size.width + FACING_GAP + half, y: middleY };
      case 'west':
        return { x: place.x - FACING_GAP - half, y: middleY };
    }
  };

  const frontAt = front();
  const plateX = middleX - Math.floor(CONDITION_PLATE_WIDTH / 2);
  const plateY = place.y - CONDITION_PLATE_HEIGHT - 2;

  return {
    condition: { x: plateX, y: plateY },
    facing: { x: frontAt.x - half, y: frontAt.y - half },
    // The standard stands at the block's right end rather than over its middle,
    // so a selected Squad's plate does not cover the cloth it is recognised by.
    standard: {
      x: place.x + size.width - INSIGNIA_WIDTH,
      y: place.y - Math.floor(INSIGNIA_HEIGHT / 2),
    },
  };
}

/** The side of a destination mark, re-exported so the layer and a test agree. */
export const DESTINATION_SIZE = ORDER_MARKER_SIZE;

