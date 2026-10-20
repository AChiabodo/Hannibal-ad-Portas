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
  pixelAt,
  strokeRect,
  type PixelBuffer,
  type Rgba,
} from '../art/pixel-buffer.ts';
import { amountOf } from '../content/index.ts';
import type { EconomyVisible, VisibleSettlement, VisibleSquad } from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { SEASON_TICKS } from '../sim/season.ts';
import { RESOURCE_KINDS, type ResourceKind } from '../sim/map.ts';
import type { VisibleFront } from '../sim/siege.ts';
import {
  SETTLEMENT_TABS,
  groupSummary,
  knownEnemyFronts,
  knownFront,
  menOf,
  moraleOf,
  settlementOrders,
  squadOrders,
  type ControlGroupView,
  type GroupSummary,
  type OrderOption,
  type SettlementTab,
} from './orders.ts';
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
  /** Indices of Order/refusal or the first active Work, above the scrolling figures. */
  readonly priority: readonly number[];
}

/**
 * What the panel says about a Command that has been given, or is being aimed.
 *
 * `status` is the seam's word and not the rules': `pending` is queued for the
 * next tick, `applied` is in the Match's log. A refusal is a different thing —
 * it is the rules' answer, and a Squad carries it in its own Observation line
 * (`refused`), which is why this record never guesses one.
 */
export interface HudOrderStatus {
  /** The verb a Player pressed, as the button said it. */
  readonly name: string;
  /** Whether it is still queued or has reached the Match. */
  readonly status: 'pending' | 'applied';
  /** The tick it was given on. */
  readonly tick: number;
  /** What the panel knew about the selection when it was given, e.g. `1 su 2 a portata`. */
  readonly detail: string | null;
}

/**
 * The Player's own state around the commands: what is armed, what is queued, and
 * whether a group can be returned to.
 *
 * Presentation memory all of it (like the selection), never part of the Match.
 */
export interface HudOrdersView {
  /** The action waiting for a click, or `null`. */
  readonly armed: OrderOption | null;
  /** How many orders are queued for the next tick. */
  readonly pending: number;
  /** The last order given, and whether it has reached the Match. */
  readonly last: HudOrderStatus | null;
  /** Whether opening an exception from a group left a way back to it. */
  readonly backToGroup: boolean;
}

/**
 * What the page knows beside the Observation: its Faction, the open settlement
 * page, and the Player's own command and group memory.
 *
 * Separate from `HudView` because it is *content* — it changes what the panel is
 * about — while a `HudView` is where the panel is drawn and how far it scrolls.
 */
export interface HudSession {
  /** The Faction the panel is written for: a Siege offer depends on it (ADR-0008). */
  readonly faction?: Faction;
  /** Which page of a settlement's panel is open. */
  readonly tab?: SettlementTab;
  /** The armed action's id, or `null`. */
  readonly armed?: string | null;
  /** How many orders are queued. */
  readonly pending?: number;
  /** The last order given. */
  readonly last?: HudOrderStatus | null;
  /** The numbered control groups the Player has bound. */
  readonly groups?: readonly ControlGroupView[];
  /** Whether the panel is showing an individual opened from a group. */
  readonly backToGroup?: boolean;
  /** Whether the Match is over, which closes every offer. */
  readonly ended?: boolean;
}

/** Presentation memory only; never part of the Match. Offsets count bitmap text lines. */
export interface HudView {
  readonly desktop?: boolean;
  readonly sessionOpen?: boolean;
  readonly scaleWarning?: boolean;
  readonly smallWindow?: boolean;
  readonly uiScale?: number;
  readonly navigator?: boolean;
  readonly navigatorExpanded?: boolean;
  readonly guideDismissed?: boolean;
  readonly tick?: number;
  readonly ended?: boolean;
  readonly speed?: number;
  readonly paused?: boolean;
  readonly listOffset?: number;
  readonly detailOffset?: number;
  readonly commandOffset?: number;
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

export type HudAction = 'session' | 'speed1' | 'speed2' | 'speed3' | 'navigator' | 'center' | 'pause' | 'listPrevious' | 'listNext' | 'detailPrevious' | 'detailNext' | 'commandsPrevious' | 'commandsNext' | 'groupBack';

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
  /** The contextual actions this selection has, in panel order (#55). */
  readonly commands: readonly OrderOption[];
  /** Which page of a settlement's panel is open. */
  readonly tab: SettlementTab;
  /** The multi-selection summary, when more than one Squad is picked. */
  readonly group: GroupSummary | null;
  /** The numbered control groups, as visible controls. */
  readonly groups: readonly ControlGroupView[];
  /** What is armed, queued or just given. */
  readonly orders: HudOrdersView;
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
  /** Where each contextual action stands, so drawing it and pressing it agree. */
  readonly commands: readonly CommandRect[];
  /** Where each settlement page's tab stands. */
  readonly tabs: readonly TabRect[];
  /** Where each numbered control group stands. */
  readonly groups: readonly GroupRect[];
  /** The exceptions of a mixed selection, each a row that opens one Squad. */
  readonly exceptions: readonly RowRect[];
  /** The lines the command area is saying: armed, pending, last given. */
  readonly status: readonly HudText[];
  /** How far the command list is scrolled, and how far it can be. */
  readonly commandScroll: HudScroll;
}

