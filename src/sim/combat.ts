/**
 * Combat and morale: how two Squads in contact wear each other down, and how one
 * of them breaks (PLAN §4, ticket C3).
 *
 * A fight here is **aggregate and morale-primary**. Two Squads in contact do not
 * fight man against man: each round of contact moves the same two quantities on
 * both sides — how many men are left, and how close the Squad is to breaking —
 * and a Squad that breaks runs rather than dying to the last man (ADR-0004).
 * Everything the plan lists as a lever moves one of those two numbers:
 *
 * | Lever                  | What it does                                                   |
 * | ---------------------- | -------------------------------------------------------------- |
 * | the men brought to bear | `bearing` — men times `impact` — in **force points**, twelve to a man |
 * | the shape it holds     | a line brings all of it and a column a quarter (ADR-0028)       |
 * | the matchup matrix     | `content/arms.ts` — who has the better of the pair, ×3/2 or ×2/3 |
 * | flank and rear         | more damage **and** more morale shock; and the flanked side strikes weaker |
 * | terrain                | a hill is harder to assault, a ford disorders whoever stands in it |
 * | fatigue                | a march and a fight both cost, and a tired Squad strikes weakly   |
 * | ammunition             | the first volleys add casualties and shock, then there are none   |
 * | Supply                 | a Squad cut off from its country loses morale each Season          |
 * | being routed           | a routed Squad strikes weakly, and is not butchered while it can run |
 *
 * ## One round, resolved at once
 *
 * Contact is resolved every `EXCHANGE_TICKS` ticks — half a second at the 10 Hz
 * clock — rather than on every tick, because a fight is a sequence of blows and
 * not a continuous drain, and because it is the only cadence at which a morale
 * shock of one point means anything against a morale of ten. The schedule is
 * `tick % EXCHANGE_TICKS`, so it needs no accumulator in state and a replay
 * cannot drift off it.
 *
 * Every exchange in a round is computed from the state **as the round began**,
 * then applied, so the answer does not depend on which Squad the list happened
 * to walk first: two Squads that hit each other in the same round both hit with
 * the strength they had when it started. Nothing is drawn from the Match's
 * random source, so a fight is a pure function of the world — which is what
 * "resolves deterministically from the same state" means (ADR-0006), and it is
 * why no die is rolled for a casualty.
 *
 * ## A blow is counted in men brought to bear, not in Squads (ADR-0028)
 *
 * A Squad's blow is `bearing`: its surviving men times its type's `impact`
 * (`content/squads.ts`), scaled by its formation, the matchup, the angle, the
 * ground and its fatigue. Men scale the blow and bodies of men do not: five
 * 24-man Squads bring five times a 24-man Squad's blow and exactly a 120-man
 * Squad's, which is P3's equivalence. The chain starts from men rather than from
 * `frontage` for that reason — a full line saturates at twelve files, and a
 * strike read off the file count lets a Player buy five times the damage by
 * splitting one body into five Squads.
 *
 * Two rules finish the job, and both are about *the body*, not about the entity:
 *
 * - **A Squad's attention is divided.** Its blow is split among the enemies it
 *   is in contact with, so a block fighting on three sides inflicts its force
 *   once and not three times.
 * - **Shock is counted once per defender.** How much nerve a round costs depends
 *   on the men pressing it against the men holding it, not on how many Squads
 *   the attackers happen to be. Five 24-man Squads shake exactly as much nerve
 *   as one 120-man Squad, and a body at five-to-one odds shakes five times as
 *   much.
 *
 * ## Force points, and a rounding that does not depend on the split
 *
 * A blow is counted in **force points**, twelve of which make one man. That scale
 * exists so that splitting a body into Squads cannot change the arithmetic:
 * twelve points of a 24-man Squad's twenty-four are 1.5 men, and 60 points of
 * five such Squads are five men, which is what 120 points of one 120-man Squad
 * are. Casualties are floored **once per defender per round**, from the summed
 * points of every blow that landed on it, and a defender that was struck at all
 * always loses at least one man — counted once, however many Squads struck it.
 *
 * ## Rounding, in one place
 *
 * Every modifier is a ratio of whole numbers (`Ratio`) applied by `scaledBy`,
 * which multiplies then divides and floors. Rounding once per step of a chain is
 * not the same as rounding at the end, so the order of the chain is fixed and
 * written down — the men brought to bear, the shape they hold, the matrix, where
 * the blow lands, how well the striker is guarding itself, the ground, then
 * fatigue, with the volley added last as plain points — and a test can predict a
 * number by hand from it. Points are fine enough that a step's flooring is worth
 * at most a twelfth of a man on the sizes this roster sells.
 *
 * ## Breaking, running, and forming up again
 *
 * A Squad whose morale reaches none has **broken**: it is `routed`, it runs for
 * the nearest settlement its Faction holds, it strikes with a third of its
 * force, and it gives no morale shock at all because it is not pressing home.
 * It is not annihilated while it has somewhere to run: its strength floors at one
 * man for as long as it still has steps to walk, which is the plan's "breaks
 * rather than dies to the last man" made mechanical.
 *
 * Rallying is **automatic and only automatic**. Once the ground behind it is
 * quiet — no enemy within `RALLY_RADIUS` — a routed Squad recovers a point of
 * morale a round, and at `RALLY_MORALE` it forms up where it stands. There is no
 * Command for it, and a routed Squad ignores the Commands it is given: the
 * player's job was to not get it broken (ADR-0004, and the ticket's out of
 * scope).
 *
 * That is the *only* recovery this module does. A Squad in good order that is
 * standing in its own country does not get its nerve back by waiting: morale is
 * the economy's slow resource as much as the fight's, and `chargePayroll`
 * recovers a point a Season for a Squad that is paid. Recovering it every few
 * seconds here would have made a Season of Payroll worth nothing.
 *
 * ## What C3 does not own
 *
 * No generals, no heroes, no ram, no siege, and no Territory. C3 inferred being
 * cut off from distance — a Squad more than thirty-two tiles from every
 * settlement its Faction held was out of Supply — and said where the real
 * answer would come from. C6 has built it: `inSupply` asks `territory.ts`
 * whether a Squad stands in its own country, and Attrition charges the men of
 * the ones that do not, at the same Season boundary this module's own Supply
 * charges their nerve.
 */
