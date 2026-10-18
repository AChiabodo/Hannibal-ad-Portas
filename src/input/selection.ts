/**
 * What the Player has picked, and how a click turns into it (ticket C2).
 *
 * A **Selection** is the Player's, not the Match's: it is what the interface
 * shows a panel of (GLOSSARY: Selection) and what an order is given to. It is
 * deliberately *not* state: nothing here is hashed, replayed or seen by the
 * other Faction, and a Player who selects a Squad and one who never clicked it
 * are playing the same Match. The same is true of the control groups, which
 * live beside the selection in `human.ts` and are written into the log as
 * `group` Commands only so that a replay re-enacts the *selection* (E2).
 *
 * ## One selection, one panel — and several Squads ordered at once
 *
 * The glossary is precise about the panel: there is one selection at a time, and
 * nothing selected is a state rather than an error. Box selection (this ticket)
 * adds the other half of what an RTS means by "selected": a *set of Squads* that
 * one order addresses. So the model is the pair —
 *
 * - `squads`: the Squad ids an order goes to, in the order they were picked;
 * - `settlement`: the settlement that is selected, if the panel is showing one
 *   rather than a Squad. Selecting a settlement clears the Squads, because the
 *   panel is one thing.
 *
 * - and the **panel follows the first Squad picked**: the interface highlights
 *   every Squad in the set and shows the detail of `squads[0]`, which is the
 *   man the Player picked first and expects to read.
 *
 * ## Picking is a rectangle, not a tile
 *
 * A Squad stands on one tile (ADR-0004) but is *drawn* as a block of men who
 * stand up out of it, three tiles tall for a full-strength line. Picking by tile
 * would mean a click on a soldier's chest missed him, which is the one thing a
 * Player would never believe. So a pick is done against the rectangle a Squad is
 * **drawn** in (`render/squads.ts` composes it, this module is handed it), and
 * the click and the box ask the same question of the same rectangles. That is
 * also why this module has no opinion about pixels: it is handed rectangles, and
 * a test can hand it rectangles of its own.
 */

/** A rectangle in theatre pixels: the drawn extent of a Squad, or a dragged box. */
export interface PickRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A Squad, as far as picking is concerned: where it is drawn, and how near the front it is. */
export interface Pickable {
  /** The Squad id an order would name. */
  readonly id: number;

  /** Where it is drawn, in theatre pixels. */
  readonly rect: PickRect;

  /**
   * How far down the screen the Squad *stands* — the tile row its block is
   * drawn at, which is the key the renderer sorts blocks by.
   *
   * Not derived from `rect`: a block's rectangle is its whole drawn extent, and
   * which way that extent grows depends on where the Squad is facing (`render/
   * squads.ts` anchors it by its front rank). The tile row is the thing both
   * sides can agree on without one of them guessing at the other's arithmetic —
   * the renderer draws the larger row in front, and the pick takes the larger
   * row.
   */
  readonly depth: number;
}

/** A point in theatre pixels. */
export interface PickPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * What the Player has selected: the Squads an order goes to, and the settlement
 * the panel is showing instead of them, if any.
 *
 * The two are never both set: picking a settlement is picking *it* rather than
 * the men, and picking men is leaving the settlement. A selection with neither
 * is a Player looking at the map, which is a state and not an error.
 */
export interface Selection {
  /** The Squads an order goes to, in the order the Player picked them. */
  readonly squads: readonly number[];

  /** The settlement whose panel is open, or `null`. */
  readonly settlement: number | null;
}

/** Nothing picked: the state a Match opens in. */
export const NOTHING_SELECTED: Selection = { squads: [], settlement: null };

/**
 * Picks whatever is under a point — one click.
 *
 * Additive picking (a shift-click) adds the Squad to the set, or takes it out
 * again when it is already there: that is how a Player builds a group out of
 * two corners of the field, and it is also how a mis-click is undone without
 * clearing everything.
 *
 * When two blocks overlap, the one drawn **in front** wins: the blocks are drawn
 * back to front by the tile row they stand on (`render/squad-layer.ts` sorts
 * them by it), so the Squad on the later row is the one whose men a Player can
 * see under the pointer. Ties are broken by id, which is the order the layer
 * adds two blocks on one row in, so that the answer never depends on the order a
 * list happened to arrive in.
 */
