/**
 * The game page's boot: title plate, camera, one frame (ticket B2).
 *
 * A1 put an orange square here to prove that a headless browser could render and
 * read a pixel back. B2 replaces the square with the real thing at the smallest
 * size that is still real: the generated title plate, drawn through the generated
 * font and palette, seen through the camera that pans and zooms in whole steps,
 * with the frame readable pixel by pixel through the debug hooks (ADR-0003).
 *
 * The view is also the browser half of the pixel-hash story. A test computes the
 * title plate *in Node* with the art library, then asks the page for the pixel the
 * camera says should be there and compares the two: the GPU's answer against the
 * generator's, which is a check no single side of the pipeline can pass on its own.
 */

import { Container } from 'pixi.js';
import { BASE } from '../art/palette.ts';
import type { Rgba } from '../art/pixel-buffer.ts';
import { titlePlate } from '../art/title.ts';
import { type Camera, createCamera, panBy as panCamera, zoomTo as zoomCamera } from './camera.ts';
import {
  applyCamera,
  createStage,
  frameReport,
  samplesOf,
  type FrameReport,
  type PixelPoint,
} from './stage.ts';

/**
 * The magnification the game page opens at.
 *
 * Two, so the title on screen is twice the letterforms it is made of: with the
 * camera at one to one a seven-pixel letter is seven screen pixels tall, which is
 * the HUD's size and not a title's. It is also the smallest zoom at which a
 * half-pixel mistake in the camera would be visible.
 */
export const DEFAULT_ZOOM = 2;

/** Where the camera is looking, right now. */
export interface ViewState {
  readonly camera: Camera;
  readonly width: number;
  readonly height: number;
}

/**
 * The debug surface of the running page (ADR-0003).
 *
 * Deliberately the same calls a test makes and a player will: move the camera,
 * change the zoom, and read what the renderer produced. `samples` is the agent's
 * half of the pixel pipeline — the renderer's own pixels, in the generator's own
 * currency — and it takes several points at once because extraction is the cost.
 */
export interface ViewHooks {
  /** Moves the camera by whole stage pixels. Refuses anything else. */
  panBy(dx: number, dy: number): void;
  /** Sets a whole-number magnification. Refuses anything else. */
  zoomTo(zoom: number): void;
  /** The camera and the viewport, as they stand. */
  describe(): ViewState;
  /** Reads pixels out of the current frame, one extraction for all of them. */
  samples(points: readonly PixelPoint[]): readonly Rgba[];
}

/** The running game page: what it drew, and the hooks to ask it for more. */
export interface GameView extends ViewHooks {
  /** What the renderer did when the page booted. */
  readonly probe: FrameReport;
}

/**
 * Builds the page: the title plate at the default zoom, one frame drawn, and the
 * hooks Playwright and, later, an external agent drive it with.
 */
export async function bootRenderer(mount: HTMLElement): Promise<GameView> {
  const plate = titlePlate();
  const stage = await createStage(mount, {
    width: plate.width * DEFAULT_ZOOM,
    height: plate.height * DEFAULT_ZOOM,
    background: BASE.night,
  });

  const world = new Container();
  stage.root.addChild(world);
  world.addChild(stage.spriteOf(plate));

  let camera = createCamera({ zoom: DEFAULT_ZOOM });
  applyCamera(world, camera);
  stage.render();

  const moveTo = (next: Camera): void => {
    camera = next;
    applyCamera(world, next);
    stage.render();
  };

  return {
    probe: frameReport(stage),
    panBy: (dx, dy) => {
      moveTo(panCamera(camera, dx, dy));
    },
    zoomTo: (zoom) => {
      moveTo(zoomCamera(camera, zoom));
    },
    describe: () => ({ camera, width: stage.width, height: stage.height }),
    samples: (points) => samplesOf(stage, points),
  };
}
