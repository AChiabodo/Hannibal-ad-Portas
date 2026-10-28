/**
 * What the interface says about a Squad's condition, and which brief events it
 * tells a Player about (#58).
 *
 * Two questions live here, and they are deliberately the same module because a
 * Player reads them together:
 *
 * - **conditions** — what is persistently true of a Squad now: it has broken, its
 *   Morale is low, it is tired, it has thrown its last volley, it has gone unpaid
 *   or it is outside its own country. The first two thresholds are the ticket's
 *   approved **presentation** conventions (Q16), not rules: a positive Morale at
 *   or below a quarter of the type's maximum, and Fatigue at or above fifteen of
 *   twenty. Rout, an unpaid Payroll and a lost supply line are the rules' own
 *   facts and are read from the Observation, never inferred.
 * - **notices** — the current-Match journal a Player can review: the conditions
 *   above plus brief, actionable events (a refused order, a rout beginning, a
 *   Squad falling out of supply, an enemy coming to grips, a Siege opening) and
 *   the Season warning before winter. Notices are deduplicated by a stable id,
 *   never pause the Match and never carry anything the Observation does not.
 *
 * ## What this module may read
 *
 * Only the Faction's `Observation` (ADR-0020): its own Squads, its own
 * settlements, the fronts it is allowed to see and the calendar. There is no
 * path from here to the world, so a notice cannot reveal an enemy's stock, an
 * unseen Siege's progress or a Squad the Faction has never seen.
 *
 * ## Presentation, not state
 *
 * The journal is the Player's memory, like the selection and the control groups.
 * It is never part of the Match, never hashed and never read by a rule; the
 * thresholds below change what the interface *says* and nothing about what the
 * rules do.
 */
import { squadTypeCode, squadTypeOf, type SquadType } from '../content/index.ts';
import { TICK_HZ } from '../sim/clock.ts';
import type { EconomyVisible, VisibleSquad } from '../sim/economy-match.ts';
import { SEASON_TICKS, type Season } from '../sim/season.ts';
import { FATIGUE_MAX } from '../sim/squad.ts';
import type { SiegeVisible } from '../sim/siege.ts';
import { message, refusalLabel, squadLabel, translate } from './strings.ts';

/**
 * The share of a type's maximum Morale at or below which the interface calls the
 * Morale low: a quarter, and a positive one (a Squad at none has broken, and
 * `routing` says so instead).
 */
export const MORALE_WARNING_SHARE = 0.25;

/** The Fatigue at or above which a tired Squad is called out: fifteen of twenty. */
export const FATIGUE_WARNING = 15;

/** The volleys at or below which a type that carries any is called out: none. */
export const AMMUNITION_WARNING = 0;

/** How close to the winter boundary the Season warning appears, in simulation seconds. */
export const WINTER_WARNING_SECONDS = 30;

/** The same warning in ticks: the interface's clock is the Match's (ADR-0006). */
export const WINTER_WARNING_TICKS = WINTER_WARNING_SECONDS * TICK_HZ;

/** How many event notices the history keeps: a Match's recent past, not a log file. */
export const NOTICE_HISTORY = 24;

/** How long an event notice stays "new" on the strip, in ticks: six simulation seconds. */
export const NOTICE_FRESH_TICKS = 6 * TICK_HZ;

/**
 * The conditions a Squad can be in, in the order the theatre and the journal rank
 * them: a rout outranks everything, then a Morale that will break next, then an
 * army that is not being paid or fed, then fatigue, then spent missiles.
 */
export const SQUAD_CONDITIONS = [
  'routing',
  'lowMorale',
  'unpaid',
  'noSupply',
  'fatigue',
  'noAmmunition',
] as const;

/** One of them. */
export type SquadCondition = (typeof SQUAD_CONDITIONS)[number];

/** The conditions drawn with a shape of their own; low Morale is the status bar's pips. */
export type MarkedCondition = Exclude<SquadCondition, 'lowMorale'>;

/** The content type a Squad names, or `undefined` when no table knows it. */
export function typeOf(squad: VisibleSquad): SquadType | undefined {
  const code = squadTypeCode(squad.type);

  return code === undefined ? undefined : squadTypeOf(code);
}

