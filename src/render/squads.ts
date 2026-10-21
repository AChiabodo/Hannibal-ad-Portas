/**
 * Pure presentation of aggregate Squads (#67, ADR-0004/0026).
 * Purchased capacity fixes the slot grid; survivors remove a deterministic
 * prefix of a visual casualty ordering. No soldier state or simulation RNG.
 * Bounds retain vacant slots. Figures keep upright screen-space silhouettes;
 * only their ground positions rotate. Paint order follows screen y, then x.
 */
import {
  FIGURE_FACTION,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  figureFrame,
  soldier,
  type FigureFacing,
  type FigureFrame,
  type FigureName,
} from '../art/figures.ts';
import { RAMPS, shadeAt } from '../art/palette.ts';
import {
  blit,
  createPixelBuffer,
  strokeRect,
  type PixelBuffer,
  type Rgba,
} from '../art/pixel-buffer.ts';
import type { VisibleSquad } from '../sim/economy-match.ts';
import { TILE_SIZE } from '../sim/map.ts';
import type { Formation } from '../sim/command.ts';
import type { Facing } from '../sim/squad.ts';

/**
 * Which figure each Squad type is drawn as: both rosters, named for their types.
 *
 * C2 drew Rome and gave the three Carthaginian types the nearest Roman
 * silhouette in Carthaginian cloth; C4 replaced those stand-ins, and the table
 * is now the roster itself — a type's id is the name of the figure that draws
 * it, which is why a reader can ask for `figure:elephant:south:idle` and get the
 * elephant of `elephant`. It is kept as an explicit table all the same, because
 * the day a type is raised without an artist is a day a test should fail rather
 * than a drawing code invent a soldier.
 *
 * A Squad type the table does not know is a type the content table has grown
 * without an artist, and the test that walks `SQUAD_TYPES` fails on it rather
 * than this module drawing something arbitrary.
 */
export const FIGURE_OF_SQUAD: Readonly<Record<string, FigureName>> = {
  hastati: 'hastati',
  principes: 'principes',
  triarii: 'triarii',
  'libyan-spear': 'libyan-spear',
  gaul: 'gaul',
  'iberian-sword': 'iberian-sword',
  'balearic-slinger': 'balearic-slinger',
  'numidian-horse': 'numidian-horse',
  elephant: 'elephant',
};

/**
 * Which way a figure is drawn for each way a Squad can face.
 *
 * The two are the same four words in the same order, and they are still mapped
 * rather than cast: the simulation's facing is *state* (an integer code in the
 * Match) and the art's is a view, and a table with a test is what stops the two
 * drifting apart the day one of them gains a word.
 */
export const FIGURE_FACING_OF_FACING: Readonly<Record<Facing, FigureFacing>> = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west',
};

/**
 * How far apart two men stand abreast of each other, in pixels.
 *
 * Less than a soldier is wide, deliberately: a formation is a mass with its
 * shields overlapping, not a row of men with gaps between them, and the overlap
 * is what makes a hundred and twenty men read as one block at the lowest zoom.
 */
export const FILE_STEP = 4;

/**
 * How far apart two ranks stand, in pixels: enough to retain heads and equipment.
 *
 * A rank stands *behind* the one in front of it, which in a top-down view is a
 * few pixels up the screen; the overlap is what makes a column deep rather than
 * tall.
 */
export const RANK_STEP = 5;

/** One Figure per survivor, and one beast regardless of abstract strength. */
export function visualShape(squad: Pick<VisibleSquad, 'id' | 'type' | 'capacity' | 'figures' | 'formation' | 'facing'>): BlockShape {
  return { men: squad.figures, capacity: squad.type === 'elephant' ? 1 : squad.capacity,
    seed: squad.id, formation: squad.formation, facing: squad.facing };
}

/** Recruited presentation geometry, independent of simulation combat frontage. */
export interface BlockShape {
  /** Purchased slots, unchanged by losses. Defaults to men for standalone art. */
  readonly capacity?: number;
  /** Squad identity decorrelates illustrative casualties without simulation RNG. */
  readonly seed?: number;
  /** The shape it holds. */
  readonly formation: Formation;

  /**
   * How many figures the block is drawn as: the men left in it, or the one
   * figure of a type that is a Squad of a single one (C4). `VisibleSquad`
   * carries both, and it is `figures` a drawing code passes here.
   */
  readonly men: number;

  /** The way it faces. */
  readonly facing: Facing;
}

/** One man's place in the block, in block pixels: where his figure's top-left corner goes. */
export interface PlacedMan {
  /** How far along the front he stands, 0 is the block's left end. */
  readonly file: number;

  /** Which rank he stands in, 0 is the front rank. */
  readonly rank: number;

  /** The x his figure is drawn at, before translation into the purchased buffer. */
  readonly x: number;

  /** The y his figure is drawn at, before translation into the purchased buffer. */
  readonly y: number;
}

