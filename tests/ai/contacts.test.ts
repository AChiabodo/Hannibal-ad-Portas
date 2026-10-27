import { expect, it } from 'vitest';
import { permittedContacts } from '../../src/ai/contacts.ts';
import type { ObservedSettlement } from '../../src/content/settlement-appearance.ts';

it('uses actual recorded features while excluding own sites and newer empty-ground glimpses (#74)', () => {
  const enemy: ObservedSettlement = { id: 1, kind: 'stronghold', x: 80, y: 80, gateSide: 3,
    memory: 'seen', owner: null, tiles: [
      { cell: 137, seen: 10, visible: false, structure: { kind: 'wall', side: 0, condition: 'damaged' } },
      { cell: 0, seen: 100, visible: true },
    ] };
  expect(permittedContacts({ contacts: [], appearances: [enemy, { ...enemy, id: 0 }], settlements: [{ id: 0 }] }))
    .toEqual([{ kind: 'stronghold', id: 1, x: 80, y: 80, seen: 10, type: null }]);
  expect(permittedContacts({ contacts: [], appearances: [{ ...enemy, tiles: [{ cell: 0, seen: 100, visible: true }] }] })).toEqual([]);
});
