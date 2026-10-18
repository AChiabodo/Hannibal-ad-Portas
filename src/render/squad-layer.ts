/**
 * The Squads on the stage: one sprite per Squad, and the markers of where they
 * were told to go (ticket C2).
 *
 * `render/squads.ts` composes a Squad's men into one `PixelBuffer`; this module
 * is the one step that needs the engine — a buffer becomes a texture and a
 * texture becomes a sprite — and it is deliberately thin, because every decision
 * worth checking (which men, in what order, in which frame) is made in Node and
 * is checked there.
 *
 * **One sprite per Squad, not one per man.** A hundred and twenty men per block
 * and a dozen blocks would be fourteen hundred sprites before anything else is
 * drawn, which is not what a page that has to stay responsive spends its frame
 * on (F3 measures the rest). The men are composed once into a block, and the
 * block is re-composed only when the shape it draws has changed — which is what
 * `squadFrameKey` is for: a Squad standing still does no work at all, and a
 * marching one uploads a new texture when it steps, not sixty times a second.
 *
 * **Depth is the tile a Squad stands on.** Blocks are tall and they overlap, so
 * the one drawn in front has to be the one further down the screen: the Sprite's
 * `zIndex` is its Squad's row, and the layer's container sorts its children by
 * it. That is also what makes clicking the right block possible — the same order
 * a Player sees is the order `input/selection.ts` picks in.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { VisibleSquad } from '../sim/economy-match.ts';
import type { Corpse } from '../sim/residue.ts';
import { CORPSE_FADE_STEPS, corpseFade, corpsePlacement, corpseSprite, figureOf } from './corpses.ts';
import { textureOf } from './stage.ts';
import {
  ORDER_MARKER_SIZE,
  blockPlacement,
  orderMarker,
  squadBlock,
  squadFrameKey,
} from './squads.ts';
import { tilePixel } from './terrain.ts';

/** What the layer is handed on every redraw: the world as the Player may see it. */
export interface SquadField {
  /** The Faction's own Squads, as its Observation names them. */
  readonly squads: readonly VisibleSquad[];

  /** The Squad ids the Player has picked, which are ringed on the map. */
  readonly selected: readonly number[];

  /** The tick the frames are chosen from. Never wall time (ADR-0006). */
  readonly tick: number;

  /**
   * The men who fell, as `sim/residue.ts` records them (C3).
   *
   * Residue and not state: a corpse is drawn, fades on a tick and is swept away,
   * and nothing here may write back into it.
   */
  readonly corpses?: readonly Corpse[];

  /** Which Faction's cloth the soldiers wear. */
  readonly faction: 'rome' | 'carthage';
}

/** The layer: one call, and the stage agrees with the field. */
export interface SquadLayer {
  /** Brings the sprites into line with the field: moved, re-drawn, added or removed. */
  update(field: SquadField): void;

  /**
   * Shows or hides every block at once.
   *
   * The debugging surface B3 opened for the fog — "is the ground under this
   * drawn the way the generator says" — needs the map alone, and an army
   * standing on it is a hundred and twenty men between the camera and the
   * answer. Hiding them changes nothing about the Match: it is a lens, not a
   * rule, and no Controller can see through it.
   */
  setVisible(visible: boolean): void;
}

/** One Squad's sprite, and what it was last drawn from. */
interface Drawn {
  readonly sprite: Sprite;
  key: string;
}

/**
 * How far above the theatre a Squad's sprite sorts, so it is drawn over the map
 * and the fog.
 *
 * The dead sort at the same height and one below, because a body belongs to the
 * ground it fell on: a block of men standing over a corpse must hide it, and a
 * corpse must never be drawn over the men still fighting.
 */
const ABOVE_THE_MAP = 10;

/** How far above every block a destination marker sorts, so a marker is never hidden by the men. */
const ABOVE_EVERY_BLOCK = 1000;

/**
 * Builds the layer under a container the camera is applied to, with nothing
 * drawn until the first field arrives.
 *
 * @param parent The camera's container: the men are in the world, not on the
 *   screen, so a pan moves them with the ground they stand on.
 */
