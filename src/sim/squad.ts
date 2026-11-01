/**
 * The Squad as a block: the shape it holds, where its men stand, and the state
 * half of it C1 owns (GLOSSARY: Squad, ADR-0004).
 *
 * A Squad is the atomic unit that is ordered and moved, and it is *one* entity:
 * `economy.ts`'s `Squad` carries what it is to the economy — its type, its home,
 * its Payroll and its morale — and this module is the half that walks, which the
 * economy's `Squad` carries as a `Block`. The men inside it are drawing and
 * nothing else: they are never simulated one at a time, never given a tile or a
 * path of their own, and never asked what they think.
 *
 * The shape is derived, not stored, and that is the point of the block below:
 * `frontage`, `depth` and `menOf` answer from the formation a Squad holds and
 * the men it has left, so a Squad that turns, marches or loses a man keeps its
 * formation without anything having to be rearranged. A block that held its
 * men's places as state could be reordered by accident, and then a turn would
 * shuffle the ranks and a Squad would lose a man from the front; the derivation
 * makes both impossible rather than unlikely.
 *
 * The men are a *list* in a fixed order — the front rank first, left to right,
 * then the rank behind it — and that order is the identity of the men: index 0
 * is the man at the front left for as long as he lives, and a Squad that loses a
 * man loses the last one in the list. C2 draws exactly this list, which is what
 * "individual soldiers visibly thin out as the Squad loses strength" is made of.
 *
 * Nothing here knows about pixels. How far apart men are drawn, and which way
 * round the block is rotated for a facing, is the renderer's business (C2); what
 * is not is how many men stand abreast and how many ranks deep, which decides
 * how hard the Squad hits and how wide a front it offers (C3).
 *
 * The one thing here that is state rather than derivation is `Block`: where a
 * Squad stands, the shape it holds, the way it faces, the route it is walking
 * and the posture it holds, which is C1's half of the Squad B6's economy carries
 * the other half of. Its geometry is still derived — `frontage`, `depth` and
 * `menOf` read the shape and the men, never a stored frontage — so a Squad
 * cannot be moved into a shape its own numbers disagree with. C3 added the
 * fight's three numbers (fatigue, ammunition and the routing flag) and C5 added
 * `garrison`, because a Squad that is inside a settlement rather than in the
 * field is a posture of the same entity and no system owns a second Squad.
 */
import { FORMATIONS, type Formation } from './command.ts';
import { NO_REFUSAL } from './route.ts';
import type { Facing } from '../content/formation.ts';

/**
 * The four directions a Squad can face, as state holds them.
 *
 * Four logical directions and no more: the map is orthogonal top-down with no
 * playable elevation, so a Squad faces one of the four sides of its tile
 * (ADR-0007). A facing is not decoration — C3 flanks whoever is facing away
 * from it — so it is state, and like every other word in state it is an
 * integer.
 */
export const FACING = {
  north: 0,
  east: 1,
  south: 2,
  west: 3,
} as const;

/** One of the four directions a Squad can face. */
export type { Facing } from '../content/formation.ts';

/** The four facings, in code order: what a report, a dump or a drawing walks. */
export const FACINGS: readonly Facing[] = ['north', 'east', 'south', 'west'];

/** The number a facing is held as. */
export function facingCode(facing: Facing): number {
  return FACING[facing];
}

/** The facing a number names. @throws RangeError when it names none. */
export function facingOf(code: number): Facing {
  const facing = FACINGS[code];
  if (facing === undefined) throw new RangeError(`${String(code)} is not a facing a Squad can hold`);

  return facing;
}

/**
 * The two shapes a Squad can hold, as state holds them.
 *
 * `line` favours frontage and `column` favours depth (PLAN §4): a line is as
 * wide as a block gets and a column as narrow, so what the two do to a route, a
 * fight and a drawing is a consequence of one number each rather than a special
 * case anywhere. The words are the Command vocabulary's own (`command.ts`), and
 * the numbers are the order that vocabulary lists them in — which is why
 * `formationOf` reads a code back out of `FORMATIONS` rather than keeping a
 * second list of its own.
 */
