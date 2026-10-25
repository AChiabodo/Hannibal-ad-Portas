/**
 * The catalogue: every artefact B2 and B3 generate, and the one plate the
 * Atelier shows.
 *
 * The Atelier's job is to make generated art inspectable — by a human, and by an
 * agent that would otherwise guess at pixels from source (ADR-0002). For that to
 * mean anything there has to be *one* place that says what the catalogue is, and
 * it has to be data plus pixels rather than a page: this module is that place,
 * and `cataloguePlate()` composes the whole thing into a single `PixelBuffer`,
 * which is what the page renders at its several zoom levels.
 *
 * Every entry is named and is itself a `PixelBuffer`, so a caller that wants to
 * look at one glyph, one ramp or one terrain variant has one to look at — a
 * test, a bake step or an agent inspecting a single sprite. Names are stable and
 * machine-readable: `glyph:U+00E0`, `ramp:bronze` and `terrain:forest:13`, which
 * is what a diff between two builds of the catalogue should be written in.
 *
 * Three sections, and each is laid out from what it holds rather than from a
 * number someone maintains beside it:
 *
 * - **glyphs**, the whole font, in a grid;
 * - **ramps**, the shades of each base, as strips;
 * - **terrain**, the ground of B3: every material's own tile, then one row per
 *   material of its sixteen dual-grid variants, and then the sixteen road
 *   connections. A row shows its material against the ground it crosses, which is
 * - **nodes**, the four resource markers B3 stands on that ground;
 * - **separation**, a soldier standing on each terrain (U5): three tiles of every material
 *   with one man of each Faction standing on the middle one, which is where a
 *   judgement about figure and ground can be made;
 * - **figures**, the soldiers of C2: one row per soldier and direction, one
 *   column per animation frame — the whole Roman roster, in the four ways it can
 *   face and the four things it can do;
 * - **icons**, the command card and the badges the panels read figures with
 *   (#55): one row of verbs and one row of costs, so the pictures a Player
 *   presses can be judged beside everything else the library draws;
 * - **settlements**, the places on the theatre (#57): a village of each Faction,
 *   an unclaimed one, the Stronghold whole, hurt and breached, the ram at its
 *   gate, and the same places as they are *remembered* — which is the section a
 *   reviewer judges "can I tell a town from a village, a wall from a breach, and
 *   a place in sight from a place in memory" on.
 */

import {
  FIGURE_FACINGS,
  FIGURE_FACTIONS,
  FIGURE_FRAMES,
  FIGURE_HEIGHT,
  FIGURE_NAMES,
  FIGURE_WIDTH,
  INSIGNIA_HEIGHT,
  figureEntries,
  frameName,
  soldier,
  standardInsignia,
} from './figures.ts';
import { GLYPHS, GLYPH_WIDTH, LINE_HEIGHT, drawText, measureText, textPlate } from './font.ts';
import {
  BADGE_NAMES,
  BADGE_TILE,
  COMMAND_ICON_NAMES,
  ICON_TILE,
  badgeIcon,
  commandIcon,
  iconEntries,
} from './icons.ts';
import { NODE_KINDS, NODE_TILE, nodeEntries, nodeMarker } from './nodes.ts';
import { CONDITION_MARKS, FACING_MARKS, ORDER_MARK_KINDS, markerEntries } from './markers.ts';
import { SITE_SIZE, SITE_SPECIMENS, settlementEntries, siteSprite } from './settlements.ts';
import { interfaceEntries } from './interface.ts';
import { appearanceEntries } from '../ui/appearance.ts';
import {
  SEPARATION_FACTIONS,
  SEPARATION_MATERIALS,
  SEPARATION_SIZE,
  separationEntries,
  separationSpecimen,
} from './separation.ts';
import { BASE, RAMPS, RAMP_NAMES, RAMP_SHADES } from './palette.ts';
import { type PixelBuffer, blit, createPixelBuffer, fillRect } from './pixel-buffer.ts';
import {
  MATERIALS,
  TERRAIN_MATERIALS,
  TERRAIN_TILE,
  cellTile,
  materialTile,
  referenceBackground,
  roadTile,
  terrainEntries,
  variantQuadrants,
} from './terrain.ts';

