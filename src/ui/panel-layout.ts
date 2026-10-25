/** Selectable desktop arrangements. Geometry and text are shared by painting and input. */
import { resourceBar } from './resource-bar.ts';
import { BUILDINGS } from '../content/index.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { RESOURCE_KINDS } from '../sim/map.ts';
import { amountOf } from '../content/index.ts';
import { LINE_HEIGHT, LINE_GAP, measureText } from '../art/font.ts';
import { CONSTRUCTION_CATEGORIES, resourceBill } from './construction.ts';
import { MINIMAP_PLATE_HEIGHT, MINIMAP_PLATE_WIDTH } from './minimap.ts';
import { noticeLine, wrapText, type HudLayout, type HudModel, type HudSize, type Rect, type HudText, type HudButton, type CommandRect, type TabRect, type HudScroll, type GroupRect, type RowRect, type NoticeRect } from './hud.ts';
import type { OrderOption } from './orders.ts';
import { SETTLEMENT_TABS, MAX_RECRUIT_COUNT } from './orders.ts';
import { message, translate } from './strings.ts';

const STEP = LINE_HEIGHT + LINE_GAP;
const emptyScroll: HudScroll = { offset: 0, max: 0, page: 1 };
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

/** Short terms are drawn from the content tables; the reference keeps the complete prose. */
function offerLines(order: OrderOption): string[] {
  const building = order.kind === 'build' ? BUILDINGS.find((building) => building.id === order.subject) : undefined;
  if (!building) return [order.reason, order.note].filter((line): line is string => Boolean(line));
  const lines = [order.reason, message('panel.bill', { bill: resourceBill(building.cost) }),
    message('panel.staff', { seconds: building.buildTicks / TICK_HZ, workers: building.labour })];
  if (RESOURCE_KINDS.some((kind) => amountOf(building.yields, kind) > 0)) lines.push(message('panel.yield', { yield: resourceBill(building.yields) }));
  if (building.denarii) lines.push(message('panel.denarii', { amount: building.denarii }));
  if (building.housing) lines.push(message('panel.housing', { amount: building.housing }));
  if (building.storage) lines.push(message('panel.storage', { amount: building.storage }));
  if (building.raisesTier) lines.push(message('panel.tier', { tier: building.raisesTier }));
  if (building.id === 'castrum') lines.push(translate('panel.camp'));
  lines.push(message('panel.limits', { tier: building.tier, max: building.maxPerSettlement }));
  return lines.filter((line): line is string => Boolean(line));
}

