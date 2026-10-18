/**
 * The game page's boot: the theatre on screen, pannable and zoomable (ticket B3).
 *
 * B2 put the pipeline on screen with a title plate. B3 puts the *game* there: a
 * map B1 generated from a seed, rendered by `render/terrain.ts` into one
 * `PixelBuffer`, and drawn as one texture under the camera B2 built. It is the
 * smallest honest thing that satisfies the ticket — there is no Match yet, no fog
 * and no Squad — and it is also the browser half of the pixel-hash story: a test
 * computes the same theatre *in Node* with the same generator and asks the page
 * for the pixel the camera says is there, so the GPU's answer is compared against
 * the generator's and neither side can pass alone.
 *
 * **One texture, and why that is the responsive answer.** The whole 96×96
 * theatre is composed once, on boot, into a single 1552×1552 buffer. Panning and
 * zooming move one container: no tile is culled, no sprite is created or
 * destroyed, and the work per frame is the same at the corner of the map as at
 * its centre. That is a decision about this ticket — the terrain of B3 is static,
 * so there is nothing to gain from nine thousand sprites and a lot to lose — and
 * B4's fog and F3's performance pass are the tickets that will say what the map
 * costs once things move over it.
 *
 * **Input is a convenience over the same hooks.** The wheel and a drag call
 * `zoomAbout` and `panBy`, which are the calls a test makes: nothing about the
 * page is reachable only by a hand. Both are whole steps, so a player cannot put
 * the camera between two pixels any more than a test can.
 */

