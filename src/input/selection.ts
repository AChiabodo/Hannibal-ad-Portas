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

/**
 * Something on the map a click can land on: a Squad, or a settlement (ticket U6).
 *
 * Both are handed to this module in the same shape, because a Player's click is one
 * gesture whatever it lands on: the rectangle it is drawn in, how near the front of
 * the picture it is, and what picking it means.
 */
export interface Pickable {
  /** What a click selects: the men, or a settlement's panel. */
  readonly kind: 'squad' | 'settlement';

  /** The id an order or a panel would name. */
  readonly id: number;

  /** Where it is drawn, in theatre pixels. */
  readonly rect: PickRect;

  /**
   * How far down the screen it *stands* — the tile row it is drawn from, which is
   * the key the renderer sorts it by.
   *
   * Not derived from `rect`: a block's rectangle is its whole drawn extent, and
   * which way that extent grows depends on where the Squad is facing (`render/
   * squads.ts` anchors it by its front rank), and a place's rectangle is drawn
   * round its tile rather than up from it. The tile row is the thing both sides can
   * agree on without one of them guessing at the other's arithmetic — the renderer
   * draws the larger row in front, and the pick takes the larger row.
   */
  readonly depth: number;

  /**
   * Which drawing the thing belongs to, where two drawings overlap.
   *
   * The map is drawn in layers — the theatre, the places on it, the fog, the dead,
   * the men (`render/boot.ts` and the two layers) — and the layer a thing is drawn
   * in decides which of two overlapping things a Player can see. A pick has to agree
   * with that or it would select what nobody can see: the men stand over the places
   * they are in, so a Squad sorts above a settlement whatever rows the two are on.
   */
  readonly layer: number;
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
  const hit = pickableAt(pickables, point);

  if (hit === null) {
    // A click on bare ground clears the selection, unless it was additive: a
    // shift-click that missed is a shift-click, not a decision to drop the men.
    return additive ? selection : NOTHING_SELECTED;
  }

  // A place is one selection and not a set: picking a settlement opens its panel
  // and puts the men down, and a shift adds nothing to a wall.
  if (hit.kind === 'settlement') return selectSettlement(hit.id);

  return { squads: toggled(selection.squads, hit.id, additive), settlement: null };
}

/**
 * The thing drawn in front at a point, or `null` where nothing is.
 *
 * One rule, used twice: by a click (`selectAt`) and by an armed action asking which
 * place a Player has aimed at (`render/game.ts`). Two implementations of "which one
 * did the Player mean" would be one more than a Player can see.
 */
export function pickableAt(pickables: readonly Pickable[], point: PickPoint): Pickable | null {
  return frontmost(pickables.filter((pickable) => contains(pickable.rect, point)));
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
  // A dragged box is a gesture about men: it picks every Squad it touches and
  // leaves a settlement's panel to a click on the place itself.
  const touched = pickables
    .filter((squad) => squad.kind === 'squad' && overlaps(squad.rect, box))
    .map((squad) => squad.id);

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
 * who is not there. Pruning happens where an Observation is read, which is the one
 * moment the Player's memory can be checked against the world.
 *
 * A **settlement is not pruned**. A place on the map does not leave the field the
 * way a Squad does: it can change hands, and what the panel can say about it then is
 * the interface's question (`ui/hud.ts` asks its own, against the places the Faction
 * knows), not the Controller's. A Controller that dropped the place the moment it
 * stopped being the Faction's own would close the panel of the enemy Stronghold a
 * Player had just clicked (#57).
 */
export function stillHeld(selection: Selection, held: readonly number[]): Selection {
  const squads = selection.squads.filter((id) => held.includes(id));

  if (squads.length === selection.squads.length) return selection;

  return { squads, settlement: selection.settlement };
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
 * The thing drawn in front of the others: the one in the later-drawn layer, then
 * the one standing on the later tile row, with the id breaking a tie so the answer
 * never depends on the order a list happened to arrive in.
 */
function frontmost(candidates: readonly Pickable[]): Pickable | null {
  let best: Pickable | null = null;

  for (const candidate of candidates) {
    if (best === null) {
      best = candidate;
      continue;
    }

    if (inFrontOf(candidate, best)) best = candidate;
  }

  return best;
}

/** Whether one thing is drawn in front of another: layer first, then the row, then the id. */
function inFrontOf(candidate: Pickable, best: Pickable): boolean {
  if (candidate.layer !== best.layer) return candidate.layer > best.layer;

  return candidate.depth > best.depth || (candidate.depth === best.depth && candidate.id > best.id);
}

/** A Squad added to a list, or taken out of it when it was already there. */
function toggled(squads: readonly number[], id: number, additive: boolean): readonly number[] {
  if (!additive) return [id];
  if (squads.includes(id)) return squads.filter((candidate) => candidate !== id);

  return [...squads, id];
}
