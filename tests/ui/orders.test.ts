/**
 * The contextual actions (#55).
 *
 * What these tests are about is not the buttons but the *truthfulness* of them:
 * an offer is enabled only when the rules would take it, and when it is not the
 * reason says the sentence the rule would have said. So the assertions read the
 * same content tables and the same known facts the panel reads, and check the
 * two never disagree — a tier that is too low, a stock that cannot pay, a
 * Faction that has no ram, a settlement this Faction has no business knowing.
 */
import { describe, expect, it } from 'vitest';
import { createFog, viewOf } from '../../src/sim/fog.ts';
import { TILE_COUNT } from '../../src/sim/map.ts';
import type { VisibleSettlement, VisibleSquad } from '../../src/sim/economy-match.ts';
import type { SiegeVisible, VisibleFront } from '../../src/sim/siege.ts';
import {
  controlGroupViews,
  enemyAt,
  garrisonReach,
  groupSummary,
  menOf,
  moraleOf,
  settlementAt,
  settlementOrders,
  settlementTargets,
  squadOrders,
} from '../../src/ui/orders.ts';
import { translate } from '../../src/ui/strings.ts';

const SETTLEMENT: VisibleSettlement = {
  id: 0,
  x: 10,
  y: 10,
  tier: 2,
  population: 12,
  stocks: { grain: 8, timber: 12, stone: 6, iron: 4 },
  land: { grain: 3, timber: 2, stone: 1, iron: 0 },
  works: [],
};

/** A field Squad of a type whose full strength and Morale are known from content. */
const HASTATI: VisibleSquad = {
  id: 1,
  type: 'hastati',
  x: 12,
  y: 8,
  men: 90,
  capacity: 120,
  figures: 90,
  formation: 'line',
  facing: 'south',
  goal: null,
  refused: null,
  morale: 7,
  fatigue: 2,
  ammunition: 3,
  routing: false,
  engaged: false,
  payroll: 3,
  unpaid: 0,
  bearing: 0,
  garrison: null,
  home: 0,
  inTerritory: true,
  inCamp: false,
};

const PRINCIPES: VisibleSquad = { ...HASTATI, id: 2, type: 'principes', x: 11, y: 9, men: 120, figures: 120, morale: 9 };

/** A front whose wall sections are all standing. */
function front(settlement: number, structures = 2): VisibleFront {
  return {
    settlement,
    structures: Array.from({ length: structures }, (_unused, index) => ({
      kind: index === 0 ? 'gate' : 'wall',
      side: 'north',
      hp: 60,
      standing: true,
    })),
    breached: false,
    siege: null,
    besieger: null,
    ram: null,
    hold: 0,
    garrison: 0,
  };
}

function visible(overrides: Partial<SiegeVisible> = {}): SiegeVisible {
  return {
    season: 'spring',
    year: 1,
    territory: new Uint8Array(TILE_COUNT),
    treasury: 20,
    settlements: [SETTLEMENT],
    squads: [HASTATI, PRINCIPES],
    fog: viewOf(createFog()),
    contacts: [],
    enemies: [],
    fronts: [front(0)],
    ...overrides,
  };
}

/** The enemy settlement a Stronghold is, as this Faction remembers it. */
const ENEMY_STRONGHOLD = { kind: 'stronghold' as const, id: 7, x: 40, y: 40, seen: 3, type: null };

