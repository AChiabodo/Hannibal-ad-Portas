/**
 * The annotations a Squad wears on the theatre (#58).
 *
 * Two things are worth holding here. The **plate** puts Morale first — a pip for
 * every fifth of the type's maximum, and the figure beside them — and any other
 * condition is a shape and not only a colour. The **placement** keeps every
 * annotation off the men: a status plate above the block, a chevron outside the
 * edge the Squad faces, and a standard above its top so it never covers a
 * soldier.
 */
import { describe, expect, it } from 'vitest';
import { BASE, RAMPS, shadeAt } from '../../src/art/palette';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import type { VisibleSquad } from '../../src/sim/economy-match';
import {
  DESTINATION_SIZE,
  MORALE_PIPS,
  CONDITION_PLATE_HEIGHT,
  CONDITION_PLATE_WIDTH,
  CONDITION_PIN_SIZE,
  destinationMark,
  markerPlacement,
  conditionKey,
  conditionOf,
  conditionPin,
  conditionPlate,
  type ConditionLook,
} from '../../src/render/indicators';
import { blockPlacement, blockSize, type BlockShape } from '../../src/render/squads';

/** The plate's own fills, written out where a test needs to count a pip. */
const PIP_FULL = shadeAt(RAMPS.parchment, 6);
const PIP_EMPTY = shadeAt(RAMPS.stone, 1);
const PLATE = BASE.night;

/** A Squad with the fields the annotations read. */
function squadOf(options: Partial<VisibleSquad> = {}): VisibleSquad {
  return {
    id: 1,
    type: 'hastati',
    x: 10,
    y: 10,
    men: 120,
    capacity: 120,
    figures: 120,
    formation: 'line',
    facing: 'south',
    goal: null,
    refused: null,
    morale: 10,
    fatigue: 0,
    ammunition: 4,
    routing: false,
    engaged: false,
    payroll: 3,
    unpaid: 0,
    bearing: 0,
    garrison: null,
    home: 0,
    inTerritory: true,
    inCamp: false,
    ...options,
  };
}

/** How many pixels of a buffer have exactly one colour. */
function countOf(buffer: PixelBuffer, colour: readonly number[]): number {
  let count = 0;
  for (let y = 0; y < buffer.height; y += 1) {
    for (let x = 0; x < buffer.width; x += 1) {
      const pixel = pixelAt(buffer, x, y);
      if (pixel[0] === colour[0] && pixel[1] === colour[1] && pixel[2] === colour[2] && pixel[3] === colour[3]) count += 1;
    }
  }

  return count;
}

/** A plate drawn from a Morale against its maximum. */
function plate(morale: number, maxMorale: number, conditions: ConditionLook['conditions'] = []): PixelBuffer {
  return conditionPlate({ morale, maxMorale, conditions });
}

describe('a status plate', () => {
  it('is the size the layer reserves for it', () => {
    const drawn = plate(10, 10);

    expect({ width: drawn.width, height: drawn.height }).toEqual({ width: CONDITION_PLATE_WIDTH, height: CONDITION_PLATE_HEIGHT });
  });

  it('fills one pip for each fifth of the Morale, and leaves the rest empty', () => {
    const full = plate(10, 10);
    const half = plate(5, 10);
    const empty = plate(0, 10);

    // Five pips, each two by three with a pixel of air: the filled area falls by
    // one pip's six pixels for each fifth lost.
    expect(countOf(full, PIP_FULL)).toBe(MORALE_PIPS * 6);
    expect(countOf(half, PIP_FULL)).toBe(3 * 6);
    expect(countOf(empty, PIP_FULL)).toBe(0);
    expect(countOf(empty, PIP_EMPTY)).toBeGreaterThan(0);
    // And the figure beside them moves with it.
    expect(hashPixelBuffer(half)).not.toBe(hashPixelBuffer(full));
  });

  it('draws a low Morale in another shape as well as another colour', () => {
    const plain = plate(2, 10);
    const warned = plate(2, 10, ['lowMorale']);

    // The warning is a hollow pip, so the two plates differ in *which* pixels are
    // painted and not only in the ink they are painted in.
    expect(hashPixelBuffer(warned)).not.toBe(hashPixelBuffer(plain));
    expect(countOf(warned, PLATE)).toBeGreaterThan(countOf(plain, PLATE));
  });

  it('puts up to two condition shapes beside the figure', () => {
    const one = plate(10, 10, ['fatigue']);
    const two = plate(10, 10, ['fatigue', 'noSupply']);
    const three = plate(10, 10, ['routing', 'fatigue', 'noSupply']);

    expect(hashPixelBuffer(one)).not.toBe(hashPixelBuffer(plate(10, 10)));
    expect(hashPixelBuffer(two)).not.toBe(hashPixelBuffer(one));
    // Two shapes at most: the ranking decides which, and the panel carries the
    // rest in words. A third one cannot add a glyph the plate has no room for.
    expect(hashPixelBuffer(three)).toBe(hashPixelBuffer(plate(10, 10, ['routing', 'fatigue'])));
    expect(hashPixelBuffer(three)).not.toBe(hashPixelBuffer(plate(10, 10, ['noSupply'])));
  });

  it('is keyed by everything it is drawn from, and nothing else', () => {
    expect(conditionKey({ morale: 4, maxMorale: 10, conditions: [] })).toBe(conditionKey({ morale: 4, maxMorale: 10, conditions: [] }));
    expect(conditionKey({ morale: 4, maxMorale: 10, conditions: [] })).not.toBe(conditionKey({ morale: 5, maxMorale: 10, conditions: [] }));
    expect(conditionKey({ morale: 4, maxMorale: 10, conditions: [] })).not.toBe(conditionKey({ morale: 4, maxMorale: 12, conditions: [] }));
    expect(conditionKey({ morale: 4, maxMorale: 10, conditions: [] })).not.toBe(conditionKey({ morale: 4, maxMorale: 10, conditions: ['fatigue'] }));
  });

  it('reads a Squad’s Morale against its type’s maximum and its conditions', () => {
    const look = conditionOf(squadOf({ morale: 2, fatigue: 16 }));

    expect(look).toEqual({ morale: 2, maxMorale: 10, conditions: ['lowMorale', 'fatigue'] });
  });
});

