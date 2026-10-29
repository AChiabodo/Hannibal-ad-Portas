/**
 * The map a seed generates, written out as text, for inspection.
 *
 * `npm run match -- --seed 7 --map` prints this and plays nothing. B1's last
 * acceptance criterion is exactly that — "a generated map can be dumped from
 * the CLI for inspection without a browser" — and it is the honest one: the
 * browser does not arrive until B3, and a map whose fairness is asserted rather
 * than seen needs a way to be looked at. So the inspection is a grid to read
 * and a summary of the numbers the fairness contract is made of: where the
 * Strongholds stand, how many settlements there are, what each river carries
 * for fords, and how the resources fall between the two halves.
 *
 * Nothing here decides anything, and nothing here is a second opinion about the
 * map: the dump reads the `MapGrid` the seed generates and writes it down. It
 * is byte-stable for a seed, so two runs can be diffed and a change to the
 * generator is visible as a change to the picture — and, like the CLI's report,
 * it holds no timing, no path and no wall clock.
 *
 * The one floating-point value in the file is the distance between the two
 * Strongholds, and it is display only: it is derived from an integer, it never
 * reaches state or the hash, and a reader wants "74 tiles apart" rather than
 * "5476 tiles apart squared" (ADR-0006 permits derived floats; it forbids them
 * in state).
 */
import {
  generateMap,
  MAP_HEIGHT,
  MAP_WIDTH,
  RESOURCE,
  RESOURCE_KINDS,
  resourceTotals,
  TERRAIN,
  TILE_COUNT,
  TILE_SIZE,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type ResourceKind,
  type ResourceTotals,
  type Site,
  type Terrain,
} from '../sim/index.ts';

/** The glyph each terrain is drawn as. */
const TERRAIN_GLYPHS: Readonly<Record<Terrain, string>> = {
  [TERRAIN.plain]: '.',
  [TERRAIN.hill]: '^',
  [TERRAIN.forest]: 'f',
  [TERRAIN.farmland]: ',',
  [TERRAIN.river]: '~',
  [TERRAIN.ford]: '=',
  [TERRAIN.road]: '-',
  [TERRAIN.lake]: 'O',
  [TERRAIN.marsh]: '%',
  [TERRAIN.bridge]: '#',
};

/** The glyph a resource node of each kind is drawn as. */
const RESOURCE_GLYPHS: Readonly<Record<ResourceKind, string>> = {
  [RESOURCE.grain]: 'g',
  [RESOURCE.timber]: 't',
  [RESOURCE.stone]: 's',
  [RESOURCE.iron]: 'i',
};

/** The word each resource is named by in the summary. */
const RESOURCE_NAMES: Readonly<Record<ResourceKind, string>> = {
  [RESOURCE.grain]: 'grain',
  [RESOURCE.timber]: 'timber',
  [RESOURCE.stone]: 'stone',
  [RESOURCE.iron]: 'iron',
};

/** The glyph Rome's and Carthage's Strongholds are drawn as, in `FACTIONS`' order. */
const STRONGHOLD_GLYPHS: readonly [string, string] = ['R', 'C'];

/** The glyph a minor settlement is drawn as. */
const SETTLEMENT_GLYPH = 'o';

/** The word each terrain is named by in the legend. */
const TERRAIN_NAMES: Readonly<Record<Terrain, string>> = {
  [TERRAIN.plain]: 'plain',
  [TERRAIN.hill]: 'hill',
  [TERRAIN.forest]: 'forest',
  [TERRAIN.farmland]: 'farmland',
  [TERRAIN.river]: 'river',
  [TERRAIN.ford]: 'ford',
  [TERRAIN.road]: 'road',
  [TERRAIN.lake]: 'lake',
  [TERRAIN.marsh]: 'marsh',
  [TERRAIN.bridge]: 'bridge',
};

/** The terrains in the order the legend lists them: the ground first, then the water and the ways. */
const TERRAIN_ORDER: readonly Terrain[] = [
  TERRAIN.plain,
  TERRAIN.hill,
  TERRAIN.forest,
  TERRAIN.farmland,
  TERRAIN.river,
  TERRAIN.ford,
  TERRAIN.road,
  TERRAIN.lake,
  TERRAIN.marsh,
  TERRAIN.bridge,
];

/**
 * What the grid's glyphs mean.
 *
 * Built from the very tables the grid is drawn from, so the legend cannot drift
 * from the picture: a glyph that is changed above is changed here, and a terrain
 * or a resource added above cannot be left out of the key a reader needs.
 */
