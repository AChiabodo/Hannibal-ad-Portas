import { describe, expect, it } from 'vitest';
import { armyRegistry, createArmyController, difficultyRegistry, playAiMatch, playAiMatchAt, type AiMatchRun } from '../../src/cli/ai-match.ts';
import { createAi } from '../../src/ai/controller.ts';
import { DIFFICULTY, type DifficultyName } from '../../src/ai/difficulty.ts';
import { HEADLESS_TICKS } from '../../src/sim/season.ts';
import { assault, type Command } from '../../src/sim/command.ts';
import { createMatch } from '../../src/sim/match.ts';
import { scriptedController } from '../../src/sim/controller.ts';
import { runMatch } from '../../src/sim/driver.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { createSiege, observeSiege, siegeMatchOutcome, siegeMatchRules, siegeMatchRulesForDifficulty, type SiegeVisible } from '../../src/sim/siege.ts';
import { TICK_HZ } from '../../src/sim/clock.ts';
import { createEconomy } from '../../src/sim/economy.ts';
import { createFogs } from '../../src/sim/fog.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { testMap } from '../sim/economy-fixtures.ts';

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
  return runMatch({ seed, ticks: HEADLESS_TICKS, rules: siegeMatchRulesForDifficulty(name), observe: observeSiege,
    outcome: siegeMatchOutcome,
    players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }] }).hash;
}

describe('the shipped siege AI in a headless Match', () => {
  it('does not abandon a paid assault while observing a wall away from the hidden ram (#76)', () => {
    const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
    const economy = createEconomy(map);
    const world = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
      siege: createSiege(map, economy), fog: createFogs() };
    // The north wall is visible; the ram is built outside the western Gate.
    const squad = musterSquad(economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 75, y: 65 });
    const match = createMatch({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
    match.step([]);
    match.step([assault('rome', [squad.id], 1)]);
    for (let i = 0; i < 10; i += 1) match.step([]);
    const before = observeSiege(world, 'rome');
    expect(before.treasury).toBe(5);
    expect(before.fronts.find((front) => front.settlement === 1))
      .toMatchObject({ siege: 'assault', besieger: 'rome', ram: null, ramKnown: false });
    const ai = createArmyController('imperator');
    const commands = ai.decide({ faction: 'rome', tick: match.state.tick, visible: before });
    expect(commands).toContainEqual({ kind: 'assault', faction: 'rome', squads: [squad.id], settlement: 1 });
    match.step(commands);
    expect(observeSiege(world, 'rome').treasury).toBe(5);
    expect(observeSiege(world, 'rome').fronts.find((front) => front.settlement === 1)?.siege).toBe('assault');
  });

  it.each(['tiro', 'centurio', 'imperator'] as const)('completes a real Carthaginian Blockade at %s', (level) => {
    const setup = { seed: 13, ticks: HEADLESS_TICKS, rules: siegeMatchRules,
      observe: observeSiege, outcome: siegeMatchOutcome };
    const run = runMatch({ ...setup, players: [
      { faction: 'rome', controller: scriptedController<SiegeVisible>([]) },
      { faction: 'carthage', controller: createArmyController(level) },
    ] });
    expect(run.result).toMatchObject({ kind: 'victory', winner: 'carthage',
      reason: { kind: 'stronghold', stronghold: 0, path: 'blockade' } });
    expect(run.result.tick).toBeLessThan(HEADLESS_TICKS);
    const replayed = runMatch({ ...setup, players: [
      { faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) },
    ] });
    expect(replayed.hash).toBe(run.hash);
  }, 60000);

  it('takes a Stronghold without a human and replays its log after the ram-readiness fix', () => {
    // Keep a decisive Roman assault as an explicit integration scene. A random
    // AI-vs-AI campaign is no longer a guarantee of either Faction's victory.
    const rules = { ...siegeMatchRules, createWorld() {
      const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
      const economy = createEconomy(map);
      const world = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
        siege: createSiege(map, economy), fog: createFogs() };
      for (const y of [75, 70, 80]) musterSquad(economy, map,
        { faction: 'rome', squadType: 'principes', men: 120, x: 67, y, facing: 'east' });
      return world;
    } };
    const ai = createArmyController('centurio');
    const setup = { seed: 1, ticks: 4000, rules, observe: observeSiege, outcome: siegeMatchOutcome };
    const run = runMatch({ ...setup, players: [{ faction: 'rome', controller: ai },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>([]) }] });
    expect(run.result).toMatchObject({ kind: 'victory', winner: 'rome',
      reason: { kind: 'stronghold', stronghold: 1, path: 'assault' } });
    expect(run.result.tick).toBeLessThan(4000);
    expect(ai.readLog().some((entry) => entry.selected.behaviour === 'siege' && entry.selected.id === 'assault')).toBe(true);
    const replayed = runMatch({ ...setup, players: [{ faction: 'rome', controller: scriptedController<SiegeVisible>(run.log) },
      { faction: 'carthage', controller: scriptedController<SiegeVisible>(run.log) }] });
    expect(replayed.hash).toBe(run.hash);
  }, 60000);

  it('resolves the retained seed 7 stall with an actual Stronghold conquest', () => {
    const run = runOf(7, HEADLESS_TICKS, 'centurio');
    expect(run.result).toEqual({ kind: 'victory', winner: 'carthage', tick: 4200,
      reason: { kind: 'stronghold', stronghold: 0, path: 'blockade' } });
    const siege = run.decisions.filter((entry) => entry.selected.behaviour === 'siege');
    expect(siege.some((entry) => entry.selected.id === 'blockade')).toBe(true);
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
   * Keep the same historical samples after the #74 physical map change, recording
   * their new outcome instead of replacing inconvenient seeds. Both paths
   * remain reachable and every Command log still replays.
   */
  const levelMatches = [
    { level: 'centurio', seed: 6, winner: 'carthage', path: 'blockade' },
    { level: 'tiro', seed: 13, winner: 'carthage', path: 'blockade' },
    { level: 'tiro', seed: 7, winner: 'carthage', path: 'blockade' },
    { level: 'imperator', seed: 12, winner: 'rome', path: 'assault' },
    { level: 'imperator', seed: 7, winner: 'carthage', path: 'blockade' },
  ] as const;

  for (const { level, seed, winner, path } of levelMatches) {
    it(`retained seed ${seed} still ends with a Stronghold fallen at ${level}: ${winner} by ${path}, and the log replays`, () => {
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
        for (const dx of [-3, 3]) for (const dy of [-2, 3])
          musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: home.x + dx, y: home.y + dy });
        // A hidden Carthaginian army the Roman AI cannot see, wherever it stands.
        for (let i = 0; i < 3; i += 1) {
          musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul',
            x: hiddenX + i * 4, y: 95 });
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
    expect(decide(135)).toEqual(decide(140));
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
