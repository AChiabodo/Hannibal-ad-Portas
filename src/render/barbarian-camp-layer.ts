/** The neutral camps the current Observation has actually discovered. */
import { Container, Sprite, Texture } from 'pixi.js';
import { barbarianCampSprite } from '../art/barbarian-camp.ts';
import { TILE_SIZE } from '../sim/map.ts';
import type { SiegeVisible } from '../sim/siege.ts';
import { textureOf } from './stage.ts';

export interface BarbarianCampLayer {
  update(camps: NonNullable<SiegeVisible['barbarianCamps']>): void;
  setVisible(visible: boolean): void;
}

/** Never reads the Match: remembered camps are supplied by the faction's Observation. */
export function createBarbarianCampLayer(parent: Container): BarbarianCampLayer {
  const root = new Container();
  root.zIndex = 1;
  parent.addChild(root);
  const sprites = new Map<number, Sprite>();
  const textures = new Map<number, Texture>();
  return {
    setVisible(visible) { root.visible = visible; },
    update(camps) {
      const present = new Set(camps.map((camp) => camp.id));
      for (const [id, sprite] of sprites) {
        if (!present.has(id)) { sprite.destroy(); sprites.delete(id); }
      }
      for (const camp of camps) {
        let texture = textures.get(camp.variant);
        if (texture === undefined) {
          texture = textureOf(barbarianCampSprite(camp.variant));
          textures.set(camp.variant, texture);
        }
        let sprite = sprites.get(camp.id);
        if (sprite === undefined) {
          sprite = new Sprite(texture);
          root.addChild(sprite);
          sprites.set(camp.id, sprite);
        }
        sprite.texture = texture;
        sprite.position.set(camp.x * TILE_SIZE, camp.y * TILE_SIZE);
      }
    },
  };
}
