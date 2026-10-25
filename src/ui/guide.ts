/**
 * The first-entry guide (ticket U8, approved decision Q11).
 *
 * A new human arrives on a page with a theatre, a list and a card of commands and
 * no idea which of them answers a question they have. The guide is the short path
 * through that: **open the Stronghold, raise a Reparto, select it, give it a
 * destination** — four acts, each of them one a Player would perform anyway, in
 * the real interface rather than in a scripted demonstration.
 *
 * ## What it is not
 *
 * It is not a tutorial rule set, a second Match or a scripted army. It never
 * issues a Command: it reads the Player's own selection and the verbs they have
 * submitted, and moves to the next line when the Player has done the thing. The
 * only thing it does to the Match is what the pause control does — stop the clock
 * while it waits to be begun — and pressing *Inizia* resumes that same clock. A
 * Match with the guide open and one with it skipped reach the same state hash for
 * the same Commands.
 *
 * It also knows nothing about the enemy. Every line is a fixed sentence from the
 * string table; nothing here reads an Observation, so there is no way for the
 * guide to tell a Player where the other Faction is.
 *
 * ## The shape
 *
 * A small state machine, deliberately pure: a stage and whether the panel is
 * open, and an event for each real act. `guideNext` is monotonic — an action can
 * carry the Player forward past a line, never back — so a Player who recruits,
 * selects and marches before reading cannot be sent back to "select a Reparto".
 * The welcome stage is the exception: only *Inizia* leaves it, which is the
 * ticket's "starts paused, waits for the human to begin".
 */

import { message, translate } from './strings.ts';

/** One line of the guide, in the order a first Match needs them. */
export type GuideStage = 'welcome' | 'stronghold' | 'recruit' | 'select' | 'move' | 'complete';

/** The stages in order: the index is how far a Player has got. */
export const GUIDE_STAGES: readonly GuideStage[] = ['welcome', 'stronghold', 'recruit', 'select', 'move', 'complete'];

/** What the guide is doing: its stage, and whether its panel is on screen. */
export interface GuideState {
  readonly stage: GuideStage;
  readonly open: boolean;
}

/** The guide as a page opens it for the first time: closed, on the welcome line. */
export const GUIDE_CLOSED: GuideState = { stage: 'welcome', open: false };

/** The guide as a first entry opens it: waiting for the Player to begin. */
export const GUIDE_FIRST_ENTRY: GuideState = { stage: 'welcome', open: true };

/**
 * Something that happened in the interface, which the guide may answer.
 *
 * `begin` is the Player pressing the guide's own button. The rest are the acts the
 * guide is teaching, reported by the page where the Player performed them — a
 * selection, or a Command that was submitted through the human Controller.
 */
export type GuideEvent =
  | { readonly kind: 'begin' }
  | { readonly kind: 'selection'; readonly what: 'settlement' | 'squad' | 'none' }
  | { readonly kind: 'command'; readonly verb: 'move' | 'attackMove' | 'recruit' | 'other' }
  | { readonly kind: 'skip' }
  | { readonly kind: 'close' }
  | { readonly kind: 'reopen' };

/** The guide's own controls, as the HUD's action buttons name them. */
export type GuideActionName = 'guideBegin' | 'guideSkip' | 'guideClose';

/** One control the panel offers. */
export interface GuideAction {
  readonly action: GuideActionName | 'tutorialNext' | 'tutorialRetry' | 'tutorialExit' | 'tutorialHelp';
  readonly text: string;
  readonly enabled?: boolean;
}

/** What the panel shows at one moment: its words and its controls. */
export interface GuidePanel {
  readonly stage: GuideStage;
  /** The teaching step a Player is on, one-based; `0` before *Inizia* and when done. */
  readonly step: number;
  readonly title: string;
  readonly lines: readonly string[];
  readonly actions: readonly GuideAction[];
}

/**
 * The next state after one event.
 *
 * Returns the same object when nothing changes, so a caller can tell "the guide
 * moved" from "the Player did something the guide had already been told about"
 * without comparing every field.
 */
export function guideNext(state: GuideState, event: GuideEvent): GuideState {
  if (event.kind === 'reopen') return GUIDE_FIRST_ENTRY;
  if (event.kind === 'skip' || event.kind === 'close') return state.open ? { ...state, open: false } : state;
  if (event.kind === 'begin') {
    return state.open && state.stage === 'welcome' ? { stage: 'stronghold', open: true } : state;
  }

  // The welcome line waits for the Player to begin. *Inizia* says so out loud,
  // and so does any real act — resuming the clock with Space is a beginning, and a
  // Player who clicks their Stronghold has begun whether they read the button or
  // not. What it does not do is move the clock itself: only the page resumes it.
  if (!state.open) return state;
  const from = state.stage === 'welcome' ? { stage: 'stronghold' as const, open: true } : state;
  if (state.stage === 'complete') return state;

  const at = GUIDE_STAGES.indexOf(from.stage);
  let reached = at;
  if (event.kind === 'selection') {
    if (event.what === 'settlement') reached = Math.max(reached, GUIDE_STAGES.indexOf('recruit'));
    if (event.what === 'squad') reached = Math.max(reached, GUIDE_STAGES.indexOf('move'));
  } else {
    if (event.verb === 'recruit') reached = Math.max(reached, GUIDE_STAGES.indexOf('select'));
    if (event.verb === 'move' || event.verb === 'attackMove') {
      reached = Math.max(reached, GUIDE_STAGES.indexOf('complete'));
    }
  }

  return reached === at ? state : { stage: GUIDE_STAGES[reached]!, open: true };
}

/**
 * The panel's Italian, built from the string table (PLAN §2.4).
 *
 * `null` when the guide is closed: a page with nothing to say draws nothing.
 */
export function guidePanel(state: GuideState): GuidePanel | null {
  if (!state.open) return null;

  const actions: GuideAction[] = state.stage === 'welcome'
    ? [{ action: 'guideBegin', text: translate('guide.begin') }, { action: 'guideSkip', text: translate('guide.skip') }]
    : state.stage === 'complete'
      ? [{ action: 'guideClose', text: translate('guide.close') }]
      : [{ action: 'guideSkip', text: translate('guide.skip') }];

  return {
    stage: state.stage,
    step: teachingStep(state.stage),
    title: panelTitle(state.stage),
    lines: panelLines(state.stage),
    actions,
  };
}

/** Which teaching step a stage is, counting the four acts and not the welcome. */
function teachingStep(stage: GuideStage): number {
  const at = GUIDE_STAGES.indexOf(stage);
  return at <= 0 || at >= GUIDE_STAGES.length - 1 ? 0 : at;
}

/** The title: the step count while teaching, and the two ends named. */
function panelTitle(stage: GuideStage): string {
  const step = teachingStep(stage);
  if (stage === 'complete') return translate('guide.done');
  if (step === 0) return translate('guide.title');

  return message('guide.step', { step, total: GUIDE_STAGES.length - 2 });
}

/** The line a stage says. Each is a fixed sentence; none reads the Match. */
function panelLines(stage: GuideStage): readonly string[] {
  switch (stage) {
    case 'welcome':
      return [translate('guide.welcomeObjective'), translate('guide.welcomePaused')];
    case 'stronghold':
      return [translate('guide.stronghold')];
    case 'recruit':
      return [translate('guide.recruit')];
    case 'select':
      return [translate('guide.select')];
    case 'move':
      return [translate('guide.move')];
    case 'complete':
      return [translate('guide.complete')];
  }
}