/** A contextual action and the rectangle a click presses it in. */
export interface CommandRect {
  readonly order: OrderOption;
  readonly rect: Rect;
}

/** A settlement page's tab and where it stands. */
export interface TabRect {
  readonly tab: SettlementTab;
  readonly rect: Rect;
}

/** A numbered control group and where its chip stands. */
export interface GroupRect {
  readonly index: number;
  readonly rect: Rect;
}

/** What a click on the interface lands on, in the order the panels stack. */
export type HudHit =
  | { readonly kind: 'selection'; readonly selection: Selection }
  | { readonly kind: 'order'; readonly order: OrderOption }
  | { readonly kind: 'tab'; readonly tab: SettlementTab }
  | { readonly kind: 'group'; readonly index: number }
  | { readonly kind: 'button'; readonly action: HudAction };

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

/** How tall the desktop's detail panel is: a share of the screen, within bounds. */
const DETAIL_SHARE = 0.42;

/** The narrowest a desktop detail panel is drawn, in bitmap pixels. */
const DETAIL_MIN_HEIGHT = 132;

/** The tallest, so that a large window leaves the theatre most of its height. */
const DETAIL_MAX_HEIGHT = 190;

/** One contextual action's row: its text, its air, and the rule between two. */
const COMMAND_ROW = LINE_STEP + 2;

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

/** The ground an armed command stands on, waiting for its target. */
export const HUD_ARMED: Rgba = shadeAt(RAMPS.bronze, 3);

