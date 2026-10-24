import { BUILDINGS, SQUAD_TYPES } from '../content/index.ts';
import type { Tutorial } from '../input/tutorial.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { SEASON_TICKS } from '../sim/season.ts';
import { CAPTURE_HOLDS, CAPTURE_TICKS } from '../sim/siege.ts';
import type { GuidePanel } from './guide.ts';
import { message, translate, type StringKey } from './strings.ts';

const farm = BUILDINGS.find((building) => building.id === 'farm')!;
const hastati = SQUAD_TYPES.find((squad) => squad.id === 'hastati')!;
const terms = { timber: farm.cost.timber, workers: farm.labour, seconds: farm.buildTicks / TICK_HZ,
  grain: farm.yields.grain, seasonSeconds: SEASON_TICKS / TICK_HZ, recruitGrain: hastati.cost.grain,
  recruitIron: hastati.cost.iron, payroll: hastati.payroll, doublePayroll: hastati.payroll * 2,
  captureSeconds: CAPTURE_TICKS * CAPTURE_HOLDS / TICK_HZ };

/** Every explanation remains visible until acknowledged; action steps also require their outcome. */
export function tutorialPanel(tutorial: Tutorial): GuidePanel {
  const key = tutorial.lesson.id === 'welcome' ? `tutorial.${tutorial.chapter}.welcome` : `tutorial.lesson.${tutorial.lesson.id}`;
  return {
    stage: tutorial.complete ? 'complete' : 'stronghold',
    step: tutorial.complete ? 0 : tutorial.progress + 1,
    title: translate(`tutorial.${tutorial.chapter}`),
    lines: tutorial.complete ? [translate('tutorial.done')] : [
      message('tutorial.step', { step: tutorial.progress + 1, total: tutorial.lessons.length }),
      message(key as StringKey, terms),
      translate(tutorial.lesson.goal === 'read' ? 'tutorial.read' : tutorial.ready ? 'tutorial.ready' : 'tutorial.waiting'),
      ...(!tutorial.ready && tutorial.host.pacing.paused ? [translate('tutorial.paused')] : []),
    ],
    actions: [
      { action: 'tutorialNext', text: translate(tutorial.complete ? 'tutorial.chapters' : 'tutorial.next'), enabled: tutorial.ready },
      { action: 'tutorialRetry', text: translate('tutorial.retry') },
      { action: 'tutorialHelp', text: translate('tutorial.help') },
      { action: 'tutorialExit', text: translate('tutorial.exit') },
    ],
  };
}
