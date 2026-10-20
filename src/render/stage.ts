/**
 * The render adapter: the only place a `PixelBuffer` becomes something the engine
 * can draw (PLAN §3, ADR-0001).
 *
 * Three jobs, and the module is small because it has exactly three:
 *
 * - **A stage**: an `Application`, one root container, and the frame drawn when
 *   asked. `autoStart` is off and nothing renders on a browser's schedule: the
 *   page asks for a frame, which is what makes a rendered pixel something a test
 *   can read back and compare.
 * - **A texture per buffer**: RGBA uploaded as RGBA, sampled with `nearest`, so a
 *   magnified pixel is a square of pixels rather than a blur. Both of those are
 *   said out loud here because both have a default that is wrong for pixel art:
 *   an eight-bit buffer defaults to `bgra8unorm` and to linear filtering.
 * - **A camera applied to a container**: whole-pixel translation and whole-number
 *   scale, which is what "no half-pixels at any zoom level" means in practice.
 *
 * Extraction is here too, and it is not a debugging afterthought: reading the
 * frame back with `renderer.extract.pixels` is how an agent verifies that what it
 * generated is what is on screen (PLAN §3), so it is part of the adapter's
 * interface rather than a test's private trick.
 */

import { Application, BufferImageSource, Rectangle, Sprite, Texture, type Container } from 'pixi.js';
import { pixelAt, type PixelBuffer, type Rgba } from '../art/pixel-buffer.ts';
import type { Camera } from './camera.ts';

/** A point on the canvas, in canvas pixels. */
export type PixelPoint = readonly [number, number];

/** What the stage needs to know to exist. */
export interface StageOptions {
  /** Viewport width in stage pixels; one canvas pixel each, because resolution is 1. */
  readonly width: number;
  /** Viewport height in stage pixels. */
  readonly height: number;
  /** What shows where nothing is drawn: the page's own colour, not the engine's. */
  readonly background: Rgba;
}

/** What the renderer reported about itself, which is how a test knows what it got. */
export interface EngineReport {
  /** `webgl`, `webgpu` or `canvas`, as named by the renderer. */
  readonly engine: string;
  /** 2 for a WebGL2 context, null for any other engine. */
  readonly webglVersion: number | null;
  /** The unmasked renderer string, which is how CI shows SwiftShader is in use. */
  readonly rendererDescription: string | null;
}

/** A drawn frame from the outside: what drew it, how big it is, and its centre pixel. */
export interface FrameReport extends EngineReport {
  /** Viewport width in stage pixels. */
  readonly width: number;
  /** Viewport height in stage pixels. */
  readonly height: number;
  /** The centre pixel of the frame, in the same currency the art library speaks. */
  readonly pixel: Rgba;
}

/** An engine, a root container, and the pixels it drew. */
export interface Stage {
  /** Everything the stage draws hangs off this. */
  readonly root: Container;
  /** The canvas the engine draws into, for whoever has to listen to a pointer. */
  readonly canvas: HTMLCanvasElement;
  /** What the engine is, as it described itself when it started. */
  readonly renderer: EngineReport;
  /** The viewport's width in stage pixels. */
  readonly width: number;
  /** The viewport's height in stage pixels. */
  readonly height: number;
  /** A sprite for a buffer, sized one stage pixel per buffer pixel. */
  spriteOf(buffer: PixelBuffer): Sprite;
  /** Draws one frame, now, and does nothing until the next call. */
  render(): void;
  /**
   * The frame as it stands, as the one pixel currency the repository has.
   *
   * Reading the frame back gives a `PixelBuffer` and not a type of its own: the
   * pipeline runs in both directions, and a renderer that answered in a second
   * shape would be the second implementation of every generator that the plan
   * exists to avoid (PLAN §3, ADR-0002).
   */
  resize(width: number, height: number): void;
  extract(): PixelBuffer;
}

/**
 * Boots a stage inside `mount`.
 *
 * `resolution: 1` and `autoDensity: false` with a CSS size equal to the pixel
 * size is the whole of pixel-perfection: one stage pixel is one canvas pixel is
 * one screen pixel, so extraction has nothing to undo and a magnified sprite lands
 * on whole pixels.
 */