export const FORMATION = {
  line: 0,
  column: 1,
} as const;

/** The number a formation is held as. */
export function formationCode(formation: Formation): number {
  return FORMATION[formation];
}

/** The formation a number names. @throws RangeError when it names none. */
export function formationOf(code: number): Formation {
  const formation = FORMATIONS[code];
  if (formation === undefined) throw new RangeError(`${String(code)} is not a formation a Squad can hold`);

  return formation;
}

/**
 * The settlement a Squad is not garrisoning: it is in the field (C5).
 *
 * The sentinel of `Block.garrison`, and a number no settlement id can be, for
 * the same reason `UNOWNED` is one no Faction can be (`economy.ts`).
 */
export const FIELD = -1;

/**
 * How tired a Squad can get: the top of the fatigue scale (C3).
 *
 * Fatigue is a number in state rather than a flag because a fight is moved by
 * *how* tired a Squad is, not by whether it is: a block that has marched twenty
 * tiles fights worse than one that has marched four, and the scale is what lets
 * a rule say so without a second table of states.
 */
export const FATIGUE_MAX = 20;

/**
 * What a Squad's nerve is doing, as state holds it (C3).
 *
 * A Squad is `held` while it stands and fights, and `routed` once its morale has
 * gone: a routed Squad runs for safety, fights barely, and forms up again on its
 * own when the ground behind it is quiet. There is no third word, because there
 * is no manual rallying and no micro-recovery in this game (ADR-0004).
 *
 * A flag of two words rather than a boolean, because every other word in state
 * is an integer code (ADR-0006) and `serializeState` refuses booleans.
 */
export const ROUTING = {
  held: 0,
  routed: 1,
} as const;

/**
 * Whether a Squad has broken and is running: the one question a rule asks of
 * `routing`.
 *
 * There is deliberately no `routingOf`/`routingCode` pair beside it, the way the
 * facings have one: a facing is a word a report and a drawing both spell, and
 * this is a flag only the rules read — so a vocabulary nobody walks would be two
 * exported names and a test for nothing.
 */
export function isRouting(shape: { readonly routing: number }): boolean {
  return shape.routing === ROUTING.routed;
}

/**
 * How many files a block stands in, by the shape it holds.
 *
 * The number is fixed, and that is the design: a line is twelve files abreast
 * however many men are in it, and a column is three, and the men fill the files
 * in the front rank first. A block whose width grew and shrank with the men in
 * it would rearrange itself every time a man fell — a squad two files wide with
 * thirteen men becomes a single file with twelve, and every man in it moves —
 * which is exactly the arbitrary rearrangement the Squad is supposed to be
 * incapable of. With the files fixed, losing a man loses the last one and moves
 * nobody, and a drawing code can show the same man in the same place from one
 * tick to the next.
 *
 * Twelve abreast is as wide as a block gets, because a Squad has to read as one
 * thing on screen and a frontage that grew with every recruit would not; three
 * abreast is a column - narrow enough to be a column, wide enough not to be a
 * rope. A Squad bigger than twelve files grows in ranks instead, which is what
 * a real one did.
 */
const FILES: Readonly<Record<Formation, number>> = {
  line: 12,
  column: 3,
};

/**
 * The shape a block holds: the formation, and how many men are left in it.
 *
 * This is what the three derivations below read, and nothing else. A `Block` —
 * the whole of what a Squad is on the map — is a `Shape` and more, so a Squad
 * is handed to `frontage`, `depth` and `menOf` directly; a caller that has the
 * two numbers and no Squad (a test, a drawing code holding a remembered shape)
 * hands over a `Shape` of its own.
 */
export interface Shape {
  /** The shape it holds, as a `FORMATION` code. */
  readonly formation: number;

  /** How many men are left in it. */
  readonly strength: number;
}

