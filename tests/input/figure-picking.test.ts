import { expect, it } from 'vitest';
import { pickableAt, selectIn, NOTHING_SELECTED, type Pickable } from '../../src/input/selection';

it('picks visible ink behind a vacant slot and ignores an empty box', () => {
  const rear: Pickable = { kind: 'settlement', id: 1, layer: 1, depth: 0, rect: { x: 10, y: 20, width: 2, height: 1 } };
  const front: Pickable = { ...rear, kind: 'squad', id: 2, layer: 11,
    ink: { width: 2, height: 1, pixels: [20, 20, 20, 255, 0, 0, 0, 0] } };
  expect(pickableAt([rear, front], { x: 10, y: 20 })?.id).toBe(2);
  expect(pickableAt([rear, front], { x: 11, y: 20 })?.id).toBe(1);
  expect(selectIn(NOTHING_SELECTED, [front], { x: 11, y: 20, width: 1, height: 1 })).toEqual(NOTHING_SELECTED);
  expect(selectIn(NOTHING_SELECTED, [front], { x: 10, y: 20, width: 1, height: 1 }).squads).toEqual([2]);
});
