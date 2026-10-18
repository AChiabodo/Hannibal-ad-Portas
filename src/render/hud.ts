/**
 * The HUD on the stage: the interface's two plates, over the theatre (ticket B7).
 *
 * The interface itself is composed in `ui/`, in Node-testable pixels; this module
 * is the one step that needs the engine — a `PixelBuffer` becomes a texture and a
 * texture becomes a sprite. It is deliberately thin, because the interesting
 * decisions (what the HUD says, where it stands, what a click selects) are all
 * `ui/`'s and are checked without a browser.
 *
 * **Two plates, not one.** The panels change when the Match or the selection
 * does; the minimap changes when the *camera* does, and a player pans far more
 * often than a Season turns. Keeping them on separate sprites is what makes a
 * pan recompose a hundred-pixel square instead of a full-screen interface.
 *
 * The layer hangs off the stage's root rather than off the camera's container:
 * the HUD is screen-space, and that is the whole of "legible at every zoom level
 * the camera allows" — a 5×7 glyph is five by seven screen pixels at 1× and at
 * 8×, and no panel is ever magnified into a smear.
 */
import { Container, Sprite } from 'pixi.js';
import type { PixelBuffer } from '../art/pixel-buffer.ts';
import { hudLayout, renderPanels, type HudModel, type HudSize } from '../ui/hud.ts';
import { textureOf, type Stage } from './stage.ts';

/** The HUD as the page uses it: two sprites whose plates are replaced, never grown. */
export interface HudLayer {
  /** The container both plates hang off, in screen space. */
  readonly root: Container;
  /** Replaces the panel plate. */
  panels(model: HudModel, size: HudSize): void;
  /** Replaces the minimap plate, and puts it where the layout says. */
  minimap(model: HudModel, buffer: PixelBuffer, size: HudSize): void;
}

/** Builds the layer inside a stage, with nothing drawn until the first plate arrives. */
export function createHudLayer(stage: Stage): HudLayer {
  const root = new Container();
  stage.root.addChild(root);

  let panels: Sprite | null = null;
  let minimap: Sprite | null = null;

  return {
    root,

    panels(model, size) {
      panels = upload(panels, root, renderPanels(model, size));
    },

    minimap(model, buffer, size) {
      const at = hudLayout(model, size).minimap;
      minimap = upload(minimap, root, buffer);
      minimap.position.set(at.x, at.y);
    },
  };
}

/**
 * A sprite showing a buffer, replacing what the sprite showed before.
 *
 * The old texture is destroyed with its source: a page that re-composed its
 * interface every Season would otherwise leave a texture per Season on the GPU,
 * which is a leak that only shows after an afternoon of play.
 */
function upload(sprite: Sprite | null, root: Container, buffer: PixelBuffer): Sprite {
  const texture = textureOf(buffer);

  if (sprite === null) {
    const created = new Sprite(texture);
    root.addChild(created);
    return created;
  }

  const previous = sprite.texture;
  sprite.texture = texture;
  previous.destroy(true);

  return sprite;
}
