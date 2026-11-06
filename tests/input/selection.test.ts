/**
 * What a Player has picked (ticket C2).
 *
 * The selection is the Player's memory and not the Match's, so what it has to get
 * right is the gestures: a click picks the block a Player can see under the
 * pointer, a drag picks everything it touches, a shift adds rather than replaces,
 * and a click on empty ground means "nothing" rather than an error.
 */
import { describe, expect, it } from 'vitest';
import {
  NOTHING_SELECTED,
  boxBetween,
  selectAt,
  selectIn,
  selectSettlement,
  stillHeld,
  type Pickable,
  type PickRect,
} from '../../src/input/selection';

/**
 * A block of a Squad: a drawn rectangle, at a place, standing on a tile row.
 *
 * The row defaults to the rectangle's own vertical position, which is what a
 * test that does not care about depth wants; the tests that do care pass one.
 * The layer defaults to `MEN`, which is where the stage draws the blocks: over
 * the places they are standing in.
 */
function block(id: number, x: number, y: number, width = 54, height = 50, depth = y, layer = MEN): Pickable {
  return { kind: 'squad', id, rect: { x, y, width, height }, depth, layer };
}

/** A settlement's structure: a drawn square, round the tile it stands on. */
function place(id: number, x: number, y: number, size = 48, depth = y): Pickable {
  return { kind: 'settlement', id, rect: { x, y, width: size, height: size }, depth, layer: PLACES };
}

/** How high the stage draws the two kinds against each other (`render/game.ts`). */
const PLACES = 0;
const MEN = 1;

/** The middle of a block. */
function middle(squad: Pickable): { readonly x: number; readonly y: number } {
  return { x: squad.rect.x + Math.floor(squad.rect.width / 2), y: squad.rect.y + Math.floor(squad.rect.height / 2) };
}

/** A box from one corner to the other. */
function box(x: number, y: number, width: number, height: number): PickRect {
  return { x, y, width, height };
}

describe('one click', () => {
  it('picks the Squad whose block the pointer is on', () => {
    const squads = [block(1, 0, 0), block(2, 100, 100)];

    expect(selectAt(NOTHING_SELECTED, squads, middle(squads[1]!))).toEqual({ squads: [2], settlement: null });
  });

  it('picks the block drawn in front when two overlap, by the row they stand on', () => {
    // The same place, two blocks: the layer paints the Squad on the later tile
    // row last, so that is the one a Player is looking at — whatever the two
    // rectangles' own bottoms happen to say, which depends on where each Squad
    // faces (`render/squads.ts` anchors a block at its front rank).
    const behind = block(1, 0, 0, 54, 50, 10);
    const front = block(2, 0, 0, 54, 50, 20);
    const at = { x: 20, y: 30 };

    expect(selectAt(NOTHING_SELECTED, [behind, front], at).squads).toEqual([2]);
    expect(selectAt(NOTHING_SELECTED, [front, behind], at).squads).toEqual([2]);

    // Two blocks on one row are drawn in the order the layer added them, which
    // is the Faction's list: the later one is on top.
    const sameRow = block(3, 0, 0, 54, 50, 20);
    expect(selectAt(NOTHING_SELECTED, [front, sameRow], at).squads).toEqual([3]);
  });

  it('clears the selection on empty ground, and keeps it on a shift-click that missed', () => {
    const squads = [block(1, 0, 0)];
    const picked = { squads: [1], settlement: null };
    const empty = { x: 500, y: 500 };

    expect(selectAt(picked, squads, empty)).toEqual(NOTHING_SELECTED);
    expect(selectAt(picked, squads, empty, true)).toEqual(picked);
  });

  it('adds a Squad with a shift-click, and takes it out again with another', () => {
    const squads = [block(1, 0, 0), block(2, 100, 100)];
    const first = selectAt(NOTHING_SELECTED, squads, middle(squads[0]!));
    const both = selectAt(first, squads, middle(squads[1]!), true);

    expect(both.squads).toEqual([1, 2]);
    expect(selectAt(both, squads, middle(squads[0]!), true).squads).toEqual([2]);
  });

  it('picks nothing where a block has no width or no height', () => {
    const sliver: Pickable = { kind: 'squad', id: 1, rect: { x: 10, y: 10, width: 0, height: 10 }, depth: 10, layer: MEN };

    expect(selectAt(NOTHING_SELECTED, [sliver], { x: 10, y: 15 })).toEqual(NOTHING_SELECTED);
  });
});

