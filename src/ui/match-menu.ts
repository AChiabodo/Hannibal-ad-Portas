/** Declarative bitmap plates for setup and the persistent Match announcement. */
import { drawText } from '../art/font.ts';
import { BASE } from '../art/palette.ts';
import { createPixelBuffer, fillRect, strokeRect, type PixelBuffer } from '../art/pixel-buffer.ts';
import type { MatchConfiguration } from '../input/match-setup.ts';
import type { MatchResult } from '../sim/outcome.ts';
import type { Speed } from '../sim/pacing.ts';
import type { UiPreferences } from './preferences.ts';
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
  readonly action: '0' | '1' | '2' | '3' | 'speed1' | 'speed2' | 'speed3' | 'restart' | 'new' | 'copy' | 'scale' | 'reset' | 'guide' | 'close';
  readonly speed?: Speed;
  readonly text: string;
  readonly rect: Rect;
  readonly enabled: boolean;
}
export interface MatchMenu {
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

export function setupLayout(size: HudSize, model: SetupModel): SetupMenu {
  // A page rather than a dialog: the objective and the two choices need whole
  // sentences, and a sentence squeezed into the one line a menu row has is how a
  // first entry ends up explaining nothing (#59).
  const rect = { x: Math.floor((size.width - 600) / 2), y: Math.floor((size.height - 360) / 2), width: 600, height: 360 };
  const textWidth = rect.width - 24;
  const texts: SetupText[] = [];
  const lines = [
    translate('match.objective'),
    translate('match.factionHelp'),
    translate('match.difficultyHelp'),
    model.seedText === '' ? message('match.seedHint', { seed: model.proposed })
      : `${translate('match.seed')}: ${model.seedText}`,
    ...(model.invalid ? [translate('match.invalidSeed')] : []),
  ].flatMap((line) => wrapText(line, textWidth));
  const lineStep = 9;
  let y = rect.y + 10;
  texts.push({ text: translate('match.setup'), rect: { x: rect.x + 12, y, width: textWidth, height: 16 }, scale: 2 });
  y += 16 + 6;
  for (const line of lines) {
    texts.push({ text: line, rect: { x: rect.x + 12, y, width: textWidth, height: lineStep }, scale: 1 });
    y += lineStep;
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
    rect: { x: rect.x + 20, y: y + index * 36, width: 520, height: 30 },
  }));
  texts.push({ text: translate('match.setupHelp'),
    rect: { x: rect.x + 12, y: rect.y + rect.height - 16, width: textWidth, height: lineStep }, scale: 1 });

  return { rect, texts, buttons };
}

/** The setup page's plate: the title, the brief explanation and the four controls. */
export function setupPlate(size: HudSize, menu: SetupMenu, focus: number | null = null): PixelBuffer {
  const plate = createPixelBuffer(size.width, size.height);
  fillRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.night);
  strokeRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.bronze);
  for (const { text, rect, scale } of menu.texts) drawText(plate, text, rect.x, rect.y, BASE.parchment, scale);
  for (const [index, button] of menu.buttons.entries()) {
    const { x, y, width, height } = button.rect;
    strokeRect(plate, x, y, width, height, !button.enabled ? BASE.stone : index === focus ? BASE.parchment : BASE.bronze);
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
  return { rect, lines, buttons };
}

export function menuPlate(size: HudSize, menu: MatchMenu, scale = 1): PixelBuffer {
  const plate = createPixelBuffer(size.width, size.height);
  fillRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.night);
  strokeRect(plate, menu.rect.x, menu.rect.y, menu.rect.width, menu.rect.height, BASE.bronze);
  for (const [index, line] of menu.lines.entries()) {
    drawText(plate, line, menu.rect.x + 12 * scale, menu.rect.y + (8 + index * 15) * scale, BASE.parchment, scale);
  }
  for (const button of menu.buttons) {
    const { x, y, width, height } = button.rect;
    strokeRect(plate, x, y, width, height, !button.enabled ? BASE.stone : BASE.bronze);
    drawText(plate, button.text, x + 6 * scale, y + 6 * scale, button.enabled ? BASE.parchment : BASE.stone, scale);
  }
  return plate;
}

export function contains(rect: Rect, x: number, y: number): boolean {
  return x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
}


/** The same announcement plate, compacted into the desktop top area. */
export function desktopMatchMenu(size: HudSize, top: number, config: MatchConfiguration,
  speed: Speed, result: MatchResult | null, notice: string, preferences: UiPreferences): MatchMenu {
  const scale = preferences.uiScale;
  const logicalSize = { width: Math.floor(size.width / scale), height: Math.floor(size.height / scale) };
  const menu = matchMenu(logicalSize, top / scale, config, speed, result, notice);
  const lineHeight = 8 + menu.lines.length * 15;
  const rect = { x: 0, y: top / scale, width: logicalSize.width, height: lineHeight + 56 };
  const buttons: MenuButton[] = menu.buttons.map((button) => ({ ...button,
    rect: { ...button.rect, x: button.rect.x - 166, y: rect.y + lineHeight } }));
  const preferencesButtons = [
    ['scale', message('ui.scale', { scale }), 104], ['reset', translate('ui.reset'), 104],
    ['guide', translate(preferences.guideDismissed ? 'ui.openGuide' : 'ui.hideGuide'), 104], ['close', translate('ui.closeOptions'), 104],
  ] as const;
  for (const [index, [action, text, width]] of preferencesButtons.entries()) buttons.push({ action, text, enabled: true,
    rect: { x: 8 + index * 110, y: rect.y + lineHeight + 28, width, height: 22 } });
  const scaleRect = (r: Rect): Rect => ({ x: r.x * scale, y: r.y * scale, width: r.width * scale, height: r.height * scale });
  return { ...menu, rect: scaleRect(rect), buttons: buttons.map((button) => ({ ...button, rect: scaleRect(button.rect) })) };
}
