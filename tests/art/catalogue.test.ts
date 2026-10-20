/**
 * The catalogue and the plate the Atelier shows (ticket B2).
 *
 * Two claims are worth holding here. The catalogue is *complete*: one named
 * entry for every glyph and every ramp, with nothing missing and nothing
 * unnamed. And the plate *places* the catalogue: every entry's pixels turn up
 * where the layout says they are, which is what makes the Atelier a rendering of
 * the catalogue rather than a picture beside it.
 */
import { describe, expect, it } from 'vitest';
import { PLATE_BACKGROUND, PLATE_HEIGHT, PLATE_WIDTH, catalogue, cataloguePlate } from '../../src/art/catalogue';
import { GLYPHS, GLYPH_WIDTH, LINE_HEIGHT, measureText } from '../../src/art/font';
import { RAMPS, RAMP_NAMES, RAMP_SHADES } from '../../src/art/palette';
import { pixelAt } from '../../src/art/pixel-buffer';
import {
  MATERIALS,
  TERRAIN_MATERIALS,
  TERRAIN_TILE,
  cellTile,
  referenceBackground,
  roadTile,
  terrainEntries,
  variantQuadrants,
} from '../../src/art/terrain';
import { NODE_KINDS, NODE_TILE, nodeEntries, nodeMarker } from '../../src/art/nodes';
import { settlementEntries } from '../../src/art/settlements';
import { interfaceEntries } from '../../src/art/interface';
import { appearanceEntries } from '../../src/ui/appearance';
import {
  BADGE_NAMES,
  BADGE_TILE,
  COMMAND_ICON_NAMES,
  ICON_TILE,
  badgeIcon,
  commandIcon,
  iconEntries,
} from '../../src/art/icons';
import {
  SEPARATION_FACTIONS,
  SEPARATION_MATERIALS,
  SEPARATION_SIZE,
  separationEntries,
  separationSpecimen,
} from '../../src/art/separation';
import {
  FIGURE_FACINGS,
  FIGURE_FACTIONS,
  FIGURE_FRAMES,
  FIGURE_HEIGHT,
  FIGURE_NAMES,
  FIGURE_WIDTH,
  figureEntries,
  frameName,
  soldier,
  standardInsignia,
} from '../../src/art/figures';
import {
  CONDITION_MARKS,
  FACING_MARKS,
  ORDER_MARK_KINDS,
  markerEntries,
  orderMarker,
} from '../../src/art/markers';

/** How many glyphs stand on one row of the plate, which the layout test mirrors. */
const GLYPH_GRID_COLUMNS = 16;
const CELL_WIDTH = GLYPH_WIDTH + 3;
const CELL_HEIGHT = LINE_HEIGHT + 3;
const PLATE_PADDING = 4;
const HEADING_HEIGHT = LINE_HEIGHT + 3;
const SECTION_GAP = 8;

/** The terrain section's own arithmetic, written out again so the plate is checked rather than trusted. */
const TERRAIN_CELL = TERRAIN_TILE + 3;
const TERRAIN_LABEL_GAP = 3;
const NODES_HEIGHT = NODE_TILE + 3;
const GLYPH_GRID_HEIGHT = Math.ceil(GLYPHS.length / GLYPH_GRID_COLUMNS) * CELL_HEIGHT;
const RAMPS_HEIGHT = RAMP_NAMES.length * (7 + SECTION_GAP) - SECTION_GAP;
const TERRAIN_TOP =
  PLATE_PADDING + HEADING_HEIGHT + GLYPH_GRID_HEIGHT + SECTION_GAP + HEADING_HEIGHT + RAMPS_HEIGHT + SECTION_GAP + HEADING_HEIGHT;

/** Where the terrain section's own columns begin. */
const TERRAIN_LABEL_WIDTH = Math.max(
  ...['ground', 'road', ...TERRAIN_MATERIALS].map((label) => measureText(label)),
);
const TERRAIN_X = PLATE_PADDING + TERRAIN_LABEL_WIDTH + TERRAIN_LABEL_GAP;

/** The separation section's own arithmetic: three tiles of ground a side, and a row per Faction. */
const SEPARATION_CELL = SEPARATION_SIZE + 3;
const SEPARATION_CAPTION_HEIGHT = LINE_HEIGHT + 3;
const SEPARATION_LABEL_WIDTH = Math.max(...SEPARATION_FACTIONS.map((faction) => measureText(faction)));
const SEPARATION_X = PLATE_PADDING + SEPARATION_LABEL_WIDTH + TERRAIN_LABEL_GAP;
const NODES_TOP =
  TERRAIN_TOP +
  (1 + TERRAIN_MATERIALS.length) * TERRAIN_CELL +
  SECTION_GAP +
  HEADING_HEIGHT +
  TERRAIN_CELL +
  SECTION_GAP +
  HEADING_HEIGHT;
