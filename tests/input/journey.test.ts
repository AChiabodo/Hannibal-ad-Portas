import { expect, it } from 'vitest';
import { createJourney } from '../../src/input/journey.ts';
import { build } from '../../src/sim/command.ts';
import { createBrowserMatch } from '../../src/input/match-host.ts';

it('keeps the normal Match paused through configuration, reference, options and practice, then resumes its clock once', () => {
  const journey = createJourney();
  const normal = journey.play({ seed: 7, faction: 'rome', difficulty: 'tiro' });
  normal.human.submit(build('rome', 0, 'farm'));
  journey.elapse(100);
  const hash = normal.match.hash();
  const log = normal.applied();
  journey.menu();
  for (const page of ['setup', 'reference', 'options', 'chapters'] as const) {
    journey.open(page);
    journey.elapse(60000);
  }
  journey.practice('economy');
  journey.elapse(1000);
  journey.menu();
  expect(normal.match.hash()).toBe(hash);
  expect(normal.applied()).toEqual(log);
  expect(normal.match.state.tick).toBe(1);
  expect(normal.pacing.paused).toBe(true);
  expect(journey.resume()).toBe(normal);
  journey.elapse(100);
  expect(normal.match.state.tick).toBe(2);
  const uninterrupted = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro' });
  uninterrupted.human.submit(build('rome', 0, 'farm'));
  uninterrupted.advance(2);
  expect(normal.match.hash()).toBe(uninterrupted.match.hash());
  expect(normal.applied()).toEqual(uninterrupted.applied());
  expect(normal.applied().filter(({ command }) => command.kind === 'build' && command.faction === 'rome')).toHaveLength(1);
});
