/**
 * Projection from permitted settlement knowledge to shared rendering and picking.
 * Canonical appearances occupy the same 25-by-25 tile grounds as the simulation;
 * unknown cells are transparent, and recorded cells retain their observed phase.
 * Older external observations without appearance records retain their legacy art.
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
import { settlementLayout } from '../content/settlement-layout.ts';

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
 * Canonical appearances cover the reserved grounds around the centre. The half-tile
 * offset of the theatre's dual grid (`tilePixel`) aligns their cells with terrain.
 */
export function siteRect(site: SiteIdentity & Pick<Partial<KnownSite>, 'appearance'>): PickRect {
  const size = site.appearance === undefined ? SITE_SIZE[site.kind] : settlementLayout(site.kind).grounds.width * TILE_SIZE;
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
  if (site.appearance !== undefined) return { kind: site.kind, owner: site.owner ?? 'none',
    memory: site.memory, gateSide: 'south', gate: null, walls: INTACT_WALLS, ram: 'none', appearance: site.appearance };
  const seen = site.memory === 'seen';
  const owner: SiteOwner = seen && site.owner !== null ? site.owner : 'none';
  const front = seen ? site.front : null;

  if (site.kind === 'settlement') {
    return {
      kind: 'settlement',
      camp: seen && site.camp === true,
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
    camp: seen && site.camp === true,
    owner,
    memory: site.memory,
    gateSide,
    // No front is no fortification *known*: a walled settlement is drawn as a walled
    // settlement, with no gate and no damage invented for it.
    gate: gate === undefined ? null : conditionOf(gate, gate.maxHp ?? GATE_HP),
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

    walls[SIDE_OF_FACING[structure.side]] = conditionOf(structure, structure.maxHp ?? WALL_HP);
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
