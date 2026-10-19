/**
 * The HUD: the readouts, the selection panels and where everything stands
 * (ticket B7).
 *
 * One module owns three things that have to agree with one another: the **model**
 * a Player reads (the words and numbers, in Italian, from the string table), the
 * **layout** those words occupy on the screen, and the **plate** the renderer
 * uploads. They are together because they are one decision: a row a Player can
 * see and a row a click selects must be the same rectangle, and splitting the
 * drawing from the hit-testing is how an interface ends up with a button that
 * does not press where it looks.
 *
 * ## What it draws, and what it deliberately does not
 *
 * The top bar carries the year, the Season, the treasury and the four resources
 * of the settlement in focus — the Stronghold when nothing is selected, because
 * a readout with nothing in it is a readout a Player learns to ignore. The left
 * column lists every settlement and every Squad the Faction holds, and the panel
 * under it says what the selected one is: a settlement's tier, people, stock,
 * labour and works; a Squad's morale, Payroll and the Seasons it has gone unpaid.
 *
 * The **HUD is screen-space**. It is composed at the viewport's own size and
 * drawn over the theatre without the camera, which is what "legible at every zoom
 * level the camera allows" means here: at 1× and at 8× a 5×7 glyph is the same
 * five by seven screen pixels, and no panel is ever magnified into a smear or
 * shrunk into a rumour. The minimap is the one piece that changes with the
 * camera, because marking what the camera is showing is the whole of its job.
 *
 * ## No engine, no clock
 *
 * `renderHud` is pure: it takes the model, the minimap plate and the viewport's
 * size, and returns a `PixelBuffer`. The page uploads it; a test reads it in
 * Node; the same pixels come out of both (PLAN §3).
 */
import { LINE_GAP, LINE_HEIGHT, drawText, measureText } from '../art/font.ts';
import { BASE, RAMPS, shadeAt } from '../art/palette.ts';
import {
  TRANSPARENT,
  blit,
  createPixelBuffer,
  fillRect,
  strokeRect,
  type PixelBuffer,
  type Rgba,
} from '../art/pixel-buffer.ts';
import { amountOf } from '../content/index.ts';
import type { EconomyVisible, VisibleSettlement, VisibleSquad } from '../sim/economy-match.ts';
import { RESOURCE_KINDS, type ResourceKind } from '../sim/map.ts';
import {
  MINIMAP_PLATE_HEIGHT,
  MINIMAP_PLATE_WIDTH,
} from './minimap.ts';
import { message, refusalLabel, resourceLabel, seasonLabel, squadLabel, translate, workLabel } from './strings.ts';

/** What a Player has selected, or `null` for nothing. */
export type Selection =
  | { readonly kind: 'settlement'; readonly id: number }
  | { readonly kind: 'squad'; readonly id: number };

/** One labelled figure: what a readout and a panel line are made of. */
export interface HudLine {
  /** The Italian word for it, from the string table. */
  readonly label: string;
  /** The figure, as a Player reads it. */
  readonly value: string;
}

/**
 * One figure in the top bar.
 *
 * A readout is a line with two things a panel line does not have. `large` says
 * its figure is a **numeral** and so is drawn at the plan's large size — a word
 * at that size is a wall of pixels, and the plan's "large numerals for
 * resources" is about numbers. `newRow` says the readout starts a row, which is
 * how the bar keeps the resources together instead of wrapping wherever the
 * words happen to end.
 */
export interface HudReadout extends HudLine {
  /** Whether the figure is drawn at the large size. */
  readonly large: boolean;
  /** Whether this readout starts a new row of the bar. */
  readonly newRow: boolean;
}

/** One selectable row: a settlement or a Squad, as the list shows it. */
export interface HudRow {
  /** What clicking it selects. */
  readonly selection: Selection;
  /** The name a Player reads, e.g. `Roccaforte` or `Astati`. */
  readonly label: string;
  /** The one figure that matters on the list: a tier, or a Payroll. */
  readonly note: string;
}

