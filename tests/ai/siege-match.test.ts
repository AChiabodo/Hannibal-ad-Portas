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

/** A Match's own Command log, replayed through scripted Controllers: it must reach the same hash. */
function replayOf(seed: number, name: DifficultyName = 'centurio'): string {
  const run = runOf(seed, HEADLESS_TICKS, name);
  return runMatch({ seed, ticks: HEADLESS_TICKS, rules: siegeMatchRules, observe: observeSiege,
    outcome: siegeMatchOutcome,
    players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }] }).hash;
}

describe('the shipped siege AI in a headless Match', () => {
  it('plays a whole Match without a human, attempts a Blockade, and replays its log', () => {
    const run = runOf(1, HEADLESS_TICKS, 'centurio');
    // #71 changes opening policy, not the rules. Retain this seed's unresolved
    // outcome explicitly; submitted siege Orders alone do not prove victory.
    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.decisions.some((entry) => entry.selected.behaviour === 'siege' && entry.selected.id === 'blockade')).toBe(true);
    expect(replayOf(1, 'centurio')).toBe(run.hash);
  }, 60000);

  it('retains seed 7 as a stalled Match rather than claiming its Orders took a Stronghold', () => {
    const run = runOf(7, HEADLESS_TICKS, 'centurio');
    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    const siege = run.decisions.filter((entry) => entry.selected.behaviour === 'siege');
    expect(siege.some((entry) => entry.selected.id === 'assault')).toBe(false);
    expect(siege.some((entry) => entry.selected.id === 'blockade')).toBe(false);
  }, 60000);

  it('replays its Command log to the same hash without running the AI', () => {
    expect(replayOf(7, 'centurio')).toBe(runOf(7, HEADLESS_TICKS, 'centurio').hash);
  }, 60000);

  it('attributes a composed siege decision to the siege, the field and the patrols that authored its Commands', () => {
    const run = runOf(1, HEADLESS_TICKS, 'centurio');
    const entry = run.decisions.find((decision) => decision.selected.behaviour === 'siege')!;
    const selected = entry.candidates.find((candidate) => candidate.id === entry.selected.id)!;
    expect(entry.selected.contributions.map((contribution) => contribution.behaviour))
      .toEqual(['siege', 'military', 'scouting']);
    expect(entry.selected.contributions).toEqual(selected.contributions);
    const orders = entry.selected.contributions.find((contribution) => contribution.behaviour === 'siege')!.commands;
    expect(orders.length).toBeGreaterThan(0);
    expect(orders.every((command) => command.kind === 'assault' || command.kind === 'blockade'
      || command.kind === 'withdraw')).toBe(true);
  }, 60000);

  it('never attributes the field\'s attack to the behaviour whose candidate merged it', () => {
    // P2's smaller Squads mean most seeds are decided at the walls without a
    // field attack; seed 9 is one where the field really does engage, which is
    // what this attribution check needs.
    const run = runOf(9, HEADLESS_TICKS, 'centurio');
    // Only the field authors these: patrols move, and the siege assaults, blockades or withdraws.
    const fieldOnly = new Set(['attack', 'hold']);
    const merged = run.decisions.filter((entry) => entry.selected.behaviour !== 'military' &&
      entry.selected.contributions.some((contribution) => contribution.behaviour === 'military'));
    const fieldCommands = merged.flatMap((entry) => entry.selected.contributions
      .filter((contribution) => contribution.behaviour === 'military')
      .flatMap((contribution) => contribution.commands));
    // The field really does act inside another behaviour's winning candidate.
    expect(merged.length).toBeGreaterThan(0);
    expect(fieldCommands.length).toBeGreaterThan(0);
    // ...and no other contribution claims one of its orders, so the entry never reads as if the
    // proposer ordered the attack itself.
    const misattributed = merged.flatMap((entry) => entry.selected.contributions
      .filter((contribution) => contribution.behaviour !== 'military')
      .flatMap((contribution) => contribution.commands)
      .filter((command) => fieldOnly.has(command.kind)));
    expect(misattributed).toEqual([]);
  }, 60000);

  /**
   * Keep the same historical samples after the #71 policy change, recording
   * their new outcome instead of replacing inconvenient seeds. Both paths
   * remain reachable and every Command log still replays.
   */
  const levelMatches = [
    { level: 'tiro', seed: 13, winner: 'carthage', path: 'blockade' },
    { level: 'tiro', seed: 7, winner: 'rome', path: 'assault' },
    { level: 'imperator', seed: 12, winner: 'rome', path: 'assault' },
    { level: 'imperator', seed: 7, winner: 'rome', path: 'assault' },
  ] as const;

  for (const { level, seed, winner, path } of levelMatches) {
    it(`still ends with a Stronghold fallen at ${level}: ${winner} by ${path}, and the log replays`, () => {
      const run = runOf(seed, HEADLESS_TICKS, level);
      expect(run.result.kind).toBe('victory');
      if (run.result.kind !== 'victory') return;
      expect(run.result.winner).toBe(winner);
      expect(run.result.reason).toMatchObject({ kind: 'stronghold', path });
      expect(replayOf(seed, level)).toBe(run.hash);
    }, 240000);
  }

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
            x: hiddenX, y: 95 });
        }
        return world;
      } }, observe(world, faction) {
        const visible = observeSiege(world, faction);
        if (faction === 'rome') expect(visible.enemies).toHaveLength(0);
        return visible;
      }, outcome: () => null,
      players: [{ faction: 'rome', controller },
        { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }],
      });
      return controller.readLog();
    }
    expect(decide(80)).toEqual(decide(90));
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
    const commonTicks = Math.min(...(['tiro', 'centurio', 'imperator'] as const)
      .map((name) => shortRuns(name).result.tick));
    const operational = (name: DifficultyName) => new Set(shortRuns(name).decisions
      .filter((entry) => entry.layer === 'operational' && entry.tick < commonTicks).map((entry) => entry.tick)).size;
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