import { bearingOf, matchupOf, squadTypeOf, type Advantage, type Arm } from '../content/index.ts';
import type { Command, Formation } from './command.ts';
import { contactAllowed } from './settlement-space.ts';
import { factionCode } from './faction.ts';
import type { Economy, Squad } from './economy.ts';
import { TERRAIN, terrainAt, type MapGrid, type Site } from './map.ts';
import { orderedSquads, orderSquadTo } from './movement.ts';
import type { RouteCache } from './route.ts';
import type { Fallen } from './residue.ts';
import { FATIGUE_MAX, facingOf, FIELD, formationOf, isRouting, ROUTING, type Facing } from './squad.ts';
import { holdsTerritory, territoryOf } from './territory.ts';

/**
 * How many ticks a round of contact takes: half a second at the 10 Hz clock.
 *
 * Not every tick, for the reason `morale` is a small number: a point of shock
 * per tick would break a Squad in a second and would leave no room for a lever
 * to move the outcome. Half a second is long enough for a front rank to trade
 * blows and short enough that a fight reads as continuous.
 */
export const EXCHANGE_TICKS = 5;

/** A ratio of whole numbers: `times` of `of`, applied by multiplication then integer division. */
export interface Ratio {
  readonly times: number;
  readonly of: number;
}

/** The ratio that changes nothing. */
const EVEN: Ratio = { times: 1, of: 1 };

/**
 * `value` scaled by a ratio, floored.
 *
 * The one way a modifier is applied in this module, so that a reader who wants
 * to work a round out by hand has one rule to follow and no hidden float
 * anywhere. It is exported because the tests that predict a number by hand say
 * the same thing in the same words.
 */
export function scaledBy(value: number, ratio: Ratio): number {
  return Math.floor((value * ratio.times) / ratio.of);
}

/**
 * How many force points make one man: twelve.
 *
 * The scale a blow is counted on (`forcePointsOf`), and the reason splitting a
 * body of men into Squads cannot change the arithmetic: a 24-man Squad at parity
 * lands twenty-four points, which is two men, and five of them land a hundred and
 * twenty, which is exactly one 120-man Squad's ten. A man for every point would
 * leave nothing between a 24-man Squad's one man and two, and the rounding would
 * then depend on how the men were divided.
 */
export const POINTS_PER_MAN = 12;

/**
 * What the shape a Squad holds does to the blows it lands: a line lands all of
 * them and a column a quarter.
 *
 * A column is a march formation — three files abreast, however many ranks deep —
 * and a body caught in one has a quarter of a line's front to strike with. The
 * quarter is the ratio the file counts always had (three files against twelve),
 * kept because it is the meaning a Formation Command has always had in a fight.
 * `frontage` still says how wide a block is drawn and how wide it stands; what a
 * blow *is*, is the men behind the front (`forcePointsOf`).
 */
export const FORMATION_STRIKE: Readonly<Record<Formation, Ratio>> = {
  line: EVEN,
  column: { times: 1, of: 4 },
};

