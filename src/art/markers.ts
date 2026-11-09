/**
 * The marks the theatre draws *about* a Squad: where it was told to go, which
 * way it faces, and the shapes its critical conditions wear (#58).
 *
 * These are not soldiers and are not composed into a block. They are annotations
 * a Player reads over the ground, so they are generated here, in the same
 * declarative way as the icons and the badges (`icons.ts`): a small square of
 * characters, one character per ink, and a pure function that turns it into a
 * `PixelBuffer`. That keeps the pipeline at one drawing path (ADR-0002): an
 * arrow on the ground is a table of pixels exactly as a shield is.
 *
 * ## Shape before colour
 *
 * The same rule the resource markers (B3), the soldiers (C4) and the command
 * icons (#55) follow, and for a sharper reason here: a mark stands on grass, on
 * forest or on remembered ground, in both Factions' colours. So a **move** is a
 * hollow diamond with a dot in it, an **attack-move** is that diamond with a
 * cross inside it, and the two are told apart with the palette taken out. The
 * condition marks — a broken arrow for a rout, a drooping bar for fatigue, an
 * empty quiver for spent missiles, a barred coin for an unpaid Squad and a cut
 * chain for a Squad out of supply — are five silhouettes no two of which are the
 * same shape.
 *
 * Colour still confirms: a destination is the selection's parchment, an attack
 * move is the blood ramp, and a condition is drawn on the dark plate the status
 * bar is drawn on so it reads over any ground.
 */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, rotateQuarterTurns, setPixel, type PixelBuffer, type Rgba } from './pixel-buffer.ts';

/** The side of a destination mark, in pixels: the size C2 drew. */
export const ORDER_MARKER_SIZE = 9;

/** How far to go, and whether to fight on the way: the two ground marks a Player's click can leave. */
export const ORDER_MARK_KINDS = ['move', 'attackMove'] as const;

/** One kind of destination mark. */
export type OrderMarkKind = (typeof ORDER_MARK_KINDS)[number];

/** The four ways a Squad faces, in the order `sim/squad.ts` states them. */
export const FACING_MARKS = ['north', 'east', 'south', 'west'] as const;

/** One of them. */
export type FacingMark = (typeof FACING_MARKS)[number];

/**
 * The conditions that wear a shape in the theatre.
 *
 * The list is the presentation's, not the rules': `ui/conditions.ts` decides
 * which of them a Squad has, and this module only draws them. A rout is the
 * rules' own flag; the other four are the initial thresholds the ticket approved
 * (low Morale, high Fatigue, no missiles, an unpaid Season or a lost supply
 * line), and every one of them is shown with a shape as well as a colour.
 */
export const CONDITION_MARKS = ['routing', 'unpaid', 'noSupply', 'fatigue', 'noAmmunition'] as const;

/** One condition with a shape of its own. */
export type ConditionMarkKind = (typeof CONDITION_MARKS)[number];

/** The side of a condition mark: two glyphs stand side by side on a status plate. */
export const CONDITION_MARK_SIZE = 5;

/** The side of a facing mark: a chevron that fits between two tiles. */
export const FACING_MARK_SIZE = 7;

/**
 * The inks of the marks, one character each.
 *
 * The same ramps the rest of the art is drawn from, so a mark cannot invent a
 * colour the map does not have. `P` is the selection's parchment, `R` the blood
 * ramp the attack-move mark is drawn in, `B` bronze for fatigue, `S` stone for a
 * spent quiver and `N` the darkest stone, which is the outline every mark wears
 * so it reads on a forest as well as on a field.
 */
const INKS: Readonly<Record<string, Rgba>> = {
  P: shadeAt(RAMPS.parchment, 6),
  R: shadeAt(RAMPS.blood, 5),
  B: shadeAt(RAMPS.bronze, 5),
  S: shadeAt(RAMPS.stone, 5),
  N: shadeAt(RAMPS.stone, 0),
};

/**
 * The two destination marks, drawn top to bottom.
 *
 * `move` is C2's diamond, unchanged pixel for pixel: the mark a Player already
 * knows, so the ticket extends it rather than replacing it. `attackMove` is the
 * same diamond with a cross of blood inside it — the crossed blades of the
 * command card, at the size the ground allows — so a march that will fight its
 * way there is a different shape from a march that will not.
 */