/** One named artefact: what the Atelier renders, and what a test can pin. */
export interface CatalogueEntry {
  /** A stable, machine-readable name, e.g. `glyph:U+0041` or `terrain:forest:13`. */
  readonly name: string;
  /** The pixels, in the one currency the pipeline has (PLAN §3). */
  readonly buffer: PixelBuffer;
}

/** The flat grey the plate is drawn on: neutral, so nothing on it is flattered. */
export const PLATE_BACKGROUND = BASE.neutral;

/** The ink the plate's own labels are drawn in. */
export const PLATE_INK = BASE.ink;

/** Blank margin around the plate's contents, in pixels. */
const PLATE_PADDING = 4;

/** How many glyphs stand on one row of the glyph grid. */
const GLYPH_GRID_COLUMNS = 16;

/** One cell of the glyph grid: the glyph, plus air on two sides. */
const CELL_WIDTH = GLYPH_WIDTH + 3;
const CELL_HEIGHT = LINE_HEIGHT + 3;

/** One colour swatch of a ramp, and the air between two of them. */
const SWATCH_WIDTH = 7;
const SWATCH_HEIGHT = 7;
const SWATCH_GAP = 1;

/** Blank rows between two sections. */
const SECTION_GAP = 8;

/** Air between a section's heading and what it heads. */
const HEADING_GAP = 3;

/** Air between a ramp's name and its swatches. */
const LABEL_GAP = 3;

/** The rows of the glyph grid. */
const GLYPH_ROWS = Math.ceil(GLYPHS.length / GLYPH_GRID_COLUMNS);

/** One heading: a line of text and the air under it. */
const HEADING_HEIGHT = LINE_HEIGHT + HEADING_GAP;

/** Width of the glyph grid. */
const GLYPH_GRID_WIDTH = GLYPH_GRID_COLUMNS * CELL_WIDTH;

/** Height of the glyph grid. */
const GLYPH_GRID_HEIGHT = GLYPH_ROWS * CELL_HEIGHT;

/** Height of all the ramp strips together. */
const RAMPS_HEIGHT = RAMP_NAMES.length * (SWATCH_HEIGHT + SECTION_GAP) - SECTION_GAP;

/** The widest ramp name, which is what the swatches clear. */
const RAMP_LABEL_WIDTH = Math.max(...RAMP_NAMES.map((name) => measureText(name)));

/** Width of the ramp section: a name, and the shades of the ramp beside it. */
const RAMPS_WIDTH = RAMP_LABEL_WIDTH + LABEL_GAP + RAMP_SHADES * SWATCH_WIDTH + (RAMP_SHADES - 1) * SWATCH_GAP;

/** How many terrain variants stand on one row: the dual grid's sixteen masks. */
const TERRAIN_COLUMNS = 16;

/** One cell of a terrain row: the tile, plus the air that keeps two rows apart. */
const TERRAIN_CELL = TERRAIN_TILE + 3;

/** The labels down the side of the terrain section: the ground, one row per material, the road, the nodes. */
const TERRAIN_ROW_LABELS: readonly string[] = ['ground', 'road', 'node', ...TERRAIN_MATERIALS];

/** The widest of them, which is what the tiles clear. */
const TERRAIN_LABEL_WIDTH = Math.max(...TERRAIN_ROW_LABELS.map((label) => measureText(label)));

/** Width of the terrain section: a label, and sixteen variants beside it. */
const TERRAIN_WIDTH = TERRAIN_LABEL_WIDTH + LABEL_GAP + TERRAIN_COLUMNS * TERRAIN_CELL;

/** The rows of variant tiles: one per material that can be a boundary's foreground. */
const TERRAIN_ROWS = TERRAIN_MATERIALS.length;

/** Height of the terrain section: the material row, the variant rows and the road row. */
const TERRAIN_HEIGHT = (1 + TERRAIN_ROWS + 1) * TERRAIN_CELL;

/** The resource markers, which stand in a row of their own under the terrain. */
const NODES_HEIGHT = NODE_TILE + 3;

/** One cell of the separation section: a terrain patch, plus the air that keeps two rows apart. */
const SEPARATION_CELL = SEPARATION_SIZE + 3;

/** The captions' own line, over the two rows of patches. */
const SEPARATION_CAPTION_HEIGHT = LINE_HEIGHT + 3;

/** The widest Faction label, which is what the patches clear. */
const SEPARATION_LABEL_WIDTH = Math.max(...SEPARATION_FACTIONS.map((label) => measureText(label)));

