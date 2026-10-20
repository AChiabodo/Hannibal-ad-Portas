/**
 * Where a settlement is drawn, and what it is drawn as (ticket U6).
 *
 * Two questions, and both are about one declaration rather than about pixels:
 *
 * - **geometry**: the rectangle a place occupies is its art centred on the tile it
 *   stands on, and its depth is the tile row — so the layer that draws it, the click
 *   that picks it and the theatre's own coordinates cannot disagree.
 * - **condition**: every wall, the gate and the ram come from the front the
 *   Observation carries, and the thresholds are the rules' own (`WALL_HP`,
 *   `GATE_HP`). A place that is only remembered carries none of it.
 */
import { describe, expect, it } from 'vitest';
import { SITE_SIZE } from '../../src/art/settlements';
import { TILE_SIZE } from '../../src/sim/map';
import { GATE_HP, WALL_HP, type VisibleFront, type VisibleStructure } from '../../src/sim/siege';
import type { KnownSite } from '../../src/ui/sites';
import { siteDepth, siteLook, siteRect } from '../../src/render/settlements';
import { tilePixel } from '../../src/render/terrain';

/** One structure of a fortification, at the hit points a test wants it at. */
function structure(kind: VisibleStructure['kind'], side: VisibleStructure['side'], hp: number): VisibleStructure {
  return { kind, side, hp, standing: hp > 0 };
}

/** A walled front with every structure whole, unless a test says otherwise. */
function front(over: Partial<VisibleFront> = {}): VisibleFront {
  return {
    settlement: 1,
    structures: [
      structure('gate', 'east', GATE_HP),
      structure('wall', 'north', WALL_HP),
      structure('wall', 'east', WALL_HP),
      structure('wall', 'south', WALL_HP),
      structure('wall', 'west', WALL_HP),
    ],
    breached: false,
    siege: null,
    besieger: null,
    ram: null,
    hold: 0,
    garrison: 0,
    ...over,
  };
}

/** A place the Faction knows, as `ui/sites.ts` would read it. */
function known(over: Partial<KnownSite> = {}): KnownSite {
  return { id: 1, kind: 'stronghold', x: 20, y: 30, owner: 'rome', memory: 'seen', front: front(), ...over };
}

describe('where a place is drawn', () => {
  it('draws the art centred on the tile the place stands on', () => {
    for (const kind of ['settlement', 'stronghold'] as const) {
      const place = known({ kind });
      const rect = siteRect(place);
      const corner = tilePixel(place.x, place.y);
      const size = SITE_SIZE[kind];

      expect(rect.width).toBe(size);
      expect(rect.height).toBe(size);
      // The middle of the rectangle is the middle of the tile.
      expect(rect.x + Math.floor(size / 2)).toBe(corner.x + Math.floor(TILE_SIZE / 2));
      expect(rect.y + Math.floor(size / 2)).toBe(corner.y + Math.floor(TILE_SIZE / 2));
    }
  });

  it('draws a village smaller than a Stronghold, and both where they stand', () => {
    const village = siteRect(known({ kind: 'settlement' }));
    const town = siteRect(known());

    expect(village.width).toBeLessThan(town.width);
    expect(siteRect(known({ x: 21 })).x).toBe(town.x + TILE_SIZE);
    expect(siteRect(known({ y: 31 })).y).toBe(town.y + TILE_SIZE);
  });

  it('sorts by the tile row, so the place further down the screen is in front', () => {
    expect(siteDepth(known({ y: 30 }))).toBe(30);
    expect(siteDepth(known({ y: 31 }))).toBeGreaterThan(siteDepth(known({ y: 30 })));
  });
});

describe('what a place is drawn as', () => {
  it('reads its owner and its four walls out of the front, at the rules’ own thresholds', () => {
    const look = siteLook(known({
      owner: 'carthage',
      front: front({
        structures: [
          structure('gate', 'west', GATE_HP),
          structure('wall', 'north', WALL_HP - 1),
          structure('wall', 'east', 0),
          structure('wall', 'south', WALL_HP),
          structure('wall', 'west', WALL_HP),
        ],
      }),
    }));

    expect(look.kind).toBe('stronghold');
    expect(look.owner).toBe('carthage');
    expect(look.memory).toBe('seen');
    // A gate on the west turns the town, so a Player can find the side the ram is
    // aimed at.
    expect(look.gateSide).toBe('west');
    expect(look.gate).toBe('intact');
    expect(look.walls).toEqual({ north: 'damaged', east: 'breached', south: 'intact', west: 'intact' });
    expect(look.ram).toBe('none');
  });

  it('draws the ram the front reports, and none where there is none', () => {
    expect(siteLook(known({ front: front({ ram: { hp: 20, remaining: 30, built: false } }) })).ram).toBe('building');
    expect(siteLook(known({ front: front({ ram: { hp: 60, remaining: 0, built: true } }) })).ram).toBe('built');
    expect(siteLook(known({ front: front() })).ram).toBe('none');
  });

  it('draws an open settlement as an open settlement: no walls, no gate, no ram', () => {
    const look = siteLook(known({ kind: 'settlement', owner: null, front: null }));

    expect(look.kind).toBe('settlement');
    expect(look.owner).toBe('none');
    expect(look.gate).toBeNull();
    expect(look.ram).toBe('none');
  });

  it('claims nothing for a place that is only remembered', () => {
    // Even handed a front — which `ui/sites.ts` never does for a remembered place —
    // memory must not become a condition: a place remembered is drawn as a place.
    const remembered = siteLook(known({
      memory: 'remembered',
      front: front({ structures: [structure('gate', 'north', 0), structure('wall', 'north', 0)], ram: { hp: 0, remaining: 0, built: true } }),
    }));

    expect(remembered.memory).toBe('remembered');
    expect(remembered.owner).toBe('none');
    expect(remembered.gate).toBeNull();
    expect(remembered.ram).toBe('none');
    expect(remembered.walls).toEqual({ north: 'intact', east: 'intact', south: 'intact', west: 'intact' });
  });

  it('draws a Stronghold with no front as a walled place with nothing known against it', () => {
    const look = siteLook(known({ front: null }));

    expect(look.owner).toBe('rome');
    expect(look.gate).toBeNull();
    expect(look.walls).toEqual({ north: 'intact', east: 'intact', south: 'intact', west: 'intact' });
  });
});
