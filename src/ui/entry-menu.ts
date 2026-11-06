import { TUTORIAL_CHAPTERS } from '../input/tutorial.ts';
import type { HudSize } from './hud.ts';
import type { MatchMenu, MenuButton } from './match-menu.ts';
import { fittedUiScale } from './preferences.ts';
import { translate } from './strings.ts';

export function entryMenu(size: HudSize, chapters: boolean, resumable: boolean, requestedScale = 2): MatchMenu {
  const scale = fittedUiScale(requestedScale, size);
  const actions: MenuButton['action'][] = chapters ? [...TUTORIAL_CHAPTERS, 'back']
    : [...(resumable ? ['resume' as const] : []), 'play', 'tutorial', 'reference', 'settings'];
  const lines = chapters ? [translate('entry.tutorial'), translate('tutorial.intro'), translate('tutorial.repeat')]
    : [translate('entry.title'), translate('entry.memory'), translate('entry.reload')];
  const width = 560 * scale;
  const height = (76 + actions.length * 28) * scale;
  const x = Math.floor((size.width - width) / 2), y = Math.floor((size.height - height) / 2);
  return { headline: 0, rect: { x, y, width, height }, lines, buttons: actions.map((action, index) => ({
    action, enabled: true,
    text: action === 'reference' ? translate('ref.open') : action === 'settings' ? translate('entry.options')
      : action === 'back' ? translate('entry.home') : TUTORIAL_CHAPTERS.some((chapter) => chapter === action)
        ? translate(`tutorial.${action}` as Parameters<typeof translate>[0]) : translate(`entry.${action}` as Parameters<typeof translate>[0]),
    rect: { x: x + 12 * scale, y: y + (72 + index * 28) * scale, width: width - 24 * scale, height: 22 * scale },
  })) };
}
