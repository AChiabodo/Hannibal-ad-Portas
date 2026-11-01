/**
 * The contextual actions a Player can take, as the interface offers them
 * (ticket #55).
 *
 * This module answers one question per selection: *what can be done with these
 * men, and what does the Player have to do next to do it?* It is **presentation**,
 * but it is not a second copy of the rules: every offer is read from the same
 * content tables the rules read (`content/`), and every refusal the interface
 * shows is the sentence the rule would apply — a tier the type needs, a cost the
 * stocks do not cover, a Faction that has no ram. The one thing it must never do
 * is predict an outcome the rules have not decided: no path previews, no
 * "attack will work", no enemy figure the Faction cannot see (ADR-0020).
 *
 * ## Why the offers are separate from the Commands
 *
 * The buttons are drawn from `OrderOption` values and pressed by their `id`; the
 * page turns an `id` into a real Command through `sim/command.ts`'s own builders
 * and hands it to the same `human.submit` the AI and an external agent go
 * through. Nothing here can construct a Command, so a button cannot become a way
 * around the seam.
 *
 * ## One targeting path
 *
 * An offer is either immediate (`hold`, `build`) or *armed*: it needs a target
 * the Player has not given yet (`attack` a Squad, `garrison` a settlement,
 * `move` a tile). The armed action is one piece of page state, whichever control
 * armed it — a button, the `A` key or the classic right click — which is what
 * "buttons and existing shortcuts use one submission/targeting path" means.
 * Escape cancels the target and nothing else; a Command already submitted is
 * not a target and is never cancelled.
 *
 * ## Mixed selections
 *
 * A rule that is a question about each Squad is answered for each Squad. A
 * garrison is a Squad that is *in reach*; a movement refusal is each Squad's
 * own. So the offers say what they can (*"3 su 5 a portata"* is composed from
 * `garrisonReach`), the Command is still issued to the whole selection — the
 * rules decide who it applies to, exactly as an AI's Command is decided — and
 * what each Squad actually did is read back from its own Observation line. The
 * interface does not invent an all-or-nothing group rule, because the rules do
 * not have one.
 */
import { buildingDescription, categoryOf, type ConstructionCategory } from './construction.ts';
import { TICK_HZ } from '../sim/clock.ts';
import type { BadgeName } from '../art/icons.ts';
import {
  BUILDINGS,
  SQUAD_TYPES,
  amountOf,
  pay,
  payrollBill,
  recruitCost,
  squadTypesOf,
  times,
  stockOf,
  type ResourceAmounts,
} from '../content/index.ts';
import type { EconomyVisible, VisibleSettlement, VisibleSquad } from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { RESOURCE, RESOURCE_KINDS, type ResourceKind } from '../sim/map.ts';
import { canAssault, SIEGE_RADIUS, type SiegeVisible, type VisibleFront } from '../sim/siege.ts';
import { message, refusalLabel, resourceLabel, squadLabel, translate, workLabel } from './strings.ts';

/** One figure a settlement's row reads as a badge: a resource, a time, men or denarii. */
export interface OrderCost {
  /** The badge that says which figure it is. */
  readonly badge: BadgeName;
  /** The figure itself, in the unit the badge names. */
  readonly value: number;
}

/** What a set of offers is *about*, which is what decides where they are drawn. */
export type OrderGroup = 'movement' | 'combat' | 'formation' | 'siege' | 'construction' | 'recruitment';

/** What an armed offer is waiting for, and therefore which click answers it. */
export type OrderTarget = 'none' | 'ground' | 'enemy' | 'settlement';

/** The verb an offer means, as the page dispatches on it. */
export type OrderKind =
  | 'move'
  | 'attackMove'
  | 'attack'
  | 'hold'
  | 'withdraw'
  | 'formation'
  | 'garrison'
  | 'assault'
  | 'blockade'
  | 'build'
  | 'recruit';

/** The three pages of a settlement's panel (#55). */
export type SettlementTab = 'overview' | 'construction' | 'recruitment';

/** The most Squads one recruitment press may buy: a queue, not a standing army at once. */
export const MAX_RECRUIT_COUNT = 9;

/** The count a recruitment press really uses, clamped to the control's range. */
export function recruitCountInRange(count: number): number {
  return Math.min(MAX_RECRUIT_COUNT, Math.max(1, Math.trunc(count)));
}

