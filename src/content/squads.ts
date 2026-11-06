/**
 * The Squad types a Faction may raise (GLOSSARY: Squad; PLAN §4).
 *
 * A Squad type is what a Recruit Command names and what Payroll is charged on:
 * one block of soldiers, its tier, the men in it, the arm it carries, the morale
 * it comes with, the missiles it can throw, the pace it marches at, what it
 * costs to raise and what it owes each Season. B6 shipped one type a tier per
 * Faction, enough to make the tiers and the Payroll real; C3 read the arm and
 * the missiles (the matchup matrix and the first volleys); C4 fills the rosters
 * out — the elephants, the light troops, the form-and-silhouette variety.
 *
 * ## The two rosters, and why they are not two sets of numbers
 *
 * Rome's three lines are disciplined, durable and slow to replace; Carthage's
 * six are a mercenary coalition — cheap to raise, brittle in morale, dearer to
 * keep and, in the elephant, unlike anything Rome fields at all. The asymmetry
 * is the plan's (§1), and it is written here in numbers small enough to check by
 * eye:
 *
 * - **Rome** — `hastati` (a light line with a pilum), `principes` (the same men
 *   grown steady) and `triarii` (fewer, older, spear-armed and the last to
 *   break). Slow to break, quick to recover, and every one of them foot.
 * - **Carthage** — the Libyan spearmen that are the closest thing to a line, the
 *   impetuous Gauls who charge and then are gone, the Iberian scutarii who are
 *   the professionals of the coalition, the Balearic slingers who never close,
 *   the Numidian horse that harasses and will not hold a line, and the elephants.
 *
 * ## Figures, and a Squad of a single one
 *
 * `strength` is the *largest* size a Squad of the type may be raised at, and so
 * the number a full-strength Squad is counted as; `sizes` is every real size a
 * Recruit may name, from the smallest to `strength`. A Recruit buys one of
 * those sizes, and the Squad remembers the men it was raised with as its
 * capacity even after casualties reduce its surviving `strength` (ADR-0026).
 * `figures` is how many soldiers are *drawn*: the men it has left, for a body of
 * men, so a Squad thins on screen as it is worn down; and one, for a beast,
 * whatever its `strength` has fallen to. An elephant is a Squad of a single
 * figure (ADR-0004): one creature with the staying power of a much larger body
 * of men, which is what its `strength` above one and its `figures` of one say
 * together. `figuresOf(type, strength)` is the one place the two are tied, so a
 * drawing code that asks how many figures to lay out cannot half-read it.
 *
 * ## Sizes, prices and the Payroll rate
 *
 * Rome raises its melee infantry at 24, 60 or 120 men; Carthage at 24 or 48;
 * each specialist has one starting size (ADR-0026). A price is quoted for
 * `COST_BASIS` men and scales in exact proportion — `1`, `2.5` and `5` times for
 * Rome and `1` or `2` times for Carthage — with no bulk discount. `cost` is
 * therefore the 24-man price, and `recruitCost` is the one reader that turns it
 * into the bill for a size.
 *
 * `payroll` is the rate: the denarii the type owes each Season for every
 * `PAYROLL_BASIS` men it keeps. A Squad's bill follows its *surviving* men and
 * rounds *up*, so a Squad never pays less than its share and splitting the same
 * men into more Squads can never create free Payroll (`payrollBill`).
 *
 * ## Bearing, and why `impact` is not `strength`
 *
 * A fight moves men and nerve in proportion to the men brought to bear, never in
 * proportion to how many Squads those men are divided into — that is #66's rule,
 * and `sim/combat.ts` is where it is written. The men a type brings are its
 * surviving `strength`; the weight one of them carries is `impact`. `bearingOf`
 * is the one reader that multiplies the two, so an observation, a Siege and a
 * Controller all price a body of men the same way. Infantry carries `1`, the
 * Numidian horse `2` and the elephant `4`; the numbers and the measurements
 * behind them are in ADR-0028.
 *
 * ## The pace a type marches at
 *
 * `pace` is a whole-number pace: how many tiles' worth of ground the type
 * covers for the cost of one, so `1` is a man on foot and `2` is a horse. The
 * ticks a tile costs are the terrain's own (`route.ts`) *divided by* the pace
 * and rounded up, so a road still costs a horse one tick and a ford still costs
 * it five — the ground is the ground, and the horse is what changes. Routing
 * prices a route in the walker's own pace (`route.ts`), so a fast Squad is not
 * merely quicker along a footsoldier's road.
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

  /** The largest size it may be raised at: a full-strength Squad is counted as this many men (ADR-0004). */
  readonly strength: number;

  /**
   * The real sizes a Recruit may name, smallest first and `strength` last.
   *
   * Rome's melee infantry offers 24, 60 and 120; Carthage's 24 and 48; a
   * specialist has one starting size (ADR-0026). 64 is a visual comparison
   * candidate and never a fourth size.
   */
  readonly sizes: readonly number[];

  /**
   * How many figures a full-strength Squad of the type is drawn as.
   *
   * Left out where a type is a body of men, because the answer is its
   * `strength` and saying it twice is a second place to disagree. A type that
   * gives it — today only the elephant — states that it is a Squad of a single
   * figure with the staying power of a `strength` its one figure does not
   * literally number. `figuresOf` is the reader.
   */
  readonly figures?: number;

  /**
   * What the Squad is armed with: its row and column in the matchup matrix
   * (`arms.ts`), and therefore who it has the better of a fight against.
   */
  readonly arm: Arm;

  /**
   * What one of its men is worth in a blow, against one man of the line.
   *
   * A fight moves men and nerve, and #66's rule is that it moves them in
   * proportion to **men brought to bear** rather than to how many Squads those
   * men are divided into (`sim/combat.ts`). The bearing a Squad brings is
   * `strength × impact`, so the field is the one place a type says that its men
   * are worth more than their count:
   *
   * - **1** — the infantry of both rosters, and the slingers: a man is a man.
   * - **2** — the Numidian horse, whose twelve riders are a charge and not a
   *   dozen skirmishers; their `strength` stays the twelve men that are drawn.
   * - **4** — the elephant, where one beast's twenty-four points of staying
   *   power are worth more than four-score men's blows.
   *
   * It is deliberately *not* `strength`: `strength` is how many men (or figures)
   * a Squad has and how it is drawn, and doubling it to make a horse hit harder
   * would draw twelve riders as twenty-four. The two numbers answer two
   * questions, and #66 measured both against the new infantry sizes.
   */
  readonly impact: number;

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

  /**
   * The pace it marches at: how many tiles' worth of ground it covers for the
   * cost of one. `1` is a man on foot, `2` is a horse, and a tile's ticks are
   * the terrain's divided by this and rounded up (`route.ts`).
   *
   * Called `pace` and not `speed` because `sim/pacing.ts` already owns the three
   * speeds a Match runs at, and the two are different things about different
   * subjects (GLOSSARY: Pace).
   */
  readonly pace: number;

  /**
   * The denarii it owes each Season for every `PAYROLL_BASIS` men it keeps.
   *
   * The rate is per `PAYROLL_BASIS` and not per Squad: a Squad's actual bill
   * follows its surviving men (`payrollBill`), so equivalent men pay the same
   * whether they stand in one Squad or several.
   */
  readonly payroll: number;

  /**
   * The 24-man price of raising one, in the settlement's own four resources.
   *
   * A Recruit of another legal size pays in exact proportion (`recruitCost`),
   * so the table stays small enough to read and no size enjoys a bulk discount.
   */
  readonly cost: ResourceAmounts;
}