describe('a dragged box', () => {
  it('picks every Squad whose block it touches, even at a corner', () => {
    const squads = [block(1, 0, 0), block(2, 100, 100), block(3, 400, 400)];
    const picked = selectIn(NOTHING_SELECTED, squads, box(90, 90, 30, 30));

    expect(picked.squads).toEqual([2]);
    // A box that merely grazes a block still counts: a man half inside the box
    // was plainly aimed at.
    expect(selectIn(NOTHING_SELECTED, squads, box(50, 40, 2, 2)).squads).toEqual([1]);
  });

  it('picks them in the Faction’s own order, however the drag went', () => {
    const squads = [block(1, 0, 0), block(2, 100, 0), block(3, 200, 0)];

    expect(selectIn(NOTHING_SELECTED, squads, box(-10, -10, 300, 100)).squads).toEqual([1, 2, 3]);
  });

  it('adds to a selection with a shift, and clears on an empty box', () => {
    const squads = [block(1, 0, 0), block(2, 100, 0)];
    const picked = { squads: [1], settlement: null };

    expect(selectIn(picked, squads, box(90, -10, 30, 100), true).squads).toEqual([1, 2]);
    expect(selectIn(picked, squads, box(500, 500, 10, 10))).toEqual(NOTHING_SELECTED);
    expect(selectIn(picked, squads, box(500, 500, 10, 10), true)).toEqual(picked);
  });

  it('normalises a drag that went right to left and bottom to top', () => {
    expect(boxBetween({ x: 10, y: 10 }, { x: 2, y: 4 })).toEqual({ x: 2, y: 4, width: 8, height: 6 });
    expect(boxBetween({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5, width: 0, height: 0 });
  });
});

describe('a settlement', () => {
  it('opens its panel from the structure a click lands on', () => {
    const places = [place(7, 0, 0)];
    const picked = selectAt(NOTHING_SELECTED, places, middle(places[0]!));

    expect(picked).toEqual({ squads: [], settlement: 7 });
  });

  it('is what a shift-click picks too, and adds nothing to a wall', () => {
    const places = [place(7, 0, 0), place(8, 100, 0)];
    const men = selectAt(NOTHING_SELECTED, [block(1, 0, 0)], { x: 10, y: 10 });

    expect(selectAt(men, places, middle(places[0]!), true)).toEqual({ squads: [], settlement: 7 });
  });

  it('is drawn under the men standing in it, and picked under them too', () => {
    const town = place(7, 0, 0);
    const men = block(1, 10, 10, 20, 20, 0);
    const at = { x: 15, y: 15 };

    // The same pixels: the Squad is drawn in the later layer, so it is what a
    // Player sees and what the click takes, whatever rows the two are on.
    expect(selectAt(NOTHING_SELECTED, [town, men], at).squads).toEqual([1]);
    expect(selectAt(NOTHING_SELECTED, [men, town], at).squads).toEqual([1]);
    // And where the men are not, the place is.
    expect(selectAt(NOTHING_SELECTED, [town, men], { x: 40, y: 40 }).settlement).toBe(7);
  });

  it('picks the place drawn in front when two structures overlap', () => {
    const behind = place(1, 0, 0, 48, 10);
    const front = place(2, 0, 0, 48, 20);

    expect(selectAt(NOTHING_SELECTED, [behind, front], { x: 10, y: 10 }).settlement).toBe(2);
    expect(selectAt(NOTHING_SELECTED, [front, behind], { x: 10, y: 10 }).settlement).toBe(2);
  });

  it('is not swept up by a dragged box, which is a gesture about men', () => {
    const places = [place(7, 0, 0)];
    const men = [block(1, 100, 100)];

    expect(selectIn(NOTHING_SELECTED, [...places, ...men], box(-10, -10, 200, 200)).squads).toEqual([1]);
    expect(selectIn(NOTHING_SELECTED, places, box(-10, -10, 200, 200))).toEqual(NOTHING_SELECTED);
  });

  it('takes the panel and puts the men down', () => {
    const picked = { squads: [1, 2], settlement: null };

    expect(selectSettlement(7)).toEqual({ squads: [], settlement: 7 });
    expect(picked).toEqual({ squads: [1, 2], settlement: null });
  });

  it('drops a Squad that has left the field, and keeps the place whose panel is open', () => {
    expect(stillHeld({ squads: [1, 2], settlement: null }, [2])).toEqual({ squads: [2], settlement: null });
    // A settlement does not leave the field: it can change hands, and what the panel
    // may say about it is the interface's question (U6), so the Controller keeps it.
    expect(stillHeld({ squads: [], settlement: 7 }, [])).toEqual({ squads: [], settlement: 7 });
    expect(stillHeld({ squads: [1], settlement: 7 }, [])).toEqual({ squads: [], settlement: 7 });
    // Nothing to prune is the same object: a busy tick allocates nothing.
    const picked = { squads: [1], settlement: null };
    expect(stillHeld(picked, [1])).toBe(picked);
  });
});