/** What the selected thing is, in full. */
export interface HudDetail {
  /** Its name and id, e.g. `Insediamento minore 2`. */
  readonly title: string;
  /** The figures that matter, in the order a Player reads them. */
  readonly lines: readonly HudLine[];
  /** Order/refusal, or the first active Work: kept above the scrolling figures. */
  readonly priority: readonly HudLine[];
}

/** Presentation memory only; never part of the Match. Offsets count bitmap text lines. */
export interface HudView {
  readonly paused?: boolean;
  readonly listOffset?: number;
  readonly detailOffset?: number;
}

export interface HudText {
  readonly text: string;
  readonly rect: Rect;
}

export interface HudScroll {
  readonly offset: number;
  readonly max: number;
  readonly page: number;
}

export type HudAction = 'pause' | 'listPrevious' | 'listNext' | 'detailPrevious' | 'detailNext';

export interface HudButton {
  readonly action: HudAction;
  readonly text: string;
  readonly rect: Rect;
  readonly enabled: boolean;
}

/** Everything the HUD says, at one moment, with nothing about where it goes. */
export interface HudModel {
  readonly view: HudView;
  /** The top bar, in reading order. */
  readonly readouts: readonly HudReadout[];
  /** Every settlement and Squad the Faction holds, in list order. */
  readonly rows: readonly HudRow[];
  /** What is selected, or `null`. */
  readonly detail: HudDetail | null;
  /** Which row the panel belongs to, or `null`. */
  readonly selected: Selection | null;
  /**
   * Every row a Player has picked, which is not the same as the panel's.
   *
   * Box selection (C2) picks several Squads at once, and an order goes to all of
   * them while the panel shows the first. A list that highlighted only the panel
   * would tell a Player that the other four men they dragged over are not in the
   * order they are about to give.
   */
  readonly picked: readonly Selection[];
}

/** The viewport the HUD is composed for, in screen pixels. */
export interface HudSize {
  readonly width: number;
  readonly height: number;
}

/** A rectangle on the HUD, in screen pixels. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A heading in the list, with where it stands. */
export interface HudHeader {
  readonly text: string;
  readonly rect: Rect;
}

/** Where a row is, so that drawing it and clicking it cannot disagree. */
export interface RowRect {
  readonly selection: Selection;
  readonly rect: Rect;
}

/** Where a readout stands, so that the bar's height and its drawing cannot disagree. */
export interface ReadoutRect {
  readonly line: HudReadout;
  readonly rect: Rect;
}

/** The whole HUD, placed: every rectangle the renderer draws and the hit test reads. */
export interface HudLayout {
  readonly size: HudSize;
  readonly bar: Rect;
  readonly list: Rect;
  readonly detail: Rect;
  readonly minimap: Rect;
  readonly readouts: readonly ReadoutRect[];
  readonly headers: readonly HudHeader[];
  readonly rows: readonly RowRect[];
  readonly text: readonly HudText[];
  readonly priority: readonly HudText[];
  readonly buttons: readonly HudButton[];
  readonly listScroll: HudScroll;
  readonly detailScroll: HudScroll;
}

/** Air between a panel's edge and its text. */
const PADDING = 3;

/** One line of HUD text and the air under it, at scale one. */
const LINE_STEP = LINE_HEIGHT + LINE_GAP;

/** The magnification of a readout's figure: the plan's large numerals. */
const VALUE_SCALE = 2;

/** Air between two readouts on one row of the bar. */
const READOUT_GAP = 6;

/** One row of the bar: a large numeral's line box. */
const READOUT_ROW_HEIGHT = VALUE_SCALE * LINE_HEIGHT;

/** Air between a readout's label and its figure. */
const READOUT_INK_GAP = 2;

/** The left column's width: wide enough for `Insediamento minore 3` and its note. */
const LIST_WIDTH = 150;

/** Room for a pinned Order/Work and a scrolling body within the existing column. */
const DETAIL_HEIGHT = 128;

/** Air between the minimap and the screen's edge. */
const MINIMAP_MARGIN = 2;

/** The panel's ground: opaque, so a glyph is legible over any terrain. */
export const HUD_BACKGROUND: Rgba = BASE.night;

/** The panel's edge. */
export const HUD_BORDER: Rgba = shadeAt(RAMPS.stone, 2);

