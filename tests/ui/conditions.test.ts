/**
 * What the interface says about a Squad's condition, and the journal of brief
 * events (#58).
 *
 * Three claims are worth holding. The **thresholds** are the ticket's approved
 * presentation conventions and are checked on their boundaries, including the
 * ones that deliberately do not fire (a type that carries no missiles is never
 * "out of missiles"). The **conditions the rules own** — a rout, an unpaid
 * Season, a lost supply line — are read and never inferred. And the **journal**
 * deduplicates, keeps only the current Match, marks a target it can no longer
 * place, and never says anything the Observation does not.
 */
import { describe, expect, it } from 'vitest';
import type { VisibleSquad } from '../../src/sim/economy-match';
import type { SiegeVisible } from '../../src/sim/siege';
import { TILE_COUNT } from '../../src/sim/map';
import { SEASON_TICKS } from '../../src/sim/season';
import { TICK_HZ } from '../../src/sim/clock';
import {
  FATIGUE_WARNING,
  MORALE_WARNING_SHARE,
  NOTICE_HISTORY,
  NOTICE_FRESH_TICKS,
  WINTER_WARNING_TICKS,
  ammunitionOf,
  createNoticeBook,
  lowMorale,
  markedConditions,
  moraleOf,
  nextBoundary,
  squadConditions,
} from '../../src/ui/conditions';
import type { VisibleSettlement } from '../../src/sim/economy-match';
import { translate } from '../../src/ui/strings';

/** A Squad with the fields the conditions read, and plausible answers for the rest. */
function squadOf(options: Partial<VisibleSquad> = {}): VisibleSquad {
  return {
    id: 1,
    type: 'hastati',
    x: 10,
    y: 10,
    men: 120,
    capacity: 120,
    figures: 120,
    formation: 'line',
    facing: 'south',
    goal: null,
    refused: null,
    morale: 10,
    fatigue: 0,
    ammunition: 4,
    routing: false,
    engaged: false,
    payroll: 3,
    unpaid: 0,
    garrison: null,
    home: 0,
    inTerritory: true,
    inCamp: false,
    ...options,
  };
}

/** A Faction's window on the economy, with the fields the journal reads. */
function visibleOf(options: Partial<SiegeVisible> = {}): SiegeVisible {
  return {
    season: 'spring',
    year: 1,
    territory: new Uint8Array(TILE_COUNT),
    treasury: 20,
    settlements: [],
    squads: [squadOf()],
    fog: { terrain: new Uint8Array(TILE_COUNT), visible: new Uint8Array(TILE_COUNT), contacts: [] },
    contacts: [],
    enemies: [],
    fronts: [],
    ...options,
  };
}

/** A held settlement, as its owner reads it. */
function settlementOf(id = 4): VisibleSettlement {
  return {
    id,
    x: 20,
    y: 20,
    tier: 1,
    population: 8,
    stocks: { grain: 10, timber: 10, stone: 10, iron: 10 },
    land: { grain: 4, timber: 0, stone: 0, iron: 0 },
    works: [],
  };
}

describe('the Morale threshold', () => {
  it('fires on a positive Morale at or below a quarter of the type’s maximum', () => {
    // The hastati's maximum is ten (content/squads.ts), so a quarter is 2.5: two
    // is in the warning band, three is not.
    expect(lowMorale(squadOf({ morale: 2 }))).toBe(true);
    expect(lowMorale(squadOf({ morale: 3 }))).toBe(false);
    expect(MORALE_WARNING_SHARE).toBe(0.25);

    // Nothing left is a rout, not the warning band: the rules' own flag says it.
    expect(lowMorale(squadOf({ morale: 0 }))).toBe(false);
  });

  it('reads the maximum from the type, not from the Squad', () => {
    // The Gauls come with six (content/squads.ts): a quarter is 1.5, so one is low
    // and two is not — the same threshold, a different type.
    expect(lowMorale(squadOf({ type: 'gaul', morale: 1, men: 140 }))).toBe(true);
    expect(lowMorale(squadOf({ type: 'gaul', morale: 2, men: 140 }))).toBe(false);
    expect(moraleOf(squadOf({ type: 'gaul', morale: 2 }))).toEqual({ morale: 2, max: 6 });
  });
});

