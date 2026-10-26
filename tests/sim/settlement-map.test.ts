import { describe, expect, it } from 'vitest';
import { containsTile, intersects } from '../../src/content/settlement-layout';
import { generateMap, isWalkable, MAP_HEIGHT, MAP_WIDTH, MIN_FORDS_PER_RIVER, TERRAIN, tileIndex, tileX, tileY } from '../../src/sim/map';
import { plans, tileInFutureStructure } from './map-ground-invariants';

describe('generated settlement grounds (#74)', () => {
  it('leaves a dry manoeuvring pad beyond each Gate for the full column tail', () => {
    for (let seed = 0; seed < 24; seed += 1) {
      const map = generateMap(seed);
      for (const plan of plans(map).slice(0, 2)) {
        const pad = plan.at({ x: -3, y: 8, width: 7, height: 10 });
        for (let y = pad.y; y < pad.y + pad.height; y += 1) for (let x = pad.x; x < pad.x + pad.width; x += 1) {
          const here = map.terrain[tileIndex(x, y)];
          expect(here === TERRAIN.river || here === TERRAIN.ford, `seed ${seed}: ${x},${y}`).toBe(false);
        }
      }
    }
  });
  it('reserves every complete plan on dry ground with room between neighbouring settlements', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const map = generateMap(seed);
      const sites = plans(map);
      for (const [index, plan] of sites.entries()) {
        expect(plan.grounds.x, `seed ${seed}`).toBeGreaterThanOrEqual(3);
        expect(plan.grounds.y, `seed ${seed}`).toBeGreaterThanOrEqual(3);
        expect(plan.grounds.x + plan.grounds.width, `seed ${seed}`).toBeLessThanOrEqual(MAP_WIDTH - 3);
        expect(plan.grounds.y + plan.grounds.height, `seed ${seed}`).toBeLessThanOrEqual(MAP_HEIGHT - 3);
        for (const other of sites.slice(index + 1)) {
          expect(intersects({ ...plan.grounds, x: plan.grounds.x - 3, y: plan.grounds.y - 3,
            width: plan.grounds.width + 6, height: plan.grounds.height + 6 }, other.grounds), `seed ${seed}`).toBe(false);
        }
        for (let y = plan.grounds.y; y < plan.grounds.y + plan.grounds.height; y += 1) {
          for (let x = plan.grounds.x; x < plan.grounds.x + plan.grounds.width; x += 1) {
            expect(map.terrain[tileIndex(x, y)], `seed ${seed}: (${x},${y})`).not.toBe(TERRAIN.river);
            expect(map.terrain[tileIndex(x, y)], `seed ${seed}: (${x},${y})`).not.toBe(TERRAIN.ford);
          }
        }
      }
    }
  });
  it('keeps resource markers out of future structures and public areas without excluding the whole economic grounds', () => {
    let nodeWithinGrounds = false;
    for (let seed = 0; seed < 12; seed += 1) {
      const map = generateMap(seed);
      for (const node of map.resources) for (const plan of plans(map)) {
        expect(tileInFutureStructure(plan, node.x, node.y), `seed ${seed}: node on structure`).toBe(false);
        expect(containsTile(plan.at(plan.layout.capture), node.x, node.y), `seed ${seed}: capture`).toBe(false);
        expect(containsTile(plan.at(plan.layout.muster), node.x, node.y), `seed ${seed}: muster`).toBe(false);
        expect(containsTile(plan.at({ x: -1, y: 4, width: 3, height: 11 }), node.x, node.y), `seed ${seed}: access`).toBe(false);
        if (containsTile(plan.grounds, node.x, node.y)) nodeWithinGrounds = true;
      }
    }
    expect(nodeWithinGrounds).toBe(true);
  });
  it('routes the permanent road network around future roofs and through the Strongholds gates', () => {
    const failures: string[] = [];
    for (let seed = 0; seed < 12; seed += 1) {
      const map = generateMap(seed);
      const sites = plans(map);
      for (const road of map.roads) {
        for (const tile of road.tiles) {
          if (sites.some((plan) => tileInFutureStructure(plan, tileX(tile), tileY(tile)))) {
            failures.push(`seed ${seed}: road ${road.from}->${road.to} crosses (${tileX(tile)},${tileY(tile)})`);
            break;
          }
        }
      }
      for (const plan of sites.slice(0, 2)) {
        expect(map.roads.some((road) => road.tiles.some((tile) => containsTile(plan.gate, tileX(tile), tileY(tile))))).toBe(true);
      }
    }
    expect(failures).toEqual([]);
  });
  it('gives every river broad crossings and clears the shoulders of road crossings', () => {
    for (let seed = 0; seed < 12; seed += 1) {
      const map = generateMap(seed);
      const broad = (tile: number) => {
        const x = tileX(tile);
        const y = tileY(tile);
        if (x < 1 || y < 1 || x >= MAP_WIDTH - 1 || y >= MAP_HEIGHT - 1) return false;
        for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
          const here = map.terrain[tileIndex(x + dx, y + dy)];
          if (here === undefined || !isWalkable(here)) return false;
        }
        return true;
      };
      for (const river of map.rivers) {
        expect(river.tiles.filter((tile) => map.terrain[tile] === TERRAIN.ford && broad(tile)).length, `seed ${seed}`).toBeGreaterThanOrEqual(MIN_FORDS_PER_RIVER);
      }
      const riverTiles = new Set(map.rivers.flatMap((river) => river.tiles));
      for (const road of map.roads) for (const tile of road.tiles) {
        const x = tileX(tile);
        const y = tileY(tile);
        if (riverTiles.has(tile) && x > 0 && y > 0 && x < MAP_WIDTH - 1 && y < MAP_HEIGHT - 1) expect(broad(tile), `seed ${seed}: road crossing`).toBe(true);
      }
    }
  });
});