/** The ink a label is written in: quieter than a figure. */
export const HUD_LABEL: Rgba = shadeAt(RAMPS.parchment, 3);

/** The ink a figure is written in. */
export const HUD_VALUE: Rgba = shadeAt(RAMPS.parchment, 6);

/** The ground a selected row stands on. */
export const HUD_SELECTED: Rgba = shadeAt(RAMPS.bronze, 1);

/**
 * The HUD's own view of a Faction's economy, as the words and figures a Player
 * reads.
 *
 * `strongholds` is the settlement ids that are Strongholds, because the
 * Observation says where a settlement stands and not what it is; `selection` is
 * what the Player has clicked, and a selection that is no longer in the window
 * is dropped rather than shown as a stale panel.
 */
export function hudModel(
  visible: EconomyVisible,
  strongholds: readonly number[],
  selection: Selection | null,
  squadSelection: readonly number[] = [],
  view: HudView = {},
): HudModel {
  const picked = pickedSquads(visible, squadSelection);
  const selected = findSelection(visible, selection) ?? (selection?.kind === 'squad' ? picked[0] ?? null : null);
  const focus = focusSettlement(visible, selected);

  return {
    view,
    readouts: readouts(visible, focus, strongholds),
    rows: rows(visible, strongholds),
    detail: selected === null ? null : detail(visible, strongholds, selected),
    selected,
    picked: selected !== null && selected.kind === 'squad' && !picked.some((row) => row.id === selected.id)
      ? [...picked, selected]
      : picked,
  };
}

/** The picked Squads the Faction still holds, as the rows a highlight can name. */
function pickedSquads(visible: EconomyVisible, ids: readonly number[]): readonly Selection[] {
  return visible.squads
    .filter((squad) => ids.includes(squad.id))
    .map((squad) => ({ kind: 'squad' as const, id: squad.id }));
}

