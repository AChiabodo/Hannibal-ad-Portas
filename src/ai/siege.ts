import type { Observation } from '../sim/observation.ts';
import type { Season } from './calendar.ts';
import { atHalfStrength, type Behaviour, type Candidate } from './registry.ts';
import { planningContacts, type Contact } from './contacts.ts';
import { DIFFICULTY, attackPercent, type Difficulty } from './difficulty.ts';
import { distance, type Site } from './site.ts';
import type { AssaultReadiness } from './assault.ts';

type Faction = Observation<unknown>['faction'];

interface SiegeSquad extends Site {
  readonly id: number;
  readonly type: string;
  readonly men: number;
  /** The men it was recruited with: what its survivors are read against. */
  readonly capacity: number;
  readonly morale: number;
  readonly routing: boolean;
  readonly garrison: number | null;
  readonly goal: Site | null;
}

interface VisibleSiegeFront {
  readonly settlement: number;
  readonly breached: boolean;
  readonly besieger: Faction | null;
  readonly siege?: 'assault' | 'blockade' | null;
  readonly ram: { readonly built: boolean; readonly hp?: number; readonly remaining?: number } | null;
  readonly garrison: number;
  readonly garrisonMen?: number;
}

/** What a siege policy may read: its own army, the ground it has seen, and the walls in front of it. */
export interface SiegeObservation {
  /** The calendar the Controller seam requires of every Observation; the policy reads neither. */
  readonly year: number;
  readonly season: Season;
  readonly treasury: number;
  readonly squads: readonly SiegeSquad[];
  readonly enemies: readonly (Site & { readonly type: string })[];
  readonly contacts: readonly Contact[];
  readonly fronts: readonly VisibleSiegeFront[];
}

/** Content and constants supplied at composition; the AI imports no simulation value. */
export interface SiegeContent {
  readonly canContinueAssault?: AssaultReadiness;
  /** Whether a Faction can assault at all: the ram is Rome's alone (ADR-0008). */
  readonly canAssault: (faction: Faction) => boolean;
  /** What laying a ram down costs from the Faction's one treasury. */
  readonly ramCost: number;
  /** How close a Squad has to be to be at the walls. */
  readonly siegeRadius: number;
  readonly settlementRadius?: number;
  /** How close a field army has to come to threaten the ring. */
  readonly reliefRadius: number;
  /** One unknown garrison's worth of power, for a front whose walls have not been seen. */
  readonly garrisonEstimate: number;
  /** The tick rate the age limits are counted in, shared with the other planning policies. */
  readonly ticksPerSecond: number;
  /**
   * The public roster: nominal strength, what a man is worth in a blow, and
   * nominal morale, for pricing an observed enemy (#66).
   */
  readonly squadTypes: readonly {
    readonly id: string;
    readonly strength: number;
    readonly impact: number;
    readonly morale: number;
  }[];
}

/** The three Commands a siege policy emits; the driver validates them like any other. */
export type SiegeCommand =
  | { readonly kind: 'assault'; readonly faction: Faction; readonly squads: readonly number[]; readonly settlement: number }
  | { readonly kind: 'blockade'; readonly faction: Faction; readonly squads: readonly number[]; readonly settlement: number }
  | { readonly kind: 'withdraw'; readonly faction: Faction; readonly squads: readonly number[] };

/**
 * Lays, sustains and gives up Sieges: the one policy that decides between an
 * Assault and a Blockade and commits the army to a Stronghold.
 *
 * The choice is made on grounds the decision log states: whether the Faction can
 * assault at all (Carthage has no ram, ADR-0008), whether the ram is already at
 * the walls or the treasury can pay for one, whether the walls are breached, and
 * how much power the observed garrison and any relieving army can put up. It is
 * never made on hidden state: the garrison is what the front reports, the relief
 * is what ordinary vision shows, and a Stronghold nobody
 * has seen is not a target at all.
 *
 * Since #66 power is **men brought to bear** — `strength × impact`, priced with
 * nominal figures for an enemy whose headcount is not in the Observation — so a
 * ring of five 24-man Squads is worth the 120 men it is and not five times one of
 * them (ADR-0028). The target is drawn from the same
 * age-limited contact memory the other planning policies read, not from the raw
 * fog list: a sighting that has aged out is history, and no longer grounds for a
 * march. Every decision states how old the sighting it acted on is.
 *
 * A committed siege is re-issued as it stands so the order survives a clock
 * boundary; the route is the same tile, so re-issuing costs the marchers no step
 * (`movement.ts`). When a relieving army arrives the policy either brings in the
 * reserve to match it or withdraws what is already at the walls: it never feeds a
 * losing ring.
 */
