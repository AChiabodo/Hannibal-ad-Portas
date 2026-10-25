/** Declarative bitmap plates for setup and the persistent Match announcement. */
import { drawText } from '../art/font.ts';
import { BASE } from '../art/palette.ts';
import { paintControl, paintFocus } from '../art/interface.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import type { MatchConfiguration } from '../input/match-setup.ts';
import type { MatchResult } from '../sim/outcome.ts';
import type { Speed } from '../sim/pacing.ts';
import { fittedUiScale, type UiPreferences } from './preferences.ts';
import { wrapText, type HudSize, type Rect } from './hud.ts';
import { message, translate } from './strings.ts';

/** One line of the setup plate, drawn at its own magnification. */
export interface SetupText {
  readonly text: string;
  readonly rect: Rect;
  readonly scale: number;
}

/** The setup page, placed: the plate's box, its words and its four controls. */
export interface SetupMenu {
  readonly rect: Rect;
  readonly texts: readonly SetupText[];
  readonly buttons: readonly MenuButton[];
}

export interface MenuButton {
  readonly action: '0' | '1' | '2' | '3' | 'speed1' | 'speed2' | 'speed3' | 'restart' | 'new' | 'copy' | 'scale' | 'settings' | 'back' | 'reference' | 'navigator' | 'panelLayout' | 'reset' | 'guide' | 'close' | 'home' | 'play' | 'tutorial' | 'resume' | 'economy' | 'recruitment' | 'combat' | 'siege';
  readonly speed?: Speed;
  readonly text: string;
  readonly rect: Rect;
  readonly enabled: boolean;
}
export interface MatchMenu {
  readonly headline?: number;
  readonly rect: Rect;
  readonly lines: readonly string[];
  readonly buttons: readonly MenuButton[];
}
export interface SetupModel {
  readonly config: MatchConfiguration;
  readonly proposed: number;
  readonly seedText: string;
  readonly focus: number;
  readonly invalid: boolean;
}

export function setupLayout(size: HudSize, model: SetupModel, returnToMenu = false): SetupMenu {
  // A page rather than a dialog: the objective and the two choices need whole
  // sentences, and a sentence squeezed into the one line a menu row has is how a
  // first entry ends up explaining nothing (#59).
  const height = returnToMenu ? 500 : 464;
  const rect = { x: Math.floor((size.width - 600) / 2), y: Math.floor((size.height - height) / 2), width: 600, height };
  const textWidth = rect.width - 32;
  const texts: SetupText[] = [];
  const lines = [
    translate('match.objective'),
    translate('match.factionHelp'),
    translate('match.difficultyHelp'),
    model.seedText === '' ? message('match.seedHint', { seed: model.proposed })
      : `${translate('match.seed')}: ${model.seedText}`,
    ...(model.invalid ? [translate('match.invalidSeed')] : []),
  ];
  const lineStep = 18;
  let y = rect.y + 12;
  texts.push({ text: translate('match.setup'), rect: { x: rect.x + 16, y, width: textWidth, height: 24 }, scale: 3 });
  y += 32;
  for (const paragraph of lines) {
    for (const line of wrapText(paragraph, Math.floor(textWidth / 2))) {
      texts.push({ text: line, rect: { x: rect.x + 16, y, width: textWidth, height: lineStep }, scale: 2 });
      y += lineStep;
    }
    y += 4;
  }

  const values = [
    `${translate('match.faction')}: ${translate(model.config.faction === 'rome' ? 'faction.rome' : 'faction.carthage')}`,
    `${translate('match.difficulty')}: ${translate(`difficulty.${model.config.difficulty}`)}`,
    `${translate('match.seed')}: ${model.seedText || String(model.proposed)}`,
    translate('match.start'),
  ];
  y += 8;
  const buttons: MenuButton[] = ([0, 1, 2, 3] as const).map((index) => ({
    action: `${index}`,
    text: values[index]!,
    enabled: index !== 3 || !model.invalid,
    rect: { x: rect.x + 16, y: y + index * 36, width: textWidth, height: 30 },
  }));
  for (const [index, text] of wrapText(translate('match.setupHelp'), Math.floor(textWidth / 2)).entries()) {
    texts.push({ text, rect: { x: rect.x + 16, y: rect.y + rect.height - 42 + index * lineStep, width: textWidth, height: lineStep }, scale: 2 });
  }

  if (returnToMenu) buttons.push({ action: 'back', text: translate('entry.home'), enabled: true,
    rect: { x: rect.x + 16, y: rect.y + rect.height - 74, width: textWidth, height: 22 } });
  return { rect, texts, buttons };
}

