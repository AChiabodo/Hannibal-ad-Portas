import { describe, expect, it } from 'vitest';
import { armyRegistry, difficultyRegistry, playAiMatch, playAiMatchAt, type AiMatchRun } from '../../src/cli/ai-match.ts';
import { createAi } from '../../src/ai/controller.ts';
import { DIFFICULTY, type DifficultyName } from '../../src/ai/difficulty.ts';
import { HEADLESS_TICKS } from '../../src/sim/season.ts';
import type { Command } from '../../src/sim/command.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../../src/sim/siege.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';

/** One Match per seed and level: the whole point is that it is reproducible. */
const runs = new Map<string, AiMatchRun>();
function runOf(seed: number, ticks: number, name: DifficultyName = 'centurio'): AiMatchRun {
  const key = `${String(seed)}/${String(ticks)}/${name}`;
  if (!runs.has(key)) runs.set(key, playAiMatchAt(seed, ticks, name));
  return runs.get(key)!;
}

describe('the shipped siege AI in a headless Match', () => {
  it('takes the enemy Stronghold by Assault in a Match played entirely without a human', () => {
    const run = runOf(1, HEADLESS_TICKS, 'centurio');
    expect(run.result.kind).toBe('victory');
    if (run.result.kind !== 'victory') return;
    expect(run.result.winner).toBe('rome');
    expect(run.result.reason).toMatchObject({ kind: 'stronghold', path: 'assault' });
    expect(run.decisions.some((entry) => entry.selected.behaviour === 'siege' && entry.selected.id === 'assault')).toBe(true);
  }, 60000);

  it('takes the enemy Stronghold by Blockade for Carthage, which has no ram to wait for', () => {
    const run = runOf(7, HEADLESS_TICKS, 'centurio');
    expect(run.result.kind).toBe('victory');
    if (run.result.kind !== 'victory') return;
    expect(run.result.winner).toBe('carthage');
    expect(run.result.reason).toMatchObject({ kind: 'stronghold', path: 'blockade' });
    const siege = run.decisions.filter((entry) => entry.selected.behaviour === 'siege');
    expect(siege.some((entry) => entry.selected.id === 'assault')).toBe(false);
    expect(siege.some((entry) => entry.selected.id === 'blockade')).toBe(true);
  }, 60000);

  it('replays its Command log to the same hash without running the AI', () => {
    const run = runOf(7, HEADLESS_TICKS, 'centurio');
    const replay = runMatch({ seed: 7, ticks: HEADLESS_TICKS, rules: siegeMatchRules, observe: observeSiege,
      outcome: siegeMatchOutcome,
      players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }],
    });
    expect(replay.hash).toBe(run.hash);
  }, 60000);

  it('commits to a Stronghold the same way whichever hidden army is elsewhere', () => {
    function decide(hiddenX: number) {
      const controller = createAi<SiegeVisible, Command>({ ticksPerSecond: TICK_HZ, registry: armyRegistry });
      runMatch({ seed: 7, ticks: 400, rules: { ...siegeMatchRules, createWorld(seed) {
        const world = siegeMatchRules.createWorld(seed);
        const home = world.economy.settlements[0]!;
        for (let i = 0; i < 4; i += 1) {
          musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: home.x, y: home.y });
        }
        // A hidden Carthaginian army the Roman AI cannot see, wherever it stands.
        for (let i = 0; i < 3; i += 1) {
          musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul',
            x: hiddenX, y: 40 });
        }
        return world;
      } }, observe: observeSiege, outcome: () => null,
      players: [{ faction: 'rome', controller },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
      });
      return controller.readLog();
    }
    expect(decide(20)).toEqual(decide(60));
  }, 20000);
});

describe('the three difficulty levels in a Match', () => {
  const shortRuns = (name: DifficultyName) => runOf(1, 3000, name);

  it('is distinguishable by the decision logs alone', () => {
    const digest = (name: DifficultyName) => JSON.stringify(
      shortRuns(name).decisions.map((entry) =>
        [entry.faction, entry.tick, entry.layer, entry.selected.behaviour, entry.selected.id]),
    );
    const logs = (['tiro', 'centurio', 'imperator'] as const).map(digest);
    expect(new Set(logs).size).toBe(3);
  }, 60000);

  it('reacts faster at a harder level: the operational clock ticks more often', () => {
    const operational = (name: DifficultyName) => new Set(shortRuns(name).decisions
      .filter((entry) => entry.layer === 'operational').map((entry) => entry.tick)).size;
    expect(operational('tiro')).toBeLessThan(operational('centurio'));
    expect(operational('centurio')).toBeLessThan(operational('imperator'));
  }, 60000);

  it('runs the same registry at every level, and the difficulty reaches only the Controller clock', () => {
    const log = (name: DifficultyName) => playAiMatch(1, 301, difficultyRegistry(name),
      DIFFICULTY[name]).decisions;
    // Same seed, same two fresh Controllers; the corpus of behaviours is the same
    // army at both levels, so a difference can only be the difficulty's numbers.
    expect(log('tiro')).not.toEqual(log('imperator'));
  }, 60000);
});
