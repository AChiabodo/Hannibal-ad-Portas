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
import type { VisibleFront } from '../../src/sim/siege.ts';
import { RESOURCE } from '../../src/sim/map.ts';
import {
  HUD_ARMED,
  HUD_SELECTED,
  HUD_BACKGROUND,
  hitTest,
  hudHit,
  hudLayout,
  hudModel,
  renderHud,
  renderPanels,
  type HudSize,
} from '../../src/ui/hud.ts';
import { inspectionView } from '../../src/sim/fog.ts';
import { MINIMAP_PLATE_HEIGHT, MINIMAP_PLATE_WIDTH, minimapPlate } from '../../src/ui/minimap.ts';
import { generateMap, TILE_COUNT } from '../../src/sim/map.ts';
import type { KnownSite } from '../../src/ui/sites.ts';
import type { Notice } from '../../src/ui/conditions.ts';
import { message, translate } from '../../src/ui/strings.ts';
import { GUIDE_FIRST_ENTRY, guidePanel } from '../../src/ui/guide.ts';

const SIZE: HudSize = { width: 640, height: 480 };

/** A Faction's window on the economy: two settlements and one Squad. */
const VISIBLE: EconomyVisible = {
  season: 'spring',
  year: 1,
  territory: new Uint8Array(TILE_COUNT),
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
    {
      id: 1,
      type: 'hastati',
      x: 12,
      y: 8,
      men: 120,
      capacity: 120,
      figures: 120,
      formation: 'line',
      facing: 'south',
      goal: null,
      refused: null,
      morale: 8,
      fatigue: 2,
      ammunition: 3,
      routing: false,
      engaged: true,
      payroll: 3,
      unpaid: 1,
      bearing: 0,
      garrison: null,
      home: 0,
      inTerritory: true,
      inCamp: false,
    },
    {
      id: 2,
      type: 'principes',
      x: 40,
      y: 41,
      men: 114,
      capacity: 120,
      figures: 114,
      formation: 'column',
      facing: 'north',
      goal: null,
      refused: null,
      morale: 12,
      fatigue: 0,
      ammunition: 0,
      routing: false,
      engaged: false,
      payroll: 4,
      unpaid: 0,
      bearing: 0,
      garrison: null,
      home: 0,
      inTerritory: true,
      inCamp: false,
    },
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
    expect(words).toContain(`${translate('ui.labourAuto')} 3/3/2/0`);
    expect(words.join('\n')).toContain('Villa');
    expect(words.join('\n')).toContain(translate('ui.workBuilding'));
  });

  it('shows a Squad its morale and its Payroll, which is what the ticket asks for', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 });
    const words = model.detail?.lines.map(lineText) ?? [];

    expect(model.detail?.title).toBe('Reparto 1');
    expect(words).toContain(`${translate('ui.type')} Astati`);
    // Current against what the type is worth, which is the whole point of "90/120".
    expect(words).toContain(`${translate('ui.men')} 120/120`);
    expect(words).toContain(`${translate('ui.morale')} 8/10`);
    expect(words).toContain(`${translate('ui.payroll')} 3`);
    expect(words).toContain(`${translate('ui.unpaid')} 1`);
    expect(words).toContain(`${translate('ui.home')} 0`);
    expect(words).toContain(`${translate('ui.order')} ${translate('order.standing')}`);
    // Where it is going, and what its country is doing for it.
    expect(words).toContain(`${translate('ui.destination')} ${translate('ui.none')}`);
    expect(words).toContain(`${translate('ui.supply')} ${translate('supply.inTerritory')}`);
    expect(words).toContain(`${translate('ui.quarters')} ${translate('quarters.field')}`);
    expect(words).toContain(`${translate('ui.engaged')} ${translate('ui.yes')}`);
  });

  it('reads survivors against the capacity the Squad was recruited with', () => {
    const hurt = { ...VISIBLE.squads[0]!, men: 30, capacity: 60, payroll: 4 };
    const model = hudModel({ ...VISIBLE, squads: [hurt] }, STRONGHOLDS, { kind: 'squad', id: 1 });
    const words = model.detail?.lines.map(lineText) ?? [];

    expect(words).toContain(`${translate('ui.men')} 30/60`);
    expect(words).toContain(`${translate('ui.capacity')} 60`);
  });

  it('reads a Squad’s destination and refusal as the answer to the click it gave', () => {
    const marching = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 });

    expect(marching.detail?.lines.map(lineText)).toContain(`${translate('ui.destination')} ${translate('ui.none')}`);

    const going = hudModel({ ...VISIBLE, squads: [{ ...VISIBLE.squads[0]!, goal: { x: 20, y: 21 } }] },
      STRONGHOLDS, { kind: 'squad', id: 1 });
    expect(going.detail?.lines.map(lineText)).toContain(`${translate('ui.destination')} 20,21`);
  });

  it('says why a Squad is not doing what it was told, in words a Player reads', () => {
    const refused = hudModel({ ...VISIBLE, squads: [{ ...VISIBLE.squads[0]!, refused: 'water' }] }, STRONGHOLDS, {
      kind: 'squad',
      id: 1,
    });

    expect(refused.detail?.lines.map(lineText)).toContain(`${translate('ui.order')} ${translate('refusal.water')}`);

    // And a refusal outranks the march it interrupted: the Squad kept its route,
    // so "on the march" is true and is not the answer to the Player's question.
    const interrupted = hudModel(
      { ...VISIBLE, squads: [{ ...VISIBLE.squads[0]!, goal: { x: 20, y: 20 }, refused: 'unreachable' }] },
      STRONGHOLDS,
      { kind: 'squad', id: 1 },
    );
    expect(interrupted.detail?.lines.map(lineText)).toContain(
      `${translate('ui.order')} ${translate('refusal.unreachable')}`,
    );
  });

  it('shows what a fight has cost it: fatigue, missiles and a rout', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 });
    const words = model.detail?.lines.map(lineText) ?? [];

    expect(words).toContain(`${translate('ui.fatigue')} 2`);
    expect(words).toContain(`${translate('ui.ammunition')} 3`);

    // A beaten Squad says so instead of naming an order it is not obeying: it is
    // running, and the hand that got it broken is not in command of it (C3).
    const routed = hudModel(
      { ...VISIBLE, squads: [{ ...VISIBLE.squads[0]!, routing: true, goal: { x: 20, y: 20 } }] },
      STRONGHOLDS,
      { kind: 'squad', id: 1 },
    );

    expect(routed.detail?.lines.map(lineText)).toContain(
      `${translate('ui.order')} ${translate('order.routing')}`,
    );
  });

  it('reads an order that is under way as a march', () => {
    const model = hudModel(
      { ...VISIBLE, squads: [{ ...VISIBLE.squads[0]!, goal: { x: 20, y: 20 } }] },
      STRONGHOLDS,
      { kind: 'squad', id: 1 },
    );

    expect(model.detail?.lines.map(lineText)).toContain(`${translate('ui.order')} ${translate('order.marching')}`);
  });

  it('summarises a mixed selection instead of pretending it is one Squad', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1, 2]);

    expect(model.picked).toEqual([
      { kind: 'squad', id: 1 },
      { kind: 'squad', id: 2 },
    ]);
    expect(model.selected).toEqual({ kind: 'squad', id: 1 });
    expect(model.group).toMatchObject({ squads: 2, composition: 'Astati 1, Principi 1', men: 234, moraleMin: 8, moraleMax: 12 });
    expect(model.detail?.lines.map(lineText)).toContain(`${translate('ui.composition')} Astati 1, Principi 1`);

    // The panel's own Squad is highlighted even when the caller forgot to list
    // it: a panel with no highlighted row would be a selection nobody can see.
    const alone = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 2 }, [1]);
    expect(alone.picked).toEqual([
      { kind: 'squad', id: 1 },
      { kind: 'squad', id: 2 },
    ]);
  });

  it('drops a picked Squad it no longer holds, and never picks a settlement that way', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [99, 0, 2]);

    expect(model.picked).toEqual([{ kind: 'squad', id: 2 }]);
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
  it('reaches every crowded list row without losing the selected entity', () => {
    const squads = Array.from({ length: 80 }, (_, index) => ({ ...VISIBLE.squads[0]!, id: index + 1 }));
    const model = hudModel({ ...VISIBLE, squads }, STRONGHOLDS, { kind: 'squad', id: 80 }, [80], { listOffset: 99999 });
    const layout = hudLayout(model, SIZE);
    expect(layout.headers.map((header) => header.text)).toContain('Reparti: 80');
    const last = layout.rows.at(-1)!;
    expect(last.selection).toEqual({ kind: 'squad', id: 80 });
    expect(hitTest(model, SIZE, last.rect.x + 4, last.rect.y + 2)).toEqual(last.selection);
    expect(model.selected).toEqual(last.selection);
    const survivor = hudModel({ ...VISIBLE, squads: squads.slice(0, 79) }, STRONGHOLDS,
      { kind: 'squad', id: 80 }, [80, 79], model.view);
    expect(survivor.selected).toEqual({ kind: 'squad', id: 79 });
    const shrunk = hudLayout(hudModel(VISIBLE, STRONGHOLDS, null, [], model.view), SIZE);
    expect(shrunk.listScroll.offset).toBe(0);
  });
  it('keeps a refused Order visible while secondary detail scrolls', () => {
    const visible = { ...VISIBLE, squads: VISIBLE.squads.map((squad) => ({ ...squad, refused: 'water' as const })) };
    const model = hudModel(visible, STRONGHOLDS, { kind: 'squad', id: 1 }, [], { detailOffset: 999 });
    const layout = hudLayout(model, SIZE);
    expect(layout.priority.map((line) => line.text).join(' ')).toContain('Ordine: Acque profonde');
    expect(layout.detailScroll.offset).toBeGreaterThan(0);
    expect(layout.text.every((line) => measureText(line.text) <= line.rect.width)).toBe(true);
  });
  it('pins an active Work and makes all wrapped secondary text reachable', () => {
    const selected = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 });
    expect(hudLayout(selected, SIZE).priority.map((line) => line.text).join(' '))
      .toContain('Cantieri: Villa - In costruzione (12 s)');
    const long = { label: 'Una descrizione molto lunga del lavoro', value: '1234567890123456789012345678901234567890' };
    const model = { ...selected, detail: { ...selected.detail!, lines: [...selected.detail!.lines, long] } };
    const reached: string[] = [];
    const max = hudLayout(model, SIZE).detailScroll.max;
    for (let offset = 0; offset <= max; offset += 1) {
      const page = { ...model, view: { detailOffset: offset } };
      const layout = hudLayout(page, SIZE);
      expect(() => renderPanels(page, SIZE)).not.toThrow();
      for (const line of [...layout.text, ...layout.priority]) {
        expect(measureText(line.text)).toBeLessThanOrEqual(line.rect.width);
        expect(line.rect.y + line.rect.height).toBeLessThanOrEqual(SIZE.height);
      }
      reached.push(...layout.text.map((line) => line.text));
    }
    expect(reached.join(' ')).toContain('Una descrizione molto');
    expect([...new Set(reached)].join('').replaceAll(' ', '')).toContain(long.value);
  });
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
    for (const readout of layout.readouts) {
      expect(readout.rect.x + readout.rect.width).toBeLessThanOrEqual(SIZE.width);
      expect(readout.rect.y + readout.rect.height).toBeLessThanOrEqual(layout.bar.height);
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
        x: index,
        y: 40,
        men: 120,
        capacity: 120,
        figures: 120,
        formation: 'line',
        facing: 'south',
        goal: null,
        refused: null,
        morale: 10,
        fatigue: 0,
        ammunition: 4,
        routing: false,
        engaged: false,
        payroll: 3,
        unpaid: 0,
        bearing: 0,
        garrison: null,
        home: 0,
        inTerritory: true,
        inCamp: false,
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

it('keeps desktop navigation and contextual detail apart at readable 2x scale', () => {
  const model = hudModel(VISIBLE, [0], { kind: 'settlement', id: 2 }, [],
    { desktop: true, uiScale: 2, navigator: true });
  const layout = hudLayout(model, { width: 1280, height: 720 });
  expect(layout.detail.x).toBe(0);
  expect(layout.detail.width).toBeGreaterThan(800);
  expect(layout.minimap.x).toBeGreaterThanOrEqual(layout.detail.width);
  expect(layout.list.y + layout.list.height).toBeLessThanOrEqual(layout.detail.y);
  expect(layout.buttons.some((button) => button.action === 'center')).toBe(true);
  expect(hitTest(model, layout.size, layout.rows[0]!.rect.x + 4, layout.rows[0]!.rect.y + 4))
    .toEqual(layout.rows[0]!.selection);
});

it('composes the desktop Minimap at the requested integer UI scale', () => {
  const model = hudModel(VISIBLE, [0], null, [], { desktop: true, uiScale: 2 });
  const size = { width: 1280, height: 720 };
  const minimap = minimapPlate(generateMap(7), inspectionView(generateMap(7)), null);
  const buffer = renderHud(model, minimap, size);
  expect(buffer.width).toBe(1280);
  const rect = hudLayout(model, size).minimap;
  expect(pixelAt(buffer, rect.x, rect.y)).toEqual(pixelAt(minimap, 0, 0));
  expect(pixelAt(buffer, rect.x + 1, rect.y + 1)).toEqual(pixelAt(minimap, 0, 0));
});

it('keeps a long navigator row under the pointer when selection opens contextual detail', () => {
  const squads = Array.from({ length: 80 }, (_, index) => ({ ...VISIBLE.squads[0]!, id: index + 10 }));
  const visible = { ...VISIBLE, squads };
  const size = { width: 1280, height: 720 };
  const view = { desktop: true, uiScale: 2, navigator: true };
  const initial = hudLayout(hudModel(visible, [0], null, [], view), size);
  const last = initial.rows.at(-1)!;
  const selected = hudModel(visible, [0], last.selection, [], view);
  expect(hitTest(selected, size, last.rect.x + 5, last.rect.y + 5)).toEqual(last.selection);
});

/**
 * The contextual panels (#55).
 *
 * A button a Player presses and a row a Player opens are the same two things a
 * panel draws and a click reads, so these assertions are about geometry as much
 * as text: every offer is inside the panel, every offer's words fit its row, and
 * an exception opens the Squad it names.
 */
const DESKTOP = { width: 1280, height: 720 };
const DESKTOP_VIEW = { desktop: true, uiScale: 2, navigator: true };

it('leaves most of the theatre visible with a compact command dock', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW);
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const layout = hudLayout(model, size);
    expect(layout.detail.height).toBeLessThanOrEqual(size.height === 720 ? 250 : 290);
    expect(layout.commands).toHaveLength(10);
  }
});

