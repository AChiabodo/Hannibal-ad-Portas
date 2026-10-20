/**
 * The Squads' soldiers, drawn: paper dolls composed out of parts (ticket C2, C4,
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
 * kind decides a few drawn pixels and, through them, the silhouette — so a
 * roster is tables and not hundreds of hand-drawn sprites, and a new soldier is
 * a new row rather than a new artist. That is ADR-0002's rule taken seriously:
 * what is committed is code and numbers, and the pixel tables a reader judges
 * are a few dozen lines each.
 *
 * The **silhouette is the design and the colour is the confirmation**, which is
 * B3's rule for resource markers applied to soldiers, and for a sharper reason:
 * a block of a hundred and twenty men is a mass of colour at the lowest zoom, so
 * what tells a hastatus from a triarius there is a *shape*. C4's criterion is
 * the sharp form of the same rule: every Carthaginian type has to be tellable
 * from its Roman counterpart **in greyscale**, so no two of the nine squad types
 * share a shield, and the weapon and the head are chosen to say the same thing
 * a second time. The palette is a Faction's, and it is the second thing a player
 * learns rather than the first.
 *
 * ## The two rosters
 *
 * | figure           | shield    | weapon     | head       | mount  |
 * | ---------------- | --------- | ---------- | ---------- | ------ |
 * | hastati          | parma     | pilum      | cap        | foot   |
 * | principes        | scutum    | gladius    | crest      | foot   |
 * | triarii          | hoplon    | hasta      | transverse | foot   |
 * | libyan-spear     | thureos   | spear      | bare       | foot   |
 * | gaul             | gaulish   | longsword  | bare       | foot   |
 * | iberian-sword    | caetra    | falcata    | bare       | foot   |
 * | balearic-slinger | none      | sling      | bare       | foot   |
 * | numidian-horse   | none      | javelins   | bare       | horse  |
 * | elephant         | —         | —          | —          | beast  |
 *
 * Rome's three are a line that gets heavier: the little round `parma` and a
 * pilum, the wall of the `scutum` and a short `gladius`, the great round `hoplon`
 * under a spear that reaches over every helmet. Carthage's are a coalition:
 * a tall oval `thureos` behind a plain spear, a wide `gaulish` shield beside a
 * longsword and a bare head, the small round `caetra` of the scutarii with a
 * curved `falcata`, a slinger with no shield at all, a horseman with no shield
 * and a fistful of javelins, and the elephant. A shield is a shape and a size; a
 * weapon is how tall the thing beside the man is and what its tip does; a helmet
 * is what is on his head, or — for the bare-headed half of Carthage's roster —
 * the hair that is there instead.
 *
 * ## A Squad of a single figure
 *
 * An elephant is a Squad of a single figure (ADR-0004): one beast with the
 * staying power of a body of men (`content/squads.ts` says so). The beast is not
 * a paper doll and does not pretend to be one; it is its own drawing, in the
 * same box as a man, with the trunk, the ears and the trapper doing at ten
 * pixels what a shield and a helmet do for a soldier — saying, at a glance and
 * in greyscale, that this is not a man.
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

/** How wide one figure is drawn, in pixels. */
export const FIGURE_WIDTH = 10;

/**
 * How tall one figure is drawn, in pixels: eleven of body, and three rows above
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

/** The figures the art library draws: both rosters, in content order. */
export const FIGURE_NAMES = [
  'hastati',
  'principes',
  'triarii',
  'libyan-spear',
  'gaul',
  'iberian-sword',
  'balearic-slinger',
  'numidian-horse',
  'elephant',
] as const;

/** One soldier of either roster, named by the Squad type it draws. */
export type FigureName = (typeof FIGURE_NAMES)[number];

/**
 * The shield kinds, which are the silhouette.
 *
 * Seven kinds, and no two of the types that carry a shield share one, because
 * the shield is the shape a player reads at the lowest zoom. The last kind is a
 * negative on purpose — the slinger and the horseman carry no shield at all, and
 * at ten pixels a *missing* shield is as loud as a large one; the two of them are
 * told apart by the horse under one of them.
 */
export const SHIELD_KINDS = ['parma', 'scutum', 'hoplon', 'thureos', 'caetra', 'gaulish', 'none'] as const;
export type ShieldKind = (typeof SHIELD_KINDS)[number];

/**
 * The weapon kinds: how tall the thing beside the man is and what its tip does.
 *
 * `spear` and `hasta` are both tall shafts and differ by where the head stands;
 * `longsword` is the only blade that reaches the top row; `falcata` is the only
 * curved one; `sling` and `javelins` are what a man with no shield carries.
 */
