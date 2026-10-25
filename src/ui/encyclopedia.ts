/** Reusable bitmap reference surface. Its caller owns entry and return lifecycle. */
import { drawText, measureText } from '../art/font.ts';
import { BASE } from '../art/palette.ts';
import { paintControl, paintFocus } from '../art/interface.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import { wrapText, type HudSize, type Rect } from './hud.ts';
import { REFERENCE_ENTRIES, REFERENCE_SECTIONS, referenceOf, type ReferenceEntry } from './reference.ts';
import { message, translate } from './strings.ts';

export interface ReferenceState {
  readonly entry: string;
  readonly offset: number;
  readonly navigation: number;
}

export interface ReferenceControl {
  readonly id: string;
  readonly text: string;
  readonly rect: Rect;
  readonly enabled: boolean;
  readonly selected?: boolean;
}

export interface EncyclopediaLayout {
  readonly rect: Rect;
  readonly entry: ReferenceEntry;
  readonly controls: readonly ReferenceControl[];
  readonly text: readonly { text: string; rect: Rect }[];
  readonly offset: number;
  readonly max: number;
  readonly page: number;
  readonly navigation: number;
  readonly navigationPage: number;
  readonly navigationMax: number;
}

export function openReference(entry = 'first-steps'): ReferenceState {
  const item = REFERENCE_ENTRIES.find((candidate) => candidate.id === entry);
  if (!item) throw new RangeError(`Unknown reference: ${entry}`);
  return { entry, offset: 0, navigation: referenceOf(item.section).findIndex((candidate) => candidate.id === entry) };
}

/** All geometry is in screen pixels; text wraps before the one integer scale. */
export function encyclopediaLayout(size: HudSize, state: ReferenceState, scale = 2): EncyclopediaLayout {
  const width = Math.floor(size.width / scale);
  const height = Math.floor(size.height / scale);
  const rect = { x: 8, y: 8, width: width - 16, height: height - 16 };
  const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === state.entry) ?? REFERENCE_ENTRIES[0]!;
  const navWidth = Math.min(176, Math.floor(rect.width * 0.30));
  const bodyX = rect.x + navWidth + 26;
  const bodyWidth = Math.min(520, rect.width - navWidth - 42);
  const page = Math.max(1, Math.floor((rect.height - 156) / 12));
  const lines = entry.body.split('\n').flatMap((paragraph) => paragraph.length === 0 ? [''] : wrapText(paragraph, bodyWidth));
  const max = Math.floor(Math.max(0, lines.length - 1) / page) * page;
  const offset = Math.min(max, Math.max(0, state.offset));
  const topics = referenceOf(entry.section);
  const navigationPage = Math.max(1, Math.floor((rect.height - 228) / 22));
  const navigationMax = Math.max(0, topics.length - navigationPage);
  const navigation = Math.min(navigationMax, Math.max(0, state.navigation));
  const controls: ReferenceControl[] = [
    { id: 'close', text: translate('ref.close'), enabled: true,
      rect: { x: rect.x + 8, y: rect.y + rect.height - 28, width: rect.width - 16, height: 20 } },
    { id: 'navPrevious', text: translate('ref.topicsPrevious'), enabled: navigation > 0,
      rect: { x: rect.x + 8, y: rect.y + rect.height - 54, width: Math.floor(navWidth / 2) - 2, height: 18 } },
    { id: 'navNext', text: translate('ref.topicsNext'), enabled: navigation < navigationMax,
      rect: { x: rect.x + 10 + Math.floor(navWidth / 2), y: rect.y + rect.height - 54, width: Math.floor(navWidth / 2) - 2, height: 18 } },
    { id: 'previous', text: translate('ref.pagePrevious'), enabled: offset > 0,
      rect: { x: bodyX, y: rect.y + rect.height - 54, width: Math.floor(bodyWidth / 2) - 2, height: 18 } },
    { id: 'next', text: translate('ref.pageNext'), enabled: offset < max,
      rect: { x: bodyX + Math.floor(bodyWidth / 2) + 2, y: rect.y + rect.height - 54,
        width: Math.floor(bodyWidth / 2) - 2, height: 18 } },
  ];
  for (const [index, section] of REFERENCE_SECTIONS.entries()) {
    controls.push({ id: `section:${section}`, text: translate(`ref.section.${section}`), enabled: true,
      selected: section === entry.section,
      rect: { x: rect.x + 8, y: rect.y + 28 + index * 22, width: navWidth, height: 20 } });
  }
  for (const [index, item] of topics.slice(navigation, navigation + navigationPage).entries()) {
    controls.push({ id: `entry:${item.id}`, text: item.title, enabled: true, selected: item.id === entry.id,
      rect: { x: rect.x + 8, y: rect.y + 158 + index * 22, width: navWidth, height: 20 } });
  }
  const text = [
    { text: translate('ref.open'), rect: { x: rect.x + 8, y: rect.y + 8, width: navWidth, height: 12 } },
    { text: message('ref.topicRange', { first: navigation + 1, last: Math.min(topics.length, navigation + navigationPage), total: topics.length }),
      rect: { x: rect.x + 8, y: rect.y + 144, width: navWidth, height: 12 } },
    { text: translate(`ref.section.${entry.section}`), rect: { x: bodyX, y: rect.y + 8, width: bodyWidth, height: 12 } },
    ...wrapText(entry.title, bodyWidth).map((line, index) => ({ text: line,
      rect: { x: bodyX, y: rect.y + 28 + index * 12, width: bodyWidth, height: 12 } })),
    ...lines.slice(offset, offset + page).map((line, index) => ({ text: line,
      rect: { x: bodyX, y: rect.y + 60 + index * 12, width: bodyWidth, height: 12 } })),
    { text: message('ref.page', { page: Math.floor(offset / page) + 1, total: Math.ceil(lines.length / page) }),
      rect: { x: bodyX, y: rect.y + rect.height - 104, width: bodyWidth, height: 12 } },
    ...wrapText(translate('ref.help'), bodyWidth).map((line, index) => ({ text: line,
      rect: { x: bodyX, y: rect.y + rect.height - 90 + index * 12, width: bodyWidth, height: 12 } })),
  ];
  const screen = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  return { rect: screen(rect), entry, offset, max, page, navigation, navigationPage, navigationMax,
    controls: controls.map((control) => ({ ...control, rect: screen(control.rect) })),
    text: text.map((line) => ({ ...line, rect: screen(line.rect) })) };
}

