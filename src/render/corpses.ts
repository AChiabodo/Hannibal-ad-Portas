/**
 * The dead, drawn: corpses as small sprites on the theatre (ticket C3, PLAN §4).
 *
 * "Corpses are visual residue that fades" is the plan's sentence, and this is the
 * half of it that draws. Everything that can be got wrong is decided here in
 * Node and tested in Node: which body a mark is drawn as, where on its tile it
 * lies, and how far through its fade it is. `render/squad-layer.ts` does nothing
 * but upload what this module composed, so a body that is in the wrong place is
 * a test failure rather than something a reviewer squints at in a screenshot.
 *
 * ## Nothing here is state
 *
 * A corpse is not in `MatchState` and cannot be: it fades, so it would make the
 * same Match hash differently from one second to the next (`sim/residue.ts`,
 * ADR-0006). The fade is *derived* from the tick and the corpse's birth tick,
 * which are both already in hand, so nothing has to be remembered per frame —
 * and a body that is drawn is drawn from the same numbers on every machine.
 *
 * ## The corpse is the death frame the squad already has
 *
 * `art/figures.ts` draws four actions, and death is one of them: a body lying
 * where it stood. A corpse is that frame, in the fallen Squad's cloth and with
 * the fallen Squad's silhouette — a triarius' great round shield still lying
 * beside him — which is what makes a field of the dead read as *these* men and
 * not as a generic marker. The Atelier already shows that frame, so nothing new
 * is committed to the art pipeline for this.
 *
 * ## The scatter is arithmetic, not a die
 *
 * Several men fall on one tile in a round, and one body on one pixel row would
 * read as one body. So each mark is nudged to one of a handful of places inside
 * its tile by a hash of its own data — its tile, the round it fell on and its
 * type. That is deterministic and free (no draw from the Match's generator,
 * which would move the cursor and change the hash), and two corpses that fell on
 * the same tile in different rounds land in different places.
 */
import { figureFrame, soldier, type FigureName } from '../art/figures.ts';
import type { PixelBuffer } from '../art/pixel-buffer.ts';
import { squadTypeOf } from '../content/index.ts';
import { factionOf } from '../sim/faction.ts';
import { KNOWLEDGE, knows, type FogView } from '../sim/fog.ts';
import { CORPSE_FADE_TICKS, CORPSE_TICKS, type Corpse } from '../sim/residue.ts';
import { FIGURE_OF_SQUAD } from './squads.ts';
import { tilePixel } from './terrain.ts';

/**
 * How many shades a corpse is drawn through on its way out: three, from whole to
 * a third.
 *
 * A body that vanished on one tick would read as a rendering bug, and one that
 * were translucent for its whole thirty seconds would look like a ghost from the
 * moment it fell. Three steps over the last second of its life is enough to read
 * as *going* and few enough that nobody has to wonder which step they are seeing.
 */
export const CORPSE_FADE_STEPS = 3;

/**
 * The places a corpse can lie inside its tile, in theatre pixels from the tile's
 * top-left corner.
 *
 * Half a dozen and no more: a tile is two hundred and fifty-six pixels of ground
 * and a figure is ten by fourteen, so a handful of places is all it takes to
 * stop a pile from reading as one man. They stay inside the tile because a
 * corpse belongs to the ground it fell on, and one that wandered onto the next
 * tile would be a picture of the wrong thing.
 */
const PLACES: readonly { readonly x: number; readonly y: number }[] = [
  { x: 1, y: 0 },
  { x: 7, y: 1 },
  { x: 3, y: 2 },
  { x: 11, y: 0 },
  { x: 9, y: 2 },
  { x: 5, y: 1 },
];

/**
 * The figure each Squad type is drawn as when it has fallen: the same one it was.
 *
 * A type the artist's table does not know falls back to the first silhouette
 * rather than throwing: a renderer that refused to draw a corpse would be a frame
 * that stopped the page, which is a worse failure than one wearing the wrong
 * helmet.
 */
