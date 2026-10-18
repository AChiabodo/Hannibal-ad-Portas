/**
 * The game page's boot: the theatre on screen, under fog, with the Italian
 * interface over it, pannable and zoomable (tickets B3, B4, B7).
 *
 * B2 put the pipeline on screen with a title plate. B3 puts the *game* there: a
 * map B1 generated from a seed, rendered by `render/terrain.ts` into one
 * `PixelBuffer`, and drawn as one texture under the camera B2 built. B4 puts the
 * fog over it: a second image of the same size, drawn from the knowledge of one
 * Faction — the one the page shows — so what the page shows and what that
 * Faction may decide on come from the same object. B7 puts the interface over
 * both and the Match behind them: `render/game.ts` opens the economy Match on
 * the same seed, and the HUD of `ui/` is drawn in screen space.
 *
 * **The fog the page draws is B4's own**, refreshed from the eyes the Faction
 * has (`sim/fog.ts`), and the minimap reads the very same `FogView` — one fog,
 * so the map in the corner and the map under the camera cannot disagree about
 * what the Faction knows. The debug hooks move a *watch* about the theatre,
 * which is the same call a tick makes with a Faction's real eyes, and that is
 * what lets a player, a test and an agent watch a tile go from unexplored to in
 * view and then to remembered as the watch moves on.
 *
 * **One texture per image, and why that is the responsive answer.** The whole
 * 96×96 theatre is composed once, on boot, into a single 1552×1552 buffer, and so
 * is its fog. Panning and zooming move one container: no tile is culled, no
 * sprite is created or destroyed, and the work per frame is the same at the
 * corner of the map as at its centre. The fog texture is rebuilt only when what
 * the Faction knows changes, which is a watch's doing rather than a frame's —
 * the eyes this branch has do not move — and F3's performance pass is the ticket
 * that will say what the map costs once things move over it.
 *
 * It is also the browser half of the pixel-hash story: a test computes the same
 * theatre *in Node* with the same generators and asks the page for the pixel the
 * camera says is there, so the GPU's answer is compared against the generator's
 * and neither side can pass alone. The HUD is excluded from that comparison by
 * rectangle (`hudRects`), because the theatre is what is being compared and the
 * interface is deliberately over part of it.
 *
 * **Input is a convenience over the same hooks.** The wheel and a drag call
 * `zoomAbout` and `panBy`, which are the calls a test makes: nothing about the
 * page is reachable only by a hand. Both are whole steps, so a player cannot put
 * the camera between two pixels any more than a test can. A click is the same
 * idea again: it asks `ui/hud.ts` which row it landed on and selects it, so the
 * pointer and the test drive one selection rather than two.
 */

import { Container, Sprite, type Texture } from 'pixi.js';
import { BASE } from '../art/palette.ts';
import type { Rgba } from '../art/pixel-buffer.ts';
import {
  SETTLEMENT_VISION,
  createFog,
  eyeOf,
  inspectionView,
  refreshVision,
  requireTile,
  viewOf,
  type Eye,
  type FogView,
} from '../sim/fog.ts';
import { eyesOf } from '../sim/fog-match.ts';
import { MAP_HEIGHT, MAP_WIDTH, generateMap, type Site } from '../sim/map.ts';
import { hitTest } from '../ui/hud.ts';
import type { ViewportRect } from '../ui/minimap.ts';
import { renderFog } from './fog.ts';
import { THEATRE_PIXELS, renderTerrain } from './terrain.ts';
import { createGame, type GameHooks } from './game.ts';
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
  textureOf,
  type FrameReport,
  type PixelPoint,
  type Stage,
} from './stage.ts';
import { DEFAULT_SEED, DEFAULT_ZOOM, VIEWED_FACTION, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './view.ts';

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
  /** Whether the debugging inspection mode is on: the whole theatre revealed, and no fog. */
  readonly inspection: boolean;
  /** Where the extra watch the hooks move is looking from, or `null` if it is nowhere yet. */
  readonly watch: Site | null;
}

/**
 * The debug surface of the running page (ADR-0003).
 *
 * Deliberately the same calls a test makes and a player's wheel makes: move the
 * camera, change the zoom about a point, look out from a tile, turn the fog off,
 * and read what the renderer produced. `samples` is the agent's half of the pixel
 * pipeline — the renderer's own pixels, in the generator's own currency — and it
 * takes several points at once because extraction is the cost.
 */
export interface ViewHooks {
  /** Moves the camera by whole stage pixels. Refuses anything else. */
  panBy(dx: number, dy: number): void;
  /** Sets a whole-number magnification, keeping the middle of the viewport where it is. */
  zoomTo(zoom: number): void;
  /** Sets a magnification, keeping one whole screen pixel where it is. */
  zoomAbout(zoom: number, screenX: number, screenY: number): void;
  /**
   * Looks out from one tile of the theatre, which is what a tick does with a
   * Faction's eyes.
   *
   * The watch *replaces* the one before it, and what the Faction saw stays
   * remembered: this single call is how a page walks a tile through the three
   * states of the fog. Refuses anything that is not a whole tile of the theatre.
   */
  lookFrom(x: number, y: number): void;
  /**
   * Turns the debugging inspection mode on or off: the whole theatre revealed.
   *
   * It is not a Player and cannot become one — there is no Controller here and
   * nothing in this module can emit a Command (`inspectionView` is `sim/fog.ts`'s
   * and states the same; `tests/sim/fog.test.ts` makes it a compile error).
   */
  inspect(revealed: boolean): void;
  /** The camera and the viewport, as they stand, and what the fog is doing. */
  describe(): ViewState;
  /** Reads pixels out of the current frame, one extraction for all of them. */
  samples(points: readonly PixelPoint[]): readonly Rgba[];
}

