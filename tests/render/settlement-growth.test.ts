import { describe, expect, it } from 'vitest';
import { settlementLayout, intersects, containsTile } from '../../src/content/settlement-layout';
import { settlementComposition } from '../../src/art/settlement-composition';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';

describe('the public settlement plan (#74)', () => {
  it('holds every individual Work without occupying its square, muster or entrance', () => {
    for (const kind of ['stronghold', 'settlement'] as const) {
      const plan = settlementLayout(kind);
      expect(plan.lots).toHaveLength(25);
      expect(plan.lots.filter((lot) => lot.building === 'house')).toHaveLength(4);
      expect(plan.lots.filter((lot) => lot.building === 'granary')).toHaveLength(2);
      for (const [index, lot] of plan.lots.entries()) {
        expect(intersects(lot, plan.capture), `${kind}/${lot.building}: capture`).toBe(false);
        expect(intersects(lot, plan.muster), `${kind}/${lot.building}: muster`).toBe(false);
        expect(containsTile(plan.grounds, lot.x, lot.y)).toBe(true);
        expect(containsTile(plan.grounds, lot.x + lot.width - 1, lot.y + lot.height - 1)).toBe(true);
        for (const other of plan.lots.slice(index + 1)) {
          expect(intersects(lot, other), `${lot.building}/${other.building}`).toBe(false);
        }
      }
      expect(plan.lots.filter((lot) => lot.exterior)).toHaveLength(15);
      expect(plan.lots.some((lot) => containsTile(lot, plan.assembly.x, plan.assembly.y))).toBe(false);
    }
  });
  it('makes each completed copy, Tier and architectural tradition visible', () => {
    const base = { kind: 'stronghold' as const, owner: 'rome' as const, tier: 1, works: [] };
    const empty = settlementComposition(base);
    const first = settlementComposition({ ...base, works: [{ building: 'granary', ordinal: 0, stage: 2, origin: 'rome' as const }] });
    const second = settlementComposition({ ...base, works: [
      { building: 'granary', ordinal: 0, stage: 2, origin: 'rome' as const },
      { building: 'granary', ordinal: 1, stage: 2, origin: 'rome' as const },
    ] });
    expect(empty.width).toBe(400);
    expect(new Set([empty, first, second].map(hashPixelBuffer)).size).toBe(3);
    expect(new Set([1, 2, 3].map((tier) => hashPixelBuffer(settlementComposition({ ...base, tier })))).size).toBe(3);
    expect(hashPixelBuffer(settlementComposition({ ...base, works: [{ building: 'granary', ordinal: 0, stage: 2, origin: 'carthage' }] }))).not.toBe(hashPixelBuffer(first));
  });
});
