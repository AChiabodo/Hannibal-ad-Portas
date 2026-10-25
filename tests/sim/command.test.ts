import { describe, expect, it } from 'vitest';
import {
  assault,
  attack,
  attackMove,
  blockade,
  build,
  CommandValidationError,
  FORMATIONS,
  formation,
  garrison,
  group,
  hold,
  move,
  recruit,
  validateCommand,
  withdraw,
  type MoveCommand,
} from '../../src/sim/command';
import { ONE_OF_EACH } from './one-of-each';

describe('building a Command', () => {
  it('constructs a Move order, naming the Faction that issued it', () => {
    expect(move('rome', [3, 5], 42, 17)).toEqual({
      kind: 'move',
      faction: 'rome',
      squads: [3, 5],
      x: 42,
      y: 17,
    });
  });

  it('constructs the other movement Commands', () => {
    expect(attackMove('carthage', [7], 1, 2)).toEqual({
      kind: 'attackMove',
      faction: 'carthage',
      squads: [7],
      x: 1,
      y: 2,
    });
    expect(attack('rome', [3], 9)).toEqual({
      kind: 'attack',
      faction: 'rome',
      squads: [3],
      target: 9,
    });
    expect(hold('rome', [3, 5])).toEqual({ kind: 'hold', faction: 'rome', squads: [3, 5] });
  });

  it('refuses to build a Command that addresses no Squad', () => {
    expect(() => move('rome', [], 1, 2)).toThrow(CommandValidationError);
    expect(() => hold('rome', [])).toThrow(/command\.squads/);
    expect(() => attack('rome', [], 9)).toThrow(/command\.squads/);
  });

  it('refuses a Command naming the same Squad twice', () => {
    expect(() => move('rome', [3, 3], 1, 2)).toThrow(/twice/);
  });

  it('refuses a tile that is not a whole, non-negative coordinate', () => {
    for (const x of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => move('rome', [1], x, 0)).toThrow(/command\.x/);
    }
  });

  it('refuses a target that is not a Squad id', () => {
    expect(() => attack('rome', [1], -2)).toThrow(/command\.target/);
  });

  it('constructs the Commands that name a settlement', () => {
    expect(garrison('rome', [3], 12)).toEqual({
      kind: 'garrison',
      faction: 'rome',
      squads: [3],
      settlement: 12,
    });
    expect(assault('rome', [3], 12)).toEqual({
      kind: 'assault',
      faction: 'rome',
      squads: [3],
      settlement: 12,
    });
    expect(blockade('carthage', [7], 12)).toEqual({
      kind: 'blockade',
      faction: 'carthage',
      squads: [7],
      settlement: 12,
    });
  });

  it('constructs the Commands that build and recruit', () => {
    expect(build('rome', 12, 'castrum')).toEqual({
      kind: 'build',
      faction: 'rome',
      settlement: 12,
      building: 'castrum',
    });
    expect(recruit('carthage', 12, 'libyan-spear', 48, 3)).toEqual({
      kind: 'recruit',
      faction: 'carthage',
      settlement: 12,
      squadType: 'libyan-spear',
      men: 48,
      count: 3,
    });
  });

  it('constructs the Commands that shape Squads', () => {
    expect(withdraw('carthage', [7])).toEqual({ kind: 'withdraw', faction: 'carthage', squads: [7] });
    expect(formation('rome', [3, 5], 'column')).toEqual({
      kind: 'formation',
      faction: 'rome',
      squads: [3, 5],
      formation: 'column',
    });
  });

  it('binds a control group, and clears one with no Squads at all', () => {
    expect(group('rome', 2, [3, 5])).toEqual({ kind: 'group', faction: 'rome', group: 2, squads: [3, 5] });
    expect(group('rome', 2)).toEqual({ kind: 'group', faction: 'rome', group: 2, squads: [] });
  });

  it('refuses a settlement that is not an id, and a count that is not a positive whole number', () => {
    expect(() => build('rome', -1, 'castrum')).toThrow(/command\.settlement/);
    expect(() => recruit('rome', 12, 'hastati', 24, 0)).toThrow(/command\.count/);
    expect(() => recruit('rome', 12, 'hastati', 24, 1.5)).toThrow(/command\.count/);
  });

  it('requires a real size on a Recruit, and refuses one that is not a positive whole number', () => {
    for (const men of [0, -1, 1.5, Number.NaN]) {
      expect(() => recruit('rome', 12, 'hastati', men, 1)).toThrow(/command\.men is not a positive size/);
    }

    expect(recruit('rome', 12, 'hastati', 60, 2)).toMatchObject({ men: 60, count: 2 });
    // The pre-P2 record: a Recruit with no size is refused at the seam rather
    // than silently reinterpreted as some default (COMMANDS.md, ADR-0027).
    expect(() => validateCommand({ kind: 'recruit', faction: 'rome', settlement: 12,
      squadType: 'hastati', count: 1 })).toThrow(/command\.men/);
  });

  it('refuses a building or a Squad type with no name', () => {
    expect(() => build('rome', 12, '')).toThrow(/command\.building/);
    expect(() => recruit('rome', 12, '', 24, 1)).toThrow(/command\.squadType/);
  });

  it('refuses a formation that is not one of the shapes a Squad knows', () => {
    expect(() =>
      validateCommand({ kind: 'formation', faction: 'rome', squads: [1], formation: 'testudo' }),
    ).toThrow(/command\.formation is not a formation/);
  });

  it('refuses a control group outside one to nine', () => {
    for (const index of [0, 10, 1.5, -1, Number.NaN]) {
      expect(() => group('rome', index)).toThrow(/command\.group/);
    }
  });

  it('lists the formations the vocabulary allows, frontage before depth', () => {
    expect(FORMATIONS).toEqual(['line', 'column']);
  });
});

