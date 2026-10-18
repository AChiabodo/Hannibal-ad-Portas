/**
 * The fog: what a Faction has seen, what it remembers, and what it sees now
 * (ticket B4, PLAN §4).
 *
 * The three states the plan names are three statements about one grid —
 * unexplored is a tile whose terrain was never written down, remembered is one
 * written down but out of view, visible is one an eye covers — and every test
 * here is one of them at the seam `fog.ts` exposes. Nothing reaches inside: the
 * grid is read through `knows`, `believedTerrain` and `viewOf`, which is what a
 * rule and a Controller read it through too.
 *
 * The theatre is B1's own generator, so the terrain a test compares against is
 * the terrain the map really holds rather than a fixture that agrees with the
 * fog by construction.
 */
import { describe, expect, it } from 'vitest';
import type { Controller, Player } from '../../src/sim/controller';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  TILE_COUNT,
  generateMap,
  terrainAt,
  tileIndex,
} from '../../src/sim/map';
import {
  KNOWLEDGE,
  UNSEEN,
  believedTerrain,
  createFog,
  createFogs,
  eyeOf,
  forgetContacts,
  inspectionView,
  knows,
  observeContacts,
  refreshVision,
  viewOf,
  type FogView,
} from '../../src/sim/fog';

/** The theatre the fog tests are computed over: seed 7, the map the README dumps. */
const MAP = generateMap(7);

/** How far a tile is from a point, squared: the fog's own distance, worked by hand here. */
function distanceSquared(from: { readonly x: number; readonly y: number }, x: number, y: number): number {
  const dx = x - from.x;
  const dy = y - from.y;

  return dx * dx + dy * dy;
}

/** The tiles an eye of the given radius covers, by the definition rather than by the fog. */
function disc(eye: { readonly x: number; readonly y: number; readonly radius: number }): number[] {
  const tiles: number[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      if (distanceSquared(eye, x, y) <= eye.radius * eye.radius) tiles.push(tileIndex(x, y));
    }
  }

  return tiles;
}

describe('a Faction that has seen nothing', () => {
  it('starts with every tile unexplored, nothing in view and no contacts', () => {
    const fog = createFog();

    expect(fog.terrain.length).toBe(TILE_COUNT);
    expect(fog.visible.length).toBe(TILE_COUNT);
    expect(fog.terrain.every((ground) => ground === UNSEEN)).toBe(true);
    expect(fog.visible.every((flag) => flag === 0)).toBe(true);
    expect(fog.contacts).toEqual([]);

    // And that is what it knows, tile for tile: nothing.
    expect(knows(fog, 40, 40)).toBe(KNOWLEDGE.unexplored);
    expect(believedTerrain(fog, 40, 40)).toBe(null);
  });
});

