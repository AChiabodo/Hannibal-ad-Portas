/**
 * The command icons and the small badges the panels read figures with (#55).
 *
 * A command card is a grid of pictures with a one-word label under each, and a
 * settlement's construction and recruitment rows read their costs as badges
 * rather than as sentences. Both are **generated art** like everything else —
 * sixteen rows of sixteen characters for an icon, ten for a badge, `.` for the
 * panel showing through and one letter per ink — so the pipeline has no second
 * drawing path (ADR-0002) and the Atelier can show every one of them beside the
 * glyphs, the terrain and the soldiers.
 *
 * ## Why the shapes are the design
 *
 * The same reason the resource markers are (`nodes.ts`): an icon is read at one
 * screen pixel per art pixel when the interface is drawn at 1×, so colour can
 * confirm a shape but cannot carry it. Each command therefore has one silhouette
 * that no other command has — an arrow, a crossed pair of blades, a shield, a
 * line of spears, ranks in depth, a keep — and the family is coherent on purpose:
 * the keep is the same keep for a Garrison, struck for an Assault, and ringed for
 * a Blockade, so a Player learns one object and three overlays.
 *
 * The inks come from the palette's own ramps and nothing else, so an icon cannot
 * drift away from the figures it orders. A **muted** copy is the same art in one
 * stone shade, which is how a control that cannot be used is drawn without a
 * second table saying what "unavailable" looks like.
 */
import { RAMPS, shadeAt } from './palette.ts';
import { createPixelBuffer, setPixel, type PixelBuffer, type Rgba } from './pixel-buffer.ts';

/** The side of a command icon: one tile, like the markers and the tiles. */
export const ICON_TILE = 16;

/** The side of a badge: small enough to stand beside a numeral in a row. */
export const BADGE_TILE = 10;

/** The commands a Squad can be given, in the order the command card offers them. */
export const COMMAND_ICON_NAMES = [
  'move',
  'attackMove',
  'attack',
  'hold',
  'withdraw',
  'line',
  'column',
  'garrison',
  'assault',
  'blockade',
] as const;

/** One command icon. */
export type CommandIconName = (typeof COMMAND_ICON_NAMES)[number];

/** The figures a panel reads as a badge: a cost, a time, men, denarii, and a lock. */
export const BADGE_NAMES = ['grain', 'timber', 'stone', 'iron', 'clock', 'men', 'coin', 'lock', 'build', 'recruit'] as const;

/** One badge. */
export type BadgeName = (typeof BADGE_NAMES)[number];

/**
 * The inks of the art, one character each.
 *
 * `p`/`P` parchment is a deliberate stroke, `b`/`B`/`d` bronze is metal, `r`/`R`
 * blood is the enemy or the cost of it, and `s`/`S`/`n` stone is a wall or a
 * building. No other colour is in the table, which is what keeps two icons from
 * inventing two different reds.
 */
const INKS: Readonly<Record<string, Rgba>> = {
  p: shadeAt(RAMPS.parchment, 4),
  P: shadeAt(RAMPS.parchment, 6),
  b: shadeAt(RAMPS.bronze, 3),
  B: shadeAt(RAMPS.bronze, 5),
  d: shadeAt(RAMPS.bronze, 1),
  r: shadeAt(RAMPS.blood, 3),
  R: shadeAt(RAMPS.blood, 5),
  s: shadeAt(RAMPS.stone, 3),
  S: shadeAt(RAMPS.stone, 5),
  n: shadeAt(RAMPS.stone, 1),
};

/** The one shade a muted icon is drawn in: the control is there, and cannot be used. */
const MUTED = shadeAt(RAMPS.stone, 2);

/**
 * The ten command icons.
 *
 * Read top to bottom, left to right: an arrow (march there), the same arrow under
 * crossed blades (march and fight), the blades alone (fight), a shield (hold), an
 * arrow reversed over broken ground (fall back), a frontage of spears (line),
 * ranks receding (column), a keep (garrison), a blade driven into a wall
 * (assault), the keep ringed (blockade).
 */