/** The ink an action that cannot be taken is written in. */
export const HUD_DISABLED: Rgba = shadeAt(RAMPS.stone, 3);

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
  session: HudSession = {},
): HudModel {
  const picked = pickedSquads(visible, squadSelection);
  const selected = findSelection(visible, selection) ?? (selection?.kind === 'squad' ? picked[0] ?? null : null);
  const focus = focusSettlement(visible, selected);
  const pickedRows = selected !== null && selected.kind === 'squad' && !picked.some((row) => row.id === selected.id)
    ? [...picked, selected]
    : picked;
  const faction: Faction = session.faction ?? 'rome';
  const tab: SettlementTab = session.tab ?? 'overview';
  const ended = session.ended ?? view.ended ?? false;
  const pickedSquadList = visible.squads.filter((squad) => pickedRows.some((row) => row.id === squad.id));
  const settlement = selected?.kind === 'settlement'
    ? visible.settlements.find((candidate) => candidate.id === selected.id) ?? null
    : null;
  const group = selected?.kind === 'squad' && pickedSquadList.length > 1 ? groupSummary(pickedSquadList) : null;
  const commands = settlement !== null
    ? settlementOrders(visible, faction, settlement, tab, ended)
    : squadOrders(visible, faction, pickedSquadList, ended);
  const armed = session.armed == null ? null : commands.find((order) => order.id === session.armed) ?? null;

  return {
    view,
    readouts: readouts(visible, focus, strongholds),
    rows: rows(visible, strongholds),
    detail: selected === null
      ? null
      : group !== null ? groupDetail(group) : detail(visible, strongholds, selected),
    selected,
    picked: pickedRows,
    commands,
    tab,
    group,
    groups: session.groups ?? [],
    orders: {
      armed,
      pending: session.pending ?? 0,
      last: session.last ?? null,
      backToGroup: session.backToGroup ?? false,
    },
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
  if (model.view.desktop) return desktopLayout(model, size);
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
    action: 'pause', text: translate(model.view.ended ? 'match.ended' : model.view.paused ? 'ui.resume' : 'ui.pause'),
    rect: { x: PADDING, y: pauseY, width: 142, height: 2 * LINE_STEP }, enabled: !model.view.ended,
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
    for (const index of model.detail.priority) {
      const line = model.detail.lines[index];
      if (line !== undefined) place(wrapText(`${line.label}: ${line.value}`, width), priority);
    }
    detailY += PADDING;
    secondary = model.detail.lines
      .filter((_line, index) => !model.detail?.priority.includes(index))
      .flatMap((line) => wrapText(`${line.label}: ${line.value}`, width));
  }
  const detailScroll = scrollWindow(model.view.detailOffset ?? 0, secondary.length, detail.y + detail.height - 2 * LINE_STEP - PADDING - detailY);
  place(secondary.slice(detailScroll.offset, detailScroll.offset + detailScroll.page), text);
  addScrollButtons(buttons, detail, 'detail', detailScroll);

  return { size, bar, list, detail, minimap, readouts, headers, rows, text, priority, buttons, listScroll, detailScroll,
    commands: [], tabs: [], groups: [], exceptions: [], status: [], commandScroll: scrollWindow(0, 0, 1) };
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

function addScrollButtons(buttons: HudButton[], rect: Rect, region: 'list' | 'detail' | 'commands', scroll: HudScroll): void {
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
 * What a click on the interface lands on, in the order the panels stack.
 *
 * The bar's own buttons first — a scroll control drawn over a command must be
 * the thing that scrolls — then the commands, the pages, the groups, and the
 * rows. The theatre is not here: a click that lands on nothing returns `null`,
 * and the page decides what bare ground means.
 */
export function hudHit(model: HudModel, size: HudSize, x: number, y: number): HudHit | null {
  const layout = hudLayout(model, size);

  for (const button of layout.buttons) {
    if (contains(button.rect, x, y)) return { kind: 'button', action: button.action };
  }
  for (const command of layout.commands) {
    if (contains(command.rect, x, y)) return { kind: 'order', order: command.order };
  }
  for (const tab of layout.tabs) {
    if (contains(tab.rect, x, y)) return { kind: 'tab', tab: tab.tab };
  }
  for (const group of layout.groups) {
    if (contains(group.rect, x, y)) return { kind: 'group', index: group.index };
  }
  for (const exception of layout.exceptions) {
    if (contains(exception.rect, x, y)) return { kind: 'selection', selection: exception.selection };
  }
  for (const row of layout.rows) {
    if (contains(row.rect, x, y)) return { kind: 'selection', selection: row.selection };
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
  const scale = model.view.desktop ? model.view.uiScale ?? 2 : 1;
  drawReadouts(buffer, layout.readouts, scale);

  for (const header of layout.headers) {
    drawText(buffer, header.text, header.rect.x, header.rect.y, HUD_LABEL, scale);
  }

  for (const row of layout.rows) {
    if (model.picked.some((picked) => sameSelection(picked, row.selection)) ||
      (model.selected !== null && sameSelection(model.selected, row.selection))) {
      fillRect(buffer, row.rect.x, row.rect.y, row.rect.width, row.rect.height, HUD_SELECTED);
    }
  }
  for (const line of layout.text) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_LABEL, scale);
  for (const line of layout.priority) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_VALUE, scale);

  // The exceptions of a mixed selection are rows like any other row, and the one
  // whose panel is open stands on the same bronze the navigator uses.
  if (model.group !== null) {
    for (const [index, exception] of layout.exceptions.entries()) {
      const found = model.group.exceptions[index];
      if (found !== undefined && model.selected?.kind === 'squad' && model.selected.id === found.squad) {
        fillRect(buffer, exception.rect.x, exception.rect.y, exception.rect.width, exception.rect.height, HUD_SELECTED);
      }
    }
  }

  for (const tab of layout.tabs) {
    if (tab.tab === model.tab) fillRect(buffer, tab.rect.x, tab.rect.y, tab.rect.width, tab.rect.height, HUD_SELECTED);
    panel(buffer, tab.rect);
    drawText(buffer, translate(`tab.${tab.tab}`), tab.rect.x + PADDING * scale, tab.rect.y + 3 * scale,
      tab.tab === model.tab ? HUD_VALUE : HUD_LABEL, scale);
  }

  for (const { order, rect } of layout.commands) {
    panel(buffer, rect);
    // The armed action stands on its own ground, inside the panel's edge, so a
    // Player can see which of several orders is the one waiting for a click.
    if (model.orders.armed?.id === order.id) {
      fillRect(buffer, rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, HUD_ARMED);
    }
    const head = order.shortcut === null ? order.label : message('cmd.withShortcut', { label: order.label, keys: order.shortcut });
    const ink = order.enabled ? HUD_VALUE : HUD_DISABLED;
    drawText(buffer, fitText(head, rect.width - 2 * PADDING * scale, scale), rect.x + PADDING * scale,
      rect.y + (COMMAND_ROW - LINE_HEIGHT) / 2 * scale, ink, scale);
    const detail = order.enabled ? order.note : order.reason;
    if (detail !== null) {
      const at = rect.x + (measureText(head) + 2 * PADDING) * scale;
      const room = rect.x + rect.width - at - PADDING * scale;
      if (room > 12 * scale) drawText(buffer, fitText(detail, room, scale), at,
        rect.y + (COMMAND_ROW - LINE_HEIGHT) / 2 * scale, HUD_LABEL, scale);
    }
  }

  for (const group of layout.groups) {
    panel(buffer, group.rect);
    const thought = model.groups.find((candidate) => candidate.index === group.index);
    const label = thought === undefined ? String(group.index) : groupChipText(thought);
    drawText(buffer, fitText(label, group.rect.width - 2 * PADDING * scale, scale), group.rect.x + PADDING * scale,
      group.rect.y + 1 * scale, HUD_VALUE, scale);
  }

  for (const line of layout.status) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_VALUE, scale);

  for (const button of layout.buttons) {
    panel(buffer, button.rect);
    drawText(buffer, button.text, button.rect.x + PADDING * scale, button.rect.y + 5 * scale, button.enabled ? HUD_VALUE : HUD_BORDER, scale);
  }

  return buffer;
}

