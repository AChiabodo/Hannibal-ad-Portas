/** Common RTS resource chrome: faction treasury, named local stocks, calendar and menu. */
import type { HudModel, HudLayout, HudSize } from './hud.ts';
import { message, translate } from './strings.ts';
import { SEASON_TICKS } from '../sim/season.ts';

export function resourceBar(model: HudModel, size: HudSize): Pick<HudLayout, 'readouts' | 'text' | 'buttons'> {
  const scale = model.view.uiScale ?? 2, width = Math.floor(size.width / scale);
  const rect = (x: number, y: number, w: number, h: number) => ({ x: x * scale, y: y * scale, width: w * scale, height: h * scale });
  const text = [
    { text: message('hud.localStocks', { name: model.readouts[0]?.value ?? '' }), rect: rect(4, 26, 210, 10) },
    { text: message('hud.calendar', { year: model.readouts[1]?.value ?? '', season: model.readouts[2]?.value ?? '',
      progress: Math.floor((model.view.tick ?? 0) % SEASON_TICKS * 100 / SEASON_TICKS) }), rect: rect(218, 26, 190, 10) },
    { role: 'pace' as const, text: message('hud.pace', { state: translate(model.view.ended ? 'pause.finished' : model.view.paused ? 'ui.paused' : 'ui.running'), speed: model.view.speed ?? 1 }), rect: rect(414, 26, 104, 10) },
  ];
  if (model.view.scaleWarning || model.view.smallWindow) text.push({
    text: translate(model.view.smallWindow ? 'ui.smallWindow' : 'ui.scaleWarning'),
    rect: rect(4, 42, width - 8, 10),
  });
  const readouts = [model.readouts[3], ...model.readouts.slice(4, 8)].flatMap((line, i) => line ? [{
    line: { ...line, value: line.value === translate('ui.unknown') ? '?' : line.value, label: `${line.label}:`, large: false, newRow: false }, rect: rect(i === 0 ? 88 : 180 + (i - 1) * 84, 7, 82, 10),
  }] : []);
  const buttons: HudLayout['buttons'] = [
    { action: 'session', text: translate('pause.open'), rect: rect(4, 3, 76, 18), enabled: true },
    { action: 'reference', text: translate('ref.open'), rect: rect(width - 108, 3, 104, 18), enabled: true },
    { action: 'notices', text: message('ui.noticesCount', { count: model.notices.length }), rect: rect(width - 116, 23, 112, 15), enabled: model.notices.length > 0 },
  ];
  return { text, readouts, buttons };
}
