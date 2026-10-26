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
import { BADGE_TILE, ICON_TILE, badgeIcon, commandIcon, type BadgeName, type CommandIconName } from '../art/icons.ts';
import { garrisonCapacity } from '../content/fortifications.ts';
import { amountOf } from '../content/index.ts';
import type { EconomyVisible, VisibleSettlement, VisibleSquad } from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { SEASON_TICKS } from '../sim/season.ts';
import { RESOURCE_KINDS, type ResourceKind } from '../sim/map.ts';
import type { VisibleFront } from '../sim/siege.ts';
import {
  MAX_RECRUIT_COUNT,
  SETTLEMENT_TABS,
  recruitCountInRange,
  groupSummary,
  knownEnemyFronts,
  knownFront,
  menOf,
  moraleOf,
  settlementOrders,
  squadOrders,
  type ControlGroupView,
  type GroupSummary,
  type OrderKind,
  type OrderOption,
  type SettlementTab,
} from './orders.ts';
import {
  MINIMAP_PLATE_HEIGHT,
  MINIMAP_PLATE_WIDTH,
} from './minimap.ts';
import { CAPTURE_HOLDS, CAPTURE_TICKS } from '../sim/siege.ts';
import type { KnownSite } from './sites.ts';
import type { Notice } from './conditions.ts';
import { CONSTRUCTION_CATEGORIES, type ConstructionCategory } from './construction.ts';
import { forecastTreasury, projectSettlement, settlementForecastLine } from './forecast.ts';
import { nextBoundary } from './conditions.ts';
import { TICK_HZ } from '../sim/clock.ts';
import type { ForecastLine } from './forecast.ts';
import type { GuidePanel } from './guide.ts';
import { paintControl, paintFocus } from '../art/interface.ts';
import { message, refusalLabel, resourceLabel, seasonLabel, squadLabel, translate, workLabel } from './strings.ts';
import type { PanelLayout } from './preferences.ts';
import { arrangePanelLayout } from './panel-layout.ts';

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
  /** The selected settlement's seasonal account, shown beside the local overview. */
  readonly ledger?: readonly HudLine[];
  readonly summary?: readonly HudLine[];
  readonly works?: readonly HudLine[];
  readonly management?: readonly { readonly text: string; readonly actions: readonly { readonly action: HudAction; readonly text: string }[] }[];
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
  /** Why the last action pressed is unavailable, shown until the next press. */
  readonly notice: string | null;
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
  readonly category?: ConstructionCategory;
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
  /** Why the action a Player just pressed cannot be taken, or `null`. */
  readonly notice?: string | null;
  /** Whether the Match is over, which closes every offer. */
  readonly ended?: boolean;
  /** What the Faction has been told this Match, newest concern first (#58). */
  readonly notices?: readonly Notice[];
  /** The next Season boundary's effect on the Treasury, when derivable (#58). */
  readonly forecast?: ForecastLine | null;
  /** The first-entry guide's panel, or `null` when it is closed (#59). */
  readonly guide?: GuidePanel | null;
  /** How many Squads one recruitment press buys; the page's own memory, never state. */
  readonly recruitCount?: number;
  /**
   * Every place the Faction may see, as `ui/sites.ts` reads its Observation (U6).
   *
   * The panel needs it for the places its own list does not hold: an enemy Stronghold
   * it can see, a village it remembers. The page passes the same list the map is
   * drawn from, so a structure a Player clicks and the panel that opens cannot be two
   * different places.
   */
  readonly sites?: readonly KnownSite[];
}

/** Presentation memory only; never part of the Match. Offsets count bitmap text lines. */
export interface HudView {
  readonly panelLayout?: PanelLayout;
  readonly inspectedOrder?: string | null;
  readonly settlementPage?: 'summary' | 'balance' | 'works' | 'management';
  readonly focus?: Rect | null;
  readonly hoveredOrder?: string | null;
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
  /** Whether the notice history is open, and how far it is scrolled (#58). */
  readonly noticesOpen?: boolean;
  readonly noticeOffset?: number;
}

export interface HudText {
  readonly role?: 'pace';
  readonly text: string;
  readonly rect: Rect;
}

export interface HudScroll {
  readonly offset: number;
  readonly max: number;
  readonly page: number;
}

export type HudAction = `cancelPending:${number}` | `garrisonSelect:${number}` | `garrisonExit:${number}` | `purchase:${string}` | 'closeInspection' | `settlement:${'summary' | 'balance' | 'works' | 'management' | 'catalogue'}` | `reference:${string}` | `category:${ConstructionCategory}` | 'reference' | 'session' | 'speed1' | 'speed2' | 'speed3' | 'navigator' | 'center' | 'pause' | 'listPrevious' | 'listNext' | 'detailPrevious' | 'detailNext' | 'commandsPrevious' | 'commandsNext' | 'groupBack' | 'notices' | 'noticesPrevious' | 'noticesNext' | 'guideBegin' | 'guideSkip' | 'guideClose' | 'recruitFewer' | 'recruitMore' | 'tutorialNext' | 'tutorialRetry' | 'tutorialExit' | 'tutorialHelp';

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
  readonly category: ConstructionCategory;
  /** How many Squads one recruitment press buys. */
  readonly recruitCount: number;
  /** The multi-selection summary, when more than one Squad is picked. */
  readonly group: GroupSummary | null;
  /** The numbered control groups, as visible controls. */
  readonly groups: readonly ControlGroupView[];
  /** What is armed, queued or just given. */
  readonly orders: HudOrdersView;
  /** The current-Match notice history, conditions first and events newest first (#58). */
  readonly notices: readonly Notice[];
  /** The economy's labelled estimate, or the reason there is none (#58). */
  readonly forecast: ForecastLine | null;
  /** The first-entry guide's panel, or `null` when it is closed (U8). */
  readonly guide: GuidePanel | null;
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
  readonly theatre?: Rect;
  readonly extraPanels?: readonly Rect[];
  readonly scrollRegions?: readonly { readonly region: 'detail' | 'commands' | 'notices'; readonly rect: Rect }[];
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
  /** The lines the command area is saying: unavailable, armed, pending, last given. */
  readonly status: readonly HudText[];
  /** The rules drawn between two groups of the command card. */
  readonly commandRules: readonly Rect[];
  /** How far the command list is scrolled, and how far it can be. */
  readonly commandScroll: HudScroll;
  /** The notice panel: the current conditions, the recent events and the forecast. */
  readonly notices: Rect;
  /** Where each notice's lines stand, so a click can centre what it names. */
  readonly noticeRows: readonly NoticeRect[];
  /** How far the notice lines are scrolled, and how far they can be. */
  readonly noticeScroll: HudScroll;
  /** The first-entry guide's panel, and where its words and controls stand (#59). */
  readonly guide: Rect;
  readonly guideText: readonly GuideText[];
  readonly guideButtons: readonly HudButton[];
}

/** One line of the Guide's panel: its title in the bright ink, its body in the quiet one. */
export interface GuideText extends HudText {
  readonly title: boolean;
}

/** A contextual action and the rectangle a click presses it in. */
export interface CommandRect {
  readonly order: OrderOption;
  readonly rect: Rect;
}

/** A settlement page's tab and where it stands. */
export interface TabRect {
  readonly text?: string;
  readonly tab: SettlementTab;
  readonly rect: Rect;
}

/** A numbered control group and where its chip stands. */
export interface GroupRect {
  readonly index: number;
  readonly rect: Rect;
}