/** The most of a string that fits a width, at a magnification; the rest is dropped. */
function fitText(text: string, width: number, scale: number): string {
  if (measureText(text, scale) <= width) return text;

  let end = text.length;
  while (end > 0 && measureText(text.slice(0, end), scale) > width) end -= 1;

  return text.slice(0, end);
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
  const scale = model.view.desktop ? model.view.uiScale ?? 2 : 1;
  if (minimap.width * scale !== layout.minimap.width || minimap.height * scale !== layout.minimap.height) {
    throw new RangeError(
      `the minimap is ${String(minimap.width)}×${String(minimap.height)} and the layout reserves ` +
        `${String(layout.minimap.width)}×${String(layout.minimap.height)}`,
    );
  }

  const buffer = renderPanels(model, size);
  if (scale === 1) blit(buffer, minimap, layout.minimap.x, layout.minimap.y);
  else for (let y = 0; y < minimap.height; y++) for (let x = 0; x < minimap.width; x++) {
    fillRect(buffer, layout.minimap.x + x * scale, layout.minimap.y + y * scale, scale, scale, pixelAt(minimap, x, y));
  }

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

/** The panel for a mixed selection: what the group is, before what any one man in it is. */
function groupDetail(group: GroupSummary): HudDetail {
  return {
    title: message('ui.groupMembers', { count: group.squads, composition: group.composition }),
    lines: [
      { label: translate('ui.composition'), value: group.composition },
      { label: translate('ui.menTotal'), value: String(group.men) },
      { label: translate('ui.morale'), value: message('ui.moraleRange', { low: group.moraleMin, high: group.moraleMax }) },
    ],
    priority: [0],
  };
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

    return {
      title: message('ui.listItem', { name: settlementName(settlement, strongholds), id: settlement.id }),
      ...settlementLines(visible, settlement),
    };
  }

  const squad = visible.squads.find((candidate) => candidate.id === selected.id);
  if (squad === undefined) return null;

  return {
    title: message('ui.listItem', { name: translate('ui.squad'), id: squad.id }),
    ...squadLines(squad, visible),
  };
}

/**
 * A settlement's figures: what it is, what it has, what it is raising, and what
 * is known of its fortification.
 *
 * The fortification is read from the front the Faction actually has (`fronts`),
 * which the Observation only carries for a settlement it holds, is besieging or
 * has an eye on (ADR-0020). A settlement remembered from a contact is not one of
 * those, so it gets no wall line at all rather than a remembered one.
 */
function settlementLines(visible: EconomyVisible, settlement: VisibleSettlement): Pick<HudDetail, 'lines' | 'priority'> {
  const lines: HudLine[] = [
    { label: translate('ui.tier'), value: String(settlement.tier) },
    { label: translate('ui.population'), value: String(settlement.population) },
  ];

  for (const kind of RESOURCE_KINDS) {
    lines.push({ label: resourceLabel(kind), value: String(stockOf(settlement, kind)) });
  }

  // The land is one line rather than four, in the resources' own order, so that
  // the panel reads as columns a Player compares instead of a list that grows.
  // The allocation is the economy's own: nobody moves these people by hand
  // (ADR-0005), so the line says so.
  lines.push({
    label: translate('ui.labourAuto'),
    value: RESOURCE_KINDS.map((kind) => String(landOf(settlement, kind))).join('/'),
  });

  const workStart = lines.length;
  if (settlement.works.length === 0) {
    lines.push({ label: translate('ui.works'), value: translate('ui.none') });
  }
  for (const work of settlement.works) {
    lines.push({
      label: translate('ui.works'),
      value: `${workLabel(work.building)} - ${
        work.standing
          ? translate('ui.workStanding')
          : message('ui.workProgress', { ticks: work.remaining })
      }`,
    });
  }

  const front = knownFront(visible, settlement.id);
  if (front !== undefined && (front.structures.length > 0 || front.siege !== null || front.garrison > 0)) {
    lines.push(...frontLines(front));
  }

  return { lines, priority: [workStart + Math.max(0, settlement.works.findIndex((work) => !work.standing))] };
}

/**
 * What is known of one fortification, and nothing that is not (ADR-0020).
 *
 * `fronts` carries a front only for a settlement this Faction holds, besieges or
 * can see, so everything here is either its own walls or walls it is standing in
 * front of. There is no line for enemy stocks, enemy Payroll or a wall nobody
 * has seen since it was last looked at.
 */
