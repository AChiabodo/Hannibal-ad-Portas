import { describe, expect, it } from 'vitest';
import {
  attack,
  CommandValidationError,
  COMMAND_KINDS,
  group,
  hold,
  move,
  type Command,
} from '../../src/sim/command';
import { idleController, scriptedController, type Controller } from '../../src/sim/controller';
import { ForeignCommandError, runMatch, type MatchRun } from '../../src/sim/driver';
import type { Observation } from '../../src/sim/observation';
import { replay, type CommandLog } from '../../src/sim/replay';
import { ONE_OF_EACH } from './one-of-each';
import {
  CARTHAGE,
  makeToyMatchWorld,
  observeToyMatchWorld,
  ROME,
  toyMatchRules,
  toyOutcome,
  toyStep,
  type ToyMatchVisible,
  type ToyMatchWorld,
} from './toy-match';

/**
 * The script the headless Match in these tests is played from. Rome's first
 * Squad attacks Carthage's only Squad, which is three strong and loses one man a
 * tick; Carthage marches away and then holds. Both Players read the same log —
 * a scripted Controller emits only its own Faction's Commands.
 */
const SCRIPT: CommandLog<Command> = [
  { tick: 0, command: attack('rome', [1], 3) },
  { tick: 0, command: group('rome', 1, [1, 2]) },
  { tick: 0, command: move('carthage', [3], 8, 9) },
  { tick: 1, command: hold('carthage', [3]) },
];

interface PlayOptions {
  readonly seed?: number;
  readonly ticks?: number;
  readonly log?: CommandLog<Command>;
  readonly rome?: Controller<ToyMatchVisible>;
  readonly carthage?: Controller<ToyMatchVisible>;
}

/** Plays the toy Match, with whatever the test wants to change. */
function play(options: PlayOptions = {}): MatchRun {
  const script = options.log ?? SCRIPT;

  return runMatch<ToyMatchWorld, ToyMatchVisible>({
    seed: options.seed ?? 99,
    rules: toyMatchRules,
    observe: observeToyMatchWorld,
    outcome: toyOutcome,
    players: [
      { faction: 'rome', controller: options.rome ?? scriptedController<ToyMatchVisible>(script) },
      { faction: 'carthage', controller: options.carthage ?? scriptedController<ToyMatchVisible>(script) },
    ],
    ticks: options.ticks ?? 200,
  });
}

/**
 * The rules the write-through test drives: one Squad and one number behind it,
 * and an `observe` that hands the world over as it stands.
 *
 * Returning the world itself is the widest a projection can be, and the exact
 * shape the write-through finding was made with
 * (`docs/reviews/A5-foundations-review.md`): with the world by reference, a
 * Controller could write straight through the Observation — no Command, no line
 * in the log, a hash no replay can carry. The driver's copy is what this test
 * pins, so the projection here is the world on purpose: there is nothing else to
 * disconnect it from.
 */
interface FunnelSquad {
  readonly id: number;
  strength: number;
}

interface FunnelWorld {
  readonly squads: FunnelSquad[];
  secretTotal: number;
}

/** A projection that holds a function, which the clone cannot carry at all. */
interface FunnelVisibleWithSpy {
  readonly squads: readonly FunnelSquad[];
  readonly secretTotal: number;
  readonly spy: () => number;
}

/** What one funnel Match produced, and what each side read while it ran. */
interface FunnelRun {
  readonly run: MatchRun;
  /** The world the rules built. A Controller must not have reached it. */
  readonly world: FunnelWorld;
  /** What the rules read each tick: a write that reached them would show here. */
  readonly readByRules: number[];
}

/**
 * Plays the funnel Match with one Rome, Carthage watching, and a fresh world, so
 * two runs cannot share the object the first one's Controller wrote to.
 */
function playFunnel(rome: Controller<FunnelWorld>): FunnelRun {
  const world: FunnelWorld = { squads: [{ id: 1, strength: 10 }], secretTotal: 7 };
  const readByRules: number[] = [];

  const run = runMatch<FunnelWorld, FunnelWorld>({
    seed: 5,
    rules: {
      createWorld: () => world,
      step: (stepped) => readByRules.push(stepped.secretTotal, stepped.squads[0]?.strength ?? -1),
    },
    observe: (stepped) => stepped,
    outcome: () => null,
    players: [
      { faction: 'rome', controller: rome },
      { faction: 'carthage', controller: idleController<FunnelWorld>() },
    ],
    ticks: 2,
  });

  return { run, world, readByRules };
}