export function corpseFigure(type: string): FigureName {
  return FIGURE_OF_SQUAD[type] ?? 'hastati';
}

/**
 * One corpse as a sprite: the fallen figure, in its Faction's cloth, lying where
 * it stood.
 *
 * The buffer is one figure wide and tall — the death frame of the type's own
 * silhouette — so a layer can place it by its tile and nothing else, the same
 * way a block is placed by its tile. It is the art's own cached buffer and is
 * never written to, so a field of a hundred dead costs one upload per kind.
 */
export function corpseSprite(corpse: Corpse): PixelBuffer {
  return soldier(
    figureOf(corpse),
    'south',
    figureFrame('death', 0),
    factionOf(corpse.owner === 0 ? 0 : 1),
  );
}

/**
 * Where a corpse lies, in theatre pixels: its tile's corner, nudged to one of the
 * handful of places inside it.
 *
 * The nudge is a hash of the mark's own data — the tile it fell on, the round it
 * fell in and the type it was — so it is the same on every machine, needs no
 * random source (which would change the Match's hash), and spreads a pile out.
 */
export function corpsePlacement(corpse: Corpse): { readonly x: number; readonly y: number } {
  const corner = tilePixel(corpse.x, corpse.y);
  const place = PLACES[spreadOf(corpse)] ?? PLACES[0] ?? { x: 0, y: 0 };

  return { x: corner.x + place.x, y: corner.y + place.y };
}

/**
 * How far through its fade a corpse is: `CORPSE_FADE_STEPS` while it is fresh,
 * down to one on its last tick, and none once it has gone.
 *
 * A drawing code turns this into an alpha of `steps / CORPSE_FADE_STEPS`. Zero
 * means "do not draw it at all", which is what lets a layer drop a sprite on the
 * frame it stops existing rather than a second later.
 */
export function corpseFade(corpse: Corpse, tick: number): number {
  const age = tick - corpse.born;
  if (age < 0 || age >= CORPSE_TICKS) return 0;

  const remaining = CORPSE_TICKS - age;
  // The last stretch of a corpse's life is the fade, and it is walked in
  // `CORPSE_FADE_STEPS` even steps: one for each shade a drawing code has.
  const width = Math.ceil(CORPSE_FADE_TICKS / CORPSE_FADE_STEPS);
  const step = Math.ceil(remaining / width);

  return Math.min(CORPSE_FADE_STEPS, Math.max(1, step));
}

/** The corpse's own data, hashed into an index into `PLACES`. */
function spreadOf(corpse: Corpse): number {
  const hash = corpse.x * 31 + corpse.y * 17 + corpse.born * 7 + corpse.type * 13;

  return Math.abs(hash) % PLACES.length;
}

/**
 * The figure a corpse is drawn as, by the Squad type it was.
 *
 * Exported because it is also the key a drawing layer caches a corpse's texture
 * under: two Squads of the same kind and Faction leave the same shape on the
 * field, and composing it once is the whole of what a field of the dead costs.
 */
export function figureOf(corpse: Corpse): FigureName {
  return corpseFigure(squadTypeOf(corpse.type)?.id ?? '');
}

/**
 * The corpses a Faction may see: the ones on tiles its eyes cover now.
 *
 * Residue is not filtered by fog — it is not state, and `sim/residue.ts` records
 * both Factions' dead in one list — so the filter belongs where the drawing is,
 * and it belongs *shared*: the page draws through this and a test holds it to
 * the rule. A corpse on a tile nobody is looking at is a fact about the enemy
 * that the Faction has not paid for, which is the whole of what B4's fog is for
 * (ADR-0013); the dead are drawn where they can be *seen*, not where they are.
 */
export function visibleCorpses(corpses: readonly Corpse[], fog: FogView): readonly Corpse[] {
  return corpses.filter((corpse) => knows(fog, corpse.x, corpse.y) === KNOWLEDGE.visible);
}