/**
 * The extra force points one volley lands, per point of bearing: the volley of a
 * body of men at parity, and of a missile arm.
 *
 * A volley is a weight of missiles rather than another multiplier, so it is
 * added last and as points. What a body carries is what it bought before the
 * campaign (`ammunition`), and it is spent in the first rounds of contact and
 * never comes back until the Squad is resupplied in its own country.
 *
 * The two rates are stated per *bearing* rather than flat, because a flat volley
 * would have been a second way to buy missiles by splitting a body: five 24-man
 * Squads each throwing the flat weight would out-shoot the 120-man Squad they
 * were part of. `archers` is heavier because a slinger's volley is what the
 * slinger is for — its melee blows are a body of twenty-four men's.
 */
export const VOLLEY_STRIKE: Readonly<Record<Arm, Ratio>> = {
  spear: { times: 2, of: 5 },
  sword: { times: 2, of: 5 },
  cavalry: { times: 2, of: 5 },
  light: { times: 2, of: 5 },
  archers: { times: 3, of: 2 },
};

/** How much ammunition a Squad spends in a round it is in contact: one volley's worth. */
export const AMMUNITION_PER_VOLLEY = 1;

/**
 * What landing a blow on `aspect` multiplies it by: where the enemy's face is
 * not, a Squad is easier to hurt.
 */
export const ASPECT_STRIKE: Readonly<Record<'front' | 'flank' | 'rear', Ratio>> = {
  front: EVEN,
  flank: { times: 5, of: 4 },
  rear: { times: 3, of: 2 },
};

/**
 * What fighting with an enemy on `aspect` multiplies your own blow by: the other
 * half of a flank, and the reason manoeuvre decides fights.
 *
 * The two tables are different numbers on purpose. Being hit in the rear is
 * worth half again to the man doing it (`ASPECT_STRIKE`), and it is worth half
 * *less* to the man receiving it, because his front rank is facing the wrong
 * way — so a rear attack is worth three times a frontal exchange, and a flank
 * one and two thirds. One table with one number would have to lie about one of
 * the two.
 */
export const ASPECT_GUARD: Readonly<Record<'front' | 'flank' | 'rear', Ratio>> = {
  front: EVEN,
  flank: { times: 3, of: 4 },
  rear: { times: 1, of: 2 },
};

/**
 * What being attacked from an angle adds to the morale shock: none from the
 * front, a point from the flank, two from behind.
 *
 * This is the number that makes manoeuvre worth the march. Two identical Squads
 * grinding at each other from the front break in about ten rounds; the same pair
 * with one of them taken in the rear breaks in three, because shock is counted
 * on top of a base of one and every point of it comes off a morale of ten.
 */
export const ASPECT_SHOCK: Readonly<Record<'front' | 'flank' | 'rear', number>> = {
  front: 0,
  flank: 1,
  rear: 2,
};

/** What the matrix's advantage multiplies an attack by, and what a disadvantage does. */
export const ADVANTAGE_RATIO: Readonly<Record<Advantage, Ratio>> = {
  advantage: { times: 3, of: 2 },
  neutral: EVEN,
  disadvantage: { times: 2, of: 3 },
};

/** How much morale a round of being hit costs before any lever is counted. */
export const BASE_SHOCK = 1;

/** What having the matrix's better arm adds to the shock a blow deals. */
export const MATCHUP_SHOCK = 1;

/** What the first volleys add to the shock a blow deals: being shot at is unnerving. */
export const VOLLEY_SHOCK = 1;

/** What standing in a ford adds to the shock a Squad takes: disordered men break sooner. */
export const FORD_SHOCK = 1;

/** How much of its strike a Squad loses per point of fatigue, in percent. */
export const FATIGUE_PENALTY = 3;

/** What assaulting a Squad standing on a hill multiplies the attack by. */
export const HILL_DEFENCE: Ratio = { times: 3, of: 4 };

/** What fighting from a ford multiplies a Squad's own strike by: disordered, not beaten. */
export const FORD_DISORDER: Ratio = { times: 3, of: 4 };

/** What cavalry fighting in a forest multiplies its strike by: no room to charge. */
export const FOREST_CAVALRY: Ratio = { times: 3, of: 5 };

/** What a routed Squad multiplies its strike by: it is not pressing home. */
export const ROUTED_STRIKE: Ratio = { times: 1, of: 3 };

/** The morale at which a broken Squad has found its nerve again and forms up. */
export const RALLY_MORALE = 2;

/** How close an enemy has to be to keep a routed Squad running: tiles, Chebyshev. */
export const RALLY_RADIUS = 6;

