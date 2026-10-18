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
  createCamera,
  panBy,
  screenToStage,
  stageToScreen,
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
