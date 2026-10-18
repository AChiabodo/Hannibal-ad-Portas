/**
 * A Squad, drawn: its soldiers in formation (ticket C2, ADR-0004, PLAN §4).
 *
 * The simulation holds a Squad as **one block** — a tile, a formation, a facing
 * and a strength — and it holds its men's places only as a *derivation*
 * (`sim/squad.ts`: `menOf`, `frontage`, `depth`). This module is the other end
 * of that derivation: it takes the same shape the rules take, asks the same
 * function where each man stands, and composes a `PixelBuffer` of that many
 * soldiers. So "a Squad is rendered as its soldiers in formation" is not a rule
 * that could disagree with the simulation's — it is the simulation's own list,
 * drawn — and "individual soldiers visibly thin out as the Squad loses strength"
 * is the list being shorter, with nobody shuffling.
 *
 * ## Where the drawing lives
 *
 * `art/` draws one soldier and knows nothing about the game; `sim/` knows where
 * the men stand and nothing about pixels. This module is the seam between them,
 * exactly as `render/terrain.ts` is the seam between the map's terrains and the
 * art library's materials: the two vocabularies (a `Formation` and a figure's
 * `FigureLook`, a `Facing` and a `FigureFacing`) are married here, in one place,
 * by tables a test can walk to prove they are total.
 *
 * Everything here is **pure**: no engine, no clock, no state. A block is a
 * function of the Squad it draws and of the tick it is drawn on, so it can be
 * composed in Node, hashed by a test, and compared with what the browser drew —
 * which is the only way "the formation on screen is the formation the simulation
 * holds" is a checked claim rather than a hope.
 *
 * ## Two decisions worth stating
 *
 * **Men are drawn back rank first.** A man further from the front stands higher
 * on the screen, and a later rank must be painted *before* an earlier one or the
 * front rank would be hidden by the men behind it. The drawing order is
 * therefore the reverse of the list, and it is the one thing about a block that
 * depends on where the front is.
 *
 * **A block is drawn from its own geometry.** The buffer is as big as the men in
 * it, and the caller is told where its bottom edge belongs: a Squad stands on
 * one tile (ADR-0004) and its men stand *up* from that tile, so the block is
 * anchored by its ground line rather than by its middle. That is what keeps a
 * line of one man and a column of forty level with each other.
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
  fillRect,
  setPixel,
  strokeRect,
  type PixelBuffer,
  type Rgba,
} from '../art/pixel-buffer.ts';
import type { VisibleSquad } from '../sim/economy-match.ts';
import { TILE_SIZE } from '../sim/map.ts';
import type { Formation } from '../sim/command.ts';
import {
  formationCode,
  frontage,
  menOf,
  type Facing,
  type Shape,
} from '../sim/squad.ts';

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
 * How far apart two ranks stand, in pixels: the same, for the same reason.
 *
 * A rank stands *behind* the one in front of it, which in a top-down view is a
 * few pixels up the screen; the overlap is what makes a column deep rather than
 * tall.
 */
export const RANK_STEP = 4;

/**
 * The shape of a block, as the words a drawing code speaks: a formation, a
 * number of men and a facing.
 *
 * `sim/squad.ts` holds a shape as integer codes (state, ADR-0006); this is the
 * same shape in the vocabulary a reader uses, and `blockMen` translates on the
 * way in rather than making the renderer carry two spellings of one thing.
 */
export interface BlockShape {
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

  /** The x his figure is drawn at, before the block is cropped to its men. */
  readonly x: number;

  /** The y his figure is drawn at, before the block is cropped to its men. */
  readonly y: number;
}

/** How big a block is drawn: the buffer `squadBlock` returns. */
export interface BlockSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Where every man of a block stands, in block pixels.
 *
 * The men come from `sim/squad.ts` — the same list the rules derive — and are
 * laid out front rank first, left to right, and then *turned* to the way the
 * Squad faces. The turn is a rotation of the layout rather than of each figure:
 * a block facing east has its front rank on the right-hand edge of the block and
 * its files running down the screen, which is what a column seen from the side
 * looks like.
 *
 * @throws RangeError when the block holds no men, or a formation no Squad can
 *   hold: there is no shape to a block of nobody.
 */