/**
 * How much morale being cut off costs a Squad in a Season: two, the same weight
 * as a Season of going unpaid.
 *
 * Charged at the Season boundary rather than every tick, because being cut off
 * is a fact about where an army is *campaigning*, not about the second it is
 * standing in — and because a per-tick drain would break an army in a minute and
 * leave the player no time to do anything about it. C6's Attrition lands on the
 * same boundary, on the men rather than on the nerve, which is where the two
 * meet.
 */
export const SUPPLY_MORALE_LOSS = 2;

/**
 * The morale a Squad has broken at: none.
 *
 * Morale never goes below it, which keeps a broken Squad's recovery bounded and
 * keeps a number that has stopped meaning anything out of state.
 */
export const BREAKING_MORALE = 0;

/**
 * Where an attack lands from, relative to the way the defender faces.
 *
 * `front` is the side a Squad is looking at; `rear` is the side it would have to
 * turn round to see; `flank` is everything else, which on a square grid is the
 * two sides. Two Squads on one tile are locked together, so that is a `front` —
 * there is no angle to be had inside a single tile.
 */
export type Aspect = 'front' | 'flank' | 'rear';

/** The tile in front of a Squad for each way it can face. */
const FRONT_OF: Readonly<Record<Facing, Site>> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

/**
 * Whether two Squads are close enough to be fighting: the same tile, or a tile
 * side by side. Diagonals do not touch, so a Squad cannot be engaged by a block
 * it is passing corner-first.
 */
export function inContact(first: Site, second: Site): boolean {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y) <= 1;
}

/**
 * Where `attacker`'s blow lands on `defender`: the defender's facing is the
 * question, because being hit from a side you are not looking at is the whole
 * of what flanking means.
 */
export function aspectOf(attacker: Site, defender: Site & { readonly facing: number }): Aspect {
  const across = attacker.x - defender.x;
  const down = attacker.y - defender.y;

  if (across === 0 && down === 0) return 'front';

  const faced = FRONT_OF[facingOf(defender.facing)];
  if (across === faced.x && down === faced.y) return 'front';
  if (across === -faced.x && down === -faced.y) return 'rear';

  return 'flank';
}

/** What one Squad does to another in one round: the two quantities a fight moves. */
export interface Exchange {
  /** The Squad striking. */
  readonly attacker: Squad;

  /** The Squad being struck. */
  readonly defender: Squad;

  /**
   * The blow, in force points: `POINTS_PER_MAN` of them make one man.
   *
   * This is the number the chain below produces, and the one `woundsOf` adds up
   * across every Squad that struck a defender, so a round's casualties do not
   * depend on how the striking men were divided into Squads.
   */
  readonly points: number;

  /** Men the blow kills, counting this attacker as the defender's only one. */
  readonly men: number;

  /** Morale the blow costs, counting this attacker as the defender's only one. */
  readonly morale: number;
}

/** What a round of blows costs one Squad: the men it loses and the nerve it loses with them. */
export interface Wound {
  /** Force points taken this round, from every Squad that struck it. */
  points: number;

  /** Men the blows kill: the points, floored once per man. */
  men: number;

  /** Morale the blows cost, counted towards breaking. */
  morale: number;
}

/**
 * What `attacker` does to `defender` in one round, as the state stands now.
 *
 * The chain is fixed and worked in this order: the men brought to bear, the
 * shape they hold, the matrix, where the blow lands (`ASPECT_STRIKE`), how well
 * the attacker can guard itself while landing it (`ASPECT_GUARD`), the ground,
 * then fatigue; the volley is added last, as points rather than as a multiplier,
 * because a volley is a fixed weight of missiles and not another percentage. A
 * routed attacker works the same chain scaled by `ROUTED_STRIKE` and gives no
 * shock at all.
 *
 * The answer is what this Squad does when the defender is the only body it is
 * fighting; a Squad fighting on three sides divides its blow among them
 * (`woundsOf`).
 */
export function exchangeOf(attacker: Squad, defender: Squad, map: MapGrid): Exchange {
  const points = forcePointsOf(attacker, defender, map);

  return {
    attacker,
    defender,
    points,
    men: menOfPoints(points),
    morale: shockOf([attacker], defender, map),
  };
}

/**
 * The men `points` buy: floored once, from every blow that landed on one body.
 *
 * A share smaller than a twelfth of a man kills nobody, and deliberately so: a
 * minimum "one man per blow" would let a single small body deal a casualty to
 * each of five enemies it is spread across, which is the same entity-count
 * exploit this scale exists to close, seen from the attacking side. A body that
 * divides its force gets a share of *casualties* in proportion, and a share that
 * rounds away is a force too small to press with.
 */
