/** Atelier specimens of the real UI generators, authored as public model data. */
import { blitRegion, createPixelBuffer, type PixelBuffer } from '../art/pixel-buffer.ts';
import type { EconomyVisible } from '../sim/economy-match.ts';
import { hudLayout, hudModel, renderPanels, type Rect } from './hud.ts';
import { desktopMatchMenu, menuPlate, setupLayout, setupPlate } from './match-menu.ts';
import { squadBlock } from '../render/squads.ts';

export const UI_SPECIMENS = ['setup', 'squad', 'armed-pending', 'construction', 'options', 'result',
  'rome-line', 'rome-column', 'carthage-line', 'carthage-column'] as const;

const CONFIG = { seed: 62, faction: 'rome', difficulty: 'centurio' } as const;
const SIZE = { width: 640, height: 360 };
const VISIBLE: EconomyVisible = {
  year: 1, season: 'spring', treasury: 20, territory: new Uint8Array(0),
  settlements: [{ id: 0, x: 10, y: 10, tier: 1, population: 10,
    stocks: { grain: 60, timber: 60, stone: 60, iron: 60 },
    land: { grain: 4, timber: 2, stone: 1, iron: 1 }, works: [] }],
  squads: [{ id: 1, type: 'hastati', x: 11, y: 10, men: 120, capacity: 120, figures: 120,
    formation: 'line', facing: 'south', goal: null, refused: null, morale: 10,
    fatigue: 0, ammunition: 4, routing: false, engaged: false, payroll: 15,
    unpaid: 0, bearing: 120, garrison: null, home: 0, inTerritory: true, inCamp: false }],
};

function crop(source: PixelBuffer, rect: Rect): PixelBuffer {
  const buffer = createPixelBuffer(rect.width, rect.height);
  blitRegion(buffer, source, rect.x, rect.y, rect.width, rect.height, 0, 0);
  return buffer;
}

function specimen(name: (typeof UI_SPECIMENS)[number]): PixelBuffer {
  const formation = name.endsWith('-column') ? 'column' : 'line';
  if (name.startsWith('rome-') || name.startsWith('carthage-')) {
    const faction = name.startsWith('rome-') ? 'rome' : 'carthage';
    return squadBlock({ ...VISIBLE.squads[0]!, type: faction === 'rome' ? 'hastati' : 'libyan-spear', formation }, { faction });
  }
  if (name === 'setup') {
    const size = { width: 600, height: 464 };
    return setupPlate(size, setupLayout(size, { config: CONFIG, proposed: 62, seedText: '', focus: 0, invalid: false }), 0);
  }
  if (name === 'options' || name === 'result') {
    const result = name === 'result' ? { kind: 'victory', winner: 'rome', tick: 62,
      reason: { kind: 'stronghold', stronghold: 1, path: 'assault' } } as const : null;
    const menu = desktopMatchMenu(SIZE, 0, CONFIG, 1, result, '', { panelLayout: 'sidebar', uiScale: 1, navigator: true, guideDismissed: true });
    return crop(menuPlate(SIZE, menu), menu.rect);
  }
  const model = hudModel(VISIBLE, [0], { kind: name === 'construction' ? 'settlement' : 'squad', id: name === 'construction' ? 0 : 1 },
    name === 'construction' ? [] : [1], { desktop: true, uiScale: 1, paused: true },
    { faction: 'rome', tab: 'construction', ...(name === 'armed-pending' ? { armed: 'attackMove', pending: 1 } : {}) });
  return crop(renderPanels(model, SIZE), hudLayout(model, SIZE).detail);
}

export function appearanceEntries(): readonly { readonly name: string; readonly buffer: PixelBuffer }[] {
  return UI_SPECIMENS.map((name) => ({ name: `ui:${name}`, buffer: specimen(name) }));
}
