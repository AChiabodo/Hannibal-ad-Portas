/**
 * The first-entry guide (ticket U8, Q11).
 *
 * Two claims are worth asserting without a browser, and they are the two the
 * ticket actually makes: the guide is **optional and harmless** — it opens paused,
 * waits for *Inizia*, can be skipped and reopened, and never advances on its own —
 * and its **lines cannot know the enemy**, because they are fixed sentences taken
 * from the string table and nothing here reads an Observation.
 *
 * The acts are tested as events rather than as clicks because the page is what
 * turns a click into one (`render/game.ts`); the browser spec is where a pointer
 * is the pointer. What the unit suite can prove is the part that must not drift:
 * a stage only ever moves forward, and a closed guide ignores the Match.
 */
import { describe, expect, it } from 'vitest';
import {
  GUIDE_CLOSED,
  GUIDE_FIRST_ENTRY,
  GUIDE_STAGES,
  guideNext,
  guidePanel,
  type GuideEvent,
  type GuideState,
} from '../../src/ui/guide.ts';
import { translate } from '../../src/ui/strings.ts';

const BEGIN: GuideEvent = { kind: 'begin' };
const settlement: GuideEvent = { kind: 'selection', what: 'settlement' };
const squad: GuideEvent = { kind: 'selection', what: 'squad' };
const recruit: GuideEvent = { kind: 'command', verb: 'recruit' };
const move: GuideEvent = { kind: 'command', verb: 'move' };

function after(...events: readonly GuideEvent[]): GuideState {
  return events.reduce(guideNext, GUIDE_FIRST_ENTRY);
}

describe('the first-entry guide', () => {
  it('opens on the welcome line and waits for the human to begin', () => {
    expect(GUIDE_FIRST_ENTRY).toEqual({ stage: 'welcome', open: true });
    // A click on bare ground is not a beginning: nothing was done with the panel.
    expect(guideNext(GUIDE_FIRST_ENTRY, { kind: 'selection', what: 'none' })).toEqual(GUIDE_FIRST_ENTRY);
    expect(guideNext(GUIDE_FIRST_ENTRY, BEGIN)).toEqual({ stage: 'stronghold', open: true });
    // A real act is a beginning too: a Player who opens their Stronghold (or
    // resumes the clock, which the page reports as Begin) has started the Match.
    expect(guideNext(GUIDE_FIRST_ENTRY, settlement).stage).toBe('recruit');
    expect(guideNext(GUIDE_FIRST_ENTRY, squad).stage).toBe('move');
    expect(guideNext(GUIDE_FIRST_ENTRY, move).stage).toBe('complete');
  });

  it('teaches opening a settlement, recruiting, selecting and moving, in that order', () => {
    expect(after(BEGIN, settlement).stage).toBe('recruit');
    expect(after(BEGIN, settlement, recruit).stage).toBe('select');
    expect(after(BEGIN, settlement, recruit, squad).stage).toBe('move');
    expect(after(BEGIN, settlement, recruit, squad, move).stage).toBe('complete');
  });

  it('never sends the Player back to a line they have already passed', () => {
    const moves = after(BEGIN, settlement, recruit, squad, move);

    // A late settlement click, a repeat recruit and another selection all leave a
    // finished guide exactly where it is.
    expect(guideNext(moves, settlement)).toBe(moves);
    expect(guideNext(moves, recruit)).toBe(moves);
    expect(guideNext(moves, squad)).toBe(moves);
    expect(guideNext(moves, move)).toBe(moves);
    // And the same event twice is the same state, which is what lets the page
    // repaint only when the guide actually moved.
    const recruitStage = after(BEGIN, settlement);
    const recruited = guideNext(recruitStage, recruit);
    expect(guideNext(recruited, recruit)).toBe(recruited);
  });

  it('lets a Player who has already raised and marched a Squad skip ahead', () => {
    // Selecting a Squad means the Stronghold and the recruit line were done by
    // hand; a move completes the rest.
    expect(after(BEGIN, squad).stage).toBe('move');
    expect(after(BEGIN, squad, move).stage).toBe('complete');
  });

  it('is skipped, closed and reopened, and a closed guide ignores every act', () => {
    const skipped = guideNext(after(BEGIN, settlement), { kind: 'skip' });
    expect(skipped).toEqual({ stage: 'recruit', open: false });
    expect(guideNext(skipped, squad)).toBe(skipped);
    expect(guideNext(skipped, move)).toBe(skipped);

    const reopened = guideNext(skipped, { kind: 'reopen' });
    expect(reopened).toEqual(GUIDE_FIRST_ENTRY);

    expect(guideNext(reopened, { kind: 'close' })).toEqual({ stage: 'welcome', open: false });
    expect(guideNext(GUIDE_CLOSED, BEGIN)).toBe(GUIDE_CLOSED);
  });

  it('offers Begin and Skip on the welcome line, Skip while teaching, and Close when done', () => {
    const welcome = guidePanel(GUIDE_FIRST_ENTRY);
    expect(welcome?.actions.map((action) => action.action)).toEqual(['guideBegin', 'guideSkip']);
    expect(welcome?.actions.map((action) => action.text)).toEqual([translate('guide.begin'), translate('guide.skip')]);
    expect(welcome?.step).toBe(0);
    expect(welcome?.title).toBe(translate('guide.title'));

    expect(guidePanel(after(BEGIN))?.actions.map((action) => action.action)).toEqual(['guideSkip']);
    expect(guidePanel(after(BEGIN))?.step).toBe(1);
    expect(guidePanel(after(BEGIN))?.title).toBe('Guida 1/4');
    expect(guidePanel(after(BEGIN, settlement))?.step).toBe(2);
    expect(guidePanel(after(BEGIN, settlement, recruit))?.step).toBe(3);
    expect(guidePanel(after(BEGIN, settlement, recruit, squad))?.step).toBe(4);

    const done = guidePanel(after(BEGIN, settlement, recruit, squad, move));
    expect(done?.title).toBe(translate('guide.done'));
    expect(done?.actions.map((action) => action.action)).toEqual(['guideClose']);
    expect(guidePanel(GUIDE_CLOSED)).toBeNull();
  });

  it('says the objective the Match actually has, in Italian', () => {
    const welcome = guidePanel(GUIDE_FIRST_ENTRY);
    const said = welcome?.lines.join(' ') ?? '';

    expect(said).toContain('Roccaforte');
    expect(said).toContain('tre anni');
    expect(said).toContain(translate('guide.begin'));
  });

  it('carries no enemy knowledge: every line is fixed text, with no id and no place', () => {
    // The panel is a function of the guide's state and nothing else, so there is
    // no Observation it could read; the lines themselves say why that matters.
    for (const stage of GUIDE_STAGES) {
      const panel = guidePanel({ stage, open: true });
      expect(panel, stage).not.toBeNull();
      for (const line of panel!.lines) {
        // No coordinate, id, count or Faction name: nothing a memory would supply.
        expect(line, stage).not.toMatch(/\d/);
        expect(line, stage).not.toMatch(/\b(Roma|Cartagine|Rome|Carthage)\b/);
      }
    }
  });
});