export function createSquadLayer(parent: Container): SquadLayer {
  const fallen = new Container();
  fallen.sortableChildren = true;
  fallen.zIndex = ABOVE_THE_MAP;
  parent.addChild(fallen);

  const root = new Container();
  root.sortableChildren = true;
  root.zIndex = ABOVE_THE_MAP + 1;
  parent.addChild(root);

  const squads = new Map<number, Drawn>();
  const markers = new Map<number, Sprite>();
  const corpses = new Map<string, Sprite>();
  const corpseTextures = new Map<string, Texture>();

  // One texture for every destination marker: a marker never changes, so it is
  // composed once and shared by every sprite that shows it.
  const markTexture = textureOf(orderMarker());

  return {
    setVisible(visible) {
      root.visible = visible;
      fallen.visible = visible;
    },

    update(field) {
      const afield = new Set(field.squads.map((squad) => squad.id));

      for (const squad of field.squads) {
        const selected = field.selected.includes(squad.id);
        const key = squadFrameKey(squad, { tick: field.tick, faction: field.faction, selected });
        const drawn = squads.get(squad.id);
        const at = blockPlacement(tilePixel(squad.x, squad.y), {
          men: squad.men,
          formation: squad.formation,
          facing: squad.facing,
        });

        if (drawn === undefined) {
          const sprite = new Sprite(textureOf(squadBlock(squad, { tick: field.tick, faction: field.faction, selected })));
          sprite.position.set(at.x, at.y);
          sprite.zIndex = squad.y;
          root.addChild(sprite);
          squads.set(squad.id, { sprite, key });
        } else {
          if (drawn.key !== key) {
            // A new shape: a new texture, and the one before it let go rather
            // than kept. A marching block re-draws on the tick it steps, so a
            // page left open for an hour is not an hour of textures.
            const next = textureOf(squadBlock(squad, { tick: field.tick, faction: field.faction, selected }));
            drawn.sprite.texture.destroy(true);
            drawn.sprite.texture = next;
            drawn.key = key;
          }
          drawn.sprite.position.set(at.x, at.y);
          drawn.sprite.zIndex = squad.y;
        }

        marker(root, markers, squad, selected, markTexture);
      }

      for (const [id, drawn] of squads) {
        if (afield.has(id)) continue;

        drawn.sprite.texture.destroy(true);
        drawn.sprite.destroy();
        squads.delete(id);
      }

      for (const [id, sprite] of markers) {
        if (afield.has(id)) continue;

        sprite.destroy();
        markers.delete(id);
      }

      layOutTheDead(fallen, corpses, corpseTextures, field.corpses ?? [], field.tick);
    },
  };
}

/**
 * Brings the field of the dead into line with the residue: laid where they fell,
 * faded by their age, and gone when their thirty seconds are up. The residue a
 * caller hands over is whatever its Faction may *see* — `render/corpses.ts`'s
 * `visibleCorpses` is the filter — because the whole list is both Factions'.
 *
 * A corpse is keyed by where and when it fell rather than by a number, because
 * residue has no ids and never gets one: two marks reported for one tile in one
 * round are one mark, and a single body is the truth about what a Player can
 * see. The step is the only thing that changes from frame to frame, and it is
 * read off the tick rather than remembered.
 */
function layOutTheDead(
  root: Container,
  drawn: Map<string, Sprite>,
  textures: Map<string, Texture>,
  corpses: readonly Corpse[],
  tick: number,
): void {
  const present = new Set<string>();

  for (const corpse of corpses) {
    const step = corpseFade(corpse, tick);
    if (step === 0) continue;

    const key = `${String(corpse.x)},${String(corpse.y)},${String(corpse.born)}`;
    if (present.has(key)) continue;
    present.add(key);

    const at = corpsePlacement(corpse);
    const known = drawn.get(key);

    if (known === undefined) {
      const lying = new Sprite(corpseTexture(textures, corpse));
      lying.position.set(at.x, at.y);
      lying.zIndex = corpse.y;
      lying.alpha = step / CORPSE_FADE_STEPS;
      root.addChild(lying);
      drawn.set(key, lying);

      continue;
    }

    known.alpha = step / CORPSE_FADE_STEPS;
  }

  for (const [key, lying] of drawn) {
    if (present.has(key)) continue;

    lying.destroy();
    drawn.delete(key);
  }
}

/**
 * The texture of one kind of corpse, composed once and shared.
 *
 * A corpse never changes shape: it lies, and then it fades. So one texture per
 * Faction and figure is the whole of what a field of the dead costs, however
 * many corpses are on it — and the drawing itself is `render/corpses.ts`'s,
 * which is checked in Node.
 */
function corpseTexture(textures: Map<string, Texture>, corpse: Corpse): Texture {
  const key = `${figureOf(corpse)}:${String(corpse.owner)}`;
  const known = textures.get(key);
  if (known !== undefined) return known;

  const composed = textureOf(corpseSprite(corpse));
  textures.set(key, composed);

  return composed;
}

/**
 * The destination marker of one Squad: where it is walking to, and only while it
 * is selected.
 *
 * A marker for every Squad with an order would turn a marching army into a field
 * of diamonds; a marker for the men the Player is looking at is the answer to
 * "did my click land, and where". It sorts above every block — it is an
 * annotation about the map, not a thing in the world with a depth of its own.
 */
function marker(
  root: Container,
  markers: Map<number, Sprite>,
  squad: VisibleSquad,
  selected: boolean,
  texture: Texture,
): void {
  const known = markers.get(squad.id);
  const goal = squad.goal;

  if (!selected || goal === null) {
    if (known !== undefined) {
      known.destroy();
      markers.delete(squad.id);
    }
    return;
  }

  const at = tilePixel(goal.x, goal.y);
  const x = at.x + Math.floor((16 - ORDER_MARKER_SIZE) / 2);
  const y = at.y + Math.floor((16 - ORDER_MARKER_SIZE) / 2);

  if (known === undefined) {
    const sprite = new Sprite(texture);
    sprite.position.set(x, y);
    sprite.zIndex = ABOVE_EVERY_BLOCK + goal.y;
    root.addChild(sprite);
    markers.set(squad.id, sprite);

    return;
  }

  known.position.set(x, y);
  known.zIndex = ABOVE_EVERY_BLOCK + goal.y;
}