it('keeps settlement text inside its column and paints the selected page', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
    { faction: 'rome', tab: 'construction' });
  const layout = hudLayout(model, { width: 1280, height: 720 });
  const leftEdgeOfCard = Math.min(...layout.tabs.map(({ rect }) => rect.x));
  for (const line of [...layout.text, ...layout.priority].filter(({ rect }) => rect.y >= layout.detail.y && rect.x < leftEdgeOfCard)) {
    expect(line.rect.x + measureText(line.text, 2), line.text).toBeLessThan(leftEdgeOfCard);
  }
  const selected = layout.tabs.find(({ tab }) => tab === 'construction')!.rect;
  expect(pixelAt(renderPanels(model, { width: 1280, height: 720 }), selected.x + 2, selected.y + 2)).toEqual(HUD_SELECTED);
});

it('keeps an owned settlement stock readable when the map also supplies its identity', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
    { sites: [{ id: 0, kind: 'stronghold', x: 10, y: 10, owner: 'rome', memory: 'seen', front: null }] });
  expect(model.readouts.find(({ label }) => label === translate('resource.grain'))?.value).toBe('20');
});

describe('the contextual command panel', () => {
  it('offers the military actions a picked Squad has, inside the detail panel', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW, { faction: 'rome' });
    const layout = hudLayout(model, DESKTOP);

    expect(model.commands.map((order) => order.id)).toContain('move');
    expect(model.commands.map((order) => order.id)).toContain('hold');
    expect(layout.commands.length).toBeGreaterThan(0);
    for (const command of layout.commands) {
      expect(command.rect.x).toBeGreaterThanOrEqual(layout.detail.x);
      expect(command.rect.x + command.rect.width).toBeLessThanOrEqual(layout.detail.x + layout.detail.width);
      expect(command.rect.y + command.rect.height).toBeLessThanOrEqual(layout.detail.y + layout.detail.height);
    }
  });

  it('opens the exception of a mixed selection as the Squad it names', () => {
    const squads = [{ ...VISIBLE.squads[0]!, routing: true }, VISIBLE.squads[1]!];
    const model = hudModel({ ...VISIBLE, squads }, STRONGHOLDS, { kind: 'squad', id: 1 }, [1, 2], DESKTOP_VIEW);
    const layout = hudLayout(model, DESKTOP);

    expect(model.group?.exceptions.map((exception) => exception.squad)).toEqual([1]);
    expect(layout.exceptions.map((row) => row.selection)).toEqual([{ kind: 'squad', id: 1 }]);
  });

  it('separates a settlement’s pages and offers the content-backed works of the open one', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
      { faction: 'rome', tab: 'construction' });
    const layout = hudLayout(model, DESKTOP);

    expect(layout.tabs.map((tab) => tab.tab)).toEqual(['overview', 'construction', 'recruitment']);
    expect(model.commands.map((order) => order.id)).toContain('build:farm');
    expect(model.commands.every((order) => order.reason === null || order.enabled === false)).toBe(true);
  });

  it('offers every size on the recruitment page and a count the Player can change', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
      { faction: 'rome', tab: 'recruitment', recruitCount: 2 });
    const layout = hudLayout(model, DESKTOP);
    const ids = model.commands.map((order) => order.id);

    expect(ids).toContain('recruit:hastati:24');
    expect(ids).toContain('recruit:hastati:60');
    expect(ids).toContain('recruit:hastati:120');
    expect(model.recruitCount).toBe(2);
    expect(model.commands.find((order) => order.id === 'recruit:hastati:24')).toMatchObject({ recruit: { men: 24, count: 2 } });
    // Both ends of the count are real controls, reached by a pointer and by the
    // F6/Tab focus that walks `layout.buttons`.
    expect(layout.buttons.map((button) => button.action)).toEqual(expect.arrayContaining(['recruitFewer', 'recruitMore']));
  });

  it('shows numbered control groups as visible controls', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW,
      { groups: [{ index: 1, count: 2, composition: 'Astati 1, Principi 1' }] });
    const layout = hudLayout(model, DESKTOP);

    expect(layout.groups.map((group) => group.index)).toEqual([1]);
    expect(layout.groups[0]!.rect.width).toBeGreaterThan(0);
  });

  it('says what an armed action is waiting for, and what is still queued', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], { ...DESKTOP_VIEW, paused: true },
      { armed: 'attackMove', pending: 2 });
    const layout = hudLayout(model, DESKTOP);
    const said = layout.status.map((line) => line.text).join(' ');

    expect(model.orders.armed?.id).toBe('attackMove');
    expect(said).toContain(translate('cmd.attackMove'));
    expect(said).toContain(translate('target.ground'));
    expect(said).toContain(translate('ui.pendingPaused').replace('{count}', '2'));
  });

  it('does not draw an offer outside the panel when the command list overflows', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
      { faction: 'rome', tab: 'construction' });
    const layout = hudLayout(model, { width: 1280, height: 720 });

    for (const command of layout.commands) {
      expect(command.rect.y + command.rect.height).toBeLessThanOrEqual(layout.detail.y + layout.detail.height);
    }
    expect(layout.commandScroll.page).toBeGreaterThan(0);
  });
});

