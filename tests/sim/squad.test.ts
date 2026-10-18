/**
 * The shape a Squad holds, and the words state spells it in (ticket C1).
 *
 * The men in a Squad are drawing, not state (ADR-0004): the Squad is one block
 * on one tile, and where the men inside it stand is derived from the shape it
 * holds and how many are left. That derivation is what this file pins down,
 * because two later tickets lean on it — C2 draws the block, and draws it
 * thinning as men are lost, and C3 asks how wide the frontage is.
 *
 * The one property that matters most is the dull one: the men are a *list*, in
 * an order that does not change. A Squad that turns, marches or loses a man
 * keeps the men it had, in the places they were, and the drawing code can keep
 * showing the same man in the same slot from tick to tick.
 */
import { describe, expect, it } from 'vitest';
import { FORMATIONS } from '../../src/sim/command';
import {
  depth,
  FACING,
  FACINGS,
  facingCode,
  facingOf,
  FORMATION,
  formationCode,
  formationOf,
  frontage,
  menOf,
  type Shape,
} from '../../src/sim/squad';

/** The shape a block holds: one formation, and a given number of men left in it. */
function shape(formation: number, strength: number): Shape {
  return { formation, strength };
}

describe('the shape a Squad holds', () => {
  it('stands a line twelve files abreast and a column three, whatever size the Squad is', () => {
    expect(frontage(shape(FORMATION.line, 40))).toBe(12);
    expect(depth(shape(FORMATION.line, 40))).toBe(4);
    expect(frontage(shape(FORMATION.column, 40))).toBe(3);
    expect(depth(shape(FORMATION.column, 40))).toBe(14);

    expect(frontage(shape(FORMATION.line, 13))).toBe(12);
    expect(frontage(shape(FORMATION.line, 5))).toBe(5);
    expect(frontage(shape(FORMATION.column, 5))).toBe(3);
    expect(frontage(shape(FORMATION.column, 2))).toBe(2);
  });

  it('gives a line the wider front and a column the deeper ranks, so the two are told apart', () => {
    for (let strength = 1; strength <= 144; strength += 1) {
      const line = shape(FORMATION.line, strength);
      const column = shape(FORMATION.column, strength);

      expect(frontage(line)).toBeGreaterThanOrEqual(frontage(column));
      expect(depth(column)).toBeGreaterThanOrEqual(depth(line));
      expect(frontage(line)).toBeGreaterThanOrEqual(depth(line));
    }
  });

  it('counts every man in the files and ranks it stands in, and no man twice', () => {
    for (const formation of [FORMATION.line, FORMATION.column]) {
      for (const strength of [1, 2, 5, 12, 13, 40, 144, 200]) {
        const here = shape(formation, strength);
        const wide = frontage(here);
        const deep = depth(here);

        expect(wide * deep).toBeGreaterThanOrEqual(strength);
        expect(wide * (deep - 1)).toBeLessThan(strength);
        expect(menOf(here)).toHaveLength(strength);
      }
    }
  });

  it('stands its men in ranks, the front rank first and left to right, which is the order they are drawn', () => {
    // A line is twelve files abreast, so an eight-man line is one rank that is
    // not full, and thirteen men make a full rank and a lone man behind it.
    expect(menOf(shape(FORMATION.line, 8))).toEqual([
      { file: 0, rank: 0 },
      { file: 1, rank: 0 },
      { file: 2, rank: 0 },
      { file: 3, rank: 0 },
      { file: 4, rank: 0 },
      { file: 5, rank: 0 },
      { file: 6, rank: 0 },
      { file: 7, rank: 0 },
    ]);

    const thirteen = menOf(shape(FORMATION.line, 13));
    expect(thirteen).toHaveLength(13);
    expect(thirteen[11]).toEqual({ file: 11, rank: 0 });
    expect(thirteen[12]).toEqual({ file: 0, rank: 1 });
  });

  it('fills a column three files abreast, so a Squad of forty is three by fourteen', () => {
    const forty = menOf(shape(FORMATION.column, 40));

    expect(forty[2]).toEqual({ file: 2, rank: 0 });
    expect(forty[3]).toEqual({ file: 0, rank: 1 });
    expect(forty.at(-1)).toEqual({ file: 0, rank: 13 });
  });

  it('keeps a man in his place when the Squad loses one: the last man leaves, and nobody moves up', () => {
    for (const formation of [FORMATION.line, FORMATION.column]) {
      for (const strength of [7, 13, 40]) {
        expect(menOf(shape(formation, strength - 1))).toEqual(
          menOf(shape(formation, strength)).slice(0, strength - 1),
        );
      }
    }

    // The case that a shape growing and shrinking with the men would get wrong:
    // a column of thirteen that loses a man must not become a single file.
    expect(frontage(shape(FORMATION.column, 13))).toBe(frontage(shape(FORMATION.column, 12)));
  });

  it('stands one man alone in one place, whatever shape a Squad of one is told to hold', () => {
    for (const formation of [FORMATION.line, FORMATION.column]) {
      expect(frontage(shape(formation, 1))).toBe(1);
      expect(depth(shape(formation, 1))).toBe(1);
      expect(menOf(shape(formation, 1))).toEqual([{ file: 0, rank: 0 }]);
    }
  });

  it('refuses to lay out a block with nobody in it: a Squad of none has left the field', () => {
    expect(() => frontage(shape(FORMATION.line, 0))).toThrow(RangeError);
    expect(() => depth(shape(FORMATION.line, -1))).toThrow(RangeError);
    expect(() => menOf(shape(FORMATION.line, 0))).toThrow(RangeError);
  });
});

describe('the words a Squad state spells', () => {
  it('faces north, east, south and west, numbered in that order', () => {
    expect(FACINGS).toEqual(['north', 'east', 'south', 'west']);
    expect(FACINGS.map(facingCode)).toEqual([0, 1, 2, 3]);
    expect(FACING.north).toBe(0);
    expect(FACING.west).toBe(3);
  });

  it('holds the two formations the vocabulary names, in the order it names them', () => {
    expect(FORMATIONS.map(formationCode)).toEqual([0, 1]);
    expect(FORMATION.line).toBe(0);
    expect(FORMATION.column).toBe(1);
  });

  it('reads a code back as the word it was written as', () => {
    for (const facing of FACINGS) expect(facingOf(facingCode(facing))).toBe(facing);
    for (const formation of FORMATIONS) expect(formationOf(formationCode(formation))).toBe(formation);
  });

  it('refuses a code that is not a facing or a formation a Squad can hold', () => {
    for (const code of [-1, 4, 1.5, Number.NaN]) expect(() => facingOf(code)).toThrow(RangeError);
    for (const code of [-1, 2, 0.5, Number.NaN]) expect(() => formationOf(code)).toThrow(RangeError);
  });
});