/** Where everything stands, given what the HUD says. */
export function hudLayout(model: HudModel, size: HudSize): HudLayout {
  const readouts = placeReadouts(model.readouts, size);
  const rowsHeight = readouts.reduce((tallest, placed) => Math.max(tallest, placed.rect.y + placed.rect.height), 0);
  const pauseY = rowsHeight + PADDING;
  const bar: Rect = { x: 0, y: 0, width: size.width, height: pauseY + 2 * LINE_STEP + PADDING };
  const detail: Rect = {
    x: 0,
    y: Math.max(bar.height, size.height - DETAIL_HEIGHT),
    width: LIST_WIDTH,
    height: DETAIL_HEIGHT,
  };
  const list: Rect = { x: 0, y: bar.height, width: LIST_WIDTH, height: Math.max(0, detail.y - bar.height) };
  const minimap: Rect = {
    x: size.width - MINIMAP_PLATE_WIDTH - MINIMAP_MARGIN,
    y: size.height - MINIMAP_PLATE_HEIGHT - MINIMAP_MARGIN,
    width: MINIMAP_PLATE_WIDTH,
    height: MINIMAP_PLATE_HEIGHT,
  };

  const headers: HudHeader[] = [];
  const rows: RowRect[] = [];
  const text: HudText[] = [];
  const buttons: HudButton[] = [{
    action: 'pause', text: translate(model.view.paused ? 'ui.resume' : 'ui.pause'),
    rect: { x: PADDING, y: pauseY, width: 142, height: 2 * LINE_STEP }, enabled: true,
  }];
  text.push({ text: translate(model.view.paused ? 'ui.paused' : 'ui.running'),
    rect: { x: LIST_WIDTH + PADDING, y: pauseY + 4, width: size.width - LIST_WIDTH - 2 * PADDING, height: LINE_STEP } });

  for (const [index, kind] of (['settlement', 'squad'] as const).entries()) {
    headers.push({ text: message('ui.listCount', {
      name: translate(kind === 'settlement' ? 'ui.settlements' : 'ui.squads'),
      count: model.rows.filter((row) => row.selection.kind === kind).length,
    }), rect: { x: PADDING + 1, y: list.y + PADDING + index * LINE_STEP, width: LIST_WIDTH - 2 * PADDING - 2, height: LINE_STEP } });
  }

  const width = LIST_WIDTH - 2 * PADDING - 2;
  const listLines = model.rows.flatMap((row) => [
    ...wrapText(message('ui.listItem', { name: row.label, id: row.selection.id }), width),
    ...wrapText(row.note, width),
  ].map((line) => ({ text: line, selection: row.selection })));
  const listBody = { x: PADDING + 1, y: list.y + PADDING + 2 * LINE_STEP, width, height: list.height - 2 * PADDING - 4 * LINE_STEP };
  const listScroll = scrollWindow(model.view.listOffset ?? 0, listLines.length, listBody.height);
  for (const [index, line] of listLines.slice(listScroll.offset, listScroll.offset + listScroll.page).entries()) {
    const rect = { x: listBody.x, y: listBody.y + index * LINE_STEP, width, height: LINE_STEP };
    text.push({ text: line.text, rect });
    const previous = rows.at(-1);
    if (previous !== undefined && sameSelection(previous.selection, line.selection)) {
      rows[rows.length - 1] = { selection: line.selection, rect: { ...previous.rect, height: previous.rect.height + LINE_STEP } };
    } else rows.push({ selection: line.selection, rect: { ...rect, x: 1, width: LIST_WIDTH - 2 } });
  }
  addScrollButtons(buttons, list, 'list', listScroll);

  let detailY = detail.y + PADDING;
  const place = (words: readonly string[], destination: HudText[]): void => {
    for (const word of words) {
      destination.push({ text: word, rect: { x: PADDING + 1, y: detailY, width, height: LINE_STEP } });
      detailY += LINE_STEP;
    }
  };
  const priority: HudText[] = [];
  let secondary: string[] = [];
  if (model.detail !== null) {
    place(wrapText(model.detail.title, width), priority);
    for (const line of model.detail.priority) place(wrapText(`${line.label}: ${line.value}`, width), priority);
    detailY += PADDING;
    secondary = model.detail.lines
      .filter((line) => !model.detail?.priority.some((pinned) => pinned.label === line.label && pinned.value === line.value))
      .flatMap((line) => wrapText(`${line.label}: ${line.value}`, width));
  }
  const detailScroll = scrollWindow(model.view.detailOffset ?? 0, secondary.length, detail.y + detail.height - 2 * LINE_STEP - PADDING - detailY);
  place(secondary.slice(detailScroll.offset, detailScroll.offset + detailScroll.page), text);
  addScrollButtons(buttons, detail, 'detail', detailScroll);

  return { size, bar, list, detail, minimap, readouts, headers, rows, text, priority, buttons, listScroll, detailScroll };
}

/** Wraps every glyph, including a value with no spaces; nothing is ellipsised away. */
function wrapText(text: string, width: number): string[] {
  const lines: string[] = [];
  let remaining = text;
  while (measureText(remaining) > width) {
    let end = 1;
    while (end < remaining.length && measureText(remaining.slice(0, end + 1)) <= width) end += 1;
    const space = remaining.lastIndexOf(' ', end);
    if (space > 0) end = space;
    lines.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining !== '') lines.push(remaining);
  return lines;
}

function scrollWindow(requested: number, total: number, height: number): HudScroll {
  const page = Math.max(1, Math.floor(height / LINE_STEP));
  const max = Math.max(0, total - page);
  const offset = Math.min(max, Math.max(0, Math.trunc(requested)));
  return { offset, max, page };
}

function addScrollButtons(buttons: HudButton[], rect: Rect, region: 'list' | 'detail', scroll: HudScroll): void {
  if (scroll.max === 0) return;
  const y = rect.y + rect.height - 2 * LINE_STEP - 1;
  buttons.push({ action: `${region}Previous`, text: translate('ui.previous'),
    rect: { x: rect.x + 1, y, width: 70, height: 2 * LINE_STEP }, enabled: scroll.offset > 0 });
  buttons.push({ action: `${region}Next`, text: translate('ui.next'),
    rect: { x: rect.x + 74, y, width: 75, height: 2 * LINE_STEP }, enabled: scroll.offset < scroll.max });
}

