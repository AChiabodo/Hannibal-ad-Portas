import type { Observation } from '../sim/observation.ts';
import type { Behaviour, Candidate } from './registry.ts';
import type { EconomyObservation } from './economy.ts';
import { planningContacts, type Contact } from './scouting.ts';

type Faction = Observation<unknown>['faction'];
interface Site { readonly x: number; readonly y: number }
interface Enemy extends Site { readonly id: number; readonly type: string }
interface Squad extends Enemy {
  readonly men: number;
  readonly morale: number;
  readonly fatigue: number;
  readonly routing: boolean;
  readonly engaged: boolean;
  readonly garrison: number | null;
  readonly goal: Site | null;
}

export interface MilitaryObservation {
  readonly year: number;
  readonly season: string;
  readonly settlements: readonly (Site & { readonly id: number })[];
  readonly squads: readonly Squad[];
  readonly enemies: readonly Enemy[];
  readonly contacts?: readonly Contact[];
}

interface MilitaryType {
  readonly id: string;
  readonly strength: number;
  readonly morale: number;
  readonly arm: string;
}

interface MilitaryContent {
  readonly squadTypes: readonly MilitaryType[];
  readonly matchup: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly fatigueMax: number;
  readonly ticksPerSecond: number;
}

/** Recruitment adjusts only preference; the economy retains all affordability gates. */
export function createMilitaryRecruitment(content: MilitaryContent) {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  return (observation: Observation<EconomyObservation>, typeId: string) => {
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

const REGION_SIZE = 16;
const DEFENCE_RADIUS = 12;

function distance(a: Site, b: Site): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Only public content and the looking Faction's Observation enter this policy. */
export function createMilitaryBehaviour(content: MilitaryContent):
Behaviour<MilitaryObservation, MilitaryCommand> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  const enemyPower = (enemy: Enemy) => (types.get(enemy.type)?.morale ?? 10) * 100;
  function power(squad: Squad): number {
    const type = types.get(squad.type);
    return type === undefined ? 0 : Math.floor(squad.men * squad.morale * 100 *
      (2 * content.fatigueMax - squad.fatigue) / (type.strength * 2 * content.fatigueMax));
  }
  function spent(squad: Squad): boolean {
    const type = types.get(squad.type);
    return type === undefined || squad.morale * 2 <= type.morale || squad.men * 2 <= type.strength;
  }

  return {
    id: 'military',
    tactical: ({ observation }) => {
      const { visible, faction } = observation;
      const remembered = planningContacts(visible.contacts ?? [], observation.tick, content.ticksPerSecond)
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
        const enemies = visible.enemies.filter((enemy) => distance(enemy, settlement) <= DEFENCE_RADIUS);
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
      const fallingBack = (squad: Squad) => squad.goal !== null && visible.settlements.some((settlement) =>
        squad.goal!.x === settlement.x && squad.goal!.y === settlement.y);
      // Decide support eligibility before local engagements: men who are leaving
      // or have lost their ability to fight cannot keep another Squad in contact.
      const supportSquads = squads.filter((squad) => !spent(squad) && !fallingBack(squad));
      const ready = squads.filter((squad) => {
        const returning = fallingBack(squad);
        if (returning && !squad.engaged) {
          assigned.add(squad.id);
          reasons.push(`Squad ${squad.id} continues its withdrawal to friendly quarters.`);
          return false;
        }
        const exhausted = spent(squad);
        const enemies = visible.enemies.filter((enemy) => distance(squad, enemy) <= 4);
        const support = supportSquads.filter((other) => distance(squad, other) <= 4)
          .reduce((sum, other) => sum + power(other), 0);
        const threat = enemies.reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        const lost = threat > support;
        if (!exhausted && !lost) return true;
        assigned.add(squad.id);
        if (squad.engaged || (!returning && enemies.length > 0)) {
          commands.push({ kind: 'withdraw', faction, squads: [squad.id] });
          reasons.push(`Withdraw Squad ${squad.id}: strength ${squad.men}, morale ${squad.morale}, local power ${support} against ${threat}; do not reinforce a lost engagement.`);
          withdrawing = true;
        }
        return false;
      });
      const reserve = ready.length > 1 ? ready.filter((squad) => !squad.engaged).at(-1) : undefined;
      const allocationOrder = [...ready.filter((squad) => squad !== reserve), ...(reserve === undefined ? [] : [reserve])];
      function assign(squad: Squad, target: Enemy, reserveReason: string): number {
        commands.push({ kind: 'attack', faction, squads: [squad.id], target: target.id });
        assigned.add(squad.id);
        if (squad === reserve) {
          committed = true;
          reasons.push(`Commit reserve ${squad.id} ${reserveReason}`);
        }
        return power(squad);
      }
      const covered = new Set<number>();
      for (const task of defence) {
        const { settlement } = task;
        const enemies = task.enemies.filter((enemy) => !covered.has(enemy.id));
        if (enemies.length === 0) continue;
        const threat = enemies.reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        const available = ready.filter((squad) => !assigned.has(squad.id)).reduce((sum, squad) => sum + power(squad), 0);
        if (available < threat) {
          reasons.push(`Decline engagement at settlement ${settlement.id}: available ${available} against observed threat ${threat}. Retain the remaining line.`);
          continue;
        }
        let allocated = 0;
        for (const squad of allocationOrder) {
          if (assigned.has(squad.id) || allocated >= threat) continue;
          const target = [...enemies].sort((a, b) => distance(squad, a) - distance(squad, b) || a.id - b.id)[0]!;
          allocated += assign(squad, target, `to settlement ${settlement.id}: the line alone cannot cover threat ${threat}.`);
        }
        reasons.push(`Defend settlement ${settlement.id}: observed threat ${threat}, allocation ${allocated}.`);
        for (const enemy of enemies) covered.add(enemy.id);
      }
      for (const target of [...visible.enemies].sort((a, b) => a.id - b.id)) {
        if (covered.has(target.id)) continue;
        const line = ready.filter((squad) => squad !== reserve && !assigned.has(squad.id) && distance(squad, target) <= 4);
        const threat = visible.enemies.filter((enemy) => distance(enemy, target) <= 4)
          .reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        let available = line.reduce((sum, squad) => sum + power(squad), 0);
        if (available * 4 < threat * 5 && reserve !== undefined && !assigned.has(reserve.id) && distance(reserve, target) <= 4) {
          const reinforced = available + power(reserve);
          if (reinforced * 4 >= threat * 5) {
            line.push(reserve);
            available = reinforced;
          }
        }
        if (available * 4 < threat * 5) continue;
        let allocated = 0;
        for (const squad of line) {
          if (allocated * 4 >= threat * 5) break;
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
        const threat = remembered.filter((enemy) => distance(enemy, contact) <= 4)
          .reduce((sum, enemy) => sum + enemyPower(enemy), 0);
        if (line.reduce((sum, squad) => sum + power(squad), 0) * 4 < threat * 5) continue;
        let allocated = 0;
        for (const squad of line) {
          if (allocated * 4 >= threat * 5) break;
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
