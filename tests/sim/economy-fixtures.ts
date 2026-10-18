/**
 * The fixtures the economy's tests build on: a theatre with nothing on it and a
 * settlement to stand there.
 *
 * A hand-built map rather than `generateMap`'s, because the unit tests are about
 * *what an allocation does*, and a seed's hills and rivers are noise in the
 * middle of that. The integration tests use a generated map, which is where the
 * land's real reach is exercised.
 */
import { buildingCode, squadTypeCode, squadTypeOf } from '../../src/content';
import {
  TILE_COUNT,
  TERRAIN,
  type MapGrid,
  type ResourceNode,
  type Site,
} from '../../src/sim/map';
import type { Settlement } from '../../src/sim/economy';
import { standingAt, type Block } from '../../src/sim/squad';

/** A theatre of plain tiles, with only what a test asks for on it. */
export function testMap(
  options: {
    readonly strongholds?: readonly [Site, Site];
    readonly settlements?: readonly Site[];
    readonly resources?: readonly ResourceNode[];
    /** Where the terrain is not plain: a tile index to a `TERRAIN` code. */
    readonly paint?: Readonly<Record<number, number>>;
  } = {},
): MapGrid {
  const terrain = new Uint8Array(TILE_COUNT);
  terrain.fill(TERRAIN.plain);

  for (const [index, code] of Object.entries(options.paint ?? {})) {
    terrain[Number(index)] = code;
  }

  return {
    terrain,
    strongholds: options.strongholds ?? [
      { x: 10, y: 10 },
      { x: 85, y: 85 },
    ],
    settlements: options.settlements ?? [],
    rivers: [],
    resources: options.resources ?? [],
    roads: [],
  };
}

/**
 * Rome's Stronghold, and Carthage's, on the hand-built stages a test paints: far
 * enough apart that each Faction's Territory is its own, with wilderness between
 * them to be cut off in (C6).
 */
export const ROME: Site = { x: 10, y: 10 };
export const CARTHAGE: Site = { x: 70, y: 10 };

/**
 * The stage the economy's and Territory's tests share: both Strongholds on plain
 * ground, and whatever settlements the test asks for.
 */
export function strongholdStage(sites: readonly Site[] = []): MapGrid {
  return testMap({ strongholds: [ROME, CARTHAGE], settlements: sites });
}

/** A settlement a test can shape field by field, with the defaults the rules open one on. */
export function testSettlement(overrides: Partial<Settlement> = {}): Settlement {
  return {
    id: 0,
    x: 10,
    y: 10,
    owner: 0,
    tier: 1,
    population: 10,
    stocks: [0, 0, 0, 0],
    works: [],
    ...overrides,
  };
}

/** The work `building` in a settlement, standing or still counting down. */
export function work(id: string, remaining = 0) {
  return { building: buildingId(id), remaining };
}

/** The code a building id names, refused loudly so a typo in a test is not a silent zero. */
export function buildingId(id: string): number {
  const code = buildingCode(id);
  if (code === undefined) throw new Error(`no building is named ${id}`);

  return code;
}

/** The code a Squad type id names, refused loudly for the same reason. */
export function squadTypeId(id: string): number {
  const code = squadTypeCode(id);
  if (code === undefined) throw new Error(`no Squad type is named ${id}`);

  return code;
}

/**
 * The block a Squad stands as in a test: on a tile, at its type's full strength.
 *
 * The economy's tests are about Payroll and desertion and mostly do not care
 * where a Squad is, but a Squad is one entity now (C1) and one cannot be built
 * without a place to stand. C1's own tests place theirs where the test needs
 * them; this is the fixture for the ones that do not care.
 */
export function blockOf(id: string, x = 0, y = 0): Block {
  const type = squadTypeOf(squadTypeId(id));
  if (type === undefined) throw new Error(`no Squad type is named ${id}`);

  return standingAt(x, y, type.strength);
}