/**
 * The bar's readouts, wrapped into rows and placed.
 *
 * The wrapping lives with the layout rather than with the drawing, because the
 * bar's *height* depends on how many rows its words need: a translation, or a
 * third resource, moves the list down instead of being clipped at the screen's
 * edge. A readout that says `newRow` starts one — that is how the resources stay
 * together — and one that does not fit on the current row starts the next.
 */
function placeReadouts(readouts: readonly HudReadout[], size: HudSize): readonly ReadoutRect[] {
  const placed: ReadoutRect[] = [];
  let row = 0;
  let x = PADDING;

  for (const line of readouts) {
    const width = readoutWidth(line);
    const startsRow = placed.length > 0 && (line.newRow || x + width > size.width - PADDING);

    if (startsRow) {
      row += 1;
      x = PADDING;
    }

    placed.push({ line, rect: { x, y: PADDING + row * READOUT_ROW_HEIGHT, width, height: READOUT_ROW_HEIGHT } });
    x += width + READOUT_GAP;
  }

  return placed;
}

/** How wide a readout is: its label, the gap, and its figure at its own scale. */
function readoutWidth(line: HudReadout): number {
  return measureText(line.label) + READOUT_INK_GAP + measureText(line.value, line.large ? VALUE_SCALE : 1);
}

/** Which row a screen point lands on, or `null` for the theatre. */
export function hitTest(model: HudModel, size: HudSize, x: number, y: number): Selection | null {
  const layout = hudLayout(model, size);
  if (!contains(layout.list, x, y)) return null;

  for (const row of layout.rows) {
    if (contains(row.rect, x, y)) return row.selection;
  }

  return null;
}

/**
 * The HUD's panels alone, as one transparent plate.
 *
 * Transparent everywhere it draws nothing, so the page can put it over the
 * theatre: the theatre is the ground the interface stands on, not a second
 * canvas. The minimap is deliberately not here — it is the one part of the HUD
 * that changes when the camera moves, and keeping it on a plate of its own is
 * what keeps a pan from recomposing the whole interface.
 */
export function renderPanels(model: HudModel, size: HudSize): PixelBuffer {
  const layout = hudLayout(model, size);
  const buffer = createPixelBuffer(size.width, size.height, TRANSPARENT);

  panel(buffer, layout.bar);
  panel(buffer, layout.list);
  panel(buffer, layout.detail);
  drawReadouts(buffer, layout.readouts);

  for (const header of layout.headers) {
    drawText(buffer, header.text, header.rect.x, header.rect.y, HUD_LABEL);
  }

  for (const row of layout.rows) {
    if (model.picked.some((picked) => sameSelection(picked, row.selection)) ||
      (model.selected !== null && sameSelection(model.selected, row.selection))) {
      fillRect(buffer, row.rect.x, row.rect.y, row.rect.width, row.rect.height, HUD_SELECTED);
    }
  }
  for (const line of layout.text) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_LABEL);
  for (const line of layout.priority) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_VALUE);
  for (const button of layout.buttons) {
    panel(buffer, button.rect);
    drawText(buffer, button.text, button.rect.x + PADDING, button.rect.y + 5, button.enabled ? HUD_VALUE : HUD_BORDER);
  }

  return buffer;
}

/**
 * The whole HUD as one transparent plate, with the minimap in its corner.
 *
 * @throws RangeError when the minimap is not the size the layout reserves for
 *   it: a plate of another size would be drawn off its frame, and a caller that
 *   has built the wrong one is worth telling.
 */
export function renderHud(model: HudModel, minimap: PixelBuffer, size: HudSize): PixelBuffer {
  const layout = hudLayout(model, size);
  if (minimap.width !== layout.minimap.width || minimap.height !== layout.minimap.height) {
    throw new RangeError(
      `the minimap is ${String(minimap.width)}×${String(minimap.height)} and the layout reserves ` +
        `${String(layout.minimap.width)}×${String(layout.minimap.height)}`,
    );
  }

  const buffer = renderPanels(model, size);
  blit(buffer, minimap, layout.minimap.x, layout.minimap.y);

  return buffer;
}

/**
 * The bar, in reading order: the settlement whose stock is shown, the date, the
 * treasury, and the four resources — each row starting where the next one has to.
 */
