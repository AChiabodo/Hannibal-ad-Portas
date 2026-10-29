/**
 * The map dump: what `--map` prints, and that it prints the map (ticket B1).
 *
 * The dump is the only way to look at a theatre without a browser, and B3 — the
 * ticket that draws one — is a wave away. So it is asserted like anything else
 * a reader relies on: the grid is read back and compared, tile for tile, with
 * the `MapGrid` the same seed generates, and the header is asserted to say the
 * things a reader cannot count for themselves.
 */
import { describe, expect, it } from 'vitest';
import { formatMap, formatMapGrid } from '../../src/cli/dump';
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  TERRAIN,
  generateMap,
  halfOf,
  tileIndex,
  type MapGrid,
} from '../../src/sim/map';

/** The seed the dump is read from, so a failure names the same map every time. */
const SEED = 7;

/** How the dump is expected to draw a terrain. Spelled out here: this is the spec, not a mirror. */
const TERRAIN_GLYPHS: Readonly<Record<number, string>> = {
  [TERRAIN.plain]: '.',
  [TERRAIN.hill]: '^',
  [TERRAIN.forest]: 'f',
  [TERRAIN.farmland]: ',',
  [TERRAIN.river]: '~',
  [TERRAIN.ford]: '=',
  [TERRAIN.road]: '-',
  [TERRAIN.lake]: 'O',
  [TERRAIN.marsh]: '%',
};

/** How the dump is expected to draw a resource node of each kind. */
const RESOURCE_GLYPHS: Readonly<Record<number, string>> = {
  [RESOURCE.grain]: 'g',
  [RESOURCE.timber]: 't',
  [RESOURCE.stone]: 's',
  [RESOURCE.iron]: 'i',
};

/** The grid rows of a dump: the `MAP_HEIGHT` lines under the ruler. */
function gridRows(dump: string): string[] {
  const lines = dump.split('\n');
  const ruler = lines.findIndex((line) => line.startsWith('   0123456789'));
  if (ruler < 0) throw new Error('the dump has no ruler over the grid');

  return lines.slice(ruler + 1, ruler + 1 + MAP_HEIGHT);
}

/** The grid the dump should draw for a map, built from the map itself. */
function expectedRows(map: MapGrid): string[] {
  const cells = Array.from(map.terrain, (ground) => TERRAIN_GLYPHS[ground] ?? '?');

  for (const site of map.settlements) cells[tileIndex(site.x, site.y)] = 'o';
  for (const node of map.resources) cells[tileIndex(node.x, node.y)] = RESOURCE_GLYPHS[node.kind] ?? '?';

  const [rome, carthage] = map.strongholds;
  cells[tileIndex(rome.x, rome.y)] = 'R';
  cells[tileIndex(carthage.x, carthage.y)] = 'C';

  const rows: string[] = [];
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    rows.push(`${String(y).padStart(2, ' ')} ${cells.slice(y * MAP_WIDTH, (y + 1) * MAP_WIDTH).join('')}`);
  }

  return rows;
}

describe('a generated map, written out for inspection', () => {
  it('draws exactly the map the seed generates, tile for tile', () => {
    expect(gridRows(formatMap(SEED))).toEqual(expectedRows(generateMap(SEED)));
  });

  it('says which seed it is, how big the map is, and where the two Strongholds stand', () => {
    const dump = formatMap(SEED);
    const [rome, carthage] = generateMap(SEED).strongholds;

    expect(dump).toContain(`seed ${String(SEED)}`);
    expect(dump).toContain(`${String(MAP_WIDTH)}×${String(MAP_HEIGHT)} tiles`);
    expect(dump).toContain(`Rome's Stronghold at (${String(rome.x)}, ${String(rome.y)})`);
    expect(dump).toContain(`Carthage's at (${String(carthage.x)}, ${String(carthage.y)})`);
  });

  it('says how many settlements there are, and what each river carries', () => {
    const map = generateMap(SEED);
    const dump = formatMap(SEED);
    const fords = map.rivers.map(
      (river) => river.tiles.filter((tile) => map.terrain[tile] === TERRAIN.ford).length,
    );

    expect(dump).toContain(`${String(map.settlements.length)} minor settlements`);
    expect(dump).toContain(`carrying ${fords.join(' and ')} fords`);
  });

  it('counts a ford tile once even when the river path revisits it', () => {
    const base = generateMap(SEED);
    const terrain = new Uint8Array(base.terrain.length).fill(TERRAIN.plain);
    const ford = tileIndex(20, 20);
    const river = tileIndex(20, 19);
    terrain[ford] = TERRAIN.ford;
    terrain[river] = TERRAIN.river;
    const map = { ...base, terrain, rivers: [{ tiles: [ford, river, ford] }] };
    expect(formatMapGrid(SEED, map)).toContain('carrying 1 fords');
  });

  it('names every terrain and every resource in its legend, so a glyph can be read', () => {
    const dump = formatMap(SEED);

    for (const word of ['plain', 'hill', 'forest', 'farmland', 'river', 'ford', 'road', 'lake', 'marsh']) {
      expect(dump).toContain(word);
    }
    for (const word of ['grain', 'timber', 'stone', 'iron']) {
      expect(dump).toContain(word);
    }

    // Every glyph the grid can draw is in the key, beside the word it stands for:
    // a picture whose legend has drifted from it is worse than no legend.
    for (const [terrain, glyph] of Object.entries(TERRAIN_GLYPHS)) {
      expect(dump).toContain(
        `${glyph} ${['plain', 'hill', 'forest', 'farmland', 'river', 'ford', 'road', 'lake', 'marsh'][Number(terrain)] ?? ''}`,
      );
    }
    for (const [kind, glyph] of Object.entries(RESOURCE_GLYPHS)) {
      expect(dump).toContain(`${glyph} ${['grain', 'timber', 'stone', 'iron'][Number(kind)] ?? ''}`);
    }
  });

  it('prints the resource totals the map really holds, half by half', () => {
    const map = generateMap(SEED);
    const dump = formatMap(SEED);
    const totals = totalsOf(map);

    expect(dump).toContain(`Rome      ${totals[0] ?? ''}`);
    expect(dump).toContain(`Carthage  ${totals[1] ?? ''}`);
  });

  it('is the same bytes for the same seed, and another map for another seed', () => {
    expect(formatMap(SEED)).toBe(formatMap(SEED));
    expect(formatMap(SEED)).not.toBe(formatMap(SEED + 1));
  });

  it('is a map and not a Match report, so a reader can tell the two apart', () => {
    expect(formatMap(SEED)).not.toContain('"hash"');
    expect(formatMap(SEED).endsWith('\n')).toBe(true);
  });
});

/**
 * The totals the dump should print, added up here rather than asked of `map.ts`.
 *
 * The dump prints `resourceTotals` from the module under the grid; a test that
 * read the expected numbers back through that same function would agree with it
 * whatever it did. This is the arithmetic written out a second time, so the dump
 * and the query have to be right together.
 */
function totalsOf(map: MapGrid): readonly string[] {
  const names = ['grain', 'timber', 'stone', 'iron'];
  const amounts: number[][] = [names.map(() => 0), names.map(() => 0)];

  for (const node of map.resources) {
    const totals = amounts[halfOf(map, node.x, node.y)];
    if (totals === undefined) continue;

    totals[node.kind] = (totals[node.kind] ?? 0) + node.amount;
  }

  return amounts.map((totals) =>
    names.map((name, kind) => `${name} ${String(totals[kind] ?? 0)}`).join(', '),
  );
}