/**
 * The men a type's `cost` is quoted for: every price scales from this size.
 *
 * Twenty-four is the smallest size any type may be raised at, so a 24-man
 * Recruit pays exactly what the table says and every larger size is a multiple
 * of it (ADR-0026).
 */
export const COST_BASIS = 24;

/**
 * The men a type's `payroll` is quoted for: the Payroll rate is denarii per this
 * many surviving men.
 *
 * The same basis as the price, so a full Squad of 24 pays the table's rate in
 * resources and in denarii, and a larger Squad pays in proportion.
 */
export const PAYROLL_BASIS = COST_BASIS;

/** One amount scaled from the 24-man basis to `men`, in whole units. */
function scaledByMen(amount: number, men: number): number {
  return Math.ceil((amount * men) / COST_BASIS);
}

/**
 * Every Squad type, in code order: the index is the code state holds.
 *
 * The order is the Faction order `FACTIONS` keeps, and within a Faction by tier,
 * so a report and an Observation walk it the same way and a reader sees the two
 * rosters side by side. It is also the order that must not move: a type's code
 * is what a Squad in state holds, so reordering the table renumbers every army
 * a replay ever raised.
 *
 * Carthage's roster is deliberately longer than Rome's — a coalition of six
 * kinds against a citizen militia of three — and it is the roster where the
 * plan's asymmetry is legible: cheaper to raise (`gaul` costs the least of any
 * type), frailer in morale (the Gauls break first of anyone) and dearer to keep
 * (the elephant is the most expensive term in the game).
 */
