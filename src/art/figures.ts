/**
 * The Squad's soldiers, drawn: paper dolls composed out of parts (ticket C2,
 * PLAN §3, ADR-0002, ADR-0004).
 *
 * A Squad is one block with aggregate strength (ADR-0004), and the men inside it
 * are *drawing and nothing else*. This module is the drawing: one soldier, from
 * which a block of a hundred and twenty is composed by `render/squads.ts` — so
 * "a Squad is rendered as its soldiers in formation" is a loop over a list of
 * places, and "individual soldiers visibly thin out as the Squad loses strength"
 * is that list being shorter.
 *
 * ## Composed, not drawn
 *
 * A figure is a **paper doll**: a body, and the equipment hung on it. The parts
 * are parametric — a helmet, a shield and a weapon each name a *kind*, and the
 * kind decides a few drawn pixels and, through them, the silhouette — so the
 * catalogue is three soldiers and not three hundred hand-drawn sprites, and a
 * fourth soldier is a new row in a table rather than a new artist. That is
 * ADR-0002's rule taken seriously: what is committed is code and numbers, and
 * the pixel tables a reader judges are a few dozen lines each.
 *
 * The **silhouette is the design and the colour is the confirmation**, which is
 * B3's rule for resource markers applied to soldiers, and for a sharper reason:
 * a block of a hundred and twenty men is a mass of colour at the lowest zoom, so
 * what tells a hastatus from a triarius there is a *shape* — a small round
 * shield, a tall rectangle, a great round one with a spear that reaches over the
 * whole block. The palette is a Faction's, and it is the second thing a player
 * learns rather than the first.
 *
 * ## The four directions, and the two that are drawn
 *
 * A Squad faces one of four sides of its tile (ADR-0007), so a soldier is drawn
 * four ways: front, back, right side and left side. Only **two** of those are
 * authored. The right side is the profile; the left side is that profile
 * mirrored; the back is the front mirrored, with the face painted out and the
 * back of the head and the shield's edge left showing. Mirroring is a primitive
 * of `pixel-buffer.ts`'s neighbours, and a mirror cannot drift from the thing it
 * mirrors — the alternative is four tables that must be kept telling the same
 * story forever.
 *
 * ## Frames
 *
 * Idle is one frame; walk and attack are two; death is one. That is the plan's
 * "idle, walk, attack and death are enough", and it is what the animation looks
 * like at a tile of sixteen pixels: a leg lifted, a spear thrust forward, a body
 * lying where it stood. A frame is addressed by an action and a step rather than
 * by a name, so the Atelier can walk `FIGURE_FRAMES` and a renderer can pick one
 * with arithmetic.
 *
 * ## Anchoring
 *
 * Every frame is the same size and every figure's feet are on its last row, so a
 * man's place in a block is a place and never a per-frame offset: the block does
 * not shuffle when a Squad starts walking, and a man does not sink into the
 * ground when he stops.
 */

import { BASE, RAMPS, shadeAt } from './palette.ts';
import {
  TRANSPARENT,
  blit,
  createPixelBuffer,
  fillRect,
  pixelAt,
  setPixel,
  type PixelBuffer,
  type Rgba,
} from './pixel-buffer.ts';

/** How wide one soldier is drawn, in pixels. */
export const FIGURE_WIDTH = 10;

/**
 * How tall one soldier is drawn, in pixels: eleven of body, and three rows above
 * it for a crest, a javelin's tip and a spear that reaches over the block.
 */
export const FIGURE_HEIGHT = 14;

/**
 * The four directions a figure is drawn facing, in the order `sim/squad.ts`
 * states them (north, east, south, west).
 *
 * A word rather than a number, because `art/` knows nothing about the simulation
 * and a reader of this module should not have to look up what `2` means; the
 * boundary that turns a Squad's facing into one of these is `render/squads.ts`.
 */
export const FIGURE_FACINGS = ['north', 'east', 'south', 'west'] as const;

/** One of the four directions a soldier is drawn facing. */
export type FigureFacing = (typeof FIGURE_FACINGS)[number];

/**
 * What a soldier is doing, and therefore which frames exist for it.
 *
 * The plan's four, and no more: extraordinary animation is out of scope, and a
 * death that plays once needs at most one frame when the whole figure is ten
 * pixels wide.
 */
