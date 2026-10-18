/**
 * The resource nodes, drawn: grain, timber, stone and iron (ticket B3, PLAN §4).
 *
 * B1 places nodes of each kind on the terrain that suits them — timber in
 * forests, stone and iron on hills, grain on farmland — and B3's ticket asks that
 * they *stay legible at every zoom level*. A node is not a kind of ground: it is
 * a marker standing on it, so this module is a sprite blitted over the map rather
 * than a material, and one that has to read at one screen pixel per map pixel,
 * which is what the lowest zoom shows.
 *
 * **Legibility at 1× is a question of silhouette**, and that is the whole design:
 * four shapes that cannot be confused from a distance or up close — a tall
 * narrow sheaf, two flat logs, a heap, a diamond — before colour is considered at
 * all. The plan warns that a grid of coloured pixels reads the same at low zoom
 * whatever the colours are (ADR-0007), so a marker is a shape first, and its
 * material's ramp second: grain is the only light one, iron the only dark one,
 * timber the only one with cut ends, stone the only one that widens as it falls.
 *
 * A marker is **data**, like the font's letterforms: sixteen rows of sixteen
 * pixels, `.` for the ground that shows through and one letter per shade. The
 * table is what a reader judges and a test walks, and `nodeMarker` is the four
 * lines that turn a row of it into pixels plus the one-pixel outline that makes
 * it read against grass, forest floor and rock alike.
 */

import { RAMPS, shadeAt } from './palette.ts';
import { type PixelBuffer, type Rgba, createPixelBuffer, setPixel } from './pixel-buffer.ts';

/**
 * The four kinds of node, as art names them.
 *
 * The same four the economy counts, in the order `RESOURCE_KINDS` states, so a
 * caller can walk them side by side.
 */
export const NODE_KINDS = ['grain', 'timber', 'stone', 'iron'] as const;

/** One kind of resource node. */
export type NodeKind = (typeof NODE_KINDS)[number];

/** The side of a marker, in pixels: one tile, like everything else drawn on the map. */
export const NODE_TILE = 16;

/** What each kind of node is made of: a body, a lit face and a shadow. */
interface NodeLook {
  /** The bulk of the marker. */
  readonly body: Rgba;
  /** The top or lit face. */
  readonly lit: Rgba;
  /** The underside, and the cut ends of a log. */
  readonly dark: Rgba;
}

const LOOK: Readonly<Record<NodeKind, NodeLook>> = {
  grain: { body: shadeAt(RAMPS.bronze, 5), lit: shadeAt(RAMPS.parchment, 4), dark: shadeAt(RAMPS.bronze, 3) },
  timber: { body: shadeAt(RAMPS.bronze, 2), lit: shadeAt(RAMPS.bronze, 4), dark: shadeAt(RAMPS.bronze, 1) },
  stone: { body: shadeAt(RAMPS.stone, 3), lit: shadeAt(RAMPS.stone, 5), dark: shadeAt(RAMPS.stone, 1) },
  iron: { body: shadeAt(RAMPS.stone, 1), lit: shadeAt(RAMPS.stone, 3), dark: shadeAt(RAMPS.olive, 0) },
};

/** The dark line every marker is drawn on, so it reads against any ground. */
const OUTLINE = shadeAt(RAMPS.olive, 0);

/** One pixel of a marker: the ground, the body, its lit face, or its shadow. */
type MarkerPixel = '.' | 'b' | 'l' | 'd';

/**
 * The four markers, as pixel art.
 *
 * Sixteen rows of sixteen pixels each, read like the font's letterforms: `.` is
 * ground and shows through, `b` is the body, `l` the lit face, `d` the shadow.
 * The silhouettes are the design and the colour is the confirmation —
 *
 * - **grain** is a sheaf: six pixels wide at its widest and twelve tall, the only
 *   marker taller than it is wide;
 * - **timber** is two logs: twelve wide and eight tall, the only one that is flat,
 *   and the only one with a lit end cap on each bar;
 * - **stone** is a heap: twelve wide at its foot and eight tall, widening all the
 *   way down;
 * - **iron** is a diamond: ten wide and ten tall, dark, with no straight top or
 *   bottom edge at all.
 */
