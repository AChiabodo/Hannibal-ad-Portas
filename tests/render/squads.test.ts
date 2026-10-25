/** Presentation slots and composed Figures (#67); independent of combat frontage. */
import { describe, expect, it } from 'vitest';
import { SQUAD_TYPES } from '../../src/content/squads';
import type { VisibleSquad } from '../../src/sim/economy-match';
import { FORMATIONS } from '../../src/sim/command';
import {
  FIGURE_OF_SQUAD,
  SELECTION_INK,
  blockAnchor,
  blockMen,
  blockPlacement,
  blockSize,
  frameStepOf,
  squadBlock,
  squadFrameKey,
  visualShape,
  type BlockShape,
} from '../../src/render/squads';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import { FIGURE_HEIGHT, FIGURE_WIDTH, figureFrame, soldier } from '../../src/art/figures';

/** A Squad with the fields a drawing code reads, and plausible answers for the rest. */
function squadOf(options: {
  readonly type?: string;
  readonly men?: number;
  readonly figures?: number;
  readonly formation?: 'line' | 'column';
  readonly facing?: 'north' | 'east' | 'south' | 'west';
  readonly goal?: { readonly x: number; readonly y: number } | null;
}): VisibleSquad {
  return {
    id: 1,
    type: options.type ?? 'hastati',
    x: 10,
    y: 10,
    men: options.men ?? 120,
    capacity: 120,
    figures: options.figures ?? options.men ?? 120,
    formation: options.formation ?? 'line',
    facing: options.facing ?? 'south',
    goal: options.goal ?? null,
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
  };
}

/** How many pixels of a buffer have any ink in them. */
function ink(buffer: PixelBuffer): number {
  let painted = 0;
  for (let index = 3; index < buffer.pixels.length; index += 4) if ((buffer.pixels[index] ?? 0) > 0) painted += 1;

  return painted;
}

describe('the places a block’s men stand in', () => {
  it('has one unique whole-pixel slot per Figure in either formation', () => {
    for (const formation of FORMATIONS) for (const men of [1, 12, 24, 48, 60, 120]) {
      const slots = blockMen({ men, formation, facing: 'south' });
      expect(slots).toHaveLength(men);
      expect(new Set(slots.map((slot) => `${slot.x}:${slot.y}`)).size).toBe(men);
      expect(slots.every((slot) => Number.isInteger(slot.x) && Number.isInteger(slot.y))).toBe(true);
    }
  });

  it('keeps the last survivor in a purchased slot rather than recentering him', () => {
    const full = blockMen({ men: 120, capacity: 120, formation: 'line', facing: 'south' });
    const last = blockMen({ men: 1, capacity: 120, formation: 'line', facing: 'south' });
    expect(last).toHaveLength(1);
    expect(full).toContainEqual(last[0]);
  });

  it('turns the whole layout for each way a Squad faces', () => {
    const south = blockMen({ men: 60, formation: 'line', facing: 'south' });
    const north = blockMen({ men: 60, formation: 'line', facing: 'north' });
    const east = blockMen({ men: 60, formation: 'line', facing: 'east' });
    const west = blockMen({ men: 60, formation: 'line', facing: 'west' });

    // A block facing north is the block facing south turned around: every man is
    // opposite the man he was, and the ranks run the other way. The `+ 0` writes
    // the middle of the block as a number rather than as a signed zero.
    expect(north.map((man) => ({ x: -man.x + 0, y: -man.y + 0 }))).toEqual(
      south.map((man) => ({ x: man.x + 0, y: man.y + 0 })),
    );

    // East and west are the same turn the other way round.
    expect(west.map((man) => ({ x: -man.x + 0, y: -man.y + 0 }))).toEqual(
      east.map((man) => ({ x: man.x + 0, y: man.y + 0 })),
    );

    // And the four are four different layouts, not one repeated.
    const layouts = new Set([south, north, east, west].map((men) => JSON.stringify(men.map((man) => [man.x, man.y]))));
    expect(layouts.size).toBe(4);
  });

  it('bounds a large line and a distinct column at their purchased extent', () => {
    expect(blockSize({ men: 120, formation: 'line', facing: 'south' })).toEqual({ width: 54, height: 59 });
    expect(blockSize({ men: 120, formation: 'column', facing: 'south' })).toEqual({ width: 30, height: 109 });
  });
});