const SEPARATION_TOP = NODES_TOP + NODES_HEIGHT + SECTION_GAP + HEADING_HEIGHT;
const SEPARATION_ROWS_TOP = SEPARATION_TOP + SEPARATION_CAPTION_HEIGHT;

/** The figures section's own arithmetic, written out again so its cells are checked rather than trusted. */
const FIGURE_CAPTIONS = FIGURE_FRAMES.map(frameName);
const FIGURE_CELL_WIDTH = Math.max(
  FIGURE_WIDTH + 3,
  Math.max(...FIGURE_CAPTIONS.map((caption) => measureText(caption))) + 4,
);
const FIGURE_CELL_HEIGHT = FIGURE_HEIGHT + 3;
const FIGURE_LABEL_WIDTH = Math.max(
  ...FIGURE_NAMES.flatMap((name) => FIGURE_FACINGS.map((facing) => measureText(`${name} ${facing}`))),
  ...FIGURE_FACTIONS.map((faction) => measureText(`insignia ${faction}`)),
);
const FIGURE_X = PLATE_PADDING + FIGURE_LABEL_WIDTH + TERRAIN_LABEL_GAP;
const FIGURE_ROWS = FIGURE_NAMES.length * FIGURE_FACINGS.length + FIGURE_FACTIONS.length;
const FIGURES_TOP =
  PLATE_PADDING +
  (HEADING_HEIGHT + GLYPH_GRID_HEIGHT + SECTION_GAP) +
  (HEADING_HEIGHT + RAMPS_HEIGHT + SECTION_GAP) +
  (HEADING_HEIGHT + (1 + TERRAIN_MATERIALS.length) * TERRAIN_CELL + SECTION_GAP) +
  (HEADING_HEIGHT + TERRAIN_CELL + SECTION_GAP) +
  (HEADING_HEIGHT + NODES_HEIGHT + SECTION_GAP) +
  (HEADING_HEIGHT + SEPARATION_CAPTION_HEIGHT + SEPARATION_FACTIONS.length * SEPARATION_CELL + SECTION_GAP) +
  HEADING_HEIGHT;
const FIGURE_ROWS_TOP = FIGURES_TOP + LINE_HEIGHT + 3;

/** The icons section's own arithmetic, written out again so its cells are checked rather than trusted. */
const ICON_CELL = ICON_TILE + 3;
const BADGE_CELL = BADGE_TILE + 4;
const ICON_LABEL_WIDTH = Math.max(...['commands', 'badges'].map((label) => measureText(label)));
/** The marks section's own arithmetic: three rows of marks under their own heading (#58). */
const MARK_CELL = 12;
const MARK_ROW_LABELS = ['order', 'facing', 'condition'];
const MARK_LABEL_WIDTH = Math.max(...MARK_ROW_LABELS.map((label) => measureText(label)));
const MARKS_HEIGHT = MARK_ROW_LABELS.length * MARK_CELL;
const ICONS_TOP =
  FIGURE_ROWS_TOP + FIGURE_ROWS * FIGURE_CELL_HEIGHT + SECTION_GAP +
  HEADING_HEIGHT + MARKS_HEIGHT + SECTION_GAP + HEADING_HEIGHT;

/** One catalogue entry by name, for a test that wants the drawn buffer rather than the generator. */
function catalogueEntry(name: string): ReturnType<typeof orderMarker> {
  const found = catalogue().find((entry) => entry.name === name);
  if (found === undefined) throw new Error(`the catalogue holds no ${name}`);

  return found.buffer;
}

/** The name the catalogue gives a character. */
function glyphName(character: string): string {
  return `glyph:U+${(character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}`;
}