it('draws the contextual commands as ink on the panel, and the armed one on its own ground', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW,
    { faction: 'rome', armed: 'attackMove' });
  const layout = hudLayout(model, DESKTOP);
  const buffer = renderPanels(model, DESKTOP);
  const ink = (rect: { x: number; y: number; width: number; height: number }): number => {
    let painted = 0;
    for (let y = rect.y; y < rect.y + rect.height; y += 1) {
      for (let x = rect.x; x < rect.x + rect.width; x += 1) {
        if (pixelAt(buffer, x, y) !== HUD_BACKGROUND) painted += 1;
      }
    }

    return painted;
  };

  expect(layout.commands.length).toBeGreaterThan(0);
  for (const command of layout.commands) expect(ink(command.rect)).toBeGreaterThan(0);
  const armed = layout.commands.find((command) => command.order.id === 'attackMove');
  expect(armed).toBeDefined();
  expect(pixelAt(buffer, armed!.rect.x + 1, armed!.rect.y + 1)).toEqual(HUD_ARMED);
});

/** The enemy Stronghold, as the page hands it to the panel: seen, with its walls. */
const ENEMY_FRONT: VisibleFront = {
  settlement: 7,
  structures: [
    { kind: 'gate', side: 'north', hp: 42, standing: true },
    { kind: 'wall', side: 'east', hp: 60, standing: true },
    { kind: 'wall', side: 'north', hp: 0, standing: false },
  ],
  breached: true,
  siege: 'assault',
  besieger: 'rome',
  ram: { hp: 60, remaining: 0, built: true },
  hold: 0,
  garrison: 2,
};