/** Every tab, in the order the panel shows them. */
export const SETTLEMENT_TABS: readonly SettlementTab[] = ['overview', 'construction', 'recruitment'];

/**
 * One action, as a button: what it does, whether it can be done, and why not.
 *
 * `id` is stable and is what the page dispatches on (`formation.line`,
 * `build:farm`, `recruit:hastati`); `subject` is the content id the Command will
 * name, kept apart so that an id can carry the tab as well as the verb.
 */
export interface OrderOption {
  /** Stable dispatch id: `move`, `formation.line`, `build:farm`, `recruit:hastati`. */
  readonly id: string;
  /** The verb it means, so a caller switches on a fact rather than parses the id. */
  readonly kind: OrderKind;
  /** Which block of the panel it belongs to. */
  readonly group: OrderGroup;
  /** The verb, in Italian, as a Player reads it in full. */
  readonly label: string;
  /** The one word under its icon: short enough for a command card. */
  readonly short: string;
  /** What pressing it commits to, as badges a row can draw beside the name. */
  readonly costs: readonly OrderCost[];
  /** The content id or formation it names, when it names one. */
  readonly subject: string | null;
  /** For a Recruit: the real size and the number of Squads one press buys. */
  readonly recruit?: { readonly men: number; readonly count: number };
  /** Cost, time or strength: what pressing it commits to, from the content tables. */
  readonly note: string | null;
  /** The key that does the same thing, when there is one. */
  readonly shortcut: string | null;
  /** What the click would have to name, when it needs a target. */
  readonly target: OrderTarget;
  /** The sentence shown while the action is armed: what to click next. */
  readonly targetHint: string | null;
  /** Whether the rules would accept it from this selection, as far as a Player can know. */
  readonly enabled: boolean;
  /** Why it is not on offer, in the Player's words. `null` when it is. */
  readonly reason: string | null;
}

/** One settlement a Player could name as a target, and what is known of it. */
export interface SettlementTarget {
  /** Its id, as a Siege Command names it. */
  readonly id: number;
  /** The tile it stands on, as this Faction last knew it. */
  readonly x: number;
  /** The tile it stands on, as this Faction last knew it. */
  readonly y: number;
  /** Whether it is one of the Faction's own. */
  readonly own: boolean;
  /** Whether it has walls, or `null` when this Faction has no front to say. */
  readonly walled: boolean | null;
}

/** An enemy Squad this Faction can see *now*, which is the only thing worth aiming at. */
export interface EnemyTarget {
  /** Its id, as an `attack` Command names it. */
  readonly id: number;
  /** The tile it stands on. */
  readonly x: number;
  /** The tile it stands on. */
  readonly y: number;
  /** Its type, as the Faction sees it. */
  readonly type: string;
}

/** A group of Squads, as the panel summarises it. */
export interface GroupSummary {
  /** `Astati 2, Principi 1`: the types it is made of, in the Faction's own order. */
  readonly composition: string;
  /** How many Squads it holds. */
  readonly squads: number;
  /** How many men they are counted as together. */
  readonly men: number;
  /** The lowest Morale among them. */
  readonly moraleMin: number;
  /** The highest Morale among them. */
  readonly moraleMax: number;
  /** The individual Squads that need attention, worst first. */
  readonly exceptions: readonly GroupException[];
}

/** One Squad in a group that needs attention, and the row that opens it. */
export interface GroupException {
  /** The Squad's id, which is what clicking the row selects. */
  readonly squad: number;
  /** What it is called, e.g. `Astati 3`. */
  readonly name: string;
  /** Why it needs attention, in the Player's words. */
  readonly reason: string;
}

/** One numbered control group, as a visible control. */
export interface ControlGroupView {
  /** The digit that recalls it. */
  readonly index: number;
  /** How many Squads it holds. */
  readonly count: number;
  /** Its composition, e.g. `Astati 2, Principi 1`. */
  readonly composition: string;
}

/**
 * The offers a selection of Squads has.
 *
 * The order is fixed — movement, combat, formation, Siege — so that a button a
 * Player learned does not move when a different Squad is picked. What changes is
 * `enabled` and `reason`.
 */