describe('a condition pin', () => {
  it('is one shape on the plate’s own ground, for a Squad nobody has picked', () => {
    const pin = conditionPin('fatigue');

    expect({ width: pin.width, height: pin.height }).toEqual({
      width: CONDITION_PIN_SIZE,
      height: CONDITION_PIN_SIZE,
    });
    expect(pixelAt(pin, 1, 1)).toEqual(PLATE);
    expect(pixelAt(pin, 0, 0)).not.toEqual(PLATE);
    expect(hashPixelBuffer(conditionPin('fatigue'))).not.toBe(hashPixelBuffer(conditionPin('routing')));
  });
});

describe('where the annotations stand', () => {
  const at = { x: 100, y: 200 };

  it('puts the plate above the block, clear of every soldier', () => {
    for (const facing of ['north', 'east', 'south', 'west'] as const) {
      const shape: BlockShape = { men: 120, formation: 'line', facing };
      const place = blockPlacement(at, shape);
      const size = blockSize(shape);
      const placed = markerPlacement(at, shape);

      expect(placed.condition.y, facing).toBeLessThan(place.y);
      expect(placed.condition.y + CONDITION_PLATE_HEIGHT, facing).toBeLessThanOrEqual(place.y);
      // Centred on the block, within the half pixel a whole-width plate allows.
      const centre = placed.condition.x + Math.floor(CONDITION_PLATE_WIDTH / 2);
      expect(Math.abs(centre - (place.x + Math.floor(size.width / 2))), facing).toBeLessThanOrEqual(1);
    }
  });

  it('puts the chevron outside the edge the block faces', () => {
    const cases = [
      { facing: 'south' as const, outside: (place: { x: number; y: number }, size: { height: number }) => place.y + size.height },
      { facing: 'north' as const, outside: (place: { x: number; y: number }) => place.y },
      { facing: 'east' as const, outside: (place: { x: number }, size: { width: number }) => place.x + size.width },
      { facing: 'west' as const, outside: (place: { x: number }) => place.x },
    ];

    for (const { facing, outside } of cases) {
      const shape: BlockShape = { men: 60, formation: 'line', facing };
      const place = blockPlacement(at, shape);
      const size = blockSize(shape);
      const placed = markerPlacement(at, shape);
      const edge = outside(place, size);

      if (facing === 'south') expect(placed.facing.y).toBeGreaterThanOrEqual(edge);
      if (facing === 'north') expect(placed.facing.y + 7).toBeLessThanOrEqual(edge);
      if (facing === 'east') expect(placed.facing.x).toBeGreaterThanOrEqual(edge);
      if (facing === 'west') expect(placed.facing.x + 7).toBeLessThanOrEqual(edge);
    }
  });

  it('raises the standard above the block, so it never covers a soldier', () => {
    const shape: BlockShape = { men: 120, formation: 'line', facing: 'south' };
    const place = blockPlacement(at, shape);
    const placed = markerPlacement(at, shape);

    expect(placed.standard.y).toBeLessThan(place.y);
  });
});

describe('the destination marks', () => {
  it('are the size C2 drew, and agree with the art library', () => {
    expect(destinationMark('move').width).toBe(DESTINATION_SIZE);
    expect(hashPixelBuffer(destinationMark('attackMove'))).not.toBe(hashPixelBuffer(destinationMark('move')));
  });
});