function frontLines(front: VisibleFront): readonly HudLine[] {
  const standing = front.structures.filter((structure) => structure.standing).length;
  const gate = front.structures.find((structure) => structure.kind === 'gate');
  const lines: HudLine[] = [
    { label: translate('ui.walls'), value: message('ui.wallsStanding', { standing, total: front.structures.length }) },
    { label: translate('ui.breach'), value: translate(front.breached ? 'ui.breached' : 'ui.no') },
  ];
  if (gate !== undefined) {
    lines.push({
      label: translate('ui.gate'),
      value: gate.standing ? message('ui.wallStanding', { hp: gate.hp }) : translate('ui.wallBroken'),
    });
  }
  if (front.structures.length > 0) {
    lines.push({
      label: translate('ui.ram'),
      value: front.ram === null ? translate('ui.ramNone')
        : front.ram.built ? message('ui.ramBuilt', { hp: front.ram.hp })
          : message('ui.ramBuilding', { ticks: front.ram.remaining }),
    });
  }
  lines.push({
    label: translate('ui.siegePath'),
    value: front.siege === null ? translate('ui.none') : translate(front.siege === 'assault' ? 'cmd.assault' : 'cmd.blockade'),
  });
  if (front.besieger !== null) lines.push({ label: translate('ui.besieger'), value: translate(front.besieger === 'rome' ? 'faction.rome' : 'faction.carthage') });
  lines.push({ label: translate('ui.garrisonCount'), value: String(front.garrison) });

  return lines;
}

/**
 * A Squad's figures: what it is, what it has left to fight with, what it owes,
 * and what it is doing.
 *
 * Men and Morale are read against the most the type ever has (`content/`), which
 * is what makes "90/120" a fact about this Squad rather than a number a Player
 * has to remember. The Order goes first because it is the answer to the question
 * a Player has just asked by clicking; the destination and the refusal sit beside
 * it for the same reason.
 */
function squadLines(squad: VisibleSquad, visible: EconomyVisible): Pick<HudDetail, 'lines' | 'priority'> {
  const men = menOf(squad);
  const morale = moraleOf(squad);
  const supply = squad.inTerritory ? 'supply.inTerritory' : 'supply.outside';
  const lines: HudLine[] = [
    { label: translate('ui.order'), value: orderLabel(squad) },
    { label: translate('ui.destination'), value: squad.goal === null ? translate('ui.none') : `${String(squad.goal.x)},${String(squad.goal.y)}` },
    { label: translate('ui.type'), value: squadLabel(squad.type) },
    { label: translate('ui.men'), value: `${String(men.men)}/${String(men.max)}` },
    { label: translate('ui.morale'), value: `${String(morale.morale)}/${String(morale.max)}` },
    { label: translate('ui.fatigue'), value: String(squad.fatigue) },
    { label: translate('ui.ammunition'), value: String(squad.ammunition) },
    { label: translate('ui.supply'), value: translate(supply) },
    { label: translate('ui.quarters'), value: translate(squad.inCamp ? 'quarters.camp' : 'quarters.field') },
    { label: translate('ui.engaged'), value: translate(squad.engaged ? 'ui.yes' : 'ui.no') },
    { label: translate('ui.payroll'), value: String(squad.payroll) },
    { label: translate('ui.unpaid'), value: String(squad.unpaid) },
    { label: translate('ui.home'), value: String(squad.home) },
  ];
  if (squad.garrison !== null) lines.push({ label: translate('ui.garrisonCount'), value: message('ui.garrisonAt', { id: squad.garrison }) });

  // What is known of the enemy's walls: the fronts this Faction has an eye on, or
  // is besieging (ADR-0020). A remembered settlement that no eye covers has no
  // front in the Observation and so gets no line — the panel does not read the
  // world's walls out of a memory of a Stronghold.
  for (const front of knownEnemyFronts(visible)) {
    lines.push({
      label: message('ui.listItem', { name: translate('ui.stronghold'), id: front.settlement }),
      value: frontState(front),
    });
  }

  // The Order is pinned, and so is a supply problem: a Squad outside its own
  // country is losing morale every Season, which is not a figure to scroll for.
  return { lines, priority: squad.inTerritory ? [0] : [0, 7] };
}

/**
 * One known enemy front, as a Player reads it in one line.
 *
 * Walls, the gate, the breach, the ram and the path are all facts the front
 * carries because this Faction can see them; the garrison is a count, because
 * what is on the walls is visible and which Squads a Faction keeps is not.
 */