import { Container } from 'pixi.js';
import { BASE } from '../art/palette.ts';
import type { Rgba } from '../art/pixel-buffer.ts';
import { MAP_HEIGHT, MAP_WIDTH, generateMap } from '../sim/map.ts';
import { THEATRE_PIXELS, renderTerrain } from './terrain.ts';
import {
  type Camera,
  clampTo,
  createCamera,
  panBy as panCamera,
  zoomAbout as zoomAboutCamera,
  zoomIn,
  zoomOut,
} from './camera.ts';
import {
  applyCamera,
  createStage,
  frameReport,
  samplesOf,
  type FrameReport,
  type PixelPoint,
  type Stage,
} from './stage.ts';
import { DEFAULT_SEED, DEFAULT_ZOOM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './view.ts';

/**
 * The magnification the page opens at, and the viewport it opens in, are
 * `view.ts`: a browser test has to know them without loading the engine.
 */
export { DEFAULT_SEED, DEFAULT_ZOOM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH };

/** Where the camera is looking, and what it is looking at. */
export interface ViewState {
  readonly camera: Camera;
  /** Viewport width in stage pixels. */
  readonly width: number;
  /** Viewport height in stage pixels. */
  readonly height: number;
  /** The seed the theatre was generated from, which is what an onlooker needs to regenerate it. */
  readonly seed: number;
  /** The theatre's width in tiles. */
  readonly mapWidth: number;
  /** The theatre's height in tiles. */
  readonly mapHeight: number;
  /** The theatre's side in stage pixels, which is what the camera is clamped to. */
  readonly mapPixels: number;
}

/**
 * The debug surface of the running page (ADR-0003).
 *
 * Deliberately the same calls a test makes and a player's wheel makes: move the
 * camera, change the zoom about a point, and read what the renderer produced.
 * `samples` is the agent's half of the pixel pipeline — the renderer's own pixels,
 * in the generator's own currency — and it takes several points at once because
 * extraction is the cost.
 */
export interface ViewHooks {
  /** Moves the camera by whole stage pixels. Refuses anything else. */
  panBy(dx: number, dy: number): void;
  /** Sets a whole-number magnification, keeping the middle of the viewport where it is. */
  zoomTo(zoom: number): void;
  /** Sets a magnification, keeping one whole screen pixel where it is. */
  zoomAbout(zoom: number, screenX: number, screenY: number): void;
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
 * Builds the page: the theatre on one texture, the camera on it, one frame drawn,
 * and the hooks Playwright and, later, an external agent drive it with.
 */
export async function bootRenderer(mount: HTMLElement): Promise<GameView> {
  const theatre = renderTerrain(generateMap(DEFAULT_SEED));
  const stage = await createStage(mount, {
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    background: BASE.night,
  });

  const world = new Container();
  stage.root.addChild(world);
  world.addChild(stage.spriteOf(theatre));

  const bounds = {
    stageWidth: THEATRE_PIXELS,
    stageHeight: THEATRE_PIXELS,
    width: stage.width,
    height: stage.height,
  };
  let camera = clampTo(centred(createCamera({ zoom: DEFAULT_ZOOM }), stage), bounds);
  applyCamera(world, camera);
  stage.render();

  const moveTo = (next: Camera): void => {
    camera = clampTo(next, bounds);
    applyCamera(world, camera);
    stage.render();
  };

  const view: GameView = {
    probe: frameReport(stage),
    panBy: (dx, dy) => {
      moveTo(panCamera(camera, dx, dy));
    },
    zoomTo: (zoom) => {
      moveTo(zoomAboutCamera(camera, zoom, Math.floor(stage.width / 2), Math.floor(stage.height / 2)));
    },
    zoomAbout: (zoom, screenX, screenY) => {
      moveTo(zoomAboutCamera(camera, zoom, screenX, screenY));
    },
    describe: () => ({
      camera,
      width: stage.width,
      height: stage.height,
      seed: DEFAULT_SEED,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      mapPixels: THEATRE_PIXELS,
    }),
    samples: (points) => samplesOf(stage, points),
  };

  bindPointer(stage, view);

  return view;
}

/** A camera looking at the middle of the stage. */
function centred(camera: Camera, stage: Stage): Camera {
  return {
    x: Math.floor(THEATRE_PIXELS / 2 - stage.width / (2 * camera.zoom)),
    y: Math.floor(THEATRE_PIXELS / 2 - stage.height / (2 * camera.zoom)),
    zoom: camera.zoom,
  };
}

/**
 * Lets a wheel and a drag move the camera, in the same whole steps the hooks take.
 *
 * A drag is deltas of whole stage pixels: the pointer's travel since it went down
 * is divided by the zoom and rounded, and the *difference* from what has already
 * been applied is panned, so a slow drag does not lose its remainder and a fast
 * one does not jump. The wheel is an anchored zoom about the pointer, which is
 * why `zoomAbout` exists: the map grows towards what the player is looking at.
 */
function bindPointer(stage: Stage, view: GameView): void {
  let drag: { readonly pointerId: number; readonly fromX: number; readonly fromY: number; appliedX: number; appliedY: number } | null =
    null;

  stage.canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    drag = { pointerId: event.pointerId, fromX: event.clientX, fromY: event.clientY, appliedX: 0, appliedY: 0 };
    stage.canvas.setPointerCapture(event.pointerId);
  });

  stage.canvas.addEventListener('pointermove', (event) => {
    if (drag === null || event.pointerId !== drag.pointerId) return;

    const zoom = view.describe().camera.zoom;
    const targetX = Math.round(-(event.clientX - drag.fromX) / zoom);
    const targetY = Math.round(-(event.clientY - drag.fromY) / zoom);
    view.panBy(targetX - drag.appliedX, targetY - drag.appliedY);
    drag.appliedX = targetX;
    drag.appliedY = targetY;
  });

  const release = (event: PointerEvent): void => {
    if (drag === null || event.pointerId !== drag.pointerId) return;

    drag = null;
  };
  stage.canvas.addEventListener('pointerup', release);
  stage.canvas.addEventListener('pointercancel', release);

  stage.canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();

      // The wheel asks `camera.ts` which magnification is next, rather than
      // clamping here: one place decides what "a step in" means.
      const camera = view.describe().camera;
      const zoom = event.deltaY < 0 ? zoomIn(camera).zoom : zoomOut(camera).zoom;
      const rect = stage.canvas.getBoundingClientRect();
      view.zoomAbout(zoom, Math.floor(event.clientX - rect.left), Math.floor(event.clientY - rect.top));
    },
    { passive: false },
  );
}