describe('the offers a selection has', () => {
  it('offers every military action in one stable order', () => {
    const orders = squadOrders(visible(), 'rome', [HASTATI]);
    const ids = orders.map((order) => order.id);

    expect(ids.slice(0, 7)).toEqual(['move', 'attackMove', 'attack', 'hold', 'withdraw', 'formation.line', 'formation.column']);
    expect(ids.slice(7)).toEqual(['garrison', 'assault', 'blockade']);
  });

  it('offers nothing to nobody, and says why', () => {
    for (const order of squadOrders(visible(), 'rome', [])) {
      expect(order.enabled).toBe(false);
      expect(order.reason).toBe(translate('reason.noSquads'));
    }
  });

  it('refuses an attack with no enemy in sight, and allows it when one is seen', () => {
    const blind = squadOrders(visible(), 'rome', [HASTATI]).find((order) => order.id === 'attack');
    expect(blind).toMatchObject({ enabled: false, reason: translate('reason.noEnemy'), target: 'enemy' });

    const sighted = squadOrders(
      visible({ enemies: [{ id: 4, type: 'gaul', x: 20, y: 20 }] }),
      'rome',
      [HASTATI],
    ).find((order) => order.id === 'attack');
    expect(sighted?.enabled).toBe(true);
  });

  it('states Faction-specific Siege availability instead of hiding it', () => {
    const known = visible({ contacts: [ENEMY_STRONGHOLD] });
    const carthage = squadOrders(known, 'carthage', [PRINCIPES]);

    expect(carthage.find((order) => order.id === 'assault')).toMatchObject({
      enabled: false,
      reason: translate('reason.noRam'),
      target: 'settlement',
    });
    expect(carthage.find((order) => order.id === 'blockade')?.enabled).toBe(true);
    expect(squadOrders(known, 'rome', [HASTATI]).find((order) => order.id === 'assault')?.enabled).toBe(true);
  });

  it('does not invent an enemy this Faction has not met', () => {
    const fresh = squadOrders(visible(), 'rome', [HASTATI]);

    expect(fresh.find((order) => order.id === 'assault')).toMatchObject({
      enabled: false,
      reason: translate('reason.noEnemyWalls'),
    });
    expect(fresh.find((order) => order.id === 'blockade')).toMatchObject({
      enabled: false,
      reason: translate('reason.noEnemySettlement'),
    });
  });

  it('offers a garrison only for a walled settlement of its own, and counts who is in reach', () => {
    const orders = squadOrders(visible(), 'rome', [HASTATI, PRINCIPES]);
    const garrison = orders.find((order) => order.id === 'garrison');

    expect(garrison?.enabled).toBe(true);
    // HASTATI stands 2+2 tiles from the settlement and PRINCIPES 1+1: only one is in reach.
    expect(garrisonReach(visible(), [HASTATI, PRINCIPES])).toEqual({ near: 1, total: 2 });
    expect(garrison?.note).toBe(`1 su 2 a portata`);

    const open = visible({ fronts: [front(0, 0)] });
    expect(squadOrders(open, 'rome', [HASTATI]).find((order) => order.id === 'garrison')).toMatchObject({
      enabled: false,
      reason: translate('reason.noOwnWalls'),
    });
  });

  it('refuses every offer once the Match has ended', () => {
    for (const order of squadOrders(visible(), 'rome', [HASTATI], true)) {
      expect(order.enabled).toBe(false);
      expect(order.reason).toBe(translate('reason.ended'));
    }
  });
});