export const WEAPON_KINDS = [
  'pilum',
  'gladius',
  'hasta',
  'spear',
  'longsword',
  'falcata',
  'sling',
  'javelins',
] as const;
export type WeaponKind = (typeof WEAPON_KINDS)[number];

/** What is on a soldier's head: three helmets and the bare head half of Carthage wears. */
export const HELMET_KINDS = ['cap', 'crest', 'transverse', 'bare'] as const;
export type HelmetKind = (typeof HELMET_KINDS)[number];

/** A man and the equipment hung on him. */
export interface SoldierLook {
  /** Whether the doll is a man or the upper half of a man on a horse. */
  readonly kind: 'soldier';

  /** How he gets about: on his own feet, or on a horse drawn under him. */
  readonly mount: 'foot' | 'horse';

  /** The shape that reads at the lowest zoom: his shield, or none. */
  readonly shield: ShieldKind;

  /** How tall the thing in his hand is, and what its tip does. */
  readonly weapon: WeaponKind;

  /** What is on his head. */
  readonly helmet: HelmetKind;
}

/**
 * A Squad of a single figure that is not a man: the elephant.
 *
 * It has no parts to compose because there is nothing a shield or a helmet can
 * say about it that a trunk, a pair of ears and a trapper in the Faction's cloth
 * does not say better. The distinction is in the type rather than in four ignored
 * fields, so a reader of `FIGURE_LOOKS` cannot wonder what an elephant's helmet
 * is.
 */
export interface BeastLook {
  readonly kind: 'beast';
}

/** Everything a figure is composed from, or the beast that is not composed. */
export type FigureLook = SoldierLook | BeastLook;

/**
 * The two rosters, one look each.
 *
 * Each is given the equipment that makes it *tellable* rather than the equipment
 * it is owed historically — the criterion is a silhouette a player can read in
 * greyscale, and history is the menu this module orders from rather than a
 * specification it must match. The Roman line is C2's, unchanged; Carthage's six
 * are C4's, and each has a shield, a head and a weapon that no Roman type has.
 */
export const FIGURE_LOOKS: Readonly<Record<FigureName, FigureLook>> = {
  hastati: { kind: 'soldier', mount: 'foot', shield: 'parma', weapon: 'pilum', helmet: 'cap' },
  principes: { kind: 'soldier', mount: 'foot', shield: 'scutum', weapon: 'gladius', helmet: 'crest' },
  triarii: { kind: 'soldier', mount: 'foot', shield: 'hoplon', weapon: 'hasta', helmet: 'transverse' },
  'libyan-spear': { kind: 'soldier', mount: 'foot', shield: 'thureos', weapon: 'spear', helmet: 'bare' },
  gaul: { kind: 'soldier', mount: 'foot', shield: 'gaulish', weapon: 'longsword', helmet: 'bare' },
  'iberian-sword': { kind: 'soldier', mount: 'foot', shield: 'caetra', weapon: 'falcata', helmet: 'bare' },
  'balearic-slinger': { kind: 'soldier', mount: 'foot', shield: 'none', weapon: 'sling', helmet: 'bare' },
  'numidian-horse': { kind: 'soldier', mount: 'horse', shield: 'none', weapon: 'javelins', helmet: 'bare' },
  elephant: { kind: 'beast' },
};

/**
 * The two Factions, as a *palette* rather than as a simulation concept.
 *
 * `art/` has no Faction: it has a cloth colour. Rome's is the blood ramp, and
 * Carthage's is linen — pale, far from red, and impossible to confuse with a
 * Roman block at any zoom. Since C4 a Faction is not decoration but the roster's
 * own second half: the cloth on a figure is the cloth of the Faction whose Squad
 * type it draws, and `soldier` reads that from `FIGURE_FACTION` unless a caller
 * overrides it.
 */
export const FIGURE_FACTIONS = ['rome', 'carthage'] as const;
export type FigureFaction = (typeof FIGURE_FACTIONS)[number];

/**
 * The Faction whose roster draws each figure.
 *
 * A table rather than a lookup through `content/`, because `art/` is a pure
 * generator that knows nothing about the simulation: what it needs is a cloth
 * colour, and a colour is the only thing this says. The Atelier draws each
 * figure in its own Faction's cloth because of this table, which is how "the
 * whole Carthaginian roster appears in the Atelier" is true of the plate and not
 * merely of a list of names.
 */
