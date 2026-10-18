import { describe, expect, it } from 'vitest';
import { CommandValidationError, hold, type Command } from '../../src/sim/command';
import { idleController, type Controller } from '../../src/sim/controller';
import { runMatch, type MatchRun } from '../../src/sim/driver';
import { createMatch } from '../../src/sim/match';
import { seasonMatchRules } from '../../src/sim/season';
import {
  createPacing,
  isSpeed,
  NORMAL_SPEED,
  SPEEDS,
  type Pacing,
  type PausableController,
  type Speed,
} from '../../src/sim/pacing';
import {
  observeToyMatchWorld,
  toyMatchRules,
  toyOutcome,
  type ToyMatchVisible,
} from './toy-match';

/** Plays the toy Match with a Rome built from `pacing`, Carthage idle, for `ticks` ticks. */
function play(pacing: Pacing, rome: Controller<ToyMatchVisible>, ticks = 8): MatchRun {
  return runMatch({
    seed: 1,
    rules: toyMatchRules,
    observe: observeToyMatchWorld,
    outcome: toyOutcome,
    players: [
      { faction: 'rome', controller: pacing.wrap(rome) },
      { faction: 'carthage', controller: idleController<ToyMatchVisible>() },
    ],
    ticks,
  });
}

/** The log as `tick:kind` pairs, so a test can say exactly what reached the rules and when. */
function applied(run: MatchRun): readonly string[] {
  return run.log.map((entry) => `${entry.tick}:${entry.command.kind}`);
}

