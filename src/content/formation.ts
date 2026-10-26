import type { GroundRect } from './settlement-layout.ts';

export type Formation = 'line' | 'column';
export type Facing = 'north' | 'east' | 'south' | 'west';

export const FIGURE_FILE_STEP = 4;
export const FIGURE_RANK_STEP = 5;
export const SOLDIER_WIDTH = 10;
export const SOLDIER_HEIGHT = 14;

/** Ground slots shared by navigation and drawing, without individual soldier state. */
export function formationSlots(capacity: number, formation: Formation, facing: Facing) {
  const { files } = formationShape(capacity, formation);
  return Array.from({ length: capacity }, (_unused, index) => {
    const file = index % files;
    const rank = Math.floor(index / files);
    const along = Math.floor(((2 * file - (files - 1)) * FIGURE_FILE_STEP) / 2);
    const behind = rank * FIGURE_RANK_STEP;
    const at = facing === 'north' ? { x: along, y: behind } : facing === 'south' ? { x: 0 - along, y: 0 - behind } :
      facing === 'east' ? { x: 0 - behind, y: along } : { x: behind, y: 0 - along };
    return { file, rank, ...at };
  });
}

/** Tile coverage of the very same upright Figures the renderer places at front-rank feet. */
const FOOTPRINTS = new Map<string, GroundRect>();
export function formationFootprint(capacity: number, formation: Formation, facing: Facing): GroundRect {
  const key = `${capacity}:${formation}:${facing}`;
  const known = FOOTPRINTS.get(key);
  if (known !== undefined) return known;
  const slots = formationSlots(capacity, formation, facing);
  const left = Math.floor((Math.min(...slots.map((slot) => slot.x)) + 8 - SOLDIER_WIDTH / 2) / 16);
  const top = Math.floor((Math.min(...slots.map((slot) => slot.y)) + 16 - SOLDIER_HEIGHT) / 16);
  const right = Math.floor((Math.max(...slots.map((slot) => slot.x)) + 8 + SOLDIER_WIDTH / 2 - 1) / 16);
  const bottom = Math.floor((Math.max(...slots.map((slot) => slot.y)) + 15) / 16);
  const result = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
  FOOTPRINTS.set(key, result);
  return result;
}

/** Purchased files and ranks, shared by arrival spacing and procedural figures. */
export function formationShape(capacity: number, formation: Formation): { readonly files: number; readonly ranks: number } {
  const lineFiles = capacity <= 1 ? 1 : capacity <= 12 ? 4 : capacity <= 24 ? 6
    : capacity <= 48 || capacity === 64 ? 8 : capacity <= 60 ? 10 : 12;
  const files = Math.min(capacity, formation === 'column' ? Math.ceil(lineFiles / 2) : lineFiles);
  return { files, ranks: Math.ceil(capacity / files) };
}