export const FIGURE_FACTION: Readonly<Record<FigureName, FigureFaction>> = {
  hastati: 'rome',
  principes: 'rome',
  triarii: 'rome',
  'libyan-spear': 'carthage',
  gaul: 'carthage',
  'iberian-sword': 'carthage',
  'balearic-slinger': 'carthage',
  'numidian-horse': 'carthage',
  elephant: 'carthage',
};

/** The colours one figure is drawn from: a Faction's cloth, and the metal, skin and hide every Faction shares. */
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
  readonly hide: Rgba;
  readonly hideDark: Rgba;
}

/** The outline every figure is drawn against: the palette's darkest, so a man reads on grass and on rock. */
const OUTLINE = BASE.ink;

/** The parts every figure shares: a man, iron, and an animal's hide. */
const COMMON = {
  outline: OUTLINE,
  skin: shadeAt(RAMPS.parchment, 1),
  skinDark: shadeAt(RAMPS.parchment, 0),
  metal: shadeAt(RAMPS.bronze, 4),
  metalLit: shadeAt(RAMPS.bronze, 6),
  shaft: shadeAt(RAMPS.bronze, 2),
  boss: shadeAt(RAMPS.bronze, 5),
  // The stone ramp is the one grey the theatre already trusts: a hide that read
  // as cloth would make a horse look like a man on all fours.
  hide: shadeAt(RAMPS.stone, 3),
  hideDark: shadeAt(RAMPS.stone, 1),
} as const;

/** The palette each Faction's cloth is drawn from. */
const PALETTES: Readonly<Record<FigureFaction, Palette>> = {
  rome: { ...COMMON, cloth: shadeAt(RAMPS.blood, 4), clothDark: shadeAt(RAMPS.blood, 2) },
  carthage: { ...COMMON, cloth: shadeAt(RAMPS.parchment, 4), clothDark: shadeAt(RAMPS.parchment, 2) },
};

/** The figures already drawn: a block asks for the same one a hundred times. */
const SOLDIERS = new Map<string, PixelBuffer>();

/**
 * One figure, in one direction, in one frame.
 *
 * The palette is the figure's own Faction's unless a caller says otherwise; the
 * override exists for the Atelier and for tests that want to see the same
 * drawing in the other cloth, not because a roster's figures are interchangeable.
 *
 * @throws RangeError when the figure is not one the roster has, or the palette
 *   is not one of the two Factions.
 */
export function soldier(
  figure: FigureName,
  facing: FigureFacing,
  frame: FigureFrame,
  faction: FigureFaction = FIGURE_FACTION[figure] ?? 'rome',
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
 * Every figure of both rosters in every direction and every frame, named for the
 * catalogue and the Atelier: `figure:elephant:south:walk:1`.
 *
 * The Atelier's whole reason for existing is that art nobody can see is art
 * nobody can fix (PLAN §3), and a soldier is the first art in the game that has
 * *states* — four directions and four actions — so the plate is where a frame
 * that reads badly, or a direction that looks the same as another, is caught by
 * a human rather than by a player. Each is drawn in its own Faction's cloth, so
 * the Carthaginian roster on the plate is the roster a Carthaginian army is
 * drawn with and not a set of Roman figures renamed.
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

  // The Faction's standard travels with the figure section because it is the
  // insignia a block of those figures carries, and because it is judged the same
  // way: a shape first, and the cloth second (#58).
  for (const faction of FIGURE_FACTIONS) {
    entries.push({ name: `insignia:${faction}`, buffer: standardInsignia(faction) });
  }

  return entries;
}

/** How wide a Faction's standard is drawn, in pixels. */
export const INSIGNIA_WIDTH = 6;

/** How tall it is drawn: a pole, and the cloth above the men's heads. */
export const INSIGNIA_HEIGHT = 13;

/** The standards already drawn: a block asks for its Faction's on every redraw. */
const STANDARDS = new Map<FigureFaction, PixelBuffer>();

/**
 * The standard a Squad of a Faction carries, drawn from the Faction's own cloth.
 *
 * This is the ticket's **restrained insignia**: the cloth colour already says
 * which Faction a block belongs to, but a mass of overlapping shields and
 * helmets hides most of it. A standard stands above the block, so the colour it
 * carries is never covered by the men it marks — and the two standards differ in
 * **silhouette** as well as colour, because that is the rule every other mark in
 * this library follows:
 *
 * - **Rome's** is a rectangle of cloth on a bronze pole, with the aquila
 *   abstracted to a bronze bar under a raised centre;
 * - **Carthage's** is a swallow-tailed pennant, with the Tanit sign abstracted to
 *   a bar under a dot in the darker cloth.
 *
 * The standard is drawn *behind* the men (`render/squad-layer.ts` sorts it under
 * every block), so it reads as a thing carried at the back of the formation
 * rather than as a figure in it.
 */