export function blockMen(shape: BlockShape): readonly PlacedMan[] {
  const held: Shape = { formation: formationCode(shape.formation), strength: shape.men };
  const front = frontage(held);

  return menOf(held).map((man) => {
    // The front rank is the block's origin and the ranks grow *behind* it, so a
    // Squad that loses a rank loses the men furthest from where it stands and
    // nobody shuffles; the files are centred on the frontage, which only changes
    // when the last few men are left. Whole pixels, rounded toward zero, so the
    // same shape and facing is the same layout on every engine.
    const along = Math.trunc(((2 * man.file - (front - 1)) * FILE_STEP) / 2);
    const behind = man.rank * RANK_STEP;

    return { ...man, ...turned(shape.facing, along, behind) };
  });
}

/** How big the block is: its men's places, and the size of one figure. */
export function blockSize(shape: BlockShape): BlockSize {
  const men = blockMen(shape);
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

  const shape: BlockShape = {
    men: squad.figures,
    formation: squad.formation,
    facing: squad.facing,
  };
  const men = blockMen(shape);
  const size = blockSize(shape);
  const block = createPixelBuffer(size.width, size.height);
  const left = Math.min(...men.map((man) => man.x));
  const top = Math.min(...men.map((man) => man.y));
  const faction = clothOf(figure, options.faction);

  if (options.selected === true) {
    ring(block, 0, 0, block.width, block.height);
  }

  // The reverse of the list is the rear rank first, which is the order a block
  // is painted in: a man behind another must not cover him.
  for (const man of [...men].reverse()) {
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

/** How big a marker of a Squad's destination is, in pixels. */
export const ORDER_MARKER_SIZE = 9;

/**
 * The mark a Squad's destination wears: a small diamond with a dot in it.
 *
 * An order a Player gives has to be visible somewhere, or a click that travelled
 * a fraction of a tile looks like nothing happened (and a refused order looks
 * like a click that was ignored). A diamond rather than an arrow because it has
 * no direction to be wrong about: where it is, is the answer.
 */
export function orderMarker(): PixelBuffer {
  const mark = createPixelBuffer(ORDER_MARKER_SIZE, ORDER_MARKER_SIZE);
  const centre = (ORDER_MARKER_SIZE - 1) / 2;

  for (let step = 0; step <= centre; step += 1) {
    const reach = Math.round(centre - step);
    setPixel(mark, centre - reach, centre - step, SELECTION_INK);
    setPixel(mark, centre + reach, centre - step, SELECTION_INK);
    setPixel(mark, centre - reach, centre + step, SELECTION_INK);
    setPixel(mark, centre + reach, centre + step, SELECTION_INK);
  }
  fillRect(mark, Math.floor(centre), Math.floor(centre), 1, 1, SELECTION_INK);

  return mark;
}

/**
 * Where the block's sprite goes, in theatre pixels, when its Squad stands on the
 * tile whose top-left corner is `at`.
 *
 * A Squad stands on one tile (ADR-0004) and its block is anchored by the one
 * point on it that does not move: **the middle of the front rank's ground
 * line**. The front rank's men therefore stand on the tile the simulation says
 * they are on, the ranks behind them are drawn behind, and a Squad that has lost
 * a rank loses men at the back of the block rather than having every survivor
 * shift half a step. That is what "a Squad that has lost men stands exactly
 * where it did" means on screen, and it is what lets a Player watch a Squad thin
 * out over a fight instead of watching it shudder.
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
 * Where the middle of the front rank's ground line stands inside a drawn block,
 * in buffer pixels.
 *
 * The one point a block is placed by. It is derived from the same layout the men
 * are drawn from — nothing is stored and nothing can drift — and it is
 * `turned`'s own arithmetic, so a Squad facing east is anchored by the middle of
 * its eastern face and not by its middle.
 */
export function blockAnchor(shape: BlockShape): { readonly x: number; readonly y: number } {
  const men = blockMen(shape);
  const left = Math.min(...men.map((man) => man.x));
  const top = Math.min(...men.map((man) => man.y));
  const anchor = turned(shape.facing, Math.floor(FIGURE_WIDTH / 2), FIGURE_HEIGHT);

  return { x: anchor.x - left, y: anchor.y - top };
}