/** How big a block is drawn: the buffer `squadBlock` returns. */
export interface BlockSize {
  readonly width: number;
  readonly height: number;
}

/** Survivors in their original purchased slots, with stable interior gaps. */
export function blockMen(shape: BlockShape): readonly PlacedMan[] {
  const slots = recruitedSlots(shape);
  const lost = slots.length - shape.men;
  // Sort a fixed capacity-sized list, never the survivors. Further losses remove
  // a prefix of the same ordering: existing empty slots cannot refill.
  const casualties = new Set(slots.map((_slot, index) => ({ index,
    score: Math.imul(index + 1, 0x45d9f3b) ^ Math.imul((shape.seed ?? 0) + index, 0x119de1f3),
  })).sort((a, b) => (a.score >>> 0) - (b.score >>> 0) || a.index - b.index)
    .slice(0, lost).map(({ index }) => index));
  return slots.filter((_slot, index) => !casualties.has(index));
}

/** Canonical purchased geometry; no simulation frontage/combat rule is changed. */
function recruitedSlots(shape: BlockShape): readonly PlacedMan[] {
  const capacity = shape.capacity ?? shape.men;
  if (!Number.isInteger(capacity) || !Number.isInteger(shape.men) || shape.men < 1 || shape.men > capacity) {
    throw new RangeError('a block needs surviving men within its purchased capacity');
  }
  const lineFiles = capacity <= 1 ? 1 : capacity <= 12 ? 4 : capacity <= 24 ? 6
    : capacity <= 48 || capacity === 64 ? 8 : capacity <= 60 ? 10 : 12;
  if (shape.formation !== 'line' && shape.formation !== 'column') throw new RangeError('unknown block formation');
  const files = Math.min(capacity, shape.formation === 'column' ? Math.ceil(lineFiles / 2) : lineFiles);
  return Array.from({ length: capacity }, (_unused, index) => {
    const file = index % files;
    const rank = Math.floor(index / files);
    const along = Math.floor(((2 * file - (files - 1)) * FILE_STEP) / 2);
    return { file, rank, ...turned(shape.facing, along, rank * RANK_STEP) };
  });
}

/** Bounds include vacant purchased slots, keeping the anchor and plates stable. */
export function blockSize(shape: BlockShape): BlockSize {
  const men = recruitedSlots(shape);
  const xs = men.map((man) => man.x);
  const ys = men.map((man) => man.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + FIGURE_WIDTH,
    height: Math.max(...ys) - Math.min(...ys) + FIGURE_HEIGHT,
  };
}

/**
 * A block's men turned to the way it faces.
 *
 * The four cases are written out rather than computed from a matrix, because
 * they are the whole of what a facing means for a drawing code and a reader can
 * check them against `GLOSSARY`'s four sides: `along` runs left to right of the
 * block as its own men would say it, `behind` runs from the front rank towards
 * the rear.
 */
function turned(
  facing: Facing,
  along: number,
  behind: number,
): { readonly x: number; readonly y: number } {
  switch (facing) {
    case 'south':
      // Facing the bottom of the screen: the block's left is the viewer's right,
      // and its ranks run up the screen behind the front rank. The subtractions
      // are written as `0 - x` rather than `-x` so that the middle of the block
      // is the number zero and not the signed zero a comparison can tell apart.
      return { x: 0 - along, y: 0 - behind };
    case 'north':
      return { x: along, y: behind };
    case 'east':
      return { x: 0 - behind, y: along };
    case 'west':
      return { x: behind, y: 0 - along };
  }
}

/** What a block is drawn on, and how: everything `squadBlock` needs that is not the shape. */
export interface BlockOptions {
  /**
   * Which Faction's cloth its soldiers wear. A figure's own Faction's unless a
   * caller overrides it — a Carthaginian type is drawn in Carthaginian cloth
   * whoever is looking at it, and the override is the Atelier's and a test's.
   */
  readonly faction?: 'rome' | 'carthage';

  /** The tick the frame is chosen from: a walking block steps on alternate ticks. */
  readonly tick?: number;

  /** Whether to draw a ring around it, which is how a selection is shown on the map. */
  readonly selected?: boolean;
}

/** The ink a selected block is ringed in: bright enough to read over grass, forest and a shield wall. */
export const SELECTION_INK: Rgba = shadeAt(RAMPS.parchment, 6);

/**
 * A Squad as its soldiers: the buffer the renderer uploads, one per Squad.
 *
 * The men are drawn **back rank first**, so the front rank is on top and the
 * block has depth; each man's frame is chosen from the tick and his own place in
 * the block, so a marching block moves as a body rather than as one man copied a
 * hundred times.
 *
 * Composition rather than a sprite per man is what keeps the page responsive:
 * a dozen Squads is a dozen sprites however many men are in them, and a texture
 * is rebuilt only when the shape it draws has changed (`squadFrameKey`).
 *
 * @throws RangeError when the Squad's type is not one the content table knows:
 *   a Squad the roster cannot draw is worth refusing loudly.
 */
