/**
 * The camera (ticket B2).
 *
 * The acceptance criterion is "pans and zooms in whole steps, with no smoothing
 * or half-pixels at any zoom level", so that is what is asserted: every mapping
 * of an integer is an integer, pan and zoom never invent a fraction, and a
 * fractional request is refused rather than rounded.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  clampTo,
  createCamera,
  panBy,
  screenToStage,
  stageToScreen,
  zoomAbout,
  zoomIn,
  zoomOut,
  zoomTo,
} from '../../src/render/camera';

describe('a camera', () => {
  it('starts at the stage origin, one to one', () => {
    expect(createCamera()).toEqual({ x: 0, y: 0, zoom: MIN_ZOOM });
    expect(createCamera({ x: 12, y: -4, zoom: 3 })).toEqual({ x: 12, y: -4, zoom: 3 });
  });

  it('refuses a position or a zoom that is not whole', () => {
    expect(() => createCamera({ x: 0.5 })).toThrow(RangeError);
    expect(() => createCamera({ y: -1.5 })).toThrow(RangeError);
    expect(() => createCamera({ zoom: 1.5 })).toThrow(RangeError);
    expect(() => createCamera({ zoom: 0 })).toThrow(RangeError);
    expect(() => createCamera({ zoom: MAX_ZOOM + 1 })).toThrow(RangeError);
  });
});

describe('panning', () => {
  it('moves by whole stage pixels, so a step is a step at every zoom', () => {
    const camera = createCamera({ x: 10, y: 20, zoom: 4 });

    expect(panBy(camera, 3, -5)).toEqual({ x: 13, y: 15, zoom: 4 });
    expect(panBy(panBy(camera, 1, 1), -1, -1)).toEqual(camera);
  });

  it('refuses a pan that would put it between two stage pixels', () => {
    const camera = createCamera();

    expect(() => panBy(camera, 0.5, 0)).toThrow(/whole number of pixels/);
    expect(() => panBy(camera, 0, Number.NaN)).toThrow(RangeError);
  });
});

describe('zooming', () => {
  it('steps one whole magnification at a time and stops at the ends', () => {
    const camera = createCamera({ x: 7, y: 9, zoom: 2 });

    expect(zoomTo(camera, 4)).toEqual({ x: 7, y: 9, zoom: 4 });
    expect(zoomIn(camera).zoom).toBe(3);
    expect(zoomIn(camera).x).toBe(7);
    expect(zoomOut(camera).zoom).toBe(1);
    expect(zoomOut(zoomOut(camera)).zoom).toBe(MIN_ZOOM);
    expect(zoomIn(zoomTo(camera, MAX_ZOOM)).zoom).toBe(MAX_ZOOM);
  });

  it('refuses a magnification that is not a whole step in range', () => {
    const camera = createCamera();

    for (const zoom of [0, 1.5, MAX_ZOOM + 1, Number.NaN]) {
      expect(() => zoomTo(camera, zoom)).toThrow(RangeError);
    }
  });
});

describe('mapping between the stage and the screen', () => {
  it('lands an integer stage pixel on an integer screen pixel, at every zoom level', () => {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
      const camera = createCamera({ x: 3, y: -2, zoom });

      for (const x of [0, 1, 5, 123]) {
        for (const y of [0, 2, 7, 96]) {
          const screen = stageToScreen(camera, x, y);
          const stage = screenToStage(camera, screen.x, screen.y);

          expect(Number.isInteger(screen.x), `zoom ${String(zoom)}`).toBe(true);
          expect(Number.isInteger(screen.y), `zoom ${String(zoom)}`).toBe(true);
          expect(stage).toEqual({ x, y });
        }
      }
    }
  });

  it('magnifies by exactly the zoom, so one stage pixel is a whole square of them', () => {
    const camera = createCamera({ zoom: 4 });

    expect(stageToScreen(camera, 1, 0).x).toBe(4);
    expect(stageToScreen(camera, 2, 0).x).toBe(8);
    // The screen pixel at the right edge of that square belongs to it, not to the
    // next stage pixel.
    expect(screenToStage(camera, 3, 3)).toEqual({ x: 0, y: 0 });
    expect(screenToStage(camera, 4, 4)).toEqual({ x: 1, y: 1 });
  });

  it('accounts for where the camera is looking', () => {
    const camera = createCamera({ x: 10, y: 10, zoom: 2 });

    expect(stageToScreen(camera, 10, 10)).toEqual({ x: 0, y: 0 });
    expect(stageToScreen(camera, 11, 12)).toEqual({ x: 2, y: 4 });
    expect(screenToStage(camera, 2, 4)).toEqual({ x: 11, y: 12 });
  });
});

describe('zooming about a point on the screen', () => {
  it('keeps the stage pixel under that point exactly where it was', () => {
    for (const zoom of [MIN_ZOOM, 2, 3, MAX_ZOOM]) {
      for (const [screenX, screenY] of [
        [0, 0],
        [1, 1],
        [63, 47],
        [320, 240],
      ] as const) {
        const camera = createCamera({ x: 41, y: 27, zoom: 4 });
        const next = zoomAbout(camera, zoom, screenX, screenY);

        expect(screenToStage(next, screenX, screenY), `zoom ${String(zoom)}`).toEqual(
          screenToStage(camera, screenX, screenY),
        );
        // And it is a position, not half of one: the whole point of the module.
        expect(Number.isInteger(next.x)).toBe(true);
        expect(Number.isInteger(next.y)).toBe(true);
      }
    }
  });

  it('is the same camera when the zoom does not change', () => {
    const camera = createCamera({ x: 9, y: 4, zoom: 3 });

    expect(zoomAbout(camera, 3, 17, 11)).toEqual(camera);
  });

  it('refuses a fractional point and a zoom it could not take', () => {
    const camera = createCamera({ zoom: 2 });

    expect(() => zoomAbout(camera, 3, 1.5, 0)).toThrow(/whole number/);
    expect(() => zoomAbout(camera, 3, 0, 0.5)).toThrow(/whole number/);
    expect(() => zoomAbout(camera, MAX_ZOOM + 1, 0, 0)).toThrow(RangeError);
  });
});

describe('keeping the viewport on the stage', () => {
  const viewport = { stageWidth: 100, stageHeight: 60, width: 40, height: 40 };

  it('stops the camera at the stage’s edges, at every zoom level', () => {
    for (let zoom = MIN_ZOOM; zoom <= MAX_ZOOM; zoom += 1) {
      const at = { ...viewport, width: 40 * zoom, height: 40 * zoom };

      expect(clampTo(createCamera({ x: -5, y: -5, zoom }), at)).toEqual({ x: 0, y: 0, zoom });
      expect(clampTo(createCamera({ x: 1000, y: 1000, zoom }), at)).toEqual({
        x: Math.max(0, 100 - 40),
        y: Math.max(0, 60 - 40),
        zoom,
      });
    }
  });

  it('leaves a stage smaller than the viewport at its own origin, which is all of it', () => {
    const small = { stageWidth: 20, stageHeight: 20, width: 100, height: 100 };

    expect(clampTo(createCamera({ x: 40, y: 40, zoom: 2 }), small)).toEqual({ x: 0, y: 0, zoom: 2 });
  });
});