export function standardInsignia(faction: FigureFaction): PixelBuffer {
  const known = STANDARDS.get(faction);
  if (known !== undefined) return known;

  const palette = PALETTES[faction];
  if (palette === undefined) throw new RangeError(`"${String(faction)}" is not a Faction's palette`);

  const standard = createPixelBuffer(INSIGNIA_WIDTH, INSIGNIA_HEIGHT);

  // The pole first, so the cloth is drawn over it: a finial above the cloth,
  // and the shaft running down behind the men.
  fillRect(standard, 1, 1, 1, 11, palette.shaft);
  setPixel(standard, 1, 0, palette.metalLit);
  setPixel(standard, 1, 12, palette.metal);

  if (faction === 'rome') {
    // A rectangle of cloth, trimmed in ink, with the aquila's bar across it.
    fillRect(standard, 2, 1, 4, 6, palette.outline);
    fillRect(standard, 2, 2, 4, 4, palette.cloth);
    fillRect(standard, 2, 4, 4, 1, palette.metalLit);
    setPixel(standard, 3, 3, palette.metalLit);
    setPixel(standard, 4, 3, palette.metalLit);
  } else {
    // A pennant that tapers to a tail: the silhouette is not Rome's rectangle
    // even in greyscale, which is what the two standards are recognised by at the
    // lowest zoom.
    fillRect(standard, 2, 1, 4, 4, palette.outline);
    fillRect(standard, 2, 2, 4, 2, palette.cloth);
    fillRect(standard, 3, 5, 2, 2, palette.outline);
    fillRect(standard, 4, 7, 1, 2, palette.outline);
    // The Tanit sign: a bar under a dot, in the darker cloth.
    fillRect(standard, 3, 3, 2, 1, palette.clothDark);
    setPixel(standard, 3, 2, palette.clothDark);
    setPixel(standard, 4, 2, palette.clothDark);
  }

  STANDARDS.set(faction, standard);

  return standard;
}

/** Draws one figure, mirroring the two views that are not authored. */
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

  const drawn = look.kind === 'beast'
    ? beast(palette, side, frame)
    : frame.action === 'death'
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
  look: SoldierLook,
  palette: Palette,
  frame: FigureFrame,
  fromBehind: boolean,
): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const upper = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const brace = frame.action === 'attack';

  if (look.mount === 'horse') horse(figure, palette, 'front', frame, brace);
  else legs(figure, palette, frame, brace);

  torso(upper, palette, fromBehind);
  head(upper, palette, look.helmet, fromBehind);
  shield(upper, palette, look.shield, 'front');
  weapon(upper, palette, look.weapon, 'front', frame);

  blit(figure, upper, 0, bobOf(frame));

  return figure;
}

/** The profile of a soldier, facing right: east, and west when mirrored. */
function profile(look: SoldierLook, palette: Palette, frame: FigureFrame): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const upper = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);
  const brace = frame.action === 'attack';

  if (look.mount === 'horse') horse(figure, palette, 'side', frame, brace);
  else legs(figure, palette, frame, brace, 'side');

  torso(upper, palette, false, 'side');
  head(upper, palette, look.helmet, false);
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
function lyingDown(look: SoldierLook, palette: Palette): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);

  // The body: a strip along the ground, with a darker outline under it.
  fillRect(figure, 0, 13, FIGURE_WIDTH, 1, palette.outline);
  fillRect(figure, 0, 11, 8, 2, palette.cloth);
  fillRect(figure, 1, 11, 1, 2, palette.clothDark);
  // The head, at the left, under its helmet.
  fillRect(figure, 0, 11, 1, 2, palette.skin);
  fillRect(figure, 0, 10, 2, 1, palette.metal);

  // The shield, dropped where the hand was.
  if (look.shield !== 'none') {
    fillRect(figure, 6, 8, 4, 3, palette.outline);
    fillRect(figure, 6, 8, 4, 2, palette.clothDark);
    setPixel(figure, 7, 8, palette.boss);
  }

  // And the weapon, still in his hand: one line pointing away from him.
  const spear = DEATH_REACH[look.weapon];
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

/**
 * A horse, under a rider: the wide four-legged body that says, in greyscale and
 * at ten pixels, that this man is not standing on the ground.
 *
 * The body is a mass four rows deep and eight wide with the rider drawn over it,
 * which is twice the footprint of a man on foot and the whole of the difference
 * at the lowest zoom. The front view has the horse's face and two front legs; the
 * profile has the neck, the head, all four legs and a tail. Walking lifts a leg a
 * frame at a time, exactly as a man's march does, so a Numidian Squad and a Roman
 * one move in the same grammar and are told apart by the body under the man.
 */
