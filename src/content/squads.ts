/**
 * The Squad types a Faction may raise (GLOSSARY: Squad; PLAN §4).
 *
 * A Squad type is what a Recruit Command names and what Payroll is charged on:
 * one block of soldiers, its tier, the men in it, the arm it carries, the morale
 * it comes with, the missiles it can throw, what it costs to raise and what it
 * owes each Season. B6 ships one type a tier per Faction, enough to make the
 * tiers and the Payroll real; C3 reads the arm and the missiles (the matchup
 * matrix and the first volleys); C4 fills the rosters out — the elephants, the
 * light troops, the form-and-silhouette variety — and the shape below is what it
 * fills.
 *
 * The id is a string, because it is what a Command carries and what a document
 * an external agent reads (`docs/COMMANDS.md`), and the code is an integer,
 * because a Squad in state holds its type as a number and `serializeState`
 * accepts nothing else (ADR-0006). This module is the only place the two are
 * tied together, so a `squadType` that reaches the rules cannot be half-read.
 *
 * A type belongs to a Faction: Rome does not raise Libyan spearmen and Carthage
 * does not raise triarii. The rules refuse a Recruit that names the other
 * Faction's type, and the tier is what a settlement's tier gates: a type of a
 * higher tier cannot be raised in a settlement that has not grown to it.
 */
import type { Faction } from '../sim/faction.ts';
import type { Arm } from './arms.ts';
import { NOTHING, type ResourceAmounts } from './resources.ts';

/**
 * A settlement tier, and a Squad type's tier: one, two or three.
 *
 * Three tiers are the whole progression (PLAN §4): a settlement rises through
 * `villa` and `forum`, and a Squad type states the tier it needs. There is no
 * technology tree beside it, because the tiers *are* the progression.
 */
export type Tier = 1 | 2 | 3;

/** One kind of Squad a Faction can raise. */
export interface SquadType {
  /** The id a Recruit Command names, and the key of this table. */
  readonly id: string;

  /** The Faction that raises it: a type names its owner's roster and no other's. */
  readonly faction: Faction;

  /** The settlement tier that must exist before it can be raised. */
  readonly tier: Tier;

  /** How many men a full-strength Squad of the type is drawn as and counted as (ADR-0004). */
  readonly strength: number;

  /**
   * What the Squad is armed with: its row and column in the matchup matrix
   * (`arms.ts`), and therefore who it has the better of a fight against.
   */
  readonly arm: Arm;

  /**
   * The morale a newly raised Squad starts with, and the most it recovers to.
   *
   * Morale is the primary resource of a fight (C3): a Squad breaks at none, and
   * this is the whole of it at full spirits.
   */
  readonly morale: number;

  /**
   * How many volleys of missiles it carries, if it carries any.
   *
   * A volley is thrown in the first rounds of a contact and never comes back
   * until the Squad is resupplied in its own country: a type with none is a
   * type that fights with the arm and nothing else, and a type with five is a
   * type whose first seconds of a fight are worth manoeuvring for (C3).
   */
  readonly ammunition: number;

  /** The denarii it owes each Season: what Payroll is charged on (GLOSSARY: Payroll). */
  readonly payroll: number;

  /** What raising one costs the settlement that raises it, in its own four resources. */
  readonly cost: ResourceAmounts;
}

/**
 * Every Squad type, in code order: the index is the code state holds.
 *
 * Rome's roster is disciplined, durable and slow to replace; Carthage's is
 * cheaper to raise, frailer in morale and dearer to keep — the plan's asymmetry
 * in numbers small enough to check by eye (PLAN §1). The order is the Faction
 * order `FACTIONS` keeps, so a report and an Observation walk it the same way.
 */
export const SQUAD_TYPES: readonly SquadType[] = [
  {
    id: 'hastati',
    faction: 'rome',
    tier: 1,
    strength: 120,
    arm: 'sword',
    morale: 10,
    ammunition: 4,
    payroll: 3,
    cost: { ...NOTHING, grain: 8, iron: 2 },
  },
  {
    id: 'principes',
    faction: 'rome',
    tier: 2,
    strength: 120,
    arm: 'sword',
    morale: 12,
    ammunition: 4,
    payroll: 4,
    cost: { ...NOTHING, grain: 10, iron: 4 },
  },
  {
    id: 'triarii',
    faction: 'rome',
    tier: 3,
    strength: 100,
    arm: 'spear',
    morale: 14,
    ammunition: 0,
    payroll: 6,
    cost: { ...NOTHING, grain: 10, iron: 6 },
  },
  {
    id: 'libyan-spear',
    faction: 'carthage',
    tier: 1,
    strength: 120,
    arm: 'spear',
    morale: 9,
    ammunition: 0,
    payroll: 3,
    cost: { ...NOTHING, grain: 6, iron: 2 },
  },
  {
    id: 'iberian-sword',
    faction: 'carthage',
    tier: 2,
    strength: 120,
    arm: 'sword',
    morale: 11,
    ammunition: 2,
    payroll: 5,
    cost: { ...NOTHING, grain: 8, iron: 4 },
  },
  {
    id: 'numidian-horse',
    faction: 'carthage',
    tier: 3,
    strength: 60,
    arm: 'cavalry',
    morale: 10,
    ammunition: 6,
    payroll: 4,
    cost: { ...NOTHING, grain: 8, iron: 2 },
  },
];

/** The integer a Squad type is held as in state: its index in `SQUAD_TYPES`. */
export type SquadTypeCode = number;

/** The type a code names, or `undefined` when no type has it. */
export function squadTypeOf(code: number): SquadType | undefined {
  return SQUAD_TYPES[code];
}

/** The code an id names, or `undefined` when no type has it: how a Recruit is read. */
export function squadTypeCode(id: string): SquadTypeCode | undefined {
  return CODES.get(id);
}

/** Id to code, built once: a Recruit is read on a tick and the table never changes. */
const CODES: ReadonlyMap<string, SquadTypeCode> = new Map(
  SQUAD_TYPES.map((type, code) => [type.id, code]),
);

/** Every type one Faction may raise, in code order. */
export function squadTypesOf(faction: Faction): readonly SquadType[] {
  return SQUAD_TYPES.filter((type) => type.faction === faction);
}