describe('the Fatigue and Ammunition thresholds', () => {
  it('calls a Squad tired at fifteen of twenty and not at fourteen', () => {
    expect(FATIGUE_WARNING).toBe(15);
    expect(squadConditions(squadOf({ fatigue: 14 }))).not.toContain('fatigue');
    expect(squadConditions(squadOf({ fatigue: 15 }))).toContain('fatigue');
  });

  it('calls spent missiles only for a type that carries any', () => {
    // The triarii carry none, so zero is not a shortage.
    expect(ammunitionOf(squadOf({ type: 'triarii', ammunition: 0 })).max).toBe(0);
    expect(squadConditions(squadOf({ type: 'triarii', ammunition: 0 }))).not.toContain('noAmmunition');

    // The Balearic slingers carry eight, and having thrown them all is.
    expect(squadConditions(squadOf({ type: 'balearic-slinger', ammunition: 0 }))).toContain('noAmmunition');
    expect(squadConditions(squadOf({ type: 'balearic-slinger', ammunition: 1 }))).not.toContain('noAmmunition');
  });
});

describe('the conditions the rules own', () => {
  it('reads a rout, an unpaid Season and a lost supply line from the Observation', () => {
    expect(squadConditions(squadOf({ routing: true }))).toContain('routing');
    expect(squadConditions(squadOf({ unpaid: 1 }))).toContain('unpaid');
    expect(squadConditions(squadOf({ inTerritory: false }))).toContain('noSupply');
  });

  it('ranks a rout above everything, and low Morale above the rest', () => {
    const all = squadConditions(squadOf({
      morale: 0,
      routing: true,
      unpaid: 2,
      inTerritory: false,
      fatigue: 20,
      type: 'balearic-slinger',
      ammunition: 0,
    }));

    expect(all[0]).toBe('routing');
    expect(markedConditions(all)).not.toContain('lowMorale');
    expect(markedConditions(squadConditions(squadOf({ morale: 2 })))).not.toContain('lowMorale');
  });

  it('counts down to the winter boundary and nowhere else', () => {
    const boundary = nextBoundary('autumn', 0);
    expect(boundary.season).toBe('winter');
    expect(boundary.ticks).toBe(SEASON_TICKS);

    const lastTicks = SEASON_TICKS - WINTER_WARNING_TICKS;
    expect(nextBoundary('autumn', lastTicks).ticks).toBe(WINTER_WARNING_TICKS);
    expect(WINTER_WARNING_TICKS).toBe(30 * TICK_HZ);
  });
});