/** That Stronghold as a settlement the Faction can see (U6). */
const ENEMY_SITE: KnownSite = {
  id: 7, kind: 'stronghold', x: 80, y: 80, owner: 'carthage', memory: 'seen', front: ENEMY_FRONT,
};

/**
 * A settlement the Faction has only remembered: no front to read, and no holder
 * either, because memory records a settlement and not who holds it today.
 */
const REMEMBERED_SITE: KnownSite = {
  id: 9, kind: 'stronghold', x: 20, y: 60, owner: null, memory: 'remembered', front: null,
};

it('opens a settlement the Faction sees, with its walls, from a click on the map (U6)', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 7 }, [], {}, { sites: [ENEMY_SITE] });
  const words = model.detail?.lines.map(lineText) ?? [];

  expect(model.detail?.title).toBe('Roccaforte 7');
  expect(words).toContain(`${translate('ui.siteState')} ${translate('ui.inSight')}`);
  expect(words).toContain(`${translate('ui.holder')} ${translate('faction.carthage')}`);
  expect(words).toContain(`${translate('ui.walls')} ${message('ui.wallsStanding', { standing: 2, total: 3 })}`);
  expect(words).toContain(`${translate('ui.breach')} ${translate('ui.breached')}`);
  expect(words).toContain(`${translate('ui.ram')} ${message('ui.ramBuilt', { hp: 60 })}`);

  // Its stock is not this Faction's to read, so the bar names the settlement and says
  // the figures are unknown instead of showing four zeroes.
  const readouts = model.readouts.map(lineText);
  expect(readouts).toContain(`${translate('ui.settlement')} Roccaforte 7`);
  expect(readouts).toContain(`${translate('resource.grain')} ${translate('ui.unknown')}`);
  expect(model.commands, 'an enemy settlement has no military command card').toEqual([]);
});