export const COMMAND_ART: Readonly<Record<CommandIconName, readonly string[]>> = {
  move: [
    '................',
    '................',
    '.........PP.....',
    '.........PPP....',
    '.........PbPP...',
    '..bBBBBBBPbPPP..',
    '..bPPPPPPPPPPPP.',
    '..bBBBBBBPbPPP..',
    '.........PbPP...',
    '.........PPP....',
    '.........PP.....',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  attackMove: [
    '................',
    '..P........P....',
    '..pP......Pp....',
    '...pP....Pp.....',
    '....bP..Pb......',
    '.....bPPb.......',
    '.....bRRb.......',
    '..PPPPPPPPPPP...',
    '..bBBBBBBBBPPP..',
    '...........PPPP.',
    '............PP..',
    '...........PP...',
    '..........PP....',
    '................',
    '................',
    '................',
  ],
  attack: [
    '................',
    '..PP........PP..',
    '..PpP......PpP..',
    '...PpP....PpP...',
    '....PpP..PpP....',
    '.....PpPPpP.....',
    '......PRRP......',
    '......PRRP......',
    '.....bPppPb.....',
    '....bBP..PBb....',
    '...bBB....BBb...',
    '..bBb......bBb..',
    '...b........b...',
    '................',
    '................',
    '................',
  ],
  hold: [
    '................',
    '....bBBBBBb.....',
    '...bBPPPPPBb....',
    '...bBPpppPBb....',
    '...bBPpBpPBb....',
    '...bBPBBBPBb....',
    '...bBPpBpPBb....',
    '...bBPpppPBb....',
    '....bBPPPBb.....',
    '....bBPPPBb.....',
    '.....bBPBb......',
    '......bBb.......',
    '.......b........',
    '................',
    '................',
    '................',
  ],
  withdraw: [
    '................',
    '................',
    '....PP..........',
    '...PPP..........',
    '..PPbP..........',
    '.PPPbPBBBBBBBb..',
    'PPPPPPPPPPPPb...',
    '.PPPbPBBBBBBBb..',
    '..PPbP..........',
    '...PPP..........',
    '....PP..........',
    '..........n.n...',
    '.........n.n....',
    '................',
    '................',
    '................',
  ],
  line: [
    '................',
    '..P....P....P...',
    '.PPP..PPP..PPP..',
    '..b....b....b...',
    '..b....b....b...',
    '..b....b....b...',
    '..b....b....b...',
    '.bBb..bBb..bBb..',
    '.bPB..bPB..bPB..',
    '.bPB..bPB..bPB..',
    '.bBb..bBb..bBb..',
    '..b....b....b...',
    '..d....d....d...',
    '................',
    '................',
    '................',
  ],
  column: [
    '................',
    '..bBBBBBBBBBBb..',
    '..bPPbPPbPPPBb..',
    '..bBBbBBbBBBBb..',
    '................',
    '...bBBBBBBBBb...',
    '...bPPbPPPPBb...',
    '...bBBbBBBBBb...',
    '................',
    '....bBBBBBBb....',
    '....bPPbPPBb....',
    '....bBBbBBBb....',
    '................',
    '.....bBBBBb.....',
    '................',
    '................',
  ],
  garrison: [
    '................',
    '......rrr.......',
    '......rRr.......',
    '..S.S.SbS.S.S...',
    '..SSSSSbSSSSS...',
    '..SnnSSSSSnnS...',
    '..SnSSSSSSSnS...',
    '..SnSSnnnSSnS...',
    '..SnSSnPnSSnS...',
    '..SnSSnPnSSnS...',
    '..SSSSnPnSSSS...',
    '..nnnnnnnnnnn...',
    '................',
    '................',
    '................',
    '................',
  ],
  assault: [
    '................',
    '...........PP...',
    '..........PpP...',
    '.........PpP....',
    '........PpP.....',
    '.......PpP......',
    '......bPp.......',
    '..S.S.bPb.S.S...',
    '..SSSbBBbSSSS...',
    '..SSnnRRnnnSS...',
    '..SnSSRRSSSnS...',
    '..SnS....SSnS...',
    '..nnn....nnnn...',
    '...n......n.....',
    '................',
    '................',
  ],
  blockade: [
    '................',
    '....RrrrrrR.....',
    '...Rr.....rR....',
    '..Rr.S.S.S.rR...',
    '.Rr..SSSSS..rR..',
    '.R...SnSnS...R..',
    '.r...SSnnS...r..',
    '.r...SSnnS...r..',
    '.R...SSSSS...R..',
    '.Rr.........rR..',
    '..Rr.......rR...',
    '...Rr.....rR....',
    '....RrrrrrR.....',
    '................',
    '................',
    '................',
  ],
};

/**
 * The badges: the four resources, a clock, men, a denarius, a lock, and the two
 * verbs of a settlement's pages.
 *
 * They are read at the same one-pixel scale as a glyph, so each is a two-colour
 * silhouette rather than a picture: a sheaf, two logs, a heap, a diamond, an
 * hourglass, a standing man, a coin, a padlock, a hammer and a helmet.
 */
export const BADGE_ART: Readonly<Record<BadgeName, readonly string[]>> = {
  grain: [
    '..........',
    '....P.....',
    '...PpP....',
    '...PpP....',
    '....p.....',
    '....p.....',
    '....p.....',
    '....p.....',
    '...ppp....',
    '..........',
  ],
  timber: [
    '..........',
    '..........',
    '..bbbbbb..',
    '..bBBBBb..',
    '..bbbbbb..',
    '...bbbb...',
    '...bBBb...',
    '...bbbb...',
    '..........',
    '..........',
  ],
  stone: [
    '..........',
    '..........',
    '....ss....',
    '...sSSs...',
    '..sSSSSs..',
    '.sSSSSSSs.',
    '.ssssssss.',
    '..........',
    '..........',
    '..........',
  ],
  iron: [
    '..........',
    '....SS....',
    '...SssS...',
    '..SssssS..',
    '.SssssssS.',
    '..SssssS..',
    '...SssS...',
    '....SS....',
    '..........',
    '..........',
  ],
  clock: [
    '..........',
    '..PPPPPP..',
    '..P....P..',
    '...P..P...',
    '....PP....',
    '....PP....',
    '...P..P...',
    '..P....P..',
    '..PPPPPP..',
    '..........',
  ],
  men: [
    '..........',
    '....PP....',
    '...PPPP...',
    '....PP....',
    '..PPPPPP..',
    '.PPPPPPPP.',
    '.PPPPPPPP.',
    '....PP....',
    '....PP....',
    '..........',
  ],
  coin: [
    '..........',
    '...BBBB...',
    '..BBBBBB..',
    '.BBB..BBB.',
    '.BB.BB.BB.',
    '.BB.BB.BB.',
    '.BBB..BBB.',
    '..BBBBBB..',
    '...BBBB...',
    '..........',
  ],
  lock: [
    '..........',
    '....BB....',
    '...B..B...',
    '...B..B...',
    '..BBBBBB..',
    '..BBBBBB..',
    '..BB..BB..',
    '..BB..BB..',
    '..BBBBBB..',
    '..........',
  ],
  build: [
    '..........',
    '.......bb.',
    '......bBBb',
    '.....bBBb.',
    '....bBBb..',
    '...bBBb...',
    '..bBBb....',
    '..bBb.....',
    '..bbb.....',
    '..........',
  ],
  recruit: [
    '..........',
    '...bbbb...',
    '..bBBBBb..',
    '.bBBBBBBb.',
    '.bBnBBnBb.',
    '.bBnBBnBb.',
    '..bbbbbb..',
    '...b..b...',
    '..........',
    '..........',
  ],
};

/** Whether a table is well formed: square, and made of inks the palette knows. */
function requireArt(name: string, art: readonly string[], tile: number): void {
  if (art.length !== tile) throw new RangeError(`${name} has ${String(art.length)} rows, not ${String(tile)}`);
  for (const [row, pixels] of art.entries()) {
    if (pixels.length !== tile) {
      throw new RangeError(`${name} row ${String(row)} has ${String(pixels.length)} pixels, not ${String(tile)}`);
    }
    for (const pixel of pixels) {
      if (pixel !== '.' && INKS[pixel] === undefined) {
        throw new RangeError(`${name} row ${String(row)} uses "${pixel}", which is not an ink`);
      }
    }
  }
}

/** One table drawn into a transparent buffer, in its inks or in the one muted shade. */
function render(name: string, art: readonly string[], tile: number, muted: boolean): PixelBuffer {
  requireArt(name, art, tile);
  const buffer = createPixelBuffer(tile, tile);

  for (const [y, pixels] of art.entries()) {
    for (const [x, pixel] of [...pixels].entries()) {
      if (pixel === '.') continue;
      setPixel(buffer, x, y, muted ? MUTED : INKS[pixel] ?? MUTED);
    }
  }

  return buffer;
}

/** One command icon, in its inks or muted for a control that cannot be used. */
export function commandIcon(name: CommandIconName, options: { readonly muted?: boolean } = {}): PixelBuffer {
  return render(`command icon ${name}`, COMMAND_ART[name], ICON_TILE, options.muted === true);
}

/** One badge. */
export function badgeIcon(name: BadgeName): PixelBuffer {
  return render(`badge ${name}`, BADGE_ART[name], BADGE_TILE, false);
}

/** Every icon and badge, named for the catalogue: `icon:move`, `badge:grain`. */
export function iconEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return [
    ...COMMAND_ICON_NAMES.map((name) => ({ name: `icon:${name}`, buffer: commandIcon(name) })),
    ...BADGE_NAMES.map((name) => ({ name: `badge:${name}`, buffer: badgeIcon(name) })),
  ];
}
