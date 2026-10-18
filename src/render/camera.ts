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
 *
 * B3 added it, and this is how: `zoomAbout` asks which stage pixel a screen
 * point is showing *before* the zoom, and puts that pixel back under the same
 * screen point *after* it, rounding the new position to the pixel the point is
 * in rather than moving by half of one. `clampTo` is the other half of a camera
 * that is actually moved by a player: a viewport slid past the edge of the stage
 * shows nothing, so it is put back.
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

/**
 * The camera at a different magnification, keeping one screen point where it is.
 *
 * This is the zoom a wheel does: the stage pixel under the pointer stays under
 * the pointer, so the map grows towards what the player is looking at rather
 * than away from it. The arithmetic is `screenToStage` before, `screenToStage`
 * after, and the position that makes the two agree — which is an integer, because
 * `screenToStage` is whole in and whole out and the division is rounded down.
 * A zoom about a screen point therefore cannot put the camera between two pixels,
 * which is the property the whole module is for.
 *
 * @throws RangeError when the zoom is not a whole magnification in range, or the
 *   screen point is not a whole number of screen pixels.
 */
export function zoomAbout(camera: Camera, zoom: number, screenX: number, screenY: number): Camera {
  requireWhole(screenX, 'a screen x');
  requireWhole(screenY, 'a screen y');

  const next = requireCamera({ x: camera.x, y: camera.y, zoom });
  const anchor = screenToStage(camera, screenX, screenY);

  return {
    x: anchor.x - Math.floor(screenX / next.zoom),
    y: anchor.y - Math.floor(screenY / next.zoom),
    zoom: next.zoom,
  };
}

/** What a camera has to be kept inside: the stage's size and the viewport's. */
export interface Viewport {
  /** Stage width in pixels. */
  readonly stageWidth: number;
  /** Stage height in pixels. */
  readonly stageHeight: number;
  /** Viewport width in screen pixels. */
  readonly width: number;
  /** Viewport height in screen pixels. */
  readonly height: number;
}

/**
 * The camera moved as little as it takes to keep the viewport on the stage.
 *
 * A viewport slid past the edge of the stage shows the page's background, which
 * is a bug that looks like a design decision; so the camera stops at the edge.
 * A stage smaller than the viewport is not panned at all — its top-left corner
 * is all of it there is to show — which is the same arithmetic with the far bound
 * clamped to zero instead of negative.
 */
export function clampTo(camera: Camera, viewport: Viewport): Camera {
  const across = Math.max(0, viewport.stageWidth - Math.floor(viewport.width / camera.zoom));
  const down = Math.max(0, viewport.stageHeight - Math.floor(viewport.height / camera.zoom));

  return {
    x: Math.min(Math.max(0, camera.x), across),
    y: Math.min(Math.max(0, camera.y), down),
    zoom: camera.zoom,
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
