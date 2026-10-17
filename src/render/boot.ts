/**
 * The only module in the repository that imports `pixi.js` (ADR-0001).
 *
 * A1 gives it one job: prove that this browser can put pixels on a canvas
 * through the renderer and read them back, so that the art pipeline in B2
 * starts from a known-good frame. The real render adapter — camera, culling,
 * picking — replaces this in B2.
 */
import { Application, Graphics } from 'pixi.js';

/** Side of the square probe canvas, in pixels. */
export const PROBE_SIZE = 16;

/** Opaque fill colour of the probe quad: nothing else in the page shares it. */
export const PROBE_COLOUR = 0xff8800;

/** What the renderer reported about itself, plus the pixel it drew. */
export type RenderProbe = {
  /** `webgl`, `webgpu` or `canvas`, as named by the renderer. */
  readonly engine: string;
  /** 2 for a WebGL2 context, null for any other engine. */
  readonly webglVersion: number | null;
  /** The unmasked renderer string, which is how CI shows SwiftShader is in use. */
  readonly rendererDescription: string | null;
  readonly width: number;
  readonly height: number;
  /** Centre pixel of the extracted frame, as RGBA. */
  readonly pixel: readonly number[];
};

/**
 * Boots the renderer on a fresh canvas inside `mount`, draws one opaque quad
 * and reads the frame back.
 */
export async function bootRenderer(mount: HTMLElement): Promise<RenderProbe> {
  const app = new Application();

  await app.init({
    width: PROBE_SIZE,
    height: PROBE_SIZE,
    background: 0x000000,
    backgroundAlpha: 1,
    antialias: false,
    autoDensity: false,
    resolution: 1,
    preference: 'webgl',
    autoStart: false,
  });

  mount.appendChild(app.canvas);

  const quad = new Graphics().rect(0, 0, PROBE_SIZE, PROBE_SIZE).fill(PROBE_COLOUR);
  app.stage.addChild(quad);
  app.render();

  const gl = readGl(app.renderer);
  const { pixels, width, height } = app.renderer.extract.pixels(app.stage);
  const offset = (Math.floor(height / 2) * width + Math.floor(width / 2)) * 4;
  const channel = (index: number): number => pixels[offset + index] ?? 0;

  return {
    engine: app.renderer.name,
    webglVersion: gl !== null && gl instanceof WebGL2RenderingContext ? 2 : null,
    rendererDescription: gl === null ? null : readRendererDescription(gl),
    width,
    height,
    pixel: [channel(0), channel(1), channel(2), channel(3)],
  };
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