export function squadBlock(squad: VisibleSquad, options: BlockOptions = {}): PixelBuffer {
  const figure = FIGURE_OF_SQUAD[squad.type];
  if (figure === undefined) {
    throw new RangeError(`"${squad.type}" is not a Squad type the rosters draw`);
  }

  const shape = visualShape(squad);
  const men = blockMen(shape);
  const size = blockSize(shape);
  const block = createPixelBuffer(size.width, size.height);
  const slots = recruitedSlots(shape);
  const left = Math.min(...slots.map((man) => man.x));
  const top = Math.min(...slots.map((man) => man.y));
  const faction = clothOf(figure, options.faction);

  if (options.selected === true) {
    ring(block, 0, 0, block.width, block.height);
  }

  // Screen depth rather than slot order: east/north facings still overlap correctly.
  for (const man of [...men].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const frame = frameFor(squad, man, options.tick ?? 0);
    blit(block, soldier(figure, FIGURE_FACING_OF_FACING[squad.facing], frame, faction), man.x - left, man.y - top);
  }

  return block;
}

/**
 * Everything a composed block depends on, as one string.
 *
 * The renderer keeps one sprite per Squad and rebuilds its texture only when
 * this key changes, which is what stops a frame from uploading a hundred and
 * twenty soldiers sixty times a second. It is exported so that the page's own
 * loop and this module cannot disagree about when a block is stale.
 */
export function squadFrameKey(squad: VisibleSquad, options: BlockOptions = {}): string {
  return [
    squad.type,
    squad.facing,
    squad.formation,
    squad.figures,
    squad.capacity,
    squad.id,
    clothOf(FIGURE_OF_SQUAD[squad.type], options.faction),
    frameStepOf(squad, options.tick ?? 0),
    options.selected === true ? 'selected' : 'plain',
  ].join(':');
}

/**
 * The cloth a block is drawn in: a caller's override, or the Faction that drew
 * the figure.
 *
 * One reader for the one default, so the block a Squad is composed from and the
 * key it is re-composed on cannot disagree about its colour. A figure the table
 * does not know — which `squadBlock` refuses before it draws — falls back to
 * Rome rather than to `undefined`, because a colour is not a thing this function
 * is allowed to leave a hole in.
 */
function clothOf(figure: FigureName | undefined, override?: 'rome' | 'carthage'): 'rome' | 'carthage' {
  if (override !== undefined) return override;

  return figure === undefined ? 'rome' : FIGURE_FACTION[figure];
}

/**
 * Which frame a Squad is on: idle when it is standing, walking when it has
 * somewhere to go.
 *
 * The frame is a function of the tick — never of wall time, which the simulation
 * may not read (ADR-0006) and which would make two drawings of the same Match
 * disagree — and it steps every other tick, so a march is five frames a second
 * at the 10 Hz clock: fast enough to read as walking, slow enough for a block of
 * men not to shimmer.
 */
export function frameStepOf(squad: VisibleSquad, tick: number): number {
  return squad.goal === null ? -1 : Math.floor(tick / 2) % 2;
}

/**
 * One man's frame: the Squad's frame, offset by where he stands, so that the men
 * of a marching block are not in lockstep.
 */
function frameFor(squad: VisibleSquad, man: PlacedMan, tick: number): FigureFrame {
  const step = frameStepOf(squad, tick);
  if (step < 0) return figureFrame('idle', 0);

  return figureFrame('walk', (step + man.file + man.rank) % 2);
}

/** A one-pixel ring, which is how the map says "these are the men you have picked". */
function ring(block: PixelBuffer, x: number, y: number, width: number, height: number): void {
  strokeRect(block, x, y, width, height, SELECTION_INK);
}

/**
 * Places the front rank's foot centre on the Tile. Bounds include every
 * purchased slot, so further casualties never shift the buffer or survivors.
 */
export function blockPlacement(
  at: { readonly x: number; readonly y: number },
  shape: BlockShape,
): { readonly x: number; readonly y: number } {
  const anchor = blockAnchor(shape);

  return {
    x: at.x + Math.floor(TILE_SIZE / 2) - anchor.x,
    y: at.y + TILE_SIZE - anchor.y,
  };
}

/**
 * Centre of the front rank feet, relative to the purchased buffer. A Figure
 * stays upright on screen even when the grid turns, so its own feet do not turn.
 */
export function blockAnchor(shape: BlockShape): { readonly x: number; readonly y: number } {
  const slots = recruitedSlots(shape);
  const left = Math.min(...slots.map((man) => man.x));
  const top = Math.min(...slots.map((man) => man.y));
  const anchor = { x: Math.floor(FIGURE_WIDTH / 2), y: FIGURE_HEIGHT };

  return { x: anchor.x - left, y: anchor.y - top };
}
