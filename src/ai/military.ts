import type { ObservedSettlement } from '../content/settlement-appearance.ts';
import type { Observation } from '../sim/observation.ts';
import type { Season } from './calendar.ts';
import { atHalfStrength, type Behaviour, type Candidate } from './registry.ts';
import { planningContacts, permittedContacts, type Contact } from './contacts.ts';
import { DIFFICULTY, attackPercent, type Difficulty } from './difficulty.ts';
import { distance, type Site } from './site.ts';
import type { AssaultObservation, AssaultReadiness } from './assault.ts';
import { restingAtHome, returningHome } from './recovery.ts';

type Faction = Observation<unknown>['faction'];

interface Enemy extends Site {
  readonly id: number; readonly type: string; readonly neutral?: boolean;
  readonly appearance?: { readonly men: number };
}
interface Squad extends Enemy {
  readonly men: number;
  /** The men it was recruited with: what its survivors and its power are read against. */
  readonly capacity: number;
  readonly morale: number;
  readonly fatigue: number;
  readonly inCamp?: boolean;
  readonly inQuarters?: boolean;
  readonly routing: boolean;
  readonly engaged: boolean;
  readonly garrison: number | null;
  readonly goal: Site | null;
  readonly refused?: string | null;
  readonly passage?: { readonly settlement: number; readonly phase: string };
}

export interface MilitaryObservation {
  readonly fog?: { readonly terrain: Uint8Array };
  readonly appearances?: readonly ObservedSettlement[];
  readonly year: number;
  readonly season: Season;
  readonly settlements: readonly (Site & { readonly id: number })[];
  readonly squads: readonly Squad[];
  readonly enemies: readonly Enemy[];
  readonly contacts?: readonly Contact[];
  readonly fronts?: AssaultObservation['fronts'];
}

interface MilitaryType {
  readonly id: string;
  readonly strength: number;
  /** What one of its men is worth in a blow, against one man of the line (#66). */
  readonly impact: number;
  readonly morale: number;
  readonly arm: string;
}

interface MilitaryContent {
  readonly mapWidth?: number;
  readonly impassableTerrain?: readonly number[];
  readonly settlementRadius?: number;
  readonly canContinueAssault?: AssaultReadiness;
  readonly squadTypes: readonly MilitaryType[];
  readonly matchup: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fatigueMax: number;
  readonly ticksPerSecond: number;
}

/**
 * The slice of an economy Observation recruitment reads: the enemy composition
 * it answers. Stated here rather than imported from `economy.ts`, so the
 * military module depends on no other behaviour and can be registered alone.
 */
interface RecruitmentObservation {
  readonly visible: { readonly enemies?: readonly { readonly type: string }[] };
}

/** Recruitment adjusts only preference; the economy retains all affordability gates. */
export function createMilitaryRecruitment(content: MilitaryContent) {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  return (observation: RecruitmentObservation, typeId: string) => {
    const type = types.get(typeId);
    const observed = (observation.visible.enemies ?? []).flatMap((enemy) => {
      const known = types.get(enemy.type);
      return known === undefined ? [] : [known];
    });
    const score = observed.reduce((sum, enemy) => {
      const matchup = type === undefined ? 'neutral' : content.matchup[type.arm]?.[enemy.arm];
      return sum + (matchup === 'advantage' ? 30 : matchup === 'disadvantage' ? -30 : 0);
    }, 0);
    return { utility: observed.length === 0 ? 0 : Math.floor(score / observed.length),
      reason: observed.length === 0 ? 'No enemy composition observed; retain the balanced roster.'
        : `Answer observed composition [${observed.map((enemy) => enemy.id).sort().join(', ')}] with ${typeId}.`,
    };
  };
}

type MilitaryCommand = {
  readonly kind: 'hold' | 'withdraw'; readonly faction: Faction; readonly squads: readonly number[];
} | {
  readonly kind: 'attack'; readonly faction: Faction; readonly squads: readonly number[]; readonly target: number;
} | {
  readonly kind: 'move'; readonly faction: Faction; readonly squads: readonly number[]; readonly x: number; readonly y: number;
};

/** The side of the threat map, in tiles, that one region covers. */
const REGION_SIZE = 16;

/** How far from an owned settlement an enemy still counts as threatening it, in tiles. */
const DEFENCE_RADIUS = 12;

/** How close two bodies have to be to count as in contact, in tiles. */
const CONTACT_RADIUS = 4;

/** The scale a power or margin is stated on: a hundred is parity. */
const PERCENT = 100;