/**
 * The men a Squad has left, against the men it was recruited with.
 *
 * The maximum is the Squad's own capacity, not its type's largest size: a
 * 60-man Squad worn down to 40 reads as `40/60`, which is the purchase the
 * Player made and not a type-wide full strength they never had (ADR-0026).
 */
export function menOf(squad: VisibleSquad): { readonly men: number; readonly capacity: number } {
  return { men: squad.men, capacity: squad.capacity };
}

/** The Morale a Squad has, against the most its type ever had. */
export function moraleOf(squad: VisibleSquad): { readonly morale: number; readonly max: number } {
  return { morale: squad.morale, max: typeOf(squad)?.morale ?? squad.morale };
}

/** The volleys a Squad has left, against what its type carries at full strength. */
export function ammunitionOf(squad: VisibleSquad): { readonly left: number; readonly max: number } {
  return { left: squad.ammunition, max: typeOf(squad)?.ammunition ?? squad.ammunition };
}

/** Whether a Squad's Morale is positive but at or below the warning share of its type's maximum. */
export function lowMorale(squad: VisibleSquad): boolean {
  const morale = moraleOf(squad);

  return morale.morale > 0 && morale.max > 0 && morale.morale <= morale.max * MORALE_WARNING_SHARE;
}

/** Every condition that is true of a Squad now, in the order `SQUAD_CONDITIONS` states. */
export function squadConditions(squad: VisibleSquad): readonly SquadCondition[] {
  const conditions: SquadCondition[] = [];

  if (squad.routing) conditions.push('routing');
  if (lowMorale(squad)) conditions.push('lowMorale');
  if (squad.unpaid > 0) conditions.push('unpaid');
  if (!squad.inTerritory) conditions.push('noSupply');
  if (squad.fatigue >= FATIGUE_WARNING) conditions.push('fatigue');
  if (ammunitionOf(squad).max > 0 && squad.ammunition <= AMMUNITION_WARNING) conditions.push('noAmmunition');

  return conditions;
}

/** The conditions a status bar draws as a glyph: everything but the pips' own low Morale. */
export function markedConditions(conditions: readonly SquadCondition[]): readonly MarkedCondition[] {
  return conditions.filter((condition): condition is MarkedCondition => condition !== 'lowMorale');
}

/**
 * Which Season begins at the next boundary, and how many ticks away it is.
 *
 * The calendar is the Match's own (`sim/season.ts`): a Season is `SEASON_TICKS`
 * long, the tick is the only clock, and the boundary falls on the same tick in
 * every run. The page reads this from the tick it is on, so a paused Match's
 * warning stands still rather than counting wall time.
 */
export function nextBoundary(season: Season, tick: number): { readonly season: Season; readonly ticks: number } {
  const order: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];
  const index = order.indexOf(season);
  const next = order[(index + 1) % order.length] ?? 'spring';

  return { season: next, ticks: SEASON_TICKS - (tick % SEASON_TICKS) };
}

/** The kinds of notice the journal keeps, by what they are about. */
export type NoticeKind =
  | 'morale'
  | 'fatigue'
  | 'ammunition'
  | 'routing'
  | 'unpaid'
  | 'supply'
  | 'winter'
  | 'blockade'
  | 'refusal'
  | 'engaged'
  | 'contact'
  | 'workDamage'
  | 'siege'
  | 'loss';

/** Where a notice is about, when the Faction knows a place for it. */
export interface NoticeTarget {
  /** Own Squad, known settlement, or the historical tile of an enemy sighting. */
  readonly kind: 'squad' | 'settlement' | 'contact';
  /** The id a selection and a Command use. */
  readonly id: number;
  /** The tile it stood on when the notice was read, so a click can centre it. */
  readonly x: number;
  readonly y: number;
}

/** One notice: a persistent condition, or a brief event, in the journal. */
export interface Notice {
  /** A stable key, which is what deduplication is made of. */
  readonly id: string;
  /** What it is about. */
  readonly kind: NoticeKind;
  /** Whether it is true now (a condition) or was true a moment ago (an event). */
  readonly persistent: boolean;
  /** The line a Player reads, in Italian. */
  readonly label: string;
  /** The figure or reason beside it, when there is one. */
  readonly detail: string | null;
  /** Where it is, when the Faction knows a place for it. */
  readonly target: NoticeTarget | null;
  /** The tick it was first raised on. */
  readonly raised: number;
  /** Whether its target is gone, which a click that found nothing records. */
  readonly lost: boolean;
}