export function menOfPoints(points: number): number {
  return Math.max(0, Math.floor(points / POINTS_PER_MAN));
}

/**
 * The **force** a Squad brings into a round of contact.
 *
 * Its surviving men, times its type's `impact` (`content/squads.ts`): the number
 * the fight is counted from, and the one number a Siege's ram defence, a
 * blockade, a settlement's centre and a Controller's estimate all read — so the
 * rules, the interface and the AI cannot drift apart on it. This is the only
 * reader of the two; a caller that has neither a Squad nor its type's code has
 * no business pricing a body of men.
 */
export function bearing(squad: Squad): number {
  const type = squadTypeOf(squad.type);

  return type === undefined ? squad.strength : bearingOf(type, squad.strength);
}

/** The force points one Squad lands on one enemy in a round, before its attention is divided. */
function forcePointsOf(attacker: Squad, defender: Squad, map: MapGrid): number {
  const order = isRouting(attacker) ? ROUTED_STRIKE : EVEN;
  const force = scaledBy(bearing(attacker), order);
  const formed = scaledBy(force, FORMATION_STRIKE[formationOf(attacker.formation)]);
  const armed = scaledBy(formed, ADVANTAGE_RATIO[matchupOf(armOfType(attacker.type), armOfType(defender.type))]);
  const landing = scaledBy(armed, ASPECT_STRIKE[aspectOf(attacker, defender)]);
  const guarding = scaledBy(landing, ASPECT_GUARD[aspectOf(defender, attacker)]);
  const grounded = scaledBy(guarding, groundRatio(map, attacker, defender));
  const pressed = Math.max(1, scaledBy(grounded, fatigueRatio(attacker)));

  return pressed + volleyOf(attacker);
}

/**
 * The morale one round of blows costs `defender`, from every Squad pressing it.
 *
 * Counted once per defender and not once per attacker, which is what keeps five
 * 24-man Squads from shaking five times the nerve of the 120-man Squad they
 * would add up to: a body under attack loses `BASE_SHOCK` a round whether one
 * Squad or five are pressing it, and the levers on top are the worst angle among
 * the attackers, whether any of them has the matrix's better arm, whether any of
 * them still has missiles, and the ground the defender stands on.
 *
 * Odds are deliberately **not** a lever. More men already kill more men, so
 * pressing a body with twice the numbers would otherwise be counted twice, and
 * a bigger body would be rewarded for its size in nerve as well as in force —
 * which is exactly the snowball that leaves a coalition of small bodies unable to
 * fight at all (ADR-0028).
 */
export function shockOf(attackers: readonly Squad[], defender: Squad, map: MapGrid): number {
  const pressing = attackers.filter((attacker) => !isRouting(attacker));
  if (pressing.length === 0) return 0;

  const angle = Math.max(...pressing.map((attacker) => ASPECT_SHOCK[aspectOf(attacker, defender)]));
  const edge = pressing.some(
    (attacker) => matchupOf(armOfType(attacker.type), armOfType(defender.type)) === 'advantage',
  ) ? MATCHUP_SHOCK : 0;
  const missiles = pressing.some((attacker) => attacker.ammunition > 0) ? VOLLEY_SHOCK : 0;
  const disordered = terrainAt(map, defender.x, defender.y) === TERRAIN.ford ? FORD_SHOCK : 0;

  return BASE_SHOCK + angle + edge + missiles + disordered;
}

/** The blow points one volley of missiles `attacker` adds: none when it has none. */
function volleyOf(attacker: Squad): number {
  if (attacker.ammunition <= 0) return 0;

  return scaledBy(bearing(attacker), VOLLEY_STRIKE[armOfType(attacker.type)]);
}

/** What the ground under the two Squads does to the blow, as one ratio. */
function groundRatio(map: MapGrid, attacker: Squad, defender: Squad): Ratio {
  const underfoot = terrainAt(map, attacker.x, attacker.y);

  if (underfoot === TERRAIN.ford) return FORD_DISORDER;
  if (underfoot === TERRAIN.forest && armOfType(attacker.type) === 'cavalry') return FOREST_CAVALRY;
  if (terrainAt(map, defender.x, defender.y) === TERRAIN.hill) return HILL_DEFENCE;

  return EVEN;
}

/** What fatigue does to a Squad's strike: fresh is 100, exhausted is 40. */
function fatigueRatio(squad: Squad): Ratio {
  return { times: Math.max(1, 100 - squad.fatigue * FATIGUE_PENALTY), of: 100 };
}