it('opens a settlement it only remembers, and reads no wall into the memory (U6)', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 9 }, [], {}, { sites: [REMEMBERED_SITE] });
  const words = model.detail?.lines.map(lineText) ?? [];

  expect(model.detail?.title).toBe('Roccaforte 9');
  expect(words).toContain(`${translate('ui.siteState')} ${translate('ui.lastKnown')}`);
  // Who held it is not remembered either: the drawing carries no banner, and the
  // panel says the holder is unknown rather than naming the enemy.
  expect(words).toContain(`${translate('ui.holder')} ${translate('ui.unknown')}`);
  expect(words).toContain(`${translate('ui.walls')} ${translate('ui.frontUnknown')}`);
  // No wall standing, no breach, no ram and no garrison: the memory holds none.
  expect(words.some((line) => line.startsWith(translate('ui.wallsStanding').slice(0, 4)))).toBe(false);
  expect(words.some((line) => line.startsWith(translate('ui.ram')))).toBe(false);
  expect(words.some((line) => line.startsWith(translate('ui.garrisonCount')))).toBe(false);
});

it('drops a settlement that is neither held nor known', () => {
  const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 42 }, [], {}, { sites: [ENEMY_SITE] });

  expect(model.selected).toBeNull();
  expect(model.detail).toBeNull();
});