/** The journal: what the Faction has been told this Match, newest concern first. */
export interface NoticeBook {
  /** Reads the Observation and brings the journal up to date. */
  read(visible: EconomyVisible | SiegeVisible, tick: number): readonly Notice[];

  /** Records that a notice's target is no longer known. @returns whether it named one. */
  lose(id: string): boolean;

  /** Every notice the journal holds, without reading anything new. */
  entries(): readonly Notice[];
}

/** A notice the journal derives from the world on each read, before it is stored. */
interface Fresh {
  readonly id: string;
  readonly kind: NoticeKind;
  readonly label: string;
  readonly detail: string | null;
  readonly target: NoticeTarget | null;
}

/** What the previous read saw of one Squad, which is what an event is a change from. */
interface Seen {
  readonly routing: boolean;
  readonly refused: string | null;
  readonly unpaid: number;
  readonly engaged: boolean;
}

/** One stored notice, and the tick after which it stops being new. */
interface Stored {
  notice: Notice;
  until: number;
}

/**
 * Opens an empty journal.
 *
 * A function rather than a class because the journal has no identity worth
 * exposing: a caller reads it and tells it that a target is gone, and the page
 * owns the one instance for the length of the Match.
 */
export function createNoticeBook(): NoticeBook {
  const stored = new Map<string, Stored>();
  let seenSquads = new Map<number, Seen>();
  let seenFronts = new Map<number, string | null>();
  let seenWorks = new Map<string, number>();
  const spotted = new Set<number>();

  return {
    read(visible, tick) {
      const beforeSquads = seenSquads;
      const beforeFronts = seenFronts;
      const beforeWorks = seenWorks;

      // What this read will be a change *from* on the next one.
      seenSquads = new Map(visible.squads.map((squad) => [squad.id, seenOf(squad)]));
      seenWorks = new Map(visible.settlements.flatMap((site) => site.works.flatMap((work, index) =>
        work.hp === undefined ? [] : [[`${String(site.id)}:${work.building}:${String(work.ordinal ?? index)}`, work.hp] as const])));
      seenFronts = new Map(hasFronts(visible)
        ? [...visible.settlements.map((settlement) => {
          const front = visible.fronts.find((candidate) => candidate.settlement === settlement.id);

          return [settlement.id, front?.siege ?? null] as const;
        })]
        : []);

      const current = conditionsNow(visible, tick);
      const events = eventsNow(visible, beforeSquads, beforeFronts, beforeWorks);

      // Persistent conditions are refreshed in place: a Squad that recovers loses
      // its notice, and one that is still in trouble keeps the tick it began on
      // rather than being announced again every frame.
      const stillTrue = new Set(current.map((fresh) => fresh.id));
      for (const [id, entry] of stored) {
        if (entry.notice.persistent && !stillTrue.has(id)) stored.delete(id);
      }
      for (const fresh of current) {
        const known = stored.get(fresh.id);
        if (known === undefined) {
          stored.set(fresh.id, { notice: noticeOf(fresh, tick, true), until: Number.POSITIVE_INFINITY });

          continue;
        }
        // Keep the tick it began on, and follow the Squad: a notice about a
        // marching Squad must centre where the Squad is now, not where it was.
        stored.set(fresh.id, {
          until: Number.POSITIVE_INFINITY,
          notice: { ...known.notice, label: fresh.label, detail: fresh.detail, target: fresh.target },
        });
      }

      for (const fresh of events) {
        const known = stored.get(fresh.id);
        if (known !== undefined && known.until > tick) continue;

        stored.set(fresh.id, { until: tick + NOTICE_FRESH_TICKS, notice: noticeOf(fresh, tick, false) });
      }

      // A bounded history: the oldest events fall off, and the conditions stay.
      const history = [...stored.values()].filter((entry) => !entry.notice.persistent)
        .sort((left, right) => right.notice.raised - left.notice.raised);
      for (const old of history.slice(NOTICE_HISTORY)) stored.delete(old.notice.id);

      return list();
    },

    lose(id) {
      const known = stored.get(id);
      if (known === undefined || known.notice.target === null) return false;

      stored.set(id, { ...known, notice: { ...known.notice, lost: true } });

      return true;
    },

    entries: list,
  };

  /** The journal's entries: the conditions first, then the events, newest first. */
  function list(): readonly Notice[] {
    const all = [...stored.values()].map((entry) => entry.notice);
    const conditions = all.filter((notice) => notice.persistent);
    const events = all.filter((notice) => !notice.persistent).sort((left, right) => right.raised - left.raised);

    return [...conditions, ...events];
  }

  /** The conditions that are true now, as the journal will hold them. */
  function conditionsNow(visible: EconomyVisible | SiegeVisible, tick: number): readonly Fresh[] {
    const fresh: Fresh[] = [];

    for (const squad of visible.squads) {
      for (const condition of squadConditions(squad)) {
        fresh.push(conditionNotice(squad, condition));
      }
    }

    const boundary = nextBoundary(visible.season, tick);
    if (visible.season === 'autumn' && boundary.ticks <= WINTER_WARNING_TICKS) {
      fresh.push({
        id: 'condition:winter',
        kind: 'winter',
        label: translate('notice.winter'),
        detail: message('notice.seconds', { seconds: Math.ceil(boundary.ticks / TICK_HZ) }),
        target: null,
      });
    }

    if (hasFronts(visible)) {
      for (const front of visible.fronts) {
        const settlement = visible.settlements.find((candidate) => candidate.id === front.settlement);
        if (settlement === undefined) continue;
        if (front.besieger === null || front.siege !== 'blockade') continue;

        fresh.push({
          id: `condition:blockade:${String(front.settlement)}`,
          kind: 'blockade',
          label: message('notice.blockade', { name: settlementName(settlement.id) }),
          detail: null,
          target: { kind: 'settlement', id: settlement.id, x: settlement.x, y: settlement.y },
        });
      }
    }

    return fresh;
  }

  /**
   * The events this read shows that the last one did not: a refusal that appeared,
   * a rout that began, a Season's pay that was missed, an enemy that came to
   * grips, a Squad that left the field, and a Siege that opened or changed path.
   *
   * The previous read is handed in rather than updated again, because an event is
   * a *change*: reading twice in one tick must not report the same change twice
   * (`read` is called on every redraw).
   */
  function eventsNow(
    visible: EconomyVisible | SiegeVisible,
    beforeSquads: ReadonlyMap<number, Seen>,
    beforeFronts: ReadonlyMap<number, string | null>,
    beforeWorks: ReadonlyMap<string, number>,
  ): readonly Fresh[] {
    const fresh: Fresh[] = [];

    if (hasFronts(visible)) {
      for (const enemy of visible.enemies) {
        if (spotted.has(enemy.id)) continue;
        spotted.add(enemy.id);
        fresh.push({ id: `event:contact:${String(enemy.id)}`, kind: 'contact',
          label: translate(enemy.neutral === true ? 'notice.barbarianContact' : 'notice.contact'), detail: null,
          target: { kind: 'contact', id: enemy.id, x: enemy.x, y: enemy.y } });
      }
    }

    for (const site of visible.settlements) {
      const damaged = site.works.some((work, index) => {
        const key = `${String(site.id)}:${work.building}:${String(work.ordinal ?? index)}`;
        const before = beforeWorks.get(key);
        return before !== undefined && work.hp !== undefined && work.hp < before;
      });
      if (damaged) fresh.push({ id: `event:workDamage:${String(site.id)}`, kind: 'workDamage',
        label: message('notice.workDamage', { name: settlementName(site.id) }), detail: null,
        target: { kind: 'settlement', id: site.id, x: site.x, y: site.y } });
    }

    for (const squad of visible.squads) {
      const before = beforeSquads.get(squad.id);
      if (before === undefined) continue;

      const name = squadName(squad);
      const target = squadTarget(squad);

      if (before.refused !== squad.refused && squad.refused !== null) {
        fresh.push({
          id: `event:refusal:${String(squad.id)}`,
          kind: 'refusal',
          label: message('notice.refusal', { name, reason: refusalLabel(squad.refused) }),
          detail: null,
          target,
        });
      }
      if (!before.routing && squad.routing) {
        fresh.push({ id: `event:routing:${String(squad.id)}`, kind: 'routing', label: message('notice.routing', { name }), detail: null, target });
      }
      if (before.unpaid < squad.unpaid) {
        fresh.push({
          id: `event:unpaid:${String(squad.id)}`,
          kind: 'unpaid',
          label: message('notice.unpaid', { name }),
          detail: message('notice.seasons', { count: squad.unpaid }),
          target,
        });
      }
      if (!before.engaged && squad.engaged) {
        fresh.push({ id: `event:engaged:${String(squad.id)}`, kind: 'engaged', label: message('notice.engaged', { name }), detail: null, target });
      }
    }

    for (const id of beforeSquads.keys()) {
      if (visible.squads.some((squad) => squad.id === id)) continue;

      fresh.push({
        id: `event:loss:${String(id)}`,
        kind: 'loss',
        label: message('notice.loss', { name: translate('ui.squad') }),
        detail: `#${String(id)}`,
        target: null,
      });
    }

    if (hasFronts(visible)) {
      for (const front of visible.fronts) {
        const settlement = visible.settlements.find((candidate) => candidate.id === front.settlement);
        if (settlement === undefined) continue;

        const before = beforeFronts.get(front.settlement);
        const now = front.siege;
        if (before === undefined || before === now || now === null) continue;

        fresh.push({
          id: `event:siege:${String(front.settlement)}`,
          kind: 'siege',
          label: message('notice.siege', { name: settlementName(settlement.id) }),
          detail: translate(now === 'assault' ? 'cmd.assault' : 'cmd.blockade'),
          target: { kind: 'settlement', id: settlement.id, x: settlement.x, y: settlement.y },
        });
      }
    }

    return fresh;
  }
}