export const FIGURE_ACTIONS = ['idle', 'walk', 'attack', 'death'] as const;

/** One of the four things a soldier is drawn doing. */
export type FigureAction = (typeof FIGURE_ACTIONS)[number];

/** How many frames each action is drawn in: walking and striking are the two that move. */
export const FRAMES_OF: Readonly<Record<FigureAction, number>> = {
  idle: 1,
  walk: 2,
  attack: 2,
  death: 1,
};

/**
 * One frame of one action: an action and which step of it.
 *
 * `step` is zero-based and always less than `FRAMES_OF[action]`, which
 * `figureFrame` is the only way to build a frame that does not hold: a caller
 * picks a step from the Match's tick, so the pair has to be refused rather than
 * drawn as a hole.
 */
export interface FigureFrame {
  readonly action: FigureAction;
  readonly step: number;
}

/** Every frame of every action, in reading order: what the Atelier walks. */
export const FIGURE_FRAMES: readonly FigureFrame[] = FIGURE_ACTIONS.flatMap((action) =>
  Array.from({ length: FRAMES_OF[action] }, (_unused, step) => ({ action, step })),
);

/**
 * One frame, checked.
 *
 * @throws RangeError when the action is not one a soldier has, or the step is
 *   not one of that action's frames.
 */
export function figureFrame(action: FigureAction, step: number): FigureFrame {
  const frames = FRAMES_OF[action];
  if (frames === undefined) {
    throw new RangeError(`"${String(action)}" is not something a soldier is drawn doing`);
  }
  if (!Number.isInteger(step) || step < 0 || step >= frames) {
    throw new RangeError(`a soldier's ${action} has no frame ${String(step)}`);
  }

  return { action, step };
}

/**
 * A frame's name, as a catalogue entry and a cache key write it: `idle`,
 * `walk:1`, `attack:0`.
 */
export function frameName(frame: FigureFrame): string {
  return FRAMES_OF[frame.action] === 1 ? frame.action : `${frame.action}:${String(frame.step)}`;
}

/**
 * The equipment a silhouette is built from.
 *
 * Three kinds of each, because the Roman roster has three Squad types and the
 * plan asks for form-and-silhouette differentiation (PLAN §8). A shield kind is
 * a shape and a size; a weapon kind is how tall the thing beside the man is; a
 * helmet kind is what is on his head, which at this size is a crest and how far
 * it sticks up.
 */
export const SHIELD_KINDS = ['parma', 'scutum', 'hoplon'] as const;
export type ShieldKind = (typeof SHIELD_KINDS)[number];

export const WEAPON_KINDS = ['pilum', 'gladius', 'hasta'] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

export const HELMET_KINDS = ['cap', 'crest', 'transverse'] as const;
export type HelmetKind = (typeof HELMET_KINDS)[number];

/** What one soldier of the Roman roster is: the parts he is composed from. */
export interface FigureLook {
  /** The shape that reads at the lowest zoom: his shield. */
  readonly shield: ShieldKind;
  /** How tall the thing in his hand is. */
  readonly weapon: WeaponKind;
  /** What is on his head. */
  readonly helmet: HelmetKind;
}

/**
 * The Roman roster, one look each.
 *
 * The three are the army's three lines, and each is given the equipment that
 * makes it *tellable* rather than the equipment it is owed historically:
 *
 * - **hastati** — a small round `parma` and a `pilum`: the lightest silhouette,
 *   all gaps around a narrow body;
 * - **principes** — the tall `scutum`, a wall of a shield with a horizontal boss,
 *   and a short `gladius` that adds nothing beside it: the boxiest silhouette;
 * - **triarii** — a great round `hoplon` and a `hasta` whose head stands above
 *   every other man's helmet: the tallest silhouette, which is exactly what the
 *   third line should look like.
 */
export const FIGURE_LOOKS: Readonly<Record<FigureName, FigureLook>> = {
  hastati: { shield: 'parma', weapon: 'pilum', helmet: 'cap' },
  principes: { shield: 'scutum', weapon: 'gladius', helmet: 'crest' },
  triarii: { shield: 'hoplon', weapon: 'hasta', helmet: 'transverse' },
};

