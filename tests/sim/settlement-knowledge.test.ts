import { describe, expect, it } from 'vitest';
import { build, move, type Command } from '../../src/sim/command.ts';
import { createEconomy, UNOWNED } from '../../src/sim/economy.ts';
import { createFogs } from '../../src/sim/fog.ts';
import { createMatch, type Match } from '../../src/sim/match.ts';
import { musterSquad } from '../../src/sim/movement.ts';
import { startCalendar } from '../../src/sim/season.ts';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege.ts';
import { refreshSiegeFog } from '../../src/sim/siege-fog.ts';
import { settlementAppearances } from '../../src/sim/settlement-knowledge.ts';
import { buildingCode } from '../../src/content/index.ts';
import { settlementLayout } from '../../src/content/settlement-layout.ts';
import { testMap } from './economy-fixtures.ts';

function stage(owner = 1): SiegeWorld {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 80, y: 80 }], settlements: [{ x: 50, y: 50 }] });
  const economy = createEconomy(map);
  const village = economy.settlements[2]!;
  village.owner = owner;
  village.population = 30;
  village.stocks.fill(500);
  const stronghold = economy.settlements[1]!;
  stronghold.population = 30;
  stronghold.stocks.fill(500);
  return { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    siege: createSiege(map, economy), fog: createFogs() };
}
function on(world: SiegeWorld): Match<SiegeWorld, Command> {
  refreshSiegeFog(world, 0);
  return createMatch({ seed: 3, rules: { ...siegeMatchRules, createWorld: () => world } });
}
function run(match: Match<SiegeWorld, Command>, ticks: number): void {
  for (let tick = 0; tick < ticks; tick += 1) match.step();
}
/** The public integration seam: parent observeSiege wires this exact projection. */
function observe(match: Match<SiegeWorld, Command>) {
  return { ...observeSiege(match.state.world, 'rome'), appearances: settlementAppearances(match.state.world.fog.rome) };
}

