import { expect, it } from 'vitest';
import { createAssaultReadiness } from '../../src/ai/assault.ts';

it('keeps an adjacent purchased body with a paid ram even when its anchor is farther from the wall (#74)', () => {
  const ready = createAssaultReadiness({ siegeRadius: 1, settlementRadius: 7, assaultTicks: 10, wallShock: 1 });
  const visible = { contacts: [{ id: 1, kind: 'stronghold' as const, x: 80, y: 80 }],
    fronts: [{ settlement: 1, besieger: 'rome' as const, siege: 'assault' as const,
      ram: { hp: 60, built: false, remaining: 10 } }] };
  const adjacent = { x: 70, y: 80, type: 'hastati', capacity: 120, formation: 'line' as const, facing: 'south' as const, morale: 4 };
  expect(ready('rome', visible, adjacent)).toBe(true);
  expect(ready('rome', visible, { ...adjacent, x: 66 })).toBe(false);
});


it('finishes an uncontested approach through a known open empty ring without requiring sight of the ram (#74)', () => {
  const ready = createAssaultReadiness({ siegeRadius: 1, settlementRadius: 7, assaultTicks: 10, wallShock: 1 });
  const front = { settlement: 1, besieger: 'rome' as const, siege: 'assault' as const, breached: true, garrison: 0, ram: null };
  const visible = { contacts: [{ id: 1, kind: 'stronghold' as const, x: 75, y: 75 }], fronts: [front] };
  const squad = { x: 71, y: 75, type: 'principes', capacity: 120, formation: 'column' as const, facing: 'east' as const, morale: 6 };
  expect(ready('rome', visible, squad)).toBe(true);
  expect(ready('rome', { ...visible, fronts: [{ ...front, breached: false }] }, squad)).toBe(false);
  expect(ready('rome', { ...visible, fronts: [{ ...front, garrison: 1 }] }, squad)).toBe(false);
  expect(ready('rome', visible, { ...squad, engaged: true })).toBe(false);
});
