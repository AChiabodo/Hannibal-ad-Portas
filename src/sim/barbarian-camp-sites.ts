/** Deterministic locations for small neutral camps, separate from settlements. */
import { halfOf, MAP_HEIGHT, MAP_WIDTH, TERRAIN, terrainAt, type MapGrid, type Site } from './map.ts';
import { makeRng } from './rng.ts';

export interface BarbarianCampSite extends Site {
  /** Stable art choice, with three distinct camp arrangements. */
  readonly variant: number;
}

/**
 * Lay out one or two camps in each half, with room for settlement grounds,
 * roads and resources. This is map generation only: inhabitants and fog are
 * owned by the Match, never inferred by the drawing layer.
 */
export function barbarianCampSites(map: MapGrid, seed: number): readonly BarbarianCampSite[] {
  const rng = makeRng((seed ^ 0x76ba4ba1) >>> 0);
  const perHalf = 1 + rng.nextBelow(2);
  const sites: BarbarianCampSite[] = [];
  const counts = [0, 0];
  for (let attempt = 0; attempt < 12000 && sites.length < 2 * perHalf; attempt += 1) {
    const x = rng.nextInt(2, MAP_WIDTH - 4);
    const y = rng.nextInt(2, MAP_HEIGHT - 4);
    const half = halfOf(map, x, y);
    if ((counts[half] ?? 0) >= perHalf) continue;
    if (map.strongholds.some((site) => distance({ x, y }, site) < 32)) continue;
    if (map.settlements.some((site) => distance({ x, y }, site) <= 14)) continue;
    if (map.resources.some((site) => distance({ x, y }, site) <= 2)) continue;
    if (sites.some((site) => distance({ x, y }, site) < 20)) continue;
    let clear = true;
    for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
      const terrain = terrainAt(map, x + dx, y + dy);
      if (terrain !== TERRAIN.plain && terrain !== TERRAIN.hill &&
        terrain !== TERRAIN.forest && terrain !== TERRAIN.farmland) clear = false;
    }
    if (!clear) continue;
    sites.push({ x, y, variant: rng.nextBelow(3) });
    counts[half] = (counts[half] ?? 0) + 1;
  }
  if (sites.length !== 2 * perHalf) throw new Error('Unable to place balanced barbarian camps');
  return sites;
}

function distance(a: Site, b: Site): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