/**
 * The arm a Squad fights with, by its type's content code.
 *
 * @throws RangeError when the code names no Squad type: a Squad in state always
 *   holds a type the content table knows, so this is a raised code that went
 *   wrong rather than a fight that can be half-decided.
 */
export function armOfType(code: number): Arm {
  const type = squadTypeOf(code);
  if (type === undefined) throw new RangeError(`${String(code)} is not a Squad type the content table knows`);

  return type.arm;
}

/** The most morale a Squad's type comes with: what a Season, or a rally, recovers up to. */
export function moraleCeiling(squad: Squad): number {
  return squadTypeOf(squad.type)?.morale ?? squad.morale;
}

/** Every pair of enemy Squads in contact, in the economy's own order. */
export function engagedPairs(economy: Economy): readonly (readonly [Squad, Squad])[] {
  const pairs: [Squad, Squad][] = [];
  const squads = economy.squads.filter(inTheField);

  for (let first = 0; first < squads.length; first += 1) {
    for (let second = first + 1; second < squads.length; second += 1) {
      const one = squads[first];
      const other = squads[second];
      if (one === undefined || other === undefined) continue;
      if (one.owner === other.owner) continue;
      if (inContact(one, other) && contactAllowed(economy, one, other)) pairs.push([one, other]);
    }
  }

  return pairs;
}

/**
 * The enemy Squad this one is in contact with, if any: the first in the economy's
 * order.
 *
 * A garrison is not in the field: it neither fights nor is fought by the contact
 * rules, because what stands between it and the enemy is the wall (C5).
 */
export function engagedWith(economy: Economy, squad: Squad): Squad | undefined {
  if (!inTheField(squad)) return undefined;

  return economy.squads.find(
    (other) => other.owner !== squad.owner && inTheField(other) && inContact(squad, other) && contactAllowed(economy, squad, other),
  );
}

/** Whether a Squad is out in the field rather than inside a settlement's walls. */
function inTheField(squad: Squad): boolean {
  return squad.garrison === FIELD;
}

/** The nearest enemy Squad within `radius` tiles, or `undefined` when there is none. */
export function enemyWithin(economy: Economy, squad: Squad, radius: number): Squad | undefined {
  let nearest: Squad | undefined;
  let closest = radius + 1;

  for (const other of economy.squads) {
    if (other.owner === squad.owner) continue;
    // A garrison is behind a wall, and does not keep a beaten Squad running (C5).
    if (!inTheField(other)) continue;

    const away = Math.max(Math.abs(other.x - squad.x), Math.abs(other.y - squad.y));
    if (away < closest) {
      nearest = other;
      closest = away;
    }
  }

  return nearest;
}

/**
 * Whether a Squad is drawing on its Faction's country: standing inside its own
 * Territory (C6).
 *
 * C3 inferred this from a radius of thirty-two tiles around every settlement the
 * Faction held, and said so: being cut off was a fact about distance, and C6
 * owned the real Territory. It does now — the ground a Faction's settlements
 * give it, in `territory.ts` — so a Squad is in supply exactly when it stands in
 * its own country, and a tile past the boundary is a tile past it.
 */
export function inSupply(economy: Economy, squad: Squad): boolean {
  return holdsTerritory(territoryOf(economy), squad.owner, squad);
}

/**
 * The ground a beaten Squad runs for: the settlement its Faction holds that is
 * nearest to where it stands.
 *
 * Nearest by Chebyshev distance, and the economy's order breaks a tie, so two
 * runs of the same rout run the same way. `null` when the Faction holds nothing
 * at all, which is a Squad with nowhere to run.
 */
export function safetyFor(economy: Economy, squad: Squad): Site | null {
  let haven: Site | null = null;
  let closest = Number.POSITIVE_INFINITY;

  for (const settlement of economy.settlements) {
    if (settlement.owner !== squad.owner) continue;

    const away = Math.max(Math.abs(settlement.x - squad.x), Math.abs(settlement.y - squad.y));
    if (away < closest) {
      closest = away;
      haven = { x: settlement.x, y: settlement.y };
    }
  }

  return haven;
}

/**
 * Obeys the two Commands that are about a fight: `attack` and `withdraw`.
 *
 * `attack` closes with the enemy Squad it names: a Squad already in contact is
 * already fighting, and one that is not is put on the road to the enemy's tile.
 * It is deliberately one order and not a pursuit — following a target across the
 * map is a Controller's business, and repeating the order costs nothing because
 * a route to the tile a Squad is already walking to is not searched for.
 *
 * `withdraw` falls back on the nearest settlement the Faction holds. Which
 * ground is behind you is the rules' question and not the Command's
 * (`docs/COMMANDS.md` says so), and a beaten army running for its own walls is
 * the answer that needs no map-reading from the player who gave the order.
 *
 * A routed Squad obeys neither: it is running, and there is no manual rallying
 * or micro-recovery in this game (the ticket's out of scope).
 */
