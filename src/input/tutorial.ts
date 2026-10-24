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

export type TutorialGoal = 'read' | 'home' | 'construction' | 'production' | 'farmOffer' | 'farmStarted' | 'farmStanding'
  | 'balance' | 'season' | 'recruitment' | 'hastatiOffer' | 'oneSquad' | 'twoSquads' | 'squadSelected'
  | 'groupSelected' | 'movedGroup' | 'groupBound' | 'enemySeen' | 'fought' | 'captured' | 'atEnemy' | 'enemySelected' | 'besieged';
export interface TutorialLesson { readonly id: string; readonly goal: TutorialGoal }
export interface TutorialPresentation {
  readonly settlement: number | null;
  readonly squads: readonly number[];
  readonly tab: 'overview' | 'construction' | 'recruitment';
  readonly category: string;
  readonly inspected: string | null;
  readonly page: string;
}
const lesson = (id: string, goal: TutorialGoal = 'read'): TutorialLesson => ({ id, goal });

/** Reading and acting are separate steps. Next never substitutes for an unperformed action. */
export const TUTORIAL_LESSONS: Readonly<Record<TutorialChapter, readonly TutorialLesson[]>> = {
  economy: [lesson('welcome'), lesson('home', 'home'), lesson('stocks'), lesson('construction', 'construction'),
    lesson('production', 'production'), lesson('farm', 'farmOffer'), lesson('farmCost'), lesson('farmBuild', 'farmStarted'),
    lesson('farmWait', 'farmStanding'), lesson('balance', 'balance'), lesson('season', 'season'), lesson('seasonSummary')],
  recruitment: [lesson('welcome'), lesson('home', 'home'), lesson('construction', 'construction'), lesson('categories'),
    lesson('production', 'production'), lesson('farm', 'farmOffer'), lesson('farmBuild', 'farmStarted'), lesson('farmWait', 'farmStanding'),
    lesson('recruitmentTab', 'recruitment'), lesson('sizes'), lesson('hastati', 'hastatiOffer'), lesson('firstRecruit', 'oneSquad'),
    lesson('payroll'), lesson('secondRecruit', 'twoSquads'), lesson('quantity')],
  combat: [lesson('welcome'), lesson('home', 'home'), lesson('recruitmentTab', 'recruitment'), lesson('hastati', 'hastatiOffer'),
    lesson('firstRecruit', 'oneSquad'), lesson('secondRecruit', 'twoSquads'), lesson('select', 'squadSelected'),
    lesson('groupSelect', 'groupSelected'), lesson('move', 'movedGroup'), lesson('groupBind', 'groupBound'), lesson('groupRecall'), lesson('camera'),
    lesson('explore', 'enemySeen'), lesson('attack', 'fought'), lesson('morale'), lesson('withdraw')],
  siege: [lesson('welcome'), lesson('home', 'home'), lesson('recruitmentTab', 'recruitment'), lesson('hastati', 'hastatiOffer'),
    lesson('firstRecruit', 'oneSquad'), lesson('secondRecruit', 'twoSquads'), lesson('groupSelect', 'groupSelected'),
    lesson('camera'), lesson('exploreVillage'), lesson('capture', 'captured'), lesson('territory'), lesson('enemyExplore', 'enemySeen'),
    lesson('fight', 'fought'), lesson('approach', 'atEnemy'), lesson('enemySelect', 'enemySelected'),
    lesson('siegePaths'), lesson('siegeSelect', 'squadSelected'), lesson('blockade', 'besieged'), lesson('siegeSummary')],
};

export function createTutorial(chapter: TutorialChapter) {
  let progress = 0;
  const lessons = TUTORIAL_LESSONS[chapter];
  const completed = new Set<TutorialGoal>(['read']);
  const departures = new Map<number, { x: number; y: number }>();
  const previous = new Map<number, { x: number; y: number }>();
  let visible: SiegeVisible;
  const mark = (goal: TutorialGoal, condition: boolean) => { if (condition) completed.add(goal); };
  function update(view: SiegeVisible, commands: readonly Command[]): void {
    visible = view;
    mark('enemySeen', view.enemies.length > 0);
    mark('fought', view.squads.some((squad) => squad.engaged));
    mark('captured', view.settlements.some(({ id }) => id > 1));
    mark('besieged', view.fronts.some((front) => front.besieger === 'rome' && front.siege !== null));
    const enemy = view.contacts.find((contact) => contact.kind === 'stronghold' && contact.id === 1);
    mark('atEnemy', enemy !== undefined && view.squads.some((squad) =>
      Math.abs(squad.x - enemy.x) <= 1 && Math.abs(squad.y - enemy.y) <= 1));
    for (const command of commands) {
      if (command.kind === 'group') mark('groupBound', command.squads.filter((id) => view.squads.some((s) => s.id === id)).length >= 2);
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
    mark('movedGroup', view.squads.filter((squad) => {
      const from = departures.get(squad.id);
      return from && (squad.x !== from.x || squad.y !== from.y);
    }).length >= 2);
    const farms = view.settlements.flatMap((settlement) => settlement.works).filter((work) => work.building === 'farm');
    mark('farmStarted', farms.length > 0);
    mark('farmStanding', farms.some((work) => work.standing));
    const smallSquads = view.squads.filter((squad) => squad.type === 'hastati' && squad.capacity === 24).length;
    mark('oneSquad', smallSquads >= 1);
    mark('twoSquads', smallSquads >= 2);
    mark('season', view.year > 1 || view.season !== 'spring');
    previous.clear();
    for (const squad of view.squads) previous.set(squad.id, { x: squad.x, y: squad.y });
  }
  const host = createBrowserMatch({ seed: 7, faction: 'rome', difficulty: 'tiro', afterTick: update,
    ...(chapter === 'siege' ? {} : { opponent: chapter === 'combat' ? exerciseOpponent() : idleController<SiegeVisible>() }) });
  visible = host.observe();
  return {
    chapter, host, lessons,
    get progress() { return progress; },
    get lesson(): TutorialLesson { return lessons[Math.min(progress, lessons.length - 1)]!; },
    get ready(): boolean { return this.complete || completed.has(this.lesson.goal); },
    get complete() { return progress >= lessons.length; },
    /** Public presentation boundary: selection and opened controls, never rule outcomes. */
    present(presentation: TutorialPresentation): void {
      const show = (goal: TutorialGoal, condition: boolean) => {
        if (condition) completed.add(goal); else completed.delete(goal);
      };
      const own = visible.settlements.some((settlement) => settlement.id === presentation.settlement);
      show('home', presentation.settlement === 0 && own);
      show('construction', own && presentation.tab === 'construction');
      show('production', own && presentation.tab === 'construction' && presentation.category === 'production');
      show('farmOffer', own && presentation.inspected === 'build:farm');
      show('balance', own && presentation.tab === 'overview' && presentation.page === 'balance');
      show('recruitment', own && presentation.tab === 'recruitment');
      show('hastatiOffer', own && presentation.inspected === 'recruit:hastati:24');
      const selected = visible.squads.filter((squad) => presentation.squads.includes(squad.id)).length;
      show('squadSelected', selected > 0);
      show('groupSelected', selected >= 2);
      show('enemySelected', presentation.settlement === 1 && visible.fronts.some((front) => front.settlement === 1));
    },
    next(): boolean {
      if (!this.ready) return false;
      if (!this.complete) progress += 1;
      return true;
    },
  };
}
export type Tutorial = ReturnType<typeof createTutorial>;