const LEGEND: readonly string[] = [
  `legend: ${TERRAIN_ORDER.map((terrain) => `${TERRAIN_GLYPHS[terrain]} ${TERRAIN_NAMES[terrain]}`).join('   ')}`,
  `        ${STRONGHOLD_GLYPHS[0]} Rome's Stronghold   ${STRONGHOLD_GLYPHS[1]} Carthage's Stronghold   ` +
    `${SETTLEMENT_GLYPH} minor settlement`,
  `        ${RESOURCE_KINDS.map((kind) => `${RESOURCE_GLYPHS[kind]} ${RESOURCE_NAMES[kind]}`).join('   ')}`,
];

/**
 * The map a seed generates, as the text the command prints.
 *
 * A header of numbers, the grid itself, and the legend: in that order, because
 * a reader who scrolled past the header still has the picture, and one who wants
 * no more than the picture can stop at the legend. The trailing newline is the
 * command's, so the shell prompt never lands on the last row of the map.
 */
export function formatMap(seed: number): string {
  const map = generateMap(seed);
  const lines = [
    `seed ${String(seed)} — ${String(MAP_WIDTH)}×${String(MAP_HEIGHT)} tiles of ` +
      `${String(TILE_SIZE)}×${String(TILE_SIZE)} pixels`,
    '',
    ...summary(map),
    '',
    ...grid(map),
    '',
    ...LEGEND,
  ];

  return `${lines.join('\n')}\n`;
}

/** Where the Strongholds and settlements stand, what the rivers carry, how the halves fall. */
function summary(map: MapGrid): string[] {
  const [rome, carthage] = map.strongholds;
  const fords = map.rivers.map(
    (river) => new Set(river.tiles.filter((tile) => terrainAt(map, tileX(tile), tileY(tile)) === TERRAIN.ford)).size,
  );
  const riverWord = map.rivers.length === 1 ? 'river' : 'rivers';
  const settlementWord = map.settlements.length === 1 ? 'minor settlement' : 'minor settlements';
  const [romeHalf, carthageHalf] = resourceTotals(map);

  return [
    `Rome's Stronghold at (${String(rome.x)}, ${String(rome.y)}); Carthage's at ` +
      `(${String(carthage.x)}, ${String(carthage.y)}); ${String(tilesApart(rome, carthage))} tiles apart`,
    `${String(map.settlements.length)} ${settlementWord} · ${String(map.rivers.length)} ${riverWord}, ` +
      `carrying ${fords.join(' and ')} fords`,
    '',
    "resources, Rome's half against Carthage's — the two sides of the line between the Strongholds:",
    `  Rome      ${describeTotals(romeHalf)}`,
    `  Carthage  ${describeTotals(carthageHalf)}`,
  ];
}

/** The grid: a ruler across the top, a row number down the side, a glyph per tile. */
function grid(map: MapGrid): string[] {
  const cells = new Array<string>(TILE_COUNT);
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      cells[tileIndex(x, y)] = TERRAIN_GLYPHS[terrainAt(map, x, y)];
    }
  }

  for (const site of map.settlements) cells[tileIndex(site.x, site.y)] = SETTLEMENT_GLYPH;
  for (const node of map.resources) cells[tileIndex(node.x, node.y)] = RESOURCE_GLYPHS[node.kind];

  const [rome, carthage] = map.strongholds;
  const [romeGlyph, carthageGlyph] = STRONGHOLD_GLYPHS;
  cells[tileIndex(rome.x, rome.y)] = romeGlyph;
  cells[tileIndex(carthage.x, carthage.y)] = carthageGlyph;

  const rows = [`   ${'0123456789'.repeat(10).slice(0, MAP_WIDTH)}`];
  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    const row = cells.slice(y * MAP_WIDTH, (y + 1) * MAP_WIDTH).join('');
    rows.push(`${String(y).padStart(2, ' ')} ${row}`);
  }

  return rows;
}

/** One half's totals, as `grain 66, timber 48, …`. */
function describeTotals(totals: ResourceTotals): string {
  return RESOURCE_KINDS.map((kind) => `${RESOURCE_NAMES[kind]} ${String(totals[kind])}`).join(', ');
}

/** How many tiles apart two sites are, for a reader: the floor, so it never overstates. */
function tilesApart(from: Site, to: Site): number {
  const dx = from.x - to.x;
  const dy = from.y - to.y;

  return Math.floor(Math.sqrt(dx * dx + dy * dy));
}