describe('the vision of one tick', () => {
  it('covers the disc a radius describes around an eye, and no more', () => {
    const fog = createFog();
    const eye = { x: 20, y: 30, radius: 4 };
    const inside = disc(eye);

    refreshVision(fog, MAP, [eyeOf(eye, eye.radius)]);

    const seen = inside.filter((tile) => knows(fog, tile % MAP_WIDTH, Math.floor(tile / MAP_WIDTH)) !== KNOWLEDGE.unexplored);
    expect(seen.length).toBe(inside.length);

    // One tile inside the disc's edge is in view; the first tile outside it is not.
    const edge = { x: eye.x + eye.radius, y: eye.y };
    expect(knows(fog, edge.x, edge.y)).toBe(KNOWLEDGE.visible);
    expect(knows(fog, edge.x + 1, edge.y)).toBe(KNOWLEDGE.unexplored);
  });

  it('remembers the terrain it saw, tile for tile, and nothing where it did not look', () => {
    const fog = createFog();
    const eye = { x: 60, y: 12, radius: 3 };

    refreshVision(fog, MAP, [eyeOf(eye, eye.radius)]);

    for (const tile of disc(eye)) {
      const x = tile % MAP_WIDTH;
      const y = Math.floor(tile / MAP_WIDTH);
      expect(believedTerrain(fog, x, y)).toBe(terrainAt(MAP, x, y));
    }

    // A tile outside the disc believes nothing, however loudly the map says otherwise.
    const away = { x: eye.x + 30, y: eye.y };
    expect(believedTerrain(fog, away.x, away.y)).toBe(null);
  });

  it('clamps to the theatre when an eye stands on its edge, and never wraps around', () => {
    const fog = createFog();

    refreshVision(fog, MAP, [eyeOf({ x: 0, y: 0 }, 2)]);

    // The tiles the disc covers stay on the map, and the far corner is untouched.
    expect(knows(fog, 0, 0)).toBe(KNOWLEDGE.visible);
    expect(knows(fog, 2, 0)).toBe(KNOWLEDGE.visible);
    expect(knows(fog, MAP_WIDTH - 1, 0)).toBe(KNOWLEDGE.unexplored);
    expect(knows(fog, MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe(KNOWLEDGE.unexplored);
  });

  it('recomputes what is in view rather than accumulating it, and keeps the memory', () => {
    const fog = createFog();
    const first = { x: 10, y: 10, radius: 3 };
    const second = { x: 70, y: 70, radius: 3 };

    refreshVision(fog, MAP, [eyeOf(first, first.radius)]);
    refreshVision(fog, MAP, [eyeOf(second, second.radius)]);

    // The first disc is out of view now, and still remembered.
    expect(knows(fog, first.x, first.y)).toBe(KNOWLEDGE.remembered);
    expect(believedTerrain(fog, first.x, first.y)).toBe(terrainAt(MAP, first.x, first.y));
    // The second is in view.
    expect(knows(fog, second.x, second.y)).toBe(KNOWLEDGE.visible);
    // And the tiles neither eye ever covered are still unexplored.
    expect(knows(fog, 40, 40)).toBe(KNOWLEDGE.unexplored);
  });

  it('sees the union of several eyes', () => {
    const fog = createFog();
    const west = { x: 5, y: 50, radius: 2 };
    const east = { x: 90, y: 50, radius: 2 };

    refreshVision(fog, MAP, [eyeOf(west, west.radius), eyeOf(east, east.radius)]);

    expect(knows(fog, west.x, west.y)).toBe(KNOWLEDGE.visible);
    expect(knows(fog, east.x, east.y)).toBe(KNOWLEDGE.visible);
    expect(knows(fog, 48, 50)).toBe(KNOWLEDGE.unexplored);
  });

  it('refuses an eye that is not a whole tile of the theatre, and leaves the fog as it found it', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [eyeOf({ x: 20, y: 20 }, 3)]);
    const before = { terrain: Array.from(fog.terrain), visible: Array.from(fog.visible) };

    expect(() => refreshVision(fog, MAP, [eyeOf({ x: 1.5, y: 2 }, 3)])).toThrow(/whole tile/);
    expect(() => refreshVision(fog, MAP, [eyeOf({ x: 1, y: 2 }, -1)])).toThrow(/radius/);
    expect(() => refreshVision(fog, MAP, [eyeOf({ x: MAP_WIDTH, y: 2 }, 3)])).toThrow(/theatre/);
    expect(() => refreshVision(fog, MAP, [eyeOf({ x: 2, y: -1 }, 3)])).toThrow(/theatre/);
    // And an eye that is fine beside one that is not is refused with the rest.
    expect(() => refreshVision(fog, MAP, [eyeOf({ x: 2, y: 2 }, 3), eyeOf({ x: 2, y: 2.5 }, 3)])).toThrow(
      /whole tile/,
    );

    expect(Array.from(fog.terrain)).toEqual(before.terrain);
    expect(Array.from(fog.visible)).toEqual(before.visible);
  });
});

describe('two Factions, two fogs', () => {
  it('gives each Faction its own grid: one Faction seeing a tile does not show it to the other', () => {
    const fogs = createFogs();
    const rome = fogs.rome;
    const carthage = fogs.carthage;

    // Whatever the two share, it is not their grids.
    expect(rome.terrain).not.toBe(carthage.terrain);
    expect(rome.visible).not.toBe(carthage.visible);
    expect(rome.contacts).not.toBe(carthage.contacts);

    refreshVision(rome, MAP, [eyeOf({ x: 20, y: 20 }, 4)]);

    expect(knows(rome, 20, 20)).toBe(KNOWLEDGE.visible);
    expect(knows(carthage, 20, 20)).toBe(KNOWLEDGE.unexplored);
    expect(carthage.terrain.every((ground) => ground === UNSEEN)).toBe(true);
    expect(carthage.contacts).toEqual([]);
  });
});

