import { describe, expect, it } from 'vitest';
import { blockMen, blockSize, blockAnchor, blockPlacement, visualShape } from '../../src/render/squads';
import { FIGURE_WIDTH, FIGURE_HEIGHT } from '../../src/art/figures';

describe('recruited visual slots (#67)', () => {
  it('anchors the centre of the front rank feet on its Tile in every facing', () => {
    for (const facing of ['north', 'east', 'south', 'west'] as const) {
      const shape = { men: 24, capacity: 24, formation: 'line' as const, facing };
      const places = blockMen(shape);
      const left = Math.min(...places.map((man) => man.x));
      const top = Math.min(...places.map((man) => man.y));
      const front = places.filter((man) => man.rank === 0);
      const place = blockPlacement({ x: 100, y: 200 }, shape);
      const feetX = place.x - left + (Math.min(...front.map((man) => man.x)) + Math.max(...front.map((man) => man.x))) / 2 + FIGURE_WIDTH / 2;
      const feetY = place.y - top + (Math.min(...front.map((man) => man.y)) + Math.max(...front.map((man) => man.y))) / 2 + FIGURE_HEIGHT;
      expect(feetX).toBe(108);
      expect(feetY).toBe(216);
    }
  });
  it('draws every survivor and keeps an elephant a single Figure', () => {
    expect(visualShape({ id: 7, type: 'hastati', capacity: 60, figures: 43, formation: 'line', facing: 'south' }).men).toBe(43);
    expect(visualShape({ id: 8, type: 'elephant', capacity: 24, figures: 1, formation: 'line', facing: 'south' }).capacity).toBe(1);
  });

  it('uses the purchased Roman and Carthaginian line dimensions', () => {
    for (const [capacity, files, ranks] of [[24, 6, 4], [60, 10, 6], [120, 12, 10], [48, 8, 6], [12, 4, 3]]) {
      const places = blockMen({ men: capacity!, capacity: capacity!, formation: 'line', facing: 'south' });
      expect(new Set(places.map((man) => man.file)).size).toBe(files);
      expect(new Set(places.map((man) => man.rank)).size).toBe(ranks);
    }
  });

  it('leaves persistent interior holes without moving survivors, bounds or anchors', () => {
    for (const facing of ['north', 'east', 'south', 'west'] as const) {
      for (const formation of ['line', 'column'] as const) {
        const full = { men: 60, capacity: 60, seed: 7, formation, facing };
        const damaged = { ...full, men: 40 };
        const fewer = { ...full, men: 17 };
        const all = blockMen(full);
        const survivors = blockMen(damaged);
        expect(survivors).toHaveLength(40);
        expect(survivors.every((man) => all.some((slot) => JSON.stringify(slot) === JSON.stringify(man)))).toBe(true);
        expect(blockMen(fewer).every((man) => survivors.some((slot) => JSON.stringify(slot) === JSON.stringify(man)))).toBe(true);
        expect(all.some((man) => man.file > 0 && man.file < 4 && man.rank > 0 && man.rank < 5 && !survivors.some((slot) => slot.file === man.file && slot.rank === man.rank))).toBe(true);
        expect(blockSize(damaged)).toEqual(blockSize(full));
        expect(blockAnchor(fewer)).toEqual(blockAnchor(full));
      }
    }
  });
});