describe('the three speeds and the pause', () => {
  it('offers exactly three speeds, and no other number is one', () => {
    expect(SPEEDS).toEqual([1, 2, 3]);
    expect(NORMAL_SPEED).toBe(1);

    for (const speed of SPEEDS) expect(isSpeed(speed)).toBe(true);
    for (const value of [0, 4, 1.5, '2', null, undefined]) expect(isSpeed(value)).toBe(false);
  });

  it('runs at real time until told otherwise, so a second of wall time is ten ticks', () => {
    const pacing = createPacing();

    expect(pacing.speed).toBe(1);
    expect(pacing.paused).toBe(false);
    expect(pacing.ticksFor(1_000)).toBe(10);
  });

  it('runs two and three times as fast, which is what the three speeds are for', () => {
    const pacing = createPacing();

    pacing.setSpeed(2);
    expect(pacing.ticksFor(1_000)).toBe(20);

    pacing.setSpeed(3);
    expect(pacing.ticksFor(1_000)).toBe(30);
  });

  it('carries the remainder of a tick into the next reading, so no wall time is lost', () => {
    const pacing = createPacing();

    // 250 ms is two whole ticks and 50 left over; the next 250 ms completes it.
    expect(pacing.ticksFor(250)).toBe(2);
    expect(pacing.ticksFor(250)).toBe(3);

    pacing.setSpeed(3);
    expect(pacing.ticksFor(33)).toBe(0);
    expect(pacing.ticksFor(1)).toBe(1);
  });

  it('refuses a speed or an elapsed time it cannot read, rather than running at another pace', () => {
    expect(() => createPacing(0 as Speed)).toThrow(RangeError);
    expect(() => createPacing()).not.toThrow();
    expect(() => createPacing().setSpeed(4 as Speed)).toThrow(/1x, 2x, 3x/);

    expect(() => createPacing().ticksFor(-1)).toThrow(RangeError);
    expect(() => createPacing().ticksFor(Number.NaN)).toThrow(RangeError);
    expect(() => createPacing().ticksFor(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it('runs no ticks while paused, and banks none of the wall time spent thinking', () => {
    const pacing = createPacing();

    pacing.pause();
    expect(pacing.paused).toBe(true);
    expect(pacing.ticksFor(5_000)).toBe(0);

    pacing.resume();
    expect(pacing.ticksFor(99)).toBe(0);
    expect(pacing.ticksFor(1)).toBe(1);
  });

  it('stops a whole Match while paused: the loop steps only the ticks the pace allows', () => {
    const pacing = createPacing();
    const match = createMatch({ seed: 1, rules: seasonMatchRules });

    const loop = (frames: readonly number[]): void => {
      for (const frame of frames) {
        for (let due = pacing.ticksFor(frame); due > 0; due -= 1) match.step();
      }
    };

    loop([500]);
    expect(match.state.tick).toBe(5);

    pacing.pause();
    loop([2_000, 2_000]);
    expect(match.state.tick).toBe(5);

    pacing.resume();
    loop([100]);
    expect(match.state.tick).toBe(6);
  });
});

describe('Commands given while the Match is paused', () => {
  it('holds what a Controller decides while paused, and applies it on the tick it resumes', () => {
    const pacing = createPacing();
    const thinking: Controller<ToyMatchVisible> = {
      decide: (observation) => {
        if (observation.tick === 2) {
          pacing.pause();
          return [hold('rome', [1])];
        }

        if (observation.tick === 3) return [hold('rome', [2])];
        if (observation.tick === 5) pacing.resume();

        return [];
      },
    };

    const run = play(pacing, thinking);

    // Nothing reached the rules on ticks 2 and 3; both orders arrived together on
    // the first tick after the pause, in the order they were given.
    expect(applied(run)).toEqual(['5:hold', '5:hold']);
    expect(run.log.map((entry) => entry.command)).toEqual([hold('rome', [1]), hold('rome', [2])]);
  });

  it('takes an order issued outside the Controller, which is how a human gives one while paused', () => {
    const pacing = createPacing();

    const giving: Controller<ToyMatchVisible> = {
      decide: (observation) => {
        if (observation.tick === 1) {
          pacing.pause();
          human.order(hold('rome', [1]));
        }

        if (observation.tick === 2) human.order(hold('rome', [2]));
        if (observation.tick === 4) pacing.resume();

        return [];
      },
    };

    const human: PausableController<ToyMatchVisible> = pacing.wrap(giving);

    const run = play(pacing, human);

    expect(applied(run)).toEqual(['4:hold', '4:hold']);
    expect(human.queued).toBe(0);
  });

  it('counts what is waiting, so a Player can see the orders the pause is holding', () => {
    const pacing = createPacing();
    const counts: number[] = [];

    const giving: Controller<ToyMatchVisible> = {
      decide: (observation) => {
        if (observation.tick === 1) pacing.pause();
        if (observation.tick === 1) human.order(hold('rome', [1]));
        if (observation.tick === 2) human.order(hold('rome', [2]));
        if (observation.tick === 3) counts.push(human.queued);
        if (observation.tick === 4) pacing.resume();

        return [];
      },
    };

    const human: PausableController<ToyMatchVisible> = pacing.wrap(giving);
    play(pacing, human);

    expect(counts).toEqual([2]);
  });

  it('applies an order given while the Match is running on the next tick it decides', () => {
    const pacing = createPacing();

    const giving: Controller<ToyMatchVisible> = {
      decide: (observation) => {
        if (observation.tick === 0) human.order(hold('rome', [1]));

        return [];
      },
    };

    const human: PausableController<ToyMatchVisible> = pacing.wrap(giving);
    const run = play(pacing, human);

    expect(applied(run)).toEqual(['0:hold']);
  });

  it('refuses an order that is not a Command, where the order is given', () => {
    const pacing = createPacing();
    const human = pacing.wrap(idleController<ToyMatchVisible>());
    const teleport = { kind: 'teleport', faction: 'rome', squads: [1] } as unknown as Command;

    expect(() => human.order(teleport)).toThrow(CommandValidationError);
    expect(human.queued).toBe(0);
  });

  it("keeps each Player's queue to itself, so a pause holds only the orders of the Player who gave them", () => {
    const pacing = createPacing();
    const rome = pacing.wrap(idleController<ToyMatchVisible>());
    const carthage = pacing.wrap(idleController<ToyMatchVisible>());

    pacing.pause();
    rome.order(hold('rome', [1]));

    expect(rome.queued).toBe(1);
    expect(carthage.queued).toBe(0);
  });
});
