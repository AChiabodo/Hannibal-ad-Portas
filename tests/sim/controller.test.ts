import { describe, expect, it } from 'vitest';
import { CommandValidationError, hold, move, type Command } from '../../src/sim/command';
import { idleController, scriptedController, type Controller } from '../../src/sim/controller';
import type { Faction } from '../../src/sim/faction';
import { createMatch, type MatchRules } from '../../src/sim/match';
import type { Observation } from '../../src/sim/observation';
import type { CommandLog } from '../../src/sim/replay';

/**
 * A world with something a Controller must never read, and the projection of it
 * a Controller is allowed to see. The seam's whole promise is that the second
 * type is all the first one can become.
 */
interface SecretWorld {
  readonly hidden: number;
  readonly revealed: number;
}

interface SecretVisible {
  readonly revealed: number;
}

const toyRules: MatchRules<SecretWorld, Command> = {
  createWorld: () => ({ hidden: 41, revealed: 1 }),
  step: () => {},
};

/** An Observation of the toy projection, stamped the way the driver stamps it. */
function look(tick: number, faction: Faction): Observation<SecretVisible> {
  return { faction, tick, visible: { revealed: 1 } };
}

describe('the Controller seam', () => {
  it('has no seed for a Controller to read: the Match is outside the Observation', () => {
    const spying: Controller<SecretVisible> = {
      decide: (observation) => {
        // @ts-expect-error — an Observation carries no seed, so Match state has no way back in
        const seed = observation.seed;
        return seed === undefined ? [] : [];
      },
    };

    expect(spying.decide(look(0, 'rome'))).toEqual([]);
  });

  it('shows a Controller the projection, not the world it was projected from', () => {
    const peeking: Controller<SecretVisible> = {
      decide: (observation) => {
        // @ts-expect-error — the projection is not the world: it has no `hidden` field
        const hidden = observation.visible.hidden;
        return hidden === undefined ? [] : [];
      },
    };

    expect(peeking.decide(look(0, 'rome'))).toEqual([]);
  });

  it('cannot be handed Match state in place of an Observation', () => {
    const match = createMatch({ seed: 1, rules: toyRules });

    // @ts-expect-error — Match state is not an Observation: it has no faction and no projection
    const leak: Observation<SecretVisible> = match.state;

    // The proof is the compile error above; this line only keeps the value used.
    expect(leak).toBe(match.state);
  });
});

describe('a scripted Controller', () => {
  const SCRIPT: CommandLog<Command> = [
    { tick: 0, command: move('rome', [1], 5, 5) },
    { tick: 0, command: move('carthage', [3], 6, 6) },
    { tick: 2, command: hold('rome', [1]) },
  ];

  it('emits the Commands its Faction was given at the tick it is asked about', () => {
    const controller = scriptedController<SecretVisible>(SCRIPT);

    expect(controller.decide(look(0, 'rome'))).toEqual([move('rome', [1], 5, 5)]);
    expect(controller.decide(look(0, 'carthage'))).toEqual([move('carthage', [3], 6, 6)]);
    expect(controller.decide(look(2, 'rome'))).toEqual([hold('rome', [1])]);
  });

  it('emits nothing on a tick the script says nothing about', () => {
    const controller = scriptedController<SecretVisible>(SCRIPT);

    expect(controller.decide(look(1, 'rome'))).toEqual([]);
    expect(controller.decide(look(9, 'carthage'))).toEqual([]);
  });

  it('refuses a script stamped with something that is not a whole tick', () => {
    for (const tick of [1.5, -1, Number.NaN]) {
      expect(() =>
        scriptedController<SecretVisible>([{ tick, command: hold('rome', [1]) }]),
      ).toThrow(/whole number of ticks/);
    }
  });

  it('refuses a script holding something that is not a Command in the vocabulary', () => {
    const notACommand = { kind: 'teleport', faction: 'rome' } as unknown as Command;

    expect(() => scriptedController<SecretVisible>([{ tick: 0, command: notACommand }])).toThrow(
      CommandValidationError,
    );
  });
});

describe('a Controller that watches', () => {
  it('emits nothing, whatever tick it is asked about and whichever Faction is looking', () => {
    const idle = idleController<SecretVisible>();

    expect(idle.decide(look(0, 'rome'))).toEqual([]);
    expect(idle.decide(look(7, 'carthage'))).toEqual([]);
  });
});