function frontState(front: VisibleFront): string {
  const standing = front.structures.filter((structure) => structure.standing).length;
  const gate = front.structures.find((structure) => structure.kind === 'gate');
  const parts = [
    `${translate('ui.walls')} ${message('ui.wallsStanding', { standing, total: front.structures.length })}`,
    `${translate('ui.breach')} ${translate(front.breached ? 'ui.breached' : 'ui.no')}`,
  ];
  if (gate !== undefined) {
    parts.push(`${translate('ui.gate')} ${gate.standing ? message('ui.wallStanding', { hp: gate.hp }) : translate('ui.wallBroken')}`);
  }
  if (front.ram !== null) {
    parts.push(`${translate('ui.ram')} ${front.ram.built ? message('ui.ramBuilt', { hp: front.ram.hp }) : message('ui.ramBuilding', { ticks: front.ram.remaining })}`);
  }
  parts.push(front.siege === null ? translate('ui.none') : translate(front.siege === 'assault' ? 'cmd.assault' : 'cmd.blockade'));
  parts.push(message('ui.listItem', { name: translate('ui.garrisonCount'), id: front.garrison }));

  return parts.join(' - ');
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

/** One of the three paces, marked when it is the one the Match is running at. */
function speedLabel(speed: number, current: number | undefined): string {
  return message(current === speed ? 'ui.speedCurrent' : 'ui.speed', { speed });
}

/** How many rows of numbered chips a strip that wide needs. */
function groupStripRows(groups: readonly ControlGroupView[], stripWidth: number): number {
  let rows = 1;
  let used = 0;

  for (const group of groups) {
    const width = Math.min(stripWidth, measureText(groupChipText(group)) + 8);
    if (used > 0 && used + width + 3 > stripWidth) {
      rows += 1;
      used = 0;
    }
    used += width + 3;
  }

  return rows;
}

/** What a numbered control group's chip says: its digit and what it holds. */
function groupChipText(group: ControlGroupView): string {
  return message('ui.groupChip', {
    index: group.index,
    composition: group.composition === '' ? translate('ui.none') : group.composition,
  });
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
function drawReadouts(buffer: PixelBuffer, readouts: readonly ReadoutRect[], uiScale = 1): void {
  for (const { line, rect } of readouts) {
    const scale = (line.large ? VALUE_SCALE : 1) * uiScale;
    const valueX = rect.x + (measureText(line.label) + READOUT_INK_GAP) * uiScale;

    drawText(buffer, line.label, rect.x, rect.y + (line.large ? VALUE_SCALE - 1 : 0) * LINE_HEIGHT * uiScale, HUD_LABEL, uiScale);
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


/** Desktop geometry is composed in bitmap pixels, then mapped to screen pixels once. */
function desktopLayout(model: HudModel, size: HudSize): HudLayout {
  const scale = model.view.uiScale ?? 2;
  const width = Math.floor(size.width / scale);
  const height = Math.floor(size.height / scale);
  const warning = model.view.scaleWarning || model.view.smallWindow || width < 640 || height < 360;
  const bar: Rect = { x: 0, y: 0, width, height: warning ? 54 : 40 };
  const hasDetail = model.detail !== null || model.commands.length > 0;
  // Commands before scenery (#54): the panel is as tall as the actions in it,
  // and the navigator and the theatre yield to it rather than the other way.
  const detailHeight = hasDetail
    ? Math.max(DETAIL_MIN_HEIGHT, Math.min(DETAIL_MAX_HEIGHT, Math.round(height * DETAIL_SHARE))) : 28;
  const detail: Rect = { x: 0, y: height - detailHeight, width: width - MINIMAP_PLATE_WIDTH, height: detailHeight };
  const minimap: Rect = { x: detail.width, y: height - MINIMAP_PLATE_HEIGHT, width: MINIMAP_PLATE_WIDTH, height: MINIMAP_PLATE_HEIGHT };
  const showNavigator = model.view.navigator !== false && (model.view.navigatorExpanded || (!model.view.scaleWarning && !model.view.smallWindow));
  const listLines = model.rows.flatMap((row) => wrapText(message('ui.listItem', { name: row.label, id: row.selection.id }), 146)
    .map((line) => ({ text: line, selection: row.selection })));
  const listHeight = Math.min(height - detail.height - bar.height - 6, 30 + listLines.length * LINE_STEP + 24);
  const list: Rect = { x: 0, y: bar.height, width: showNavigator ? 156 : 0, height: Math.max(0, listHeight) };
  const buttons: HudButton[] = [];
  const text: HudText[] = [];
  const priority: HudText[] = [];
  const status: HudText[] = [];
  const headers: HudHeader[] = [];
  const rows: RowRect[] = [];
  const exceptions: RowRect[] = [];
  const commands: CommandRect[] = [];
  const tabs: TabRect[] = [];
  const groups: GroupRect[] = [];
  const readouts = placeReadouts(model.readouts.slice(1, 4).map((line) => ({ ...line, label: `${line.label}: `, large: false, newRow: false })), { width, height });
  const progress = Math.floor(((model.view.tick ?? 0) % SEASON_TICKS) * 100 / SEASON_TICKS);
  text.push({ text: message('ui.seasonProgress', { progress }), rect: { x: 330, y: 4, width: 130, height: LINE_STEP } });
  text.push({ text: translate(model.view.paused ? 'ui.paused' : 'ui.running'), rect: { x: 480, y: 4, width: 150, height: LINE_STEP } });
  const actions = [
    ['pause', translate(model.view.ended ? 'match.ended' : model.view.paused ? 'ui.resume' : 'ui.pause'), 142],
    ['speed1', speedLabel(1, model.view.speed), 30], ['speed2', speedLabel(2, model.view.speed), 30],
    ['speed3', speedLabel(3, model.view.speed), 30],
    ['navigator', translate(showNavigator ? 'ui.hideNavigator' : 'ui.showNavigator'), 100],
    ['center', translate('ui.center'), 80],
    ['session', message('ui.options', { scale }), 110],
  ] as const;
  let x = 4;
  for (const [action, label, buttonWidth] of actions) {
    buttons.push({ action, text: label, rect: { x, y: 18, width: buttonWidth, height: 20 },
      enabled: action === 'pause' || action.startsWith('speed') ? !model.view.ended : action === 'center' ? model.selected !== null : true });
    x += buttonWidth + 2;
  }
  if (warning) text.push({ text: translate(model.view.smallWindow ? 'ui.smallWindow' : 'ui.scaleWarning'),
    rect: { x: 4, y: 42, width: width - 8, height: LINE_STEP } });
  const listScroll = scrollWindow(model.view.listOffset ?? 0, listLines.length, list.height - 48);
  if (showNavigator) {
    for (const [index, kind] of (['settlement', 'squad'] as const).entries()) headers.push({
      text: message('ui.listCount', { name: translate(kind === 'settlement' ? 'ui.settlements' : 'ui.squads'), count: model.rows.filter((row) => row.selection.kind === kind).length }),
      rect: { x: 4, y: list.y + 4 + index * LINE_STEP, width: 148, height: LINE_STEP } });
    for (const [index, line] of listLines.slice(listScroll.offset, listScroll.offset + listScroll.page).entries()) {
      const rect = { x: 4, y: list.y + 26 + index * LINE_STEP, width: 148, height: LINE_STEP };
      rows.push({ selection: line.selection, rect });
      text.push({ text: line.text, rect });
    }
    addScrollButtons(buttons, list, 'list', listScroll);
  }

  // The detail panel is two columns and a strip: what is selected on the left,
  // what can be done about it on the right, and the numbered groups underneath.
  // A click has to land on the rectangle that was drawn, so both are placed once.
  const inner = 4;
  // The group strip is as many rows as nine digits actually need: a bound group
  // that is not drawn is a bound group a Player cannot recall.
  const stripWidth = detail.width - 2 * inner - 46;
  const groupStrip = model.groups.length === 0 ? 0 : groupStripRows(model.groups, stripWidth) * LINE_STEP + 4;
  const columnTop = detail.y + inner;
  const columnHeight = detail.height - 2 * inner - groupStrip;
  const textWidth = Math.max(140, Math.floor((detail.width - 3 * inner) * 0.5));
  const textX = detail.x + inner;
  const commandX = textX + textWidth + inner;
  const commandWidth = Math.max(80, detail.width - textWidth - 3 * inner);

  let textY = columnTop;
  const stocks = model.readouts[0];
  if (stocks !== undefined && hasDetail && model.selected?.kind === 'settlement') {
    text.push({
      text: `${stocks.value} / ${model.readouts.slice(4).map((r) => `${r.label}: ${r.value}`).join(' / ')}`,
      rect: { x: textX, y: textY, width: textWidth, height: LINE_STEP },
    });
    textY += LINE_STEP;
  }
  let secondary: readonly string[] = [];
  if (model.detail !== null) {
    const main = [model.detail.title, ...model.detail.priority.flatMap((index) => {
      const line = model.detail!.lines[index];
      return line ? [`${line.label}: ${line.value}`] : [];
    })];
    for (const word of main.flatMap((line) => wrapText(line, textWidth))) {
      priority.push({ text: word, rect: { x: textX, y: textY, width: textWidth, height: LINE_STEP } });
      textY += LINE_STEP;
    }
    secondary = model.detail.lines.filter((_line, index) => !model.detail?.priority.includes(index))
      .flatMap((line) => wrapText(`${line.label}: ${line.value}`, textWidth));
    if (model.group !== null && model.group.exceptions.length > 0) {
      text.push({ text: translate('ui.exceptions'), rect: { x: textX, y: textY, width: textWidth, height: LINE_STEP } });
      textY += LINE_STEP;
      for (const exception of model.group.exceptions) {
        if (textY + LINE_STEP > columnTop + columnHeight) break;
        const rect = { x: textX, y: textY, width: textWidth, height: LINE_STEP };
        text.push({ text: message('ui.exception', { name: exception.name, reason: exception.reason }), rect });
        exceptions.push({ selection: { kind: 'squad', id: exception.squad }, rect });
        textY += LINE_STEP;
      }
    }
  } else if (model.commands.length === 0) {
    text.push({ text: translate('ui.selectEntity'), rect: { x: textX, y: textY, width: textWidth, height: LINE_STEP } });
    textY += LINE_STEP;
  }
  const secondaryTop = textY;
  const detailScroll = scrollWindow(model.view.detailOffset ?? 0, secondary.length, Math.max(0, columnTop + columnHeight - secondaryTop));
  for (const [index, word] of secondary.slice(detailScroll.offset, detailScroll.offset + detailScroll.page).entries()) {
    text.push({ text: word, rect: { x: textX, y: secondaryTop + index * LINE_STEP, width: textWidth, height: LINE_STEP } });
  }
  addScrollButtons(buttons, { ...detail, x: textX - 1, width: textWidth + 2, height: detail.height - groupStrip },
    'detail', detailScroll);

  // The commands column: the settlement's pages first, then what the last order
  // did, then the offers themselves.
  let commandY = columnTop;
  if (model.selected?.kind === 'settlement') {
    const tabWidth = Math.floor((commandWidth - (SETTLEMENT_TABS.length - 1) * 2) / SETTLEMENT_TABS.length);
    for (const [index, tab] of SETTLEMENT_TABS.entries()) {
      tabs.push({ tab, rect: { x: commandX + index * (tabWidth + 2), y: commandY, width: tabWidth, height: LINE_STEP + 3 } });
    }
    commandY += LINE_STEP + 5;
  }
  const armed = model.orders.armed;
  if (armed !== null) {
    const words = wrapText(`${message('ui.armed', { name: armed.label })} - ${armed.targetHint ?? ''}`, commandWidth);
    for (const word of words) {
      status.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
      commandY += LINE_STEP;
    }
  }
  const last = model.orders.last;
  if (last !== null) {
    const words = wrapText(message('ui.submitted', { name: last.name }), commandWidth);
    for (const word of words) {
      status.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
      commandY += LINE_STEP;
    }
  }
  if (model.orders.pending > 0) {
    const pending = message(model.view.paused ? 'ui.pendingPaused' : 'ui.pending', { count: model.orders.pending });
    for (const word of wrapText(pending, commandWidth)) {
      status.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
      commandY += LINE_STEP;
    }
  }
  if (model.orders.backToGroup) {
    buttons.push({ action: 'groupBack', text: translate('cmd.groupBack'), enabled: true,
      rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP + 3 } });
    commandY += LINE_STEP + 5;
  }
  const commandArea = Math.max(0, columnTop + columnHeight - commandY);
  const overflowing = model.commands.length * COMMAND_ROW > commandArea;
  const commandScroll = scrollWindow(model.view.commandOffset ?? 0, model.commands.length,
    commandArea - (overflowing ? 2 * LINE_STEP : 0));
  const visibleCommands = model.commands.slice(commandScroll.offset, commandScroll.offset + commandScroll.page);
  for (const [index, order] of visibleCommands.entries()) {
    commands.push({ order, rect: { x: commandX, y: commandY + index * COMMAND_ROW, width: commandWidth, height: COMMAND_ROW } });
  }
  if (commandScroll.max > 0) {
    addScrollButtons(buttons, { x: commandX, y: commandY, width: commandWidth, height: commandArea },
      'commands', commandScroll);
  }

  // The numbered groups, along the bottom of the panel: a Player reads what a
  // digit holds without pressing it, and presses the chip to recall it.
  if (model.groups.length > 0) {
    const stripY = detail.y + detail.height - groupStrip + 2;
    text.push({ text: translate('ui.groups'), rect: { x: textX, y: stripY, width: 44, height: LINE_STEP } });
    let chipX = textX + 46;
    let chipY = stripY;
    const chipHeight = LINE_STEP + 1;
    for (const group of model.groups) {
      const label = groupChipText(group);
      const chipWidth = Math.min(stripWidth, measureText(label) + 8);
      if (chipX + chipWidth > detail.x + detail.width - inner) {
        chipX = textX + 46;
        chipY += LINE_STEP;
      }
      groups.push({ index: group.index, rect: { x: chipX, y: chipY, width: chipWidth, height: chipHeight } });
      chipX += chipWidth + 3;
    }
  }

  if (!model.view.guideDismissed) {
    const guideY = Math.min(columnTop + columnHeight + 2, detail.y + detail.height - 2 * LINE_STEP);
    for (const [index, line] of wrapText(translate('ui.navigationGuide'), textWidth).entries()) {
      if (guideY + (index + 1) * LINE_STEP <= detail.y + detail.height - 2) {
        text.push({ text: line, rect: { x: textX, y: guideY + index * LINE_STEP, width: textWidth, height: LINE_STEP } });
      }
    }
  }

  const rect = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  const placed = <T extends { readonly rect: Rect }>(items: readonly T[]): T[] => items.map((item) => ({ ...item, rect: rect(item.rect) }));
  return { size, bar: rect(bar), list: rect(list), detail: rect(detail), minimap: rect(minimap),
    readouts: placed(readouts), headers: placed(headers), rows: placed(rows), text: placed(text), priority: placed(priority),
    buttons: placed(buttons), listScroll, detailScroll, commands: placed(commands), tabs: placed(tabs), groups: placed(groups),
    exceptions: placed(exceptions), status: placed(status), commandScroll };
}