export const MARKER_ART: Readonly<Record<NodeKind, readonly string[]>> = {
  grain: [
    '................',
    '................',
    '.......ll.......',
    '......llbl......',
    '......lbll......',
    '.....llbbll.....',
    '.....llllll.....',
    '......lbbl......',
    '......lbbl......',
    '......lbbl......',
    '......lbbl......',
    '......lbbl......',
    '.....llllll.....',
    '.....dddddd.....',
    '................',
    '................',
  ],
  timber: [
    '................',
    '................',
    '................',
    '................',
    '....llllllll....',
    '...lbbbbbbbbl...',
    '...lbbbbbbbbl...',
    '...dddddddddd...',
    '.....llllll.....',
    '....lbbbbbbbl...',
    '....lbbbbbbbl...',
    '....dddddddd....',
    '................',
    '................',
    '................',
    '................',
  ],
  stone: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '.......ll.......',
    '......llll......',
    '.....llllll.....',
    '....llbbblll....',
    '....lbbbbbbbl...',
    '...lbbbbbbbbbl..',
    '...bbbbbbbbbbb..',
    '...ddddddddddd..',
    '................',
    '................',
    '................',
  ],
  iron: [
    '................',
    '................',
    '................',
    '................',
    '......llll......',
    '.....lbbbbl.....',
    '....lbbbbbbl....',
    '...lbbbbbbbbbl..',
    '..lbbbbbbbbbbbl.',
    '..lbbbbbbbbbbbl.',
    '...lbbbbbbbbbl..',
    '....lbbbbbbl....',
    '.....lbbbbl.....',
    '......dddd......',
    '................',
    '................',
  ],
};

/** The markers already drawn, one per kind: the map asks for each of them several times. */
const MARKERS = new Map<NodeKind, PixelBuffer>();

/**
 * One marker: a small pile of what the node holds, outlined and centred on the tile.
 *
 * Transparent everywhere the ground should show through, which is most of the
 * tile: a node is a place on the map, not a change to it. The marker therefore
 * survives B4 untouched — that wave dims and hides the *map* under fog, and a
 * node is map.
 */
export function nodeMarker(kind: NodeKind): PixelBuffer {
  const cached = MARKERS.get(kind);
  if (cached !== undefined) return cached;

  const marker = createPixelBuffer(NODE_TILE, NODE_TILE);
  const look = LOOK[kind];
  const art = MARKER_ART[kind];

  for (let y = 0; y < NODE_TILE; y += 1) {
    const row = art[y] ?? '';

    for (let x = 0; x < NODE_TILE; x += 1) {
      const pixel = row[x] as MarkerPixel | undefined;
      if (pixel === undefined || pixel === '.') continue;

      setPixel(marker, x, y, pixel === 'b' ? look.body : pixel === 'l' ? look.lit : look.dark);
    }
  }

  outline(marker);
  MARKERS.set(kind, marker);
  return marker;
}

/** Draws a one-pixel outline around whatever the marker painted, so it reads on any ground. */
function outline(marker: PixelBuffer): void {
  const painted: boolean[] = [];
  for (let index = 3; index < marker.pixels.length; index += 4) painted.push((marker.pixels[index] ?? 0) > 0);

  for (let y = 0; y < NODE_TILE; y += 1) {
    for (let x = 0; x < NODE_TILE; x += 1) {
      if (painted[y * NODE_TILE + x] === true) continue;

      const touched = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1],
      ].some(([nx, ny]) => {
        if (nx === undefined || ny === undefined) return false;
        if (nx < 0 || ny < 0 || nx >= NODE_TILE || ny >= NODE_TILE) return false;

        return painted[ny * NODE_TILE + nx] === true;
      });

      // The outline is painted only where the marker does not reach the tile's own
      // edge, so a pile is outlined all the way round rather than cut by the tile.
      if (touched) setPixel(marker, x, y, OUTLINE);
    }
  }
}

/** The four markers, in `NODE_KINDS` order, named for the catalogue. */
export function nodeEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return NODE_KINDS.map((kind) => ({ name: `node:${kind}`, buffer: nodeMarker(kind) }));
}
