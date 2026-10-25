import { describe, expect, it } from 'vitest';
import { observedSettlementSprite, observedSettlementKey, settlementComposition } from '../../src/art/settlement-composition';
import { pixelAt, hashPixelBuffer } from '../../src/art/pixel-buffer';
import type { ObservedSettlement } from '../../src/content/settlement-appearance';

function partial(): ObservedSettlement {
  return { id: 0, kind: 'stronghold', x: 30, y: 30, gateSide: 2,
    owner: null, memory: 'remembered', tiles: [{ cell: 231, seen: 4, visible: false,
      work: { building: 'granary', ordinal: 0, stage: 1, origin: 'rome' } }] };
}

describe('observed settlement composition (#74)', () => {
  it('paints only recorded portions and preserves their recorded construction stage', () => {
    const observed = partial();
    const sprite = observedSettlementSprite(observed);
    expect(sprite.width).toBe(400);
    expect(pixelAt(sprite, 6 * 16 + 4, 9 * 16 + 4)[3]).toBe(255);
    expect(pixelAt(sprite, 6 * 16 + 4, 10 * 16 + 4)[3]).toBe(0);
    expect(pixelAt(sprite, 200, 200)[3]).toBe(0);
    const completed: ObservedSettlement = { ...observed, tiles: observed.tiles.map((tile) => ({ ...tile,
      work: tile.work === undefined ? undefined : { ...tile.work, stage: 2 } })) };
    expect(hashPixelBuffer(observedSettlementSprite(completed))).not.toBe(hashPixelBuffer(sprite));
  });
  it('does not recompose unchanged pixels merely because their sighting timestamp advances', () => {
    const observed = partial();
    const later = { ...observed, tiles: observed.tiles.map((tile) => ({ ...tile, seen: 99 })) };
    expect(observedSettlementKey(later)).toBe(observedSettlementKey(observed));
    expect(observedSettlementSprite(later)).toBe(observedSettlementSprite(observed));
  });
});


it('distinguishes the three tiers and construction phases while preserving inherited architecture (#74)', () => {
  const look = { kind: 'stronghold' as const, owner: 'rome' as const, works: [] };
  const tiers = [1, 2, 3].map((tier) => hashPixelBuffer(settlementComposition({ ...look, tier })));
  expect(new Set(tiers).size).toBe(3);
  const stages = [0, 1, 2].map((stage) => hashPixelBuffer(settlementComposition({ ...look, tier: 1,
    works: [{ building: 'house', ordinal: 0, stage, origin: 'rome' }] })));
  expect(new Set(stages).size).toBe(3);
  const base = partial();
  const tile = { cell: 130, seen: 1, visible: true, tier: 2, origin: 'rome' as const,
    structure: { kind: 'wall' as const, side: 0, condition: 'intact' as const } };
  const before = observedSettlementSprite({ ...base, tiles: [{ ...tile, owner: 'rome' }] });
  const after = observedSettlementSprite({ ...base, tiles: [{ ...tile, owner: 'carthage' }] });
  expect(hashPixelBuffer(before)).toBe(hashPixelBuffer(after));
});

it('does not invent walls for a cell without observed fortification facts', () => {
  const base = partial();
  const sprite = observedSettlementSprite({ ...base, tiles: [{ cell: 130, seen: 1, visible: true }] });
  expect(pixelAt(sprite, 85, 85)[3]).toBe(0);
});