/** Width of the separation section: a label, and one patch per material. */
const SEPARATION_WIDTH =
  SEPARATION_LABEL_WIDTH + LABEL_GAP + SEPARATION_MATERIALS.length * SEPARATION_CELL;

/** Height of the separation section: the captions, and a row per Faction. */
const SEPARATION_HEIGHT = SEPARATION_CAPTION_HEIGHT + SEPARATION_FACTIONS.length * SEPARATION_CELL;

/** The figure rows: one per soldier of the roster and per direction, then the standards. */
const FIGURE_ROWS = FIGURE_NAMES.length * FIGURE_FACINGS.length + FIGURE_FACTIONS.length;

/** What every figure column's caption says, so a column is as wide as its own name. */
const FIGURE_CAPTIONS: readonly string[] = FIGURE_FRAMES.map(frameName);

/** One cell of the figures section: a soldier and the air that keeps two rows apart. */
const FIGURE_CELL_WIDTH = Math.max(
  FIGURE_WIDTH + 3,
  Math.max(...FIGURE_CAPTIONS.map((caption) => measureText(caption))) + 4,
);
const FIGURE_CELL_HEIGHT = FIGURE_HEIGHT + 3;

/** The widest figure-row label, e.g. `principes south`. */
const FIGURE_LABEL_WIDTH = Math.max(
  ...FIGURE_NAMES.flatMap((name) => FIGURE_FACINGS.map((facing) => measureText(`${name} ${facing}`))),
);

/** Width of the figures section: a label, and one column per frame. */
const FIGURES_WIDTH = FIGURE_LABEL_WIDTH + LABEL_GAP + FIGURE_FRAMES.length * FIGURE_CELL_WIDTH;

/**
 * The widest figure-row label, including the two standards' names.
 *
 * Kept in the figure section because the standards are the insignia a block of
 * those figures carries: a reviewer judges "can I tell the two armies apart at
 * the lowest zoom" on the same plate as the soldiers themselves (#58).
 */
const FIGURE_ROW_LABEL_WIDTH = Math.max(
  FIGURE_LABEL_WIDTH,
  ...FIGURE_FACTIONS.map((faction) => measureText(`insignia ${faction}`)),
);

/** Height of the figures section: the frame captions, and a row per soldier and direction. */
const FIGURES_HEIGHT = LINE_HEIGHT + 3 + FIGURE_ROWS * FIGURE_CELL_HEIGHT;

/** One cell of the marks section: the largest mark, and the air around it. */
const MARK_CELL = 12;

/** The three kinds of mark, one row each. */
const MARK_ROW_LABELS: readonly string[] = ['order', 'facing', 'condition'];

/** The widest mark-row label, which is what the marks clear. */
const MARK_LABEL_WIDTH = Math.max(...MARK_ROW_LABELS.map((label) => measureText(label)));

/** Width of the marks section: a label, and the longest row of marks. */
const MARKS_WIDTH = MARK_LABEL_WIDTH + LABEL_GAP + CONDITION_MARKS.length * MARK_CELL;

/** Height of the marks section: a row for each kind. */
const MARKS_HEIGHT = MARK_ROW_LABELS.length * MARK_CELL;

/** The icons section: a label, and one cell per icon or badge. */
const ICON_CELL = ICON_TILE + 3;
const BADGE_CELL = BADGE_TILE + 4;

/** The labels down the side of the icons section. */
const ICON_ROW_LABELS: readonly string[] = ['commands', 'badges'];

/** The widest of them, which is what the icons clear. */
const ICON_LABEL_WIDTH = Math.max(...ICON_ROW_LABELS.map((label) => measureText(label)));

/** Width of the icons section: the longer of its two rows. */
const ICONS_WIDTH = ICON_LABEL_WIDTH + LABEL_GAP + Math.max(
  COMMAND_ICON_NAMES.length * ICON_CELL,
  BADGE_NAMES.length * BADGE_CELL,
);

/** Height of the icons section: a commands row and a badges row. */
const ICONS_HEIGHT = 2 * ICON_CELL;

/** The tallest place in the catalogue, which is what a settlement row is as tall as. */
const SITE_CELL = Math.max(SITE_SIZE.settlement, SITE_SIZE.stronghold) + 4;