/** The figures the art library draws: the Roman roster, in content order. */
export const FIGURE_NAMES = ['hastati', 'principes', 'triarii'] as const;

/** One soldier of the Roman roster. */
export type FigureName = (typeof FIGURE_NAMES)[number];

/**
 * The two Factions, as a *palette* rather than as a simulation concept.
 *
 * `art/` has no Faction: it has a cloth colour. Rome's is the blood ramp, and
 * Carthage's is linen — pale, far from red, and impossible to confuse with a
 * Roman block at any zoom. C4 owns the Carthaginian roster and its silhouettes;
 * until then a Carthaginian Squad is drawn from the same three soldiers in the
 * other palette, which is honest about what has been drawn and what is still to
 * be designed.
 */
export const FIGURE_FACTIONS = ['rome', 'carthage'] as const;
export type FigureFaction = (typeof FIGURE_FACTIONS)[number];

/** The colours one soldier is drawn from: a Faction's cloth, and the metal and skin every Faction shares. */
interface Palette {
  readonly outline: Rgba;
  readonly skin: Rgba;
  readonly skinDark: Rgba;
  readonly cloth: Rgba;
  readonly clothDark: Rgba;
  readonly metal: Rgba;
  readonly metalLit: Rgba;
  readonly shaft: Rgba;
  readonly boss: Rgba;
}

/** The outline every figure is drawn against: the palette's darkest, so a man reads on grass and on rock. */
const OUTLINE = BASE.ink;

/** The parts of a soldier every Faction shares: a man, and iron. */
const COMMON = {
  outline: OUTLINE,
  skin: shadeAt(RAMPS.parchment, 1),
  skinDark: shadeAt(RAMPS.parchment, 0),
  metal: shadeAt(RAMPS.bronze, 4),
  metalLit: shadeAt(RAMPS.bronze, 6),
  shaft: shadeAt(RAMPS.bronze, 2),
  boss: shadeAt(RAMPS.bronze, 5),
} as const;

/** The palette each Faction's cloth is drawn from. */
const PALETTES: Readonly<Record<FigureFaction, Palette>> = {
  rome: { ...COMMON, cloth: shadeAt(RAMPS.blood, 4), clothDark: shadeAt(RAMPS.blood, 2) },
  carthage: { ...COMMON, cloth: shadeAt(RAMPS.parchment, 4), clothDark: shadeAt(RAMPS.parchment, 2) },
};

/** The figures already drawn: a block asks for the same one a hundred times. */
const SOLDIERS = new Map<string, PixelBuffer>();

/**
 * One soldier, in one direction, in one frame.
 *
 * @throws RangeError when the figure is not one the roster has, or the palette
 *   is not one of the two Factions.
 */
export function soldier(
  figure: FigureName,
  facing: FigureFacing,
  frame: FigureFrame,
  faction: FigureFaction = 'rome',
): PixelBuffer {
  const look = FIGURE_LOOKS[figure];
  if (look === undefined) throw new RangeError(`"${String(figure)}" is not a soldier the roster draws`);

  const palette = PALETTES[faction];
  if (palette === undefined) throw new RangeError(`"${String(faction)}" is not a Faction's palette`);

  // Every frame of an action has to exist: a caller that picked a step from a
  // tick gets the refusal here rather than a blank square in a block.
  figureFrame(frame.action, frame.step);

  const key = `${figure}:${facing}:${frameName(frame)}:${faction}`;
  const known = SOLDIERS.get(key);
  if (known !== undefined) return known;

  const drawn = draw(look, palette, facing, frame);
  SOLDIERS.set(key, drawn);

  return drawn;
}

/**
 * Every figure of the Roman roster in every direction and every frame, named for
 * the catalogue and the Atelier: `figure:hastati:south:walk:1`.
 *
 * The Atelier's whole reason for existing is that art nobody can see is art
 * nobody can fix (PLAN §3), and a soldier is the first art in the game that has
 * *states* — four directions and four actions — so the plate is where a frame
 * that reads badly, or a direction that looks the same as another, is caught by
 * a human rather than by a player.
 */
