import { describe, expect, it } from 'vitest';
import { hold } from '../../src/sim/command';
import { idleController } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import {
  emptyMatchOutcome,
  emptyMatchRules,
  observeEmptyMatch,
  type EmptyMatchVisible,
  type EmptyMatchWorld,
} from '../../src/sim/empty';
import { FACTIONS } from '../../src/sim/faction';

/** A Command the empty Match logs and has no system to apply: holding is not a thing yet. */
const HOLD = hold('rome', [1]);

/** Plays the empty Match the way the headless CLI does: two Players, neither deciding. */
function play(seed: number, ticks: number) {
  return runMatch<EmptyMatchWorld, EmptyMatchVisible>({
    seed,
    rules: emptyMatchRules,
    observe: observeEmptyMatch,
    outcome: emptyMatchOutcome,
    players: [
      { faction: 'rome', controller: idleController<EmptyMatchVisible>() },
      { faction: 'carthage', controller: idleController<EmptyMatchVisible>() },
    ],
    ticks,
  });
}

describe('the empty Match', () => {
  it('runs to its bound with both Factions idle, and ends by the clock', () => {
    const run = play(7, 25);

    expect(run.seed).toBe(7);
    expect(run.result).toEqual({ kind: 'clock', tick: 25 });
    expect(run.log).toEqual([]);
    expect(run.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('leaves the verdict to the bound: its own rules never decide anything', () => {
    expect(emptyMatchOutcome(emptyMatchRules.createWorld(1))).toBeNull();
  });

  it('shows each Faction nothing at all, because there is nothing yet', () => {
    const world = emptyMatchRules.createWorld(1);

    expect(FACTIONS.map((faction) => observeEmptyMatch(world, faction))).toEqual([{}, {}]);
  });

  it('runs again, tick for tick and hash for hash, from the same seed and bound', () => {
    expect(play(7, 25)).toEqual(play(7, 25));
  });

  it('is a different Match on a different seed, so the seed reaches the state', () => {
    expect(play(8, 25).hash).not.toBe(play(7, 25).hash);
  });

  it('logs a Command a Controller emits and does nothing with it, having no system to apply it to', () => {
    const commanding = runMatch<EmptyMatchWorld, EmptyMatchVisible>({
      seed: 1,
      rules: emptyMatchRules,
      observe: observeEmptyMatch,
      outcome: emptyMatchOutcome,
      players: [
        { faction: 'rome', controller: { decide: (observation) => (observation.tick === 0 ? [HOLD] : []) } },
        { faction: 'carthage', controller: idleController<EmptyMatchVisible>() },
      ],
      ticks: 1,
    });

    expect(commanding.log.map((entry) => entry.command)).toEqual([HOLD]);
    expect(commanding.hash).toBe(play(1, 1).hash);
  });
});
