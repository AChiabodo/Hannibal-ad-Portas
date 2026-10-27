import { containsTile, intersects, rectDistance } from '../content/settlement-layout.ts';
export { rectDistance } from '../content/settlement-layout.ts';
import type { Economy, Settlement, Squad } from './economy.ts';
import { coreOf, squadGround } from './settlement-space.ts';

/** Distances use the actual body and the inhabited perimeter, in whole tiles. */
export function perimeterDistance(economy: Economy, site: Settlement, squad: Squad): number {
  return rectDistance(coreOf(economy, site), squadGround(squad));
}

export function outsideCore(economy: Economy, site: Settlement, squad: Squad): boolean {
  return !intersects(coreOf(economy, site), squadGround(squad));
}

export function insideCore(economy: Economy, site: Settlement, squad: Squad): boolean {
  const core = coreOf(economy, site);
  return containsTile(core, squad.x, squad.y);
}