export function applyCombatCommands(
  economy: Economy,
  map: MapGrid,
  commands: readonly Command[],
  routes: RouteCache,
): void {
  for (const command of commands) {
    const owner = factionCode(command.faction);

    switch (command.kind) {
      case 'attack': {
        const target = economy.squads.find(
          (squad) => squad.id === command.target && squad.owner !== owner,
        );
        if (target === undefined) break;

        for (const squad of orderedSquads(economy, owner, command.squads)) {
          if (inContact(squad, target)) continue;
          orderSquadTo(map, squad, { x: target.x, y: target.y }, routes);
        }
        break;
      }

      case 'withdraw':
        for (const squad of orderedSquads(economy, owner, command.squads)) {
          const haven = safetyFor(economy, squad);
          if (haven !== null) orderSquadTo(map, squad, haven, routes);
        }
        break;

      default:
        break;
    }
  }
}

/**
 * Resolves one tick of the fight, and reports the men it cost.
 *
 * On a tick that is not a round of contact this does nothing at all and answers
 * with nothing: most ticks are that, and a tick that did work here would be a
 * fight whose pace depended on the clock rather than on contact.
 *
 * On a round it computes every exchange from the state the round began with,
 * applies them together, and then does the upkeep every Squad owes the round —
 * fatigue, missiles, Supply, morale recovery, and the rout of whoever broke. The
 * returned casualties are the men who fell, for the field's residue
 * (`residue.ts`), which is the one thing about a fight that leaves state alone.
 */
export function fight(
  economy: Economy,
  map: MapGrid,
  tick: number,
  routes: RouteCache,
): readonly Fallen[] {
  if (tick % EXCHANGE_TICKS !== 0) return [];

  const fallen = applyExchanges(economy, map);
  upkeep(economy, map, routes);

  return fallen;
}

/**
 * Every blow a round of contact contains, gathered per Squad it lands on.
 *
 * Computed from the state as the round *began*, so the answer does not depend on
 * which pair the list happened to walk first: two Squads that hit each other in
 * the same round both hit with the strength they had when it started. Exported
 * because a Siege's storm is the same arithmetic between the men who came
 * through a breach and the men who man it (C5), and a second copy of it would be
 * a second place for the fight to change.
 *
 * Two rules make the answer a fact about bodies of men rather than about Squads:
 *
 * - **A Squad's attention is divided.** Its blow against each enemy is computed
 *   as the chain says, then split by the number of enemies it is fighting, with
 *   the remainder handed to the first of them in the economy's own order. A
 *   block pressed from three sides inflicts its force once, not three times.
 * - **Casualties are floored once per defender.** The points of every blow that
 *   landed on a defender are summed, and only then turned into men, so five
 *   24-man Squads kill what one 120-man Squad kills and not five times as many.
 */
export function woundsOf(
  pairs: readonly (readonly [Squad, Squad])[],
  map: MapGrid,
): ReadonlyMap<Squad, Wound> {
  // Contact is symmetric, so one list per Squad answers both questions: the
  // enemies it lands its force on are the enemies pressing it.
  const engaged = new Map<Squad, Squad[]>();

  for (const [first, second] of pairs) {
    listOf(engaged, first).push(second);
    listOf(engaged, second).push(first);
  }

  const points = new Map<Squad, number>();

  for (const [attacker, targets] of engaged) {
    for (let index = 0; index < targets.length; index += 1) {
      const target = targets[index];
      if (target === undefined) continue;

      const force = forcePointsOf(attacker, target, map);
      const share = Math.floor(force / targets.length) + (index < force % targets.length ? 1 : 0);
      points.set(target, (points.get(target) ?? 0) + share);
    }
  }

  const wounds = new Map<Squad, Wound>();

  for (const [defender, taken] of points) {
    wounds.set(defender, {
      points: taken,
      men: menOfPoints(taken),
      morale: shockOf(engaged.get(defender) ?? [], defender, map),
    });
  }

  return wounds;
}

/** The list a Squad is filed under, made when it is first named. */
function listOf(lists: Map<Squad, Squad[]>, squad: Squad): Squad[] {
  const known = lists.get(squad);
  if (known !== undefined) return known;

  const fresh: Squad[] = [];
  lists.set(squad, fresh);

  return fresh;
}