describe('the offers a settlement has', () => {
  it('shows construction costs and times from the content tables', () => {
    const orders = settlementOrders(visible(), 'rome', SETTLEMENT, 'construction');
    const farm = orders.find((order) => order.id === 'build:farm');

    expect(farm).toMatchObject({ enabled: true, reason: null, subject: 'farm' });
    expect(farm?.note).toContain(translate('resource.timber'));
    expect(farm?.note).toContain(translate('ui.ticksLeft').replace('{ticks}', '400'));
  });

  it('says which requirement a building fails rather than hiding it', () => {
    const orders = settlementOrders(visible(), 'rome', SETTLEMENT, 'construction');
    const forum = orders.find((order) => order.id === 'build:forum');

    // The fixture is tier 2 and the forum needs tier 2 as well; the villa is the
    // tier-raising work, so it is offered — what must not happen is a building
    // the Faction cannot raise at all being shown as available.
    expect(forum?.enabled).toBe(false);
    expect(forum?.reason).toBe(translate('reason.cost'));

    const castrum = orders.find((order) => order.id === 'build:castrum');
    expect(castrum?.enabled).toBe(true);

    const carthage = settlementOrders(visible(), 'carthage', SETTLEMENT, 'construction');
    expect(carthage.some((order) => order.id === 'build:castrum')).toBe(false);
  });

  it('refuses a building the settlement has no tier for, in words', () => {
    const young: VisibleSettlement = { ...SETTLEMENT, tier: 1, stocks: { grain: 60, timber: 60, stone: 60, iron: 60 } };
    const forum = settlementOrders(visible(), 'rome', young, 'construction').find((order) => order.id === 'build:forum');

    expect(forum).toMatchObject({ enabled: false, reason: 'Serve il livello 2' });
  });

  it('stops offering a building the settlement already holds the maximum of', () => {
    const built: VisibleSettlement = {
      ...SETTLEMENT,
      stocks: { grain: 60, timber: 60, stone: 60, iron: 60 },
      works: Array.from({ length: 4 }, () => ({ building: 'farm', remaining: 0, standing: true })),
    };
    const farm = settlementOrders(visible(), 'rome', built, 'construction').find((order) => order.id === 'build:farm');

    expect(farm).toMatchObject({ enabled: false, reason: translate('reason.maxWorks') });
  });

  it('offers every real size of the Faction’s own roster, with its men and its Payroll', () => {
    const rome = settlementOrders(visible(), 'rome', SETTLEMENT, 'recruitment');
    const hastati = rome.filter((order) => order.id.startsWith('recruit:hastati:'));

    expect(hastati.map((order) => order.id)).toEqual([
      'recruit:hastati:24', 'recruit:hastati:60', 'recruit:hastati:120',
    ]);
    const small = rome.find((order) => order.id === 'recruit:hastati:24');
    expect(small).toMatchObject({ enabled: true, recruit: { men: 24, count: 1 }, subject: 'hastati' });
    expect(small?.note).toContain('24');
    expect(small?.note).toContain(`${translate('ui.payroll')} 3`);
    expect(small?.note).toContain(translate('ui.perSeason'));
    expect(small?.costs).toEqual([
      { badge: 'grain', value: 8 }, { badge: 'iron', value: 2 },
      { badge: 'men', value: 24 }, { badge: 'coin', value: 3 },
    ]);

    // The stock covers the 24-man bill exactly and nothing larger.
    expect(rome.find((order) => order.id === 'recruit:hastati:60')).toMatchObject({
      enabled: false, reason: translate('reason.cost'),
    });

    const triarii = rome.find((order) => order.id === 'recruit:triarii:24');
    expect(triarii).toMatchObject({ enabled: false, reason: 'Serve il livello 3' });
    expect(rome.some((order) => order.id.startsWith('recruit:gaul'))).toBe(false);

    const carthage = settlementOrders(visible(), 'carthage', SETTLEMENT, 'recruitment');
    expect(carthage.map((order) => order.id)).toContain('recruit:libyan-spear:24');
    expect(carthage.map((order) => order.id)).toContain('recruit:libyan-spear:48');
    expect(carthage.some((order) => order.id.startsWith('recruit:hastati'))).toBe(false);
  });

  it('quotes the whole press when the page buys several Squads', () => {
    const rich: VisibleSettlement = { ...SETTLEMENT, stocks: { grain: 60, timber: 60, stone: 60, iron: 60 } };
    const order = settlementOrders(visible(), 'rome', rich, 'recruitment', false, 3)
      .find((candidate) => candidate.id === 'recruit:hastati:24');

    expect(order).toMatchObject({ enabled: true, recruit: { men: 24, count: 3 } });
    expect(order?.costs).toEqual([
      { badge: 'grain', value: 24 }, { badge: 'iron', value: 6 },
      { badge: 'men', value: 72 }, { badge: 'coin', value: 9 },
    ]);
    expect(order?.note).toContain('72');
    expect(order?.note).toContain(`${translate('ui.payroll')} 9`);
  });

  it('says when the stock cannot pay for a Squad', () => {
    const poor: VisibleSettlement = { ...SETTLEMENT, stocks: { grain: 0, timber: 0, stone: 0, iron: 0 } };
    const hastati = settlementOrders(visible(), 'rome', poor, 'recruitment').find((order) => order.id === 'recruit:hastati:24');

    expect(hastati).toMatchObject({ enabled: false, reason: translate('reason.cost') });
  });

  it('offers no command on the overview page, which is about what the settlement has', () => {
    expect(settlementOrders(visible(), 'rome', SETTLEMENT, 'overview')).toEqual([]);
  });
});