/** One line of a notice, and the notice it belongs to. */
export interface NoticeRect {
  readonly id: string;
  readonly rect: Rect;
}

/** What a click on the interface lands on, in the order the panels stack. */
export type HudHit =
  | { readonly kind: 'selection'; readonly selection: Selection }
  | { readonly kind: 'order'; readonly order: OrderOption }
  | { readonly kind: 'tab'; readonly tab: SettlementTab }
  | { readonly kind: 'group'; readonly index: number }
  | { readonly kind: 'notice'; readonly id: string }
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
const DETAIL_SHARE = 0.31;

/** The narrowest a desktop detail panel is drawn, in bitmap pixels. */
const DETAIL_MIN_HEIGHT = 114;

/** The tallest, so that a large window leaves the theatre most of its height. */
const DETAIL_MAX_HEIGHT = 132;

/** Air between two command cells, so two pictures are never one picture. */
const COMMAND_GAP = 2;

/** One command cell: its icon, the air under it, its one-word label and its air. */
const COMMAND_ROW_HEIGHT = ICON_TILE + 6;

/** One settlement row: a badge, a name and its costs on a single line. */
const ECONOMY_ROW_HEIGHT = 28;

/** The small box a shortcut's letter stands in, at the top right of a command. */
const KEY_BADGE_WIDTH = LINE_HEIGHT + 2;
const KEY_BADGE_HEIGHT = LINE_HEIGHT + 2;

/** Air between two costs on a settlement row. */
const COST_GAP = 3;

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
export const HUD_ARMED: Rgba = shadeAt(RAMPS.bronze, 2);

/** The ink an action that cannot be taken is written in. */
export const HUD_DISABLED: Rgba = shadeAt(RAMPS.stone, 3);

/** The rule drawn between two groups of the command card. */
export const HUD_RULE: Rgba = shadeAt(RAMPS.bronze, 1);

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
  const sites = session.sites ?? [];
  const picked = pickedSquads(visible, squadSelection);
  const selected = findSelection(visible, selection, sites) ?? (selection?.kind === 'squad' ? picked[0] ?? null : null);
  const focus = focusSettlement(visible, selected);
  const known = selected?.kind === 'settlement' ? sites.find((site) => site.id === selected.id) ?? null : null;
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
  const category = session.category ?? 'production';
  const commands = settlement !== null
    ? settlementOrders(visible, faction, settlement, tab, ended, session.recruitCount ?? 1, category)
    : selected?.kind === 'settlement' ? [] : squadOrders(visible, faction, pickedSquadList, ended);
  const armed = session.armed == null ? null : commands.find((order) => order.id === session.armed) ?? null;

  return {
    view,
    readouts: readouts(visible, focus, strongholds, known),
    rows: rows(visible, strongholds),
    detail: selected === null
      ? null
      : group !== null ? groupDetail(group) : detail(visible, strongholds, selected, known, view.tick ?? 0, ended),
    selected,
    picked: pickedRows,
    commands,
    tab,
    category,
    recruitCount: recruitCountInRange(session.recruitCount ?? 1),
    group,
    groups: session.groups ?? [],
    orders: {
      armed,
      pending: session.pending ?? 0,
      last: session.last ?? null,
      backToGroup: session.backToGroup ?? false,
      notice: session.notice ?? null,
    },
    notices: session.notices ?? [],
    forecast: ended ? null : session.forecast ?? null,
    guide: session.guide ?? null,
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
  if (model.view.desktop) {
    if (model.view.panelLayout) {
      const chrome = desktopLayout({ ...model, forecast: null,
        notices: [] }, size);
      return arrangePanelLayout(model, size, chrome);
    }
    return desktopLayout(model, size);
  }
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
    commands: [], tabs: [], groups: [], exceptions: [], status: [], commandRules: [],
    commandScroll: scrollWindow(0, 0, 1),
    notices: { x: 0, y: 0, width: 0, height: 0 }, noticeRows: [], noticeScroll: scrollWindow(0, 0, 1),
    guide: { x: 0, y: 0, width: 0, height: 0 }, guideText: [], guideButtons: [] };
}

/** Wraps every glyph, including a value with no spaces; nothing is ellipsised away. */
export function wrapText(text: string, width: number): string[] {
  if (/[\r\n]/.test(text)) {
    return text.split(/\r\n|\r|\n/).flatMap((paragraph) => paragraph === '' ? [''] : wrapText(paragraph, width));
  }
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

/** A scroll window over items rather than over text lines: `page` items fit at once. */
function compactLines(lines: readonly string[], width: number): readonly string[] {
  const packed: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const left = lines[index]!;
    const right = lines[index + 1];
    const half = Math.floor(width / 2);
    if (right !== undefined && measureText(left) + 6 <= half && measureText(right) <= width - half) {
      const gap = Math.max(1, Math.ceil((half - measureText(left)) / 6));
      packed.push(`${left}${' '.repeat(gap)}${right}`);
      index += 1;
    } else packed.push(...wrapText(left, width));
  }
  return packed;
}

function paginate(requested: number, total: number, page: number): HudScroll {
  const size = Math.max(1, page);
  const max = Math.max(0, total - size);

  return { offset: Math.min(max, Math.max(0, Math.trunc(requested))), max, page: size };
}

function scrollWindow(requested: number, total: number, height: number): HudScroll {
  const page = Math.max(1, Math.floor(height / LINE_STEP));
  const max = Math.max(0, total - page);
  const offset = Math.min(max, Math.max(0, Math.trunc(requested)));
  return { offset, max, page };
}

function addScrollButtons(buttons: HudButton[], rect: Rect, region: 'list' | 'detail' | 'commands' | 'notices', scroll: HudScroll): void {
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

  for (const button of layout.guideButtons) {
    if (contains(button.rect, x, y)) return button.enabled ? { kind: 'button', action: button.action } : null;
  }
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
  for (const notice of layout.noticeRows) {
    if (contains(notice.rect, x, y)) return { kind: 'notice', id: notice.id };
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
  for (const rect of layout.extraPanels ?? []) panel(buffer, rect);
  // The notice strip is a panel like any other: opaque, so a warning reads over a
  // forest exactly as it reads over a field.
  if (layout.notices.height > 0) panel(buffer, layout.notices);
  // The guide is a panel like the others: an opaque ground, so its words read over
  // any tile it happens to cover, and drawn before the interface it explains.
  if (layout.guide.height > 0) panel(buffer, layout.guide);
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
  for (const line of layout.text) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_LABEL, scale);
  for (const line of layout.priority) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_VALUE, scale);

  for (const tab of layout.tabs) {
    paintControl(buffer, tab.rect, tab.tab === model.tab ? 'selected' : 'idle');
    drawText(buffer, tab.text ?? translate(`tab.${tab.tab}`), tab.rect.x + PADDING * scale, tab.rect.y + 3 * scale,
      tab.tab === model.tab ? HUD_VALUE : HUD_LABEL, scale);
  }

  for (const rule of layout.commandRules) fillRect(buffer, rule.x, rule.y, rule.width, rule.height, HUD_RULE);

  for (const { order, rect } of layout.commands) {
    // The armed action stands on its own ground, inside the panel's edge, so a
    // Player can see which of several orders is the one waiting for a click.
    paintControl(buffer, rect, model.orders.armed?.id === order.id ? 'armed' : !order.enabled ? 'disabled'
      : (model.view.inspectedOrder ?? model.view.hoveredOrder) === order.id ? 'selected' : 'idle');
    if (order.group === 'construction' || order.group === 'recruitment') drawEconomyRow(buffer, order, rect, scale);
    else drawCommandButton(buffer, order, rect, scale);
  }

  for (const group of layout.groups) {
    panel(buffer, group.rect);
    const thought = model.groups.find((candidate) => candidate.index === group.index);
    const label = thought === undefined ? String(group.index) : groupChipText(thought);
    drawText(buffer, fitText(label, group.rect.width - 2 * PADDING * scale, scale), group.rect.x + PADDING * scale,
      group.rect.y + 1 * scale, HUD_VALUE, scale);
  }

  for (const line of layout.status) drawText(buffer, line.text, line.rect.x, line.rect.y, HUD_VALUE, scale);

  for (const line of layout.guideText) {
    drawText(buffer, line.text, line.rect.x, line.rect.y, line.title ? HUD_VALUE : HUD_LABEL, scale);
  }
  for (const button of layout.guideButtons) {
    if (button.enabled) panel(buffer, button.rect);
    else paintControl(buffer, button.rect, 'disabled');
    drawText(buffer, button.text, button.rect.x + PADDING * scale, button.rect.y + 5 * scale, button.enabled ? HUD_VALUE : HUD_BORDER, scale);
  }

  for (const button of layout.buttons) {
    if (button.action.startsWith('category:')) paintControl(buffer, button.rect, button.action === `category:${model.category}` ? 'selected' : 'idle');
    else panel(buffer, button.rect);
    drawText(buffer, fitText(button.text, button.rect.width - 2 * PADDING * scale, scale), button.rect.x + PADDING * scale, button.rect.y + 5 * scale, button.enabled ? HUD_VALUE : HUD_BORDER, scale);
  }

  if (model.view.focus) paintFocus(buffer, model.view.focus);
  return buffer;
}

