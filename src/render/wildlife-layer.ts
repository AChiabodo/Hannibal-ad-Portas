import { Container, Sprite } from 'pixi.js';
import type { FogView } from '../sim/fog.ts';
import { textureOf } from './stage.ts';
import { visibleWildlife, wildlifeSprite, type Wildlife } from './wildlife.ts';

/** Upload each silhouette once; positions and visibility are presentation only. */
export function createWildlifeLayer(world: Container, animals: readonly Wildlife[]): {
  update(fog: FogView, tick: number): void;
} {
  const layer = new Container();
  layer.zIndex = 0.5;
  world.addChild(layer);
  const textures = { hare: textureOf(wildlifeSprite('hare')), boar: textureOf(wildlifeSprite('boar')) };
  const sprites = new Map<number, Sprite>();
  for (const animal of animals) {
    const sprite = new Sprite(textures[animal.kind]);
    sprite.visible = false;
    sprites.set(animal.id, sprite);
    layer.addChild(sprite);
  }
  return {
    update(fog, tick) {
      for (const sprite of sprites.values()) sprite.visible = false;
      for (const animal of visibleWildlife(animals, fog, tick)) {
        const sprite = sprites.get(animal.id);
        if (sprite === undefined) continue;
        sprite.position.set(animal.pixelX, animal.pixelY);
        sprite.visible = true;
      }
    },
  };
}