/** The setup page's plate: the title, the brief explanation and the four controls. */
export function setupPlate(size: HudSize, menu: SetupMenu, focus: number | null = null): PixelBuffer {
  const plate = createPixelBuffer(size.width, size.height);
  if (menu.rect.x > 0 && menu.rect.width < size.width) fillRect(plate, 0, 0, size.width, size.height, [BASE.night[0], BASE.night[1], BASE.night[2], 180]);
  fillRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.night);
  strokeRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.bronze);
  for (const { text, rect, scale } of menu.texts) drawText(plate, text, rect.x, rect.y, BASE.parchment, scale);
  for (const [index, button] of menu.buttons.entries()) {
    const { x, y } = button.rect;
    paintControl(plate, button.rect, !button.enabled ? 'disabled' : index === 3 ? 'selected' : 'idle');
    if (index === focus) paintFocus(plate, button.rect);
    drawText(plate, button.text, x + 10, y + 8, button.enabled ? BASE.parchment : BASE.stone, 2);
  }

  return plate;
}

export function matchMenu(size: HudSize, top: number, config: MatchConfiguration,
  speed: Speed, result: MatchResult | null, notice = ''): MatchMenu {
  const rect = { x: 166, y: top, width: size.width - 166, height: result === null ? 72 : 142 };
  const lines = [`${translate(config.faction === 'rome' ? 'faction.rome' : 'faction.carthage')} / ${translate(`difficulty.${config.difficulty}`)} / ${translate('match.seed')}: ${String(config.seed)}`];
  if (notice) lines.push(notice);
  if (result !== null) {
    lines.push(result.kind === 'victory' ? translate(result.winner === config.faction ? 'match.victory' : 'match.defeat') : translate('match.ended'));
    if (result.kind === 'victory') {
      lines.push(result.reason.kind === 'stronghold' ? message('match.stronghold', { id: result.reason.stronghold,
        path: translate(result.reason.path === 'assault' ? 'match.assault' : 'match.blockade') }) : translate('match.annihilation'));
    } else lines.push(translate(result.kind === 'clock' ? 'match.clock' : 'match.draw'));
    lines.push(translate('match.finalKnown'));
  }
  const buttons: MenuButton[] = ([1, 2, 3] as const).map((value, index) => ({ action: `speed${value}`, speed: value,
    text: `${String(value)}x${value === speed ? '*' : ''}`, enabled: result === null,
    rect: { x: rect.x + 8 + index * 40, y: rect.y + rect.height - 28, width: 34, height: 22 } }));
  for (const [index, action] of (['restart', 'new', 'copy'] as const).entries()) buttons.push({ action,
    text: translate(action === 'restart' ? 'match.restartControl' : action === 'new' ? 'match.newControl' : 'match.copyControl'), enabled: true,
    rect: { x: rect.x + 130 + index * 110, y: rect.y + rect.height - 28, width: 104, height: 22 } });
  return { rect, lines, buttons, ...(result === null ? {} : { headline: notice ? 2 : 1 }) };
}