it('reads the enemy walls this Faction knows, and never an enemy stock', () => {
  const front: VisibleFront = {
    settlement: 7,
    structures: [
      { kind: 'gate', side: 'north', hp: 42, standing: true },
      { kind: 'wall', side: 'east', hp: 60, standing: true },
    ],
    breached: false,
    siege: 'blockade',
    besieger: 'rome',
    ram: null,
    hold: 0,
    garrison: 2,
  };
  const siege = { ...VISIBLE, fog: inspectionView(generateMap(7)), contacts: [], enemies: [], fronts: [front] };
  const model = hudModel(siege, STRONGHOLDS, { kind: 'squad', id: 1 });
  const walls = model.detail?.lines.find((line) => line.label === 'Roccaforte 7');

  expect(walls).toBeDefined();
  expect(walls?.value).toContain(`${translate('ui.walls')} 2/2`);
  expect(walls?.value).toContain(translate('ui.gate'));
  expect(walls?.value).toContain(`${translate('ui.garrisonCount')} 2`);
  expect(walls?.value).toContain(translate('cmd.blockade'));

  // The enemy's settlement is not in this Faction's settlements, so its stock —
  // which is an enemy figure — never reaches the panel.
  const words = model.detail?.lines.filter((line) => line.label === translate('resource.grain')).length;
  expect(words).toBe(0);
});

it('keeps every numbered control group reachable, wrapping the chips rather than dropping them', () => {
  const groups = Array.from({ length: 9 }, (_unused, index) => ({
    index: index + 1,
    count: 1,
    composition: 'Astati 1',
  }));
  const selected = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 2 }, [], DESKTOP_VIEW, { groups });
  // A detail long enough to scroll, so the column's own scroll buttons exist in
  // the same band as the group strip: the two must not share a pixel.
  const long = Array.from({ length: 30 }, (_unused, index) => ({ label: `Riga ${String(index)}`, value: 'valore' }));
  const model = { ...selected, detail: { ...selected.detail!, lines: [...selected.detail!.lines, ...long] } };
  const layout = hudLayout(model, DESKTOP);

  expect(layout.groups.map((group) => group.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  expect(layout.detailScroll.max).toBeGreaterThan(0);
  for (const chip of layout.groups) {
    expect(chip.rect.y + chip.rect.height).toBeLessThanOrEqual(layout.detail.y + layout.detail.height);
    expect(chip.rect.x + chip.rect.width).toBeLessThanOrEqual(layout.detail.x + layout.detail.width);
    for (const button of layout.buttons) {
      const overlaps = chip.rect.x < button.rect.x + button.rect.width
        && button.rect.x < chip.rect.x + chip.rect.width
        && chip.rect.y < button.rect.y + button.rect.height
        && button.rect.y < chip.rect.y + chip.rect.height;
      expect(overlaps, `chip ${String(chip.index)} is under the ${button.action} button`).toBe(false);
    }
    expect(hudHit(model, DESKTOP, chip.rect.x + 3, chip.rect.y + 3)).toEqual({ kind: 'group', index: chip.index });
  }
});

/**
 * The command card (#55, reorganised).
 *
 * The layout is asserted as a shape rather than as pixels: four cells to a row
 * for a Squad's verbs, one full-width row per named thing for a settlement's
 * pages, a rule where the kind of decision changes, and every label short enough
 * for the cell it sits in. What the pictures *mean* is the Atelier's and a
 * human's question; that they are drawn is the render test below.
 */
describe('the command card', () => {
  it('lays a Squad’s verbs out as a grid of pictures, ruled between the kinds of decision', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW, { faction: 'rome' });
    const layout = hudLayout(model, DESKTOP);

    // Three rows of the card: motion, orders and formation, and the Siege.
    expect(layout.commands.map((command) => command.order.id)).toEqual([
      'move', 'attackMove', 'attack',
      'hold', 'withdraw', 'formation.line', 'formation.column',
      'garrison', 'assault', 'blockade',
    ]);
    const firstRow = layout.commands.slice(0, 3).map((command) => command.rect.y);
    expect(new Set(firstRow).size).toBe(1);
    expect(layout.commands[3]!.rect.y).toBeGreaterThan(firstRow[0]!);
    expect(layout.commands[7]!.rect.y).toBeGreaterThan(layout.commands[3]!.rect.y);
    expect(layout.commandRules).toHaveLength(2);

    for (const { order, rect } of layout.commands) {
      expect(measureText(order.short, 2), order.id).toBeLessThanOrEqual(rect.width);
      expect(rect.x + rect.width).toBeLessThanOrEqual(layout.detail.x + layout.detail.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(layout.detail.y + layout.detail.height);
    }
  });

  it('gives a settlement one full-width row per thing it can raise, with its costs as badges', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'settlement', id: 0 }, [], DESKTOP_VIEW,
      { faction: 'rome', tab: 'construction' });
    const layout = hudLayout(model, DESKTOP);
    const farm = model.commands.find((order) => order.id === 'build:farm');

    expect(farm?.costs.map((cost) => cost.badge)).toContain('clock');
    expect(layout.commands.every((command) => command.rect.width === layout.commands[0]!.rect.width)).toBe(true);
    expect(layout.commandRules).toEqual([]);
  });

  it('draws each verb as ink, the muted ones in one shade, and the notice above them', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, { kind: 'squad', id: 1 }, [1], DESKTOP_VIEW,
      { faction: 'rome', notice: 'Assalto: Solo Roma ha l\'ariete' });
    const layout = hudLayout(model, DESKTOP);
    const buffer = renderPanels(model, DESKTOP);
    const colours = (rect: { x: number; y: number; width: number; height: number }): ReadonlySet<string> => {
      const seen = new Set<string>();
      for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
          const colour = pixelAt(buffer, x, y);
          if (colour[3] !== 0) seen.add(colour.join(','));
        }
      }
      return seen;
    };

    for (const { rect } of layout.commands) expect(colours(rect).size).toBeGreaterThan(1);
    const disabled = layout.commands.find((command) => !command.order.enabled);
    if (disabled !== undefined) expect(colours(disabled.rect).size).toBeGreaterThan(0);
    expect(layout.status.map((line) => line.text).join(' ')).toContain('ariete');
  });
});