/** The same transitions serve pointer controls, keyboard navigation and a future menu. */
export function referenceAction(state: ReferenceState, action: string, layout: EncyclopediaLayout): ReferenceState {
  if (action.startsWith('section:')) {
    const section = REFERENCE_SECTIONS.find((candidate) => candidate === action.slice(8));
    if (section) return openReference(referenceOf(section)[0]!.id);
  }
  if (action.startsWith('entry:')) {
    const next = openReference(action.slice(6));
    const entry = REFERENCE_ENTRIES.find((candidate) => candidate.id === next.entry)!;
    return entry.section === layout.entry.section ? { ...next, navigation: layout.navigation } : next;
  }
  if (action === 'entryNext' || action === 'entryPrevious') {
    const topics = referenceOf(layout.entry.section);
    const index = topics.findIndex((entry) => entry.id === state.entry);
    const nextIndex = (index + (action === 'entryNext' ? 1 : -1) + topics.length) % topics.length;
    return { ...openReference(topics[nextIndex]!.id), navigation: Math.min(nextIndex,
      Math.max(layout.navigation, nextIndex - layout.navigationPage + 1)) };
  }
  if (action === 'previous' || action === 'next') {
    return { ...state, offset: Math.max(0, Math.min(layout.max, layout.offset + (action === 'next' ? layout.page : -layout.page))) };
  }
  if (action === 'navPrevious' || action === 'navNext') {
    return { ...state, navigation: Math.max(0, Math.min(layout.navigationMax,
      layout.navigation + (action === 'navNext' ? layout.navigationPage : -layout.navigationPage))) };
  }
  return state;
}

export function encyclopediaPlate(size: HudSize, layout: EncyclopediaLayout, scale = 2, focus: string | null = null): PixelBuffer {
  const plate = createPixelBuffer(size.width, size.height);
  fillRect(plate, 0, 0, size.width, size.height, BASE.night);
  strokeRect(plate, layout.rect.x, layout.rect.y, layout.rect.width, layout.rect.height, BASE.bronze);
  const section = layout.controls.find((control) => control.id.startsWith('section:'))!;
  fillRect(plate, section.rect.x + section.rect.width + 8 * scale, layout.rect.y + 8 * scale,
    scale, layout.rect.height - 46 * scale, BASE.bronze);
  for (const { text, rect } of layout.text) drawText(plate, text, rect.x, rect.y, BASE.parchment, scale);
  for (const control of layout.controls) {
    paintControl(plate, control.rect, !control.enabled ? 'disabled' : control.selected ? 'selected' : 'idle');
    let label = control.text;
    while (label.length > 0 && measureText(label, scale) > control.rect.width - 8 * scale) label = label.slice(0, -1);
    drawText(plate, label, control.rect.x + 4 * scale, control.rect.y + 5 * scale,
      control.enabled ? BASE.parchment : BASE.stone, scale);
    if (control.id === focus) paintFocus(plate, control.rect);
  }
  return plate;
}