export async function createStage(mount: HTMLElement, options: StageOptions): Promise<Stage> {
  const app = new Application();

  await app.init({
    width: options.width,
    height: options.height,
    background: colourOf(options.background),
    backgroundAlpha: options.background[3] / 255,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    preference: 'webgl',
    autoStart: false,
  });

  mount.appendChild(app.canvas);
  app.canvas.style.width = `${String(options.width)}px`;
  app.canvas.style.height = `${String(options.height)}px`;

  const gl = readGl(app.renderer);

  return {
    root: app.stage as Container,
    canvas: app.canvas,
    renderer: {
      engine: app.renderer.name,
      webglVersion: gl !== null && gl instanceof WebGL2RenderingContext ? 2 : null,
      rendererDescription: gl === null ? null : readRendererDescription(gl),
    },
    get width() { return app.renderer.width; },
    get height() { return app.renderer.height; },
    resize: (width, height) => {
      app.renderer.resize(width, height);
      app.canvas.style.width = `${String(width)}px`;
      app.canvas.style.height = `${String(height)}px`;
    },
    spriteOf: (buffer) => new Sprite(textureOf(buffer)),
    render: () => {
      app.render();
    },
    // The frame is the viewport, not the bounds of whatever happens to be drawn:
    // an extraction that cropped to its content would report a size that changes
    // with the art, and a pixel coordinate that means something different on every
    // page. Saying `(0, 0, width, height)` is what makes `sample` a mapping.
    extract: () =>
      app.renderer.extract.pixels({
        target: app.stage as Container,
        frame: new Rectangle(0, 0, app.renderer.width, app.renderer.height),
      }),
  };
}

/**
 * Puts a container where the camera is looking.
 *
 * The translation is `−camera × zoom` and the scale is the zoom, so a stage point
 * lands on the screen exactly where `stageToScreen` says it does. Every value
 * involved is an integer, which is the point: a fractional position here would
 * sample between texture pixels and soften every edge on screen.
 */
export function applyCamera(world: Container, camera: Camera): void {
  world.position.set(-camera.x * camera.zoom, -camera.y * camera.zoom);
  world.scale.set(camera.zoom);
}

/**
 * A texture for a buffer.
 *
 * `rgba8unorm` rather than the buffer's default of `bgra8unorm`, because the
 * bytes are red-first and a colour that comes out blue is a hard bug to see in a
 * swatch and an easy one to ship. `nearest` rather than the default linear
 * filtering, because a smoothed pixel is not a pixel.
 */
export function textureOf(buffer: PixelBuffer): Texture {
  const source = new BufferImageSource({
    resource: buffer.pixels,
    width: buffer.width,
    height: buffer.height,
    format: 'rgba8unorm',
    scaleMode: 'nearest',
  });

  return new Texture({ source });
}

/**
 * What the stage drew, and through what.
 *
 * The centre pixel is in the report because a boot that produced an engine but no
 * pixels is a failure that looks like a success, and one extracted pixel is
 * enough to tell the difference.
 */
export function frameReport(stage: Stage): FrameReport {
  const frame = stage.extract();

  return {
    ...stage.renderer,
    width: frame.width,
    height: frame.height,
    pixel: pixelAt(frame, Math.floor(frame.width / 2), Math.floor(frame.height / 2)),
  };
}

/**
 * Reads points out of the current frame, in one extraction.
 *
 * One extraction for many pixels rather than one each: reading the frame back is
 * the cheap way to check what a renderer did and an expensive way to do it a
 * hundred times over an agent's protocol. The reading itself is `pixelAt`, so an
 * off-canvas point is refused by the same code that refuses an off-buffer one.
 *
 * @throws RangeError when a point is outside the frame.
 */
export function samplesOf(stage: Stage, points: readonly PixelPoint[]): readonly Rgba[] {
  const frame = stage.extract();

  return points.map(([x, y]) => pixelAt(frame, x, y));
}

/**
 * A colour as the `0xRRGGBB` the renderer wants.
 */
export function colourOf(colour: Rgba): number {
  return (colour[0] << 16) | (colour[1] << 8) | colour[2];
}

/** The raw context, when the engine has one. */
function readGl(renderer: { readonly name: string }): WebGL2RenderingContext | null {
  return (renderer as { gl?: WebGL2RenderingContext }).gl ?? null;
}

/** The GL driver string, when the browser will tell us. */
function readRendererDescription(gl: WebGL2RenderingContext): string | null {
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  if (info === null) return null;

  const description: unknown = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
  return typeof description === 'string' ? description : null;
}
