/**
 * The camera: how much of the stage is on screen, and where (ticket B2, PLAN §3).
 *
 * `render/` owns the camera, and this module is the part of it that is arithmetic
 * rather than engine: a position in stage pixels and a whole-number magnification.
 * PixiJS never appears here, so the rule that matters — **no half-pixels, at any
 * zoom** — is a property a unit test walks in Node rather than something checked
 * by looking at a screenshot.
 *
 * Three decisions, and the plan's pixel discipline depends on all three:
 *
 * - **The position is in stage pixels, and it is an integer.** A camera that
 *   could sit at `x = 0.5` would sample texture edges between pixels, which is
 *   the blur every pixel-art game spends a week removing.
 * - **Zoom is a whole number.** One stage pixel becomes `zoom × zoom` screen
 *   pixels, exactly; there is no 1.5×, because 1.5× is a lie about a pixel.
 * - **Nothing is smoothed.** `panBy` and `zoomTo` are steps, not animations: the
 *   renderer interpolates nothing, and a caller that wants a smooth pan can
 *   compose steps and accept that they are steps.
 *
 * What the camera deliberately does *not* do is anchor a zoom at a screen point.
 * Centring a zoom on the cursor produces a fractional position whenever the
 * cursor is not on a multiple of the zoom, and a camera that is sometimes
 * fractional is the thing this module exists to prevent. B3 can add an anchored
 * zoom when it can re-anchor on integers; here, zoom keeps the top-left corner
 * and moves nothing by half a pixel.
 */

/** The smallest magnification: one stage pixel per screen pixel. */
export const MIN_ZOOM = 1;

/** The largest magnification: past this a 16-pixel tile is a wall of colour. */
export const MAX_ZOOM = 8;

/** Where the camera looks: an integer stage-pixel corner, and a whole magnification. */
export interface Camera {
  /** Stage-pixel x of the viewport's left edge. Always an integer. */
  readonly x: number;
  /** Stage-pixel y of the viewport's top edge. Always an integer. */
  readonly y: number;
  /** Screen pixels per stage pixel. Always a whole number in [MIN_ZOOM, MAX_ZOOM]. */
  readonly zoom: number;
}

/** What a caller has to say to place a camera. */
export interface CameraOptions {
  /** Left edge, in stage pixels. Defaults to the stage's own origin. */
  readonly x?: number;
  /** Top edge, in stage pixels. Defaults to the stage's own origin. */
  readonly y?: number;
  /** Magnification. Defaults to one to one. */
  readonly zoom?: number;
}

/**
 * A camera, with defaults of "the stage's top-left corner, one to one".
 *
 * @throws RangeError when the position is not whole pixels or the zoom is not a
 *   whole magnification in range.
 */
export function createCamera(options: CameraOptions = {}): Camera {
  return requireCamera({
    x: options.x ?? 0,
    y: options.y ?? 0,
    zoom: options.zoom ?? MIN_ZOOM,
  });
}

/**
 * The camera moved by a whole number of stage pixels.
 *
 * The delta is in stage pixels rather than screen pixels on purpose: a pan is a
 * decision about the world, and the same `panBy(camera, 1, 0)` moves one tile
 * whether the player is looking at 1× or 8×.
 *
 * @throws RangeError when a delta is not a whole number of pixels.
 */
export function panBy(camera: Camera, dx: number, dy: number): Camera {
  requireWhole(dx, 'a pan dx');
  requireWhole(dy, 'a pan dy');

  return { x: camera.x + dx, y: camera.y + dy, zoom: camera.zoom };
}

/**
 * The camera at a different magnification, keeping its top-left corner.
 *
 * @throws RangeError when the zoom is not a whole number in [MIN_ZOOM, MAX_ZOOM].
 */
export function zoomTo(camera: Camera, zoom: number): Camera {
  return requireCamera({ x: camera.x, y: camera.y, zoom });
}

/** One whole step in: the next magnification up, or this one at the top. */
export function zoomIn(camera: Camera): Camera {
  return zoomTo(camera, Math.min(MAX_ZOOM, camera.zoom + 1));
}

/** One whole step out: the next magnification down, or this one at the bottom. */
export function zoomOut(camera: Camera): Camera {
  return zoomTo(camera, Math.max(MIN_ZOOM, camera.zoom - 1));
}

/**
 * Where a stage pixel lands on screen, relative to the viewport's top-left.
 *
 * Whole in, whole out: `stageToScreen` of an integer point is an integer point at
 * every zoom, which is the invariant the whole pixel discipline rests on.
 */
export function stageToScreen(camera: Camera, x: number, y: number): { readonly x: number; readonly y: number } {
  return { x: (x - camera.x) * camera.zoom, y: (y - camera.y) * camera.zoom };
}

/**
 * Which stage pixel a screen pixel shows.
 *
 * Whole in, whole out as well, by rounding *down*: a screen pixel covers the
 * stage pixel it starts inside, so a screen point at the right edge of a magnified
 * pixel belongs to that pixel and not to the next one.
 */
export function screenToStage(camera: Camera, x: number, y: number): { readonly x: number; readonly y: number } {
  return {
    x: camera.x + Math.floor(x / camera.zoom),
    y: camera.y + Math.floor(y / camera.zoom),
  };
}

/** @throws RangeError when the values do not describe a camera. */
function requireCamera(camera: Camera): Camera {
  requireWhole(camera.x, 'a camera x');
  requireWhole(camera.y, 'a camera y');

  if (!Number.isInteger(camera.zoom) || camera.zoom < MIN_ZOOM || camera.zoom > MAX_ZOOM) {
    throw new RangeError(
      `a camera zoom must be a whole number in [${String(MIN_ZOOM)}, ${String(MAX_ZOOM)}], got ${String(camera.zoom)}`,
    );
  }

  return camera;
}

/** @throws RangeError when the value is not a whole number. */
function requireWhole(value: number, what: string): void {
  if (!Number.isInteger(value)) {
    throw new RangeError(`${what} must be a whole number of pixels, got ${String(value)}`);
  }
}
