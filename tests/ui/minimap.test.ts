/**
 * The minimap (ticket B7).
 *
 * The minimap's whole job is to be *honest*: it shows the map the Match is
 * played on, and it shows no more of it than the Faction knows. Both halves are
 * asserted here — one tile of the map becomes one pixel of the minimap, and a
 * tile the Faction has never seen becomes the blank the fog leaves, whatever the
 * map holds underneath it. A minimap that leaked an unexplored settlement would
 * be the fog's most visible failure, which is why the leak is the test.
 *
 * Fog of war itself is B4's; what is here is the *rendering contract* it will
 * satisfy — three states per tile — so that the day the visibility grid lands,
 * the minimap already obeys it.
 */
import { describe, expect, it } from 'vitest';
import { pixelAt } from '../../src/art/pixel-buffer.ts';
import { BASE } from '../../src/art/palette.ts';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  TERRAIN,
  TILE_SIZE,
  generateMap,
  tileIndex,
  type MapGrid,
  type Terrain,
} from '../../src/sim/map.ts';
import {
  FOG,
  MINIMAP_CAMERA,
  MINIMAP_COLOUR,
  MINIMAP_MARKER,
  MINIMAP_PADDING,
  MINIMAP_PLATE_HEIGHT,
  MINIMAP_PLATE_WIDTH,
  allVisible,
  fogAt,
  fogGrid,
  minimapPlate,
  minimapPointOf,
  revealWithin,
  settlementColour,
  viewportRectOnMinimap,
} from '../../src/ui/minimap.ts';

const MAP: MapGrid = generateMap(7);

/** Every tile a settlement or a resource node stands on, which a marker paints over. */
const OCCUPIED = new Set<number>([
  ...MAP.strongholds.map((site) => tileIndex(site.x, site.y)),
  ...MAP.settlements.map((site) => tileIndex(site.x, site.y)),
  ...MAP.resources.map((node) => tileIndex(node.x, node.y)),
]);

/** The pixel one tile of the map becomes on the plate. */

describe('the minimap plate', () => {
  it('is one pixel per tile, with a frame around it', () => {
    const plate = minimapPlate(MAP, allVisible(), null);

    expect(plate.width).toBe(MINIMAP_PLATE_WIDTH);
    expect(plate.height).toBe(MINIMAP_PLATE_HEIGHT);
    expect(MINIMAP_PLATE_WIDTH).toBe(MAP_WIDTH + 2 * MINIMAP_PADDING);
    expect(MINIMAP_PLATE_HEIGHT).toBe(MAP_HEIGHT + 2 * MINIMAP_PADDING);
  });

  it('draws every tile of the map, in the colour of its terrain', () => {
    const plate = minimapPlate(MAP, allVisible(), null);

    let checked = 0;
    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        if (OCCUPIED.has(tileIndex(x, y))) continue;

        const terrain: Terrain = (MAP.terrain[tileIndex(x, y)] ?? TERRAIN.plain) as Terrain;
        const at = minimapPointOf(x, y);
        expect(pixelAt(plate, at.x, at.y), `tile ${String(x)},${String(y)}`).toEqual(MINIMAP_COLOUR[terrain]);
        checked += 1;
      }
    }

    // A map of nine thousand tiles minus a handful of markers: the check is only
    // worth something if it walked the map and not a corner of it.
    expect(checked).toBeGreaterThan(9000);
  });

  it('has a colour for every terrain the map can hold', () => {
    for (const terrain of Object.values(TERRAIN)) {
      expect(MINIMAP_COLOUR[terrain], String(terrain)).toBeDefined();
    }
    for (const kind of Object.values(RESOURCE)) {
      expect(MINIMAP_MARKER[kind], String(kind)).toBeDefined();
    }
  });

  it('stands a settlement in the colour of whoever holds it', () => {
    const [rome, carthage] = MAP.strongholds;
    const plate = minimapPlate(MAP, allVisible(), null);

    const romeAt = minimapPointOf(rome.x, rome.y);
    const carthageAt = minimapPointOf(carthage.x, carthage.y);
    expect(pixelAt(plate, romeAt.x, romeAt.y)).toEqual(settlementColour(0));
    expect(pixelAt(plate, carthageAt.x, carthageAt.y)).toEqual(settlementColour(1));

    // The minor settlements belong to nobody until they are taken (C6), and the
    // minimap says so rather than guessing.
    const minor = MAP.settlements[0];
    if (minor === undefined) throw new Error('the map has no minor settlement');
    const minorAt = minimapPointOf(minor.x, minor.y);
    expect(pixelAt(plate, minorAt.x, minorAt.y)).toEqual(settlementColour(-1));
  });

  it('stands a resource node in the colour of what it holds', () => {
    const plate = minimapPlate(MAP, allVisible(), null);

    for (const node of MAP.resources) {
      const at = minimapPointOf(node.x, node.y);
      expect(pixelAt(plate, at.x, at.y), `${node.kind} at ${String(node.x)},${String(node.y)}`).toEqual(
        MINIMAP_MARKER[node.kind],
      );
    }
  });
});