/** The divisor of nominal morale or strength below which a Squad counts as spent. */
const SPENT_DIVISOR = 2;

/** The fatigue scale: a fresh Squad keeps its whole power, a spent one half. */
const FATIGUE_SCALE = 2;

/** Only public content and the looking Faction's Observation enter this policy. */
export function createMilitaryBehaviour(content: MilitaryContent, difficulty: Difficulty = DIFFICULTY.centurio):
Behaviour<MilitaryObservation, MilitaryCommand> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  const margin = attackPercent(difficulty);
  const fresh = FATIGUE_SCALE * content.fatigueMax;
  /**
   * What an enemy the roster cannot name is priced at: the strongest body the
   * public roster holds, at full nominal nerve, in the same units as a named one.
   *
   * A type is a compile-time id, so this is a raised code reaching a Controller
   * and not an ordinary fight; pricing it at nothing would have a general march
   * into a force he cannot read, and the roster's worst case is the conservative
   * answer.
   */
  const unknown = content.squadTypes.reduce(
    (worst, type) => Math.max(worst, type.strength * type.impact * type.morale * PERCENT),
    0,
  );
  /**
   * What one of its own Squads is worth: its bearing, its nerve and how fresh it
   * is, all of them facts in its own Observation.
   */
  function power(squad: Squad, fatigue = squad.fatigue): number {
    const type = types.get(squad.type);
    if (type === undefined) return 0;

    return Math.floor((squad.men * type.impact * squad.morale * PERCENT * (fresh - fatigue)) / fresh);
  }
  // An approach from outside contact must carry its march, rather than being
  // funded with rested power that triggers an immediate withdrawal on arrival.
  const approachPower = (squad: Squad, target: Site) =>
    power(squad, distance(squad, target) > CONTACT_RADIUS ? content.fatigueMax : squad.fatigue);
  /** Current appearances expose headcount (ADR-0029), but never morale or fatigue.
   * Remembered contacts carry no appearance and use the conservative roster size. */
  const enemyPower = (enemy: Enemy) => {
    const type = types.get(enemy.type);

    return type === undefined ? unknown : (enemy.appearance?.men ?? type.strength) * type.impact * type.morale * PERCENT;
  };
  function spent(squad: Squad, observation: Observation<MilitaryObservation>): boolean {
    const type = types.get(squad.type);
    return type === undefined || atHalfStrength(squad) || (squad.morale * SPENT_DIVISOR <= type.morale &&
      !content.canContinueAssault?.(observation.faction, observation.visible, squad));
  }

  return {
    id: 'military',
    tactical: ({ observation }) => {
      const { visible, faction } = observation;
      const remembered = planningContacts(permittedContacts(visible), observation.tick, content.ticksPerSecond)
        .filter((contact) => contact.kind === 'squad' && !visible.enemies.some((enemy) => enemy.id === contact.id))
        .map((contact) => ({ ...contact, type: contact.type ?? 'unknown' }));
      const squads = visible.squads.filter((squad) => !squad.routing && squad.garrison === null)
        .sort((a, b) => a.id - b.id);
      const regions = new Map<string, { friendly: number; enemy: number; threat: number }>();
      function region(site: Site) {
        const id = `${Math.floor(site.x / REGION_SIZE)},${Math.floor(site.y / REGION_SIZE)}`;
        if (!regions.has(id)) regions.set(id, { friendly: 0, enemy: 0, threat: 0 });
        return regions.get(id)!;
      }
      for (const settlement of visible.settlements) region(settlement);
      for (const squad of squads) region(squad).friendly += power(squad);
      for (const enemy of visible.enemies) region(enemy).enemy += enemyPower(enemy);
      for (const contact of remembered) region(contact).enemy += enemyPower(contact);
      const defence = visible.settlements.map((settlement) => {
        const enemies = visible.enemies.filter((enemy) => Math.max(0, distance(enemy, settlement) - (content.settlementRadius ?? 0)) <= DEFENCE_RADIUS);
        const area = region(settlement);
        area.threat = Math.max(area.threat, enemies.reduce((sum, enemy) => sum + enemyPower(enemy), 0));
        return { settlement, enemies, area };
      });
      for (const area of regions.values()) area.threat = Math.max(area.threat, area.enemy);
      defence.sort((a, b) => Math.max(0, b.area.threat - b.area.friendly) - Math.max(0, a.area.threat - a.area.friendly)
        || b.area.threat - a.area.threat || a.settlement.id - b.settlement.id);
      const assessment = [...regions].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([id, value]) => `region ${id}: friendly ${value.friendly}, threat ${value.threat}, deficit ${Math.max(0, value.threat - value.friendly)}`)
        .join('; ') || 'No occupied regions.';
      const commands: MilitaryCommand[] = [];
      const reasons: string[] = [];
      const assigned = new Set<number>();
      let withdrawing = false;
      let committed = false;
      const fallingBack = (squad: Squad) => returningHome(squad, visible.settlements);
      // Decide support eligibility before local engagements: men who are leaving
      // or have lost their ability to fight cannot keep another Squad in contact.
      const supportSquads = squads.filter((squad) => !spent(squad, observation) && !fallingBack(squad));
      const ready = squads.filter((squad) => {
        const returning = fallingBack(squad);
        if (returning && !squad.engaged) {
          assigned.add(squad.id);
          reasons.push(`Squad ${squad.id} continues its withdrawal to friendly quarters.`);
          return false;
        }
        const exhausted = spent(squad, observation);
        const enemies = visible.enemies.filter((enemy) => distance(squad, enemy) <= CONTACT_RADIUS);
        const defendingHome = defence.some((task) => (squad.inQuarters ?? squad.inCamp ?? distance(squad, task.settlement) === 0) && task.enemies.length > 0);
        if (!squad.engaged && !defendingHome &&
          restingAtHome(squad, visible.settlements, types.get(squad.type)?.morale ?? 0)) {
          assigned.add(squad.id);
          reasons.push(`Squad ${squad.id} recovers its full morale in friendly quarters before another campaign.`);
          return false;
        }
        const support = supportSquads.filter((other) => distance(squad, other) <= CONTACT_RADIUS)
          .reduce((sum, other) => sum + power(other), 0);
        const threat = enemies.reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        const lost = threat > support;
        if (!exhausted && !lost) return true;
        assigned.add(squad.id);
        const sheltered = squad.inQuarters ?? squad.inCamp ?? visible.settlements.some((settlement) => distance(squad, settlement) === 0);
        // A healthy scout can step away from a local neutral threat without
        // committing to a long trip home. Candidate destinations must be known
        // and traversable; ordinary movement rules still validate the route.
        const width = content.mapWidth;
        const terrain = visible.fog?.terrain;
        const neutralThreat = !exhausted && !squad.engaged && enemies.length > 0 && enemies.every((enemy) => enemy.neutral === true);
        if (neutralThreat && width !== undefined && terrain !== undefined && squad.refused == null) {
          const separation = (site: Site) => Math.min(...enemies.map((enemy) => distance(site, enemy)));
          if (squad.goal !== null && separation(squad.goal) > separation(squad)) {
            reasons.push(`Squad ${squad.id} continues its local withdrawal from a neutral threat.`);
            return false;
          }
          const height = terrain.length / width;
          const currentDistance = separation(squad);
          const candidates: Site[] = [];
          for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [-3, 3], [3, -3], [3, 3]] as const) {
            const x = squad.x + dx, y = squad.y + dy;
            if (x < 0 || y < 0 || x >= width || y >= height) continue;
            const tile = terrain[y * width + x];
            if (tile === undefined || content.impassableTerrain?.includes(tile) === true) continue;
            if (separation({ x, y }) > currentDistance) candidates.push({ x, y });
          }
          candidates.sort((a, b) => separation(b) - separation(a) || a.y - b.y || a.x - b.x);
          const safe = candidates[0];
          if (safe !== undefined) {
            commands.push({ kind: 'move', faction, squads: [squad.id], ...safe });
            reasons.push(`Squad ${squad.id} steps away from a neutral threat on observed ground.`);
            return false;
          }
        }
        if (squad.engaged || (!returning && (enemies.length > 0 || (exhausted && !sheltered)))) {
          commands.push({ kind: 'withdraw', faction, squads: [squad.id] });
          reasons.push(`Withdraw Squad ${squad.id}: strength ${squad.men}, morale ${squad.morale}, local power ${support} against ${threat}; recover in friendly quarters rather than remain spent in the field.`);
          withdrawing = true;
        }
        return false;
      });
      const reserve = ready.length > 1 ? ready.filter((squad) => !squad.engaged).at(-1) : undefined;
      const allocationOrder = [...ready.filter((squad) => squad !== reserve), ...(reserve === undefined ? [] : [reserve])];
      function assign(squad: Squad, target: Enemy, reserveReason: string, approaching = false): number {
        commands.push({ kind: 'attack', faction, squads: [squad.id], target: target.id });
        assigned.add(squad.id);
        if (squad === reserve) {
          committed = true;
          reasons.push(`Commit reserve ${squad.id} ${reserveReason}`);
        }
        return approaching ? approachPower(squad, target) : power(squad);
      }
      const covered = new Set<number>();
      for (const task of defence) {
        const { settlement } = task;
        const enemies = task.enemies.filter((enemy) => !covered.has(enemy.id));
        if (enemies.length === 0) continue;
        const threat = enemies.reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        const available = ready.filter((squad) => !assigned.has(squad.id)).reduce((sum, squad) =>
          sum + approachPower(squad, [...enemies].sort((a, b) =>
            distance(squad, a) - distance(squad, b) || a.id - b.id)[0]!), 0);
        if (available < threat) {
          reasons.push(`Decline engagement at settlement ${settlement.id}: available ${available} against observed threat ${threat}. Retain the remaining line.`);
          continue;
        }
        let allocated = 0;
        for (const squad of allocationOrder) {
          if (assigned.has(squad.id) || allocated >= threat) continue;
          const target = [...enemies].sort((a, b) => distance(squad, a) - distance(squad, b) || a.id - b.id)[0]!;
          allocated += assign(squad, target, `to settlement ${settlement.id}: the line alone cannot cover threat ${threat}.`, true);
        }
        reasons.push(`Defend settlement ${settlement.id}: observed threat ${threat}, allocation ${allocated}.`);
        for (const enemy of enemies) covered.add(enemy.id);
      }
      for (const target of [...visible.enemies].sort((a, b) => a.id - b.id)) {
        if (covered.has(target.id)) continue;
        const line = ready.filter((squad) => squad !== reserve && !assigned.has(squad.id) && distance(squad, target) <= CONTACT_RADIUS);
        const threat = visible.enemies.filter((enemy) => distance(enemy, target) <= CONTACT_RADIUS)
          .reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        let available = line.reduce((sum, squad) => sum + power(squad), 0);
        if (available * PERCENT < threat * margin && reserve !== undefined && !assigned.has(reserve.id) && distance(reserve, target) <= CONTACT_RADIUS) {
          const reinforced = available + power(reserve);
          if (reinforced * PERCENT >= threat * margin) {
            line.push(reserve);
            available = reinforced;
          }
        }
        if (available * PERCENT < threat * margin) continue;
        let allocated = 0;
        for (const squad of line) {
          if (allocated * PERCENT >= threat * margin) break;
          allocated += assign(squad, target, `against observed enemy ${target.id}: reinforce a winnable field engagement.`);
        }
        reasons.push(`Attack observed weakness ${target.id}: line ${available} against threat ${threat}.`);
      }
      if (reserve !== undefined && !assigned.has(reserve.id)) {
        commands.push({ kind: 'hold', faction, squads: [reserve.id] });
        reasons.push(`Retain reserve ${reserve.id}.`);
      }
      // A remembered enemy is a place to investigate, never a live attack id.
      // Keep the reserve and require a favourable line before committing.
      for (const contact of remembered.sort((a, b) => b.seen - a.seen || a.id - b.id)) {
        const line = ready.filter((squad) => squad !== reserve && !assigned.has(squad.id));
        const threat = remembered.filter((enemy) => distance(enemy, contact) <= CONTACT_RADIUS)
          .reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        if (line.reduce((sum, squad) => sum + power(squad), 0) * PERCENT < threat * margin) continue;
        let allocated = 0;
        for (const squad of line) {
          if (allocated * PERCENT >= threat * margin) break;
          commands.push({ kind: 'move', faction, squads: [squad.id], x: contact.x, y: contact.y });
          assigned.add(squad.id);
          allocated += power(squad);
        }
        reasons.push(`Investigate last-known enemy ${contact.id} at (${contact.x}, ${contact.y}), seen tick ${contact.seen}; no live target assumed.`);
      }
      for (const squad of ready) {
        if (squad === reserve || assigned.has(squad.id)) continue;
        commands.push({ kind: 'hold', faction, squads: [squad.id] });
      }
      const candidates: Candidate<MilitaryCommand>[] = [
        { id: 'threat-map', utility: 1, reason: assessment, commands: [] },
        { id: withdrawing ? 'withdraw' : committed ? 'commit-reserve' : 'defend', utility: 20,
          reason: reasons.join(' ') || 'Hold the line; no observed threat.', commands },
      ];
      return candidates;
    },
  };
}
