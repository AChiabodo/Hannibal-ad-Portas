/**
 * The HUD (ticket B7).
 *
 * The interface's own acceptance criteria are readouts a Player can read at a
 * glance and a selection panel that says the figures that matter. Both are
 * asserted through the *model* the page renders — the words and numbers the HUD
 * would draw — because the plan says out loud that the HUD will change and
 * pixel-perfect assertions on it are out of scope. What must not change is that
 * a Squad shows its morale and its Payroll, that a settlement shows its stock and
 * its tier, and that the season and the year are always on screen.
 *
 * The render is checked for the properties that make it an interface rather than
 * a picture: it is the size it was asked for, it leaves the theatre visible where
 * it draws nothing, it puts the minimap where the layout says, and the point a
 * click lands on selects the row a Player sees there.
 */
import { describe, expect, it } from 'vitest';
import { measureText } from '../../src/art/font.ts';
import { pixelAt, TRANSPARENT, type PixelBuffer } from '../../src/art/pixel-buffer.ts';
import type { EconomyVisible } from '../../src/sim/economy-match.ts';
import { RESOURCE } from '../../src/sim/map.ts';
import {
  HUD_BACKGROUND,
  hitTest,
  hudLayout,
  hudModel,
  renderHud,
  renderPanels,
  type HudSize,
} from '../../src/ui/hud.ts';
import { inspectionView } from '../../src/sim/fog.ts';
import { MINIMAP_PLATE_HEIGHT, MINIMAP_PLATE_WIDTH, minimapPlate } from '../../src/ui/minimap.ts';
import { generateMap } from '../../src/sim/map.ts';
import { translate } from '../../src/ui/strings.ts';

const SIZE: HudSize = { width: 640, height: 480 };

/** A Faction's window on the economy: two settlements and one Squad. */
const VISIBLE: EconomyVisible = {
  season: 'spring',
  year: 1,
  treasury: 20,
  settlements: [
    {
      id: 0,
      x: 10,
      y: 10,
      tier: 1,
      population: 10,
      stocks: { grain: 20, timber: 20, stone: 10, iron: 10 },
      land: { grain: 4, timber: 2, stone: 1, iron: 0 },
      works: [{ building: 'farm', remaining: 0, standing: true }],
    },
    {
      id: 2,
      x: 40,
      y: 40,
      tier: 2,
      population: 14,
      stocks: { grain: 7, timber: 6, stone: 5, iron: 4 },
      land: { grain: 3, timber: 3, stone: 2, iron: 0 },
      works: [{ building: 'villa', remaining: 120, standing: false }],
    },
  ],
  squads: [
    { id: 1, type: 'hastati', morale: 8, payroll: 3, unpaid: 1, home: 0 },
    { id: 2, type: 'principes', morale: 12, payroll: 4, unpaid: 0, home: 0 },
  ],
};

const STRONGHOLDS = [0];

/** The words a line is drawn with, joined for a readable assertion. */
function lineText(line: { readonly label: string; readonly value: string }): string {
  return `${line.label} ${line.value}`;
}