describe('the enemy contacts a Faction remembers', () => {
  /** An eye standing on the middle of the theatre, looking four tiles out. */
  const EYE = eyeOf({ x: 48, y: 48 }, 4);

  /** A sighting of enemy id 3, standing on the tile given. */
  function sighting(id: number, x: number, y: number) {
    return { id, kind: 1, x, y };
  }

  it('remembers a contact it can see now, at the tile it stands on', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [EYE]);

    observeContacts(fog, [sighting(3, 49, 48)], 12);

    expect(fog.contacts).toEqual([{ id: 3, kind: 1, x: 49, y: 48, seen: 12 }]);
  });

  it('remembers nothing of a contact it cannot see, however loudly the rules say it is there', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [EYE]);

    observeContacts(fog, [sighting(3, 20, 20)], 12);

    expect(fog.contacts).toEqual([]);
  });

  it('keeps the last place it saw a contact, after the contact marches out of view', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [EYE]);
    observeContacts(fog, [sighting(3, 49, 48)], 12);

    // The enemy walks away — the rules can see where it is, and the Faction cannot.
    refreshVision(fog, MAP, [EYE]);
    observeContacts(fog, [sighting(3, 51, 50)], 13);
    refreshVision(fog, MAP, [eyeOf({ x: 10, y: 10 }, 2)]);
    observeContacts(fog, [sighting(3, 80, 80)], 14);

    // Memory is the tile it was last observed on, and not where it is now.
    expect(fog.contacts).toEqual([{ id: 3, kind: 1, x: 51, y: 50, seen: 13 }]);
  });

  it('keeps one contact per id, in id order, whatever order the sightings arrive in', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [EYE]);

    observeContacts(fog, [sighting(9, 46, 48), sighting(2, 47, 48), sighting(5, 48, 48)], 3);
    observeContacts(fog, [sighting(9, 46, 49), sighting(2, 47, 49)], 4);

    expect(fog.contacts.map((contact) => contact.id)).toEqual([2, 5, 9]);
    expect(fog.contacts).toEqual([
      { id: 2, kind: 1, x: 47, y: 49, seen: 4 },
      { id: 5, kind: 1, x: 48, y: 48, seen: 3 },
      { id: 9, kind: 1, x: 46, y: 49, seen: 4 },
    ]);
  });

  it('forgets the contacts a rule says are gone, and keeps the rest', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [EYE]);
    observeContacts(fog, [sighting(2, 47, 48), sighting(5, 48, 48)], 3);

    forgetContacts(fog, [5]);

    expect(fog.contacts.map((contact) => contact.id)).toEqual([2]);
  });
});

describe('the inspection mode, which is for looking and not for playing', () => {
  it('reveals the whole theatre: every tile seen, and the terrain that is really there', () => {
    const view = inspectionView(MAP);

    expect(knows(view, 0, 0)).toBe(KNOWLEDGE.visible);
    expect(knows(view, MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe(KNOWLEDGE.visible);
    expect(believedTerrain(view, 0, 0)).toBe(terrainAt(MAP, 0, 0));
    expect(believedTerrain(view, MAP_WIDTH - 1, MAP_HEIGHT - 1)).toBe(terrainAt(MAP, MAP_WIDTH - 1, MAP_HEIGHT - 1));
    expect(view.contacts).toEqual([]);
  });

  it('sees every contact a rule hands it, because it is the whole world', () => {
    const contact = { id: 3, kind: 1, x: 20, y: 20, seen: 4 };

    expect(inspectionView(MAP, [contact]).contacts).toEqual([contact]);
  });

  it('answers with a copy of the theatre rather than a grip on it', () => {
    const before = terrainAt(MAP, 3, 4);
    const view = inspectionView(MAP);

    view.terrain[tileIndex(3, 4)] = UNSEEN;

    expect(believedTerrain(view, 3, 4)).toBe(null);
    expect(terrainAt(MAP, 3, 4)).toBe(before);
    expect(view.terrain).not.toBe(MAP.terrain);
  });

  it('is not a Player and cannot emit a Command: it has no decide', () => {
    const view = inspectionView(MAP);

    expect(Object.keys(view).sort()).toEqual(['contacts', 'terrain', 'visible']);
    expect('decide' in view).toBe(false);

    // @ts-expect-error — an inspection view is not a Controller: the whole map comes with no way to act on it
    const asController: Controller<FogView> = view;
    // @ts-expect-error — and so it is not a Player either: a Player is a Faction and a Controller
    const asPlayer: Player<FogView> = { faction: 'rome', controller: view };

    // The proof is the two compile errors above; these lines only keep the values used.
    expect(asController).toBe(view);
    expect(asPlayer.controller).toBe(view);
  });
});

describe('the view a Controller may read', () => {
  it('carries the memory, what is in view and the contacts, and nothing else', () => {
    const fog = createFog();
    refreshVision(fog, MAP, [eyeOf({ x: 48, y: 48 }, 5)]);
    observeContacts(fog, [{ id: 1, kind: 1, x: 47, y: 48 }], 6);

    const view = viewOf(fog);

    expect(Object.keys(view).sort()).toEqual(['contacts', 'terrain', 'visible']);
    expect(knows(view, 48, 48)).toBe(KNOWLEDGE.visible);
    expect(believedTerrain(view, 48, 48)).toBe(terrainAt(MAP, 48, 48));
    // The contacts a Controller may read are the ones the Faction remembers.
    expect(view.contacts).toEqual([{ id: 1, kind: 1, x: 47, y: 48, seen: 6 }]);
    // A view is plain data the driver can carry: a clone of it is the same view.
    expect(structuredClone(view)).toEqual(view);
  });
});
