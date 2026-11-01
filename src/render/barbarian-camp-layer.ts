/** The neutral camps the current Observation has actually discovered. */
import { Container, Sprite, Texture } from 'pixi.js';
import { barbarianCampSprite } from '../art/barbarian-camp.ts';
import type { SiegeVisible } from '../sim/siege.ts';
import { textureOf } from './stage.ts';
import { tilePixel } from './terrain.ts';

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
  const textures = new Map<string, Texture>();
  return {
    setVisible(visible) { root.visible = visible; },
    update(camps) {
      const present = new Set(camps.map((camp) => camp.id));
      for (const [id, sprite] of sprites) {
        if (!present.has(id)) { sprite.destroy(); sprites.delete(id); }
      }
      for (const camp of camps) {
        const key = `${camp.variant}:${camp.condition}`;
        let texture = textures.get(key);
        if (texture === undefined) {
          texture = textureOf(barbarianCampSprite(camp.variant, camp.condition));
          textures.set(key, texture);
        }
        let sprite = sprites.get(camp.id);
        if (sprite === undefined) {
          sprite = new Sprite(texture);
          root.addChild(sprite);
          sprites.set(camp.id, sprite);
        }
        sprite.texture = texture;
        const at = tilePixel(camp.x, camp.y);
        sprite.position.set(at.x, at.y);
      }
    },
  };
}
