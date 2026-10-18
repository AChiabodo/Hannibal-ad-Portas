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
 * The fog it is drawn through is **B4's own** (`sim/fog.ts`), not a grid of the
 * interface's making: these tests build a `Fog` the way a Match does — an eye,
 * `refreshVision`, a `FogView` — so what is compared is the object the theatre
 * itself is veiled with.
 */
import { describe, expect, it } from 'vitest';
import { pixelAt } from '../../src/art/pixel-buffer.ts';
import { BASE } from '../../src/art/palette.ts';
import {
  KNOWLEDGE,
  createFog,
  eyeOf,
  inspectionView,
  refreshVision,
  viewOf,
  type FogView,
} from '../../src/sim/fog.ts';
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
  MINIMAP_CAMERA,
  MINIMAP_COLOUR,
  MINIMAP_CONTACT,
  MINIMAP_MARKER,
  MINIMAP_PADDING,
  MINIMAP_PLATE_HEIGHT,
  MINIMAP_PLATE_WIDTH,
  minimapPlate,
  minimapPointOf,
  settlementColour,
  viewportRectOnMinimap,
} from '../../src/ui/minimap.ts';

const MAP: MapGrid = generateMap(7);

/** The whole theatre, known: B4's own inspection view, which is what a debug plate is drawn from. */
const ALL_SEEN: FogView = inspectionView(MAP);

/** Every tile a settlement or a resource node stands on, which a marker paints over. */
const OCCUPIED = new Set<number>([
  ...MAP.strongholds.map((site) => tileIndex(site.x, site.y)),
  ...MAP.settlements.map((site) => tileIndex(site.x, site.y)),
  ...MAP.resources.map((node) => tileIndex(node.x, node.y)),
]);

/** A Faction that has looked from the tiles named, in order, and remembers what it saw. */
function watching(...watches: readonly { readonly x: number; readonly y: number; readonly radius: number }[]): FogView {
  const fog = createFog();

  for (const watch of watches) refreshVision(fog, MAP, [eyeOf(watch, watch.radius)]);

  return viewOf(fog);
}

describe('the minimap plate', () => {
  it('is one pixel per tile, with a frame around it', () => {
    const plate = minimapPlate(MAP, ALL_SEEN, null);

    expect(plate.width).toBe(MINIMAP_PLATE_WIDTH);
    expect(plate.height).toBe(MINIMAP_PLATE_HEIGHT);
    expect(MINIMAP_PLATE_WIDTH).toBe(MAP_WIDTH + 2 * MINIMAP_PADDING);
    expect(MINIMAP_PLATE_HEIGHT).toBe(MAP_HEIGHT + 2 * MINIMAP_PADDING);
  });

  it('draws every tile of the map, in the colour of its terrain', () => {
    const plate = minimapPlate(MAP, ALL_SEEN, null);

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
    const plate = minimapPlate(MAP, ALL_SEEN, null);

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
    const plate = minimapPlate(MAP, ALL_SEEN, null);

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
    const plate = minimapPlate(MAP, createFog(), null);

    for (let y = 0; y < MAP_HEIGHT; y += 1) {
      for (let x = 0; x < MAP_WIDTH; x += 1) {
        const at = minimapPointOf(x, y);
        expect(pixelAt(plate, at.x, at.y), `tile ${String(x)},${String(y)}`).toEqual(BASE.night);
      }
    }
  });

  it('hides a settlement the Faction has never seen', () => {
    const [rome] = MAP.strongholds;
    const at = minimapPointOf(rome.x, rome.y);

    // An eye on the far side of the theatre: the Stronghold is not in it.
    const far = watching({ x: rome.x < MAP_WIDTH / 2 ? 80 : 12, y: rome.y, radius: 3 });
    expect(pixelAt(minimapPlate(MAP, far, null), at.x, at.y)).toEqual(BASE.night);

    const looking = watching({ x: rome.x, y: rome.y, radius: 3 });
    expect(pixelAt(minimapPlate(MAP, looking, null), at.x, at.y)).toEqual(settlementColour(0));
  });

  it('dims what is remembered and shows what is in view, and never confuses the two', () => {
    const [rome] = MAP.strongholds;
    const near = { x: rome.x + 1, y: rome.y + 1 };
    const far = { x: rome.x < MAP_WIDTH / 2 ? 80 : 12, y: rome.y };

    const inView = minimapPlate(MAP, watching({ ...near, radius: 2 }), null);
    const remembered = minimapPlate(MAP, watching({ ...near, radius: 2 }, { ...far, radius: 2 }), null);

    const at = minimapPointOf(near.x, near.y);
    const seen = pixelAt(inView, at.x, at.y);
    const kept = pixelAt(remembered, at.x, at.y);

    expect(kept).not.toEqual(seen);
    expect(kept).not.toEqual(BASE.night);
    // Dimmer, not different: the terrain under it is still readable.
    expect(kept[0]).toBeLessThanOrEqual(seen[0]);
    expect(kept[1]).toBeLessThanOrEqual(seen[1]);
    expect(kept[2]).toBeLessThanOrEqual(seen[2]);
    expect(kept[3]).toBe(seen[3]);
  });

  it('draws an enemy last seen where the Faction believes it is, and only where it can see', () => {
    const [rome] = MAP.strongholds;
    const contact = { id: 1, kind: 0, x: rome.x + 1, y: rome.y + 1, seen: 12 };

    const known: FogView = { ...watching({ x: rome.x, y: rome.y, radius: 3 }), contacts: [contact] };
    const at = minimapPointOf(contact.x, contact.y);
    expect(pixelAt(minimapPlate(MAP, known, null), at.x, at.y)).toEqual(MINIMAP_CONTACT);

    // The same memory, seen from nowhere: a contact on a tile the Faction has
    // never looked at is a contact it cannot have.
    const blind: FogView = { ...createFog(), contacts: [contact] };
    expect(pixelAt(minimapPlate(MAP, blind, null), at.x, at.y)).toEqual(BASE.night);
  });
});

describe('the camera on the minimap', () => {
  it('marks the ground the viewport is showing', () => {
    const viewport = { x: 10 * TILE_SIZE, y: 20 * TILE_SIZE, width: 4 * TILE_SIZE, height: 3 * TILE_SIZE };
    const rect = viewportRectOnMinimap(viewport);
    const plate = minimapPlate(MAP, ALL_SEEN, viewport);

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

describe('the fog a plate is drawn through', () => {
  it('refuses a view that is not over this theatre', () => {
    const small: FogView = { terrain: new Uint8Array(9), visible: new Uint8Array(9), contacts: [] };

    expect(() => minimapPlate(MAP, small, null)).toThrow(/tiles/);
  });

  it('knows a tile the Faction is looking at now, and remembers one it has left', () => {
    const seen = watching({ x: 10, y: 10, radius: 1 });
    const left = watching({ x: 10, y: 10, radius: 1 }, { x: 40, y: 40, radius: 1 });

    expect(KNOWLEDGE.visible).toBe(2);
    expect(KNOWLEDGE.remembered).toBe(1);
    expect(KNOWLEDGE.unexplored).toBe(0);
    expect(left.terrain[tileIndex(10, 10)]).toBe(seen.terrain[tileIndex(10, 10)]);
    expect(left.visible[tileIndex(10, 10)]).toBe(0);
  });
});
