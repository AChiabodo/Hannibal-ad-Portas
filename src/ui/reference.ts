/**
 * The rule descriptions the Encyclopedia reads (#66; the panels are P6's).
 *
 * A Player asking "why is a 24-man Squad worth less than a 120-man one?" or "why
 * could my five Reparti not hold that gate?" is asking a question about the
 * *rules*, and the answer lives in `sim/combat.ts`, `sim/siege.ts` and
 * `content/squads.ts`. This module is the one place that turns those rules into
 * words, so an Encyclopedia panel is a list of entries and not a second
 * hand-written copy of the rules that drifts the first time a constant moves.
 *
 * ## What is here, and what is not
 *
 * Each entry is a title, a body in the Player's language, and a list of **facts**
 * — the whole numbers the body quotes, taken from the constants themselves. A
 * panel prints the body; a test checks the body against the numbers, so a
 * sentence that outlives the rule it describes fails where it is written rather
 * than in front of a Player.
 *
 * Nothing here reads a Match. There is no Observation, no enemy and no world: the
 * descriptions are the same for both Factions in every Match, which is what makes
 * them safe to show and impossible to leak through.
 *
 * ## Why the words are the interface's and the numbers are the rules'
 *
 * A body may only say what a rule does, in the Italian the string table already
 * uses for that idea. It may not promise an outcome — no "assault always works",
 * no "a Blockade falls in three Seasons" — because the rules do not decide
 * outcomes in advance and a reference that did would be the one place in the game
 * telling a Player something untrue.
 */
import { BUILDINGS, PAYROLL_BASIS, recruitCost, payrollBill, SQUAD_TYPES } from '../content/index.ts';
import {
  ASPECT_SHOCK,
  BASE_SHOCK,
  EXCHANGE_TICKS,
  FORMATION_STRIKE,
  POINTS_PER_MAN,
  VOLLEY_SHOCK,
  SUPPLY_MORALE_LOSS,
} from '../sim/combat.ts';
import { SQUAD_VISION, SETTLEMENT_VISION } from '../sim/fog.ts';
import { TICK_HZ } from '../sim/clock.ts';
import {
  BLOCKADE_GRAIN_LOSS,
  BLOCKADE_POPULATION_LOSS,
  BLOCKADE_MORALE_LOSS,
  CAPTURE_HOLDS,
  CAPTURE_TICKS,
  BLOCKADE_PRESSURE_CAP,
  ESCALADE_BEARING,
  ESCALADE_DAMAGE,
  RAM_BEARING_PER_BLOW,
  RAM_COST,
  RAM_BUILD_TICKS,
  WALL_ASSAULT_LOSS,
} from '../sim/siege.ts';
import { RESOURCE_KINDS } from '../sim/map.ts';
import { BASE_HOUSING, BASE_STORAGE, GRAIN_PER_HEAD, HARVEST_YIELD, LAND_RADIUS, LAND_YIELD, MORALE_LOSS_PER_UNPAID_SEASON, POPULATION_GROWTH, STARVATION_LOSS, TAX_PER_DENARIUS, TREASURY_CAP } from '../sim/economy.ts';
import { SEASON_TICKS } from '../sim/season.ts';
import { ATTRITION_PERCENT, ATTRITION_WINTER_PERCENT, ATTRITION_FIELD_WINTER_PERCENT, CAMP_RADIUS, TERRITORY_RADIUS } from '../sim/territory.ts';
import { buildingDescription, resourceBill } from './construction.ts';
import { message, resourceLabel, squadLabel, workLabel, translate, type StringKey } from './strings.ts';

/** The subjects an entry can belong to, in the order an Encyclopedia lists them. */
export type ReferenceSection = 'start' | 'economy' | 'buildings' | 'army' | 'war';

/** Every section, in the order the reference reads. */
export const REFERENCE_SECTIONS: readonly ReferenceSection[] = ['start', 'economy', 'buildings', 'army', 'war'];

/** One whole number an entry quotes, so the sentence can be checked against the rule. */
export interface ReferenceFact {
  /** The Italian label the fact is shown under. */
  readonly label: string;
  /** The value the rule holds. */
  readonly value: number;
}