export const SQUAD_TYPES: readonly SquadType[] = [
  {
    id: 'hastati',
    faction: 'rome',
    tier: 1,
    strength: 120,
    sizes: [24, 60, 120],
    impact: 1,
    arm: 'sword',
    morale: 10,
    ammunition: 4,
    pace: 1,
    payroll: 3,
    cost: { ...NOTHING, grain: 8, iron: 2 },
  },
  {
    id: 'principes',
    faction: 'rome',
    tier: 2,
    strength: 120,
    sizes: [24, 60, 120],
    impact: 1,
    arm: 'sword',
    morale: 12,
    ammunition: 4,
    pace: 1,
    payroll: 4,
    cost: { ...NOTHING, grain: 10, iron: 4 },
  },
  {
    id: 'triarii',
    faction: 'rome',
    tier: 3,
    strength: 120,
    sizes: [24, 60, 120],
    impact: 1,
    arm: 'spear',
    morale: 14,
    ammunition: 0,
    pace: 1,
    payroll: 6,
    cost: { ...NOTHING, grain: 10, iron: 6 },
  },
  {
    id: 'libyan-spear',
    faction: 'carthage',
    tier: 1,
    strength: 48,
    sizes: [24, 48],
    impact: 1,
    arm: 'spear',
    morale: 9,
    ammunition: 0,
    pace: 1,
    payroll: 3,
    cost: { ...NOTHING, grain: 6, iron: 2 },
  },
  {
    id: 'gaul',
    faction: 'carthage',
    tier: 1,
    strength: 48,
    sizes: [24, 48],
    impact: 1,
    arm: 'sword',
    morale: 6,
    ammunition: 0,
    pace: 1,
    payroll: 2,
    cost: { ...NOTHING, grain: 5, iron: 1 },
  },
  {
    id: 'iberian-sword',
    faction: 'carthage',
    tier: 2,
    strength: 48,
    sizes: [24, 48],
    impact: 1,
    arm: 'sword',
    morale: 11,
    ammunition: 2,
    pace: 1,
    payroll: 5,
    cost: { ...NOTHING, grain: 8, iron: 4 },
  },
  {
    id: 'balearic-slinger',
    faction: 'carthage',
    tier: 2,
    strength: 24,
    sizes: [24],
    impact: 1,
    arm: 'archers',
    morale: 8,
    ammunition: 8,
    pace: 1,
    payroll: 4,
    cost: { ...NOTHING, grain: 8, iron: 1 },
  },
  {
    id: 'numidian-horse',
    faction: 'carthage',
    tier: 3,
    strength: 12,
    sizes: [12],
    impact: 2,
    arm: 'cavalry',
    morale: 10,
    ammunition: 6,
    pace: 2,
    payroll: 4,
    cost: { ...NOTHING, grain: 8, iron: 2 },
  },
  {
    id: 'elephant',
    faction: 'carthage',
    tier: 3,
    strength: 24,
    sizes: [24],
    impact: 4,
    figures: 1,
    arm: 'cavalry',
    morale: 16,
    ammunition: 0,
    pace: 2,
    payroll: 8,
    cost: { ...NOTHING, grain: 12, iron: 6 },
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

/**
 * How many figures a Squad of `type` with `strength` men left is drawn as.
 *
 * One question with two halves. For a body of men the number of figures a Squad
 * is drawn as is the number of men it has left, so a Squad visibly thins as it is
 * worn down. For a type that states its own `figures` — today only the elephant —
 * the figure is the figure, and stays one until the Squad is gone: its `strength`
 * is the staying power that one beast is worth, not a count of beasts. The clamp
 * keeps a type from ever being drawn as more figures than it has men.
 */
export function figuresOf(type: SquadType, strength: number): number {
  return type.figures === undefined ? strength : Math.min(type.figures, strength);
}

/**
 * The bearing `men` of the type bring into a round of contact: how hard they
 * strike and how heavily they press.
 *
 * Men times `impact`, and nothing else: a 120-man line of hastati brings 120,
 * and five 24-man Squads of them bring 120 between them, which is the equivalence
 * #66 asks for. The number is in *blow points* (`sim/combat.ts`: twelve of them
 * make one man), and it is what a Siege's ram defence and a Controller's force
 * estimate read as well as the exchange itself.
 */
export function bearingOf(type: Pick<SquadType, 'impact'>, men: number): number {
  return Math.max(0, men) * Math.max(0, type.impact);
}

/**
 * Whether `men` is a size the type may actually be raised at.
 *
 * A Recruit that names any other number is refused by the rules rather than
 * rounded to a size the Player did not ask for: the roster's sizes are the
 * contract, and 36, 64 and every other number between them are not.
 */
export function isLegalSize(type: Pick<SquadType, 'sizes'>, men: number): boolean {
  return type.sizes.includes(men);
}

/**
 * What raising one Squad of `men` of the type costs, in the settlement's own
 * four resources.
 *
 * The table's `cost` is the 24-man price and every size is an exact multiple of
 * it, with no bulk discount: a 60-man Roman Squad pays `2.5` times a 24-man
 * Squad, and a 120-man one pays `5` times. The `ceil` only matters for a price
 * the roster does not offer; every legal size of every shipped type lands on a
 * whole resource (ADR-0026).
 */
export function recruitCost(type: Pick<SquadType, 'cost'>, men: number): ResourceAmounts {
  return {
    grain: scaledByMen(type.cost.grain, men),
    timber: scaledByMen(type.cost.timber, men),
    stone: scaledByMen(type.cost.stone, men),
    iron: scaledByMen(type.cost.iron, men),
  };
}

/**
 * What one Squad of `men` of the type owes each Season: its Payroll bill.
 *
 * The table's `payroll` is a rate per `PAYROLL_BASIS` men, so the bill follows
 * the **surviving** men rather than the Squad's recruited capacity. It rounds
 * **up**, which is the property the ticket asks for: a Squad never pays less
 * than its men's share, so splitting the same men across more Squads cannot
 * create free Payroll; at worst it costs the same, and a leftover man can cost
 * one denarius (ADR-0026, ADR-0027).
 */
export function payrollBill(type: Pick<SquadType, 'payroll'>, men: number): number {
  return scaledByMen(type.payroll, men);
}

/** Every type one Faction may raise, in code order. */
export function squadTypesOf(faction: Faction): readonly SquadType[] {
  return SQUAD_TYPES.filter((type) => type.faction === faction);
}
