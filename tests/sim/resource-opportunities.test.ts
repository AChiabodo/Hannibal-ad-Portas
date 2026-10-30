import { describe, expect, it } from 'vitest';
import { createEconomy, landCapacity, LAND_RADIUS } from '../../src/sim/economy';
import { generateMap, halfOf, RESOURCE_KINDS, type Site } from '../../src/sim/map';

const within = (a: Site, b: Site) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= LAND_RADIUS;

describe('effective resource opportunities (#76)', () => {
  it('gives both Strongholds enough local capacity for the starting workers, including seed 587 timber', () => {
    for (const seed of [2, 4, 12, 14, 587]) {
      const map = generateMap(seed);
      const economy = createEconomy(map);
      const homes = economy.settlements.slice(0, 2);
      for (const kind of RESOURCE_KINDS) {
        const capacity = homes.map((home) => Math.min(home.population, landCapacity(map, home)[kind]!));
        expect(capacity, `seed ${seed}, resource ${kind}`).toEqual(homes.map((home) => home.population));
      }
    }
  });

  it('places every node in workable land, with all four resources at each home and nearby neutral opportunity over 1000 seeds', () => {
    const problems: string[] = [];
    for (let seed = 0; seed < 1000; seed += 1) {
      const map = generateMap(seed);
      const sites = [...map.strongholds, ...map.settlements];
      for (const node of map.resources) if (!sites.some((site) => within(site, node)))
        problems.push(`seed ${seed}: unworkable node ${node.kind} at ${node.x},${node.y}`);
      for (const half of [0, 1] as const) {
        const home = map.strongholds[half];
        const near = map.settlements.filter((site) => halfOf(map, site.x, site.y) === half)
          .sort((a, b) => Math.max(Math.abs(a.x - home.x), Math.abs(a.y - home.y)) -
            Math.max(Math.abs(b.x - home.x), Math.abs(b.y - home.y)))[0]!;
        for (const kind of RESOURCE_KINDS) for (const site of [home, near])
          if (!map.resources.some((node) => node.kind === kind && within(site, node)))
            problems.push(`seed ${seed}: resource ${kind} unavailable at ${site.x},${site.y}`);
      }
    }
    expect(problems.slice(0, 20)).toEqual([]);
  }, 120000);
});
