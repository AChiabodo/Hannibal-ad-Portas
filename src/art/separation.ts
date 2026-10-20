/**
 * The separation specimens: one soldier standing on each terrain (ticket U5).
 *
 * U5's subject is *figure and ground* — in the sense the trade uses the pair for a
 * picture, not another word for Terrain, which GLOSSARY.md keeps as *Terrain*: the
 * terrain has to stop competing with the men and the markers standing on it, and that
 * is a judgement about a picture. The
 * Atelier is where this project judges pictures (ADR-0002, PLAN §3), so the plate
 * carries a specimen per terrain: three tiles of that material, tiled edge to edge
 * exactly as the map tiles it, with one soldier of each Faction standing on the
 * middle tile. Two rows and a column per material is enough to answer the only
 * question that matters — *is the man the thing I see first?* — and it is the same
 * pixels the game draws, composed through the same `PixelBuffer`.
 *
 * Three tiles rather than one on purpose. The complaint U5 answers is about
 * *repeated* detail, and a single tile cannot show repetition: a texture that
 * reads well once can still turn a field into a grid. Twenty-one specimens on the
 * plate are what makes the repetition visible beside the soldier it competes with.
 *
 * A specimen is a drawing, not a second renderer: it is the material's own tile
 * blitted three times a side and the roster's own figure blitted over it. Nothing
 * here knows about the theatre, the fog, the camera or the rules, so a specimen can
 * be generated, hashed and compared in Node (ADR-0002), and the Atelier draws it
 * through the same adapter as everything else.
 */

import {
  FIGURE_FACTIONS,
  FIGURE_HEIGHT,
  FIGURE_WIDTH,
  soldier,
  type FigureFaction,
  type FigureName,
} from './figures.ts';
import { blit, createPixelBuffer, type PixelBuffer } from './pixel-buffer.ts';
import { MATERIALS, TERRAIN_TILE, materialTile, type TerrainMaterial } from './terrain.ts';

/**
 * How many tiles of terrain a specimen shows, on each side.
 *
 * Three, so the middle tile has a neighbour on every side and the material's
 * repetition is visible; an odd number, so there is a middle tile for the man to
 * stand on and the specimen has no ambiguity about where the centre is.
 */
export const SEPARATION_TILES = 3;

/** The side of a specimen, in pixels: three tiles. */
export const SEPARATION_SIZE = SEPARATION_TILES * TERRAIN_TILE;

/**
 * The figure that stands for each Faction on the plate.
 *
 * One per side and not a roster: the specimen answers a question about contrast,
 * and a soldier of each Faction is enough to show that neither cloth dissolves into
 * the ground — Rome's blood-red line and Carthage's pale one are the two cases the
 * palette has to survive. The full rosters keep their own rows on the plate.
 */
export const SEPARATION_FIGURES: Readonly<Record<FigureFaction, FigureName>> = {
  rome: 'hastati',
  carthage: 'libyan-spear',
};

/** The two Factions, in the order the section's rows are drawn. */
export const SEPARATION_FACTIONS: readonly FigureFaction[] = FIGURE_FACTIONS;

/** The terrains a specimen is drawn on: every material the theatre has. */
export const SEPARATION_MATERIALS: readonly TerrainMaterial[] = MATERIALS;

/** The frame every specimen's soldier stands in: a man at rest, which is what a map shows most of the time. */
const STANDING = { action: 'idle', step: 0 } as const;

/** Where the soldier stands: the middle tile of the patch, centred on it. */
const FIGURE_AT = {
  x: Math.floor(SEPARATION_TILES / 2) * TERRAIN_TILE + Math.floor((TERRAIN_TILE - FIGURE_WIDTH) / 2),
  y: Math.floor(SEPARATION_TILES / 2) * TERRAIN_TILE + Math.floor((TERRAIN_TILE - FIGURE_HEIGHT) / 2),
} as const;

/** The material patches already composed, one per material: the plate asks for each twice. */
const PATCHES = new Map<TerrainMaterial, PixelBuffer>();

/**
 * Three tiles of one material, tiled edge to edge.
 *
 * The tile is copied, never stretched: a specimen is the map's own terrain, so what
 * a reviewer judges on the plate is what a Player marches over. The repetition is
 * the point of showing more than one tile, and it is honest — the map repeats a
 * material's tile at exactly this period.
 */
export function materialPatch(material: TerrainMaterial): PixelBuffer {
  const cached = PATCHES.get(material);
  if (cached !== undefined) return cached;

  const patch = createPixelBuffer(SEPARATION_SIZE, SEPARATION_SIZE);
  const tile = materialTile(material);

  for (let row = 0; row < SEPARATION_TILES; row += 1) {
    for (let column = 0; column < SEPARATION_TILES; column += 1) {
      blit(patch, tile, column * TERRAIN_TILE, row * TERRAIN_TILE);
    }
  }

  PATCHES.set(material, patch);
  return patch;
}

/** The specimens already composed, keyed by material and Faction: the plate asks for each once. */
const SPECIMENS = new Map<string, PixelBuffer>();

/**
 * One specimen: a terrain, and the soldier of one Faction standing on it.
 *
 * Pure and memoised like every other generator in the library: the same terrain and
 * Faction always produce the same picture, which is what lets it be hashed, baked
 * and compared with the browser's rendering of it.
 */
export function separationSpecimen(material: TerrainMaterial, faction: FigureFaction): PixelBuffer {
  const key = `${material}:${faction}`;
  const cached = SPECIMENS.get(key);
  if (cached !== undefined) return cached;

  const specimen = createPixelBuffer(SEPARATION_SIZE, SEPARATION_SIZE);
  blit(specimen, materialPatch(material), 0, 0);
  blit(specimen, soldier(SEPARATION_FIGURES[faction], 'south', STANDING, faction), FIGURE_AT.x, FIGURE_AT.y);

  SPECIMENS.set(key, specimen);
  return specimen;
}

/**
 * Every specimen, named for the catalogue: `separation:rome:forest`.
 *
 * Faction first, because the plate has one row per Faction and the name should read
 * the way the row does.
 */
export function separationEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return SEPARATION_FACTIONS.flatMap((faction) =>
    SEPARATION_MATERIALS.map((material) => ({
      name: `separation:${faction}:${material}`,
      buffer: separationSpecimen(material, faction),
    })),
  );
}