describe('the HUD model', () => {
  it('reads the year, the season, the treasury and the resources at a glance', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const words = model.readouts.map((readout) => lineText(readout));

    expect(words).toContain(`${translate('ui.year')} 1`);
    expect(words).toContain(`${translate('ui.season')} Primavera`);
    expect(words).toContain(`${translate('ui.treasury')} 20`);
    expect(words).toContain(`${translate('resource.grain')} 20`);
    expect(words).toContain(`${translate('resource.timber')} 20`);
    expect(words).toContain(`${translate('resource.stone')} 10`);
    expect(words).toContain(`${translate('resource.iron')} 10`);
  });

  it('lists every settlement and every Squad, each selectable', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);

    expect(model.rows.map((row) => row.selection)).toEqual([
      { kind: 'settlement', id: 0 },
      { kind: 'settlement', id: 2 },
      { kind: 'squad', id: 1 },
      { kind: 'squad', id: 2 },
    ]);
    expect(model.rows[0]?.label).toBe(translate('ui.stronghold'));
    expect(model.rows[1]?.label).toBe(translate('ui.minorSettlement'));
    expect(model.rows[2]?.label).toBe('Astati');
  });

  it('shows a settlement its tier, its people, its stock and its works', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 });
    const words = model.detail?.lines.map(lineText) ?? [];

    expect(model.detail?.title).toBe('Insediamento minore 2');
    expect(words).toContain(`${translate('ui.tier')} 2`);
    expect(words).toContain(`${translate('ui.population')} 14`);
    expect(words).toContain(`${translate('resource.grain')} 7`);
    expect(words).toContain(`${translate('resource.iron')} 4`);
    expect(words).toContain(`${translate('ui.labour')} 3/3/2/0`);
    expect(words.join('\n')).toContain('Villa');
    expect(words.join('\n')).toContain(translate('ui.workBuilding'));
  });

  it('shows a Squad its morale and its Payroll, which is what the ticket asks for', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 });
    const words = model.detail?.lines.map(lineText) ?? [];

    expect(model.detail?.title).toBe('Reparto 1');
    expect(words).toContain(`${translate('ui.type')} Astati`);
    expect(words).toContain(`${translate('ui.morale')} 8`);
    expect(words).toContain(`${translate('ui.payroll')} 3`);
    expect(words).toContain(`${translate('ui.unpaid')} 1`);
    expect(words).toContain(`${translate('ui.home')} 0`);
  });

  it('shows the selected settlement in the readouts, and the Stronghold when nothing is selected', () => {
    const selected = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 });
    expect(selected.readouts.map((readout) => lineText(readout))).toContain(`${translate('resource.grain')} 7`);

    const nothing = hudModel(VISIBLE, STRONGHOLDS, null);
    expect(nothing.readouts.map((readout) => lineText(readout))).toContain(`${translate('resource.grain')} 20`);
    expect(nothing.detail).toBeNull();
    expect(nothing.selected).toBeNull();
  });

  it('names the settlement whose stock the readouts are showing', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    expect(model.readouts.map((readout) => lineText(readout))).toContain(`${translate('ui.settlement')} Roccaforte 0`);

    const other = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 });
    expect(other.readouts.map((readout) => lineText(readout))).toContain(`${translate('ui.settlement')} Insediamento minore 2`);
  });

  it('ignores a selection that is no longer in the Faction’s window', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 99 });

    expect(model.selected).toBeNull();
    expect(model.detail).toBeNull();
  });
});