export const ORDER_MARK_ART: Readonly<Record<OrderMarkKind, readonly string[]>> = {
  move: [
    '....P....',
    '...P.P...',
    '..P...P..',
    '.P.....P.',
    'P...P...P',
    '.P.....P.',
    '..P...P..',
    '...P.P...',
    '....P....',
  ],
  attackMove: [
    '....P....',
    '...P.P...',
    '..P.R.P..',
    '.P.R.R.P.',
    'P...R...P',
    '.P.R.R.P.',
    '..P.R.P..',
    '...P.P...',
    '....P....',
  ],
};

/**
 * The facing mark, authored pointing **south** and turned for the other three.
 *
 * An arrow is the one shape whose meaning is its direction, so one arrow drawn
 * four times would be four chances to draw one of them wrong; `rotateQuarterTurns`
 * is the pipeline's own primitive (the autotiling uses it) and turning it is what
 * makes the four directions exactly the same mark.
 */
const FACING_ART: readonly string[] = [
  '.......',
  'P.....P',
  'PP...PP',
  '.PP.PP.',
  '..PPP..',
  '...P...',
  '...N...',
];

/** How many clockwise quarter turns take the south arrow to each facing. */
const FACING_TURNS: Readonly<Record<FacingMark, number>> = {
  south: 0,
  west: 1,
  north: 2,
  east: 3,
};

/**
 * The five condition silhouettes.
 *
 * Each is a shape a Player can name without its colour: a flight arrow struck
 * through (rout), a coin with a bar across it (an unpaid Season), a chain with a
 * link cut out (no supply), a bar drooping at one end (fatigue) and an empty
 * quiver (no missiles left).
 */
export const CONDITION_MARK_ART: Readonly<Record<ConditionMarkKind, readonly string[]>> = {
  routing: [
    'RRRRR',
    '.RRR.',
    '..R..',
    '..R..',
    '..N..',
  ],
  unpaid: [
    '.SSS.',
    'S.S.S',
    'S.S.S',
    'S.S.S',
    '.SSS.',
  ],
  noSupply: [
    'SS.SS',
    'SS.SS',
    '.....',
    'SS.SS',
    'SS.SS',
  ],
  fatigue: [
    'BBBB.',
    '.BBB.',
    '..BB.',
    '...B.',
    '...N.',
  ],
  noAmmunition: [
    'SS.SS',
    'SS.SS',
    'SS.SS',
    '.SSS.',
    '.....',
  ],
};

/** Paints one character table into a fresh buffer, with `.` and any unknown character left empty. */
function paint(art: readonly string[]): PixelBuffer {
  const height = art.length;
  const width = art[0]?.length ?? 0;
  const buffer = createPixelBuffer(width, height);

  for (const [y, row] of art.entries()) {
    for (let x = 0; x < row.length; x += 1) {
      const ink = INKS[row[x] ?? '.'];
      if (ink === undefined) continue;

      setPixel(buffer, x, y, ink);
    }
  }

  return buffer;
}

/** The destination mark of a move or an attack-move. */
export function orderMarker(kind: OrderMarkKind = 'move'): PixelBuffer {
  return paint(ORDER_MARK_ART[kind]);
}

/** The chevron that says which way a Squad faces. */
export function facingMarker(facing: FacingMark): PixelBuffer {
  return rotateQuarterTurns(paint(FACING_ART), FACING_TURNS[facing]);
}

/** The shape one critical condition wears. */
export function conditionMark(kind: ConditionMarkKind): PixelBuffer {
  return paint(CONDITION_MARK_ART[kind]);
}

/**
 * Every mark, named for the catalogue and the Atelier: `mark:order:move`,
 * `mark:facing:north`, `mark:condition:fatigue`.
 *
 * The names are stable and machine-readable, as the rest of the catalogue's are,
 * so a change to a mark shows up as a changed name or a changed pixel hash rather
 * than as a picture nobody looked at.
 */
export function markerEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return [
    ...ORDER_MARK_KINDS.map((kind) => ({ name: `mark:order:${kind}`, buffer: orderMarker(kind) })),
    ...FACING_MARKS.map((facing) => ({ name: `mark:facing:${facing}`, buffer: facingMarker(facing) })),
    ...CONDITION_MARKS.map((kind) => ({ name: `mark:condition:${kind}`, buffer: conditionMark(kind) })),
  ];
}