export function figureEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  const entries: { name: string; buffer: PixelBuffer }[] = [];

  for (const figure of FIGURE_NAMES) {
    for (const facing of FIGURE_FACINGS) {
      for (const frame of FIGURE_FRAMES) {
        entries.push({
          name: `figure:${figure}:${facing}:${frameName(frame)}`,
          buffer: soldier(figure, facing, frame),
        });
      }
    }
  }

  return entries;
}

/** Draws one soldier, mirroring the two views that are not authored. */
function draw(
  look: FigureLook,
  palette: Palette,
  facing: FigureFacing,
  frame: FigureFrame,
): PixelBuffer {
  // The side view stands for east and west; the front view for south and, with
  // its face painted out, for north.
  const side = facing === 'east' || facing === 'west';
  const fromBehind = facing === 'north';

  const drawn = frame.action === 'death'
    ? lyingDown(look, palette)
    : side
      ? profile(look, palette, frame)
      : upright(look, palette, frame, fromBehind);

  return facing === 'west' || facing === 'north' ? mirrored(drawn) : drawn;
}

/**
 * The front (or, from behind, the back) of a soldier: south and north.
 *
 * Front view: the shield on his left arm, which is the viewer's right; the
 * weapon in his right hand, on the viewer's left. From behind the figure is
 * mirrored, so the shield ends up on the viewer's left — which is where a shield
 * held in front of a man is seen from behind him — and the face is painted over
 * with the back of his head.
 */
function upright(
  look: FigureLook,
  palette: Palette,
  frame: FigureFrame,
  fromBehind: boolean,
): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const upper = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const brace = frame.action === 'attack';

  legs(figure, palette, frame, brace);
  torso(upper, palette, fromBehind);
  head(upper, palette, look.helmet, fromBehind);
  shield(upper, palette, look.shield, 'front');
  weapon(upper, palette, look.weapon, 'front', frame);

  blit(figure, upper, 0, bobOf(frame));

  return figure;
}

/** The profile of a soldier, facing right: east, and west when mirrored. */
function profile(look: FigureLook, palette: Palette, frame: FigureFrame): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const upper = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const brace = frame.action === 'attack';

  legs(figure, palette, frame, brace, 'side');
  torso(upper, palette, false, 'side');
  head(upper, palette, look.helmet, false, 'side');
  shield(upper, palette, look.shield, 'side');
  weapon(upper, palette, look.weapon, 'side', frame);

  blit(figure, upper, 0, bobOf(frame));

  return figure;
}

/**
 * A soldier where he fell: the body along the ground, the shield beside it.
 *
 * One pose, and it is the pose that matters: a death is *residue* (PLAN §4) and
 * never state, so the only thing a frame has to say is "there was a man here".
 * He lies with his head to the left, which reads as a body at one tile of
 * sixteen pixels and stays out of the way of the men still standing.
 */
function lyingDown(look: FigureLook, palette: Palette): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);

  // The body: a strip along the ground, with a darker outline under it.
  fillRect(figure, 0, 13, FIGURE_WIDTH, 1, palette.outline);
  fillRect(figure, 0, 11, 8, 2, palette.cloth);
  fillRect(figure, 1, 11, 1, 2, palette.clothDark);
  // The head, at the left, under its helmet.
  fillRect(figure, 0, 11, 1, 2, palette.skin);
  fillRect(figure, 0, 10, 2, 1, palette.metal);

  // The shield, dropped where the hand was.
  fillRect(figure, 6, 8, 4, 3, palette.outline);
  fillRect(figure, 6, 8, 4, 2, palette.clothDark);
  setPixel(figure, 7, 8, palette.boss);

  // And the weapon, still in his hand: one line pointing away from him.
  const spear = look.weapon === 'hasta' ? 4 : look.weapon === 'pilum' ? 3 : 1;
  fillRect(figure, 5, 12, spear, 1, palette.shaft);
  setPixel(figure, 5 + spear, 12, palette.metalLit);

  return figure;
}

/**
 * How far a walking soldier's upper body rides above where he stands.
 *
 * One pixel, on the second frame of the march: a block of men bobbing out of
 * step is the difference between a formation walking and a formation sliding,
 * and one pixel is all a ten-pixel figure has to spend on it.
 */