describe('the HUD on screen', () => {
  const MAP = generateMap(7);
  const MINIMAP = minimapPlate(MAP, inspectionView(MAP), null);

  it('is the size of the viewport, and leaves the theatre visible where it draws nothing', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const buffer = renderHud(model, MINIMAP, SIZE);

    expect(buffer.width).toBe(SIZE.width);
    expect(buffer.height).toBe(SIZE.height);
    // The middle of the screen is the theatre, not the HUD: an opaque HUD over
    // the whole viewport would be a menu, not an interface.
    expect(pixelAt(buffer, Math.floor(SIZE.width / 2), Math.floor(SIZE.height / 2))).toEqual(TRANSPARENT);
  });

  it('draws the readouts in the bar and the panels over a dark ground', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);
    const buffer = renderHud(model, MINIMAP, SIZE);

    expect(pixelAt(buffer, layout.bar.x + 1, layout.bar.y + 1)).toEqual(HUD_BACKGROUND);

    // Something is written on the bar: a plate of background alone is a HUD that
    // failed to draw.
    let inked = 0;
    for (let y = layout.bar.y; y < layout.bar.y + layout.bar.height; y += 1) {
      for (let x = layout.bar.x; x < layout.bar.x + layout.bar.width; x += 1) {
        if (pixelAt(buffer, x, y) !== HUD_BACKGROUND) inked += 1;
      }
    }
    expect(inked).toBeGreaterThan(100);
  });

  it('puts the minimap where the layout says, pixel for pixel', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);
    const buffer = renderHud(model, MINIMAP, SIZE);

    expect(layout.minimap.width).toBe(MINIMAP_PLATE_WIDTH);
    expect(layout.minimap.height).toBe(MINIMAP_PLATE_HEIGHT);
    expect(pixelAt(buffer, layout.minimap.x, layout.minimap.y)).toEqual(pixelAt(MINIMAP, 0, 0));
    expect(pixelAt(buffer, layout.minimap.x + 40, layout.minimap.y + 40)).toEqual(pixelAt(MINIMAP, 40, 40));
  });

  it('selects the row a click lands on, and nothing when it lands elsewhere', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);
    const second = layout.rows[2];
    if (second === undefined) throw new Error('the layout has no third row');

    const inside = { x: second.rect.x + 5, y: second.rect.y + Math.floor(second.rect.height / 2) };
    expect(hitTest(model, SIZE, inside.x, inside.y)).toEqual({ kind: 'squad', id: 1 });

    expect(hitTest(model, SIZE, Math.floor(SIZE.width / 2), Math.floor(SIZE.height / 2))).toBeNull();
    expect(hitTest(model, SIZE, layout.minimap.x + 4, layout.minimap.y + 4)).toBeNull();
  });

  it('draws a row for every selection, and a highlight on the one selected', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 });
    const layout = hudLayout(model, SIZE);
    const buffer = renderHud(model, MINIMAP, SIZE);

    expect(layout.rows.length).toBe(model.rows.length);

    const first = layout.rows[0];
    if (first === undefined) throw new Error('the layout has no rows');
    expect(pixelAt(buffer, first.rect.x + 1, first.rect.y + 1)).not.toEqual(HUD_BACKGROUND);
  });

  it('maps a resource kind to a stock, and never to the wrong one', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 });

    // The four resources are indexed by `RESOURCE`, and a readout that read the
    // wrong cell would still look plausible; this pins the order.
    expect(model.readouts.map((readout) => lineText(readout))).toContain(`${translate('resource.stone')} 5`);
    expect(RESOURCE.grain).toBe(0);
  });

  it('writes a readout label and its figure side by side, not on top of each other', () => {
    // The regression this catches is a label and a figure sharing their columns:
    // both drawn from the same cursor, so the figure is painted across the lower
    // half of its own label and the bar reads as a smear.
    const model = hudModel({ ...VISIBLE, settlements: [], squads: [] }, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);
    const buffer = renderPanels(model, SIZE);

    const first = layout.readouts[0];
    if (first === undefined) throw new Error('the layout has no readouts');

    const labelWidth = measureText(first.line.label);
    const valueWidth = measureText(first.line.value, first.line.large ? 2 : 1);
    // `measureText` counts the glyphs' trailing air, so the last column of ink
    // is one short of the advance.
    const valueEnd = first.rect.x + labelWidth + 2 + valueWidth - 2;

    expect(rightmostInk(buffer, first.rect)).toBeGreaterThanOrEqual(valueEnd);
  });

  it('wraps the bar into rows rather than running off the screen', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);

    // The resources start a row of their own, and the whole bar stays inside the
    // viewport: a readout clipped at the screen's edge is a figure nobody reads.
    expect(layout.readouts.length).toBe(model.readouts.length);
    const first = layout.readouts[0];
    const last = layout.readouts[layout.readouts.length - 1];
    if (first === undefined || last === undefined) throw new Error('the layout has no readouts');
    expect(last.rect.y).toBeGreaterThan(first.rect.y);
    for (const placed of layout.readouts) {
      expect(placed.rect.x + placed.rect.width).toBeLessThanOrEqual(SIZE.width);
      expect(placed.rect.y + placed.rect.height).toBeLessThanOrEqual(layout.bar.height);
    }

    // The list starts under the bar, whatever height the bar needed.
    expect(layout.list.y).toBe(layout.bar.height);
  });

  it('stops the list at its panel, so a row is never drawn where it cannot be pressed', () => {
    const crowded: EconomyVisible = {
      ...VISIBLE,
      squads: Array.from({ length: 40 }, (_, index) => ({
        id: index + 1,
        type: 'hastati',
        morale: 10,
        payroll: 3,
        unpaid: 0,
        home: 0,
      })),
    };
    const model = hudModel(crowded, STRONGHOLDS, null);
    const layout = hudLayout(model, SIZE);

    expect(layout.rows.length).toBeLessThan(model.rows.length);
    for (const row of layout.rows) {
      expect(row.rect.y + row.rect.height).toBeLessThanOrEqual(layout.list.y + layout.list.height);
    }

    // And a point below the panel is the theatre, not the row that would have
    // spilled over the selection panel.
    expect(hitTest(model, SIZE, 5, layout.list.y + layout.list.height + 4)).toBeNull();
  });
});

/** The rightmost column of a region that holds any ink other than its ground. */
function rightmostInk(buffer: PixelBuffer, rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }): number {
  let rightmost = -1;

  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) {
      const pixel = pixelAt(buffer, x, y);
      if (pixel[0] === HUD_BACKGROUND[0] && pixel[1] === HUD_BACKGROUND[1] && pixel[2] === HUD_BACKGROUND[2]) {
        continue;
      }
      rightmost = Math.max(rightmost, x);
    }
  }

  return rightmost;
}