describe('what the panel knows of a settlement', () => {
  it('names own settlements from the Observation and enemies only from memory', () => {
    const targets = settlementTargets(visible({ contacts: [ENEMY_STRONGHOLD] }));

    expect(targets).toContainEqual({ id: 0, x: 10, y: 10, own: true, walled: true });
    // A Stronghold is walled by its kind, which is what the contact remembers;
    // no wall state of its own is invented.
    expect(targets).toContainEqual({ id: 7, x: 40, y: 40, own: false, walled: true });
  });

  it('offers an assault only on a target it can also name', () => {
    // The offer and the target list must agree: an armed action that every click
    // then refuses would be a button that can never be completed.
    const known = visible({ contacts: [ENEMY_STRONGHOLD] });
    const assault = squadOrders(known, 'rome', [HASTATI]).find((order) => order.id === 'assault');

    expect(assault?.enabled).toBe(true);
    expect(settlementTargets(known).find((target) => target.id === ENEMY_STRONGHOLD.id)?.walled).toBe(true);
  });

  it('turns a click near a settlement into that settlement, and nothing else', () => {
    const targets = settlementTargets(visible());

    expect(settlementAt(targets, 11, 10)?.id).toBe(0);
    expect(settlementAt(targets, 20, 20)).toBeNull();
  });

  it('turns a click near an enemy in sight into that enemy', () => {
    const enemies = [{ id: 4, type: 'gaul', x: 20, y: 20 }];

    expect(enemyAt(enemies, 21, 20)?.id).toBe(4);
    expect(enemyAt(enemies, 30, 20)).toBeNull();
  });
});

describe('a mixed selection', () => {
  it('summarises composition, total men and the Morale it spans', () => {
    const summary = groupSummary([HASTATI, PRINCIPES]);

    expect(summary.composition).toBe('Astati 1, Principi 1');
    expect(summary.squads).toBe(2);
    expect(summary.men).toBe(210);
    expect(summary.moraleMin).toBe(7);
    expect(summary.moraleMax).toBe(9);
  });

  it('lists the individuals that need attention, and only those', () => {
    const broken = { ...HASTATI, routing: true };
    const unpaid = { ...PRINCIPES, unpaid: 2 };
    const summary = groupSummary([HASTATI, broken, unpaid]);

    expect(summary.exceptions.map((exception) => exception.squad)).toEqual([1, 2]);
    expect(summary.exceptions[0]?.reason).toBe(translate('order.routing'));
    expect(summary.exceptions[1]?.reason).toBe(`${translate('ui.unpaid')} 2`);
  });

  it('reads a Squad’s men and Morale against what its type is worth', () => {
    expect(menOf(HASTATI)).toEqual({ men: 90, capacity: 120 });
    expect(moraleOf(HASTATI)).toEqual({ morale: 7, max: 10 });
  });

  it('shows a control group its membership and composition', () => {
    const views = controlGroupViews(visible(), [{ index: 2, squads: [1, 2] }, { index: 1, squads: [2] }]);

    expect(views.map((view) => view.index)).toEqual([1, 2]);
    expect(views[0]).toEqual({ index: 1, count: 1, composition: 'Principi 1' });
    expect(views[1]).toEqual({ index: 2, count: 2, composition: 'Astati 1, Principi 1' });
  });
});
