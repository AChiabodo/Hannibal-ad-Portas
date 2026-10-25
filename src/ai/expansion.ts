import type { Observation } from '../sim/observation.ts';
import type { Season } from './calendar.ts';
import { planningContacts, type Contact } from './contacts.ts';
import { atHalfStrength, type Behaviour } from './registry.ts';
import { restingAtHome } from './recovery.ts';
import { distance, type Site } from './site.ts';

type Faction = Observation<unknown>['faction'];

/** Do not invest in a village whose observed approaches are threatened. */
const APPROACH_RADIUS = 12;
/** A body already facing a nearby enemy belongs to the field. */
const CONTACT_RADIUS = 4;

interface ExpansionObservation {
  readonly year: number;
  readonly season: Season;
  readonly settlements: readonly (Site & { readonly id: number })[];
  readonly contacts: readonly Contact[];
  readonly enemies: readonly Site[];
  readonly fronts: readonly { readonly settlement: number; readonly garrison: number }[];
  readonly squads: readonly (Site & {
    readonly id: number; readonly type: string; readonly men: number; readonly capacity: number;
    readonly morale: number; readonly routing: boolean; readonly engaged: boolean;
    readonly garrison: number | null; readonly goal: Site | null;
  })[];
}

type ExpansionCommand = { readonly kind: 'move'; readonly faction: Faction;
  readonly squads: readonly number[]; readonly x: number; readonly y: number };

/** Invest in observed open settlements when the main siege cannot be sustained. */
export function createExpansionBehaviour(content: {
  readonly ticksPerSecond: number;
  readonly squadTypes: readonly { readonly id: string; readonly morale: number }[];
}): Behaviour<ExpansionObservation, ExpansionCommand> {
  const types = new Map(content.squadTypes.map((type) => [type.id, type]));
  return { id: 'expansion', tactical: ({ observation }) => {
    const { visible, faction, tick } = observation;
    // Give the opening army its first campaign and fund the first Payroll
    // before diverting a detachment into a second economy.
    if (visible.year === 1 && visible.season === 'spring') return [];
    const contacts = planningContacts(visible.contacts, tick, content.ticksPerSecond);
    if (!contacts.some((contact) => contact.kind === 'stronghold')) return [];
    const targets = contacts.filter((contact) => contact.kind === 'settlement' &&
      !visible.settlements.some((home) => home.id === contact.id) &&
      !visible.fronts.some((front) => front.settlement === contact.id && front.garrison > 0) &&
      !visible.enemies.some((enemy) => distance(enemy, contact) <= APPROACH_RADIUS) &&
      !contacts.some((enemy) => enemy.kind === 'squad' && distance(enemy, contact) <= APPROACH_RADIUS));
    const squads = visible.squads.filter((squad) => {
      const type = types.get(squad.type);
      return type !== undefined && !squad.routing && !squad.engaged && squad.garrison === null &&
        !atHalfStrength(squad) && squad.morale * 2 > type.morale &&
        !restingAtHome(squad, visible.settlements, type.morale) &&
        !(squad.goal !== null && visible.settlements.some((home) => distance(home, squad.goal!) === 0)) &&
        !visible.enemies.some((enemy) => distance(enemy, squad) <= CONTACT_RADIUS);
    });
    const options = targets.flatMap((target) => squads.map((squad) => ({ target, squad,
      travel: distance(target, squad), continuing: squad.goal !== null && distance(target, squad.goal) === 0 })));
    options.sort((a, b) => Number(b.continuing) - Number(a.continuing) || a.travel - b.travel ||
      a.target.id - b.target.id || a.squad.id - b.squad.id);
    const choice = options[0];
    if (choice === undefined) return [];
    return [{ id: `occupy-${choice.target.id}`, utility: 28,
      reason: `Occupy observed open settlement ${choice.target.id} with Squad ${choice.squad.id}; ` +
        `its sighting is ${tick - choice.target.seen} ticks old. No hidden ownership or defenders assumed.`,
      commands: [{ kind: 'move', faction, squads: [choice.squad.id], x: choice.target.x, y: choice.target.y }] }];
  } };
}