export function squadOrders(
  visible: EconomyVisible | SiegeVisible,
  faction: Faction,
  picked: readonly VisibleSquad[],
  ended = false,
): readonly OrderOption[] {
  const hasSquads = picked.length > 0;
  const squadsReason = ended ? translate('reason.ended') : translate('reason.noSquads');
  const blocked = (why: string): { readonly enabled: false; readonly reason: string } => ({ enabled: false, reason: why });
  const open = !ended && hasSquads;

  return [
    {
      id: 'move', kind: 'move', group: 'movement', label: translate('cmd.move'), short: translate('cmdShort.move'),
      costs: [], subject: null, note: null, shortcut: null,
      target: 'ground', targetHint: translate('target.ground'),
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    {
      id: 'attackMove', kind: 'attackMove', group: 'movement', label: translate('cmd.attackMove'),
      short: translate('cmdShort.attackMove'), costs: [], subject: null, note: null, shortcut: 'A',
      target: 'ground', targetHint: translate('target.ground'),
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    {
      id: 'attack', kind: 'attack', group: 'movement', label: translate('cmd.attack'), short: translate('cmdShort.attack'),
      costs: [], subject: null, note: null, shortcut: null,
      target: 'enemy', targetHint: translate('target.enemy'),
      ...(open
        ? enemyTargets(visible).length === 0 && visibleWorkTargets(visible).length === 0 && !('barbarianCamps' in visible &&
            visible.barbarianCamps?.some((camp) => camp.memory === 'seen' && camp.condition === 'standing') === true)
          ? blocked(translate('reason.noEnemy'))
          : { enabled: true, reason: null }
        : blocked(squadsReason)),
    },
    {
      id: 'hold', kind: 'hold', group: 'combat', label: translate('cmd.hold'), short: translate('cmdShort.hold'),
      costs: [], subject: null, note: null, shortcut: 'S',
      target: 'none', targetHint: null,
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    {
      id: 'withdraw', kind: 'withdraw', group: 'combat', label: translate('cmd.withdraw'), short: translate('cmdShort.withdraw'),
      costs: [], subject: null, note: null, shortcut: 'W',
      target: 'none', targetHint: null,
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    {
      id: 'formation.line', kind: 'formation', group: 'formation', label: translate('cmd.line'), short: translate('cmdShort.line'),
      costs: [], subject: 'line', note: null, shortcut: 'L',
      target: 'none', targetHint: null,
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    {
      id: 'formation.column', kind: 'formation', group: 'formation', label: translate('cmd.column'),
      short: translate('cmdShort.column'), costs: [], subject: 'column', note: null, shortcut: 'C',
      target: 'none', targetHint: null,
      ...(open ? { enabled: true, reason: null } : blocked(squadsReason)),
    },
    ...siegeOrders(visible, faction, picked, ended),
  ];
}

/**
 * The three Siege offers, with the Faction's own limits stated rather than hidden.
 *
 * Carthage has no ram (ADR-0008), so `assault` is offered and disabled with the
 * reason; the other two are offered whenever any walled or enemy settlement is
 * *known*, which is a fact about this Faction's memory and not about the world.
 */
function siegeOrders(
  visible: EconomyVisible | SiegeVisible,
  faction: Faction,
  picked: readonly VisibleSquad[],
  ended: boolean,
): readonly OrderOption[] {
  const squads = picked.length > 0 && !ended;
  const targets = settlementTargets(visible);
  const ownWalls = targets.some((target) => target.own && target.walled === true);
  const enemyWalls = targets.some((target) => !target.own && target.walled === true);
  const enemySettlement = targets.some((target) => !target.own);

  /** Why an offer is not on offer, or `null` when it is. */
  const refusal = (missing: boolean, why: string): string | null => {
    if (ended) return translate('reason.ended');
    if (!squads) return translate('reason.noSquads');

    return missing ? why : null;
  };
  const eligible = picked.some((squad) => SQUAD_TYPES.some((type) => type.id === squad.type && type.arm !== 'cavalry'));
  const garrisonReason = refusal(!ownWalls || !eligible, !ownWalls ? translate('reason.noOwnWalls') : translate('refusal.garrisonType'));
  const assaultReason = refusal(!canAssault(faction) || !enemyWalls,
    canAssault(faction) ? translate('reason.noEnemyWalls') : translate('reason.noRam'));
  const blockadeReason = refusal(!enemySettlement, translate('reason.noEnemySettlement'));
  const offer = (reason: string | null): { readonly enabled: boolean; readonly reason: string | null } =>
    ({ enabled: reason === null, reason });

  return [
    {
      id: 'garrison', kind: 'garrison', group: 'siege', label: translate('cmd.garrison'),
      short: translate('cmdShort.garrison'), costs: [], subject: null,
      note: translate('garrison.travel'),
      shortcut: null, target: 'settlement', targetHint: translate('target.ownWalled'),
      ...offer(garrisonReason),
    },
    {
      id: 'assault', kind: 'assault', group: 'siege', label: translate('cmd.assault'), short: translate('cmdShort.assault'),
      costs: [], subject: null, note: null,
      shortcut: null, target: 'settlement', targetHint: translate('target.enemySettlement'),
      ...offer(assaultReason),
    },
    {
      id: 'blockade', kind: 'blockade', group: 'siege', label: translate('cmd.blockade'),
      short: translate('cmdShort.blockade'), costs: [], subject: null, note: null,
      shortcut: null, target: 'settlement', targetHint: translate('target.enemySettlement'),
      ...offer(blockadeReason),
    },
  ];
}

/**
 * The offers one settlement has, on one of its three pages.
 *
 * Construction and recruitment are the same shape — a content row, its cost, its
 * requirement and its reason — because they are the same decision: spend a
 * settlement's own stock on one named thing. The overview has no offers; it is
 * the page that says what the settlement *has*.
 */
export function settlementOrders(
  _visible: EconomyVisible,
  faction: Faction,
  settlement: VisibleSettlement,
  tab: SettlementTab,
  ended = false,
  recruitCount = 1,
  category?: ConstructionCategory,
): readonly OrderOption[] {
  const offers = tab === 'construction' ? constructionOrders(faction, settlement).filter((offer) => category === undefined || categoryOf(offer.subject ?? '') === category)
    : tab === 'recruitment' ? recruitmentOrders(faction, settlement, recruitCount) : [];

  return ended ? offers.map((offer) => ({ ...offer, enabled: false, reason: translate('reason.ended') })) : offers;
}

/** Every building this Faction could raise here, in content order. */
function constructionOrders(faction: Faction, settlement: VisibleSettlement): readonly OrderOption[] {
  return BUILDINGS.filter((building) => building.faction === undefined || building.faction === faction).map((building) => {
    const built = settlement.works.filter((work) => work.building === building.id).length +
      (settlement.pending ?? []).filter((order) => order.kind === 'build' && order.building === building.id).length;
    const affordable = pay(stockOf(settlement.stocks), building.cost).affordable;
    const reason = building.tier > settlement.tier
      ? message('reason.tier', { tier: building.tier })
      : built >= building.maxPerSettlement ? translate('reason.maxWorks') : null;

    return {
      id: `build:${building.id}`,
      kind: 'build' as const,
      group: 'construction' as const,
      label: workLabel(building.id),
      short: workLabel(building.id),
      costs: [...resourceCosts(building.cost), { badge: 'clock', value: building.buildTicks / TICK_HZ }],
      subject: building.id,
      note: buildingDescription(building) + (!affordable ? '\n' + translate('pending.offer') : ''),
      shortcut: null,
      target: 'none' as const,
      targetHint: null,
      enabled: reason === null,
      reason,
    };
  });
}

/**
 * Every real size of every Squad type this Faction could raise here, in content
 * order and smallest size first.
 *
 * One offer per *purchase*, not per type: a 24-man hastati and a 120-man one are
 * different bills and different Payroll rates, so pressing one has to say which
 * it is (ADR-0026). The count is the recruitment page's own number of Squads;
 * every row quotes the whole press, so the cost a Player reads is what the tick
 * will charge.
 */
function recruitmentOrders(
  faction: Faction,
  settlement: VisibleSettlement,
  count: number,
): readonly OrderOption[] {
  const squads = recruitCountInRange(count);

  return squadTypesOf(faction).flatMap((type) => type.sizes.map((men) => {
    const total = times(recruitCost(type, men), squads);
    const affordable = pay(stockOf(settlement.stocks), total).affordable;
    const bill = payrollBill(type, men) * squads;
    const reason = type.tier > settlement.tier
      ? message('reason.tier', { tier: type.tier }) : null;
    const name = squadLabel(type.id);

    return {
      id: `recruit:${type.id}:${String(men)}`,
      kind: 'recruit' as const,
      group: 'recruitment' as const,
      label: `${name} ${String(men)}`,
      short: `${name} ${String(men)}`,
      costs: [...resourceCosts(total), { badge: 'men', value: men * squads }, { badge: 'coin', value: bill }],
      subject: type.id,
      recruit: { men, count: squads },
      note: message('ui.recruitNote', {
        men,
        count: squads,
        total: men * squads,
        menLabel: translate('ui.men'),
        cost: costLabel(total),
        payrollLabel: translate('ui.payroll'),
        payroll: bill,
        perSeason: translate('ui.perSeason'),
      }) + (!affordable ? '\n' + translate('pending.offer') : ''),
      shortcut: null,
      target: 'none' as const,
      targetHint: null,
      enabled: reason === null,
      reason,
    };
  }));
}

/** The badge that names each resource, beside the numeral it is drawn with. */
const RESOURCE_BADGE: Readonly<Record<ResourceKind, BadgeName>> = {
  [RESOURCE.grain]: 'grain',
  [RESOURCE.timber]: 'timber',
  [RESOURCE.stone]: 'stone',
  [RESOURCE.iron]: 'iron',
};

/** The resources a cost actually charges, as badges; ones it does not cost are left out. */
function resourceCosts(cost: ResourceAmounts): readonly OrderCost[] {
  return RESOURCE_KINDS
    .map((kind): OrderCost => ({ badge: RESOURCE_BADGE[kind], value: amountOf(cost, kind) }))
    .filter((entry) => entry.value > 0);
}

/** A cost, in the resources' own names, with the ones it does not cost left out. */
function costLabel(cost: ResourceAmounts): string {
  const parts = RESOURCE_KINDS
    .map((kind) => [kind, amountOf(cost, kind)] as const)
    .filter(([, amount]) => amount > 0)
    .map(([kind, amount]) => message('ui.costItem', { name: resourceLabel(kind), amount }));

  return parts.length === 0 ? translate('ui.none') : parts.join(', ');
}

/** Eligible infantry that may approach a friendly doorway; capacity is checked on arrival. */
export function garrisonReach(
  visible: EconomyVisible | SiegeVisible,
  picked: readonly VisibleSquad[],
  settlement?: number,
): { readonly near: number; readonly total: number } {
  const walled = ownWalledTargets(visible);
  const chosen = settlement === undefined ? walled : walled.filter((target) => target.id === settlement);
  const at = chosen.length > 0 ? chosen : walled;
  if (at.length === 0) return { near: 0, total: picked.length };

  const near = picked.filter((squad) => SQUAD_TYPES.some((type) => type.id === squad.type && type.arm !== 'cavalry')).length;

  return { near, total: picked.length };
}

/** The Faction's own walled settlements, as targets a garrison can name. */
export function ownWalledTargets(visible: EconomyVisible | SiegeVisible): readonly SettlementTarget[] {
  return settlementTargets(visible).filter((target) => target.own && target.walled === true);
}

/** Every settlement this Faction could name, own or known enemy, with what is known of it. */
export function settlementTargets(visible: EconomyVisible | SiegeVisible): readonly SettlementTarget[] {
  const own = visible.settlements.map((settlement) => ({
    id: settlement.id,
    x: settlement.x,
    y: settlement.y,
    own: true,
    walled: walledOf(visible, settlement.id),
  }));
  const known = new Set(own.map((target) => target.id));
  const remembered = contactsOf(visible)
    .filter((contact) => contact.kind !== 'squad' && !known.has(contact.id))
    .map((contact) => ({
      id: contact.id,
      x: contact.x,
      y: contact.y,
      own: false,
      // A Stronghold is walled by its kind, which is what the contact remembers;
      // an open settlement's walls are the front's business, and a front this
      // Faction has no eyes on is no front at all (ADR-0020).
      walled: contact.kind === 'stronghold' ? true : walledOf(visible, contact.id),
    }));

  const appearances = isSiege(visible) ? visible.appearances ?? [] : [];
  const recorded = new Set([...known, ...remembered.map((target) => target.id)]);
  return [...own, ...remembered, ...appearances.filter((site) => !recorded.has(site.id) && site.tiles.length > 0)
    .map((site) => ({ id: site.id, x: site.x, y: site.y, own: false, walled: site.kind === 'stronghold' }))];
}

/** The enemy Squads this Faction sees standing in the open right now. */
export function enemyTargets(visible: EconomyVisible | SiegeVisible): readonly EnemyTarget[] {
  if (!isSiege(visible)) return [];

  return visible.enemies.map((enemy) => ({ id: enemy.id, x: enemy.x, y: enemy.y, type: enemy.type }));
}

/** Visible cells belonging to hostile, completed and attackable works. */
export function visibleWorkTargets(visible: EconomyVisible | SiegeVisible): readonly {
  readonly settlement: number; readonly building: string; readonly ordinal: number; readonly x: number; readonly y: number;
}[] {
  if (!isSiege(visible)) return [];
  const own = new Set(visible.settlements.map((site) => site.id));
  return (visible.appearances ?? []).flatMap((site) => {
    if (own.has(site.id) || site.owner === null) return [];
    return site.tiles.flatMap((tile) => {
      const work = tile.work;
      if (!tile.visible || work === undefined || (work.stage !== 2 && work.stage !== 3)) return [];
      return [{ settlement: site.id, building: work.building, ordinal: work.ordinal,
        x: site.x - 12 + tile.cell % 25, y: site.y - 12 + Math.floor(tile.cell / 25) }];
    });
  });
}

/** Whether an enemy walled settlement is *known*: a Stronghold is walled by its kind. */
export function enemyWalledKnown(visible: EconomyVisible | SiegeVisible): boolean {
  const own = new Set(visible.settlements.map((settlement) => settlement.id));
  const fromFronts = isSiege(visible) && visible.fronts.some((front) => !own.has(front.settlement) && walled(front));
  const fromMemory = contactsOf(visible).some((contact) => contact.kind === 'stronghold' && !own.has(contact.id));

  return fromFronts || fromMemory;
}

/** The enemy fronts this Faction knows: the ones it is besieging or can see (ADR-0020). */
export function knownEnemyFronts(visible: EconomyVisible | SiegeVisible): readonly VisibleFront[] {
  const own = new Set(visible.settlements.map((settlement) => settlement.id));

  return (isSiege(visible) ? visible.fronts : []).filter((front) =>
    !own.has(front.settlement) && (front.structures.length > 0 || front.siege !== null || front.garrison > 0));
}

/** The front this Faction knows for one settlement, or `undefined` when it knows of none. */
export function knownFront(visible: EconomyVisible | SiegeVisible, settlement: number): VisibleFront | undefined {
  return isSiege(visible) ? visible.fronts.find((front) => front.settlement === settlement) : undefined;
}

/** Which settlement a click on the map names, as the target of an armed Siege order. */
export function settlementAt(
  targets: readonly SettlementTarget[],
  x: number,
  y: number,
): SettlementTarget | null {
  return nearestWithin(targets, x, y, SIEGE_RADIUS);
}

/** Which enemy Squad a click on the map names, as the target of an armed attack. */
export function enemyAt(targets: readonly EnemyTarget[], x: number, y: number): EnemyTarget | null {
  return nearestWithin(targets, x, y, 1);
}

/**
 * The nearest of a list within a distance, in the rules' own measure (Chebyshev).
 *
 * Both target questions are the same question — "what did this click mean?" — so
 * they answer it the same way, with one radius each: a settlement is a place and
 * a Squad is a block of men standing on one.
 */
function nearestWithin<T extends { readonly x: number; readonly y: number }>(
  candidates: readonly T[],
  x: number,
  y: number,
  radius: number,
): T | null {
  let best: T | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const distance = Math.max(Math.abs(candidate.x - x), Math.abs(candidate.y - y));
    if (distance > radius || distance >= bestDistance) continue;
    best = candidate;
    bestDistance = distance;
  }

  return best;
}

/** What a group of Squads is, as one paragraph of figures and the exceptions in it. */
export function groupSummary(picked: readonly VisibleSquad[]): GroupSummary {
  const men = picked.reduce((total, squad) => total + squad.men, 0);
  const morale = picked.map((squad) => squad.morale);

  return {
    composition: compositionOf(picked.map((squad) => squad.type)),
    squads: picked.length,
    men,
    moraleMin: morale.length === 0 ? 0 : Math.min(...morale),
    moraleMax: morale.length === 0 ? 0 : Math.max(...morale),
    exceptions: exceptionsOf(picked),
  };
}

/** `Astati 2, Principi 1`: the types present, counted, in the order they were picked. */
export function compositionOf(types: readonly string[]): string {
  const counts = new Map<string, number>();
  for (const type of types) counts.set(type, (counts.get(type) ?? 0) + 1);

  return [...counts]
    .map(([type, count]) => message('ui.compositionItem', { name: squadLabel(type), count }))
    .join(', ');
}

/**
 * The Squads in a selection that need their own panel, in the order a Player
 * would want to look at them: broken men first, then refusals, then Payroll, then
 * supply. Each one is a row the panel can open, which is how an exception keeps
 * its way back to the group.
 */
function exceptionsOf(picked: readonly VisibleSquad[]): readonly GroupException[] {
  const found: GroupException[] = [];

  for (const squad of picked) {
    const name = message('ui.listItem', { name: squadLabel(squad.type), id: squad.id });
    if (squad.routing) found.push({ squad: squad.id, name, reason: translate('order.routing') });
    else if (squad.refused !== null) found.push({ squad: squad.id, name, reason: refusalLabel(squad.refused) });
    else if (squad.unpaid > 0) {
      found.push({ squad: squad.id, name, reason: `${translate('ui.unpaid')} ${String(squad.unpaid)}` });
    } else if (!squad.inTerritory) found.push({ squad: squad.id, name, reason: translate('supply.outside') });
  }

  return found;
}

/** Every bound control group, as a numbered visible control. */
export function controlGroupViews(
  visible: EconomyVisible,
  groups: readonly { readonly index: number; readonly squads: readonly number[] }[],
): readonly ControlGroupView[] {
  return [...groups]
    .sort((left, right) => left.index - right.index)
    .map((group) => {
      const held = visible.squads.filter((squad) => group.squads.includes(squad.id));
      return {
        index: group.index,
        count: held.length,
        composition: compositionOf(held.map((squad) => squad.type)),
      };
    });
}

/**
 * What a Squad's figures are read against.
 *
 * The readers live in `ui/conditions.ts` (#58) because the warning thresholds are
 * written against the same maxima; this module re-exports them so a panel that
 * asks "how many men" does not have to know where the answer lives.
 */
export { menOf, moraleOf } from './conditions.ts';

/** Whether an Observation is the Siege's own, which is what carries fronts and contacts. */
export function isSiege(visible: EconomyVisible | SiegeVisible): visible is SiegeVisible {
  return 'fronts' in visible;
}

/** A remembered enemy settlement, as the fog keeps it: only a place and a kind. */
function contactsOf(visible: EconomyVisible | SiegeVisible): SiegeVisible['contacts'] {
  return isSiege(visible) ? visible.contacts : [];
}

/** Whether a settlement is walled, or `null` when no known front says. */
function walledOf(visible: EconomyVisible | SiegeVisible, settlement: number): boolean | null {
  const front = knownFront(visible, settlement);

  return front === undefined ? null : walled(front);
}

/** Whether a *known* front has standing walls. The rule is `siege.ts`'s. */
function walled(front: VisibleFront): boolean {
  return front.structures.length > 0;
}

/** A visible neutral structure is a movement target at its canonical centre, not its roof's terrain tile. */
export function neutralMoveDestination(
  sites: readonly (Pick<import('./sites.ts').KnownSite, 'x' | 'y' | 'kind' | 'owner' | 'memory'> & Pick<Partial<import('./sites.ts').KnownSite>, 'appearance'> & { readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } })[],
  point: { readonly x: number; readonly y: number },
  ground: { readonly x: number; readonly y: number },
): { readonly x: number; readonly y: number } {
  const site = sites.find((site) => site.appearance === undefined && site.kind === 'settlement' && site.owner === null && site.memory === 'seen'
    && point.x >= site.rect.x && point.x < site.rect.x + site.rect.width && point.y >= site.rect.y && point.y < site.rect.y + site.rect.height);
  return site ? { x: site.x, y: site.y } : ground;
}