/** Every blow a round contains, both directions of every engagement, from the state as it was. */
function applyExchanges(economy: Economy, map: MapGrid): readonly Fallen[] {
  const wounds = woundsOf(engagedPairs(economy), map);

  const fallen: Fallen[] = [];
  const standing: Squad[] = [];

  for (const squad of economy.squads) {
    const wound = wounds.get(squad);
    if (wound === undefined) {
      standing.push(squad);
      continue;
    }

    // A beaten Squad with a way out is not butchered: it loses men down to its
    // last one and gets away. One with nowhere to run is destroyed like any
    // other (the ticket's "not annihilated while a route out exists").
    //
    // "Beaten" is read off the morale this blow *leaves*, not off `routing` as it
    // stands: a Squad breaks and is cut down in the same round, and a Squad that
    // routed a round late would be butchered by exactly the blow that broke it.
    const breaks = isRouting(squad) || squad.morale - wound.morale <= BREAKING_MORALE;
    const floor = breaks && squad.steps.length > 0 ? 1 : 0;
    const before = squad.strength;

    squad.strength = Math.max(floor, squad.strength - wound.men);
    squad.morale = Math.max(BREAKING_MORALE, squad.morale - wound.morale);

    const lost = before - squad.strength;
    if (lost > 0) {
      fallen.push({ x: squad.x, y: squad.y, owner: squad.owner, type: squad.type, men: lost });
    }

    if (squad.strength > 0) standing.push(squad);
  }

  economy.squads = standing;

  return fallen;
}

/** What every Squad owes the round, once the blows are in: the slow levers of a fight. */
function upkeep(economy: Economy, map: MapGrid, routes: RouteCache): void {
  for (const squad of economy.squads) {
    const engaged = engagedWith(economy, squad) !== undefined;

    // A march and a fight both cost; standing still out of contact pays back.
    squad.fatigue =
      engaged || squad.steps.length > 0
        ? Math.min(FATIGUE_MAX, squad.fatigue + 1)
        : Math.max(0, squad.fatigue - 1);

    // The volley the exchange above counted is thrown here, and does not come back.
    if (engaged && squad.ammunition > 0) squad.ammunition -= AMMUNITION_PER_VOLLEY;

    if (squad.morale <= BREAKING_MORALE) squad.routing = ROUTING.routed;

    if (isRouting(squad)) run(economy, map, squad, routes);
  }
}

/**
 * A broken Squad's round: it runs for safety, and forms up again when the ground
 * behind it is quiet.
 *
 * Recovery needs the quiet and nothing else — no Command, no general, no player
 * clicking. A routed Squad that is still being hounded does not recover at all,
 * which is what makes chasing a beaten enemy worth doing and what makes a rout
 * a real loss rather than a pause.
 */
function run(economy: Economy, map: MapGrid, squad: Squad, routes: RouteCache): void {
  const hounded = enemyWithin(economy, squad, RALLY_RADIUS) !== undefined;

  if (!hounded) {
    squad.morale = Math.min(moraleCeiling(squad), squad.morale + 1);

    if (squad.morale >= RALLY_MORALE) {
      squad.routing = ROUTING.held;
      squad.steps = [];
      squad.wait = 0;
      return;
    }
  }

  const haven = safetyFor(economy, squad);
  if (haven !== null) orderSquadTo(map, squad, haven, routes);
}

/**
 * Charges every Squad cut off from its Faction's country the morale a Season
 * away from home costs.
 *
 * Called at the Season boundary beside Payroll: a Squad standing outside its own
 * Territory loses `SUPPLY_MORALE_LOSS` (`territory.ts`, since C6 — a radius of
 * thirty-two tiles before it), and one that is already broken stays broken. A Squad that cannot be paid *and* is cut off
 * loses both, which is what makes a campaign fought far from home a decision
 * rather than a free march.
 */
export function supplyMorale(economy: Economy): void {
  for (const squad of economy.squads) {
    if (inSupply(economy, squad)) continue;

    squad.morale = Math.max(BREAKING_MORALE, squad.morale - SUPPLY_MORALE_LOSS);
    if (squad.morale <= BREAKING_MORALE) squad.routing = ROUTING.routed;
  }
}

/**
 * Restocks the missiles of every Squad standing in its own country.
 *
 * Called at a Season boundary by the rules of the Match: a Squad resupplies at
 * the same pace its Faction is paid, which is the economy's own clock rather than
 * a counter of its own. A Squad in the field, out of Supply, gets nothing back —
 * which is what makes a long campaign away from home cost something in the fight
 * as well as in the ledger.
 */
export function resupply(economy: Economy): void {
  for (const squad of economy.squads) {
    if (!inSupply(economy, squad)) continue;

    squad.ammunition = squadTypeOf(squad.type)?.ammunition ?? 0;
  }
}
