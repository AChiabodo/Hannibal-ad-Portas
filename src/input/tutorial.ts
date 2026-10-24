/** Repeatable exercises use ordinary rules and learn only from permitted outcomes. */
import { recruit, type Command } from '../sim/command.ts';
import { idleController, type Controller } from '../sim/controller.ts';
import type { SiegeVisible } from '../sim/siege.ts';
import { createBrowserMatch } from './match-host.ts';

export const TUTORIAL_CHAPTERS = ['economy', 'recruitment', 'combat', 'siege'] as const;
export type TutorialChapter = typeof TUTORIAL_CHAPTERS[number];

/** One defending Squad, raised through the same rules and budget as the human. */
function exerciseOpponent(): Controller<SiegeVisible> {
  let recruited = false;
  return { decide({ faction, visible }) {
    if (recruited || !visible.settlements[0]) return [];
    recruited = true;
    return [recruit(faction, visible.settlements[0].id, 'gaul', 24, 1)];
  } };
}

export function createTutorial(chapter: TutorialChapter) {
  let progress = 0;
  let sawEnemy = false;
  let fought = false;
  let captured = false;
  let besieged = false;
  let movedGroup = false;
  const departures = new Map<number, { x: number; y: number }>();
  const previous = new Map<number, { x: number; y: number }>();
  function update(view: SiegeVisible, commands: readonly Command[]): void {
    sawEnemy ||= view.enemies.length > 0;
    fought ||= view.squads.some((squad) => squad.engaged);
    captured ||= view.settlements.some(({ id }) => id > 1);
    besieged ||= view.fronts.some((front) => front.besieger === 'rome' && front.siege !== null);
    for (const command of commands) {
      if ((command.kind === 'move' || command.kind === 'attackMove') && command.squads.length >= 2) {
        for (const id of command.squads) {
          const squad = view.squads.find((s) => s.id === id && s.refused === null && !s.routing);
          const from = previous.get(id);
          if (squad && (squad.goal !== null || (from && (squad.x !== from.x || squad.y !== from.y)))) {
            departures.set(id, from ?? { x: squad.x, y: squad.y });
          }
        }
      }
    }
    movedGroup ||= view.squads.filter((squad) => {
      const from = departures.get(squad.id);
      return from && (squad.x !== from.x || squad.y !== from.y);
    }).length >= 2;
    const standing = view.settlements.some((settlement) => settlement.works.some((work) => work.standing));
    const smallSquads = view.squads.filter((squad) => squad.capacity === 24).length >= 2;
    // Each condition is a real outcome, never a submitted verb or an acknowledgement.
    const outcomes = chapter === 'economy' ? [standing, view.year > 1 || view.season !== 'spring']
      : chapter === 'recruitment' ? [smallSquads, standing]
        : chapter === 'combat' ? [movedGroup, sawEnemy && fought]
          : [captured, sawEnemy && fought, besieged];
    while (progress < outcomes.length && outcomes[progress]) progress += 1;
    previous.clear();
    for (const squad of view.squads) previous.set(squad.id, { x: squad.x, y: squad.y });
  }
  const host = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro', afterTick: update,
    ...(chapter === 'siege' ? {} : { opponent: chapter === 'combat' ? exerciseOpponent() : idleController<SiegeVisible>() }) });
  return {
    chapter, host,
    get progress() { return progress; },
    get complete() { return progress >= (chapter === 'siege' ? 3 : 2); },
    next(): boolean { return this.complete; },
  };
}
export type Tutorial = ReturnType<typeof createTutorial>;
