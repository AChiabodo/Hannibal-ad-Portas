import { afterEach, describe, expect, it, vi } from 'vitest';
import { hudHit, hudLayout, hudModel, type Rect } from '../../src/ui/hud';
import { DEFAULT_UI_PREFERENCES, loadUiPreferences, saveUiPreferences, UI_PREFERENCES_KEY } from '../../src/ui/preferences';
import { TILE_COUNT } from '../../src/sim/map';
import type { EconomyVisible } from '../../src/sim/economy-match';
import { desktopMatchMenu } from '../../src/ui/match-menu';
import { measureText } from '../../src/art/font';

const visible: EconomyVisible = { season: 'spring', year: 1, treasury: 20,
  territory: new Uint8Array(TILE_COUNT), squads: [], settlements: [{ id: 0, x: 10, y: 10, tier: 1,
    population: 10, stocks: { grain: 20, timber: 20, stone: 10, iron: 10 },
    land: { grain: 3, timber: 3, stone: 2, iron: 2 }, works: [] }] };
afterEach(() => vi.unstubAllGlobals());

describe('selectable presentation layouts', () => {
  it('defaults to B and migrates old or invalid saved preferences without losing other settings', () => {
    expect(DEFAULT_UI_PREFERENCES.panelLayout).toBe('sidebar');
    const storage = new Map([[UI_PREFERENCES_KEY, JSON.stringify({ uiScale: 1, navigator: false, guideDismissed: true })]]);
    vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) });
    expect(loadUiPreferences()).toMatchObject({ panelLayout: 'sidebar', uiScale: 1, navigator: false, guideDismissed: true });
    for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
      saveUiPreferences({ ...DEFAULT_UI_PREFERENCES, panelLayout });
      expect(loadUiPreferences().panelLayout).toBe(panelLayout);
    }
    storage.set(UI_PREFERENCES_KEY, JSON.stringify({ panelLayout: 'unknown' }));
    expect(loadUiPreferences().panelLayout).toBe('sidebar');
  });

  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
      it(`${panelLayout} keeps catalogue, inspection, purchase and help reachable at ${size.width}`, () => {
        const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [],
          { desktop: true, uiScale: 2, panelLayout, inspectedOrder: 'build:forum' },
          { faction: 'rome', tab: 'construction', category: 'development' });
        const layout = hudLayout(model, size);
        const purchase = layout.buttons.find((b) => b.action === 'purchase:build:forum');
        expect(purchase).toBeDefined();
        expect(purchase!.enabled).toBe(false);
        const help = layout.buttons.find((b) => b.action === 'reference:building:forum')!;
        expect(help).toBeDefined();
        expect(hudHit(model, size, help.rect.x + 2, help.rect.y + 2)).toMatchObject({ kind: 'button', action: 'reference:building:forum' });
        for (const { rect } of [...layout.buttons, ...layout.commands, ...layout.tabs, ...layout.text, ...layout.priority, ...layout.status]) {
          expect(rect.x).toBeGreaterThanOrEqual(0); expect(rect.y).toBeGreaterThanOrEqual(0);
          expect(rect.x + rect.width, JSON.stringify(rect)).toBeLessThanOrEqual(size.width);
          expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
        }
        for (const line of [...layout.text, ...layout.priority, ...layout.status]) {
          expect(line.text).not.toMatch(/[\r\n]/);
          expect(measureText(line.text, 2), line.text).toBeLessThanOrEqual(line.rect.width);
        }
        if (panelLayout === 'sidebar') {
          expect(layout.detail.x + layout.detail.width).toBe(size.width);
          expect(layout.detail.y).toBeLessThan(120);
          expect(layout.minimap.x).toBeLessThan(20);
          expect(layout.theatre!.x + layout.theatre!.width).toBeLessThanOrEqual(layout.detail.x);
        } else {
          expect(layout.detail.height).toBeLessThanOrEqual(228);
          if (panelLayout === 'dock') {
            expect(layout.detail.width).toBe(size.width);
            expect(layout.minimap.y).toBeLessThan(layout.detail.y);
          }
        }
      });
    }
  }
});

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
it('keeps every purchase and catalogue page clear of paging controls in all saved layouts', () => {
  for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
    const menu = desktopMatchMenu({ width: 1280, height: 720 }, 80,
      { faction: 'rome', difficulty: 'centurio', seed: 7 }, 1, null, '', { ...DEFAULT_UI_PREFERENCES, panelLayout }, 'settings');
    expect(menu.buttons.find((b) => b.action === 'panelLayout')?.text).toContain(panelLayout === 'sidebar' ? 'B -' : panelLayout === 'dock' ? 'A -' : 'C -');
    for (const button of menu.buttons) expect(button.rect.x + button.rect.width).toBeLessThanOrEqual(1280);
    for (const faction of ['rome', 'carthage'] as const) for (const tab of ['construction', 'recruitment'] as const) {
      for (const category of ['production', 'economy', 'development', 'military'] as const) {
        const seed = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [], {}, { faction, tab, category });
        const reachable = new Set<string>();
        for (const offset of Array.from({ length: seed.commands.length + 1 }, (_, i) => i)) for (const offer of seed.commands) {
          const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [],
            { desktop: true, uiScale: 2, panelLayout, inspectedOrder: offer.id, commandOffset: offset },
            { faction, tab, category, recruitCount: 9, pending: 1 });
          const layout = hudLayout(model, { width: 1280, height: 720 });
          for (const command of layout.commands) {
            reachable.add(command.order.id);
            for (const button of layout.buttons) expect(overlaps(command.rect, button.rect), `${panelLayout} ${tab} ${command.order.id} / ${button.action}`).toBe(false);
          }
          expect(layout.buttons.find((b) => b.action === `purchase:${offer.id}`)).toBeDefined();
          for (const line of [...layout.text, ...layout.priority]) {
            for (const button of layout.buttons) expect(overlaps(line.rect, button.rect), `${panelLayout}: ${line.text} / ${button.action}`).toBe(false);
          }
        }
        expect([...reachable].sort()).toEqual(seed.commands.map((o) => o.id).sort());
      }
    }
  }
});
it('keeps mixed-selection exceptions, return-to-group and military orders usable', () => {
  const squad = { id: 1, type: 'hastati', x: 12, y: 8, men: 90, capacity: 120, figures: 90,
    formation: 'line', facing: 'south', goal: null, refused: null, morale: 7, fatigue: 2, ammunition: 3,
    routing: true, engaged: false, payroll: 3, unpaid: 0, bearing: 0, garrison: null, home: 0, inTerritory: true, inCamp: false } as const;
  for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
    for (const group of [true, false]) {
      const model = hudModel({ ...visible, squads: [squad, { ...squad, id: 2, routing: false }] }, [0], { kind: 'squad', id: 1 }, group ? [1, 2] : [1],
        { desktop: true, uiScale: 2, panelLayout }, { faction: 'rome', backToGroup: !group, pending: 1, armed: 'move' });
      const layout = hudLayout(model, { width: 1280, height: 720 });
      if (group) expect(layout.exceptions.some((row) => row.selection.id === 1)).toBe(true);
      else expect(layout.buttons.some((b) => b.action === 'groupBack')).toBe(true);
      expect(layout.commands.length).toBeGreaterThan(0);
      for (const command of layout.commands) {
        expect(command.rect.y + command.rect.height).toBeLessThanOrEqual(720);
        for (const button of layout.buttons) expect(overlaps(command.rect, button.rect), `${panelLayout} / ${button.action}`).toBe(false);
        expect(hudHit(model, { width: 1280, height: 720 }, command.rect.x + 2, command.rect.y + 2)).toMatchObject({ kind: 'order', order: { id: command.order.id } });
      }
    }
  }
});