describe('the catalogue', () => {
  it('names every glyph, every ramp, every terrain tile, every marker and every figure exactly once', () => {
    const names = catalogue().map((entry) => entry.name);

    expect(names.length).toBe(
      GLYPHS.length +
        RAMP_NAMES.length +
        terrainEntries().length +
        nodeEntries().length +
        separationEntries().length +
        figureEntries().length +
        markerEntries().length +
        iconEntries().length +
        settlementEntries().length + interfaceEntries().length + appearanceEntries().length,
    );
    expect(new Set(names).size).toBe(names.length);
    for (const glyph of GLYPHS) {
      expect(names).toContain(glyphName(glyph.character));
    }
    for (const name of RAMP_NAMES) {
      expect(names).toContain(`ramp:${name}`);
    }
    for (const entry of terrainEntries()) {
      expect(names).toContain(entry.name);
    }
    for (const entry of nodeEntries()) {
      expect(names).toContain(entry.name);
    }
    for (const entry of separationEntries()) {
      expect(names).toContain(entry.name);
    }
    for (const entry of figureEntries()) {
      expect(names).toContain(entry.name);
    }
    for (const entry of markerEntries()) {
      expect(names).toContain(entry.name);
    }
    for (const name of COMMAND_ICON_NAMES) {
      expect(names).toContain(`icon:${name}`);
    }
    for (const name of BADGE_NAMES) {
      expect(names).toContain(`badge:${name}`);
    }
    for (const entry of settlementEntries()) {
      expect(names).toContain(entry.name);
    }
  });

  it('gives each glyph a line box of its own, with the accent band part of the entry', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const glyph of GLYPHS) {
      const buffer = entries.get(glyphName(glyph.character));
      expect(buffer?.width, glyph.character).toBe(GLYPH_WIDTH);
      expect(buffer?.height, glyph.character).toBe(LINE_HEIGHT);
    }

    // A space has no ink at all; a letter has ink under its band; `à` has ink in
    // the band itself, which is where an accent lives.
    const ink = (name: string): number => {
      const buffer = entries.get(name);
      if (buffer === undefined) throw new Error(`no catalogue entry ${name}`);
      let count = 0;
      for (let index = 3; index < buffer.pixels.length; index += 4) {
        if ((buffer.pixels[index] ?? 0) > 0) count += 1;
      }
      return count;
    };

    expect(ink('glyph:U+0020')).toBe(0);
    expect(ink('glyph:U+0041')).toBeGreaterThan(0);
    expect(ink('glyph:U+00E0')).toBeGreaterThan(ink('glyph:U+0061'));
  });

  it('gives each ramp a strip of its shades, darkest first', () => {
    const entries = new Map(catalogue().map((entry) => [entry.name, entry.buffer]));

    for (const name of RAMP_NAMES) {
      const buffer = entries.get(`ramp:${name}`);
      expect(buffer?.width).toBe(RAMP_SHADES * 7 + (RAMP_SHADES - 1));
      expect(buffer?.height).toBe(7);
      if (buffer === undefined) throw new Error(`no catalogue entry ramp:${name}`);

      expect(pixelAt(buffer, 0, 0)).toEqual(RAMPS[name][0]);
      expect(pixelAt(buffer, buffer.width - 1, 0)).toEqual(RAMPS[name][RAMP_SHADES - 1]);
    }
  });
});

