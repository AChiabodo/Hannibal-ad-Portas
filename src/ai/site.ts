/**
 * A place on the map as a planning policy reads it, and the one way the policies
 * measure the ground between two of them.
 *
 * A policy never sees a live position: it reads a remembered contact, an owned
 * settlement or a Squad's own tile, and each of those is a `Site`. The distance
 * is Chebyshev — the tiles a body must cross when it moves on both axes at once
 * — and it is stated once here so the field, the siege, the patrols and the
 * contact memory cannot disagree about what "four tiles away" means.
 */

/** A tile, and the only thing a policy knows about where something stands. */
export interface Site {
  readonly x: number;
  readonly y: number;
}

/** The tiles between two places, Chebyshev: a diagonal costs one, as movement does. */
export function distance(a: Site, b: Site): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