it('does not let the compact inspector intercept control-group clicks', () => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
    const groups = Array.from({ length: 9 }, (_, i) => ({ index: i + 1, count: 1, composition: 'Astati 1' }));
    const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [],
      { desktop: true, uiScale: 2, panelLayout: 'compact', inspectedOrder: 'build:forum' },
      { faction: 'rome', tab: 'construction', category: 'development', groups });
    const layout = hudLayout(model, size);
    for (const group of layout.groups) expect(hudHit(model, size, group.rect.x + group.rect.width / 2, group.rect.y + group.rect.height / 2))
      .toMatchObject({ kind: 'group', index: group.index });
    expect(layout.text.some((line) => line.text.startsWith('IN CORSO'))).toBe(true);
  }
});

it('keeps a readable overview above its paging and account buttons at 720p', () => {
  for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) for (const settlementPage of ['summary', 'balance', 'works'] as const) {
    const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [], { desktop: true, uiScale: 2, panelLayout, settlementPage });
    const layout = hudLayout(model, { width: 1280, height: 720 });
    const content = layout.text.filter((line) => line.rect.y >= layout.detail.y && line.rect.x >= layout.detail.x);
    expect(content.length, `${panelLayout} ${settlementPage}`).toBeGreaterThan(0);
    for (const line of content) for (const button of layout.buttons) expect(overlaps(line.rect, button.rect), line.text).toBe(false);
  }
});

