/**
 * The human Controller (ticket C2).
 *
 * The point of this module is that a hand does not get a private way into the
 * game: what a Player clicks becomes the same `move`, `attackMove`, `hold`,
 * `withdraw`, `formation` and `group` Commands an AI would emit, on the tick the
 * Match decides, through the same seam. So the tests are written against the
 * Commands that come out of `decide` — compared with the vocabulary's own
 * constructors, not with hand-written shapes — and against the player-side
 * memory (the selection and the control groups) that C2 adds.
 */
import { describe, expect, it } from 'vitest';
import { attackMove, formation, group, hold, move, withdraw } from '../../src/sim/command';
import type { EconomyVisible, VisibleSquad } from '../../src/sim/economy-match';
import { MAP_HEIGHT, MAP_WIDTH } from '../../src/sim/map';
import type { Observation } from '../../src/sim/observation';
import { createHuman, type HumanController } from '../../src/input/human';
import { NOTHING_SELECTED } from '../../src/input/selection';

/** A Squad an Observation might carry: only its id matters to the seam. */
function squadOf(id: number): VisibleSquad {
  return {
    id,
    type: 'hastati',
    x: 10,
    y: 10,
    men: 120,
    formation: 'line',
    facing: 'south',
    goal: null,
    refused: null,
    morale: 10,
    payroll: 3,
    unpaid: 0,
    home: 0,
  };
}

/** What one Faction may see: the Squads and settlements a test says it holds. */
function observationWith(squads: readonly number[], settlements: readonly number[] = [0]): Observation<EconomyVisible> {
  return {
    faction: 'rome',
    tick: 0,
    visible: {
      season: 'spring',
      year: 1,
      treasury: 20,
      settlements: settlements.map((id) => ({
        id,
        x: 10,
        y: 10,
        tier: 1,
        population: 10,
        stocks: { grain: 20, timber: 20, stone: 10, iron: 10 },
        land: { grain: 4, timber: 2, stone: 1, iron: 0 },
        works: [],
      })),
      squads: squads.map(squadOf),
    },
  };
}

/** A Controller with some Squads picked, which is where every order starts. */
function picked(...ids: number[]): HumanController {
  const human = createHuman('rome');
  human.select({ squads: ids, settlement: null });

  return human;
}

describe('a human Controller', () => {
  it('emits nothing when it has not been told anything', () => {
    const human = createHuman('rome');

    expect(human.selection).toEqual(NOTHING_SELECTED);
    expect(human.decide(observationWith([1, 2]))).toEqual([]);
    expect(human.pending).toBe(0);
  });

  it('issues a Move on the next tick, for the Squads picked when it was given', () => {
    const human = picked(1, 2);

    expect(human.order({ kind: 'move', x: 30, y: 40 })).toBe(true);
    expect(human.pending).toBe(1);
    expect(human.decide(observationWith([1, 2]))).toEqual([move('rome', [1, 2], 30, 40)]);
    // Emitted once, and only once.
    expect(human.pending).toBe(0);
    expect(human.decide(observationWith([1, 2]))).toEqual([]);
  });

  it('gives an order to the men who were picked when it was given, not to whoever is picked after', () => {
    const human = picked(1);

    human.order({ kind: 'move', x: 30, y: 40 });
    human.select({ squads: [2], settlement: null });

    expect(human.decide(observationWith([1, 2]))).toEqual([move('rome', [1], 30, 40)]);
    expect(human.selection.squads).toEqual([2]);
  });

  it('issues an Attack-move, a Hold, a Withdraw and a Formation, all through the vocabulary', () => {
    const human = picked(3);

    human.order({ kind: 'attackMove', x: 12, y: 34 });
    human.order({ kind: 'hold' });
    human.order({ kind: 'withdraw' });
    human.order({ kind: 'formation', formation: 'column' });

    expect(human.decide(observationWith([3]))).toEqual([
      attackMove('rome', [3], 12, 34),
      hold('rome', [3]),
      withdraw('rome', [3]),
      formation('rome', [3], 'column'),
    ]);
  });

  it('refuses an order when nobody is picked, and a tile outside the theatre', () => {
    const human = createHuman('rome');

    expect(human.order({ kind: 'hold' })).toBe(false);
    expect(human.decide(observationWith([1]))).toEqual([]);

    human.select({ squads: [1], settlement: null });
    expect(human.order({ kind: 'move', x: -1, y: 4 })).toBe(false);
    expect(human.order({ kind: 'move', x: MAP_WIDTH, y: 4 })).toBe(false);
    expect(human.order({ kind: 'move', x: 4, y: MAP_HEIGHT })).toBe(false);
    expect(human.order({ kind: 'move', x: 1.5, y: 4 })).toBe(false);
    expect(human.pending).toBe(0);
  });

  it('drops a Squad that has left the field from what it has picked', () => {
    const human = picked(1, 2);

    human.decide(observationWith([2]));

    expect(human.selection.squads).toEqual([2]);
  });

  it('addresses its own Faction and no other', () => {
    const human = createHuman('carthage');
    human.select({ squads: [7], settlement: null });
    human.order({ kind: 'hold' });

    expect(human.decide({ ...observationWith([7]), faction: 'carthage' })).toEqual([hold('carthage', [7])]);
  });
});

describe('control groups', () => {
  it('binds the picked Squads to a digit, and says so in the log', () => {
    const human = picked(1, 2);

    expect(human.bindGroup(2)).toBe(true);
    expect(human.groupOf(2)).toEqual([1, 2]);
    // The binding is a Command as well as a memory: it commands nobody, and a
    // replay needs it to re-enact the selection (docs/COMMANDS.md).
    expect(human.decide(observationWith([1, 2]))).toEqual([group('rome', 2, [1, 2])]);
  });

  it('recalls a group as a selection, and refuses a digit nothing is bound to', () => {
    const human = picked(1, 2);
    human.bindGroup(3);
    human.decide(observationWith([1, 2]));
    human.select(NOTHING_SELECTED);

    expect(human.recallGroup(3)).toBe(true);
    expect(human.selection).toEqual({ squads: [1, 2], settlement: null });
    expect(human.recallGroup(4)).toBe(false);
    expect(human.bindGroup(0)).toBe(false);
    expect(human.bindGroup(10)).toBe(false);
  });

  it('clears a group when it is bound with nothing picked', () => {
    const human = picked(1);
    human.bindGroup(1);
    human.decide(observationWith([1]));

    human.select(NOTHING_SELECTED);
    human.bindGroup(1);

    expect(human.groupOf(1)).toEqual([]);
    expect(human.decide(observationWith([1]))).toEqual([group('rome', 1, [])]);
    expect(human.recallGroup(1)).toBe(false);
  });

  it('keeps only the Squads of a group that are still afield', () => {
    const human = picked(1, 2, 3);
    human.bindGroup(5);
    human.decide(observationWith([1, 2, 3]));

    human.decide(observationWith([2, 3]));

    expect(human.groupOf(5)).toEqual([2, 3]);
    human.select(NOTHING_SELECTED);
    human.recallGroup(5);
    expect(human.selection.squads).toEqual([2, 3]);
  });
});
