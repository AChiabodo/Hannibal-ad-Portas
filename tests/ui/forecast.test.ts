/**
 * The economy's forecast (#58).
 *
 * A forecast is only worth showing when it is *right*, so the tests are written
 * against the rules' own order rather than against a plausible formula: the
 * Season boundary produces and earns tax first, then charges Payroll out of one
 * Treasury in the Squads' own order, and only then moves Morale. The cases below
 * are the ones where that order matters — a Treasury that pays three Squads and
 * not the fourth, a Treasury that hits the war chest's ceiling, and a settlement
 * whose income cannot be known because a blockade's duration is not.
 */
import { describe, expect, it } from 'vitest';
import type { VisibleSettlement, VisibleSquad } from '../../src/sim/economy-match';
import type { SiegeVisible } from '../../src/sim/siege';
import { TILE_COUNT } from '../../src/sim/map';
import { SEASON_TICKS } from '../../src/sim/season';
import { TREASURY_CAP } from '../../src/sim/economy';
import { forecastLine, forecastTreasury } from '../../src/ui/forecast';
import { translate } from '../../src/ui/strings';

/** A Squad with the fields a forecast reads. */
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
    bearing: 0,
    garrison: null,
    home: 0,
    inTerritory: true,
    inCamp: false,
    ...options,
  };
}

/** A held settlement, as its owner reads it. */
function settlementOf(options: Partial<VisibleSettlement> = {}): VisibleSettlement {
  return {
    id: 4,
    x: 20,
    y: 20,
    tier: 1,
    population: 10,
    stocks: { grain: 10, timber: 10, stone: 10, iron: 10 },
    land: { grain: 4, timber: 0, stone: 0, iron: 0 },
    works: [],
    ...options,
  };
}

/** A Faction's window on the economy, with no fronts unless a test asks for one. */
function visibleOf(options: Partial<SiegeVisible> = {}): SiegeVisible {
  return {
    season: 'spring',
    year: 1,
    territory: new Uint8Array(TILE_COUNT),
    treasury: 0,
    settlements: [settlementOf()],
    squads: [],
    fog: { terrain: new Uint8Array(TILE_COUNT), visible: new Uint8Array(TILE_COUNT), contacts: [] },
    contacts: [],
    enemies: [],
    fronts: [],
    ...options,
  };
}

