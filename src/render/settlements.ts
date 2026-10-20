/**
 * Where a settlement is drawn, and what it is drawn as (ticket U6).
 *
 * `ui/sites.ts` answers *what the Faction knows of the settlements on the map*; this
 * module is the one step between that answer and the pixels: the theatre rectangle
 * a settlement occupies, and the art look its knowledge adds up to. Both live here so
 * that **the geometry a Player sees and the geometry a click picks are one
 * declaration** — `render/settlement-layer.ts` blits the sprite at `siteRect` and
 * `render/game.ts` hands the same rectangle to `input/selection.ts`, so a
 * structure cannot be drawn in one place and picked in another.
 *
 * The rectangle is the **drawn** extent and not the tile: a settlement stands on
 * one tile of the simulation (ADR-0004's rule for a Squad, and B1's `Site` for a
 * settlement) but is drawn two tiles across, and a Stronghold three and a half. That is
 * the same liberty `render/squads.ts` takes with a block of men, and it changes
 * nothing about the rules: no footprint in the simulation moves, no route is
 * priced differently, and `sim/` cannot see this file. A Player simply clicks what
 * they can see.
 *
 * ## Condition, and the one place it comes from
 *
 * A wall's condition is `sim/siege.ts`'s own hit points: standing and whole is
 * `intact`, standing and hurt is `damaged`, broken is `breached` — the threshold
 * is `WALL_HP`/`GATE_HP`, the same numbers the rules break the wall against, so the
 * drawing cannot disagree with the mechanic about what "damaged" means. The only
 * source is a `VisibleFront`, which the Observation carries for a settlement this
 * Faction holds, besieges or has an eye on (ADR-0020); one it merely remembers
 * has no front, and therefore no condition to draw.
 */
import {
  SITE_SIZE,
  type SettlementLook,
  type SiteCondition,
  type SiteOwner,
  type SiteRam,
  type SiteSide,
} from '../art/settlements.ts';
import type { PickRect } from '../input/selection.ts';
import type { Facing } from '../sim/squad.ts';
import { GATE_HP, WALL_HP, type VisibleFront, type VisibleStructure } from '../sim/siege.ts';
import { TILE_SIZE } from '../sim/map.ts';
import type { KnownSite, SiteIdentity } from '../ui/sites.ts';
import { tilePixel } from './terrain.ts';

/** The four sides of a fortification, in the simulation's own words. */
const SIDE_OF_FACING: Readonly<Record<Facing, SiteSide>> = {
  north: 'north',
  east: 'east',
  south: 'south',
  west: 'west',
};

/** Four walls, whole: what a walled settlement is drawn with when nothing is known against it. */
const INTACT_WALLS: Readonly<Record<SiteSide, SiteCondition>> = {
  north: 'intact',
  east: 'intact',
  south: 'intact',
  west: 'intact',
};

/**
 * The theatre rectangle a settlement occupies: its art, centred on the tile it stands on.
 *
 * Centred, because a settlement is one tile in the rules and every direction out of it
 * is equally its own; the half-tile offset the theatre's dual grid already has
 * (`tilePixel`) is the one the rest of the map is drawn against.
 */
export function siteRect(site: SiteIdentity): PickRect {
  const size = SITE_SIZE[site.kind];
  const at = tilePixel(site.x, site.y);

  return {
    x: at.x + Math.floor(TILE_SIZE / 2) - Math.floor(size / 2),
    y: at.y + Math.floor(TILE_SIZE / 2) - Math.floor(size / 2),
    width: size,
    height: size,
  };
}

/**
 * How near the front a settlement is drawn: the tile row it stands on.
 *
 * The same key `render/squad-layer.ts` sorts blocks of men by, so two settlements on
 * neighbouring rows overlap the way the ground does — the one further down the
 * screen in front.
 */
export function siteDepth(site: SiteIdentity): number {
  return site.y;
}

/**
 * What a settlement is drawn as, from what the Faction knows of it.
 *
 * An open settlement has no walls to describe, so only its owner and its memory
 * reach the art. A walled one reads its four walls, its gate and its ram out of
 * the front — and a settlement that is remembered has no front at all, so it is drawn
 * as a settlement and not as a condition (ADR-0020).
 */
export function siteLook(site: KnownSite): SettlementLook {
  const seen = site.memory === 'seen';
  const owner: SiteOwner = seen && site.owner !== null ? site.owner : 'none';
  const front = seen ? site.front : null;

  if (site.kind === 'settlement') {
    return {
      kind: 'settlement',
      owner,
      memory: site.memory,
      gateSide: 'south',
      gate: null,
      walls: INTACT_WALLS,
      ram: 'none',
    };
  }

  const gate = front === null ? undefined : structureOf(front, 'gate');
  const gateSide = gate === undefined ? 'south' : SIDE_OF_FACING[gate.side];

  return {
    kind: 'stronghold',
    owner,
    memory: site.memory,
    gateSide,
    // No front is no fortification *known*: a walled settlement is drawn as a walled
    // settlement, with no gate and no damage invented for it.
    gate: gate === undefined ? null : conditionOf(gate, GATE_HP),
    walls: wallsOf(front),
    ram: ramOf(front),
  };
}

/** One piece of a fortification, or `undefined` when the front does not carry it. */
function structureOf(front: VisibleFront, kind: VisibleStructure['kind']): VisibleStructure | undefined {
  return front.structures.find((structure) => structure.kind === kind);
}

/** The four walls of a front, by side: whole where the front has no wall for that side. */
function wallsOf(front: VisibleFront | null): Readonly<Record<SiteSide, SiteCondition>> {
  const walls: Record<SiteSide, SiteCondition> = { ...INTACT_WALLS };
  if (front === null) return walls;

  for (const structure of front.structures) {
    if (structure.kind !== 'wall') continue;

    walls[SIDE_OF_FACING[structure.side]] = conditionOf(structure, WALL_HP);
  }

  return walls;
}

/**
 * What is left of one structure, by the hit points the rules give it.
 *
 * The two thresholds are the rules' own: a structure is `breached` exactly when it
 * is no longer standing (the front calls that a breach), and `damaged` when it is
 * hurt but up. Nothing here counts a breach in a way the Siege would not.
 */
function conditionOf(structure: VisibleStructure, full: number): SiteCondition {
  if (!structure.standing) return 'breached';

  return structure.hp < full ? 'damaged' : 'intact';
}

/** The ram at the gate, or none: a settlement with no front has no engine drawn at it. */
function ramOf(front: VisibleFront | null): SiteRam {
  if (front === null || front.ram === null) return 'none';

  return front.ram.built ? 'built' : 'building';
}