describe('the notice journal', () => {
  it('raises a standing condition once, and keeps the tick it began on', () => {
    const book = createNoticeBook();

    const first = book.read(visibleOf({ squads: [squadOf({ fatigue: 16 })] }), 100);
    const again = book.read(visibleOf({ squads: [squadOf({ fatigue: 16 })] }), 140);

    expect(first.filter((notice) => notice.persistent)).toHaveLength(1);
    expect(again.filter((notice) => notice.persistent)).toHaveLength(1);
    expect(again.find((notice) => notice.persistent)?.raised).toBe(100);
    expect(again[0]?.label).toContain(translate('ui.fatigue'));
  });

  it('drops a condition that has passed, and keeps an event in the history', () => {
    const book = createNoticeBook();
    book.read(visibleOf({ squads: [squadOf()] }), 0);
    book.read(visibleOf({ squads: [squadOf({ unpaid: 1 })] }), 10);
    const healthy = book.read(visibleOf({ squads: [squadOf({ unpaid: 0 })] }), 400);

    // The standing condition is gone; the event that it *became* unpaid stays.
    expect(healthy.filter((notice) => notice.persistent)).toHaveLength(0);
    expect(healthy.some((notice) => !notice.persistent && notice.kind === 'unpaid')).toBe(true);
  });

  it('reports an event once, however many times the page redraws', () => {
    const book = createNoticeBook();
    book.read(visibleOf({ squads: [squadOf()] }), 0);

    const refused = visibleOf({ squads: [squadOf({ refused: 'water' })] });
    const first = book.read(refused, 10);
    const second = book.read(refused, 11);
    const third = book.read(refused, 12);

    expect(first.some((notice) => notice.kind === 'refusal')).toBe(true);
    expect(second.filter((notice) => notice.kind === 'refusal')).toHaveLength(1);
    expect(third.filter((notice) => notice.kind === 'refusal')).toHaveLength(1);
    expect(first.find((notice) => notice.kind === 'refusal')?.target).toEqual({ kind: 'squad', id: 1, x: 10, y: 10 });
  });

  it('keeps the current Match’s history bounded, and the conditions always', () => {
    const book = createNoticeBook();
    let tick = 0;

    // A refusal that changes reason every read is a new event each time, which is
    // what fills a history past its bound.
    const reasons = ['water', 'unreachable', 'off-map'] as const;
    for (let index = 0; index < NOTICE_HISTORY * 3; index += 1) {
      tick += NOTICE_FRESH_TICKS + 1;
      book.read(visibleOf({ squads: [squadOf({ refused: reasons[index % reasons.length], fatigue: 16 })] }), tick);
    }

    const notices = book.read(visibleOf({ squads: [squadOf({ refused: 'water', fatigue: 16 })] }), tick);
    const events = notices.filter((notice) => !notice.persistent);

    expect(events.length).toBeLessThanOrEqual(NOTICE_HISTORY);
    expect(notices.filter((notice) => notice.persistent)).toHaveLength(1);
  });

  it('marks a notice whose target is gone, and answers whether it named one', () => {
    const book = createNoticeBook();
    book.read(visibleOf({ squads: [squadOf({ unpaid: 1 })] }), 10);
    const id = book.entries().find((notice) => notice.target !== null)?.id;
    expect(id).toBeDefined();

    expect(book.lose(id ?? '')).toBe(true);
    expect(book.entries().find((notice) => notice.id === id)?.lost).toBe(true);
    expect(book.lose('no-such-notice')).toBe(false);
  });

  it('warns of winter only inside the last thirty simulation seconds of autumn', () => {
    const book = createNoticeBook();
    const early = book.read(visibleOf({ season: 'autumn' }), SEASON_TICKS - WINTER_WARNING_TICKS - 1);
    expect(early.some((notice) => notice.kind === 'winter')).toBe(false);

    const late = book.read(visibleOf({ season: 'autumn' }), SEASON_TICKS - WINTER_WARNING_TICKS);
    expect(late.some((notice) => notice.kind === 'winter')).toBe(true);

    // The warning is about the *winter* boundary, so a spring tick never shows it.
    const spring = book.read(visibleOf({ season: 'spring' }), SEASON_TICKS - WINTER_WARNING_TICKS);
    expect(spring.some((notice) => notice.kind === 'winter')).toBe(false);
  });

  it('carries a settlement’s position for a blockade it is allowed to see', () => {
    const book = createNoticeBook();
    const notices = book.read(visibleOf({
      settlements: [settlementOf(4)],
      fronts: [{
        settlement: 4,
        structures: [],
        breached: false,
        siege: 'blockade',
        besieger: 'carthage',
        ram: null,
        hold: 0,
        garrison: 0,
      }],
    }), 10);

    const blockade = notices.find((notice) => notice.kind === 'blockade');
    expect(blockade?.target).toEqual({ kind: 'settlement', id: 4, x: 20, y: 20 });
  });

  it('says nothing about an army it can see nothing of', () => {
    const book = createNoticeBook();
    const notices = book.read(visibleOf({ squads: [] }), 10);

    expect(notices).toHaveLength(0);
  });
});