export function createSiegeBehaviour(
  content: SiegeContent,
  difficulty: Difficulty = DIFFICULTY.centurio,
): Behaviour<SiegeObservation, SiegeCommand> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  const nominal = (typeId: string) => {
    const type = types.get(typeId);
    return type === undefined ? content.garrisonEstimate : type.strength * type.impact * type.morale;
  };
  const power = (squad: SiegeSquad) => {
    const type = types.get(squad.type);

    return Math.max(0, squad.men * (type?.impact ?? 1) * squad.morale);
  };
  const spent = (squad: SiegeSquad, observation: Observation<SiegeObservation>) => {
    const type = types.get(squad.type);
    return type !== undefined && (atHalfStrength(squad) || (squad.morale * 2 <= type.morale &&
      !content.canContinueAssault?.(observation.faction, observation.visible, squad)));
  };
  const margin = attackPercent(difficulty);

  return {
    id: 'siege',
    tactical: ({ observation }) => {
      const { visible, faction } = observation;
      const contacts = planningContacts(visible.contacts, observation.tick, content.ticksPerSecond);
      const target = contacts.find((contact) => contact.kind === 'stronghold');
      if (target === undefined) return [];
      const front = visible.fronts.find((candidate) => candidate.settlement === target.id);
      const place = { x: target.x, y: target.y };
      const age = observation.tick - target.seen;
      const sighting = `The Stronghold sighting is ${String(age)} ticks old.`;
      /** Every reason ends with the age of the sighting it acted on: the grounds, stated. */
      const stated = (reason: string) => `${reason} ${sighting}`;

      const relief = visible.enemies.filter((enemy) => Math.max(0, distance(enemy, place) - (content.settlementRadius ?? 0)) <= content.reliefRadius);
      const reliefPower = relief.reduce((sum, enemy) => sum + nominal(enemy.type), 0);
      const garrison = front === undefined ? 1 : front.garrison;
      const threat = garrison * content.garrisonEstimate + reliefPower;

      const field = visible.squads.filter((squad) => !squad.routing && squad.garrison === null);
      const atWalls = (squad: SiegeSquad) => Math.max(0, distance(squad, place) - (content.settlementRadius ?? 0)) <= content.siegeRadius ||
        (squad.goal !== null && squad.goal.x === place.x && squad.goal.y === place.y);
      const committed = field.filter(atWalls);
      const reserve = field.filter((squad) => !atWalls(squad) && !spent(squad, observation));
      const willing = (squads: readonly SiegeSquad[]) => squads.filter((squad) => !spent(squad, observation)).map((squad) => squad.id);
      const committedPower = committed.filter((squad) => !spent(squad, observation))
        .reduce((sum, squad) => sum + power(squad), 0);
      const totalPower = committedPower + reserve.reduce((sum, squad) => sum + power(squad), 0);
      const holds = (value: number) => value * 100 >= threat * margin;
      const besieging = committed.length > 0 || front?.besieger === faction;

      if (besieging && !holds(totalPower)) {
        if (committed.length === 0) return [];
        return [candidate('abandon', stated(`Abandon settlement ${String(target.id)}: relief of ${String(reliefPower)} power ` +
          `answers our ${String(committedPower)} and no reserve can match it; withdraw rather than feed it.`),
        [{ kind: 'withdraw', faction, squads: committed.map((squad) => squad.id) }])];
      }

      if (besieging && !holds(committedPower) && willing([...committed, ...reserve]).length > 0) {
        return [candidate('reinforce', stated(`Reinforce settlement ${String(target.id)}: relief of ${String(reliefPower)} power ` +
          `answers our ${String(committedPower)}, so the ${String(reserve.length)}-Squad reserve joins the ring.`),
        [siege(assaultPath(), faction, willing([...committed, ...reserve]), target.id)])];
      }

      if (!besieging && !holds(totalPower)) return [];

      const committedWilling = willing(committed);
      if (besieging && committedWilling.length === 0) return [];
      const assaulting = assaultPath();
      const ids = besieging ? committedWilling : willing(field);
      if (ids.length === 0) return [];

      return [candidate(assaulting ? 'assault' : 'blockade', stated(grounds(assaulting, target.id,
        committedPower + (besieging ? 0 : reserve.reduce((sum, squad) => sum + power(squad), 0)), threat)),
      [siege(assaulting, faction, ids, target.id)])];
      /** Whether this Faction's one path to a walled settlement is the ram. */
      function assaultPath(): boolean {
        if (!content.canAssault(faction)) return false;
        if (front?.breached === true) return true;
        return front?.ram != null || visible.treasury >= content.ramCost;
      }
      /** The stated grounds for the path, with the numbers the decision read. */
      function grounds(assault: boolean, settlement: number, ours: number, theirs: number): string {
        const against = `${String(ours)} power against ${String(theirs)}`;
        if (assault) {
          return front?.breached === true
            ? `Assault settlement ${String(settlement)}: the walls are breached; storm the centre with ${against}.`
            : `Assault settlement ${String(settlement)}: ${faction} has the ram at the walls or can pay ` +
              `${String(content.ramCost)} of ${String(visible.treasury)}; ${against}, and the fast path is worth the blood.`;
        }
        if (!content.canAssault(faction)) {
          return `Blockade settlement ${String(settlement)}: ${faction} has no ram and can never assault (ADR-0008); ` +
            `cut supply and starve it out with ${against}.`;
        }
        return `Blockade settlement ${String(settlement)}: no ram at the walls and ` +
          `${String(visible.treasury)} denarii cannot pay ${String(content.ramCost)}; starve it instead with ${against}.`;
      }
      function siege(assault: boolean, owner: Faction, squads: readonly number[], settlement: number): SiegeCommand {
        return assault ? { kind: 'assault', faction: owner, squads, settlement }
          : { kind: 'blockade', faction: owner, squads, settlement };
      }
    },
  };
}

/** The one candidate a siege decision proposes; utility puts it ahead of the field's own. */
function candidate(id: string, reason: string, commands: readonly SiegeCommand[]): Candidate<SiegeCommand> {
  return { id, utility: 30, reason, commands };
}
