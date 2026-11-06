import { expect, it } from 'vitest';
import { generateMap, halfOf } from '../../src/sim/map';

it('distributes the additional settlement on either side over different seeds', () => {
  const extra = [0, 0];
  for (let seed = 0; seed < 1000; seed += 1) {
    const map = generateMap(seed);
    if (map.settlements.length % 2 === 0) continue;
    const count = [0, 0];
    for (const site of map.settlements) count[halfOf(map, site.x, site.y)]! += 1;
    expect(Math.abs(count[0]! - count[1]!)).toBe(1);
    extra[count[0]! > count[1]! ? 0 : 1]! += 1;
  }
  const total = extra[0]! + extra[1]!;
  expect(total).toBeGreaterThan(200);
  expect(extra[0]! / total).toBeGreaterThan(0.4);
  expect(extra[0]! / total).toBeLessThan(0.6);
}, 60000);