describe('a headless Match', () => {
  it('runs with no browser, no human and no AI, and produces a result', () => {
    const run = play();

    expect(run.seed).toBe(99);
    expect(run.result).toEqual({ kind: 'victory', winner: 'rome', tick: 3 });
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('logs every Command both Controllers emitted, in the order it applied them', () => {
    const run = play();

    expect(run.log.map((entry) => [entry.tick, entry.command.kind])).toEqual([
      [0, 'attack'],
      [0, 'group'],
      [0, 'move'],
      [1, 'hold'],
    ]);
    expect(run.log[0]?.command).toEqual(attack('rome', [1], 3));
  });

  it('ends by the clock, and says so, when the rules never decide', () => {
    expect(play({ ticks: 1 }).result).toEqual({ kind: 'clock', tick: 1 });
  });

  it('carries a draw the rules report, rather than calling it a clock run', () => {
    const run = runMatch<ToyMatchWorld, ToyMatchVisible>({
      seed: 1,
      rules: toyMatchRules,
      observe: observeToyMatchWorld,
      outcome: () => ({ kind: 'draw' }),
      players: [
        { faction: 'rome', controller: scriptedController<ToyMatchVisible>([]) },
        { faction: 'carthage', controller: scriptedController<ToyMatchVisible>([]) },
      ],
      ticks: 10,
    });

    expect(run.result).toEqual({ kind: 'draw', tick: 0 });
  });
});

describe('the Commands a Match receives', () => {
  it('carries every Command in the vocabulary from a Controller to the rules', () => {
    const world = makeToyMatchWorld();

    const run = runMatch<ToyMatchWorld, ToyMatchVisible>({
      seed: 1,
      rules: { createWorld: () => world, step: toyStep },
      observe: observeToyMatchWorld,
      outcome: toyOutcome,
      players: [
        {
          faction: 'rome',
          controller: {
            decide: (observation) => (observation.tick === 0 ? ONE_OF_EACH : []),
          },
        },
        { faction: 'carthage', controller: scriptedController<ToyMatchVisible>([]) },
      ],
      ticks: 3,
    });

    expect(run.log.map((entry) => entry.command.kind)).toEqual(COMMAND_KINDS);
    expect(world.applied.filter((_, index) => index % 2 === 1)).toEqual(
      COMMAND_KINDS.map((_, index) => index + 1),
    );
    expect(world.groups[ROME * 10 + 1]).toEqual([1, 2]);
    expect(world.groups[CARTHAGE * 10 + 1]).toEqual([]);
    expect(world.squads.filter((squad) => squad.formation === 1).map((squad) => squad.id)).toEqual([
      1, 2,
    ]);
  });

  it('refuses a Command addressed to the other Faction, and does not apply it', () => {
    const traitor: Controller<ToyMatchVisible> = { decide: () => [hold('carthage', [3])] };

    expect(() => play({ rome: traitor })).toThrow(ForeignCommandError);
    expect(() => play({ rome: traitor })).toThrow(/a rome Controller emitted a command for carthage/);
  });

  it('refuses a Command that is not in the vocabulary, whoever it came from', () => {
    const teleport = { kind: 'teleport', faction: 'rome', squads: [1], x: 0, y: 0 };
    const rogue: Controller<ToyMatchVisible> = { decide: () => [teleport as unknown as Command] };

    expect(() => play({ rome: rogue })).toThrow(CommandValidationError);
  });

  it('refuses two Players on the same Faction, because a Match is a war', () => {
    const quiet = scriptedController<ToyMatchVisible>([]);

    expect(() =>
      runMatch<ToyMatchWorld, ToyMatchVisible>({
        seed: 1,
        rules: toyMatchRules,
        observe: observeToyMatchWorld,
        outcome: toyOutcome,
        players: [
          { faction: 'rome', controller: quiet },
          { faction: 'rome', controller: quiet },
        ],
        ticks: 1,
      }),
    ).toThrow(/both Players drive rome/);
  });

  it('decides in Rome-first order, whatever order the Players were handed in', () => {
    const reversed = runMatch<ToyMatchWorld, ToyMatchVisible>({
      seed: 99,
      rules: toyMatchRules,
      observe: observeToyMatchWorld,
      outcome: toyOutcome,
      players: [
        { faction: 'carthage', controller: scriptedController<ToyMatchVisible>(SCRIPT) },
        { faction: 'rome', controller: scriptedController<ToyMatchVisible>(SCRIPT) },
      ],
      ticks: 200,
    });

    expect(reversed).toEqual(play());
  });

  it('refuses a bound that is not a whole number of ticks', () => {
    expect(() => play({ ticks: 1.5 })).toThrow(/ticks must be a whole number of ticks/);
  });
});

describe('the Observation a Controller is handed', () => {
  it('belongs to its own Faction, is stamped with the tick being decided, and shows only the projection', () => {
    const seen: Observation<ToyMatchVisible>[] = [];
    const watching = (): Controller<ToyMatchVisible> => ({
      decide: (observation) => {
        seen.push(observation);
        return [];
      },
    });

    runMatch<ToyMatchWorld, ToyMatchVisible>({
      seed: 1,
      rules: toyMatchRules,
      observe: observeToyMatchWorld,
      outcome: toyOutcome,
      players: [
        { faction: 'rome', controller: watching() },
        { faction: 'carthage', controller: watching() },
      ],
      ticks: 2,
    });

    expect(seen.map((observation) => observation.tick)).toEqual([0, 0, 1, 1]);
    expect(seen.map((observation) => observation.faction)).toEqual([
      'rome',
      'carthage',
      'rome',
      'carthage',
    ]);

    const [rome, carthage] = seen;
    expect(rome?.visible.squads.map((squad) => squad.id)).toEqual([1, 2]);
    expect(carthage?.visible.squads.map((squad) => squad.id)).toEqual([3]);
    expect(rome?.visible.squads[0]).not.toHaveProperty('owner');
    expect(rome?.visible).not.toBe(carthage?.visible);
  });

  it('is a copy, so a Controller cannot write the Match through it: the write reaches neither the rules nor the hash', () => {
    const readByController: number[] = [];
    const cheating: Controller<FunnelWorld> = {
      decide: (observation) => {
        readByController.push(
          observation.visible.secretTotal,
          observation.visible.squads[0]?.strength ?? -1,
        );

        observation.visible.secretTotal = 9999; // a top-level field ...
        const first = observation.visible.squads[0];
        if (first !== undefined) first.strength = 9999; // ... and a nested one

        return [];
      },
    };

    const cheated = playFunnel(cheating);
    const honest = playFunnel(idleController<FunnelWorld>());

    // Every tick the Controller reads the projection afresh: the fields are
    // readable, and the write it made on the tick before is gone by the next.
    expect(readByController).toEqual([7, 10, 7, 10]);

    // The write it did make reached the copy and not the world: the rules read
    // what was there on every tick, top-level field and nested one alike.
    expect(cheated.world.secretTotal).toBe(7);
    expect(cheated.world.squads[0]?.strength).toBe(10);
    expect(cheated.readByRules).toEqual([7, 10, 7, 10]);

    // And the Match it produced is the Match the same seed and log produce with
    // no write at all, so the test cannot pass on an empty Match.
    expect(cheated.run.hash).toBe(honest.run.hash);
  });

  it('refuses a projection the clone cannot carry at all, before the Match runs: the error is the clone\'s own, not a sim error', () => {
    const steps: number[] = [];
    let refused: unknown;

    try {
      runMatch<FunnelWorld, FunnelVisibleWithSpy>({
        seed: 5,
        rules: {
          createWorld: () => ({ squads: [], secretTotal: 0 }),
          step: () => steps.push(1),
        },
        // A function is not data, so `structuredClone` refuses it rather than
        // copying it — and the driver does not rescue the refusal into one of
        // the seam's own errors.
        observe: () => ({ squads: [], secretTotal: 0, spy: () => 0 }),
        outcome: () => null,
        players: [
          { faction: 'rome', controller: idleController<FunnelVisibleWithSpy>() },
          { faction: 'carthage', controller: idleController<FunnelVisibleWithSpy>() },
        ],
        ticks: 2,
      });
    } catch (error) {
      refused = error;
    }

    expect(refused).toBeInstanceOf(DOMException);
    expect((refused as DOMException).name).toBe('DataCloneError');
    // And the refusal happens at the hand-over, before a single tick is stepped.
    expect(steps).toEqual([]);
  });
});

describe('replaying a Match from its Command log', () => {
  it('produces the same Match, twice, from the same seed and the same scripts', () => {
    const once = play();
    const again = play();

    expect(again).toEqual(once);
  });

  it('replays its own log through the very same driver, hash for hash', () => {
    const once = play();
    const replayed = play({ log: once.log });

    expect(replayed.result).toEqual(once.result);
    expect(replayed.hash).toBe(once.hash);
    expect(replayed.log).toEqual(once.log);
  });

  it('replays its own log through the A2 replay, to the same state hash', () => {
    const once = play();
    const ticks = once.result.tick;

    const first = replay({ seed: 99, rules: toyMatchRules, log: once.log, ticks });
    const second = replay({ seed: 99, rules: toyMatchRules, log: once.log, ticks });

    expect(second).toEqual(first);
    expect(first.checkpoints.at(-1)?.hash).toBe(once.hash);
  });

  it('runs a different Match when the log differs, so the log is really the Match', () => {
    const withAttack = play({ log: [{ tick: 0, command: attack('rome', [2], 3) }] });

    expect(withAttack.hash).not.toBe(play().hash);
  });
});