describe('reading a Command out of data TypeScript did not check', () => {
  it('reads every Command in the vocabulary back, unchanged', () => {
    for (const command of ONE_OF_EACH) {
      expect(validateCommand(command)).toEqual(command);
    }
  });

  it('returns a copy, so a Controller cannot keep editing the Match through it', () => {
    const candidate = { kind: 'move', faction: 'rome', squads: [3], x: 1, y: 2 };
    const command = validateCommand(candidate);

    expect(command).toEqual(candidate);
    expect(command).not.toBe(candidate);
    expect((command as MoveCommand).squads).not.toBe(candidate.squads);
  });

  it('refuses everything that is not a Command at all', () => {
    for (const value of [null, undefined, 7, 'move', true, [], new Map(), new Date(0)]) {
      expect(() => validateCommand(value), String(value)).toThrow(CommandValidationError);
    }
  });

  it('refuses a kind that is not in the vocabulary', () => {
    expect(() =>
      validateCommand({ kind: 'teleport', faction: 'rome', squads: [1], x: 0, y: 0 }),
    ).toThrow(/command\.kind is not a Command kind/);
  });

  it('refuses a field the vocabulary does not have, so a typo fails loudly', () => {
    expect(() =>
      validateCommand({ kind: 'move', faction: 'rome', squad: [1], x: 0, y: 0 }),
    ).toThrow(/command\.squad is not a field of a move command/);
  });

  it('refuses a missing field, and names the one that is missing', () => {
    expect(() => validateCommand({ kind: 'hold', faction: 'rome' })).toThrow(/command\.squads/);
    expect(() => validateCommand({ kind: 'attack', faction: 'rome', squads: [1] })).toThrow(
      /command\.target/,
    );
  });

  it('refuses a Faction nobody implements', () => {
    expect(() => validateCommand({ kind: 'hold', faction: 'greece', squads: [1] })).toThrow(
      /command\.faction is not one of the two Factions/,
    );
  });

  it('refuses every Command that is missing one of its fields, naming the field', () => {
    for (const command of ONE_OF_EACH) {
      const fields = Object.keys(command).filter((field) => field !== 'kind');

      for (const field of fields) {
        const incomplete: Record<string, unknown> = { ...command };
        delete incomplete[field];

        expect(() => validateCommand(incomplete), `${command.kind} without ${field}`).toThrow(
          new RegExp(`command\\.${field}`),
        );
      }
    }
  });

  it('refuses every Command that carries a field the vocabulary does not have', () => {
    for (const command of ONE_OF_EACH) {
      expect(() => validateCommand({ ...command, shape: 'wedge' }), command.kind).toThrow(
        /command\.shape is not a field/,
      );
    }
  });

  it('refuses a Squad list that is not a list of ids', () => {
    for (const squads of [[1.5], [-1], ['1'], [1, 1], 'squad 1', null]) {
      expect(() => validateCommand({ kind: 'hold', faction: 'rome', squads })).toThrow(
        CommandValidationError,
      );
    }

    expect(() => validateCommand({ kind: 'hold', faction: 'rome', squads: [] })).toThrow(
      /non-empty/,
    );
  });

  it('refuses an empty Squad list where only a control group binding allows one', () => {
    expect(validateCommand({ kind: 'group', faction: 'rome', group: 1, squads: [] })).toEqual({
      kind: 'group',
      faction: 'rome',
      group: 1,
      squads: [],
    });
  });
});
