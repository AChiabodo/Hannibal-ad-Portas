/**
 * The fixtures the economy's tests build on: a theatre with nothing on it and a
 * settlement to stand there.
 *
 * A hand-built map rather than `generateMap`'s, because the unit tests are about
 * *what an allocation does*, and a seed's hills and rivers are noise in the
 * middle of that. The integration tests use a generated map, which is where the
 * land's real reach is exercised.
 */
import { buildingCode, squadTypeCode } from '../../src/content';
import {
  TILE_COUNT,
  TERRAIN,
  type MapGrid,
  type ResourceNode,
  type Site,
} from '../../src/sim/map';
import type { Settlement } from '../../src/sim/economy';

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