function bobOf(frame: FigureFrame): number {
  return frame.action === 'walk' && frame.step === 1 ? -1 : 0;
}

/**
 * Legs, and the two frames of a march.
 *
 * Walking is which leg is lifted: `walk:0` lifts the viewer's-left leg and
 * `walk:1` the other, so a block of men alternating the two frames reads as a
 * column on the move. An attack braces: both feet planted a pixel wider than
 * they stand, which is the difference between a soldier and a man about to
 * receive a charge.
 */
function legs(
  figure: PixelBuffer,
  palette: Palette,
  frame: FigureFrame,
  brace: boolean,
  view: 'front' | 'side' = 'front',
): void {
  if (view === 'side') {
    // A profile: one leg forward and one behind, and the stride widens on the
    // second frame, which is what a march looks like from the side. Standing and
    // bracing are the two feet together and the two feet apart.
    const stride = frame.action === 'walk' ? frame.step : 0;
    const forward = frame.action === 'walk' ? 6 + stride : brace ? 6 : 5;
    const back = frame.action === 'walk' ? 3 - stride : brace ? 2 : 3;

    leg(figure, palette, back, false);
    leg(figure, palette, forward, false);

    return;
  }

  // Standing has the feet together; a march lifts one and reaches with the
  // other, and swaps them on the next frame; an attack plants them wide.
  const stepping = frame.action === 'walk' && frame.step === 0;
  const striding = frame.action === 'walk' && frame.step === 1;
  const left = brace ? 2 : stepping ? 2 : striding ? 4 : 3;
  const right = brace ? 6 : stepping ? 5 : striding ? 6 : 5;

  leg(figure, palette, left, stepping);
  leg(figure, palette, right, striding);
}

/** One leg: a leg's length of cloth, and a foot below it, shorter when it is lifted. */
function leg(figure: PixelBuffer, palette: Palette, x: number, lifted: boolean): void {
  const top = 10;
  const height = lifted ? 2 : 3;

  fillRect(figure, x, top, 1, height, palette.clothDark);

  // A lifted foot is a foot at the height the leg reaches; a planted one is on
  // the ground, in the outline, which is what grounds the figure.
  fillRect(figure, x, top + height, 1, 1, lifted ? palette.clothDark : palette.outline);
}

/** The body: a tunic under a shoulder of mail, and a belt at the waist. */
function torso(
  figure: PixelBuffer,
  palette: Palette,
  fromBehind: boolean,
  view: 'front' | 'side' = 'front',
): void {
  if (view === 'side') {
    fillRect(figure, 3, 7, 3, 3, palette.cloth);
    fillRect(figure, 3, 7, 3, 1, palette.metal);
    fillRect(figure, 3, 9, 3, 1, palette.clothDark);
    return;
  }

  fillRect(figure, 3, 7, 4, 3, palette.cloth);
  fillRect(figure, 3, 7, 4, 1, palette.metal);
  fillRect(figure, 3, 9, 4, 1, palette.clothDark);

  // Arms. From behind they are the same arms: a soldier's back is a soldier's
  // back, and the mirror is what puts the shield on the correct side.
  fillRect(figure, 2, 7, 1, 3, fromBehind ? palette.clothDark : palette.skin);
  fillRect(figure, 7, 7, 1, 3, fromBehind ? palette.clothDark : palette.skin);
}

/** The head, under a helmet: a crest is what makes the third line the tallest thing on the field. */
function head(
  figure: PixelBuffer,
  palette: Palette,
  helmet: HelmetKind,
  fromBehind: boolean,
  view: 'front' | 'side' = 'front',
): void {
  const x = view === 'side' ? 4 : 4;

  // The head itself, and no face at this size: one dark pixel is a visor, and a
  // man seen from behind wears his hair where his face was.
  fillRect(figure, x, 5, 2, 2, fromBehind ? palette.clothDark : palette.skin);
  if (!fromBehind) setPixel(figure, x, 6, palette.skinDark);

  // The helmet: a cap of bronze with a brim over it.
  fillRect(figure, x - 1, 3, 4, 1, palette.metal);
  fillRect(figure, x - 2, 4, 6, 1, palette.metalLit);

  if (helmet === 'crest') {
    // A low crest along the top: a principes' crest, and its own small hill.
    fillRect(figure, x - 1, 2, 4, 1, palette.cloth);
    fillRect(figure, x, 2, 2, 1, palette.clothDark);
  }
  if (helmet === 'transverse') {
    // A transverse crest: across the helmet, wider than the crest beside it, so
    // the triarius stands out even in a mass of helmets — and low enough that
    // his spear, not his head, is the tallest thing in the block.
    fillRect(figure, x - 2, 2, 6, 1, palette.clothDark);
    fillRect(figure, x - 1, 1, 4, 1, palette.cloth);
  }
}