describe('the minimap obeys the fog', () => {
  it('stays blank where the Faction has never been, whatever the map holds there', () => {
    const plate = minimapPlate(MAP, fogGrid(MAP_WIDTH, MAP_HEIGHT, FOG.unseen), null);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const at = minimapPointOf(x, y);
        expect(pixelAt(plate, at.x, at.y), `tile ${String(x)},${String(y)}`).toEqual(BASE.night);
      }
    }
  });

  it('hides a settlement the Faction has never seen', () => {
    const [rome] = MAP.strongholds;
    const fog = fogGrid(MAP_WIDTH, MAP_HEIGHT, FOG.unseen);
    const at = minimapPointOf(rome.x, rome.y);

    expect(pixelAt(minimapPlate(MAP, fog, null), at.x, at.y)).toEqual(BASE.night);

    revealWithin(fog, rome.x, rome.y, 3);
    expect(fogAt(fog, rome.x, rome.y)).toBe(FOG.visible);
    expect(pixelAt(minimapPlate(MAP, fog, null), at.x, at.y)).toEqual(settlementColour(0));
  });

  it('dims what is explored and shows what is in view, and never confuses the two', () => {
    const visible = minimapPlate(MAP, fogGrid(MAP_WIDTH, MAP_HEIGHT, FOG.visible), null);
    const explored = minimapPlate(MAP, fogGrid(MAP_WIDTH, MAP_HEIGHT, FOG.explored), null);

    const at = minimapPointOf(3, 3);
    const seen = pixelAt(visible, at.x, at.y);
    const remembered = pixelAt(explored, at.x, at.y);

    expect(remembered).not.toEqual(seen);
    expect(remembered).not.toEqual(BASE.night);
    // Dimmer, not different: the terrain under it is still readable.
    expect(remembered[0]).toBeLessThanOrEqual(seen[0]);
    expect(remembered[1]).toBeLessThanOrEqual(seen[1]);
    expect(remembered[2]).toBeLessThanOrEqual(seen[2]);
    expect(remembered[3]).toBe(seen[3]);
  });
});

describe('the camera on the minimap', () => {
  it('marks the ground the viewport is showing', () => {
    const viewport = { x: 10 * TILE_SIZE, y: 20 * TILE_SIZE, width: 4 * TILE_SIZE, height: 3 * TILE_SIZE };
    const rect = viewportRectOnMinimap(viewport);
    const plate = minimapPlate(MAP, allVisible(), viewport);

    expect(rect).toEqual({ x: MINIMAP_PADDING + 10, y: MINIMAP_PADDING + 20, width: 4, height: 3 });

    // The outline is the camera's colour, and the tile just inside it is not.
    expect(pixelAt(plate, rect.x, rect.y)).toEqual(MINIMAP_CAMERA);
    expect(pixelAt(plate, rect.x + rect.width, rect.y)).toEqual(MINIMAP_CAMERA);
    expect(pixelAt(plate, rect.x + 1, rect.y + 1)).not.toEqual(MINIMAP_CAMERA);
  });

  it('clamps a viewport that runs off the map', () => {
    const rect = viewportRectOnMinimap({ x: -TILE_SIZE, y: -TILE_SIZE, width: 3 * TILE_SIZE, height: 3 * TILE_SIZE });

    expect(rect.x).toBe(MINIMAP_PADDING);
    expect(rect.y).toBe(MINIMAP_PADDING);
    expect(rect.width).toBe(2);
    expect(rect.height).toBe(2);
  });
});

describe('the fog grid', () => {
  it('refuses to describe a map of another size', () => {
    expect(() => minimapPlate(MAP, fogGrid(3, 3, FOG.visible), null)).toThrow(/3×3|fog/i);
  });

  it('reveals a square of tiles around a site, and no more', () => {
    const fog = fogGrid(MAP_WIDTH, MAP_HEIGHT, FOG.unseen);
    revealWithin(fog, 10, 10, 2);

    expect(fogAt(fog, 10, 10)).toBe(FOG.visible);
    expect(fogAt(fog, 12, 12)).toBe(FOG.visible);
    expect(fogAt(fog, 13, 10)).toBe(FOG.unseen);
    expect(fogAt(fog, 9, 9)).toBe(FOG.visible);
  });
});
