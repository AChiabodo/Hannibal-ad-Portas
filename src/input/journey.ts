/** In-memory navigation owns the active session; destinations never step a Match. */
import { createBrowserMatch } from './match-host.ts';
import type { MatchConfiguration } from './match-setup.ts';
import { createTutorial, type Tutorial, type TutorialChapter } from './tutorial.ts';

export type JourneyPage = 'menu' | 'setup' | 'reference' | 'options' | 'chapters' | 'match' | 'practice';
export type BrowserMatch = ReturnType<typeof createBrowserMatch>;

export function createJourney() {
  let normal: BrowserMatch | null = null;
  let active: BrowserMatch | null = null;
  let page: JourneyPage = 'menu';
  let tutorial: Tutorial | null = null;
  function open(next: JourneyPage): void {
    active?.pacing.pause();
    active = null;
    page = next;
  }
  return {
    get page() { return page; },
    get normal() { return normal; },
    get active() { return active; },
    get tutorial() { return tutorial; },
    open,
    menu: () => open('menu'),
    play(config: MatchConfiguration): BrowserMatch {
      open('match');
      normal = active = createBrowserMatch(config);
      return normal;
    },
    practice(chapter: TutorialChapter): BrowserMatch {
      open('practice');
      tutorial = createTutorial(chapter);
      active = tutorial.host;
      return active;
    },
    resume(): BrowserMatch | null {
      open('match');
      active = normal;
      if (normal?.result === null) normal.pacing.resume();
      return normal;
    },
    elapse(milliseconds: number): void { active?.elapse(milliseconds); },
  };
}