/**
 * The shield, which is the silhouette.
 *
 * Three shapes and three sizes, drawn from the same handful of rectangles so
 * that they cannot disagree about their outline, their rim or their boss:
 *
 * - **scutum**: a rectangle four wide and seven tall — a wall beside the man;
 * - **parma**: a small oval, three wide and four tall, carried low;
 * - **hoplon**: a great round shield, four wide and four tall, its rim bronze.
 *
 * In profile each is narrower by one pixel, because a shield seen edge-on is a
 * narrower thing; that is the whole of the side view's shield, and it is enough.
 */
function shield(
  figure: PixelBuffer,
  palette: Palette,
  kind: ShieldKind,
  view: 'front' | 'side',
): void {
  if (view === 'side') {
    const x = 6;

    if (kind === 'scutum') {
      rimmed(figure, palette, x, 5, 3, 6, palette.cloth);
    } else if (kind === 'parma') {
      oval(figure, palette, x, 7, 3, 4, palette.cloth);
    } else {
      oval(figure, palette, x, 6, 3, 4, palette.cloth, palette.metal);
    }

    return;
  }

  const x = 6;

  if (kind === 'scutum') {
    rimmed(figure, palette, x, 5, 4, 7, palette.cloth);
    // The boss, horizontal: the scutum's one piece of metal, and at this size
    // the thing that tells a rectangle from a rectangle.
    fillRect(figure, x + 1, 7, 2, 2, palette.boss);
    return;
  }
  if (kind === 'parma') {
    oval(figure, palette, x, 7, 3, 4, palette.cloth, palette.boss);
    return;
  }

  // The hoplon: round, rimmed in bronze, with an emblem in the middle of it.
  oval(figure, palette, x, 6, 4, 5, palette.cloth, palette.metal);
  setPixel(figure, x + 1, 8, palette.boss);
  setPixel(figure, x + 2, 8, palette.boss);
}

/** A rectangle with a one-pixel rim and an outline under it, so a shield reads against a body. */
function rimmed(
  figure: PixelBuffer,
  palette: Palette,
  x: number,
  y: number,
  width: number,
  height: number,
  face: Rgba,
): void {
  fillRect(figure, x, y, width, height, palette.outline);
  fillRect(figure, x, y, width - 1, height - 1, palette.metal);
  fillRect(figure, x + 1, y + 1, width - 2, height - 2, face);
}

/**
 * An oval shield: a rounded silhouette rather than a rectangle, built from rows.
 *
 * The width of each row is the whole difference between the three shapes at this
 * size, so it is written as a shape rather than as a per-kind set of rectangles.
 */
function oval(
  figure: PixelBuffer,
  palette: Palette,
  x: number,
  y: number,
  width: number,
  height: number,
  face: Rgba,
  rim: Rgba = palette.metal,
): void {
  for (let row = 0; row < height; row += 1) {
    // The rows of an oval: narrow at both ends, full in the middle, and rimmed
    // all the way round — which is what tells a round shield from a rectangle
    // of the same size.
    const inset = row === 0 || row === height - 1 ? 1 : 0;
    const left = x + inset;
    const wide = width - 2 * inset;
    if (wide < 1) continue;

    fillRect(figure, left, y + row, wide, 1, rim);
    if (wide > 2) fillRect(figure, left + 1, y + row, wide - 2, 1, face);
  }

  // An outline around the oval: the pixels just outside it, where they are not
  // already the figure's own.
  for (let row = 0; row < height; row += 1) {
    const inset = row === 0 || row === height - 1 ? 1 : 0;
    if (inset === 0) {
      outlinePixel(figure, palette, x, y + row);
      outlinePixel(figure, palette, x + width - 1, y + row);
    }
  }
  for (let column = 0; column < width; column += 1) {
    outlinePixel(figure, palette, x + column, y - 1);
    outlinePixel(figure, palette, x + column, y + height);
  }
}