export function selectAt(
  selection: Selection,
  pickables: readonly Pickable[],
  point: PickPoint,
  additive = false,
): Selection {
  const hit = frontmost(pickables.filter((squad) => contains(squad.rect, point)));

  if (hit === null) {
    // A click on bare ground clears the selection, unless it was additive: a
    // shift-click that missed is a shift-click, not a decision to drop the men.
    return additive ? selection : NOTHING_SELECTED;
  }

  return { squads: toggled(selection.squads, hit.id, additive), settlement: null };
}

/**
 * Picks every Squad a dragged box touches — box selection.
 *
 * A block whose drawn rectangle merely *overlaps* the box is picked, not only
 * one whose tile is inside it: the box is drawn over what the Player can see,
 * and a man standing half inside it was plainly aimed at. The picked Squads come
 * back in the order the Faction's own list keeps them, so the resulting order's
 * Squad list is stable however the drag went.
 */
export function selectIn(
  selection: Selection,
  pickables: readonly Pickable[],
  box: PickRect,
  additive = false,
): Selection {
  const touched = pickables.filter((squad) => overlaps(squad.rect, box)).map((squad) => squad.id);

  if (touched.length === 0) return additive ? selection : NOTHING_SELECTED;

  const picked = additive ? [...selection.squads] : [];
  for (const id of touched) if (!picked.includes(id)) picked.push(id);

  return { squads: picked, settlement: null };
}

/** Selects a settlement's panel, which puts the men down. */
export function selectSettlement(id: number): Selection {
  return { squads: [], settlement: id };
}

/** The rectangle between two points, which is what a drag from one to the other means. */
export function boxBetween(from: PickPoint, to: PickPoint): PickRect {
  return {
    x: Math.min(from.x, to.x),
    y: Math.min(from.y, to.y),
    width: Math.abs(to.x - from.x),
    height: Math.abs(to.y - from.y),
  };
}

/**
 * The selection with only the Squads a Faction still holds.
 *
 * A Squad can leave the field — a broken Squad deserts (B6), a destroyed one is
 * gone (C3) — and a selection that still named it would give an order to a man
 * who is not there. Pruning happens where an Observation is read, which is the
 * one moment the Player's memory can be checked against the world.
 */
export function stillHeld(selection: Selection, held: readonly number[], settlements: readonly number[]): Selection {
  const squads = selection.squads.filter((id) => held.includes(id));
  const settlement = selection.settlement !== null && settlements.includes(selection.settlement)
    ? selection.settlement
    : null;

  if (squads.length === selection.squads.length && settlement === selection.settlement) return selection;

  return { squads, settlement };
}

/** Whether a rectangle holds a point. A zero-sized box holds nothing; a click is one pixel. */
function contains(rect: PickRect, point: PickPoint): boolean {
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

/** Whether two rectangles share any pixel at all. */
function overlaps(left: PickRect, right: PickRect): boolean {
  if (left.width <= 0 || left.height <= 0 || right.width <= 0 || right.height <= 0) return false;

  return (
    left.x < right.x + right.width &&
    right.x < left.x + left.width &&
    left.y < right.y + right.height &&
    right.y < left.y + left.height
  );
}

/**
 * The Squad drawn in front of the others: the one standing on the later tile
 * row, which is the one whose men are painted last, with the id breaking a tie
 * so the answer is stable.
 */
function frontmost(candidates: readonly Pickable[]): Pickable | null {
  let best: Pickable | null = null;

  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }

    if (candidate.depth > best.depth || (candidate.depth === best.depth && candidate.id > best.id)) best = candidate;
  }

  return best;
}

/** A Squad added to a list, or taken out of it when it was already there. */
function toggled(squads: readonly number[], id: number, additive: boolean): readonly number[] {
  if (!additive) return [id];
  if (squads.includes(id)) return squads.filter((candidate) => candidate !== id);

  return [...squads, id];
}