function readouts(
  visible: EconomyVisible,
  focus: VisibleSettlement | null,
  strongholds: readonly number[],
): readonly HudReadout[] {
  const lines: HudReadout[] = [
    {
      label: translate('ui.settlement'),
      value:
        focus === null
          ? translate('ui.nothingSelected')
          : message('ui.listItem', { name: settlementName(focus, strongholds), id: focus.id }),
      large: false,
      newRow: true,
    },
    { label: translate('ui.year'), value: String(visible.year), large: true, newRow: false },
    { label: translate('ui.season'), value: seasonLabel(visible.season), large: false, newRow: false },
    { label: translate('ui.treasury'), value: String(visible.treasury), large: true, newRow: false },
  ];

  for (const [index, kind] of RESOURCE_KINDS.entries()) {
    lines.push({
      label: resourceLabel(kind),
      value: String(focus === null ? 0 : stockOf(focus, kind)),
      large: true,
      newRow: index === 0,
    });
  }

  return lines;
}

/** Every settlement and Squad the Faction holds, in the order the Observation keeps them. */
function rows(visible: EconomyVisible, strongholds: readonly number[]): readonly HudRow[] {
  return [
    ...visible.settlements.map((settlement) => ({
      selection: { kind: 'settlement' as const, id: settlement.id },
      label: settlementName(settlement, strongholds),
      note: `${translate('ui.tier')} ${String(settlement.tier)}`,
    })),
    ...visible.squads.map((squad) => ({
      selection: { kind: 'squad' as const, id: squad.id },
      label: squadLabel(squad.type),
      note: `${translate('ui.payroll')} ${String(squad.payroll)}`,
    })),
  ];
}

/** The panel: what the selected settlement or Squad is. */
function detail(
  visible: EconomyVisible,
  strongholds: readonly number[],
  selected: Selection,
): HudDetail | null {
  if (selected.kind === 'settlement') {
    const settlement = visible.settlements.find((candidate) => candidate.id === selected.id);
    if (settlement === undefined) return null;

    const lines = settlementLines(settlement);
    const active = settlement.works.findIndex((work) => !work.standing);
    const work = lines.filter((line) => line.label === translate('ui.works'))[Math.max(0, active)];
    return {
      title: message('ui.listItem', { name: settlementName(settlement, strongholds), id: settlement.id }),
      lines,
      priority: work === undefined ? [] : [work],
    };
  }

  const squad = visible.squads.find((candidate) => candidate.id === selected.id);
  if (squad === undefined) return null;

  const lines = squadLines(squad);
  return {
    title: message('ui.listItem', { name: translate('ui.squad'), id: squad.id }),
    lines,
    priority: lines.filter((line) => line.label === translate('ui.order')),
  };
}

/** A settlement's figures: what it is, what it has, and what it is raising. */
function settlementLines(settlement: VisibleSettlement): readonly HudLine[] {
  const lines: HudLine[] = [
    { label: translate('ui.tier'), value: String(settlement.tier) },
    { label: translate('ui.population'), value: String(settlement.population) },
  ];

  for (const kind of RESOURCE_KINDS) {
    lines.push({ label: resourceLabel(kind), value: String(stockOf(settlement, kind)) });
  }

  // The land is one line rather than four, in the resources' own order, so that
  // the panel reads as columns a Player compares instead of a list that grows.
  lines.push({
    label: translate('ui.labour'),
    value: RESOURCE_KINDS.map((kind) => String(landOf(settlement, kind))).join('/'),
  });

  if (settlement.works.length === 0) {
    lines.push({ label: translate('ui.works'), value: translate('ui.none') });
  }
  for (const work of settlement.works) {
    lines.push({
      label: translate('ui.works'),
      value: `${workLabel(work.building)} - ${
        work.standing
          ? translate('ui.workStanding')
          : `${translate('ui.workBuilding')} ${message('ui.ticksLeft', { ticks: work.remaining })}`
      }`,
    });
  }

  return lines;
}

