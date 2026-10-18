/**
 * The residue of a fight: the men a Squad lost, left lying where they fell
 * (PLAN §4, ticket C3).
 *
 * Corpses in this game are **drawing and nothing else**. They have no effect on
 * a fight, no effect on a route, no effect on morale and no effect on the state
 * hash; they fade after about thirty seconds of Match time and leave the field
 * as if they had never been. That is exactly why they live here rather than in
 * `Economy`: `serializeState` refuses anything that is not integer state, and a
 * field that came and went would make the same Match hash differently depending
 * on how long a corpse had left to live (ADR-0006).
 *
 * ## The one piece of state-like memory outside the hash
 *
 * The store is a `WeakMap` keyed by the economy object, which is the same trick
 * `movement.ts` plays with its route cache and `economy.ts` with its land cache:
 * a derived or decorative value remembered beside a Match rather than inside it.
 * A Match that recorded a thousand corpses and one that recorded none are the
 * same Match, hash for hash, which `residue.test.ts` asserts directly. A map or
 * an economy that goes out of scope takes its residue with it, and two Matches
 * playing at once cannot see each other's dead.
 *
 * ## Determinism without a die
 *
 * Nothing here draws from the Match's random source, on purpose: a draw would
 * move the generator's cursor, and the cursor is part of the hash — so decorating
 * the field would change the Match. A corpse's place is its own data (the tile
 * the men fell on, and a tick that is already in state) pushed through an
 * integer hash, which is deterministic, cheap, and invisible to everything the
 * rules own.
 *
 * ## What a corpse is not
 *
 * A corpse is not a Squad: it holds no men, fights nobody, and blocks no tile.
 * It is a mark with a birth tick and a count, and `corpsesOf` is the whole of
 * what a drawing code needs to fade one out.
 */
import type { Economy } from './economy.ts';

/**
 * How long a corpse lies on the field, in ticks: about thirty seconds at the
 * 10 Hz clock, which is the plan's number (PLAN §4).
 */
export const CORPSE_TICKS = 300;

/**
 * The last stretch of that life during which a corpse is visibly going: a body
 * that vanished on one tick would read as a rendering bug, and one that faded
 * for its whole life would be faint from the moment it fell.
 */
export const CORPSE_FADE_TICKS = 100;

/**
 * The most marks the field will hold at once.
 *
 * A big fight produces one mark per round per Squad, so a battle between two
 * dozen Squads would otherwise grow without bound over a long campaign. The
 * oldest marks are dropped when the cap is reached: the field is a picture, and
 * the picture a Player is looking at is the recent one.
 */
export const CORPSE_LIMIT = 96;

/**
 * Where men fell, and how many of them, as a fight reports it.
 *
 * `owner` is the Faction that lost them — the cloth a body is drawn in — and
 * `type` is the Squad's content code, so the body is the shape of the men who
 * actually died rather than a generic one.
 */
export interface Fallen {
  /** The tile the Squad stood on. */
  readonly x: number;

  /** The tile the Squad stood on, downwards. */
  readonly y: number;

  /** The Faction that lost these men, as `FactionCode` holds it. */
  readonly owner: number;

  /** The Squad type they were, as a content code. */
  readonly type: number;

  /** How many men this mark stands for. */
  readonly men: number;
}

/** One mark on the field: a `Fallen` report, and the tick it fell on. */
export interface Corpse extends Fallen {
  /** The tick the men fell, which is what it fades from and what spreads them out. */
  readonly born: number;
}

/** The residue one theatre remembers: the marks still lying on it, oldest first. */
export interface Residue {
  /** The corpses on the field. Written by `recordCasualties` and `fadeResidue`, read by a drawing code. */
  corpses: Corpse[];
}

/** The residue of each Match's economy, kept beside the Match rather than in it. */
const RESIDUE = new WeakMap<Economy, Residue>();

/**
 * The residue this Match's economy remembers, made the first time it is asked
 * for.
 *
 * Lazy rather than created with the economy, so that a Match nobody ever fights
 * in pays nothing for corpses, and so that every caller that wants the field —
 * a rule that records a loss, a drawing code that reads one — reaches the same
 * list without either of them having to thread it through state.
 */
export function residueFor(economy: Economy): Residue {
  const known = RESIDUE.get(economy);
  if (known !== undefined) return known;

  const residue: Residue = { corpses: [] };
  RESIDUE.set(economy, residue);

  return residue;
}

/**
 * Lays the men a round of fighting cost on the field.
 *
 * Called with what a fight reported and nothing else: an empty list is the
 * ordinary case, because most ticks are not a round of contact and most rounds
 * are not a round in which anybody dies.
 */
export function recordCasualties(economy: Economy, fallen: readonly Fallen[], tick: number): void {
  if (fallen.length === 0) return;

  const residue = residueFor(economy);
  for (const report of fallen) {
    if (report.men <= 0) continue;

    residue.corpses.push({ ...report, born: tick });
  }

  const excess = residue.corpses.length - CORPSE_LIMIT;
  if (excess > 0) residue.corpses.splice(0, excess);
}

/** Takes the marks that have outlived `CORPSE_TICKS` off the field. */
export function fadeResidue(economy: Economy, tick: number): void {
  const residue = residueFor(economy);
  if (residue.corpses.length === 0) return;

  residue.corpses = residue.corpses.filter((corpse) => isLying(corpse, tick));
}

/**
 * The marks still lying on the field at `tick`, oldest first, without touching
 * the list.
 *
 * A corpse that has outlived its thirty seconds is not returned even if it has
 * not been swept yet, so a drawing code never has to know when the sweep runs:
 * `fadeResidue` keeps the list small, and this keeps the picture honest.
 */
export function corpsesOf(economy: Economy, tick: number): readonly Corpse[] {
  return residueFor(economy).corpses.filter((corpse) => isLying(corpse, tick));
}

/** Whether a mark is still on the field: it fell less than `CORPSE_TICKS` ago. */
export function isLying(corpse: Corpse, tick: number): boolean {
  const age = tick - corpse.born;

  return age >= 0 && age < CORPSE_TICKS;
}
