import { describe, expect, it } from 'vitest';
import { knownSites } from '../../src/ui/sites';
import { createSiegeWorld, observeSiege } from '../../src/sim/siege';
import { siteLook, siteRect } from '../../src/render/settlements';
import { siteSprite } from '../../src/art/settlements';
import { pixelAt } from '../../src/art/pixel-buffer';
import type { ObservedSettlement } from '../../src/content/settlement-appearance';

describe('the permitted settlement appearance projection (#74)', () => {
  it('shows a seen corner without requiring or revealing the unexplored centre', () => {
    const base = observeSiege(createSiegeWorld(1), 'rome');
    const appearance: ObservedSettlement = { id: 9, x: 50, y: 50, kind: 'stronghold', gateSide: 2,
      memory: 'seen', owner: null, tiles: [{ cell: 231, seen: 8, visible: true,
        work: { building: 'granary', ordinal: 0, stage: 1, origin: 'carthage' } }] };
    const visible = { ...base, appearances: [appearance], settlements: [], fronts: [], contacts: [] };
    const sites = knownSites([{ id: 9, x: 50, y: 50, kind: 'stronghold' }], visible, base.fog, 'rome');
    expect(sites).toHaveLength(1);
    expect(sites[0]?.owner).toBeNull();
    expect(siteRect(sites[0]!)).toMatchObject({ width: 400, height: 400 });
    const sprite = siteSprite(siteLook(sites[0]!));
    expect(pixelAt(sprite, 100, 148)[3]).toBe(255);
    expect(pixelAt(sprite, 200, 200)[3]).toBe(0);
  });
});