function horse(
  figure: PixelBuffer,
  palette: Palette,
  view: 'front' | 'side',
  frame: FigureFrame,
  brace: boolean,
): void {
  const stepping = frame.action === 'walk' && frame.step === 0;
  const striding = frame.action === 'walk' && frame.step === 1;

  if (view === 'side') {
    // The body, the belly shadow, and the tail behind it.
    fillRect(figure, 1, 9, 6, 3, palette.hide);
    fillRect(figure, 1, 11, 6, 1, palette.hideDark);
    fillRect(figure, 0, 8, 1, 3, palette.hideDark);
    // The neck and the head, forward of the rider and clear of his hands.
    fillRect(figure, 6, 7, 2, 3, palette.hide);
    fillRect(figure, 7, 6, 2, 2, palette.hide);
    setPixel(figure, 9, 6, palette.hideDark);
    setPixel(figure, 8, 5, palette.hide);
    // Four legs, with one lifted on each frame of the march.
    const frontX = brace ? 8 : 6;
    const backX = brace ? 1 : 2;
    fillRect(figure, backX, 11, 1, stepping ? 2 : 3, palette.hideDark);
    fillRect(figure, 3, 11, 1, 3, palette.hideDark);
    fillRect(figure, frontX, 11, 1, striding ? 2 : 3, palette.hideDark);
    fillRect(figure, 4, 11, 1, 3, palette.hideDark);

    return;
  }

  // Front view: the chest, two forelegs and the face between them.
  fillRect(figure, 1, 9, 8, 3, palette.hide);
  fillRect(figure, 1, 11, 8, 1, palette.hideDark);
  fillRect(figure, 3, 11, 4, 2, palette.hide);
  setPixel(figure, 4, 13, palette.hideDark);
  setPixel(figure, 5, 13, palette.hideDark);
  // The ears, and the eyes on the face.
  setPixel(figure, 3, 10, palette.hideDark);
  setPixel(figure, 6, 10, palette.hideDark);
  setPixel(figure, 4, 11, palette.outline);
  setPixel(figure, 5, 11, palette.outline);
  // Two forelegs, one lifted on each frame of the march.
  fillRect(figure, 1, 9, 2, stepping ? 4 : 5, palette.hideDark);
  fillRect(figure, 7, 9, 2, striding ? 4 : 5, palette.hideDark);
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

/**
 * The head, under a helmet or under nothing: a crest is what makes the third
 * line the tallest thing on the field, and a bare head is what makes half of
 * Carthage's roster read as light troops rather than as a Roman line.
 */
function head(
  figure: PixelBuffer,
  palette: Palette,
  helmet: HelmetKind,
  fromBehind: boolean,
): void {
  const x = 4;

  // The head itself, and no face at this size: one dark pixel is a visor, and a
  // man seen from behind wears his hair where his face was.
  fillRect(figure, x, 5, 2, 2, fromBehind ? palette.clothDark : palette.skin);
  if (!fromBehind) setPixel(figure, x, 6, palette.skinDark);

  if (helmet === 'bare') {
    // Hair, and no metal: the silhouette is a rounder head with nothing above it,
    // which is the lightest head on the field and the reason a Carthaginian
    // skirmisher reads as one.
    fillRect(figure, x - 1, 3, 4, 2, palette.clothDark);
    setPixel(figure, x - 1, 4, palette.skinDark);
    return;
  }

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
 * Seven shapes and sizes, drawn from the same handful of rectangles and ovals so
 * that they cannot disagree about their outline, their rim or their boss:
 *
 * - **scutum**: a rectangle four wide and seven tall — a wall beside the man;
 * - **parma**: a small oval, three wide and four tall, carried low;
 * - **hoplon**: a great round shield, four wide and five tall, its rim bronze;
 * - **thureos**: a tall oval, four wide and seven tall, with a bronze spine;
 * - **caetra**: a small round shield, three by three, the scutarius' little one;
 * - **gaulish**: a tall wall, four by nine, with a vertical spine — the only
 *   shield that reaches the second row;
 * - **none**: no shield at all, which is a silhouette too.
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
  if (kind === 'none') return;

  if (view === 'side') {
    const x = 6;

    if (kind === 'scutum') {
      rimmed(figure, palette, x, 5, 3, 6, palette.cloth);
    } else if (kind === 'parma') {
      oval(figure, palette, x, 7, 3, 4, palette.cloth);
    } else if (kind === 'hoplon') {
      oval(figure, palette, x, 6, 3, 4, palette.cloth, palette.metal);
    } else if (kind === 'thureos') {
      oval(figure, palette, x, 5, 3, 6, palette.cloth, palette.metal);
      fillRect(figure, x + 1, 6, 1, 4, palette.metal);
    } else if (kind === 'caetra') {
      oval(figure, palette, x, 7, 3, 3, palette.cloth, palette.boss);
    } else {
      // A profile's gaulish shield: the same tall wall, seen edge-on.
      rimmed(figure, palette, 6, 3, 3, 8, palette.cloth);
      fillRect(figure, 7, 4, 1, 6, palette.metal);
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
  if (kind === 'hoplon') {
    // The hoplon: round, rimmed in bronze, with an emblem in the middle of it.
    oval(figure, palette, x, 6, 4, 5, palette.cloth, palette.metal);
    setPixel(figure, x + 1, 8, palette.boss);
    setPixel(figure, x + 2, 8, palette.boss);
    return;
  }
  if (kind === 'thureos') {
    oval(figure, palette, x, 4, 4, 7, palette.cloth, palette.metal);
    fillRect(figure, x + 1, 5, 1, 5, palette.metal);
    return;
  }
  if (kind === 'caetra') {
    oval(figure, palette, x, 7, 3, 3, palette.cloth, palette.boss);
    setPixel(figure, x + 1, 8, palette.boss);
    return;
  }

  // The gaulish shield: a tall wall with a vertical spine, and the only shield
  // that reaches the second row. A rectangle rather than an oval, and taller
  // than a scutum, so the Gaul is not a Libyan with a wider shield.
  rimmed(figure, palette, 6, 2, 4, 9, palette.cloth);
  fillRect(figure, 7, 3, 1, 6, palette.metal);
  fillRect(figure, 7, 5, 2, 2, palette.boss);
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
 * The width of each row is the whole difference between the shapes at this
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

/** Paints a pixel only where it is inside the figure: a weapon may reach past an edge. */
function touch(figure: PixelBuffer, x: number, y: number, colour: Rgba): void {
  if (x < 0 || y < 0 || x >= figure.width || y >= figure.height) return;

  setPixel(figure, x, y, colour);
}

/**
 * A weapon's shape, which is how the eight kinds stay a table rather than eight
 * functions.
 *
 * `top` is where the shaft begins in the idle pose (`0` is the top row),
 * `sideX` is where a profile stands it, `reach` is how far a thrust puts it in
 * front of the man, and `tip` is what the end of it is: a point, a curve (the
 * falcata's hook) or a thong (a sling's loop). A second shaft is what makes a
 * javelin thrower carry a fistful rather than one.
 */
interface WeaponLook {
  readonly top: number;
  readonly sideX: number;
  readonly reach: number;
  readonly tip: 'point' | 'curve' | 'thong';
  readonly shafts: number;
}

/** The eight weapons, as the four numbers and two marks that draw them. */
const WEAPONS: Readonly<Record<WeaponKind, WeaponLook>> = {
  pilum: { top: 3, sideX: 9, reach: 3, tip: 'point', shafts: 1 },
  gladius: { top: 8, sideX: 6, reach: 1, tip: 'point', shafts: 1 },
  hasta: { top: 0, sideX: 9, reach: 3, tip: 'point', shafts: 1 },
  spear: { top: 2, sideX: 9, reach: 3, tip: 'point', shafts: 1 },
  longsword: { top: 1, sideX: 9, reach: 2, tip: 'point', shafts: 1 },
  falcata: { top: 7, sideX: 6, reach: 1, tip: 'curve', shafts: 1 },
  sling: { top: 4, sideX: 9, reach: 1, tip: 'thong', shafts: 1 },
  javelins: { top: 2, sideX: 9, reach: 3, tip: 'point', shafts: 2 },
};

/**
 * How far a fallen soldier's weapon still sticks out of his hand, by kind.
 *
 * One line of drawing each, and a table rather than a chain of ternaries: the
 * long weapons point well away from a body that has dropped them, a short blade
 * barely leaves the hand, and a sling's thong is shorter still.
 */
const DEATH_REACH: Readonly<Record<WeaponKind, number>> = {
  pilum: 3,
  gladius: 1,
  hasta: 4,
  spear: 4,
  longsword: 3,
  falcata: 1,
  sling: 2,
  javelins: 3,
};

/**
 * The weapon, and the three things it does.
 *
 * A `pilum` is a javelin that ends above the man's head; a `hasta` is a spear
 * that ends above the whole block, which is the triarius' silhouette; a
 * `gladius` is a short blade that barely leaves the hand; and C4's five add a
 * plain `spear` between the pilum and the hasta, a `longsword` that reaches as
 * high as a spear, a curved `falcata`, a `sling` and a pair of `javelins`.
 *
 * Idle and walking keep the weapon upright; an attack raises it and then puts it
 * forward, which is the only two-frame motion in the catalogue and enough to
 * read as a blow.
 */
function weapon(
  figure: PixelBuffer,
  palette: Palette,
  kind: WeaponKind,
  view: 'front' | 'side',
  frame: FigureFrame,
): void {
  const look = WEAPONS[kind];
  const thrust = frame.action === 'attack' && frame.step === 1;

  if (view === 'side') {
    if (thrust) {
      // Forward, at the height of a thrust: one line out in front of the man.
      fillRect(figure, 6, 8, look.reach, 1, palette.shaft);
      tip(figure, palette, look.tip, 6 + look.reach, 8);
      return;
    }

    if (frame.action === 'attack') {
      // A profile's wind-up pulls the weapon back over the shoulder, which reads
      // as the moment before the thrust and is nothing like standing.
      for (let step = 0; step < 4; step += 1) touch(figure, 6 - step, 8 - step, palette.shaft);
      touch(figure, 2, 4, palette.metalLit);
      return;
    }

    fillRect(figure, look.sideX, look.top, 1, 9 - look.top, palette.shaft);
    // A gladius is short enough that its point is inside the hand's pixel: the
    // short blade keeps the blunt end C2 drew it with.
    if (kind !== 'gladius') tip(figure, palette, look.tip, look.sideX, look.top);
    return;
  }

  if (frame.action === 'attack' && frame.step === 0) {
    // The front of a wind-up: the weapon has left the man's side and is coming
    // down across him, which is the one direction a thrust toward the viewer can
    // be shown from in front.
    for (let step = 0; step < 3; step += 1) touch(figure, 1 + step, 7 + step, palette.shaft);
    touch(figure, 1, 7, palette.metalLit);
    return;
  }

  if (thrust) {
    // Toward the viewer, which from the front is a blade held out at the height
    // of the hand: the shield rises a pixel and the weapon leaves the man's side.
    fillRect(figure, 1, 8, look.reach, 1, palette.shaft);
    tip(figure, palette, look.tip, 0, 8);
    return;
  }

  for (let shaft = 0; shaft < look.shafts; shaft += 1) {
    const x = 1 + shaft;
    fillRect(figure, x, look.top, 1, 10 - look.top, palette.shaft);
    if (kind !== 'gladius') tip(figure, palette, look.tip, x, look.top);
  }
}

/** The end of a weapon: a bronze point, a falcata's curve, or a sling's loop. */
function tip(figure: PixelBuffer, palette: Palette, kind: WeaponLook['tip'], x: number, y: number): void {
  if (kind === 'curve') {
    touch(figure, x, y, palette.metalLit);
    touch(figure, x + 1, y, palette.metalLit);
    return;
  }
  if (kind === 'thong') {
    touch(figure, x, y, palette.shaft);
    touch(figure, x - 1, y + 1, palette.shaft);
    touch(figure, x + 1, y + 1, palette.shaft);
    return;
  }

  touch(figure, x, y, palette.metalLit);
}

/**
 * The elephant: a Squad of a single figure, and not a paper doll.
 *
 * One beast in the same ten-by-fourteen box as a man, drawn so that the
 * silhouette — a mass eight wide, four legs, a trunk hanging to the ground, two
 * ears and a trapper — is unmistakable in greyscale. Its cloth is the Faction's,
 * on the trapper over its back, so a Carthaginian elephant is still Carthage's;
 * its hide is the stone ramp, because an animal drawn in cloth reads as a man on
 * all fours.
 *
 * The frames are its own: walking lifts a leg a frame at a time like a man's
 * march, and an attack is the head lowered and the trunk thrown forward in the
 * first frame and driven home in the second. The death frame is a heap on the
 * ground, which is what a beast that has gone down looks like and is as clearly
 * not a body of men as the standing pose is not a man.
 */
function beast(palette: Palette, side: boolean, frame: FigureFrame): PixelBuffer {
  const figure = createPixelBuffer(FIGURE_WIDTH, FIGURE_HEIGHT);

  if (frame.action === 'death') {
    fillRect(figure, 0, 13, FIGURE_WIDTH, 1, palette.outline);
    fillRect(figure, 1, 9, 8, 4, palette.hide);
    fillRect(figure, 1, 12, 8, 1, palette.hideDark);
    fillRect(figure, 2, 6, 5, 3, palette.cloth);
    // The trunk, still reaching, and a tusk beside it.
    fillRect(figure, 0, 11, 2, 1, palette.hide);
    setPixel(figure, 0, 12, palette.metalLit);
    return figure;
  }

  const stepping = frame.action === 'walk' && frame.step === 0;
  const striding = frame.action === 'walk' && frame.step === 1;
  const lift = bobOf(frame);

  if (side) {
    // The body, its bulk and its shadow.
    fillRect(figure, 1, 4 + lift, 7, 6, palette.hide);
    fillRect(figure, 1, 9 + lift, 7, 1, palette.hideDark);
    // The trapper over the back, in the Faction's cloth.
    fillRect(figure, 2, 2 + lift, 5, 2, palette.cloth);
    setPixel(figure, 2, 3 + lift, palette.clothDark);
    setPixel(figure, 6, 3 + lift, palette.clothDark);
    // The head, the ear and the eye.
    fillRect(figure, 7, 4 + lift, 2, 4, palette.hide);
    fillRect(figure, 6, 3 + lift, 2, 4, palette.hideDark);
    setPixel(figure, 8, 5 + lift, palette.outline);
    setPixel(figure, 0, 5 + lift, palette.hideDark);
    // The trunk: hanging forward and down when standing, swung up under the
    // head to rear, or driven straight out in front to charge.
    if (frame.action === 'attack' && frame.step === 0) {
      fillRect(figure, 8, 7 + lift, 1, 4, palette.hide);
      touch(figure, 8, 6 + lift, palette.metalLit);
    } else if (frame.action === 'attack') {
      fillRect(figure, 8, 9 + lift, 2, 1, palette.hide);
      touch(figure, 9, 9 + lift, palette.metalLit);
    } else {
      fillRect(figure, 8, 8 + lift, 1, 4, palette.hide);
      touch(figure, 9, 12, palette.hide);
    }
    // A tusk, and four legs, one lifted per frame of the march.
    setPixel(figure, 8, 8 + lift, palette.metalLit);
    fillRect(figure, 1, 9, 1, stepping ? 4 : 5, palette.hideDark);
    fillRect(figure, 3, 9, 1, striding ? 4 : 5, palette.hideDark);
    fillRect(figure, 5, 9, 1, 5, palette.hideDark);
    fillRect(figure, 7, 9, 1, 5, palette.hideDark);

    return figure;
  }

  // Front view: a wall of a beast, the ears wider than the body, the face between.
  fillRect(figure, 1, 4 + lift, 8, 6, palette.hide);
  fillRect(figure, 1, 9 + lift, 8, 1, palette.hideDark);
  // The trapper, high on the back, in the Faction's cloth.
  fillRect(figure, 2, 2 + lift, 6, 2, palette.cloth);
  fillRect(figure, 2, 3 + lift, 6, 1, palette.clothDark);
  // The ears: two great flaps either side of the head.
  fillRect(figure, 0, 5 + lift, 2, 5, palette.hideDark);
  fillRect(figure, 8, 5 + lift, 2, 5, palette.hideDark);
  // The face, its eyes and the trunk: hanging between the tusks when standing,
  // lifted and curled to rear, or driven along the ground to charge.
  fillRect(figure, 2, 5 + lift, 6, 5, palette.hide);
  setPixel(figure, 3, 6 + lift, palette.outline);
  setPixel(figure, 6, 6 + lift, palette.outline);
  if (frame.action === 'attack' && frame.step === 0) {
    fillRect(figure, 1, 5 + lift, 1, 5, palette.hide);
    touch(figure, 1, 10 + lift, palette.metalLit);
  } else if (frame.action === 'attack') {
    fillRect(figure, 2, 12, 5, 1, palette.hide);
    touch(figure, 8, 12, palette.metalLit);
  } else {
    fillRect(figure, 4, 10, 2, 3, palette.hide);
    touch(figure, 4, 13, palette.hide);
    touch(figure, 5, 13, palette.hide);
  }
  // Two tusks, and four legs with one lifted per frame of the march.
  setPixel(figure, 3, 10, palette.metalLit);
  setPixel(figure, 6, 10, palette.metalLit);
  fillRect(figure, 1, 9, 2, stepping ? 4 : 5, palette.hideDark);
  fillRect(figure, 7, 9, 2, striding ? 4 : 5, palette.hideDark);

  return figure;
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
