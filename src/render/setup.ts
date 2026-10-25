import { BASE } from '../art/palette.ts';
import { explicitSeed, matchAddress, type MatchConfiguration } from '../input/match-setup.ts';
import { makeRng } from '../sim/rng.ts';
import { contains, setupLayout, setupPlate, type SetupModel } from '../ui/match-menu.ts';
import { translate } from '../ui/strings.ts';
import { createStage, textureOf, frameReport } from './stage.ts';
import { publishHooks } from '../page.ts';
import { VIEWPORT_HEIGHT, VIEWPORT_WIDTH } from './view.ts';
import { ENTRY_PATH } from './entry-path.ts';

/** The setup uses the same glyphs, pixels and upload adapter as the HUD. */
export async function showSetup(mount: HTMLElement, navigation?: { start: (config: MatchConfiguration) => void; back: () => void }): Promise<{ dispose(): void }> {
  const stage = await createStage(mount, { width: VIEWPORT_WIDTH, height: navigation ? 540 : VIEWPORT_HEIGHT, background: BASE.night });
  const entropy = crypto.getRandomValues(new Uint32Array(1))[0]!;
  const source = makeRng(entropy);
  const previous = new URLSearchParams(location.search).get('previous');
  let proposed = source.nextUint32();
  while (String(proposed) === previous) proposed = source.nextUint32();
  let config: MatchConfiguration = { seed: proposed, faction: 'rome', difficulty: 'centurio' };
  let focus = 0;
  let seedText = '';
  let replaceSeed = true;
  const size = { width: stage.width, height: stage.height };
  const sprite = stage.spriteOf(setupPlate(size, layout(), focus));
  stage.root.addChild(sprite);
  stage.canvas.tabIndex = 0;
  stage.canvas.setAttribute('role', 'application');
  stage.canvas.focus();
  repaint();
  document.body.dataset.spqrScreen = 'setup';
  publishHooks({ boot: { booted: true, render: frameReport(stage) }, game: null, view: null, atelier: null });

  function model(): SetupModel {
    return { config, proposed, seedText, focus, invalid: seedText !== '' && explicitSeed(seedText) === null };
  }
  function layout() { return setupLayout(size, model(), navigation !== undefined); }
  function repaint(): void {
    const old = sprite.texture;
    sprite.texture = textureOf(setupPlate(size, layout(), focus));
    old.destroy(true);
    stage.canvas.setAttribute('aria-label', [translate('match.setup'),
      ...layout().buttons.map(({ text }) => `${text}.`), ...layout().texts.map(({ text }) => text)].join(' '));
    stage.render();
  }
  function change(direction: number): void {
    if (focus === 0) config = { ...config, faction: config.faction === 'rome' ? 'carthage' : 'rome' };
    if (focus === 1) {
      const levels = ['tiro', 'centurio', 'imperator'] as const;
      config = { ...config, difficulty: levels[(levels.indexOf(config.difficulty) + direction + 3) % 3]! };
    }
  }
  function start(): void {
    const seed = seedText === '' ? proposed : explicitSeed(seedText);
    if (seed !== null) {
      if (navigation) navigation.start({ ...config, seed });
      else location.assign(matchAddress({ ...config, seed }, ENTRY_PATH));
    }
  }
  stage.canvas.addEventListener('paste', (event) => {
    if (focus !== 2) return;
    event.preventDefault();
    seedText = (event.clipboardData?.getData('text') ?? '').trim().slice(0, 24);
    replaceSeed = true;
    repaint();
  });
  stage.canvas.addEventListener('pointerup', (event) => {
    const box = stage.canvas.getBoundingClientRect();
    const index = layout().buttons.findIndex(({ rect }) => contains(rect, event.clientX - box.left, event.clientY - box.top));
    if (index < 0) return;
    focus = index;
    replaceSeed = true;
    if (focus < 2) change(1);
    if (focus === 3) { start(); return; }
    if (focus === 4) { navigation?.back(); return; }
    repaint();
    stage.canvas.focus();
  });
  stage.canvas.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navigation) { navigation.back(); return; }
    if (event.key === 'Tab') {
      event.preventDefault();
      focus = (focus + (event.shiftKey ? layout().buttons.length - 1 : 1)) % layout().buttons.length;
      replaceSeed = true;
    } else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      change(event.key === 'ArrowRight' ? 1 : -1);
    } else if (event.key === 'Enter' || (event.key === ' ' && focus !== 2)) {
      event.preventDefault();
      if (focus === 3) { start(); return; }
      else if (focus === 4) { navigation?.back(); return; }
      else change(1);
    } else if (focus === 2) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        replaceSeed = true;
      } else if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        seedText = replaceSeed ? '' : seedText.slice(0, -1);
        replaceSeed = false;
      } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey) {
        event.preventDefault();
        if (seedText.length < 24 || replaceSeed) seedText = (replaceSeed ? '' : seedText) + event.key;
        replaceSeed = false;
      }
    }
    repaint();
  });
  return { dispose: () => stage.destroy() };
}