export function menuPlate(size: HudSize, menu: MatchMenu, scale = 1, focus: Rect | null = null): PixelBuffer {
  const plate = createPixelBuffer(size.width, size.height);
  if (menu.rect.x > 0 && menu.rect.width < size.width) fillRect(plate, 0, 0, size.width, size.height, [BASE.night[0], BASE.night[1], BASE.night[2], 180]);
  fillRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.night);
  strokeRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.bronze);
  let lineY = menu.rect.y + 8 * scale;
  for (const [index, line] of menu.lines.entries()) {
    const headline = index === menu.headline;
    drawText(plate, line, menu.rect.x + 12 * scale, lineY, BASE.parchment, headline ? scale * 2 : scale);
    lineY += (headline ? 27 : 15) * scale;
  }
  for (const button of menu.buttons) {
    const { x, y, width, height } = button.rect;
    strokeRect(plate, x, y, width, height, !button.enabled ? BASE.stone : BASE.bronze);
    drawText(plate, button.text, x + 6 * scale, y + 6 * scale, button.enabled ? BASE.parchment : BASE.stone, scale);
  }
  if (focus !== null) paintFocus(plate, focus);
  return plate;
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}


/** Centered pause/result menu; settings are a separate, extensible page. */
export function desktopMatchMenu(size: HudSize, top: number, config: MatchConfiguration,
  speed: Speed, result: MatchResult | null, notice: string, preferences: UiPreferences, page: 'main' | 'settings' = 'main', showHome = false): MatchMenu {
  const scale = fittedUiScale(preferences.uiScale, size);
  const logical = { width: Math.floor(size.width / scale), height: Math.floor(size.height / scale) };
  const base = matchMenu(logical, top / scale, config, speed, result, notice);
  const lines = page === 'settings' ? [translate('pause.settings'), base.lines[0]!]
    : result === null ? [translate('pause.title'), ...base.lines] : base.lines;
  const headline = page === 'settings' || result === null ? 0 : base.headline;
  const items: { action: MenuButton['action']; text: string; speed?: Speed; enabled?: boolean }[] = page === 'main' ? [
    { action: 'close', text: translate(result === null ? 'pause.resume' : 'ui.closeOptions') },
    { action: 'settings', text: translate('pause.settings') },
    { action: 'reference', text: translate('ref.open') },
    ...(showHome ? [{ action: 'home' as const, text: translate('entry.home') }] : []),
    ...(['restart', 'new', 'copy'] as const).map((action) => ({ action, text: translate(`pause.${action}`) })),
  ] : [
    { action: 'back', text: translate('pause.back') },
    { action: 'panelLayout', text: message('ui.panelLayout', { layout: translate(`layout.${preferences.panelLayout}`) }) },
    { action: 'scale', text: preferences.uiScale === scale ? message('ui.scale', { scale }) : message('ui.scaleFitted', { requested: preferences.uiScale, scale }) },
    { action: 'navigator', text: message('pause.navigator', { state: translate(preferences.navigator ? 'pause.on' : 'pause.off') }) },
    { action: 'guide', text: translate(preferences.guideDismissed ? 'ui.openGuide' : 'ui.hideGuide') },
    { action: 'reset', text: translate('ui.reset') },
    ...base.buttons.filter((b) => b.speed !== undefined).map((b) => ({ ...b, text: message('pause.speed', { speed: b.speed!, selected: b.speed === speed ? ' *' : '' }) })),
  ];
  const lineHeight = 12 + lines.reduce((height, _line, i) => height + (i === headline ? 27 : 15), 0);
  const rect: Rect = { x: Math.floor((logical.width - 360) / 2), y: Math.floor((logical.height - lineHeight - items.length * 24 - 12) / 2), width: 360, height: lineHeight + items.length * 24 + 12 };
  const screen = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  return { rect: screen(rect), lines, ...(headline === undefined ? {} : { headline }), buttons: items.map((item, i) => ({
    ...item, enabled: item.enabled ?? true, rect: screen({ x: rect.x + 12, y: rect.y + lineHeight + i * 24, width: rect.width - 24, height: 20 }),
  })) };
}