/** Height of the settlements section: two specimens per row. */
const SETTLEMENTS_HEIGHT = Math.ceil(SITE_SPECIMENS.length / 2) * SITE_CELL;

/** The widest specimen name, which is what the sprites clear. */
const SITE_LABEL_WIDTH = Math.max(...SITE_SPECIMENS.map((specimen) => measureText(specimen.name.replace(/^site:(stronghold|settlement):/, ''))));

/** Width of the settlements section: a specimen's name, and its drawing beside it. */
const SETTLEMENTS_WIDTH = 2 * (SITE_LABEL_WIDTH + LABEL_GAP + SITE_CELL);

const INTERFACE_ENTRIES = [...interfaceEntries(), ...appearanceEntries()];
const INTERFACE_HEIGHT = INTERFACE_ENTRIES.reduce((height, entry) => height + HEADING_HEIGHT + entry.buffer.height + SECTION_GAP, 0);
const INTERFACE_WIDTH = Math.max(...INTERFACE_ENTRIES.map(({ buffer }) => buffer.width));


/** The plate's width: the padding, and whichever section is wider. */
const ART_WIDTH =
  PLATE_PADDING * 2 +
  Math.max(
    GLYPH_GRID_WIDTH,
    RAMPS_WIDTH,
    TERRAIN_WIDTH,
    SEPARATION_WIDTH,
    FIGURES_WIDTH,
    MARKS_WIDTH,
    ICONS_WIDTH,
    SETTLEMENTS_WIDTH,
  );

// UI plates stand beside the art: stacking them below it would exceed an
// 8192-pixel framebuffer at 4x, making the Atelier's extraction transparent.
export const PLATE_WIDTH = ART_WIDTH + SECTION_GAP + INTERFACE_WIDTH + PLATE_PADDING;

/** The plate's height, which the sections above add up to. */
const ART_HEIGHT =
  PLATE_PADDING * 2 +
  HEADING_HEIGHT * 10 +
  GLYPH_GRID_HEIGHT +
  RAMPS_HEIGHT +
  TERRAIN_HEIGHT +
  NODES_HEIGHT +
  SEPARATION_HEIGHT +
  FIGURES_HEIGHT +
  MARKS_HEIGHT +
  ICONS_HEIGHT +
  SETTLEMENTS_HEIGHT +
  SECTION_GAP * 9;

export const PLATE_HEIGHT = Math.max(ART_HEIGHT, PLATE_PADDING * 2 + INTERFACE_HEIGHT);

/**
 * Every artefact the art library generates, in a stable order: the glyphs in
 * code-point order, the ramps in the order `RAMP_NAMES` states, and the terrain
 * tiles `terrainEntries` names.
 *
 * Each glyph is drawn on its own transparent buffer at line-box size, so the
 * accent band is part of the entry and two entries can be compared without
 * caring what is behind them.
 */
export function catalogue(): readonly CatalogueEntry[] {
  const glyphs = GLYPHS.map((glyph) => {
    const buffer = createPixelBuffer(GLYPH_WIDTH, LINE_HEIGHT);
    drawText(buffer, glyph.character, 0, 0, PLATE_INK);

    return { name: `glyph:${codePointName(glyph.character)}`, buffer };
  });

  const ramps = RAMP_NAMES.map((name) => ({ name: `ramp:${name}`, buffer: rampSwatches(name) }));

  return [
    ...glyphs,
    ...ramps,
    ...terrainEntries(),
    ...nodeEntries(),
    ...separationEntries(),
    ...figureEntries(),
    ...markerEntries(),
    ...iconEntries(),
    ...settlementEntries(),
    ...interfaceEntries(),
    ...appearanceEntries(),
  ];
}

/** The glyph entries, which stand first in the catalogue and in the plate's grid. */
function glyphEntries(entries: readonly CatalogueEntry[]): readonly CatalogueEntry[] {
  return entries.slice(0, GLYPHS.length);
}

/** The ramp entries, which stand after the glyphs and are drawn as strips. */
function rampEntries(entries: readonly CatalogueEntry[]): readonly CatalogueEntry[] {
  return entries.slice(GLYPHS.length, GLYPHS.length + RAMP_NAMES.length);
}