it('keeps expanded notices clear of purchases, groups and the minimap', () => {
  const notices = Array.from({ length: 12 }, (_, i) => ({ id: `event:engaged:${i}`, kind: 'engaged' as const,
    persistent: false, label: `A contatto: Reparto ${i}`, detail: 'Avviso lungo da leggere per intero', target: { kind: 'squad' as const, id: i, x: 10, y: 10 }, raised: i, lost: false }));
  for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
    const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [],
      { desktop: true, uiScale: 2, panelLayout, inspectedOrder: 'build:forum', noticesOpen: true },
      { faction: 'rome', tab: 'construction', category: 'development', notices,
        groups: Array.from({ length: 9 }, (_, i) => ({ index: i + 1, count: 1, composition: 'Astati 1' })) });
    const layout = hudLayout(model, { width: 1280, height: 720 });
    expect(layout.noticeScroll.max).toBeGreaterThan(0);
    for (const row of layout.noticeRows) {
      expect(hudHit(model, { width: 1280, height: 720 }, row.rect.x + 2, row.rect.y + 2)).toMatchObject({ kind: 'notice', id: row.id });
      for (const control of [...layout.commands, ...layout.groups, ...layout.tabs]) expect(overlaps(row.rect, control.rect)).toBe(false);
      expect(overlaps(row.rect, layout.minimap)).toBe(false);
    }
  }
});

it('releases the whole right side when B has no selection', () => {
  const size = { width: 1280, height: 720 };
  const model = hudModel(visible, [0], null, [], { desktop: true, uiScale: 2, panelLayout: 'sidebar' });
  const layout = hudLayout(model, size);
  expect(layout.detail.width * layout.detail.height).toBe(0);
  expect(layout.theatre!.x + layout.theatre!.width).toBe(size.width);
  expect([...layout.text, ...layout.priority].some((line) => line.text.includes('Seleziona un insediamento'))).toBe(false);
});

it('makes the resource bar explain local stocks and moves session controls out of the theatre', () => {
  const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [], { desktop: true, uiScale: 2, panelLayout: 'sidebar' });
  const layout = hudLayout(model, { width: 1280, height: 720 });
  const actions = layout.buttons.filter((b) => b.rect.y < layout.bar.height).map((b) => b.action);
  expect(actions).toEqual(['session', 'reference', 'notices']);
  for (const name of ['Grano', 'Legname', 'Pietra', 'Ferro']) expect(layout.readouts.some((r) => r.line.label.includes(name))).toBe(true);
  expect(layout.text.some((line) => line.text.includes('Scorte di Roccaforte 0'))).toBe(true);
  const menu = desktopMatchMenu({ width: 1280, height: 720 }, layout.bar.height,
    { faction: 'rome', difficulty: 'centurio', seed: 7 }, 1, null, '', DEFAULT_UI_PREFERENCES);
  expect(menu.rect.x).toBeGreaterThan(0);
  expect(menu.buttons.find((b) => b.action === 'close')?.text).toContain('Riprendi');
  expect(menu.buttons.some((b) => b.action === 'settings')).toBe(true);
});

it('explains capture and shows observed centre control directly on a neutral site', () => {
  const site = { id: 2, kind: 'settlement' as const, x: 40, y: 40, owner: null, memory: 'seen' as const,
    front: { settlement: 2, structures: [], breached: false, siege: null, besieger: null, ram: null, hold: 1, garrison: 0 } };
  const model = hudModel(visible, [0], { kind: 'settlement', id: 2 }, [], { desktop: true, uiScale: 2, panelLayout: 'sidebar' },
    { faction: 'rome', sites: [site], tab: 'recruitment' });
  expect(model.detail?.lines.some((line) => line.value.includes('1/3'))).toBe(true);
  const layout = hudLayout(model, { width: 1280, height: 720 });
  for (const { line, rect } of layout.readouts) expect(measureText(line.label, 2) + measureText(line.value, 2) + 4).toBeLessThanOrEqual(rect.width);
  expect(layout.tabs).toEqual([]);
  expect(layout.buttons.some((b) => b.action === 'reference:capture')).toBe(true);
  expect(layout.text.some((line) => line.text.includes('Muovi'))).toBe(true);
});

