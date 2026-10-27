import { describe, expect, it } from 'vitest';
import { settlementLayout, intersects, containsTile } from '../../src/content/settlement-layout';
import { settlementComposition } from '../../src/art/settlement-composition';
import { hashPixelBuffer } from '../../src/art/pixel-buffer';

describe('the public settlement plan (#74)', () => {
  it('keeps an undeveloped minor centre compact inside its reserved growth grounds', () => {
    for (const gateSide of [0, 1, 2, 3]) {
      const image = settlementComposition({ kind: 'settlement', tier: 1, owner: 'none', gateSide, works: [] });
      const painted: { x: number; y: number }[] = [];
      for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
        if (image.pixels[(y * image.width + x) * 4 + 3] !== 0) painted.push({ x, y });
      }
      expect(painted.length).toBeGreaterThan(0);
      expect(Math.max(...painted.map(({ x }) => x)) - Math.min(...painted.map(({ x }) => x)) + 1).toBeLessThanOrEqual(7 * 16);
      expect(Math.max(...painted.map(({ y }) => y)) - Math.min(...painted.map(({ y }) => y)) + 1).toBeLessThanOrEqual(7 * 16);
      expect(image.width).toBe(25 * 16);
      expect(settlementLayout('settlement').lots).toHaveLength(25);
    }
  });
  it('joins intact wall segments continuously along their vertical sides', () => {
    for (const origin of ['rome', 'carthage'] as const) for (const tier of [1, 2, 3]) {
      const image = settlementComposition({ kind: 'stronghold', tier, origin, owner: 'none', gateSide: 2, works: [] });
      // Every cross-section between the corner towers must hit masonry,
      // including tile joins; the three-tile southern gate is elsewhere.
      for (const x of [5 * 16, 19 * 16]) for (let y = 6 * 16; y < 19 * 16; y += 1) {
        const opaque = Array.from({ length: 16 }, (_, dx) => image.pixels[(y * image.width + x + dx) * 4 + 3]);
        expect(opaque.some((alpha) => alpha !== 0), `${origin} Tier ${tier}, wall ${x}, row ${y}`).toBe(true);
      }
    }
  });
  it('distinguishes the initial architectural traditions by silhouette with flags and colours removed', () => {
    for (const tier of [1, 2, 3]) {
      const silhouettes = (['rome', 'carthage'] as const).map((origin) => {
        const image = settlementComposition({ kind: 'stronghold', tier, origin, owner: 'none', works: [] });
        return Array.from(image.pixels).filter((_value, index) => index % 4 === 3);
      });
      expect(silhouettes[0], `Tier ${tier}`).not.toEqual(silhouettes[1]);
    }
  });
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