export function arrangePanelLayout(model: HudModel, size: HudSize, base: HudLayout): HudLayout {
  const scale = model.view.uiScale ?? 2;
  const w = Math.floor(size.width / scale), h = Math.floor(size.height / scale);
  const logical = (r: Rect): Rect => ({ x: r.x / scale, y: r.y / scale, width: r.width / scale, height: r.height / scale });
  const screen = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  const bar = logical(base.bar), list = logical(base.list);
  const sidebar = model.view.panelLayout === 'sidebar', dock = model.view.panelLayout === 'dock';
  const hidden = sidebar && model.selected === null;
  const right = hidden ? w : w - Math.min(260, Math.max(216, Math.floor(w * .27)));
  const sw = Math.min(260, Math.max(216, Math.floor(w * .27)));
  const managementHeight = model.view.settlementPage === 'management' ? 180 : dock ? 104 : 92;
  const detail: Rect = sidebar ? { x: w - sw, y: bar.height + 2, width: sw, height: h - bar.height - 2 }
    : { x: 0, y: h - managementHeight, width: dock ? w : w - MINIMAP_PLATE_WIDTH - 2, height: managementHeight };
  const minimap: Rect = { x: sidebar ? 2 : w - MINIMAP_PLATE_WIDTH,
    y: dock ? bar.height + 2 : h - MINIMAP_PLATE_HEIGHT,
    width: MINIMAP_PLATE_WIDTH, height: MINIMAP_PLATE_HEIGHT };
  const text: HudText[] = [], priority: HudText[] = [], status: HudText[] = [];
  const buttons: HudButton[] = [], commands: CommandRect[] = [], tabs: TabRect[] = [], groups: GroupRect[] = [];
  const extraPanels: Rect[] = [];
  const exceptions: RowRect[] = [];
  const scrollRegions: { region: 'detail' | 'commands' | 'notices'; rect: Rect }[] = [];
  let detailScroll = emptyScroll, commandScroll = emptyScroll;
  const addText = (value: string, x: number, y: number, width: number, bright = false) => {
    while (value.length && measureText(value) > width) value = value.slice(0, -1);
    (bright ? priority : text).push({ text: value, rect: { x, y, width, height: STEP } });
  };
  const button = (action: HudButton['action'], value: string, r: Rect, enabled = true) => buttons.push({ action, text: value, rect: r, enabled });
  function prose(lines: readonly string[], r: Rect, offset: number, scroll: boolean, squads: readonly (number | null)[] = []): HudScroll {
    const wrap = (width: number) => lines.flatMap((line, index) => wrapText(line, width).map((text) => ({ text, squad: squads[index] })));
    let wrapped = wrap(r.width);
    const fits = wrapped.length * STEP <= r.height;
    const inlinePaging = scroll && !fits && r.height < STEP * 3 + 22;
    if (inlinePaging) wrapped = wrap(r.width - 40);
    const page = Math.max(0, Math.floor((r.height - (scroll && !fits && !inlinePaging ? 22 : 0)) / STEP));
    const max = Math.max(0, wrapped.length - page), at = Math.max(0, Math.min(offset, max));
    wrapped.slice(at, at + page).forEach((line, i) => {
      const rect = { x: r.x, y: r.y + i * STEP, width: r.width - (inlinePaging ? 40 : 0), height: STEP };
      addText(line.text, rect.x, rect.y, rect.width);
      if (line.squad !== undefined && line.squad !== null) exceptions.push({ selection: { kind: 'squad', id: line.squad }, rect });
    });
    if (scroll && max > 0 && inlinePaging) {
      button('detailPrevious', translate('ui.previous'), { x: r.x + r.width - 36, y: r.y, width: 36, height: 13 }, at > 0);
      button('detailNext', translate('ui.next'), { x: r.x + r.width - 36, y: r.y + 14, width: 36, height: 13 }, at < max);
    } else if (scroll && max > 0) {
      const bw = Math.floor((r.width - 2) / 2);
      button('detailPrevious', translate('ui.previous'), { x: r.x, y: r.y + r.height - 18, width: bw, height: 18 }, at > 0);
      button('detailNext', translate('ui.next'), { x: r.x + bw + 2, y: r.y + r.height - 18, width: bw, height: 18 }, at < max);
    }
    if (scroll) scrollRegions.push({ region: 'detail', rect: r });
    return { offset: at, max, page };
  }
  function information(rect: Rect): HudScroll {
    if (model.orders.backToGroup) {
      button('groupBack', translate('cmd.groupBack'), { ...rect, height: 18 });
      rect = { ...rect, y: rect.y + 20, height: rect.height - 20 };
    }
    const hovered = model.commands.find((order) => order.id === model.view.hoveredOrder);
    const pending = model.orders.pending > 0 ? message(model.view.paused ? 'ui.pendingPaused' : 'ui.pending', { count: model.orders.pending }) : model.orders.notice;
    const hints = [pending, model.orders.armed?.targetHint, hovered ? `${hovered.label}: ${hovered.reason ?? hovered.targetHint ?? hovered.note ?? translate('ui.commandNow')}` : null];
    const lines = [
      ...hints.filter((text): text is string => Boolean(text)).map((text) => ({ text, squad: null })),
      ...(model.group?.exceptions ?? []).map((entry) => ({ text: message('ui.exception', { name: entry.name, reason: entry.reason }), squad: entry.squad })),
      ...(model.detail?.lines ?? []).map((line) => ({ text: `${line.label}: ${line.value}`, squad: null })),
    ];
    return prose(lines.map((line) => line.text), rect, model.view.detailOffset ?? 0, true, lines.map((line) => line.squad));
  }

  const settlement = model.selected?.kind === 'settlement';
  const ownSettlement = settlement && model.detail?.summary !== undefined;
  const buildingList = ownSettlement && model.tab === 'construction' && model.view.settlementPage === 'works';
  const economic = ownSettlement && model.tab !== 'overview' && !buildingList;
  const inspected = model.commands.find((offer) => offer.id === model.view.inspectedOrder);
  let catalogue: Rect = { ...detail, x: detail.x + 4, y: detail.y + 4, width: detail.width - 8, height: detail.height - 8 };
  let inspector: Rect | null = null;

  if (sidebar && !hidden) {
    addText(model.detail?.title ?? translate('ui.selectEntity'), detail.x + 4, detail.y + 4, detail.width - 8, true);
    if (settlement) {
      if (ownSettlement) prose([`${translate('ui.tier')}: ${model.detail?.lines[2]?.value ?? ''}`], { x: detail.x + 4, y: detail.y + 18, width: detail.width - 8, height: 12 }, 0, false);
      catalogue = { x: detail.x + 4, y: detail.y + (ownSettlement ? 32 : 20), width: detail.width - 8, height: detail.height - (ownSettlement ? 36 : 24) };
      if (economic) {
        const ih = Math.min(160, Math.max(108, detail.height - 210));
        inspector = { x: detail.x + 4, y: h - ih - 4, width: detail.width - 8, height: ih };
        catalogue = { ...catalogue, height: inspector.y - catalogue.y - 4 };
      }
    } else {
      detailScroll = information({ x: detail.x + 4, y: detail.y + 20, width: detail.width - 8, height: detail.height - 24 });
      catalogue = { x: MINIMAP_PLATE_WIDTH + 6, y: h - 40, width: Math.max(140, detail.x - MINIMAP_PLATE_WIDTH - 10), height: 36 };
      if (model.selected) extraPanels.push({ x: catalogue.x - 4, y: catalogue.y - 4, width: catalogue.width + 8, height: catalogue.height + 8 });
    }
  } else if (hidden) {
    // No selected entity: the sidebar has no surface or input mask.
  } else if (dock) {
    const summaryWidth = 140;
    addText(model.detail?.title ?? translate('ui.selectEntity'), 4, detail.y + 4, summaryWidth - 8, true);
    const summaryRect = { x: 4, y: detail.y + 18, width: summaryWidth - 8, height: detail.height - 22 };
    if (settlement) prose((model.detail?.summary ?? model.detail?.lines ?? []).map((line) => `${line.label}: ${line.value}`), summaryRect, 0, false);
    else detailScroll = information(summaryRect);
    if (economic) {
      const cw = Math.floor((w - summaryWidth - 12) * .54);
      catalogue = { x: summaryWidth + 4, y: detail.y + 4, width: cw, height: detail.height - 8 };
      inspector = { x: catalogue.x + cw + 4, y: detail.y + 4, width: w - catalogue.x - cw - 8, height: detail.height - 8 };
    } else catalogue = { x: summaryWidth + 4, y: detail.y + 4, width: w - summaryWidth - 8, height: detail.height - 8 };
  } else {
    addText(model.detail?.title ?? translate('ui.selectEntity'), 4, detail.y + 4, detail.width - 8, true);
    catalogue = { x: 4, y: detail.y + 18, width: detail.width - 8, height: detail.height - 22 };
    if (model.selected && !settlement) {
      detailScroll = information({ x: 4, y: detail.y + 18, width: 132, height: detail.height - 22 });
      catalogue = { x: 144, y: detail.y + 4, width: detail.width - 148, height: detail.height - 8 };
    }
    if (economic && (inspected || model.tab === 'construction') && !model.view.noticesOpen) {
      const guideBottom = (base.guide.y + base.guide.height) / scale;
      const top = Math.max(bar.height + 4, base.guide.height ? guideBottom + 4 : 0);
      const height = Math.max(90, Math.min(176, detail.y - top - 4));
      inspector = { x: Math.max(4, detail.width - 254), y: detail.y - height - 4, width: 250, height };
      extraPanels.push({ ...inspector, y: inspector.y - 20, height: inspector.height + 20 });
    }
  }

  let y = catalogue.y;
  if (ownSettlement) {
    const tw = Math.floor((catalogue.width - 4) / 3);
    SETTLEMENT_TABS.forEach((tab, i) => tabs.push({ tab, text: translate(`tab.short.${tab}`),
      rect: { x: catalogue.x + i * (tw + 2), y, width: tw, height: 16 } }));
    y += 19;
    if (buildingList) {
      detailScroll = prose((model.detail?.works ?? []).map((line) => `${line.label}: ${line.value}`),
        { x: catalogue.x, y, width: catalogue.width, height: catalogue.y + catalogue.height - y - 22 }, model.view.detailOffset ?? 0, true);
      button('settlement:catalogue', translate('panel.catalogue'), { x: catalogue.x, y: catalogue.y + catalogue.height - 18, width: catalogue.width, height: 18 });
    } else if (model.tab === 'construction') {
      const columns = sidebar ? 2 : 4, bw = Math.floor((catalogue.width - (columns - 1) * 2) / columns);
      CONSTRUCTION_CATEGORIES.forEach((category, i) => button(`category:${category.id}`,
        translate(`category.short.${category.id}`), { x: catalogue.x + i % columns * (bw + 2), y: y + Math.floor(i / columns) * 18, width: bw, height: 16 }));
      y += sidebar ? 39 : 21;
    } else if (model.tab === 'recruitment') {
      button('recruitFewer', '-', { x: catalogue.x, y, width: 22, height: 16 }, model.recruitCount > 1);
      addText(message('ui.countValue', { label: translate('ui.recruitCount'), count: model.recruitCount }), catalogue.x + 26, y + 3, catalogue.width - 52);
      button('recruitMore', '+', { x: catalogue.x + catalogue.width - 22, y, width: 22, height: 16 }, model.recruitCount < MAX_RECRUIT_COUNT);
      y += 20;
    }
    if (model.tab === 'overview') {
      const page = model.view.settlementPage ?? 'summary';
      if (page === 'management') {
        const entries = model.detail?.management ?? [];
        const at = Math.min(Math.max(0, model.view.detailOffset ?? 0), Math.max(0, entries.length - 1));
        detailScroll = { offset: at, max: Math.max(0, entries.length - 1), page: 1 };
        const entry = entries[at];
        if (entry !== undefined) {
          prose([entry.text], { x: catalogue.x, y, width: catalogue.width, height: Math.max(24, catalogue.y + catalogue.height - y - 64) }, 0, false);
          const controlsY = catalogue.y + catalogue.height - 60;
          for (const [i, action] of entry.actions.entries()) button(action.action, action.text,
            { x: catalogue.x + i * 80, y: controlsY, width: 76, height: 18 }, !model.view.ended);
        }
        button('detailPrevious', translate('ui.previous'), { x: catalogue.x, y: catalogue.y + catalogue.height - 40, width: 60, height: 18 }, at > 0);
        button('detailNext', translate('ui.next'), { x: catalogue.x + 64, y: catalogue.y + catalogue.height - 40, width: 60, height: 18 }, at < detailScroll.max);
      } else {
        const source = page === 'balance' ? model.detail?.ledger : page === 'works' ? model.detail?.works : model.detail?.summary;
        detailScroll = prose((source ?? model.detail?.lines ?? []).map((line) => `${line.label}: ${line.value}`),
          { x: catalogue.x, y, width: catalogue.width, height: catalogue.y + catalogue.height - y - 22 }, model.view.detailOffset ?? 0, true);
      }
      const bw = Math.floor((catalogue.width - 4) / 3), by = catalogue.y + catalogue.height - 18;
      for (const [i, page] of (['summary', 'balance', 'management'] as const).entries()) button(`settlement:${page}`,
        page === 'management' ? translate('settlement.management') : translate(page === 'summary' ? 'tab.short.overview' : 'panel.balance'),
        { x: catalogue.x + i * (bw + 2), y: by, width: bw, height: 18 });
    }
  }
  if (settlement && !ownSettlement) {
    detailScroll = prose((model.detail?.lines ?? []).map((line) => `${line.label}: ${line.value}`),
      { ...catalogue, height: catalogue.height - 24 }, model.view.detailOffset ?? 0, true);
    button('reference:capture', translate('capture.help'), { x: catalogue.x, y: catalogue.y + catalogue.height - 20, width: catalogue.width, height: 18 });
  }
  if ((model.selected && !settlement) || economic) {
    const offers = model.commands;
    const columns = settlement ? (sidebar || model.tab === 'recruitment' ? 1 : 2) : sidebar ? Math.max(1, Math.min(offers.length, Math.floor(catalogue.width / 28))) : 3;
    const rowHeight = settlement ? 27 : 23;
    const rowCount = Math.ceil(offers.length / columns);
    const available = Math.max(0, catalogue.y + catalogue.height - y);
    const inlinePaging = available < rowHeight + 20;
    const page = Math.max(1, Math.floor((available - (!inlinePaging && rowCount * rowHeight > available ? 20 : 0)) / rowHeight));
    const max = Math.max(0, rowCount - page), offset = Math.min(max, Math.max(0, model.view.commandOffset ?? 0));
    commandScroll = { offset, max, page };
    const cw = Math.floor((catalogue.width - (inlinePaging && max > 0 ? 38 : 0)) / columns);
    offers.slice(offset * columns, (offset + page) * columns).forEach((order, i) => commands.push({ order,
      rect: { x: catalogue.x + i % columns * cw, y: y + Math.floor(i / columns) * rowHeight, width: cw - 2, height: rowHeight - 2 } }));
    if (max > 0 && inlinePaging) {
      button('commandsPrevious', translate('ui.previous'), { x: catalogue.x + catalogue.width - 36, y, width: 36, height: 13 }, offset > 0);
      button('commandsNext', translate('ui.next'), { x: catalogue.x + catalogue.width - 36, y: y + 14, width: 36, height: 13 }, offset < max);
    } else if (max > 0) {
      const by = catalogue.y + catalogue.height - 18, bw = Math.floor((catalogue.width - 2) / 2);
      button('commandsPrevious', translate('ui.previous'), { x: catalogue.x, y: by, width: bw, height: 18 }, offset > 0);
      button('commandsNext', translate('ui.next'), { x: catalogue.x + bw + 2, y: by, width: bw, height: 18 }, offset < max);
    }
    scrollRegions.push({ region: 'commands', rect: { x: catalogue.x, y, width: catalogue.width, height: available } });
    if (settlement && offers.length === 0) prose([translate('economy.noOffers')], { x: catalogue.x, y, width: catalogue.width, height: catalogue.y + catalogue.height - y }, 0, false);
  }
  const inspectorGroups = inspector && !sidebar && !dock && model.groups.length > 0 ? 18 : 0;
  if (inspector) {
    const inspectionTop = inspector.y;
    if (dock) extraPanels.push(inspector);
    if (model.tab === 'construction') {
      button('settlement:works', translate('economy.worksTitle'), { x: inspector.x + 4, y: inspector.y + 2, width: inspector.width - 8, height: 18 });
      inspector = { ...inspector, y: inspector.y + 22, height: inspector.height - 22 };
    }
    if (inspected) {
      addText(inspected.label, inspector.x + 4, inspector.y + 4, inspector.width - 8, true);
      const pending = model.orders.pending > 0 ? message(model.view.paused ? 'ui.pendingPaused' : 'ui.pending', { count: model.orders.pending }) : model.orders.notice;
      detailScroll = prose([...(pending ? [pending] : []), ...offerLines(inspected)], { x: inspector.x + 4, y: inspector.y + 17, width: inspector.width - 8, height: inspector.height - 42 - inspectorGroups }, model.view.detailOffset ?? 0, true);
      button(`purchase:${inspected.id}`, translate(inspected.kind === 'build' ? 'ui.purchase' : 'ui.purchaseRecruit'),
        { x: inspector.x + 4, y: inspector.y + inspector.height - 20 - inspectorGroups, width: Math.floor((inspector.width - 10) / 2), height: 18 }, inspected.enabled);
      button(`reference:${inspected.kind === 'build' ? 'building' : 'squad'}:${inspected.subject}`, translate('ui.shortDetails'),
        { x: inspector.x + Math.floor(inspector.width / 2) + 1, y: inspector.y + inspector.height - 20 - inspectorGroups, width: Math.floor((inspector.width - 10) / 2), height: 18 });
      if (!sidebar && !dock) button('closeInspection', translate('ui.closeInspection'),
        { x: inspector.x, y: inspectionTop - 20, width: inspector.width, height: 18 });
    } else if (model.tab === 'construction') {
      detailScroll = prose((model.detail?.works ?? []).map((line) => `${line.label}: ${line.value}`),
        { x: inspector.x + 4, y: inspector.y + 4, width: inspector.width - 8, height: inspector.height - 8 - inspectorGroups }, model.view.detailOffset ?? 0, true);
    } else prose([translate('ui.inspectHelp')], { ...inspector, x: inspector.x + 4, y: inspector.y + 4, width: inspector.width - 8, height: inspector.height - 8 }, 0, false);
  }
  // Control groups remain real controls, never a decorative list in the new arrangements.
  if (model.groups.length) {
    const groupArea = inspectorGroups && inspector
      ? { x: inspector.x + 4, y: inspector.y + inspector.height - 16, width: inspector.width - 8, height: 14 }
      : { x: MINIMAP_PLATE_WIDTH + 4, y: sidebar ? h - 60 : detail.y - 16,
        width: (sidebar ? right : detail.width) - MINIMAP_PLATE_WIDTH - 8, height: 14 };
    const gw = Math.min(44, Math.floor(groupArea.width / model.groups.length));
    model.groups.forEach((group, i) => groups.push({ index: group.index,
      rect: { x: groupArea.x + i * gw, y: groupArea.y, width: gw - 2, height: 14 } }));
    extraPanels.push(groupArea);
  }
  const keep = (r: Rect) => !overlaps(r, base.detail) && !overlaps(r, base.bar);
  const chrome = resourceBar(model, size);
  const chromeText = base.text.filter((line) => keep(line.rect));
  const chromePriority = base.priority.filter((line) => keep(line.rect));
  const chromeButtons = base.buttons.filter((button) => keep(button.rect));
  let notices: Rect = { x: 0, y: 0, width: 0, height: 0 };
  let noticeScroll = emptyScroll;
  const noticeRows: NoticeRect[] = [];
  if (model.view.noticesOpen && model.notices.length) {
    const width = 178;
    const top = Math.max(bar.height + 4, base.guide.height ? (base.guide.y + base.guide.height) / scale + 4 : 0);
    const bottom = sidebar ? (model.selected && !settlement ? catalogue.y - 24 : h - 24) : detail.y - 20;
    const page = Math.max(1, Math.min(8, Math.floor((bottom - top - 46) / STEP)));
    const lines = model.notices.flatMap((notice) => wrapText(noticeLine(notice), width - 10).map((text) => ({ text, notice })));
    const max = Math.max(0, lines.length - page), offset = Math.min(max, Math.max(0, model.view.noticeOffset ?? 0));
    noticeScroll = { offset, max, page };
    const shown = lines.slice(offset, offset + page);
    notices = { x: sidebar ? right - width - 4 : dock ? minimap.x - width - 4 : w - width - 4,
      y: top, width, height: 24 + shown.length * STEP + (max ? 20 : 0) };
    button('notices', translate('ui.noticeClose'), { x: notices.x + 4, y: top + 4, width: width - 8, height: 16 });
    shown.forEach(({ text: value, notice }, i) => {
      const rect = { x: notices.x + 4, y: top + 24 + i * STEP, width: width - 10, height: STEP };
      addText(value, rect.x, rect.y, rect.width, notice.persistent);
      if (notice.target) noticeRows.push({ id: notice.id, rect });
    });
    if (max) {
      button('noticesPrevious', translate('ui.previous'), { x: notices.x + 4, y: top + notices.height - 18, width: 84, height: 16 }, offset > 0);
      button('noticesNext', translate('ui.next'), { x: notices.x + 90, y: top + notices.height - 18, width: 84, height: 16 }, offset < max);
    }
    scrollRegions.push({ region: 'notices', rect: notices });
  }
  const placed = <T extends { readonly rect: Rect }>(items: readonly T[]): T[] => items.map((item) => ({ ...item, rect: screen(item.rect) }));
  const bottom = sidebar ? (settlement || !model.selected ? h : catalogue.y - 4) : detail.y;
  return { ...base, detail: screen(hidden ? { x: w, y: bar.height, width: 0, height: 0 } : detail), minimap: screen(minimap),
    theatre: screen({ x: list.width, y: bar.height, width: (sidebar ? right : w) - list.width, height: bottom - bar.height }),
    extraPanels: extraPanels.map(screen),
    readouts: chrome.readouts, text: [...chrome.text, ...chromeText, ...placed(text)], priority: [...chromePriority, ...placed(priority)], status: placed(status),
    buttons: [...chrome.buttons, ...chromeButtons, ...placed(buttons)], commands: placed(commands), tabs: placed(tabs), groups: placed(groups),
    commandRules: [], exceptions: placed(exceptions), detailScroll, commandScroll,
    scrollRegions: scrollRegions.map((region) => ({ ...region, rect: screen(region.rect) })),
    notices: screen(notices), noticeRows: placed(noticeRows), noticeScroll };
}
