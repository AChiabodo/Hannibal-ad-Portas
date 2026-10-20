/**
 * The game page's boot: the theatre on screen, under fog, with the Italian
 * interface over it and an army on it, pannable and zoomable (tickets B3, B4,
 * B7, C2).
 *
 * B2 put the pipeline on screen with a title plate. B3 puts the *game* there: a
 * map B1 generated from a seed, rendered by `render/terrain.ts` into one
 * `PixelBuffer`, and drawn as one texture under the camera B2 built. B4 puts the
 * fog over it: a second image of the same size, drawn from the knowledge of one
 * Faction — the one the page shows — so what the page shows and what that
 * Faction may decide on come from the same object. B7 puts the interface over
 * both and the Match behind them, and C2 puts men on the map and a hand on them:
 * `render/game.ts` hosts both Controllers, draws recruited Squads as their soldiers
 * (`render/squads.ts`) and hands the Player's orders to the Match as Commands
 * (`input/human.ts`).
 *
 * **The fog the page draws is B4's own**, refreshed from the eyes the Faction
 * really has (`sim/fog.ts`): its settlements' watch and the Squads it is
 * marching, which the Match reports through `eyesOfEconomy`. The minimap reads
 * the very same `FogView` — one fog, so the map in the corner and the map under
 * the camera cannot disagree about what the Faction knows. The debug hooks move
 * a *watch* about the theatre, which is the same call a tick makes with a
 * Faction's real eyes, and that is what lets a player, a test and an agent watch
 * a tile go from unexplored to in view and then to remembered as the watch moves
 * on.
 *
 * **One texture per image, and why that is the responsive answer.** The whole
 * 96×96 theatre is composed once, on boot, into a single 1552×1552 buffer, and so
 * is its fog. Panning and zooming move one container: no tile is culled, no
 * sprite is created or destroyed, and the work per frame is the same at the
 * corner of the map as at its centre. The fog texture is rebuilt only when the
 * eyes the Match reports have moved to another tile — a Squad's doing rather
 * than a frame's, throttled by the ground it walks — and F3's performance pass
 * is the ticket that will say what the map costs once things move over it.
 *
 * It is also the browser half of the pixel-hash story: a test computes the same
 * theatre *in Node* with the same generators and asks the page for the pixel the
 * camera says is there, so the GPU's answer is compared against the generator's
 * and neither side can pass alone. The HUD is excluded from that comparison by
 * rectangle (`hudRects`), because the theatre is what is being compared and the
 * interface is deliberately over part of it; the army is hidden with
 * `showSquads(false)` for the same reason, and a test that wants the men asks
 * for them (`e2e/squads.spec.ts`).
 *
 * **Input is a convenience over the same hooks.** The wheel, the drags, the
 * clicks and the keys all end at the page's own hooks — `zoomAbout`, `panBy`,
 * `selectAt`, `selectIn`, `orderAt` — which are the calls a test makes: nothing
 * about the page is reachable only by a hand. Both camera gestures are whole
 * steps, so a player cannot put the camera between two pixels any more than a
 * test can; and since C2 the left button picks and the right button pans, which
 * is the arrangement a Player arrives already knowing.
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
import { MAP_HEIGHT, MAP_WIDTH, generateMap, type Site } from '../sim/map.ts';
import type { ViewportRect } from '../ui/minimap.ts';
import { renderFog } from './fog.ts';
import { THEATRE_PIXELS, renderTerrain, tilePixel } from './terrain.ts';
import { createGame, type GameHooks } from './game.ts';
import { bindControls } from './controls.ts';
import {
  type Camera,
  clampTo,
  createCamera,
  panBy as panCamera,
  zoomAbout as zoomAboutCamera,
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
import { DEFAULT_SEED, DEFAULT_ZOOM, VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './view.ts';
import { matchAddress, type MatchConfiguration } from '../input/match-setup.ts';
import type { BrowserMatchOptions } from '../input/match-host.ts';
import { translate } from '../ui/strings.ts';
import { loadUiPreferences, type UiPreferences } from '../ui/preferences.ts';
import { ENTRY_PATH } from './entry-path.ts';

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
export async function bootRenderer(mount: HTMLElement, options: Partial<BrowserMatchOptions> & { readonly sessionControls?: boolean } = {}): Promise<GameView> {
  const config: MatchConfiguration = { seed: options.seed ?? DEFAULT_SEED, faction: options.faction ?? 'rome', difficulty: options.difficulty ?? 'centurio' };
  const map = generateMap(config.seed);
  const theatre = renderTerrain(map);
  const desktop = options.sessionControls !== false;
  const dimensions = (preferences: UiPreferences) => desktop
    ? { width: Math.max(window.innerWidth, 640 * preferences.uiScale), height: Math.max(window.innerHeight, 360 * preferences.uiScale) }
    : { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT };
  const stage = await createStage(mount, {
    ...dimensions(loadUiPreferences()),
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
    insetLeft: 0,
    insetTop: 0,
  };
  let camera = clampTo(
    lookingAt(createCamera({ zoom: DEFAULT_ZOOM }), stage, map.strongholds[config.faction === 'rome' ? 0 : 1]),
    bounds,
  );
  applyCamera(world, camera);

  // The one fog the page has, read by the fog sprite and by the minimap alike:
  // the Faction's own memory, or the whole theatre while the inspection mode is
  // on. It is a function rather than a value because the memory is written to
  // every time a watch moves.
  const currentFog = (): FogView => revealed ?? viewOf(fog);

  // The eyes the Faction has right now: its settlements' watches and the Squads
  // it is marching (C2). The Match reports them, and `refreshFog` is the one
  // place they become pixels — so the veil over the theatre, the minimap and the
  // rules' own vision are the same list and cannot drift apart.
  let eyes: readonly Eye[] = [];

  const refresher = (): void => {
    refreshVision(fog, map, watch === null ? eyes : [...eyes, watch]);

    const next = textureOf(renderFog(viewOf(fog)));
    texture?.destroy(true);
    texture = next;
    fogSprite.texture = next;
    fogSprite.visible = !inspection;
  };

  const size = { width: stage.width, height: stage.height };
  const game = createGame({
    stage,
    relayout,
    centerOn,
    ...config,
    rules: options.rules,
    opponent: options.opponent,
    sessionControls: options.sessionControls,
    restart: () => leave(matchAddress(config, ENTRY_PATH)),
    newMatch: () => leave(`${ENTRY_PATH}?previous=${String(config.seed)}`),
    ended: () => {
      watch = null;
      inspection = false;
      revealed = null;
      refresher();
    },
    size,
    world,
    camera: () => camera,
    fog: currentFog,
    vision: (next) => {
      eyes = next;
      refresher();
    },
    viewport: (layout): ViewportRect => {
      const left = desktop ? layout?.list.width ?? 0 : 0;
      const top = desktop ? layout?.bar.height ?? 0 : 0;
      const bottom = desktop ? layout?.detail.y ?? stage.height : stage.height;
      return { x: camera.x + Math.floor(left / camera.zoom), y: camera.y + Math.floor(top / camera.zoom),
        width: Math.floor((stage.width - left) / camera.zoom), height: Math.floor((bottom - top) / camera.zoom) };
    },
  });

  const moveTo = (next: Camera): void => {
    if (desktop) {
      const layout = game.hooks.hudLayout();
      bounds.height = layout.detail.y;
      bounds.insetLeft = layout.list.width;
      bounds.insetTop = layout.bar.height;
    }
    camera = clampTo(next, bounds);
    applyCamera(world, camera);
    // Only the minimap cares where the camera is: the panels are screen-space,
    // and the blocks of men are in the world the camera just moved — recomposing
    // them would be work for a picture that has not changed.
    game.syncMinimap();
    stage.render();
  };

  /** The fog redrawn and the frame presented, for a debug hook that moved a watch. */
  const paintFog = (): void => {
    refresher();
    game.syncMinimap();
    stage.render();
  };

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
      if (game.hooks.result() !== null) return;
      // The tile is checked before the watch is set, so a refused look leaves
      // the page looking where it was. The check is `sim/fog.ts`'s own, so the
      // page and the rules refuse the same coordinates with the same sentence.
      requireTile(x, y);
      watch = eyeOf({ x, y }, SETTLEMENT_VISION);
      paintFog();
    },
    inspect: (shown) => {
      if (game.hooks.result() !== null && shown) return;
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
      seed: config.seed,
      mapWidth: MAP_WIDTH,
      mapHeight: MAP_HEIGHT,
      mapPixels: THEATRE_PIXELS,
      inspection,
      watch: watch === null ? null : { x: watch.x, y: watch.y },
    }),
    samples: (points) => samplesOf(stage, points),
  };

  // The pointer and the keyboard end at the very hooks a test calls, so what a
  // Player does and what a browser test does are the same code path (C2).
  bindControls(stage, {
    navigateMinimap: (x, y) => view.navigateMinimap(x, y),
    doubleClickAt: (x, y) => view.doubleClickAt(x, y),
    centerSelection: () => view.centerSelection(),
    toggleNavigator: () => view.toggleNavigator(),
    zoom: () => camera.zoom,
    panBy: (dx, dy) => {
      view.panBy(dx, dy);
    },
    zoomAbout: (zoom, screenX, screenY) => {
      view.zoomAbout(zoom, screenX, screenY);
    },
    selectAt: (screenX, screenY, additive) => {
      view.selectAt(screenX, screenY, additive);
    },
    selectIn: (fromX, fromY, toX, toY, additive) => {
      view.selectIn(fromX, fromY, toX, toY, additive);
    },
    orderAt: (kind, screenX, screenY) => view.orderAt(kind, screenX, screenY),
    orderNow: (kind) => view.orderNow(kind),
    setFormation: (shape) => view.setFormation(shape),
    bindGroup: (index) => view.bindGroup(index),
    recallGroup: (index) => view.recallGroup(index),
    clearSelection: () => view.select(null),
    togglePause: () => {
      if (view.paused()) view.resume();
      else view.pause();
    },
    hudLayout: () => view.hudLayout(),
    hudRects: () => view.hudRects(),
    scrollHud: (region, lines) => view.scrollHud(region, lines),
  });

  function relayout(preferences: UiPreferences): void {
    const next = dimensions(preferences);
    stage.resize(next.width, next.height);
    Object.assign(size, next);
    bounds.width = next.width;
    const layout = game.hooks.hudLayout();
    bounds.height = desktop ? layout.detail.y : next.height;
    bounds.insetLeft = desktop ? layout.list.width : 0;
    bounds.insetTop = desktop ? layout.bar.height : 0;
    camera = clampTo(camera, bounds);
    applyCamera(world, camera);
  }

  function centerOn(x: number, y: number): void {
    const layout = game.hooks.hudLayout();
    const left = layout.list.width;
    const top = layout.list.y;
    const bottom = layout.detail.y;
    moveTo({ zoom: camera.zoom,
      x: Math.floor(x - (left + (stage.width - left) / 2) / camera.zoom),
      y: Math.floor(y - (top + (bottom - top) / 2) / camera.zoom) });
  }

  if (desktop) {
    const home = map.strongholds[config.faction === 'rome' ? 0 : 1];
    const at = tilePixel(home.x, home.y);
    centerOn(at.x, at.y);
    window.addEventListener('resize', () => { relayout(game.hooks.preferences()); game.sync(); });
  }
  game.start();
  stage.canvas.tabIndex = 0;
  stage.canvas.focus();
  window.addEventListener('keydown', (event) => {
    if (options.sessionControls === false) return;
    if (!['F2', 'F3', 'F4'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'F2') game.hooks.restart();
    else if (event.key === 'F3') game.hooks.newMatch();
    else void game.hooks.copySeed();
  });

  let leaving = false;
  function leave(address: string): void {
    const paused = game.hooks.paused();
    game.hooks.pause();
    if (game.hooks.result() === null && !window.confirm(translate('match.leave'))) {
      if (!paused) game.hooks.resume();
      return;
    }
    leaving = true;
    location.assign(address);
  }
  window.addEventListener('beforeunload', (event) => {
    if (leaving || game.hooks.result() !== null) return;
    event.preventDefault();
    event.returnValue = '';
  });

  return view;
}

/**
 * A camera looking at a tile, which is where the page opens: the Faction's
 * Stronghold, because that is where its army musters and where a Player's
 * attention belongs (C2). The middle of the theatre would be a fair camera in a
 * game with no war in it, and an unfair one now that there are men to command.
 */
function lookingAt(camera: Camera, stage: Stage, site: Site | undefined): Camera {
  const at = site === undefined
    ? { x: Math.floor(THEATRE_PIXELS / 2), y: Math.floor(THEATRE_PIXELS / 2) }
    : tilePixel(site.x, site.y);

  return {
    x: Math.floor(at.x - stage.width / (2 * camera.zoom)),
    y: Math.floor(at.y - stage.height / (2 * camera.zoom)),
    zoom: camera.zoom,
  };
}