describe('the catalogue plate', () => {
  it('places every command icon and badge where its section says', () => {
    const plate = cataloguePlate();
    const iconX = PLATE_PADDING + ICON_LABEL_WIDTH + SECTION_GAP - SECTION_GAP + 3;

    for (const [index, name] of COMMAND_ICON_NAMES.entries()) {
      const icon = commandIcon(name);
      for (let y = 0; y < icon.height; y += 1) {
        for (let x = 0; x < icon.width; x += 1) {
          const entryPixel = pixelAt(icon, x, y);
          const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
          expect(pixelAt(plate, iconX + index * ICON_CELL + x, ICONS_TOP + y), `icon:${name}`).toEqual(expected);
        }
      }
    }

    for (const [index, name] of BADGE_NAMES.entries()) {
      const badge = badgeIcon(name);
      const top = ICONS_TOP + ICON_CELL + Math.floor((ICON_CELL - BADGE_TILE) / 2);
      for (let y = 0; y < badge.height; y += 1) {
        for (let x = 0; x < badge.width; x += 1) {
          const entryPixel = pixelAt(badge, x, y);
          const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
          expect(pixelAt(plate, iconX + index * BADGE_CELL + 2 + x, top + y), `badge:${name}`).toEqual(expected);
        }
      }
    }
  });

  it('places the two standards and every mark where their sections say', () => {
    const plate = cataloguePlate();

    for (const [index, faction] of FIGURE_FACTIONS.entries()) {
      const top = FIGURE_ROWS_TOP + (FIGURE_NAMES.length * FIGURE_FACINGS.length + index) * FIGURE_CELL_HEIGHT;
      const standard = standardInsignia(faction);
      for (let y = 0; y < standard.height; y += 1) {
        for (let x = 0; x < standard.width; x += 1) {
          const entryPixel = pixelAt(standard, x, y);
          const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
          expect(pixelAt(plate, FIGURE_X + x, top + Math.floor((FIGURE_CELL_HEIGHT - standard.height) / 2) + y), `insignia:${faction}`).toEqual(expected);
        }
      }
    }

    const marksTop = FIGURE_ROWS_TOP + FIGURE_ROWS * FIGURE_CELL_HEIGHT + SECTION_GAP + HEADING_HEIGHT;
    const rows: readonly (readonly { readonly name: string; readonly buffer: ReturnType<typeof orderMarker> }[])[] = [
      ORDER_MARK_KINDS.map((kind) => ({ name: `order:${kind}`, buffer: orderMarker(kind) })),
      FACING_MARKS.map((facing) => ({ name: `facing:${facing}`, buffer: catalogueEntry(`mark:facing:${facing}`) })),
      CONDITION_MARKS.map((kind) => ({ name: `condition:${kind}`, buffer: catalogueEntry(`mark:condition:${kind}`) })),
    ];

    for (const [row, entries] of rows.entries()) {
      for (const [index, entry] of entries.entries()) {
        const x = PLATE_PADDING + MARK_LABEL_WIDTH + TERRAIN_LABEL_GAP + index * MARK_CELL
          + Math.floor((MARK_CELL - entry.buffer.width) / 2);
        const y = marksTop + row * MARK_CELL + Math.floor((MARK_CELL - entry.buffer.height) / 2);
        for (let py = 0; py < entry.buffer.height; py += 1) {
          for (let px = 0; px < entry.buffer.width; px += 1) {
            const entryPixel = pixelAt(entry.buffer, px, py);
            const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
            expect(pixelAt(plate, x + px, y + py), `mark:${entry.name}`).toEqual(expected);
          }
        }
      }
    }
  });

  it('is the size its sections add up to, on the neutral background', () => {
    const plate = cataloguePlate();

    expect(plate.width).toBe(PLATE_WIDTH);
    expect(plate.height).toBe(PLATE_HEIGHT);
    for (const [x, y] of [
      [0, 0],
      [plate.width - 1, plate.height - 1],
      [plate.width - 1, 0],
    ]) {
      expect(pixelAt(plate, x ?? 0, y ?? 0)).toEqual(PLATE_BACKGROUND);
    }
  });

  it('places every glyph entry in its cell of the grid, pixel for pixel', () => {
    const plate = cataloguePlate();
    const glyphs = catalogue().slice(0, GLYPHS.length);
    let checked = 0;

    for (let index = 0; index < glyphs.length; index += 1) {
      const entry = glyphs[index];
      if (entry === undefined) continue;

      const cellX = PLATE_PADDING + (index % GLYPH_GRID_COLUMNS) * CELL_WIDTH;
      const cellY = PLATE_PADDING + HEADING_HEIGHT + Math.floor(index / GLYPH_GRID_COLUMNS) * CELL_HEIGHT;

      for (let y = 0; y < entry.buffer.height; y += 1) {
        for (let x = 0; x < entry.buffer.width; x += 1) {
          const entryPixel = pixelAt(entry.buffer, x, y);
          const platePixel = pixelAt(plate, cellX + x, cellY + y);
          const expected = entryPixel[3] === 0 ? PLATE_BACKGROUND : entryPixel;
          expect(platePixel, `${entry.name} at (${String(x)}, ${String(y)})`).toEqual(expected);
          checked += 1;
        }
      }
    }

    expect(checked).toBe(glyphs.length * GLYPH_WIDTH * LINE_HEIGHT);
  });

  it('shows every material, in a row of sixteen variants under its name', () => {
    const plate = cataloguePlate();

    // The ground row: every material's own tile, in `MATERIALS` order.
    for (let index = 0; index < MATERIALS.length; index += 1) {
      const entry = terrainEntries()[index];
      if (entry === undefined) continue;

      for (let y = 0; y < entry.buffer.height; y += 1) {
        for (let x = 0; x < entry.buffer.width; x += 1) {
          const pixel = pixelAt(entry.buffer, x, y);
          expect(pixelAt(plate, TERRAIN_X + index * TERRAIN_CELL + x, TERRAIN_TOP + y)).toEqual(
            pixel[3] === 0 ? PLATE_BACKGROUND : pixel,
          );
        }
      }
    }

    // And a variant row: one material, sixteen masks, left to right.
    for (let row = 0; row < TERRAIN_MATERIALS.length; row += 1) {
      const material = TERRAIN_MATERIALS[row];
      if (material === undefined) continue;

      for (let mask = 0; mask < 16; mask += 1) {
        const tile = cellTile(variantQuadrants(material, referenceBackground(material), mask));
        const top = TERRAIN_TOP + (1 + row) * TERRAIN_CELL;
        const left = TERRAIN_X + mask * TERRAIN_CELL;

        for (const [x, y] of [
          [0, 0],
          [TERRAIN_TILE - 1, 0],
          [0, TERRAIN_TILE - 1],
          [TERRAIN_TILE - 1, TERRAIN_TILE - 1],
        ] as const) {
          const pixel = pixelAt(tile, x, y);
          expect(
            pixelAt(plate, left + x, top + y),
            `${material} mask ${String(mask)} at (${String(x)}, ${String(y)})`,
          ).toEqual(pixel[3] === 0 ? PLATE_BACKGROUND : pixel);
        }
      }
    }

    // And the roads, whose pieces are paths on nothing: the plate shows the
    // background where the piece has no ink.
    const roadTop = TERRAIN_TOP + (1 + TERRAIN_MATERIALS.length) * TERRAIN_CELL + SECTION_GAP + HEADING_HEIGHT;
    for (let mask = 0; mask < 16; mask += 1) {
      const piece = roadTile(mask);
      for (const [x, y] of [
        [0, 0],
        [TERRAIN_TILE - 1, TERRAIN_TILE - 1],
        [8, 8],
      ] as const) {
        const pixel = pixelAt(piece, x, y);
        expect(pixelAt(plate, TERRAIN_X + mask * TERRAIN_CELL + x, roadTop + y), `road ${String(mask)}`).toEqual(
          pixel[3] === 0 ? PLATE_BACKGROUND : pixel,
        );
      }
    }
  });

  it('stands the resource markers under the terrain, on the neutral plate and nothing else', () => {
    const plate = cataloguePlate();

    for (let index = 0; index < NODE_KINDS.length; index += 1) {
      const kind = NODE_KINDS[index];
      if (kind === undefined) continue;

      const marker = nodeMarker(kind);
      const left = TERRAIN_X + index * TERRAIN_CELL;

      for (let y = 0; y < marker.height; y += 1) {
        for (let x = 0; x < marker.width; x += 1) {
          const pixel = pixelAt(marker, x, y);
          expect(pixelAt(plate, left + x, NODES_TOP + y), `${kind} at (${String(x)}, ${String(y)})`).toEqual(
            pixel[3] === 0 ? PLATE_BACKGROUND : pixel,
          );
        }
      }
    }
  });
});