/** What the journal remembers of a Squad between two reads. */
function seenOf(squad: VisibleSquad): Seen {
  return { routing: squad.routing, refused: squad.refused, unpaid: squad.unpaid, engaged: squad.engaged };
}

/** A stored notice from what the journal derived. */
function noticeOf(fresh: Fresh, tick: number, persistent: boolean): Notice {
  return { ...fresh, persistent, raised: tick, lost: false };
}

/** The condition a Squad is in, as a notice with its own stable key. */
function conditionNotice(squad: VisibleSquad, condition: SquadCondition): Fresh {
  const target = squadTarget(squad);
  const name = squadName(squad);
  const morale = moraleOf(squad);

  switch (condition) {
    case 'routing':
      return { id: `condition:routing:${String(squad.id)}`, kind: 'routing', label: message('notice.routing', { name }), detail: null, target };
    case 'lowMorale':
      return {
        id: `condition:lowMorale:${String(squad.id)}`,
        kind: 'morale',
        label: message('notice.morale', { name }),
        detail: `${String(morale.morale)}/${String(morale.max)}`,
        target,
      };
    case 'unpaid':
      return {
        id: `condition:unpaid:${String(squad.id)}`,
        kind: 'unpaid',
        label: message('notice.unpaid', { name }),
        detail: message('notice.seasons', { count: squad.unpaid }),
        target,
      };
    case 'noSupply':
      return { id: `condition:noSupply:${String(squad.id)}`, kind: 'supply', label: message('notice.supply', { name }), detail: null, target };
    case 'fatigue':
      return {
        id: `condition:fatigue:${String(squad.id)}`,
        kind: 'fatigue',
        label: message('notice.fatigue', { name }),
        detail: `${String(squad.fatigue)}/${String(FATIGUE_MAX)}`,
        target,
      };
    case 'noAmmunition':
      return { id: `condition:noAmmunition:${String(squad.id)}`, kind: 'ammunition', label: message('notice.ammunition', { name }), detail: '0', target };
  }
}

/** A Squad's name for a notice: its type and its id, which the list also reads. */
function squadName(squad: VisibleSquad): string {
  return message('ui.listItem', { name: squadLabel(squad.type), id: squad.id });
}

/** Where a Squad is, for a notice a click can centre. */
function squadTarget(squad: VisibleSquad): NoticeTarget {
  return { kind: 'squad', id: squad.id, x: squad.x, y: squad.y };
}

/** A settlement's name for a notice: its kind and its id. */
function settlementName(id: number): string {
  return message('ui.listItem', { name: translate('ui.settlement'), id });
}

/** Whether an Observation is the Siege's own, which is what carries fronts. */
function hasFronts(visible: EconomyVisible | SiegeVisible): visible is SiegeVisible {
  return 'fronts' in visible;
}
