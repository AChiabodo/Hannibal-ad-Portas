import type { Tutorial } from '../input/tutorial.ts';
import type { GuidePanel } from './guide.ts';
import { translate } from './strings.ts';

/** One concise current objective; the existing reference carries the full explanation. */
export function tutorialPanel(tutorial: Tutorial): GuidePanel {
  return {
    stage: tutorial.complete ? 'complete' : 'stronghold',
    step: tutorial.progress + 1,
    title: translate(`tutorial.${tutorial.chapter}`),
    lines: [tutorial.complete ? translate('tutorial.done') : translate(`tutorial.${tutorial.chapter}.${tutorial.progress}` as Parameters<typeof translate>[0])],
    actions: [
      ...(tutorial.complete ? [{ action: 'tutorialNext' as const, text: translate('tutorial.next') }] : []),
      { action: 'tutorialRetry', text: translate('tutorial.retry') },
      { action: 'tutorialHelp', text: translate('tutorial.help') },
      { action: 'tutorialExit', text: translate('tutorial.exit') },
    ],
  };
}