/**
 * The whole catalogue on one plate, which is what the Atelier renders.
 *
 * The layout is additive from the constants above — padding, a heading, the
 * grid, a gap, a heading, the ramp strips, a gap, a heading, the terrain, a gap,
 * a heading, the roads — so the plate's size is a consequence of what the
 * catalogue holds rather than a number someone maintains beside it. Everything
 * is drawn in the plate's own coordinates and nothing is scaled: the zoom the
 * Atelier shows it at is the camera's business, not the plate's.
 */
export function cataloguePlate(): PixelBuffer {
  const plate = createPixelBuffer(PLATE_WIDTH, PLATE_HEIGHT, PLATE_BACKGROUND);
  // Asked for once: every glyph is drawn afresh by `catalogue()`, and a plate
  // that asked again per section would draw the font five times over.
  const entries = catalogue();
  const glyphs = glyphEntries(entries);
  const ramps = rampEntries(entries);

  let y = PLATE_PADDING;
  blit(plate, textPlate('glyphs', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  for (let index = 0; index < GLYPHS.length; index += 1) {
    const entry = glyphs[index];
    if (entry === undefined) continue;

    const column = index % GLYPH_GRID_COLUMNS;
    const row = Math.floor(index / GLYPH_GRID_COLUMNS);
    blit(plate, entry.buffer, PLATE_PADDING + column * CELL_WIDTH, y + row * CELL_HEIGHT);
  }
  y += GLYPH_GRID_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('ramps', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The swatches are the ramp entries themselves, blitted rather than redrawn: the
  // plate shows the catalogue and does not hold a second opinion about it.
  const rampsTop = y;
  for (let index = 0; index < RAMP_NAMES.length; index += 1) {
    const entry = ramps[index];
    if (entry === undefined) continue;

    const row = rampsTop + index * (SWATCH_HEIGHT + SECTION_GAP);
    blit(plate, textPlate(RAMP_NAMES[index] ?? '', PLATE_INK), PLATE_PADDING, row);
    blit(plate, entry.buffer, PLATE_PADDING + RAMP_LABEL_WIDTH + LABEL_GAP, row + 1);
  }
  y = rampsTop + RAMPS_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('terrain', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // One row per material, each a label and sixteen variants: the mask a column
  // stands for is the column's own number, so a row reads left to right from
  // "none of it" to "all of it".
  blit(plate, textPlate('ground', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < MATERIALS.length; index += 1) {
    const material = MATERIALS[index];
    if (material === undefined) continue;

    blit(plate, materialTile(material), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + index * TERRAIN_CELL, y);
  }
  y += TERRAIN_CELL;

  for (const material of TERRAIN_MATERIALS) {
    const background = referenceBackground(material);
    blit(plate, textPlate(material, PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);

    for (let mask = 0; mask < TERRAIN_COLUMNS; mask += 1) {
      blit(
        plate,
        cellTile(variantQuadrants(material, background, mask)),
        PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + mask * TERRAIN_CELL,
        y,
      );
    }
    y += TERRAIN_CELL;
  }
  y += SECTION_GAP;

  blit(plate, textPlate('roads', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  blit(plate, textPlate('road', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let mask = 0; mask < TERRAIN_COLUMNS; mask += 1) {
    blit(plate, roadTile(mask), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + mask * TERRAIN_CELL, y);
  }
  y += TERRAIN_CELL + SECTION_GAP;

  blit(plate, textPlate('nodes', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The markers are drawn on the neutral plate with no ground under them, which is
  // exactly the question a marker has to answer: does it read on nothing?
  blit(plate, textPlate('node', PLATE_INK), PLATE_PADDING, y + (TERRAIN_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < NODE_KINDS.length; index += 1) {
    const kind = NODE_KINDS[index];
    if (kind === undefined) continue;

    blit(plate, nodeMarker(kind), PLATE_PADDING + TERRAIN_LABEL_WIDTH + LABEL_GAP + index * TERRAIN_CELL, y);
  }
  y += NODES_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('separation', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The material captions over the columns they name, then one row per Faction.
  // Each patch is three tiles of that material with a man of that Faction standing
  // on the middle one: the question the section answers is whether he is the thing
  // the eye finds, and the repetition around him is half the question.
  for (let index = 0; index < SEPARATION_MATERIALS.length; index += 1) {
    blit(
      plate,
      textPlate(SEPARATION_MATERIALS[index] ?? '', PLATE_INK),
      PLATE_PADDING + SEPARATION_LABEL_WIDTH + LABEL_GAP + index * SEPARATION_CELL,
      y,
    );
  }
  y += SEPARATION_CAPTION_HEIGHT;

  for (let row = 0; row < SEPARATION_FACTIONS.length; row += 1) {
    const faction = SEPARATION_FACTIONS[row];
    if (faction === undefined) continue;

    blit(plate, textPlate(faction, PLATE_INK), PLATE_PADDING, y + (SEPARATION_CELL - LINE_HEIGHT) / 2);
    for (let column = 0; column < SEPARATION_MATERIALS.length; column += 1) {
      const material = SEPARATION_MATERIALS[column];
      if (material === undefined) continue;

      blit(
        plate,
        separationSpecimen(material, faction),
        PLATE_PADDING + SEPARATION_LABEL_WIDTH + LABEL_GAP + column * SEPARATION_CELL,
        y,
      );
    }
    y += SEPARATION_CELL;
  }
  y += SECTION_GAP;

  blit(plate, textPlate('figures', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The frame captions, over the columns they name: `idle`, `walk:0`, `walk:1`,
  // `attack:0`, `attack:1`, `death`. A row is one soldier facing one way, so the
  // grid reads as "this is what a hastatus looks like from the east, walking".
  const figuresTop = y + LINE_HEIGHT + 3;
  for (let index = 0; index < FIGURE_CAPTIONS.length; index += 1) {
    blit(
      plate,
      textPlate(FIGURE_CAPTIONS[index] ?? '', PLATE_INK),
      PLATE_PADDING + FIGURE_ROW_LABEL_WIDTH + LABEL_GAP + index * FIGURE_CELL_WIDTH,
      y,
    );
  }

  let row = 0;
  for (const name of FIGURE_NAMES) {
    for (const facing of FIGURE_FACINGS) {
      const top = figuresTop + row * FIGURE_CELL_HEIGHT;
      blit(
        plate,
        textPlate(`${name} ${facing}`, PLATE_INK),
        PLATE_PADDING,
        top + Math.floor((FIGURE_CELL_HEIGHT - LINE_HEIGHT) / 2),
      );

      for (let index = 0; index < FIGURE_FRAMES.length; index += 1) {
        const frame = FIGURE_FRAMES[index];
        if (frame === undefined) continue;

        blit(
          plate,
          soldier(name, facing, frame),
          PLATE_PADDING + FIGURE_ROW_LABEL_WIDTH + LABEL_GAP + index * FIGURE_CELL_WIDTH,
          top,
        );
      }

      row += 1;
    }
  }

  // The two standards close the figure section: the insignia a block of those
  // soldiers carries above it, in its own Faction's cloth (#58).
  for (const faction of FIGURE_FACTIONS) {
    const top = figuresTop + row * FIGURE_CELL_HEIGHT;
    blit(
      plate,
      textPlate(`insignia ${faction}`, PLATE_INK),
      PLATE_PADDING,
      top + Math.floor((FIGURE_CELL_HEIGHT - LINE_HEIGHT) / 2),
    );
    blit(
      plate,
      standardInsignia(faction),
      PLATE_PADDING + FIGURE_ROW_LABEL_WIDTH + LABEL_GAP,
      top + Math.floor((FIGURE_CELL_HEIGHT - INSIGNIA_HEIGHT) / 2),
    );
    row += 1;
  }

  // The figure captions stand above the rows, so the marks section starts after
  // the rows themselves and not after the captions' own line.
  y = figuresTop + FIGURE_ROWS * FIGURE_CELL_HEIGHT + SECTION_GAP;

  blit(plate, textPlate('marks', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // The marks a Squad wears on the ground (#58): its destination, the way it
  // faces, and the shapes its critical conditions take. They are drawn on the
  // neutral plate with no ground under them, which is the question each has to
  // answer first — a mark that only reads on grass is not a mark.
  const markRows: readonly (readonly string[])[] = [
    ORDER_MARK_KINDS.map((kind) => `order:${kind}`),
    FACING_MARKS.map((facing) => `facing:${facing}`),
    CONDITION_MARKS.map((kind) => `condition:${kind}`),
  ];
  for (const [rowIndex, labels] of markRows.entries()) {
    blit(
      plate,
      textPlate(MARK_ROW_LABELS[rowIndex] ?? '', PLATE_INK),
      PLATE_PADDING,
      y + Math.floor((MARK_CELL - LINE_HEIGHT) / 2),
    );
    for (const [index, label] of labels.entries()) {
      const entry = entries.find((candidate) => candidate.name === `mark:${label}`);
      if (entry === undefined) continue;

      blit(
        plate,
        entry.buffer,
        PLATE_PADDING + MARK_LABEL_WIDTH + LABEL_GAP + index * MARK_CELL + Math.floor((MARK_CELL - entry.buffer.width) / 2),
        y + Math.floor((MARK_CELL - entry.buffer.height) / 2),
      );
    }
    y += MARK_CELL;
  }
  y += SECTION_GAP;

  blit(plate, textPlate('icons', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // A row of verbs and a row of costs, each under its own name: the command card
  // is judged the way a marker is, on the neutral plate with no ground under it.
  blit(plate, textPlate(ICON_ROW_LABELS[0] ?? '', PLATE_INK), PLATE_PADDING, y + (ICON_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < COMMAND_ICON_NAMES.length; index += 1) {
    const name = COMMAND_ICON_NAMES[index];
    if (name === undefined) continue;

    blit(plate, commandIcon(name), PLATE_PADDING + ICON_LABEL_WIDTH + LABEL_GAP + index * ICON_CELL, y);
  }
  y += ICON_CELL;

  blit(plate, textPlate(ICON_ROW_LABELS[1] ?? '', PLATE_INK), PLATE_PADDING, y + (ICON_CELL - LINE_HEIGHT) / 2);
  for (let index = 0; index < BADGE_NAMES.length; index += 1) {
    const name = BADGE_NAMES[index];
    if (name === undefined) continue;

    blit(plate, badgeIcon(name), PLATE_PADDING + ICON_LABEL_WIDTH + LABEL_GAP + index * BADGE_CELL + 2,
      y + Math.floor((ICON_CELL - BADGE_TILE) / 2));
  }
  // The commands row has already been paid for; what is left of the section is the
  // badges' own row.
  y += ICON_CELL + SECTION_GAP;

  blit(plate, textPlate('settlements', PLATE_INK), PLATE_PADDING, y);
  y += HEADING_HEIGHT;

  // Two columns keep enlarged structures below the 8192-pixel GPU limit at 4x.
  for (const [index, specimen] of SITE_SPECIMENS.entries()) {
    const sprite = siteSprite(specimen.look);
    const top = y + Math.floor(index / 2) * SITE_CELL + Math.floor((SITE_CELL - sprite.height) / 2);
    const left = PLATE_PADDING + (index % 2) * (SITE_LABEL_WIDTH + LABEL_GAP + SITE_CELL);
    blit(plate, textPlate(specimen.name.replace(/^site:(stronghold|settlement):/, ''), PLATE_INK), left, top + Math.floor((sprite.height - LINE_HEIGHT) / 2));
    blit(plate, sprite, left + SITE_LABEL_WIDTH + LABEL_GAP, top);
  }

  y = PLATE_PADDING;
  for (const entry of INTERFACE_ENTRIES) {
    blit(plate, textPlate(entry.name, PLATE_INK), ART_WIDTH + SECTION_GAP, y);
    y += HEADING_HEIGHT;
    blit(plate, entry.buffer, ART_WIDTH + SECTION_GAP, y);
    y += entry.buffer.height + SECTION_GAP;
  }

  return plate;
}

/** One ramp as a strip of its shades, darkest first, which is how a ramp is judged. */
function rampSwatches(name: (typeof RAMP_NAMES)[number]): PixelBuffer {
  const width = RAMP_SHADES * SWATCH_WIDTH + (RAMP_SHADES - 1) * SWATCH_GAP;
  const buffer = createPixelBuffer(width, SWATCH_HEIGHT);

  for (let shade = 0; shade < RAMP_SHADES; shade += 1) {
    const colour = RAMPS[name][shade];
    if (colour === undefined) continue;

    fillRect(buffer, shade * (SWATCH_WIDTH + SWATCH_GAP), 0, SWATCH_WIDTH, SWATCH_HEIGHT, colour);
  }

  return buffer;
}

/** A character's name in the catalogue: its code point, so no glyph name needs escaping. */
function codePointName(character: string): string {
  return `U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}