/**
 * The notice strip (#58).
 *
 * The journal's own rules are `tests/ui/conditions.test.ts`'s; what is asked here
 * is that the interface *shows* it: a strip that is present when there is
 * something to say and gone when there is not, a line for each notice with the
 * heading that opens its history, a click that lands on the line a Player sees,
 * and the labelled estimate under the conditions it is about.
 */
describe('the notice strip', () => {
  const notice = (overrides: Partial<Notice>): Notice => ({
    id: 'condition:fatigue:1',
    kind: 'fatigue',
    persistent: true,
    label: 'Fatica alta: Astati 1',
    detail: '16/20',
    target: { kind: 'squad', id: 1, x: 12, y: 8 },
    raised: 10,
    lost: false,
    ...overrides,
  });

  it('says nothing when there is nothing to say', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome' });
    const layout = hudLayout(model, DESKTOP);

    expect(model.notices).toEqual([]);
    expect(model.forecast).toBeNull();
    expect(layout.notices.height).toBe(0);
    expect(layout.noticeRows).toEqual([]);
  });

  it('shows a standing condition and a brief event as different kinds of statement', () => {
    const notices = [
      notice({}),
      notice({ id: 'event:refusal:1', kind: 'refusal', persistent: false, label: 'Ordine rifiutato: Astati 1', detail: null }),
    ];
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', notices });
    const layout = hudLayout(model, DESKTOP);
    const words = [...layout.text, ...layout.priority].map((line) => line.text).join('\n');

    expect(layout.notices.height).toBeGreaterThan(0);
    // The standing condition carries `!`, the event `>`: the difference is in the
    // line a Player reads and not only in the ink it is drawn in.
    expect(words).toContain('! Fatica alta');
    expect(words).toContain('> Ordine rifiutato');
    // The condition is the brighter ink; the event is the quieter one.
    expect(layout.priority.map((line) => line.text).join(' ')).toContain('Fatica alta');
    expect(layout.text.map((line) => line.text).join(' ')).toContain('Ordine rifiutato');
  });

  it('puts the heading, the count and a clickable line on the strip', () => {
    const notices = [notice({}), notice({ id: 'condition:unpaid:1', kind: 'unpaid', label: 'Soldo non pagato: Astati 1', detail: '2 stagioni' })];
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', notices });
    const layout = hudLayout(model, DESKTOP);
    const heading = layout.buttons.find((button) => button.action === 'notices');

    expect(heading?.text).toBe(message('ui.noticesCount', { count: 2 }));
    expect(layout.noticeRows.length).toBeGreaterThan(0);
    const row = layout.noticeRows[0]!;
    expect(hudHit(model, DESKTOP, row.rect.x + 2, row.rect.y + 2)).toEqual({ kind: 'notice', id: row.id });
  });

  it('opens the current Match’s history in place, without leaving the panel', () => {
    const notices = Array.from({ length: 6 }, (_, index) => notice({
      id: `event:engaged:${String(index)}`,
      kind: 'engaged',
      persistent: false,
      label: `A contatto: Reparto ${String(index)}`,
      raised: index,
    }));
    const collapsed = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', notices });
    const expanded = hudModel(VISIBLE, STRONGHOLDS, null, [], { ...DESKTOP_VIEW, noticesOpen: true }, { faction: 'rome', notices });
    const before = hudLayout(collapsed, DESKTOP);
    const after = hudLayout(expanded, DESKTOP);

    expect(after.noticeRows.length).toBeGreaterThan(before.noticeRows.length);
    expect(after.buttons.some((button) => button.action === 'noticesNext' || button.action === 'noticesPrevious')).toBe(true);
    expect(after.notices.height).toBeGreaterThan(before.notices.height);
  });

  it('makes only a location-bearing line a control', () => {
    const notices = [
      notice({ id: 'condition:winter', kind: 'winter', label: 'Inverno in arrivo', detail: 'tra 20 s', target: null }),
      notice({}),
    ];
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', notices });
    const layout = hudLayout(model, DESKTOP);

    expect(layout.noticeRows.map((row) => row.id)).toEqual(['condition:fatigue:1']);
    for (const row of layout.noticeRows) {
      expect(hudHit(model, DESKTOP, row.rect.x + 2, row.rect.y + 2)).toEqual({ kind: 'notice', id: row.id });
    }
  });

  it('says so when a notice’s place is no longer known', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, {
      faction: 'rome',
      notices: [notice({ lost: true })],
    });
    const layout = hudLayout(model, DESKTOP);

    expect([...layout.text, ...layout.priority].map((line) => line.text).join(' ')).toContain(translate('ui.noticeLost'));
  });

  it('writes the economy’s forecast under the notices, labelled as an estimate', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, {
      faction: 'rome',
      notices: [notice({})],
      forecast: { label: translate('forecast.title'), value: '12 denari', estimate: true },
    });
    const layout = hudLayout(model, DESKTOP);
    const words = layout.text.map((line) => line.text).join(' ');

    expect(words).toContain(translate('forecast.title'));
    expect(words).toContain('12 denari');
    // The strip is over the theatre, clear of the bar above it and the minimap below.
    expect(layout.notices.y).toBeGreaterThanOrEqual(layout.bar.height);
    expect(layout.notices.y + layout.notices.height).toBeLessThanOrEqual(layout.minimap.y);
  });

  it('draws its own ground, so a warning reads over any terrain', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', notices: [notice({})] });
    const layout = hudLayout(model, DESKTOP);
    const buffer = renderPanels(model, DESKTOP);

    expect(pixelAt(buffer, layout.notices.x + 1, layout.notices.y + 1)).toEqual(HUD_BACKGROUND);
  });
});