/** One rule, as the Encyclopedia reads it. */
export interface ReferenceEntry {
  /** A stable id, so a panel can link to one rule. */
  readonly id: string;
  /** The subject it belongs to. */
  readonly section: ReferenceSection;
  /** Its heading, in the Player's language. */
  readonly title: string;
  /** The article, with paragraph and section breaks. */
  readonly body: string;
  /** The numbers the body quotes, from the rules themselves. */
  readonly facts: readonly ReferenceFact[];
}

/**
 * The largest body the roster sells, and the smallest of *that type's* sizes.
 *
 * The entry that says "five 24-man Squads are worth one 120-man Squad" quotes
 * both, and quoting them by hand would be the drift this module exists to
 * prevent: they are read from the table, so a type added at a new size changes
 * the sentence and the test that checks it. The small size is the division the
 * sentence is about — the same type's smallest offer — and not the roster's
 * smallest, which is the Numidian horse's twelve and would make the arithmetic
 * wrong (five twelves are sixty).
 */
const LARGEST_TYPE = SQUAD_TYPES.reduce((largest, type) =>
  type.strength > largest.strength ? type : largest);
const LARGEST_SIZE = LARGEST_TYPE.strength;
const SMALLEST_SIZE = Math.min(...LARGEST_TYPE.sizes);

const SQUAD_GUIDANCE: Readonly<Record<string, StringKey>> = {
  hastati: 'ref.unit.hastati', principes: 'ref.unit.principes', triarii: 'ref.unit.triarii',
  'libyan-spear': 'ref.unit.libyan', gaul: 'ref.unit.gauls', 'iberian-sword': 'ref.unit.iberian',
  'balearic-slinger': 'ref.unit.balearic', 'numidian-horse': 'ref.unit.numidian', elephant: 'ref.unit.elephant',
} as const;

