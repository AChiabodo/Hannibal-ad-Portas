import {
  assault,
  attack,
  attackMove,
  attackStructure,
  blockade,
  build,
  cancelPending,
  cancelFortificationRepair,
  cancelWorkRepair,
  formation,
  garrison,
  group,
  hold,
  move,
  recruit,
  repairFortification,
  repairWork,
  withdraw,
  type Command,
} from '../../src/sim/command';

/**
 * One well-formed Command per kind, in the vocabulary's order (`COMMAND_KINDS`).
 *
 * Shared by the tests that need the whole vocabulary as data: the round trip
 * through `validateCommand`, the walk through a headless Match, and the check
 * that `docs/COMMANDS.md` still describes these fields. Adding a kind to the
 * vocabulary means adding its example here, which is what makes the other three
 * tests fail until they know about it.
 */
export const ONE_OF_EACH: readonly Command[] = [
  move('rome', [1, 2], 2, 2),
  attackMove('rome', [1], 3, 3),
  attack('rome', [1], 3),
  hold('rome', [1]),
  garrison('rome', [1], 5),
  withdraw('rome', [1]),
  build('rome', 5, 'castrum'),
  recruit('rome', 5, 'hastati', 60, 2),
  assault('rome', [1], 5),
  blockade('rome', [2], 5),
  formation('rome', [1, 2], 'column'),
  group('rome', 1, [1, 2]),
  cancelPending('rome', 5, 1),
  repairFortification('rome', 5, 'wall', 'north'),
  cancelFortificationRepair('rome', 5, 'wall', 'north'),
  attackStructure('rome', [1], { kind: 'camp', id: 0 }),
  repairWork('rome', 5, 'farm', 0),
  cancelWorkRepair('rome', 5, 'farm', 0),
];