/**
 * The first-entry guide's panel (U8, Q11).
 *
 * The guide is a floating panel of its own: not modal, not part of the detail
 * strip, and drawn where a click can reach its controls. These assertions hold
 * the geometry to the two resolutions the shared constraints name, and to the
 * one rule the interface must never break — a panel that covers the theatre is a
 * panel its clicks belong to (`hudRects` reads the same rectangle).
 */
describe('the first-entry guide panel', () => {
  const welcome = guidePanel(GUIDE_FIRST_ENTRY);

  it('places the welcome panel inside the theatre, with its controls reachable', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', guide: welcome });
    const layout = hudLayout(model, DESKTOP);

    expect(model.guide).toBe(welcome);
    expect(layout.guide.width).toBeGreaterThan(0);
    expect(layout.guide.x).toBeGreaterThanOrEqual(layout.list.width);
    expect(layout.guide.y).toBeGreaterThanOrEqual(layout.bar.height);
    expect(layout.guide.y + layout.guide.height).toBeLessThanOrEqual(layout.detail.y);
    expect(layout.guideText.map((line) => line.text).join(' ')).toContain(translate('guide.welcomeObjective'));
    expect(layout.guideButtons.map((button) => button.action)).toEqual(['guideBegin', 'guideSkip']);
    for (const button of layout.guideButtons) {
      expect(button.rect.x).toBeGreaterThanOrEqual(layout.guide.x);
      expect(button.rect.x + button.rect.width).toBeLessThanOrEqual(layout.guide.x + layout.guide.width);
      expect(button.rect.y + button.rect.height).toBeLessThanOrEqual(layout.guide.y + layout.guide.height);
      expect(hudHit(model, DESKTOP, button.rect.x + 2, button.rect.y + 2)).toEqual({ kind: 'button', action: button.action });
    }
  });

  it('fits the panel and its lines at both reference resolutions', () => {
    for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
      const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', guide: welcome });
      const layout = hudLayout(model, size);

      expect(layout.guide.width, `${String(size.width)}: the panel is drawn`).toBeGreaterThan(0);
      expect(layout.guide.y + layout.guide.height).toBeLessThanOrEqual(layout.detail.y);
      for (const line of layout.guideText) {
        expect(line.rect.y + line.rect.height).toBeLessThanOrEqual(layout.guide.y + layout.guide.height);
      }
      // The notice strip keeps the top-right corner; the guide keeps the left.
      expect(layout.guide.x + layout.guide.width).toBeLessThanOrEqual(layout.notices.x);
    }
  });

  it('draws nothing and blocks nothing when the guide is closed', () => {
    const open = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', guide: welcome });
    const closed = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', guide: null });
    const was = hudLayout(open, DESKTOP).guide;
    const layout = hudLayout(closed, DESKTOP);

    expect(closed.guide).toBeNull();
    expect(layout.guide).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    expect(layout.guideButtons).toEqual([]);
    expect(hudHit(closed, DESKTOP, was.x + 4, was.y + 4)).toBeNull();
  });

  it('draws the panel’s own ground and its words on it', () => {
    const model = hudModel(VISIBLE, STRONGHOLDS, null, [], DESKTOP_VIEW, { faction: 'rome', guide: welcome });
    const layout = hudLayout(model, DESKTOP);
    const buffer = renderPanels(model, DESKTOP);
    const ink = (rect: { x: number; y: number; width: number; height: number }): number => {
      let painted = 0;
      for (let y = rect.y; y < rect.y + rect.height; y += 1) {
        for (let x = rect.x; x < rect.x + rect.width; x += 1) {
          if (pixelAt(buffer, x, y) !== HUD_BACKGROUND) painted += 1;
        }
      }

      return painted;
    };

    expect(pixelAt(buffer, layout.guide.x + 1, layout.guide.y + 1)).toEqual(HUD_BACKGROUND);
    expect(ink({ x: layout.guide.x + 3, y: layout.guide.y + 3, width: layout.guide.width - 6, height: layout.guide.height - 6 }))
      .toBeGreaterThan(0);
  });
});