/** One entry per rule, in the order `REFERENCE_SECTIONS` lists their subjects. */
export const REFERENCE_ENTRIES: readonly ReferenceEntry[] = [
  { id: 'first-steps', section: 'start', title: translate('ref.start.title'),
    body: translate('ref.start.body'), facts: [{ label: translate('ui.groups'), value: 9 }] },
  { id: 'capture', section: 'start', title: translate('ref.capture.title'),
    body: message('ref.capture.body', { holds: CAPTURE_HOLDS, seconds: CAPTURE_TICKS / TICK_HZ, territory: TERRITORY_RADIUS }),
    facts: [{ label: translate('ref.capture.title'), value: CAPTURE_TICKS / TICK_HZ }] },
  { id: 'exploration', section: 'start', title: translate('ref.exploration.title'),
    body: message('ref.exploration.body', { squad: SQUAD_VISION, settlement: SETTLEMENT_VISION }),
    facts: [{ label: translate('ref.exploration.title'), value: SQUAD_VISION }] },
  { id: 'supply', section: 'start', title: translate('ref.supply.title'),
    body: message('ref.supply.body', { territory: TERRITORY_RADIUS, morale: SUPPLY_MORALE_LOSS,
      outside: ATTRITION_PERCENT, winter: ATTRITION_WINTER_PERCENT, field: ATTRITION_FIELD_WINTER_PERCENT }),
    facts: [{ label: translate('ref.supply.title'), value: TERRITORY_RADIUS }] },
  { id: 'economic-choices', section: 'start', title: translate('ref.choices.title'),
    body: translate('ref.choices.body'), facts: [{ label: translate('ui.tier'), value: 3 }] },
  { id: 'interface', section: 'start', title: translate('ref.interface.title'),
    body: translate('ref.interface.body'), facts: [{ label: translate('ui.groups'), value: 9 }] },
  { id: 'treasury', section: 'economy', title: translate('ref.treasury.title'),
    body: message('ref.treasury.body', { cap: TREASURY_CAP, tax: TAX_PER_DENARIUS, loss: MORALE_LOSS_PER_UNPAID_SEASON }),
    facts: [{ label: translate('ui.treasury'), value: TREASURY_CAP }] },
  ...RESOURCE_KINDS.map((kind): ReferenceEntry => ({
    id: `resource:${kind}`, section: 'economy', title: resourceLabel(kind),
    body: `${translate((['ref.grain', 'ref.timber', 'ref.stone', 'ref.iron'] as const)[kind]!)}\n\n${message('economy.scopeBody', { cap: TREASURY_CAP })}`,
    facts: [{ label: translate('ui.treasury'), value: TREASURY_CAP }],
  })),
  { id: 'labour', section: 'economy', title: translate('economy.labourTitle'),
    body: message('economy.labourBody', { radius: LAND_RADIUS }),
    facts: [{ label: translate('economy.labourTitle'), value: LAND_RADIUS }] },
  { id: 'seasons', section: 'economy', title: translate('economy.seasonTitle'),
    body: message('economy.seasonBody', { seconds: SEASON_TICKS / TICK_HZ, yield: LAND_YIELD, harvest: HARVEST_YIELD }),
    facts: [{ label: translate('ui.season'), value: SEASON_TICKS / TICK_HZ }] },
  { id: 'population', section: 'economy', title: translate('economy.populationTitle'),
    body: message('economy.populationBody', { housing: BASE_HOUSING, storage: BASE_STORAGE, heads: GRAIN_PER_HEAD,
      growth: POPULATION_GROWTH, loss: STARVATION_LOSS, tax: TAX_PER_DENARIUS }),
    facts: [{ label: translate('ui.population'), value: BASE_HOUSING }] },
  { id: 'latin-economy', section: 'economy', title: translate('ref.latin.title'),
    body: message('ref.latin.body', { villa: BUILDINGS.find((building) => building.id === 'villa')!.labour,
      forum: BUILDINGS.find((building) => building.id === 'forum')!.labour, camp: CAMP_RADIUS }),
    facts: [{ label: translate('work.castrum'), value: CAMP_RADIUS }] },
  { id: 'punic-economy', section: 'economy', title: translate('ref.punic.title'),
    body: translate('ref.punic.body'), facts: [{ label: translate('ui.men'), value: PAYROLL_BASIS }] },
  ...BUILDINGS.map((building): ReferenceEntry => ({
    id: `building:${building.id}`, section: 'buildings', title: workLabel(building.id),
    body: buildingDescription(building),
    facts: [{ label: translate('ui.tier'), value: building.tier },
      { label: translate('ui.population'), value: building.labour }],
  })),
  ...SQUAD_TYPES.map((type): ReferenceEntry => ({
    id: `squad:${type.id}`, section: 'army', title: squadLabel(type.id),
    body: `${translate(SQUAD_GUIDANCE[type.id]!)}\n\n${message('ref.squadTerms', { faction: translate(`faction.${type.faction}`), tier: type.tier,
      sizes: type.sizes.map((size) => message(type.figures === 1 ? 'ref.beastBill' : 'ref.sizeBill', {
        size, cost: resourceBill(recruitCost(type, size)), payroll: payrollBill(type, size) })).join('\n'),
      rate: type.payroll, basis: PAYROLL_BASIS, impact: type.impact,
      morale: type.morale, missiles: type.ammunition, pace: type.pace,
      figures: translate(type.figures === 1 ? 'ref.beast' : 'ref.soldiers') })}`,
    facts: type.sizes.map((size) => ({ label: translate('ui.men'), value: size })),
  })),
  { id: 'commands', section: 'start', title: translate('ref.commandsTitle'),
    body: message('ref.commandsBody', { groups: 9 }), facts: [{ label: translate('ui.groups'), value: 9 }] },
  { id: 'conditions', section: 'army', title: translate('ref.conditionsTitle'),
    body: message('ref.conditionsBody', { loss: MORALE_LOSS_PER_UNPAID_SEASON }),
    facts: [{ label: translate('ui.morale'), value: MORALE_LOSS_PER_UNPAID_SEASON }] },
  { id: 'territory', section: 'war', title: translate('ref.territoryTitle'),
    body: message('ref.territoryBody', { radius: TERRITORY_RADIUS, outside: ATTRITION_PERCENT,
      winter: ATTRITION_WINTER_PERCENT, field: ATTRITION_FIELD_WINTER_PERCENT, camp: CAMP_RADIUS }),
    facts: [{ label: translate('ref.territoryTitle'), value: TERRITORY_RADIUS }] },
  { id: 'visibility', section: 'war', title: translate('ref.visibility.title'),
    body: translate('ref.visibility.body'), facts: [{ label: translate('ui.siteState'), value: 3 }] },

  {
    id: 'force',
    section: 'army',
    title: translate('ref.force.title'),
    body: message('ref.force.body', {
      points: String(POINTS_PER_MAN),
      small: String(SMALLEST_SIZE),
      large: String(LARGEST_SIZE),
    }),
    facts: [
      { label: translate('ref.force.points'), value: POINTS_PER_MAN },
      { label: translate('ref.force.column'), value: FORMATION_STRIKE.column.of },
      { label: translate('ref.force.smallest'), value: SMALLEST_SIZE },
      { label: translate('ref.force.largest'), value: LARGEST_SIZE },
    ],
  },
  {
    id: 'combat',
    section: 'war',
    title: translate('ref.combat.title'),
    body: message('ref.combat.body', {
      rounds: String(TICK_HZ / EXCHANGE_TICKS),
      base: String(BASE_SHOCK),
      flank: String(ASPECT_SHOCK.flank),
      rear: String(ASPECT_SHOCK.rear),
    }),
    facts: [
      { label: translate('ref.combat.base'), value: BASE_SHOCK },
      { label: translate('ref.combat.flank'), value: ASPECT_SHOCK.flank },
      { label: translate('ref.combat.rear'), value: ASPECT_SHOCK.rear },
    ],
  },
  {
    id: 'missiles',
    section: 'war',
    title: translate('ref.missiles.title'),
    body: message('ref.missiles.body', { shock: String(VOLLEY_SHOCK) }),
    facts: [{ label: translate('ref.missiles.shock'), value: VOLLEY_SHOCK }],
  },
  {
    id: 'siege',
    section: 'war',
    title: translate('ref.siege.title'),
    body: message('ref.siege.body', {
      ram: String(RAM_BEARING_PER_BLOW),
      ramCost: RAM_COST, ramSeconds: RAM_BUILD_TICKS / TICK_HZ,
      escalade: String(ESCALADE_DAMAGE),
      bearing: String(ESCALADE_BEARING),
      loss: String(WALL_ASSAULT_LOSS),
      grain: String(BLOCKADE_GRAIN_LOSS),
      population: BLOCKADE_POPULATION_LOSS, morale: BLOCKADE_MORALE_LOSS,
      holds: CAPTURE_HOLDS, captureSeconds: CAPTURE_TICKS / TICK_HZ,
      cap: String(BLOCKADE_PRESSURE_CAP),
    }),
    facts: [
      { label: translate('ref.siege.ram'), value: RAM_BEARING_PER_BLOW },
      { label: translate('ref.siege.escalade'), value: ESCALADE_DAMAGE },
      { label: translate('ref.siege.loss'), value: WALL_ASSAULT_LOSS },
      { label: translate('ref.siege.grain'), value: BLOCKADE_GRAIN_LOSS },
      { label: translate('ref.siege.cap'), value: BLOCKADE_PRESSURE_CAP },
    ],
  },
  {
    id: 'roster',
    section: 'army',
    title: translate('ref.roster.title'),
    body: translate('ref.roster.body'),
    // Read straight off the content table, so the entry cannot quote an `impact`
    // the game no longer uses, and in the table's own order so a reader comparing
    // Rome with Carthage sees them as the roster lists them.
    facts: SQUAD_TYPES.map((type) => ({ label: type.id, value: type.impact })),
  },
];

/** Every entry of one section, in `REFERENCE_ENTRIES` order. */
export function referenceOf(section: ReferenceSection): readonly ReferenceEntry[] {
  return REFERENCE_ENTRIES.filter((entry) => entry.section === section);
}
