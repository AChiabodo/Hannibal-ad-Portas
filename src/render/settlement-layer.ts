/**
 * The settlements on the stage: one sprite per place, and the brackets round the one
 * a Player has picked (ticket U6).
 *
 * The same shape as `render/squad-layer.ts`, for the same reasons: every decision
 * worth checking (which place, what condition, where it is drawn) is made in Node by
 * `ui/sites.ts` and `render/settlements.ts`, and this module is the thin step that
 * needs the engine — a `PixelBuffer` becomes a texture and a texture becomes a
 * sprite. **One sprite per place, not one per wall**, and a place is re-textured only
 * when what it is drawn as has changed (`siteLookKey`), so a page where nothing is
 * happening uploads nothing.
 *
 * ## Where it stands in the stack
 *
 * The layer sorts **below the fog and below the men**: a place is ground, the veil
 * over remembered ground has to fall on it exactly as it falls on the terrain around
 * it, and a Squad standing in a town must not be hidden behind its walls. The
 * container's `zIndex` is what says so, and `render/boot.ts` makes the world sort its
 * children so that the order is a number and not the order the layers happened to be
 * built in.
 *
 * Within the layer, places sort by the tile row they stand on — the same key the
 * blocks of men use — so two open settlements on neighbouring rows overlap the way
 * the ground under them does.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import { siteLookKey, siteMark, siteSprite, type SettlementKind, type SettlementLook } from '../art/settlements.ts';
import type { KnownSite } from '../ui/sites.ts';
import { siteDepth, siteLook, siteRect } from './settlements.ts';
import { textureOf } from './stage.ts';

/** What the layer is handed on every redraw: the places the Player may see, and what is picked. */
export interface SettlementField {
  /** Every place this Faction may see, as `ui/sites.ts` reads its Observation. */
  readonly sites: readonly KnownSite[];

  /** The settlement whose panel is open, which is bracketed on the map. */
  readonly selected: number | null;
}

/** The layer: one call, and the stage agrees with the field. */
export interface SettlementLayer {
  /** Brings the sprites into line with the field: moved, re-drawn, added or removed. */
  update(field: SettlementField): void;

  /**
   * Shows or hides every place at once.
   *
   * The debugging lens B3 opened for the fog — "is the ground drawn the way the
   * generator says" — compares the theatre pixel for pixel, and a town standing on
   * some of those pixels is not the theatre. It is a lens and not a rule: nothing a
   * Controller can see changes, and the places are still there.
   */
  setVisible(visible: boolean): void;
}

/**
 * How far above the ground the places sort, and below the fog and the men.
 *
 * `render/boot.ts` draws the theatre at 0 and the fog at 2 and `render/squad-layer.ts`
 * puts the dead at 10 and the living at 11, so 1 is the slot a place belongs in: over
 * the terrain, under the veil that dims what is remembered, under the men who fight
 * in it.
 */
const ON_THE_GROUND = 1;

/** One place's sprite, and the look it was last drawn from. */
interface Drawn {
  readonly sprite: Sprite;
  key: string;
}

/**
 * Builds the layer under the camera's container, with nothing drawn until the first
 * field arrives.
 *
 * @param parent The camera's container: a place is in the world, not on the screen,
 *   so a pan moves it with the ground it stands on.
 */
export function createSettlementLayer(parent: Container): SettlementLayer {
  const root = new Container();
  root.sortableChildren = true;
  root.zIndex = ON_THE_GROUND;
  parent.addChild(root);

  const places = new Map<number, Drawn>();
  const marks = new Map<SettlementKind, Sprite>();
  /** One texture per look: two towns in the same state share the pixels. */
  const textures = new Map<string, Texture>();

  return {
    setVisible(visible) {
      root.visible = visible;
    },

    update(field) {
      const afield = new Set(field.sites.map((site) => site.id));

      for (const site of field.sites) {
        const look = siteLook(site);
        const key = siteLookKey(look);
        const rect = siteRect(site);
        const drawn = places.get(site.id);

        if (drawn === undefined) {
          const sprite = new Sprite(textureFor(look));
          sprite.position.set(rect.x, rect.y);
          sprite.zIndex = siteDepth(site);
          root.addChild(sprite);
          places.set(site.id, { sprite, key });
        } else {
          if (drawn.key !== key) {
            drawn.sprite.texture = textureFor(look);
            drawn.key = key;
          }

          drawn.sprite.position.set(rect.x, rect.y);
          drawn.sprite.zIndex = siteDepth(site);
        }
      }

      for (const [id, drawn] of places) {
        if (afield.has(id)) continue;

        drawn.sprite.destroy();
        places.delete(id);
      }

      for (const mark of marks.values()) mark.visible = false;
      const picked = field.sites.find((site) => site.id === field.selected);
      if (picked !== undefined) {
        const mark = markFor(picked.kind);
        const rect = siteRect(picked);
        mark.position.set(rect.x, rect.y);
        mark.visible = true;
        // The brackets sit above every place, so a picked village's mark is never
        // hidden behind the walls of a town drawn later.
        mark.zIndex = Number.MAX_SAFE_INTEGER;
      }
    },
  };

  /** The texture one look is drawn with, uploaded once and shared. */
  function textureFor(look: SettlementLook): Texture {
    const key = siteLookKey(look);
    const cached = textures.get(key);
    if (cached !== undefined) return cached;

    const texture = textureOf(siteSprite(look));
    textures.set(key, texture);
    return texture;
  }

  /** The one place the brackets are drawn over, made once per kind. */
  function markFor(kind: SettlementKind): Sprite {
    const cached = marks.get(kind);
    if (cached !== undefined) return cached;

    const mark = new Sprite(textureOf(siteMark(kind)));
    root.addChild(mark);
    marks.set(kind, mark);
    return mark;
  }
}