/**
 * One command as a picture: its icon, its one-word label and its key.
 *
 * A control that cannot be used keeps its shape — the same icon, in the one
 * muted shade — because a Player looking for an action is looking for a picture,
 * and a blank cell would read as "there is nothing here" rather than as "not now".
 * Why it cannot be used is the notice line's job, not a sentence squeezed into a
 * cell that has no room for one.
 */
function drawCommandButton(buffer: PixelBuffer, order: OrderOption, rect: Rect, scale: number): void {
  const ink = order.enabled ? HUD_VALUE : HUD_DISABLED;
  const iconSize = ICON_TILE * scale;
  const labelWidth = measureText(order.short, scale);
  const showLabel = rect.width >= iconSize + labelWidth + 2 * PADDING * scale + (order.shortcut === null ? 0 : KEY_BADGE_WIDTH * scale);
  const iconX = showLabel ? rect.x + PADDING * scale : rect.x + Math.floor((rect.width - iconSize) / 2);
  blitScaled(buffer, commandIcon(commandIconFor(order), { muted: !order.enabled }),
    iconX, rect.y + Math.floor((rect.height - iconSize) / 2), scale);
  if (showLabel) drawText(buffer, order.short, iconX + iconSize + 2 * scale,
    rect.y + Math.floor((rect.height - LINE_HEIGHT * scale) / 2), ink, scale);

  if (order.shortcut !== null) drawKeyBadge(buffer, order.shortcut, rect, ink, scale);
}

/** The key that does the same thing, in a box at the corner of its command. */
function drawKeyBadge(buffer: PixelBuffer, key: string, rect: Rect, ink: Rgba, scale: number): void {
  const width = KEY_BADGE_WIDTH * scale;
  const height = KEY_BADGE_HEIGHT * scale;
  const x = rect.x + rect.width - width - scale;
  const y = rect.y + scale;

  fillRect(buffer, x, y, width, height, HUD_BACKGROUND);
  strokeRect(buffer, x, y, width, height, HUD_BORDER);
  drawText(buffer, key, x + scale, y + scale, ink, scale);
}

/**
 * One settlement row: what it raises, and what that costs.
 *
 * The costs are badges and numerals rather than a sentence — a sheaf and `6`, a
 * clock and `400` — because a column of nine rows is read by scanning a column
 * of figures, and "Legno 6, Pietra 4, 400 tick" turns nine rows into a paragraph.
 * A row that cannot be taken is dimmed and locked; the reason is the notice's.
 */
function drawEconomyRow(buffer: PixelBuffer, order: OrderOption, rect: Rect, scale: number): void {
  const ink = order.enabled ? HUD_VALUE : HUD_DISABLED;
  const badgeSize = BADGE_TILE * scale;
  const nameY = rect.y + 2 * scale;
  const verb: BadgeName = order.group === 'construction' ? 'build' : 'recruit';

  blitScaled(buffer, badgeIcon(verb), rect.x + 2 * scale, nameY, scale);

  let right = rect.x + rect.width - 3 * scale;
  if (!order.enabled) {
    blitScaled(buffer, badgeIcon('lock'), right - badgeSize,
      nameY, scale);
    right -= badgeSize + COST_GAP * scale;
  }

  const nameX = rect.x + (BADGE_TILE + 4) * scale;
  drawText(buffer, fitText(order.short, right - nameX, scale), nameX, nameY, ink, scale);

  let x = rect.x + 2 * scale;
  const costY = nameY + LINE_STEP * scale;
  for (const cost of order.costs) {
    const value = `${cost.value}${cost.badge === 'clock' ? 's' : ''}`;
    blitScaled(buffer, badgeIcon(cost.badge), x, costY, scale);
    drawText(buffer, value, x + (BADGE_TILE + 2) * scale, costY, ink, scale);
    x += (BADGE_TILE + 2 + COST_GAP) * scale + measureText(value, scale);
  }
}

/**
 * A Squad's verbs grouped into the rows of the card.
 *
 * The row is the *kind* of decision, which is what makes the card readable
 * without reading it: where to go, how to stand, and what to do about walls. The
 * rows are not padded, so a row of three pictures sits beside a row of four and
 * the card reads as three groups rather than as a grid of ten cells.
 */
function commandRows(orders: readonly OrderOption[]): readonly (readonly OrderOption[])[] {
  const rows: OrderOption[][] = [];

  for (const order of orders) {
    const row = order.group === 'movement' ? 0 : order.group === 'combat' || order.group === 'formation' ? 1 : 2;
    rows[row] = [...(rows[row] ?? []), order];
  }

  return rows.filter((row) => row !== undefined);
}

/** The icon a command is drawn with: the verb's, with the two formations told apart by their id. */
function commandIconFor(order: OrderOption): CommandIconName {
  if (order.kind === 'formation') return order.id === 'formation.column' ? 'column' : 'line';

  return COMMAND_ICONS[order.kind];
}

/** The icon of each verb. The economy's rows carry a badge instead of one of these. */
const COMMAND_ICONS: Readonly<Record<OrderKind, CommandIconName>> = {
  move: 'move',
  attackMove: 'attackMove',
  attack: 'attack',
  hold: 'hold',
  withdraw: 'withdraw',
  formation: 'line',
  garrison: 'garrison',
  assault: 'assault',
  blockade: 'blockade',
  build: 'move',
  recruit: 'move',
};