it('keeps buildings and the construction queue directly reachable from the building catalogue', () => {
  const economy: EconomyVisible = { ...visible, settlements: [{ ...visible.settlements[0]!,
    works: [{ building: 'farm', remaining: 0, standing: true }, { building: 'villa', remaining: 120, standing: false }] }] };
  for (const panelLayout of ['sidebar', 'dock', 'compact'] as const) {
    const view = { desktop: true, uiScale: 2 as const, panelLayout };
    const catalogue = hudModel(economy, [0], { kind: 'settlement', id: 0 }, [], view, { faction: 'rome', tab: 'construction' });
    const layout = hudLayout(catalogue, { width: 1280, height: 720 });
    const queue = layout.buttons.find((button) => button.action === 'settlement:works');
    expect(queue, panelLayout).toBeDefined();
    expect(queue!.text).toBe('Edifici e coda');
    expect(layout.tabs).toHaveLength(3);
    for (const tab of layout.tabs) expect(overlaps(queue!.rect, tab.rect)).toBe(false);
    expect(hudHit(catalogue, { width: 1280, height: 720 }, queue!.rect.x + 2, queue!.rect.y + 2))
      .toMatchObject({ kind: 'button', action: 'settlement:works' });
    const works = hudModel(economy, [0], { kind: 'settlement', id: 0 }, [], { ...view, settlementPage: 'works' }, { faction: 'rome', tab: 'construction' });
    expect(works.detail!.works!.some((line) => line.label === 'Fattoria')).toBe(true);
    expect(works.detail!.works!.some((line) => line.value.includes('12'))).toBe(true);
    const list = hudLayout(works, { width: 1280, height: 720 });
    expect(list.commands).toEqual([]);
    expect(list.buttons.some((button) => button.action === 'settlement:catalogue')).toBe(true);
    const read = Array.from({ length: list.detailScroll.max + 1 }, (_, detailOffset) =>
      hudLayout({ ...works, view: { ...works.view, detailOffset } }, { width: 1280, height: 720 }).text.map((line) => line.text).join(' ')).join(' ');
    expect(read).toContain('Fattoria');
    expect(read).toContain('In costruzione');
    expect(layout.text.some((line) => line.text.includes('In costruzione'))).toBe(true);
  }
});


it('explains the settlement summary with named quantities instead of slash-separated shorthand', () => {
  const model = hudModel(visible, [0], { kind: 'settlement', id: 0 }, [], { desktop: true, uiScale: 2, panelLayout: 'sidebar' });
  const summary = model.detail!.summary!;
  expect(summary.find((line) => line.label === 'Abitanti')?.value).toBe('10 persone');
  expect(summary.find((line) => line.label === 'Capienza abitativa')?.value).toBe('12 persone');
  expect(summary.find((line) => line.label === 'Lavoratori assegnati')?.value).toBe('0');
  expect(summary.find((line) => line.label === 'Richiesti dagli edifici')?.value).toBe('0');
  for (const resource of ['Grano', 'Legname', 'Pietra', 'Ferro']) {
    expect(summary.find((line) => line.label === resource)?.value).toMatch(/unita; capienza 30/);
  }
  expect(summary.map((line) => line.value).join(' ')).not.toMatch(/[|/]/);
});

it('keeps compact building-list navigation clear of close and control groups', () => {
  for (const inspectedOrder of [undefined, 'build:farm']) {
    const economy: EconomyVisible = { ...visible, settlements: [{ ...visible.settlements[0]!,
      works: Array.from({ length: 12 }, () => ({ building: 'farm' as const, remaining: 120, standing: false })) }] };
    const model = hudModel(economy, [0], { kind: 'settlement', id: 0 }, [],
      { desktop: true, uiScale: 2, panelLayout: 'compact', inspectedOrder },
      { faction: 'rome', tab: 'construction', groups: Array.from({ length: 9 }, (_, i) => ({ index: i + 1, count: 1, composition: 'Astati 1' })) });
    const layout = hudLayout(model, { width: 1280, height: 720 });
    const queue = layout.buttons.find((button) => button.action === 'settlement:works')!;
    expect(hudHit(model, { width: 1280, height: 720 }, queue.rect.x + 2, queue.rect.y + 2))
      .toMatchObject({ kind: 'button', action: 'settlement:works' });
    for (const button of layout.buttons) {
      if (button.action === 'closeInspection') expect(overlaps(button.rect, queue.rect)).toBe(false);
      for (const group of layout.groups) expect(overlaps(button.rect, group.rect), button.action).toBe(false);
    }
  }
});