describe('a block of men, drawn', () => {
  it('uses one Figure per infantryman without shrinking a soldier', () => {
    const squad = squadOf({ men: 120 });
    expect(visualShape(squad)).toEqual({ men: 120, capacity: 120, seed: 1, formation: 'line', facing: 'south' });
    const block = squadBlock(squad);
    expect({ width: block.width, height: block.height }).toEqual({ width: 54, height: 59 });
    expect(squad.men).toBe(120);
    expect(squad.figures).toBe(120);
  });
  it('draws fewer soldiers when the Squad has fewer men', () => {
    const full = squadBlock(squadOf({ men: 120 }));
    const thin = squadBlock(squadOf({ men: 60 }));

    expect(ink(thin)).toBeLessThan(ink(full));
    expect(thin.height).toBe(full.height);
  });

  it('wears its Faction’s cloth, and rings itself when it is picked', () => {
    const roman = squadBlock(squadOf({}), { faction: 'rome' });
    const carthaginian = squadBlock(squadOf({}), { faction: 'carthage' });
    const picked = squadBlock(squadOf({}), { selected: true });

    expect(ink(carthaginian)).toBe(ink(roman));
    expect(hashPixelBuffer(carthaginian)).not.toBe(hashPixelBuffer(roman));
    // The ring is a bright border around the block's whole rectangle.
    expect(pixelAt(picked, 0, 0)).toEqual(SELECTION_INK);
    expect(pixelAt(picked, picked.width - 1, 0)).toEqual(SELECTION_INK);
    expect(pixelAt(picked, 0, picked.height - 1)).toEqual(SELECTION_INK);
  });

  it('refuses a Squad type neither roster has drawn', () => {
    expect(() => squadBlock(squadOf({ type: 'war-elephant' }))).toThrow(/rosters draw/);
  });

  it('has a figure for every Squad type the content table knows', () => {
    for (const type of SQUAD_TYPES) {
      expect(FIGURE_OF_SQUAD[type.id], type.id).toBeDefined();
    }
  });

  it('draws a Squad of a single figure as exactly one figure, whatever its strength', () => {
    // An elephant is a Squad of one figure whose strength is the staying power
    // that figure is worth (C4), so the block is the beast and nothing beside it.
    const elephant = squadOf({ type: 'elephant', men: 24, figures: 1 });
    const block = squadBlock(elephant);

    expect({ width: block.width, height: block.height }).toEqual({
      width: FIGURE_WIDTH,
      height: FIGURE_HEIGHT,
    });
    expect(hashPixelBuffer(block)).toBe(
      hashPixelBuffer(soldier('elephant', 'south', figureFrame('idle', 0), 'carthage')),
    );
  });
});

describe('the frame a Squad is drawn in', () => {
  it('stands still when it has nowhere to go, and steps every other tick when it marches', () => {
    const standing = squadOf({});
    const marching = squadOf({ goal: { x: 20, y: 20 } });

    expect(frameStepOf(standing, 0)).toBe(-1);
    expect(frameStepOf(standing, 7)).toBe(-1);
    expect(frameStepOf(marching, 0)).toBe(0);
    expect(frameStepOf(marching, 1)).toBe(0);
    expect(frameStepOf(marching, 2)).toBe(1);
    expect(frameStepOf(marching, 3)).toBe(1);
    expect(frameStepOf(marching, 4)).toBe(0);
  });

  it('draws a marching Squad in two frames, and a standing one in one', () => {
    const marching = squadOf({ goal: { x: 20, y: 20 } });
    const first = squadBlock(marching, { tick: 0 });
    const second = squadBlock(marching, { tick: 2 });

    expect(hashPixelBuffer(second)).not.toBe(hashPixelBuffer(first));
    expect(squadFrameKey(marching, { tick: 0 })).not.toBe(squadFrameKey(marching, { tick: 2 }));
  });

  it('is keyed by everything a block is drawn from, and nothing else', () => {
    const base = squadFrameKey(squadOf({}), { tick: 0 });

    expect(squadFrameKey(squadOf({}), { tick: 0 })).toBe(base);
    expect(squadFrameKey(squadOf({ type: 'triarii' }), {})).not.toBe(base);
    expect(squadFrameKey(squadOf({ facing: 'north' }), {})).not.toBe(base);
    expect(squadFrameKey(squadOf({ formation: 'column' }), {})).not.toBe(base);
    expect(squadFrameKey(squadOf({ men: 119 }), {})).not.toBe(base);
    expect(squadFrameKey(squadOf({}), { faction: 'carthage' })).not.toBe(base);
    expect(squadFrameKey(squadOf({}), { selected: true })).not.toBe(base);
    expect(squadFrameKey(squadOf({ goal: { x: 20, y: 20 } }), { tick: 2 })).not.toBe(base);
  });
});

describe('where a block stands', () => {
  it('puts the middle of its front rank on the middle of the tile', () => {
    const at = { x: 100, y: 200 };
    const shape: BlockShape = { men: 120, formation: 'line', facing: 'south' };
    const anchor = blockAnchor(shape);
    const sprite = blockPlacement(at, shape);

    // The front rank's ground line: the middle of the tile across, the bottom
    // of the tile down.
    expect(sprite.x + anchor.x).toBe(at.x + 8);
    expect(sprite.y + anchor.y).toBe(at.y + 16);
  });

  it('does not move the men still standing when a rank is lost', () => {
    const at = { x: 100, y: 200 };
    const full: BlockShape = { men: 120, formation: 'line', facing: 'south' };
    const thin: BlockShape = { men: 108, capacity: 120, formation: 'line', facing: 'south' };

    const fullTop = blockPlacement(at, full).y;
    const thinTop = blockPlacement(at, thin).y;

    // Vacant slots remain inside the original extent; the sprite does not shift.
    expect(thinTop).toBe(fullTop);
  });
});