/** One art buffer magnified by whole pixels, which is how the HUD scales everything. */
function blitScaled(target: PixelBuffer, source: PixelBuffer, x: number, y: number, scale: number): void {
  for (let row = 0; row < source.height; row += 1) {
    for (let column = 0; column < source.width; column += 1) {
      const colour = pixelAt(source, column, row);
      if (colour[3] === 0) continue;
      fillRect(target, x + column * scale, y + row * scale, scale, scale, colour);
    }
  }
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
  known: KnownSite | null = null,
): readonly HudReadout[] {
  // A place this Faction does not hold is named but not read: its stocks are not
  // the Faction's to know, so the four resource figures say so rather than zero.
  const unknown = translate('ui.unknown');
  const lines: HudReadout[] = [
    {
      label: translate('ui.settlement'),
      value:
        known !== null
          ? message('ui.listItem', { name: siteName(known), id: known.id })
          : focus === null
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
      value: known !== null && known.id !== focus?.id ? unknown : String(focus === null ? 0 : stockOf(focus, kind)),
      large: known === null || known.id === focus?.id,
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
  known: KnownSite | null,
  tick: number,
  ended: boolean,
): HudDetail | null {
  if (selected.kind === 'settlement') {
    const settlement = visible.settlements.find((candidate) => candidate.id === selected.id);
    if (settlement === undefined) {
      return known === null ? null : {
        title: message('ui.listItem', { name: siteName(known), id: known.id }),
        ...knownSiteLines(known),
      };
    }

    return {
      title: message('ui.listItem', { name: settlementName(settlement, strongholds), id: settlement.id }),
      ...settlementLines(visible, settlement, tick, ended, strongholds.includes(settlement.id)),
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
function settlementLines(visible: EconomyVisible, settlement: VisibleSettlement, tick: number, ended: boolean, walled: boolean): Pick<HudDetail, 'lines' | 'priority' | 'ledger' | 'summary' | 'works' | 'management'> {
  const economics = projectSettlement(settlement, visible.season);
  const boundary = nextBoundary(visible.season, tick);
  const future = projectSettlement(settlement, boundary.season);
  const lines: HudLine[] = [
    { label: translate('ui.population'), value: message('economy.people', { population: settlement.population, housing: economics.housing }) },
    { label: translate('economy.staffTitle'), value: message('economy.staff', {
      staffed: economics.staffed, needed: economics.needed, land: RESOURCE_KINDS.reduce<number>((sum, kind) => sum + landOf(settlement, kind), 0) }) },
    { label: translate('ui.tier'), value: String(settlement.tier) },
  ];

  for (const kind of RESOURCE_KINDS) {
    lines.push({ label: resourceLabel(kind), value: message('economy.localStock', { amount: stockOf(settlement, kind), capacity: economics.storage }) });
  }

  // Named allocations keep the resource order explicit while the detail scrolls.
  // The land is one line rather than four, in the resources' own order, so that
  // the panel reads as columns a Player compares instead of a list that grows.
  // The allocation is the economy's own: nobody moves these people by hand
  // (ADR-0005), so the line says so.
  const landLine = {
    label: translate('economy.landTitle'),
    value: RESOURCE_KINDS.map((kind) => `${resourceLabel(kind)} ${landOf(settlement, kind)}`).join(', '),
  };
  lines.push(landLine);
  const forecast = forecastTreasury(visible, tick);
  const ledger: HudLine[] = [
    { label: translate('economy.localForecast'), value: `${seasonLabel(boundary.season)}, ${Math.ceil(boundary.ticks / TICK_HZ)} s` },
    { label: translate('economy.commonTreasury'), value: forecast.available
      ? message('economy.treasuryChange', { current: visible.treasury, next: forecast.value.resulting }) : translate('forecast.blockaded') },
    { label: translate('economy.incomeTitle'), value: forecast.available
      ? message('economy.balance', { income: forecast.value.income, payroll: forecast.value.payroll }) : translate('forecast.blockaded') },
    { label: translate('forecast.unpaidLabel'), value: forecast.available ? String(forecast.value.unpaid) : translate('ui.unknown') },
    { label: translate('economy.stocksTitle'), value: settlementForecastLine(visible, settlement, tick) },
    { label: translate('economy.localIncome'), value: forecast.available
      ? message('economy.income', { income: future.income }) : translate('forecast.blockaded') },
    { label: translate('forecast.title'), value: translate('economy.assumption') },
  ];
  const workStart = lines.length;
  if (settlement.works.length === 0) {
    lines.push({ label: translate('ui.works'), value: translate('ui.none') });
  }
  for (const [index, work] of settlement.works.entries()) {
    lines.push({
      label: workLabel(work.building),
      value: !economics.workStaffing[index]
        ? translate(work.standing ? 'economy.unstaffed' : 'economy.stalled')
        : work.standing ? translate('economy.active')
          : message('economy.workProgress', { seconds: Math.ceil(work.remaining / TICK_HZ) }),
    });
  }

  const roster = visible.squads.filter((squad) => squad.garrison === settlement.id);
  const management: NonNullable<HudDetail['management']> = [
    { text: walled ? message('settlement.capacity', { men: roster.reduce((sum, squad) => sum + squad.men, 0), capacity: garrisonCapacity(settlement.tier) }) : translate('settlement.open'), actions: [] },
    ...roster.map((squad) => ({ text: message('settlement.roster', { name: squadLabel(squad.type), id: squad.id, men: squad.men }), actions: [
      { action: `garrisonSelect:${squad.id}` as const, text: translate('settlement.select') },
      { action: `garrisonExit:${squad.id}` as const, text: translate('settlement.exit') },
    ] })),
    ...(settlement.pending ?? []).map((order) => ({
      text: `${order.kind === 'build' ? workLabel(order.building) : `${squadLabel(order.squadType)} ${order.count} x ${order.men}`} - ${order.reason === 'space' ? translate('pending.space') : translate('pending.resources')}${order.cost === undefined ? '' : message('pending.cost', { cost: RESOURCE_KINDS.map((kind) => `${resourceLabel(kind)} ${amountOf(order.cost!, kind)}`).join(', ') })}`,
      actions: [{ action: `cancelPending:${order.id}` as const, text: translate('settlement.cancel') }],
    })),
  ];
  const front = knownFront(visible, settlement.id);
  if (front !== undefined && (front.structures.length > 0 || front.siege !== null || front.garrison > 0)) {
    lines.push(...frontLines(front));
  }

  const stalled = settlement.works.findIndex((_work, index) => !economics.workStaffing[index]);
  const active = settlement.works.findIndex((work) => !work.standing);
  const importantWork = stalled < 0 ? active : stalled;
  const summary = [
    { label: translate('economy.summaryPeopleLabel'), value: message('economy.summaryPeople', { population: settlement.population }) },
    { label: translate('economy.summaryHousingLabel'), value: message('economy.summaryHousing', { housing: economics.housing }) },
    { label: translate('economy.summaryStaffedLabel'), value: String(economics.staffed) },
    { label: translate('economy.summaryNeededLabel'), value: String(economics.needed) },
    ...RESOURCE_KINDS.map((kind) => ({ label: resourceLabel(kind), value: message('economy.summaryStock', { amount: stockOf(settlement, kind), capacity: economics.storage }) })),
  ];
  const workLines = settlement.works.map((_work, index) => lines[workStart + index]!);
  const works = [
    { label: translate('economy.developing'), value: String(settlement.works.filter((work) => !work.standing).length) },
    ...workLines.filter((_line, index) => !settlement.works[index]!.standing),
    { label: translate('economy.completed'), value: String(settlement.works.filter((work) => work.standing).length) },
    ...workLines.filter((_line, index) => settlement.works[index]!.standing),
  ];
  return { lines, ledger: ended ? [
    { label: translate('match.ended'), value: translate('match.finalKnown') },
    { label: translate('economy.commonTreasury'), value: String(visible.treasury) },
  ] : ledger, summary, works, management,
    priority: importantWork < 0 ? [0] : [workStart + importantWork] };
}

/**
 * A place the Faction knows but does not hold: what is seen of it, or what is only
 * remembered (U6).
 *
 * The panel here is deliberately thinner than a held settlement's, because the
 * Observation is thinner: a place in view carries a front, and the front carries the
 * walls, the gate, the breach, the ram and the garrison (ADR-0020), while a place
 * remembered carries a position and nothing else. So a remembered Stronghold is
 * *named* and its fortifications are said to be unknown — the panel does not read a
 * condition, an owner's stock or a garrison out of a memory that never held one.
 */
function knownSiteLines(site: KnownSite): Pick<HudDetail, 'lines' | 'priority'> {
  const lines: HudLine[] = [
    { label: translate('ui.siteState'), value: translate(site.memory === 'seen' ? 'ui.inSight' : 'ui.lastKnown') },
    {
      label: translate('ui.holder'),
      value: site.owner === null
        ? translate(site.memory === 'seen' && (site.appearance === undefined || site.appearance.tiles.some((tile) => tile.owner === 'none')) ? 'ui.unclaimed' : 'ui.unknown')
        : translate(site.owner === 'rome' ? 'faction.rome' : 'faction.carthage'),
    },
  ];

  if (site.kind === 'settlement' && site.owner === null) {
    lines.push({ label: translate('capture.label'), value: site.memory === 'seen'
      ? message('capture.control', { hold: site.front?.hold ?? 0, total: CAPTURE_HOLDS }) : translate('capture.rediscover') });
    lines.push({ label: translate('capture.instructions'), value: message('capture.quick', { holds: CAPTURE_HOLDS, seconds: CAPTURE_TICKS / TICK_HZ }) });
  }
  if (site.front !== null) {
    lines.push(...frontLines(site.front));
  } else if (site.kind === 'stronghold') {
    lines.push({ label: translate('ui.walls'), value: translate('ui.frontUnknown') });
  } else {
    lines.push({ label: translate('ui.walls'), value: translate('ui.none') });
  }

  if (site.appearance !== undefined) {
    const observed = new Map(site.appearance.tiles.flatMap((tile) => tile.work === undefined ? [] : [[`${tile.work.building}:${tile.work.ordinal}`, tile.work] as const]));
    for (const work of observed.values()) lines.push({ label: workLabel(work.building), value: work.stage >= 2 ? translate('observed.finished') : work.stage === 1 ? translate('observed.incomplete') : translate('observed.foundation') });
    if (site.appearance.tier !== undefined) lines.push({ label: translate('ui.tier'), value: String(site.appearance.tier) });
  }
  return { lines, priority: [0] };
}

/** The name a place reads as on the map and in the bar: its kind, not its id. */
function siteName(site: KnownSite): string {
  return translate(site.kind === 'stronghold' ? 'ui.stronghold' : 'ui.minorSettlement');
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
  const lines: HudLine[] = front.structures.length ? [
    { label: translate('ui.walls'), value: message('ui.wallsStanding', { standing, total: front.structures.length }) },
    { label: translate('ui.breach'), value: translate(front.breached ? 'ui.breached' : 'ui.no') },
  ] : [{ label: translate('ui.walls'), value: translate('ui.none') }];
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
  lines.push({ label: translate('ui.garrisonCount'), value: front.garrisonMen === undefined ? String(front.garrison) :
    message('settlement.capacityValue', { men: front.garrisonMen, capacity: front.garrisonCapacity ?? '?' }) });

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
    { label: translate('ui.men'), value: `${String(men.men)}/${String(men.capacity)}` },
    { label: translate('ui.capacity'), value: String(squad.capacity) },
    // What the men are worth in a fight (#66): men times the type's impact, the
    // same number the exchange, a wall's defence and the AI's estimate read.
    { label: translate('ui.force'), value: String(squad.bearing) },
    { label: translate('ui.morale'), value: `${String(morale.morale)}/${String(morale.max)}` },
    { label: translate('ui.fatigue'), value: String(squad.fatigue) },
    { label: translate('ui.ammunition'), value: String(squad.ammunition) },
    { label: translate('ui.supply'), value: translate(supply) },
    { label: translate('ui.quarters'), value: translate((squad as VisibleSquad & { readonly inQuarters?: boolean }).inQuarters ? 'quarters.settlement' : squad.inCamp ? 'quarters.camp' : 'quarters.field') },
    { label: translate('ui.engaged'), value: translate(squad.engaged ? 'ui.yes' : 'ui.no') },
    { label: translate('ui.payroll'), value: String(squad.payroll) },
    { label: translate('ui.unpaid'), value: String(squad.unpaid) },
    { label: translate('ui.home'), value: String(squad.home) },
  ];
  if (squad.passage !== undefined) {
    const passage = squad.passage;
    const phase = { approaching: translate('passage.approaching'), waiting: translate('passage.waiting'), entering: translate('passage.entering'), leaving: translate('passage.leaving') }[passage.phase];
    const impediment = passage.reason === 'access-busy' ? translate('passage.busy')
      : passage.reason === 'exit-blocked' ? translate('passage.blocked')
        : passage.reason === undefined ? null : translate('passage.impeded');
    lines.push({ label: translate('passage.label'), value: `${passage.remaining > 0 ? message('passage.seconds', { phase, seconds: Math.ceil(passage.remaining / TICK_HZ) }) : phase}${impediment === null ? '' : ` (${impediment})`}` });
  }
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
  return { lines, priority: squad.inTerritory ? [0] : [0, 8] };
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
function findSelection(
  visible: EconomyVisible,
  selection: Selection | null,
  sites: readonly KnownSite[] = [],
): Selection | null {
  if (selection === null) return null;

  if (selection.kind === 'squad') {
    return visible.squads.some((candidate) => candidate.id === selection.id) ? selection : null;
  }

  // A settlement's panel is open for one of the Faction's own and for a place it
  // knows: an enemy Stronghold in sight, a village it remembers (U6).
  const held = visible.settlements.some((candidate) => candidate.id === selection.id)
    || sites.some((site) => site.id === selection.id);

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
  const compactOverview = model.tab === 'overview' && model.detail?.summary !== undefined;
  const detailWidth = compactOverview ? Math.min(400, width - MINIMAP_PLATE_WIDTH) : width - MINIMAP_PLATE_WIDTH;
  const inner = 4;
  const textX = inner;
  const stripWidth = detailWidth - 2 * inner - 46;
  const groupStrip = model.groups.length === 0 ? 0 : groupStripRows(model.groups, stripWidth) * LINE_STEP + 4;
  const detailHeight = compactOverview ? groupStrip + (model.view.settlementPage === 'management' ? 156 : model.view.settlementPage && model.view.settlementPage !== 'summary' ? 114 : 100) : hasDetail
    ? Math.max(DETAIL_MIN_HEIGHT, Math.min(DETAIL_MAX_HEIGHT, Math.round(height * DETAIL_SHARE))) + (model.groups.length > 0 ? 10 : 0) : 28;
  const detail: Rect = { x: 0, y: height - detailHeight, width: detailWidth, height: detailHeight };
  const minimap: Rect = { x: width - MINIMAP_PLATE_WIDTH, y: height - MINIMAP_PLATE_HEIGHT, width: MINIMAP_PLATE_WIDTH, height: MINIMAP_PLATE_HEIGHT };
  const showNavigator = model.view.navigator !== false && (model.view.navigatorExpanded || (!model.view.scaleWarning && !model.view.smallWindow));
  const listLines = model.rows.flatMap((row) => wrapText(message('ui.listItem', { name: row.label, id: row.selection.id }), 146)
    .map((line) => ({ text: line, selection: row.selection })));
  const listHeight = Math.min(height - detail.height - bar.height - 6, 30 + listLines.length * LINE_STEP + 24);
  const list: Rect = { x: 0, y: bar.height, width: showNavigator ? 156 : 0, height: Math.max(0, listHeight) };
  const buttons: HudButton[] = [];
  const text: HudText[] = [];
  const priority: HudText[] = [];
  const status: HudText[] = [];
  const commandRules: Rect[] = [];
  const headers: HudHeader[] = [];
  const rows: RowRect[] = [];
  const exceptions: RowRect[] = [];
  const commands: CommandRect[] = [];
  const tabs: TabRect[] = [];
  const groups: GroupRect[] = [];
  const readouts = placeReadouts(model.readouts.slice(1, 4).map((line) => ({ ...line, label: `${line.label}: `, large: false, newRow: false })), { width, height });
  const progress = Math.floor(((model.view.tick ?? 0) % SEASON_TICKS) * 100 / SEASON_TICKS);
  text.push({ text: message('ui.seasonProgress', { progress }), rect: { x: 330, y: 4, width: 130, height: LINE_STEP } });
  text.push({ role: 'pace', text: translate(model.view.paused ? 'ui.paused' : 'ui.running'), rect: { x: 480, y: 4, width: 150, height: LINE_STEP } });
  const actions = [
    ['pause', translate(model.view.ended ? 'match.ended' : model.view.paused ? 'ui.resume' : 'ui.pause'), 142],
    ['speed1', speedLabel(1, model.view.speed), 30], ['speed2', speedLabel(2, model.view.speed), 30],
    ['speed3', speedLabel(3, model.view.speed), 30],
    ['navigator', translate(showNavigator ? 'ui.hideNavigator' : 'ui.showNavigator'), 100],
    ['center', translate('ui.center'), 80],
    ['session', message('ui.options', { scale }), 110],
    ['reference', translate('ref.open'), 102],
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

  let detailScroll: HudScroll;
  let commandScroll: HudScroll = { offset: 0, max: 0, page: 1 };
  if (compactOverview) {
    const inset = 6;
    const contentWidth = detail.width - 2 * inset;
    const tabWidth = Math.floor((contentWidth - 4) / 3);
    for (const [index, tab] of SETTLEMENT_TABS.entries()) {
      tabs.push({ tab, rect: { x: detail.x + inset + index * (tabWidth + 2), y: detail.y + 4, width: tabWidth, height: 16 } });
    }
    const page = model.view.settlementPage ?? 'summary';
    const heading = page === 'management' ? message('settlement.managementTitle', { title: model.detail!.title }) : page === 'summary' ? model.detail!.title
      : `${translate(page === 'balance' ? 'economy.balanceTitle' : 'economy.worksTitle')} - ${model.detail!.title}`;
    priority.push({ text: heading, rect: { x: detail.x + inset, y: detail.y + 24, width: contentWidth, height: LINE_STEP } });
    const source = page === 'management' ? [] : page === 'summary' ? model.detail!.summary! : page === 'balance' ? model.detail!.ledger! : model.detail!.works!;
    const prose = source.flatMap((line) => wrapText(`${line.label}: ${line.value}`, contentWidth));
    const room = detail.height - groupStrip - 64;
    detailScroll = page === 'summary' ? { offset: 0, max: 0, page: prose.length }
      : scrollWindow(model.view.detailOffset ?? 0, prose.length, room);
    for (const [index, word] of prose.slice(detailScroll.offset, detailScroll.offset + detailScroll.page).entries()) {
      text.push({ text: word, rect: { x: detail.x + inset, y: detail.y + 38 + index * LINE_STEP, width: contentWidth, height: LINE_STEP } });
    }
    if (page === 'management') {
      const entries = model.detail!.management ?? [];
      detailScroll = { offset: Math.min(model.view.detailOffset ?? 0, Math.max(0, entries.length - 1)), max: Math.max(0, entries.length - 1), page: 1 };
      const entry = entries[detailScroll.offset];
      if (entry !== undefined) {
        for (const [index, word] of wrapText(entry.text, contentWidth).slice(0, 5).entries()) {
          text.push({ text: word, rect: { x: detail.x + inset, y: detail.y + 38 + index * LINE_STEP, width: contentWidth, height: LINE_STEP } });
        }
        for (const [index, action] of entry.actions.entries()) {
          buttons.push({ ...action, enabled: !model.view.ended, rect: { x: detail.x + inset + index * 90, y: detail.y + 100, width: 86, height: 16 } });
        }
      }
    }
    const actions: readonly { action: HudAction; text: string; enabled: boolean }[] = page === 'summary'
      ? [{ action: 'settlement:management', text: translate('settlement.management'), enabled: true },
        { action: 'settlement:balance', text: translate('economy.balanceTitle'), enabled: true },
        { action: 'settlement:works', text: translate('economy.worksTitle'), enabled: true }]
      : [{ action: 'settlement:summary', text: translate('tab.overview'), enabled: true },
        { action: 'detailPrevious', text: translate('ui.previous'), enabled: detailScroll.offset > 0 },
        { action: 'detailNext', text: translate('ui.next'), enabled: detailScroll.offset < detailScroll.max }];
    const actionWidth = Math.floor((contentWidth - (actions.length - 1) * 2) / actions.length);
    for (const [index, action] of actions.entries()) {
      buttons.push({ ...action, rect: { x: detail.x + inset + index * (actionWidth + 2), y: detail.y + detail.height - groupStrip - 22, width: actionWidth, height: 18 } });
    }
  } else {
    // The detail panel is two columns and a strip: what is selected on the left,
    // what can be done about it on the right, and the numbered groups underneath.
    // A click has to land on the rectangle that was drawn, so both are placed once.
    // The group strip is as many rows as nine digits actually need: a bound group
    // that is not drawn is a bound group a Player cannot recall.
    const columnTop = detail.y + inner;
    const columnHeight = detail.height - 2 * inner - groupStrip;
    // Commands before prose: the card gets the wider half, because a picture and
    // its one word do not wrap the way a sentence does.
    const economicPage = model.selected?.kind === 'settlement';
    const textWidth = Math.max(140, Math.floor((detail.width - 3 * inner) * (economicPage ? 0.30 : 0.44)));
    const commandX = textX + textWidth + inner;
    const commandWidth = Math.max(80, detail.width - textWidth - 3 * inner);

    let textY = columnTop;
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
      const inspectedOffer = model.commands.find((order) => order.id === model.view.hoveredOrder);
      if (inspectedOffer && (inspectedOffer.kind === 'build' || inspectedOffer.kind === 'recruit')) {
        secondary = wrapText(`${inspectedOffer.label}. ${inspectedOffer.reason ?? ''} ${inspectedOffer.note ?? ''}`, textWidth);
      } else {
        secondary = compactLines(model.detail.lines.filter((_line, index) => !model.detail?.priority.includes(index))
          .map((line) => `${line.label}: ${line.value}`), textWidth);
      }
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
    const secondaryRoom = Math.max(0, columnTop + columnHeight - secondaryTop);
    detailScroll = scrollWindow(model.view.detailOffset ?? 0, secondary.length,
      secondary.length * LINE_STEP > secondaryRoom ? Math.max(0, secondaryRoom - 2 * LINE_STEP) : secondaryRoom);
    for (const [index, word] of secondary.slice(detailScroll.offset, detailScroll.offset + detailScroll.page).entries()) {
      text.push({ text: word, rect: { x: textX, y: secondaryTop + index * LINE_STEP, width: textWidth, height: LINE_STEP } });
    }
    addScrollButtons(buttons, { ...detail, x: textX - 1, width: textWidth + 2, height: detail.height - groupStrip },
      'detail', detailScroll);

    // The commands column: the settlement's pages first, then what the last order
    // did, then the offers themselves.
    let commandY = columnTop;
    const statusTop = commandY;
    if (model.selected?.kind === 'settlement') {
      const tabWidth = Math.floor((commandWidth - (SETTLEMENT_TABS.length - 1) * 2) / SETTLEMENT_TABS.length);
      for (const [index, tab] of SETTLEMENT_TABS.entries()) {
        tabs.push({ tab, rect: { x: commandX + index * (tabWidth + 2), y: commandY, width: tabWidth, height: LINE_STEP + 3 } });
      }
      commandY += LINE_STEP + 5;
      if (model.tab === 'construction') {
        const categoryWidth = Math.floor((commandWidth - 2) / 2);
        for (const [index, category] of CONSTRUCTION_CATEGORIES.entries()) {
          buttons.push({ action: `category:${category.id}`, text: translate(category.label), enabled: true,
            rect: { x: commandX + index % 2 * (categoryWidth + 2), y: commandY + Math.floor(index / 2) * 15,
              width: categoryWidth, height: 14 } });
        }
        commandY += 32;
      }
      // The recruitment page buys a number of Squads, not one: the count is one
      // public control with two buttons, so a pointer and the F6/Tab focus reach
      // the same choice (ADR-0026). It is presentation memory, never state.
      if (model.tab === 'recruitment') {
        const buttonWidth = Math.max(14, Math.floor(commandWidth / 6));
        const countWidth = commandWidth - 2 * (buttonWidth + 2);
        buttons.push({
          action: 'recruitFewer', text: '-', enabled: model.recruitCount > 1,
          rect: { x: commandX, y: commandY, width: buttonWidth, height: LINE_STEP + 3 },
        });
        text.push({
          text: message('ui.countValue', { label: translate('ui.recruitCount'), count: model.recruitCount }),
          rect: { x: commandX + buttonWidth + 2, y: commandY, width: countWidth, height: LINE_STEP },
        });
        buttons.push({
          action: 'recruitMore', text: '+', enabled: model.recruitCount < MAX_RECRUIT_COUNT,
          rect: { x: commandX + commandWidth - buttonWidth, y: commandY, width: buttonWidth, height: LINE_STEP + 3 },
        });
        commandY += LINE_STEP + 5;
      }
      if (model.tab === 'construction' && model.commands.length === 0) {
        for (const word of wrapText(translate('economy.noOffers'), commandWidth)) {
          text.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
          commandY += LINE_STEP;
        }
      }
    }
    if (model.orders.notice !== null) {
      for (const word of wrapText(model.orders.notice, commandWidth).slice(0, 2)) {
        status.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
        commandY += LINE_STEP;
      }
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
    const inspected = model.commands.find((order) => order.id === model.view.hoveredOrder);
    const inspectHint = model.selected?.kind === 'squad' && inspected !== undefined && inspected.label !== last?.name && armed === null && model.orders.notice === null;
    if (last !== null && !inspectHint && armed === null && model.orders.notice === null) {
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
    const hovered = inspected;
    if ((status.length === 0 || inspectHint) && model.selected?.kind === 'squad') {
      const hint = hovered === undefined ? translate('ui.commandHelp')
        : `${hovered.label}${hovered.shortcut === null ? '' : ` [${hovered.shortcut}]`} - ${hovered.reason ?? hovered.targetHint ?? hovered.note ?? translate('ui.commandNow')}`;
      for (const word of wrapText(hint, commandWidth).slice(0, 2)) {
        status.push({ text: word, rect: { x: commandX, y: commandY, width: commandWidth, height: LINE_STEP } });
        commandY += LINE_STEP;
      }
    }
    if (model.selected?.kind === 'squad') commandY = Math.max(commandY, statusTop + 3 * LINE_STEP);
    // The card: rows of pictures for a Squad's verbs, one full-width row per named
    // thing for a settlement's pages. The two are different questions — "what can
    // these men do?" and "what can this town raise?" — so they are laid out
    // differently rather than squeezed into one shape. A Squad's rows *are* the
    // kinds of decision: motion, orders and formation, and the Siege.
    const commandArea = Math.max(0, columnTop + columnHeight - commandY);
    const settlementPage = model.selected?.kind === 'settlement';
    const cardRows = settlementPage
      ? model.commands.reduce<OrderOption[][]>((rows, order, index) => {
        if (index % 2 === 0) rows.push([]);
        rows[rows.length - 1]!.push(order);
        return rows;
      }, [])
      : commandRows(model.commands);
    const rowHeight = settlementPage ? ECONOMY_ROW_HEIGHT : COMMAND_ROW_HEIGHT;
    let rowsFit = Math.max(1, Math.floor(commandArea / rowHeight));
    if (cardRows.length > rowsFit) rowsFit = Math.max(1, Math.floor((commandArea - 2 * LINE_STEP) / rowHeight));
    commandScroll = paginate(model.view.commandOffset ?? 0, cardRows.length, rowsFit);
    const visibleRows = cardRows.slice(commandScroll.offset, commandScroll.offset + commandScroll.page);
    // The card is anchored to the bottom of its column, the way a command card
    // sits under the hand it is used with: the words that answer a click grow
    // downwards from the top and the pictures stay where a Player last pressed.
    const reservedForScroll = commandScroll.max > 0 ? 2 * LINE_STEP : 0;
    const gridTop = commandY + Math.max(0, commandArea - reservedForScroll - visibleRows.length * rowHeight);
    for (const [row, items] of visibleRows.entries()) {
      const cellWidth = Math.max(1, Math.floor(commandWidth / (settlementPage ? 2 : items.length)));
      for (const [column, order] of items.entries()) {
        commands.push({
          order,
          rect: {
            x: commandX + column * cellWidth,
            y: gridTop + row * rowHeight,
            width: cellWidth - COMMAND_GAP - (settlementPage ? 20 : 0),
            height: rowHeight - COMMAND_GAP,
          },
        });
        if (settlementPage) {
          buttons.push({ action: `reference:${order.kind === 'build' ? 'building' : 'squad'}:${order.subject}`,
            text: translate('ref.info'), enabled: true,
            rect: { x: commandX + (column + 1) * cellWidth - 19, y: gridTop + row * rowHeight, width: 18, height: rowHeight - COMMAND_GAP } });
        }
      }
      // A rule above every row but the card's own first: the motion commands, the
      // orders and the Siege are different kinds of decision, and the rule says so.
      if (!settlementPage && commandScroll.offset + row > 0) {
        commandRules.push({
          x: commandX,
          y: gridTop + row * rowHeight - Math.ceil(COMMAND_GAP / 2),
          width: commandWidth,
          height: 1,
        });
      }
    }
    if (commandScroll.max > 0) {
      addScrollButtons(buttons, { x: commandX, y: commandY, width: commandWidth, height: commandArea },
        'commands', commandScroll);
    }

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

  // The first-entry guide (#59): a floating panel over the theatre's upper-left,
  // between the navigator and the place a Squad musters. It is not in the detail
  // strip because it is read *before* the Player knows what the detail strip is,
  // and it is not modal: the Player can click the settlement and the Squad it
  // names while it is open, which is the whole of how it teaches.
  const guide = model.guide ?? null;
  const guideWidth = 236;
  const guideBodyWidth = guideWidth - 2 * PADDING - 2;
  const guideX = list.width + 8;
  const guideY = bar.height + 6;
  const guideButtonsHeight = LINE_STEP + 4;
  const guideRoom = Math.max(2 * LINE_STEP, detail.y - guideY - 2 * PADDING - LINE_STEP - 4 - guideButtonsHeight);
  const guideLines = guide === null ? [] : guide.lines.flatMap((line) => wrapText(line, guideBodyWidth));
  const guideMaxLines = Math.max(1, Math.floor(guideRoom / LINE_STEP));
  const guideShown = guideLines.slice(0, guideMaxLines);
  const guidePanel: Rect = guide === null
    ? { x: 0, y: 0, width: 0, height: 0 }
    : { x: guideX, y: guideY, width: guideWidth,
      height: 2 * PADDING + LINE_STEP + guideShown.length * LINE_STEP + 4 + guideButtonsHeight };
  const guideText: GuideText[] = [];
  const guideButtons: HudButton[] = [];
  if (guide !== null) {
    guideText.push({ text: guide.title, title: true,
      rect: { x: guidePanel.x + PADDING, y: guidePanel.y + PADDING, width: guideBodyWidth, height: LINE_STEP } });
    const bodyY = guidePanel.y + PADDING + LINE_STEP;
    for (const [index, line] of guideShown.entries()) {
      guideText.push({ text: line, title: false,
        rect: { x: guidePanel.x + PADDING, y: bodyY + index * LINE_STEP, width: guideBodyWidth, height: LINE_STEP } });
    }
    let buttonX = guidePanel.x + PADDING;
    const buttonY = guidePanel.y + guidePanel.height - PADDING - guideButtonsHeight;
    for (const action of guide.actions) {
      const width = Math.min(guideBodyWidth, measureText(action.text) + 2 * PADDING + 2);
      guideButtons.push({ action: action.action, text: action.text, enabled: action.enabled ?? true,
        rect: { x: buttonX, y: buttonY, width, height: guideButtonsHeight } });
      buttonX += width + 3;
    }
  }

  // The notice strip (#58): the current conditions, the recent events and the
  // economy's labelled estimate, floating over the theatre's top-right corner and
  // clear of the bar above and the minimap below. It is the one panel that is not
  // in the detail area, because a warning a Player has to go looking for is not a
  // warning. A location-bearing line is a control: clicking it centres the place.
  const noticeWidth = 178;
  const noticeInner = noticeWidth - 2 * PADDING - 2;
  const forecastLines = model.forecast === null
    ? []
    : wrapText(`${model.forecast.label}: ${model.forecast.value}`, noticeInner);
  const noticeLines = model.notices.flatMap((notice) => wrapText(noticeLine(notice), noticeInner)
    .map((line) => ({ id: notice.id, text: line })));
  const expanded = model.view.noticesOpen === true;
  const hasNotices = model.notices.length > 0;
  const headerHeight = hasNotices ? LINE_STEP + 4 : 0;
  const room = Math.max(1, Math.min(expanded ? 8 : 3, Math.floor((height - bar.height - MINIMAP_PLATE_HEIGHT) / LINE_STEP) - 2));
  const noticePage = Math.max(1, room - forecastLines.length);
  const noticeScroll = scrollWindow(model.view.noticeOffset ?? 0, noticeLines.length, noticePage * LINE_STEP);
  const shownNotices = noticeLines.slice(noticeScroll.offset, noticeScroll.offset + noticeScroll.page);
  const scrollHeight = noticeScroll.max > 0 && expanded ? 2 * LINE_STEP + 2 : 0;
  const panelHeight = (hasNotices || forecastLines.length > 0)
    ? headerHeight + shownNotices.length * LINE_STEP + forecastLines.length * LINE_STEP + scrollHeight + 2 * PADDING
    : 0;
  const noticePanel: Rect = { x: Math.max(0, width - noticeWidth - 2), y: bar.height + 2, width: noticeWidth, height: panelHeight };
  const noticeRows: NoticeRect[] = [];
  let noticeY = noticePanel.y + PADDING;
  if (hasNotices) {
    buttons.push({
      action: 'notices',
      text: message(expanded ? 'ui.noticeClose' : 'ui.noticesCount', { count: model.notices.length }),
      rect: { x: noticePanel.x + PADDING, y: noticeY, width: noticeWidth - 2 * PADDING, height: LINE_STEP + 3 },
      enabled: true,
    });
    noticeY += headerHeight;
  }
  for (const [index, line] of shownNotices.entries()) {
    const rect = { x: noticePanel.x + PADDING, y: noticeY + index * LINE_STEP, width: noticeInner, height: LINE_STEP };
    // A standing condition is written in the brighter ink and an event in the
    // quieter one: the two are different kinds of statement, and the strip says so
    // before a Player reads the words.
    const found = model.notices.find((notice) => notice.id === line.id);
    if (found?.persistent === true) priority.push({ text: line.text, rect });
    else text.push({ text: line.text, rect });
    // Only a line that names a place is a control: a notice with no target has
    // nowhere to centre and is text (the winter countdown, a Squad that is gone).
    if (found?.target != null) noticeRows.push({ id: line.id, rect });
  }
  noticeY += shownNotices.length * LINE_STEP;
  for (const [index, line] of forecastLines.entries()) {
    text.push({ text: line, rect: { x: noticePanel.x + PADDING, y: noticeY + index * LINE_STEP, width: noticeInner, height: LINE_STEP } });
  }
  if (noticeScroll.max > 0 && expanded) {
    addScrollButtons(buttons, { x: noticePanel.x + 1, y: noticeY + forecastLines.length * LINE_STEP,
      width: noticeWidth - 2, height: 2 * LINE_STEP + 1 }, 'notices', noticeScroll);
  }

  const rect = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  const placed = <T extends { readonly rect: Rect }>(items: readonly T[]): T[] => items.map((item) => ({ ...item, rect: rect(item.rect) }));
  return { size, bar: rect(bar), list: rect(list), detail: rect(detail), minimap: rect(minimap),
    readouts: placed(readouts), headers: placed(headers), rows: placed(rows), text: placed(text), priority: placed(priority),
    buttons: placed(buttons), listScroll, detailScroll, commands: placed(commands), tabs: placed(tabs), groups: placed(groups),
    exceptions: placed(exceptions), status: placed(status), commandRules: commandRules.map(rect), commandScroll,
    notices: rect(noticePanel), noticeRows: placed(noticeRows), noticeScroll,
    guide: rect(guidePanel), guideText: placed(guideText), guideButtons: placed(guideButtons) };
}

/**
 * One notice as a Player reads it: a mark that says whether it is a standing
 * condition or a moment's event, the line, and the figure or reason beside it.
 *
 * The mark is a glyph and not a coloured dot, because the ticket asks critical
 * signals to carry a shape or a word as well as a colour: `!` is something that is
 * true now, `>` is something that just happened and can be acted on. A notice
 * whose target has gone says so instead of pretending to still point somewhere.
 */
export function noticeLine(notice: Notice): string {
  const text = notice.detail === null
    ? notice.label
    : message('notice.withDetail', { label: notice.label, detail: notice.detail });
  const line = message(notice.persistent ? 'notice.standing' : 'notice.event', { text });

  return notice.lost ? message('notice.lostText', { text: line, lost: translate('ui.noticeLost') }) : line;
}