/**
 * How many men a block has in its front rank: every man it has, up to the files
 * its shape stands in.
 *
 * A line with five men has a frontage of five; with forty, twelve, because the
 * other twenty-eight are in the ranks behind. It is how wide the block is drawn
 * and how wide it stands, and it is the number a drawing code needs; the number a
 * fight is decided by is the **force** the men bring (`content/squads.ts`,
 * `sim/combat.ts`), which is not read off the files — a full line saturates at
 * twelve, and a blow read off the file count would let a Player buy five times the
 * damage by splitting one body into five Squads (ADR-0028).
 *
 * @throws RangeError when the block has no men in it, or holds a formation no
 *   Squad can hold.
 */
export function frontage(shape: Shape): number {
  return Math.min(requireStrength(shape), filesOf(shape));
}

/**
 * How many ranks deep a block stands: as few as hold every man abreast of it.
 *
 * @throws RangeError as `frontage` does.
 */
export function depth(shape: Shape): number {
  return Math.ceil(requireStrength(shape) / filesOf(shape));
}

/** One man's place in the block: `file` abreast from the block's left, `rank` from its front. */
export interface Man {
  /** How far along the front he stands: 0 is the block's left end. */
  readonly file: number;

  /** Which rank he stands in: 0 is the front rank. */
  readonly rank: number;
}

/**
 * Every man in the block, in the order he is drawn: the front rank first, left
 * to right, then the rank behind it, and so on.
 *
 * The list is the block's men in the order they fill it, so losing men loses
 * the men at the end of it and nobody else: `menOf` of a Squad with one man
 * fewer is `menOf` of the Squad with one man more, minus its last man. That is
 * what lets C2 thin a Squad out on screen without the block appearing to
 * shuffle, and it is a property of the shape being fixed rather than of any
 * code remembering where a man stood.
 *
 * The array is built fresh on every call, because it is derived and nothing
 * remembers it (ADR-0006: derived values are not state). A caller that draws
 * every frame and wants to save the work should hold on to the list for as long
 * as the formation and the strength do not change.
 *
 * @throws RangeError when the block has no men in it, or holds a formation no
 *   Squad can hold.
 */
export function menOf(shape: Shape): readonly Man[] {
  const wide = filesOf(shape);
  const men: Man[] = [];

  for (let index = 0; index < requireStrength(shape); index += 1) {
    men.push({ file: index % wide, rank: Math.floor(index / wide) });
  }

  return men;
}

/** The files a block's formation stands in. @throws RangeError when it holds no formation a Squad can hold. */
function filesOf(shape: Shape): number {
  return FILES[formationOf(shape.formation)];
}

/** The men a block holds, refusing a block that holds nobody. */
function requireStrength(shape: Shape): number {
  if (!Number.isInteger(shape.strength) || shape.strength < 1) {
    throw new RangeError(
      `a Squad of ${String(shape.strength)} men has left the field, and a block of nobody has no shape`,
    );
  }

  return shape.strength;
}

/**
 * The block a Squad is: where it stands, the shape it holds, the way it faces,
 * and the route it is walking.
 *
 * This is the half of a Squad that C1 owns — the half B6 deliberately left
 * beside the economy's own (`economy.ts` says so) — and the two are one entity:
 * a `Squad` is a `Block` with an id, a Faction, a type, a home and its Payroll
 * beside it. That is why nothing here is called a Squad: a Squad is this half
 * and the economy's together, and the only type that is one is `economy.ts`'s.
 *
 * Held as integers and plain arrays because it is authoritative state, which
 * `serializeState` refuses to write otherwise (ADR-0006): the facings and the
 * formations are the codes above, and the tiles a Squad still has to walk are
 * the map's own flat indices, nearest first. The words live in the Command
 * vocabulary and in Observations, which are not state.
 *
 * Where a Squad is going is its last step and nothing else: there is no separate
 * goal to fall out of step with the route, no order that survives being carried
 * out, and arriving is what an empty `steps` is. A Squad that has been told to
 * hold, one that has arrived, and one that was never ordered anywhere are
 * therefore the same state, which is the truth about all three.
 *
 * The fields are mutable because the rules own them: a tick that could not move
 * a Squad would not be a tick. Everything else about a Squad — what it looks
 * like, how wide it stands, where its men stand in it — is derived from these.
 */