describe('the next Season boundary', () => {
  it('earns the settlements’ tax before it charges any Payroll', () => {
    // Ten people are two denarii of tax, and a staffed market adds four, so the
    // coffer holds six before the army is paid. The first Squad (three) is paid
    // and the second (four) is not: six minus three leaves three, and three is
    // not four.
    const forecast = forecastTreasury(visibleOf({
      treasury: 0,
      settlements: [settlementOf({ works: [{ building: 'market', remaining: 0, standing: true }] })],
      squads: [squadOf({ id: 1, payroll: 3 }), squadOf({ id: 2, payroll: 4 })],
    }), 0);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    expect(forecast.value.income).toBe(6);
    expect(forecast.value.payroll).toBe(7);
    expect(forecast.value.unpaid).toBe(1);
    expect(forecast.value.resulting).toBe(3);
    expect(forecast.value.season).toBe('summer');
  });

  it('pays in the list’s own order, so a cheap term after an unaffordable one is still paid', () => {
    const forecast = forecastTreasury(visibleOf({
      treasury: 4,
      settlements: [],
      squads: [squadOf({ id: 1, payroll: 5 }), squadOf({ id: 2, payroll: 2 })],
    }), 0);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    // The rules charge each Squad in turn: four does not cover five, so the first
    // goes unpaid, and the two denarii still in hand do cover the second.
    expect(forecast.value.unpaid).toBe(1);
    expect(forecast.value.resulting).toBe(2);
  });

  it('respects the war chest’s ceiling and still pays from it', () => {
    const forecast = forecastTreasury(visibleOf({
      treasury: TREASURY_CAP - 1,
      settlements: [settlementOf({ works: [{ building: 'market', remaining: 0, standing: true }] })],
      squads: [squadOf({ payroll: 3 })],
    }), 0);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    expect(forecast.value.income).toBe(6);
    expect(forecast.value.resulting).toBe(TREASURY_CAP - 3);
  });

  it('counts only the works that will have the hands to run them', () => {
    // Four people cannot staff a market that wants three and a farm that wants
    // four as well: the market is staffed first (its three), the farm is not.
    const forecast = forecastTreasury(visibleOf({
      settlements: [settlementOf({
        population: 4,
        works: [
          { building: 'market', remaining: 0, standing: true },
          { building: 'farm', remaining: 0, standing: true },
        ],
      })],
      squads: [squadOf({ payroll: 0 })],
    }), 0);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    expect(forecast.value.income).toBe(1 + 4);
  });

  it('taxes the people who are still there after the granary has fed them', () => {
    // Seven people are one denarius of tax today, but they eat out of a granary
    // the season's land has just filled and grow to eight: the boundary charges
    // two (`produceSeason` → `feedAndGrow` → `earn`).
    const growth = forecastTreasury(visibleOf({
      treasury: 0,
      settlements: [settlementOf({ population: 7 })],
    }), 0);

    expect(growth.available).toBe(true);
    if (!growth.available) return;
    expect(growth.value.income).toBe(2);

    // And the other way: a settlement of eight with an empty granary starves to
    // seven before the tax is counted, so it pays one, not two.
    const starvation = forecastTreasury(visibleOf({
      treasury: 0,
      settlements: [settlementOf({
        population: 8,
        stocks: { grain: 0, timber: 10, stone: 10, iron: 10 },
        land: { grain: 0, timber: 0, stone: 0, iron: 0 },
      })],
    }), 0);

    expect(starvation.available).toBe(true);
    if (!starvation.available) return;
    expect(starvation.value.income).toBe(1);
  });

  it('halves the land’s grain in winter before the people eat', () => {
    const settlement = settlementOf({
      population: 11,
      stocks: { grain: 0, timber: 10, stone: 10, iron: 10 },
    });
    // The forecast is about the *next* boundary: standing in spring it is the
    // summer one, and standing in autumn it is the winter one.
    const summer = forecastTreasury(visibleOf({ settlements: [settlement] }), 0);
    const winter = forecastTreasury(visibleOf({ season: 'autumn', settlements: [settlement] }), 0);

    expect(summer.available && winter.available).toBe(true);
    if (!summer.available || !winter.available) return;

    // Eleven people eat two; four grain in summer leave two over and they grow to
    // twelve (three denarii), two grain in winter leave nothing over (two).
    expect(summer.value.income).toBe(3);
    expect(winter.value.income).toBe(2);
  });

  it('counts a work still going up as no denarii', () => {
    const forecast = forecastTreasury(visibleOf({
      settlements: [settlementOf({ works: [{ building: 'market', remaining: 20, standing: false }] })],
    }), 0);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    expect(forecast.value.income).toBe(2);
  });

  it('counts down to the boundary from the Match’s own tick', () => {
    const forecast = forecastTreasury(visibleOf(), SEASON_TICKS - 1);

    expect(forecast.available).toBe(true);
    if (!forecast.available) return;

    expect(forecast.value.ticks).toBe(1);
    expect(forecast.value.season).toBe('summer');
  });
});

describe('what the forecast refuses', () => {
  it('will not guess a blockaded settlement’s income', () => {
    const forecast = forecastTreasury(visibleOf({
      settlements: [settlementOf()],
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
    }), 0);

    expect(forecast).toEqual({ available: false, reason: 'blockaded' });
  });

  it('says why in words, and never calls a refusal an estimate', () => {
    const line = forecastLine(visibleOf({
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
    }), 0);

    expect(line?.estimate).toBe(false);
    expect(line?.value).toContain(translate('forecast.blockaded'));
  });

  it('says nothing when there is no army and no income to forecast', () => {
    expect(forecastLine(visibleOf({ settlements: [], squads: [] }), 0)).toBeNull();
  });
});

describe('the labelled estimate', () => {
  it('is labelled, and says both the figure and who would go unpaid', () => {
    const line = forecastLine(visibleOf({
      treasury: 2,
      squads: [squadOf({ id: 1, payroll: 3 }), squadOf({ id: 2, payroll: 3 })],
    }), 0);

    expect(line?.estimate).toBe(true);
    expect(line?.label).toBe(translate('forecast.title'));
    // Two people's tax plus two in hand pays the first three and leaves one: the
    // label says the figure and that one Squad would go unpaid.
    expect(line?.value).toContain('1 denari');
    expect(line?.value).toContain('1 reparti');
  });
});