describe('the separation section of the plate', () => {
  it('stands each Faction on three tiles of every material, in its own cell', () => {
    const plate = cataloguePlate();

    for (const [row, faction] of SEPARATION_FACTIONS.entries()) {
      for (const [column, material] of SEPARATION_MATERIALS.entries()) {
        const specimen = separationSpecimen(material, faction);
        const left = SEPARATION_X + column * SEPARATION_CELL;
        const top = SEPARATION_ROWS_TOP + row * SEPARATION_CELL;

        for (const [x, y] of [
          [0, 0],
          [SEPARATION_SIZE - 1, SEPARATION_SIZE - 1],
          [Math.floor(SEPARATION_SIZE / 2), Math.floor(SEPARATION_SIZE / 2)],
        ] as const) {
          expect(pixelAt(plate, left + x, top + y), `${faction} on ${material} at (${String(x)}, ${String(y)})`).toEqual(
            pixelAt(specimen, x, y),
          );
        }
      }
    }
  });
});

describe('the figures on the plate', () => {
  it('stands every soldier of the roster, in every direction and every frame, in its own cell', () => {
    const plate = cataloguePlate();
    const rows = FIGURE_NAMES.flatMap((name) => FIGURE_FACINGS.map((facing) => ({ name, facing })));

    rows.forEach(({ name, facing }, row) => {
      FIGURE_FRAMES.forEach((frame, column) => {
        const figure = soldier(name, facing, frame);
        const left = FIGURE_X + column * FIGURE_CELL_WIDTH;
        const top = FIGURE_ROWS_TOP + row * FIGURE_CELL_HEIGHT;

        for (const [x, y] of [
          [0, 0],
          [FIGURE_WIDTH - 1, FIGURE_HEIGHT - 1],
          [Math.floor(FIGURE_WIDTH / 2), Math.floor(FIGURE_HEIGHT / 2)],
        ] as const) {
          const pixel = pixelAt(figure, x, y);
          expect(
            pixelAt(plate, left + x, top + y),
            `${name} ${facing} ${frameName(frame)} at (${String(x)}, ${String(y)})`,
          ).toEqual(pixel[3] === 0 ? PLATE_BACKGROUND : pixel);
        }
      });
    });
  });
});