describe('physical settlement knowledge through Match commands (#74)', () => {
  it('sees the hall without inventing the hidden square and preserves its tradition on capture', () => {
    const world = stage();
    world.economy.settlements[2]!.origin = 1;
    const scout = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 55, y: 44 });
    const match = on(world);
    const partial = observe(match).appearances.find((site) => site.id === 2);
    expect(partial?.tiles.find((tile) => tile.cell === 215)).toMatchObject({ tier: 1, origin: 'carthage' });
    expect(partial?.tiles.some((tile) => tile.cell === 312)).toBe(false);
    match.step([move('rome', [scout.id], 50, 50)]);
    run(match, 250);
    expect(observe(match).settlements.find((site) => site.id === 2)).toBeDefined();
    expect(observe(match).appearances.find((site) => site.id === 2)?.tiles.find((tile) => tile.cell === 215)).toMatchObject({ tier: 1, origin: 'carthage' });
  });
  it('discovers only the seen farm corner and freezes hidden completion and a hidden Tier upgrade', () => {
    function play(upgrade: boolean) {
      const world = stage();
      const scout = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 35, y: 39 });
      const match = on(world);
      // Empty reserved lots are ordinary ground; their visibility reveals no settlement.
      expect(observe(match).appearances.find((site) => site.id === 2)).toBeUndefined();
      match.step([build('carthage', 2, 'farm')]);
      const partial = observe(match).appearances.find((site) => site.id === 2)!;
      expect(partial).toBeDefined();
      expect(partial.tiles.some((tile) => tile.work?.building === 'farm' && tile.work.stage === 0)).toBe(true);
      expect(partial.tiles.some((tile) => tile.cell === 312)).toBe(false);
      expect(partial.tier).toBeUndefined();
      expect(partial.owner).toBeNull();
      expect(partial.tiles.length).toBeLessThan(625);
      match.step([move('rome', [scout.id], 30, 39)]);
      run(match, 70);
      const remembered = observe(match).appearances.find((site) => site.id === 2)!;
      expect(remembered.memory).toBe('remembered');
      match.step(upgrade ? [build('carthage', 2, 'villa')] : []);
      run(match, 850);
      expect(world.economy.settlements[2]!.tier).toBe(upgrade ? 2 : 1);
      expect(world.economy.settlements[2]!.works.find((work) => work.building === buildingCode('farm'))?.remaining).toBe(0);
      const frozen = observe(match).appearances.find((site) => site.id === 2)!;
      expect(frozen).toEqual(remembered);
      const before = match.hash();
      observe(match);
      observe(match);
      expect(match.hash()).toBe(before);
      match.step([move('rome', [scout.id], 35, 39)]);
      run(match, 70);
      const rediscovered = observe(match).appearances.find((site) => site.id === 2)!;
      expect(rediscovered.tiles.some((tile) => tile.work?.building === 'farm' && tile.work.stage === 2)).toBe(true);
      expect(rediscovered.tiles.some((tile) => tile.work?.building === 'villa')).toBe(false);
      expect(rediscovered.tier).toBeUndefined();
      return frozen;
    }
    expect(play(true)).toEqual(play(false));
  });

  it('does not change remembered ownership when an unseen village is captured', () => {
    const world = stage(UNOWNED);
    world.economy.settlements[2]!.works.push({ building: buildingCode('farm')!, ordinal: 0, origin: 0, remaining: 0 });
    const square = settlementLayout('settlement').capture;
    const scout = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24,
      x: 50 + square.x + square.width + 3, y: 50 + square.y });
    const captor = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 58, y: 50 });
    const match = on(world);
    expect(observe(match).appearances.find((site) => site.id === 2)?.tiles.some((tile) => tile.owner === 'none')).toBe(true);
    match.step([move('rome', [scout.id], 30, 39)]);
    run(match, 150);
    const before = observe(match).appearances.find((site) => site.id === 2)!;
    expect(before.memory).toBe('remembered');
    match.step([move('carthage', [captor.id], 50, 50)]);
    run(match, 250);
    expect(world.economy.settlements[2]!.owner).toBe(1);
    expect(observe(match).appearances.find((site) => site.id === 2)).toEqual(before);
    match.step([move('rome', [scout.id], 50 + square.x + square.width + 3, 50 + square.y)]);
    run(match, 160);
    expect(observe(match).appearances.find((site) => site.id === 2)?.owner).toBe('carthage');
  });

  it('retains observed wall Tier and damage while the hidden fortress upgrades', () => {
    const world = stage();
    world.siege.fronts[1]!.structures.find((part) => part.kind === 1 && part.side === 0)!.hp = 45;
    const scout = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 80, y: 69 });
    const match = on(world);
    const seen = observe(match).appearances.find((site) => site.id === 1)!;
    expect(seen.tiles.some((tile) => tile.structure?.side === 0 && tile.structure.condition === 'damaged' && tile.tier === 1)).toBe(true);
    match.step([move('rome', [scout.id], 60, 60)]);
    run(match, 100);
    const frozen = observe(match).appearances.find((site) => site.id === 1)!;
    match.step([build('carthage', 1, 'villa')]);
    run(match, 850);
    expect(world.economy.settlements[1]!.tier).toBe(2);
    expect(observe(match).appearances.find((site) => site.id === 1)).toEqual(frozen);
  });

  it('records a rotated ram only where observed, and sentries only on observed walls', () => {
    const world = stage();
    const front = world.siege.fronts[1]!;
    front.ram = 60;
    front.ramTicks = 20;
    const defender = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 80, y: 80 });
    defender.garrison = 1;
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 66, y: 80 });
    musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 80, y: 69 });
    const match = on(world);
    const seen = observe(match).appearances.find((site) => site.id === 1)!;
    expect(seen.gateSide).toBe(3);
    expect(seen.tiles.some((tile) => tile.ram === 'building')).toBe(true);
    expect(seen.tiles.filter((tile) => tile.ram !== undefined).every((tile) =>
      tile.cell % 25 >= 2 && tile.cell % 25 <= 3 && Math.floor(tile.cell / 25) >= 11 && Math.floor(tile.cell / 25) <= 13)).toBe(true);
    expect(seen.tiles.some((tile) => tile.garrison === true)).toBe(true);
    expect(seen.tiles.filter((tile) => tile.garrison !== undefined).every((tile) => tile.structure !== undefined)).toBe(true);
    expect(seen.tiles.some((tile) => tile.cell === 312)).toBe(false);
  });

});
