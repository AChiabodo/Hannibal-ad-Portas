/** Page lifetime: one preserved normal Match, one disposable practice, bitmap destinations. */
import { BASE } from '../art/palette.ts';
import { createJourney } from '../input/journey.ts';
import { matchAddress, type MatchConfiguration } from '../input/match-setup.ts';
import { TUTORIAL_CHAPTERS, type TutorialChapter } from '../input/tutorial.ts';
import { publishHooks } from '../page.ts';
import { encyclopediaLayout, encyclopediaPlate, openReference, referenceAction } from '../ui/encyclopedia.ts';
import { entryMenu } from '../ui/entry-menu.ts';
import { contains, desktopMatchMenu, menuPlate } from '../ui/match-menu.ts';
import { DEFAULT_UI_PREFERENCES, fittedUiScale, loadUiPreferences, PANEL_LAYOUTS, saveUiPreferences } from '../ui/preferences.ts';
import type { Speed } from '../sim/pacing.ts';
import { translate } from '../ui/strings.ts';
import { bootRenderer, type GameView } from './boot.ts';
import { ENTRY_PATH } from './entry-path.ts';
import { showSetup } from './setup.ts';
import { createStage, frameReport, textureOf } from './stage.ts';

export async function showJourney(mount: HTMLElement, direct: MatchConfiguration | null): Promise<void> {
  const journey = createJourney();
  const stage = await createStage(mount, { width: window.innerWidth, height: window.innerHeight, background: BASE.night });
  let preferences = loadUiPreferences();
  let reference = openReference();
  let focus = 0;
  let speed: Speed = 1;
  let normal: GameView | null = null;
  let practice: GameView | null = null;
  let setup: Awaited<ReturnType<typeof showSetup>> | null = null;
  let busy = false;
  const sprite = stage.spriteOf(menuPlate(stage, entryMenu(stage, false, false)));
  stage.root.addChild(sprite);
  stage.canvas.tabIndex = 0;
  stage.canvas.setAttribute('role', 'application');

  const config = (): MatchConfiguration => normal?.configuration() ?? { seed: 7, faction: 'rome', difficulty: 'centurio' };
  const scale = () => fittedUiScale(preferences.uiScale, stage);
  const menu = () => journey.page === 'options'
    ? desktopMatchMenu(stage, 0, config(), journey.normal?.pacing.speed ?? speed, null, '', preferences, 'settings')
    : entryMenu(stage, journey.page === 'chapters', journey.normal !== null, preferences.uiScale);
  const controls = () => journey.page === 'reference'
    ? encyclopediaLayout(stage, reference, scale()).controls.map((button) => ({ ...button, action: button.id }))
    : menu().buttons;

  function paint(): void {
    if (stage.canvas.hidden) return;
    const buttons = controls();
    focus = Math.min(focus, Math.max(0, buttons.length - 1));
    const old = sprite.texture;
    const plate = journey.page === 'reference'
      ? encyclopediaPlate(stage, encyclopediaLayout(stage, reference, scale()), scale(), buttons[focus]?.action)
      : menuPlate(stage, menu(), scale(), buttons[focus]?.rect ?? null);
    sprite.texture = textureOf(plate);
    old.destroy(true);
    stage.canvas.setAttribute('aria-label', [...(journey.page === 'reference'
      ? encyclopediaLayout(stage, reference, scale()).text.map(({ text }) => text) : menu().lines),
    ...buttons.map(({ text }) => text)].join('. '));
    stage.render();
  }
  function destination(page: 'menu' | 'chapters' | 'options' | 'reference'): void {
    preferences = loadUiPreferences();
    normal?.suspend();
    practice?.dispose(); practice = null;
    setup?.dispose(); setup = null;
    journey.open(page);
    history.replaceState(null, '', ENTRY_PATH);
    mount.appendChild(stage.canvas); stage.canvas.hidden = false;
    document.body.dataset.spqrScreen = page;
    focus = 0;
    paint(); stage.canvas.focus();
    publishHooks({ boot: { booted: true, render: frameReport(stage) }, game: null, view: null, atelier: null });
  }
  async function configure(): Promise<void> {
    normal?.suspend(); journey.open('setup'); stage.canvas.hidden = true; stage.canvas.remove();
    setup = await showSetup(mount, { start: (selected) => { void start(selected); }, back: () => destination('menu') });
  }
  async function start(selected: MatchConfiguration): Promise<void> {
    if (busy) return;
    if (normal && !window.confirm(translate('entry.replace'))) return;
    busy = true;
    try {
      document.body.dataset.spqrScreen = 'loading';
      setup?.dispose(); setup = null;
      normal?.dispose(); normal = null;
      stage.canvas.hidden = true; stage.canvas.remove();
      const host = journey.play(selected);
      host.pacing.setSpeed(speed);
      normal = await bootRenderer(mount, { ...selected, host, firstEntry: true, home: () => destination('menu'),
        newMatch: () => { void configure(); }, restart: () => { void start(selected); } });
      history.replaceState(null, '', matchAddress(selected, ENTRY_PATH));
      expose(normal, 'match');
    } finally { busy = false; }
  }
  async function exercise(chapter: TutorialChapter): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      document.body.dataset.spqrScreen = 'loading';
      normal?.suspend(); practice?.dispose(); practice = null;
      stage.canvas.hidden = true; stage.canvas.remove();
      const host = journey.practice(chapter);
      host.pacing.setSpeed(speed);
      practice = await bootRenderer(mount, { seed: 7, faction: 'rome', difficulty: 'tiro', host,
        tutorial: journey.tutorial!, home: () => destination('menu'), newMatch: () => destination('chapters'),
        restart: () => retry(chapter), tutorialAction: (action) => {
          if (action === 'retry') retry(chapter);
          else destination('chapters');
        } });
      expose(practice, 'practice');
    } finally { busy = false; }
  }
  function retry(chapter: TutorialChapter): void {
    if (window.confirm(translate('tutorial.resetConfirm'))) void exercise(chapter);
  }
  function expose(view: GameView, screen: string): void {
    document.body.dataset.spqrScreen = screen;
    publishHooks({ boot: { booted: true, render: view.probe }, game: view, view, atelier: null });
  }
  function activate(action: string): void {
    if (busy) return;
    if (journey.page === 'reference') {
      if (action === 'close') destination('menu');
      else { reference = referenceAction(reference, action, encyclopediaLayout(stage, reference, scale())); paint(); }
      return;
    }
    if (TUTORIAL_CHAPTERS.includes(action as TutorialChapter)) { void exercise(action as TutorialChapter); return; }
    if (action === 'play') { void configure(); return; }
    if (action === 'tutorial') destination('chapters');
    else if (action === 'reference') { reference = openReference(); destination('reference'); }
    else if (action === 'settings') destination('options');
    else if (action === 'back') destination('menu');
    else if (action === 'resume' && normal) {
      journey.resume(); stage.canvas.hidden = true; stage.canvas.remove();
      normal.activate(); expose(normal, 'match');
      history.replaceState(null, '', matchAddress(normal.configuration(), ENTRY_PATH));
    } else if (action === 'panelLayout') preferences = { ...preferences, panelLayout: PANEL_LAYOUTS[(PANEL_LAYOUTS.indexOf(preferences.panelLayout) + 1) % PANEL_LAYOUTS.length]! };
    else if (action === 'scale') preferences = { ...preferences, uiScale: preferences.uiScale % 3 + 1 };
    else if (action === 'navigator') preferences = { ...preferences, navigator: !preferences.navigator };
    else if (action === 'guide') preferences = { ...preferences, guideDismissed: !preferences.guideDismissed };
    else if (action === 'reset') preferences = { ...DEFAULT_UI_PREFERENCES };
    else if (action.startsWith('speed')) {
      speed = Number(action.slice(5)) as Speed;
      journey.normal?.pacing.setSpeed(speed);
    }
    saveUiPreferences(preferences); paint();
  }
  stage.canvas.addEventListener('pointerup', (event) => {
    const box = stage.canvas.getBoundingClientRect();
    const buttons = controls();
    const index = buttons.findIndex(({ rect }) => contains(rect, event.clientX - box.left, event.clientY - box.top));
    if (index < 0) return;
    focus = index;
    if (buttons[index]!.enabled) activate(buttons[index]!.action);
  });
  stage.canvas.addEventListener('keydown', (event) => {
    const buttons = controls();
    if (event.key === 'F1') {
      event.preventDefault();
      if (journey.page === 'reference') destination('menu');
      else activate('reference');
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); destination('menu'); return; }
    if (['Tab', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      const reverse = event.shiftKey || event.key === 'ArrowUp';
      focus = (focus + (reverse ? -1 : 1) + buttons.length) % buttons.length; paint();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); if (buttons[focus]?.enabled) activate(buttons[focus]!.action);
    } else if (journey.page === 'reference' && ['PageUp', 'PageDown'].includes(event.key)) {
      event.preventDefault(); activate(event.key === 'PageUp' ? 'previous' : 'next');
    }
  });
  stage.canvas.addEventListener('wheel', (event) => {
    if (journey.page !== 'reference') return;
    event.preventDefault(); activate(event.deltaY > 0 ? 'next' : 'previous');
  }, { passive: false });
  window.addEventListener('resize', () => { stage.resize(window.innerWidth, window.innerHeight); paint(); });
  window.addEventListener('beforeunload', (event) => {
    if (journey.normal?.result !== null && journey.active?.result !== null) return;
    event.preventDefault(); event.returnValue = '';
  });
  if (direct) await start(direct);
  else destination('menu');
}