/** A Squad's figures: what it is, what it has left to fight with, what it owes, and what it is doing. */
function squadLines(squad: VisibleSquad): readonly HudLine[] {
  return [
    { label: translate('ui.type'), value: squadLabel(squad.type) },
    { label: translate('ui.men'), value: String(squad.men) },
    { label: translate('ui.morale'), value: String(squad.morale) },
    { label: translate('ui.fatigue'), value: String(squad.fatigue) },
    { label: translate('ui.ammunition'), value: String(squad.ammunition) },
    { label: translate('ui.payroll'), value: String(squad.payroll) },
    { label: translate('ui.unpaid'), value: String(squad.unpaid) },
    { label: translate('ui.home'), value: String(squad.home) },
    { label: translate('ui.order'), value: orderLabel(squad) },
  ];
}

/**
 * What a Squad is doing, as a Player reads it: whether it has broken and is
 * running, the reason its last order was refused if one was, and otherwise
 * whether it is walking.
 *
 * A rout goes first because it *overrides* the other two: a running Squad is not
 * obeying orders and is not holding a refusal, and a panel that said "In marcia"
 * about it would be telling the Player they are still in command of it (C3).
 * A refusal comes next, because it is the answer to a question the Player has
 * already asked — they clicked, nothing moved, and this is why (`ui/strings.ts`
 * says the words). A Squad standing still because it has arrived and one that
 * was never ordered anywhere are the same state (C1) and read the same way.
 */
function orderLabel(squad: VisibleSquad): string {
  if (squad.routing) return translate('order.routing');
  if (squad.refused !== null) return refusalLabel(squad.refused);

  return translate(squad.goal === null ? 'order.standing' : 'order.marching');
}

/** The name a settlement reads as: its Stronghold status, not its id. */
function settlementName(settlement: VisibleSettlement, strongholds: readonly number[]): string {
  return strongholds.includes(settlement.id) ? translate('ui.stronghold') : translate('ui.minorSettlement');
}

/** The settlement the readouts are about: the selected one, or the first the Faction holds. */
function focusSettlement(visible: EconomyVisible, selected: Selection | null): VisibleSettlement | null {
  if (selected !== null && selected.kind === 'settlement') {
    const settlement = visible.settlements.find((candidate) => candidate.id === selected.id);
    if (settlement !== undefined) return settlement;
  }

  return visible.settlements[0] ?? null;
}

/** A selection, when the Faction's window still holds it. */
function findSelection(visible: EconomyVisible, selection: Selection | null): Selection | null {
  if (selection === null) return null;

  const held =
    selection.kind === 'settlement'
      ? visible.settlements.some((candidate) => candidate.id === selection.id)
      : visible.squads.some((candidate) => candidate.id === selection.id);

  return held ? selection : null;
}

/** One of a settlement's four stocks. */
function stockOf(settlement: VisibleSettlement, kind: ResourceKind): number {
  return amountOf(settlement.stocks, kind);
}

/** How many of a settlement's people work the land for one resource. */
function landOf(settlement: VisibleSettlement, kind: ResourceKind): number {
  return amountOf(settlement.land, kind);
}

/** A panel: a dark ground and a one-pixel edge. */
function panel(buffer: PixelBuffer, rect: Rect): void {
  fillRect(buffer, rect.x, rect.y, rect.width, rect.height, HUD_BACKGROUND);
  strokeRect(buffer, rect.x, rect.y, rect.width, rect.height, HUD_BORDER);
}

/**
 * The bar: a label at HUD size and its figure, the figure large where it is a
 * numeral, their baselines aligned so a row of them reads as one line.
 */
function drawReadouts(buffer: PixelBuffer, readouts: readonly ReadoutRect[]): void {
  for (const { line, rect } of readouts) {
    const scale = line.large ? VALUE_SCALE : 1;
    const valueX = rect.x + measureText(line.label) + READOUT_INK_GAP;

    drawText(buffer, line.label, rect.x, rect.y + (VALUE_SCALE - 1) * LINE_HEIGHT, HUD_LABEL);
    drawText(buffer, line.value, valueX, rect.y, HUD_VALUE, scale);
  }
}

/** Whether two selections name the same thing. */
function sameSelection(left: Selection, right: Selection): boolean {
  return left.kind === right.kind && left.id === right.id;
}

/** Whether a rectangle holds a screen point. */
function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}