/** Paints the outline colour where nothing has been drawn yet. */
function outlinePixel(figure: PixelBuffer, palette: Palette, x: number, y: number): void {
  if (x < 0 || y < 0 || x >= figure.width || y >= figure.height) return;
  if (pixelAt(figure, x, y)[3] !== 0) return;

  setPixel(figure, x, y, palette.outline);
}

/**
 * The weapon, and the three things it does.
 *
 * A `pilum` is a javelin that ends above the man's head; a `hasta` is a spear
 * that ends above the whole block, which is the triarius' silhouette; a
 * `gladius` is a short blade that barely leaves the hand. Idle and walking keep
 * it upright; an attack raises it and then puts it forward, which is the only
 * two-frame motion in the catalogue and enough to read as a blow.
 */
function weapon(
  figure: PixelBuffer,
  palette: Palette,
  kind: WeaponKind,
  view: 'front' | 'side',
  frame: FigureFrame,
): void {
  const thrust = frame.action === 'attack' && frame.step === 1;

  if (view === 'side') {
    if (thrust) {
      // Forward, at the height of a thrust: one line out in front of the man.
      const reach = kind === 'gladius' ? 1 : 3;
      fillRect(figure, 6, 8, reach, 1, palette.shaft);
      setPixel(figure, 6 + reach, 8, palette.metalLit);
      return;
    }

    if (frame.action === 'attack') {
      // A profile's wind-up pulls the weapon back over the shoulder, which reads
      // as the moment before the thrust and is nothing like standing.
      for (let step = 0; step < 4; step += 1) {
        setPixel(figure, 6 - step, 8 - step, palette.shaft);
      }
      setPixel(figure, 2, 4, palette.metalLit);
      return;
    }

    const top = kind === 'hasta' ? 0 : kind === 'pilum' ? 3 : 8;
    const x = kind === 'gladius' ? 6 : 9;
    fillRect(figure, x, top, 1, 9 - top, palette.shaft);
    if (kind !== 'gladius') setPixel(figure, x, top, palette.metalLit);
    return;
  }

  if (frame.action === 'attack' && frame.step === 0) {
    // The front of a wind-up: the weapon has left the man's side and is coming
    // down across him, which is the one direction a thrust toward the viewer can
    // be shown from in front.
    for (let step = 0; step < 3; step += 1) setPixel(figure, 1 + step, 7 + step, palette.shaft);
    setPixel(figure, 1, 7, palette.metalLit);
    return;
  }

  if (thrust) {
    // Toward the viewer, which from the front is a blade held out at the height
    // of the hand: the shield rises a pixel and the weapon leaves the man's side.
    fillRect(figure, 1, 8, 3, 1, palette.shaft);
    setPixel(figure, 0, 8, palette.metalLit);
    return;
  }

  const top = kind === 'hasta' ? 0 : kind === 'pilum' ? 3 : 8;
  fillRect(figure, 1, top, 1, 10 - top, palette.shaft);
  if (kind !== 'gladius') setPixel(figure, 1, top, palette.metalLit);
}

/**
 * A copy of a figure reflected left to right.
 *
 * The pipeline has a quarter turn and no mirror (nothing before C2 needed one),
 * and a mirror is four lines: the pixel at `(x, y)` comes from `(width − 1 − x,
 * y)`. It is written here rather than in `pixel-buffer.ts` because a mirror is
 * only a figure's business: a terrain tile or a glyph is never mirrored to make
 * a second variant, and a primitive nobody uses is a primitive nobody checks.
 */
function mirrored(figure: PixelBuffer): PixelBuffer {
  const reflected = createPixelBuffer(figure.width, figure.height, TRANSPARENT);

  for (let y = 0; y < figure.height; y += 1) {
    for (let x = 0; x < figure.width; x += 1) {
      setPixel(reflected, x, y, pixelAt(figure, figure.width - 1 - x, y));
    }
  }

  return reflected;
}

