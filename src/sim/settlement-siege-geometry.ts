import { containsTile, intersects, type GroundRect } from '../content/settlement-layout.ts';
import type { Economy, Settlement, Squad } from './economy.ts';
import { coreOf, squadGround } from './settlement-space.ts';

/** Distances use the actual body and the inhabited perimeter, in whole tiles. */
export function perimeterDistance(economy: Economy, site: Settlement, squad: Squad): number {
  return rectDistance(coreOf(economy, site), squadGround(squad));
}

export function rectDistance(a: GroundRect, b: GroundRect): number {
  return Math.max(0, a.x - (b.x + b.width - 1), b.x - (a.x + a.width - 1),
    a.y - (b.y + b.height - 1), b.y - (a.y + a.height - 1));
}

export function outsideCore(economy: Economy, site: Settlement, squad: Squad): boolean {
  return !intersects(coreOf(economy, site), squadGround(squad));
}

export function insideCore(economy: Economy, site: Settlement, squad: Squad): boolean {
  const core = coreOf(economy, site);
  return containsTile(core, squad.x, squad.y);
}
