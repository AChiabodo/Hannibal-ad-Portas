import { formationFootprint, type Formation, type Facing } from '../content/formation.ts';
import { rectDistance } from '../content/settlement-layout.ts';
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


/** Public physical facts; older policy fixtures may supply only an anchor. */
export interface FormationSite extends Site {
  readonly engaged?: boolean;
  readonly type?: string;
  readonly capacity?: number;
  readonly formation?: Formation;
  readonly facing?: Facing;
}

export function bodyPerimeterDistance(squad: FormationSite, site: Site, radius: number, figures = squad.capacity): number {
  if (figures === undefined || squad.formation === undefined || squad.facing === undefined) return Math.max(0, distance(squad, site) - radius);
  const footprint = formationFootprint(figures, squad.formation, squad.facing);
  return rectDistance({ x: site.x - radius, y: site.y - radius, width: radius * 2 + 1, height: radius * 2 + 1 },
    { ...footprint, x: squad.x + footprint.x, y: squad.y + footprint.y });
}
