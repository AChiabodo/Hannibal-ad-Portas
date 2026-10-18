/**
 * The buildings a settlement may raise (PLAN §4, ADR-0005).
 *
 * Construction in this game is a **labour allocation plus a timer**: there is no
 * construction scene, and that is the decision rather than a gap. Starting one
 * deducts its cost from the settlement's stock and appends a work to it; from
 * there the work claims its labour out of the settlement's population every
 * tick and counts its timer down, and when the timer reaches zero it is standing
 * and producing.
 *
 * A building states, in numbers the rules read:
 *
 * - what it costs, from the settlement's own four resources;
 * - how many ticks it takes, and how many workers it needs to build *and* to
 *   operate once standing — one allocation, because a building is labour;
 * - what it yields each Season, or the denarii it earns, when it is staffed;
 * - what it adds to the settlement's housing and to its storage;
 * - which tier it needs, and which tier it *raises* the settlement to.
 *
 * The last pair is how the tiers work: `villa` raises a settlement to its second
 * tier and `forum` to its third, and a Squad type that names a tier cannot be
 * raised until a settlement of that tier exists. The progression is the tiers,
 * and there is no technology tree beside them.
 *
 * The id is a string because a Build Command carries one; the code is an integer
 * because a work in state holds its building as a number (ADR-0006). As with
 * Squad types, this module is the only place the two are tied together.
 */
import type { Faction } from '../sim/faction.ts';
import { NOTHING, type ResourceAmounts } from './resources.ts';
import type { Tier } from './squads.ts';

/** One building a settlement can raise. */
export interface BuildingType {
  /** The id a Build Command names, and the key of this table. */
  readonly id: string;

  /** The Faction that may raise it, or `undefined` for a building either Faction may. */
  readonly faction?: Faction;

  /** The settlement tier that must exist before it can be raised. */
  readonly tier: Tier;

  /** What starting it costs the settlement, in its own four resources. */
  readonly cost: ResourceAmounts;

  /** How many ticks the work takes, once staffed. */
  readonly buildTicks: number;

  /** How many of the settlement's people it takes to build it and to keep it working. */
  readonly labour: number;

  /** What it yields each Season while staffed, over and above what the land yields. */
  readonly yields: ResourceAmounts;

  /** The denarii it earns each Season while staffed, added to its Faction's treasury. */
  readonly denarii: number;

  /** How many more people the settlement can hold once it stands. */
  readonly housing: number;

  /** How much more of each resource the settlement can store once it stands. */
  readonly storage: number;

  /** The tier it raises its settlement to when it is finished: 0 for a building that raises nothing. */
  readonly raisesTier: 0 | 2 | 3;

  /** The most of this building one settlement may hold. */
  readonly maxPerSettlement: number;
}

/**
 * Every building, in code order: the index is the code state holds.
 *
 * The four producers are the direct answer to the four resources; `market` turns
 * surplus population into denarii, which is what pays Payroll; `granary` and
 * `house` raise the two ceilings an economy otherwise runs into; `villa` and
 * `forum` are the tiers; and `castrum` is Rome's field camp from the plan
 * (PLAN §1), raised in a settlement here because C1's field is not built yet —
 * it forages a little and shelters a few, and C3 will give it its real meaning.
 */
export const BUILDINGS: readonly BuildingType[] = [
  {
    id: 'farm',
    tier: 1,
    cost: { ...NOTHING, timber: 6 },
    buildTicks: 400,
    labour: 4,
    yields: { ...NOTHING, grain: 6 },
    denarii: 0,
    housing: 0,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 4,
  },
  {
    id: 'lumber-camp',
    tier: 1,
    cost: { ...NOTHING, timber: 4 },
    buildTicks: 350,
    labour: 4,
    yields: { ...NOTHING, timber: 5 },
    denarii: 0,
    housing: 0,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 4,
  },
  {
    id: 'quarry',
    tier: 1,
    cost: { ...NOTHING, timber: 6 },
    buildTicks: 450,
    labour: 4,
    yields: { ...NOTHING, stone: 4 },
    denarii: 0,
    housing: 0,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 3,
  },
  {
    id: 'mine',
    tier: 1,
    cost: { ...NOTHING, timber: 8, stone: 4 },
    buildTicks: 600,
    labour: 5,
    yields: { ...NOTHING, iron: 3 },
    denarii: 0,
    housing: 0,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 3,
  },
  {
    id: 'market',
    tier: 1,
    cost: { ...NOTHING, timber: 8, stone: 4 },
    buildTicks: 500,
    labour: 3,
    yields: NOTHING,
    denarii: 4,
    housing: 0,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 2,
  },
  {
    id: 'granary',
    tier: 1,
    cost: { ...NOTHING, timber: 6, stone: 4 },
    buildTicks: 400,
    labour: 2,
    yields: NOTHING,
    denarii: 0,
    housing: 0,
    storage: 30,
    raisesTier: 0,
    maxPerSettlement: 2,
  },
  {
    id: 'house',
    tier: 1,
    cost: { ...NOTHING, timber: 4, stone: 2 },
    buildTicks: 300,
    labour: 0,
    yields: NOTHING,
    denarii: 0,
    housing: 6,
    storage: 0,
    raisesTier: 0,
    maxPerSettlement: 4,
  },
  {
    id: 'villa',
    tier: 1,
    cost: { ...NOTHING, timber: 12, stone: 8 },
    buildTicks: 800,
    labour: 6,
    yields: NOTHING,
    denarii: 0,
    housing: 4,
    storage: 10,
    raisesTier: 2,
    maxPerSettlement: 1,
  },
  {
    id: 'forum',
    tier: 2,
    cost: { ...NOTHING, timber: 16, stone: 12, iron: 6 },
    buildTicks: 1200,
    labour: 8,
    yields: NOTHING,
    denarii: 3,
    housing: 0,
    storage: 0,
    raisesTier: 3,
    maxPerSettlement: 1,
  },
  {
    id: 'castrum',
    faction: 'rome',
    tier: 1,
    cost: { ...NOTHING, timber: 10 },
    buildTicks: 500,
    labour: 4,
    yields: { ...NOTHING, grain: 2 },
    denarii: 0,
    housing: 2,
    storage: 10,
    raisesTier: 0,
    maxPerSettlement: 1,
  },
];

/** The integer a building is held as in state: its index in `BUILDINGS`. */
export type BuildingCode = number;

/** The building a code names, or `undefined` when no building has it. */
export function buildingOf(code: number): BuildingType | undefined {
  return BUILDINGS[code];
}

/** The code an id names, or `undefined` when no building has it: how a Build is read. */
export function buildingCode(id: string): BuildingCode | undefined {
  return CODES.get(id);
}

/** Id to code, built once: a Build is read on a tick and the table never changes. */
const CODES: ReadonlyMap<string, BuildingCode> = new Map(
  BUILDINGS.map((building, code) => [building.id, code]),
);
