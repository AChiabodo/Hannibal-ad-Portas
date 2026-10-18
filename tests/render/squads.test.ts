/**
 * A Squad drawn as its soldiers (ticket C2).
 *
 * This is the claim the ticket's acceptance criteria are made of — "a Squad is
 * rendered as its soldiers in formation, and that formation matches the one the
 * simulation holds" and "individual soldiers visibly thin out as the Squad loses
 * strength" — so the tests are about the *derivation*, not about how a block
 * looks: the men drawn are the men `sim/squad.ts` derives, in the same order, so
 * losing a man loses the last one and moves nobody.
 */
import { describe, expect, it } from 'vitest';
import { SQUAD_TYPES } from '../../src/content/squads';
import type { VisibleSquad } from '../../src/sim/economy-match';
import { FORMATIONS } from '../../src/sim/command';
import { menOf } from '../../src/sim/squad';
import {
  FIGURE_OF_SQUAD,
  FILE_STEP,
  RANK_STEP,
  SELECTION_INK,
  blockAnchor,
  blockMen,
  blockPlacement,
  blockSize,
  frameStepOf,
  orderMarker,
  squadBlock,
  squadFrameKey,
  type BlockShape,
} from '../../src/render/squads';
import { hashPixelBuffer, pixelAt, type PixelBuffer } from '../../src/art/pixel-buffer';
import { FIGURE_HEIGHT, FIGURE_WIDTH } from '../../src/art/figures';

/** A Squad with the fields a drawing code reads, and plausible answers for the rest. */
function squadOf(options: {
  readonly type?: string;
  readonly men?: number;
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
    formation: options.formation ?? 'line',
    facing: options.facing ?? 'south',
    goal: options.goal ?? null,
    refused: null,
    morale: 10,
    payroll: 3,
    unpaid: 0,
    home: 0,
  };
}

/** How many pixels of a buffer have any ink in them. */
function ink(buffer: PixelBuffer): number {
  let painted = 0;
  for (let index = 3; index < buffer.pixels.length; index += 4) if ((buffer.pixels[index] ?? 0) > 0) painted += 1;

  return painted;
}

describe('the places a block’s men stand in', () => {
  it('is exactly the list the simulation derives: same men, same files, same ranks', () => {
    for (const formation of FORMATIONS) {
      for (const men of [1, 3, 12, 13, 120]) {
        const places = blockMen({ men, formation, facing: 'south' });
        const derived = menOf({ strength: men, formation: FORMATIONS.indexOf(formation) });

        expect(places.length).toBe(men);
        expect(places.map((man) => ({ file: man.file, rank: man.rank }))).toEqual(
          derived.map((man) => ({ file: man.file, rank: man.rank })),
        );
      }
    }
  });

  it('thins out from the back: a Squad that has lost men stands exactly where it did', () => {
    const full = blockMen({ men: 120, formation: 'line', facing: 'south' });

    for (const men of [119, 100, 60, 12]) {
      const fewer = blockMen({ men, formation: 'line', facing: 'south' });

      // Whole places, not only whole men: a rank that is gone takes nobody's
      // place with it. This holds while the frontage is full, which is every
      // rank but the block's last.
      expect(fewer).toEqual(full.slice(0, men));
    }

    // The last men left stand in one thin rank, at the front, where the block
    // was: the simulation's own derivation says so and the drawing follows it.
    const last = blockMen({ men: 1, formation: 'line', facing: 'south' });
    expect(last.map((man) => man.rank)).toEqual([0]);
    expect(last[0]?.x).toBe(0);
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

  it('is as wide as its frontage and as deep as its ranks, in whole steps', () => {
    const line = blockSize({ men: 12, formation: 'line', facing: 'south' });
    const deeper = blockSize({ men: 24, formation: 'line', facing: 'south' });

    // Twelve files abreast and one rank: the width is the files, the height one
    // figure. Two ranks are one rank step taller and no wider.
    expect(line).toEqual({ width: 11 * FILE_STEP + FIGURE_WIDTH, height: FIGURE_HEIGHT });
    expect(deeper).toEqual({ width: line.width, height: line.height + RANK_STEP });
  });
});

describe('a block of men, drawn', () => {
  it('draws fewer soldiers when the Squad has fewer men', () => {
    const full = squadBlock(squadOf({ men: 120 }));
    const thin = squadBlock(squadOf({ men: 60 }));

    expect(ink(thin)).toBeLessThan(ink(full));
    expect(thin.height).toBeLessThan(full.height);
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
    const thin: BlockShape = { men: 108, formation: 'line', facing: 'south' };

    const fullTop = blockPlacement(at, full).y;
    const thinTop = blockPlacement(at, thin).y;

    // The block got a rank shorter and its top edge moved down by exactly that,
    // so the men in the ranks that are left are drawn where they were.
    expect(thinTop - fullTop).toBe(4);
  });

  it('draws the mark of an order as a diamond of its own size', () => {
    const mark = orderMarker();

    expect(mark.width).toBe(mark.height);
    expect(ink(mark)).toBeGreaterThan(0);
    // Hollow: the middle of the four edges is ink and the corners are not.
    expect(pixelAt(mark, 0, 0)[3]).toBe(0);
  });
});