/** The running game page: what it drew, the camera, and the Match behind the interface. */
export interface GameView extends ViewHooks, GameHooks {
  /** What the renderer did when the page booted. */
  readonly probe: FrameReport;
}

/**
 * Builds the page: the theatre on one texture, the fog over it, the camera on
 * both, the Match and its interface over everything, one frame drawn, and the
 * hooks Playwright and, later, an external agent drive it with.
 */
export async function bootRenderer(mount: HTMLElement): Promise<GameView> {
  const map = generateMap(DEFAULT_SEED);
  const theatre = renderTerrain(map);
  const stage = await createStage(mount, {
    width: VIEWPORT_WIDTH,
    height: VIEWPORT_HEIGHT,
    background: BASE.night,
  });

  const world = new Container();
  stage.root.addChild(world);
  world.addChild(stage.spriteOf(theatre));

  // The fog the page draws, and the sprite it is drawn with. The sprite starts
  // with no texture: the first `paintFog` is what gives it one, so there is no
  // moment at which the page shows a fog it has not computed.
  const fog = createFog();
  let watch: Eye | null = null;
  let inspection = false;
  let revealed: FogView | null = null;
  let texture: Texture | null = null;

  const fogSprite = new Sprite();
  world.addChild(fogSprite);

  const bounds = {
    stageWidth: THEATRE_PIXELS,
    stageHeight: THEATRE_PIXELS,
    width: stage.width,
    height: stage.height,
  };
  let camera = clampTo(centred(createCamera({ zoom: DEFAULT_ZOOM }), stage), bounds);
  applyCamera(world, camera);

  // The one fog the page has, read by the fog sprite and by the minimap alike:
  // the Faction's own memory, or the whole theatre while the inspection mode is
  // on. It is a function rather than a value because the memory is written to
  // every time a watch moves.
  const currentFog = (): FogView => revealed ?? viewOf(fog);

  const size = { width: stage.width, height: stage.height };
  const game = createGame({
    stage,
    seed: DEFAULT_SEED,
    size,
    fog: currentFog,
    viewport: (): ViewportRect => ({
      x: camera.x,
      y: camera.y,
      width: Math.floor(stage.width / camera.zoom),
      height: Math.floor(stage.height / camera.zoom),
    }),
  });

  const moveTo = (next: Camera): void => {
    camera = clampTo(next, bounds);
    applyCamera(world, camera);
    // Only the minimap cares where the camera is: the panels are screen-space, and
    // recomposing them on a pan would be work for a picture that has not changed.
    game.syncMinimap();
    stage.render();
  };

  // What the Faction knows, refreshed from the eyes it has and drawn over the
  // theatre. Everything that changes it goes through here, so the sprite, the
  // minimap and the grid they were both built from cannot drift apart: the
  // texture is rebuilt from the grid it was built for, and the one before it is
  // let go rather than kept.
  //
  // The eyes are the Stronghold's and do not move — C1 is the ticket that puts a
  // Squad on the map with eyes of its own — so this is a watch's doing and not a
  // frame's.
  const paintFog = (): void => {
    refreshVision(
      fog,
      map,
      watch === null ? eyesOf(map, VIEWED_FACTION) : [...eyesOf(map, VIEWED_FACTION), watch],
    );

    const next = textureOf(renderFog(viewOf(fog)));
    texture?.destroy(true);
    texture = next;
    fogSprite.texture = next;
    fogSprite.visible = !inspection;
    game.syncMinimap();
    stage.render();
  };

  paintFog();

  const view: GameView = {
    ...game.hooks,
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
    lookFrom: (x, y) => {
      // The tile is checked before the watch is set, so a refused look leaves
      // the page looking where it was. The check is `sim/fog.ts`'s own, so the
      // page and the rules refuse the same coordinates with the same sentence.
      requireTile(x, y);
      watch = eyeOf({ x, y }, SETTLEMENT_VISION);
      paintFog();
    },
    inspect: (shown) => {
      inspection = shown === true;
      // The omniscient view is built once, when it is asked for, rather than on
      // every frame: seeing everything is a debug mode, and a mode that copied
      // two nine-thousand-tile grids ten times a second would be a mode that
      // changed what it was measuring.
      revealed = inspection ? inspectionView(map, fog.contacts) : null;
      fogSprite.visible = !inspection;
      game.syncMinimap();
      stage.render();
    },
    describe: () => ({
      camera,
      width: stage.width,
      height: stage.height,
      seed: DEFAULT_SEED,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      mapPixels: THEATRE_PIXELS,
      inspection,
      watch: watch === null ? null : { x: watch.x, y: watch.y },
    }),
    samples: (points) => samplesOf(stage, points),
  };

  bindPointer(stage, view, (screenX, screenY) => {
    view.select(hitTest(view.hud(), size, screenX, screenY));
  });
  game.start();

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
 *
 * A press that did not move is a click, and a click is the selection: the pointer
 * release asks the same `hitTest` a test would, so the row a Player presses and
 * the row a test selects cannot drift apart.
 */
function bindPointer(stage: Stage, view: GameView, onClick: (x: number, y: number) => void): void {
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

    const pressed = drag;
    drag = null;

    // A press that panned is a drag; a press that did not is a click. The
    // remainder is deliberately not the test: a one-pixel drag is still a drag.
    if (pressed.appliedX !== 0 || pressed.appliedY !== 0) return;

    const rect = stage.canvas.getBoundingClientRect();
    onClick(Math.floor(event.clientX - rect.left), Math.floor(event.clientY - rect.top));
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