export interface Block extends Shape {
  /** Shared FIFO for Gate/Breach/Bridge passage; bridge access uses settlement -1 and a stable tile-based passage. */
  access?: { settlement: number; passage: number; ticket: number; active: number; reason: number;
    yielding: number; goalX: number; goalY: number };
  /** Aggregate admission/departure; no individual soldier state. */
  garrisonJourney?: {
    settlement: number;
    phase: number;
    remaining: number;
    ticket: number;
    goalX: number;
    goalY: number;
    fromOutside: number;
    reason?: number;
  };
  /** Requested shape retained while a real marching column clears an access. */
  marchFormation?: number;
  /**
   * The shape it holds, as a `FORMATION` code: the one part of `Shape` a rule
   * writes, when a Formation Command arrives.
   */
  formation: number;

  /**
   * How many men are left in it. C1 sets it when a Squad is raised, from the
   * type; C3 is the ticket that takes men off it.
   */
  strength: number;

  /**
   * How tired it is, from 0 to `FATIGUE_MAX`: a march and a fight both add to
   * it, standing still out of contact takes it away, and a tired Squad strikes
   * weakly (C3).
   */
  fatigue: number;

  /**
   * How many volleys of missiles it still carries, if any: spent in the first
   * rounds of a contact and restocked only in its own country (C3).
   */
  ammunition: number;

  /**
   * Its nerve, as a `ROUTING` code: `held` while it fights, `routed` once it has
   * broken. A routed Squad runs for safety and forms up again by itself (C3).
   */
  routing: number;

  /** The tile it stands on: one tile, because the Squad is the atomic unit (ADR-0004). */
  x: number;

  /** The tile it stands on, downwards. */
  y: number;

  /** The way it now faces, as a `FACING` code: the way it is about to step, or last stepped. */
  facing: number;

  /**
   * The tiles still to enter before it is there, nearest first, the destination
   * last: empty when it has nowhere left to walk.
   */
  steps: number[];

  /** Ticks still to wait before it enters the next tile: 0 when it is standing still. */
  wait: number;

  /** Why the last move Command it was given could not be carried out, or `NO_REFUSAL` (`route.ts`). */
  refused: number;

  /**
   * The settlement it is garrisoning, or `FIELD` when it is in the field (C5).
   *
   * A garrison is a posture and not a place: a garrisoned Squad stands at its
   * settlement's centre but is *inside* it, so the fight's contact rules skip it
   * (`combat.ts`) — the walls, not the men, are what an enemy at the gate is
   * facing — while the settlement's own eyes, supply and Payroll still cover it.
   * Any order that puts it on the road takes it out of the garrison again
   * (`movement.ts`), which is the whole of how a garrison sallies.
   */
  garrison: number;
}

/**
 * A block where a Squad starts: on a tile, in a line, facing south, going nowhere.
 *
 * The one place that says what a Squad raised on a map begins as, so recruitment
 * (`economy.ts`) and the scenarios that muster one (`movement.ts`) cannot start
 * Squads that differ in some field nobody thought about. South is as arbitrary
 * as any other answer to "which way is a new Squad facing" — the first step it
 * takes turns it anyway — and `strength` is what a full-strength Squad of its
 * type is counted as (`content/`), until C3 takes men off it.
 *
 * A Squad begins fresh, unwounded and in good order: no fatigue, however far it
 * walked to be raised here; whatever missiles its type carries; and its nerve
 * held. C3 is the ticket that moves all three, and the state they begin in is
 * this function's to say for the same reason the rest of it is.
 */
export function standingAt(x: number, y: number, strength: number, ammunition = 0): Block {
  return {
    x,
    y,
    strength,
    fatigue: 0,
    ammunition,
    routing: ROUTING.held,
    formation: FORMATION.line,
    facing: FACING.south,
    steps: [],
    wait: 0,
    refused: NO_REFUSAL,
    garrison: FIELD,
  };
}
