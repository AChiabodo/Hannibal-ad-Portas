import { describe, expect, it } from 'vitest';
import { attack, move, type Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { createFogs } from '../../src/sim/fog';
import { createEconomy } from '../../src/sim/economy';
import { startCalendar } from '../../src/sim/season';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { MAP_HEIGHT, TERRAIN, tileIndex } from '../../src/sim/map';
import { formationFootprint } from '../../src/content/formation';
import { intersects } from '../../src/content/settlement-layout';
import { testMap } from './economy-fixtures';

function stage() {
  const map = testMap({ strongholds: [{ x: 20, y: 20 }, { x: 100, y: 100 }] });
  for (let y = 0; y < MAP_HEIGHT; y += 1) map.terrain[tileIndex(55, y)] = TERRAIN.river;
  for (let y = 48; y <= 52; y += 1) map.terrain[tileIndex(55, y)] = TERRAIN.bridge;
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  return { world, match };
}

describe('bridge traffic', () => {
  it('lets two approaching cohorts cross without overlapping and restores their formation', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 47 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 54 });
    match.step([move('rome', [first.id], 68, 47), move('rome', [second.id], 68, 54)]);
    let sawColumn = false;
    let firstCrossing = -1;
    let secondCrossing = -1;
    for (let tick = 0; tick < 400; tick += 1) {
      match.step();
      const shown = observeSiege(match.state.world, 'rome').squads;
      const a = shown.find((squad) => squad.id === first.id)!;
      const b = shown.find((squad) => squad.id === second.id)!;
      if (a.x === 55) {
        sawColumn ||= a.formation === 'column';
        expect(a.passage).toBeUndefined();
      }
      if (a.x === 55 && firstCrossing < 0) firstCrossing = tick;
      if (b.x === 55 && secondCrossing < 0) secondCrossing = tick;
      const rect = (squad: typeof a) => ({ ...formationFootprint(squad.capacity, squad.formation, squad.facing),
        x: squad.x + formationFootprint(squad.capacity, squad.formation, squad.facing).x,
        y: squad.y + formationFootprint(squad.capacity, squad.formation, squad.facing).y });
      expect(intersects(rect(a), rect(b)), `overlap on tick ${tick}`).toBe(false);
    }
    const shown = observeSiege(match.state.world, 'rome').squads;
    expect(sawColumn).toBe(true);
    expect(firstCrossing).toBeGreaterThanOrEqual(0);
    expect(secondCrossing).toBeGreaterThan(firstCrossing);
    expect(shown.find((squad) => squad.id === first.id)).toMatchObject({ x: 68, y: 47, goal: null, formation: 'line' });
    expect(shown.find((squad) => squad.id === second.id)).toMatchObject({ x: 68, y: 54, goal: null, formation: 'line' });
  });

  it('lets opposite friendly arrivals take turns without permanently blocking the bridge', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 50 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 68, y: 50 });
    match.step([move('rome', [first.id], 70, 50), move('rome', [second.id], 41, 50)]);
    for (let tick = 0; tick < 600; tick += 1) {
      match.step();
      const shown = observeSiege(match.state.world, 'rome').squads;
      const a = shown.find((squad) => squad.id === first.id)!;
      const b = shown.find((squad) => squad.id === second.id)!;
      const rect = (squad: typeof a) => ({ ...formationFootprint(squad.capacity, squad.formation, squad.facing),
        x: squad.x + formationFootprint(squad.capacity, squad.formation, squad.facing).x,
        y: squad.y + formationFootprint(squad.capacity, squad.formation, squad.facing).y });
      expect(intersects(rect(a), rect(b)), `overlap on tick ${tick}`).toBe(false);
    }
    const shown = observeSiege(match.state.world, 'rome').squads;
    expect(shown.find((squad) => squad.id === first.id)).toMatchObject({ x: 70, y: 50, goal: null });
    expect(shown.find((squad) => squad.id === second.id)).toMatchObject({ x: 41, y: 50, goal: null });
  });

  it('gives the crossing to the closer arrival even when another squad registered first', () => {
    const { world, match } = stage();
    const farther = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 46, y: 46 });
    const nearer = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 49, y: 53 });
    match.step([move('rome', [farther.id], 70, 46), move('rome', [nearer.id], 70, 53)]);
    let farTick = -1, nearTick = -1;
    for (let tick = 0; tick < 400; tick += 1) {
      match.step();
      const shown = observeSiege(match.state.world, 'rome').squads;
      if (shown.find((squad) => squad.id === farther.id)?.x === 55 && farTick < 0) farTick = tick;
      if (shown.find((squad) => squad.id === nearer.id)?.x === 55 && nearTick < 0) nearTick = tick;
    }
    expect(nearTick).toBeGreaterThanOrEqual(0);
    expect(farTick).toBeGreaterThan(nearTick);
  });

  it('lets a faster squad engage the bridge first when it can arrive before a slower squad', () => {
    const { world, match } = stage();
    const foot = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 49, y: 53 });
    const horse = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'numidian-horse', men: 12, x: 46, y: 46 });
    match.step([move('carthage', [foot.id], 70, 53), move('carthage', [horse.id], 70, 46)]);
    let footTick = -1, horseTick = -1;
    for (let tick = 0; tick < 400; tick += 1) {
      match.step();
      const shown = observeSiege(match.state.world, 'carthage').squads;
      if (shown.find((squad) => squad.id === foot.id)?.x === 55 && footTick < 0) footTick = tick;
      if (shown.find((squad) => squad.id === horse.id)?.x === 55 && horseTick < 0) horseTick = tick;
    }
    expect(horseTick).toBeGreaterThanOrEqual(0);
    expect(footTick).toBeGreaterThan(horseTick);
  });

  it('waits before entering while a friendly body blocks the far exit', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 50 });
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 57, y: 50 });
    match.step([move('rome', [first.id], 70, 50)]);
    for (let tick = 0; tick < 150; tick += 1) match.step();
    const stopped = observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === first.id)!;
    expect(stopped.x).toBeLessThan(55);
    match.step([move('rome', [blocker.id], 72, 45)]);
    for (let tick = 0; tick < 350; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === first.id)).toMatchObject({ x: 70, y: 50, goal: null });
  });

  it('clears bridge traffic after opposing fighters disengage and withdraw', () => {
    const { world, match } = stage();
    const traveller = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 50 });
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 52, y: 50 });
    const enemy = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 56, y: 50 });
    match.step([move('rome', [traveller.id], 70, 50), attack('rome', [blocker.id], enemy.id), attack('carthage', [enemy.id], blocker.id)]);
    let fought = false;
    for (let tick = 0; tick < 250; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'rome').squads.find((squad) => squad.id === blocker.id);
      const other = observeSiege(world, 'carthage').squads.find((squad) => squad.id === enemy.id);
      if (seen === undefined || other === undefined || seen.men < 24 || other.men < 24) { fought = true; break; }
    }
    expect(fought).toBe(true);
    match.step([move('rome', [blocker.id], 38, 40), move('carthage', [enemy.id], 75, 40)]);
    for (let tick = 0; tick < 600; tick += 1) match.step();
    expect(observeSiege(world, 'rome').squads.find((squad) => squad.id === traveller.id))
      .toMatchObject({ x: 70, y: 50, goal: null });
  });

  it('clears the bridge after a fighting squad is destroyed and its opponent leaves', () => {
    const { world, match } = stage();
    const traveller = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 50 });
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 52, y: 50 });
    const enemy = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 56, y: 50 });
    enemy.strength = 1;
    enemy.morale = 99;
    match.step([move('rome', [traveller.id], 70, 50), attack('rome', [blocker.id], enemy.id), attack('carthage', [enemy.id], blocker.id)]);
    for (let tick = 0; tick < 250 && observeSiege(world, 'carthage').squads.some((squad) => squad.id === enemy.id); tick += 1) match.step();
    expect(observeSiege(world, 'carthage').squads.some((squad) => squad.id === enemy.id)).toBe(false);
    match.step([move('rome', [blocker.id], 38, 40)]);
    for (let tick = 0; tick < 600; tick += 1) match.step();
    expect(observeSiege(world, 'rome').squads.find((squad) => squad.id === traveller.id))
      .toMatchObject({ x: 70, y: 50, goal: null });
  });

  it('releases bridge traffic after an enemy routs and withdraws', () => {
    const { world, match } = stage();
    const traveller = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 43, y: 50 });
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 52, y: 50 });
    const enemy = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 56, y: 50 });
    enemy.morale = 1;
    match.step([move('rome', [traveller.id], 70, 50), attack('rome', [blocker.id], enemy.id), attack('carthage', [enemy.id], blocker.id)]);
    let routed = false;
    for (let tick = 0; tick < 250; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'carthage').squads.find((squad) => squad.id === enemy.id);
      if (seen?.routing) { routed = true; break; }
    }
    expect(routed).toBe(true);
    match.step([move('rome', [blocker.id], 38, 40)]);
    let retreated = false;
    for (let tick = 0; tick < 600; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'carthage').squads.find((squad) => squad.id === enemy.id);
      retreated ||= seen !== undefined && seen.x > 56;
    }
    expect(retreated).toBe(true);
    expect(observeSiege(world, 'rome').squads.find((squad) => squad.id === traveller.id))
      .toMatchObject({ x: 70, y: 50, goal: null });
  });

  it('allows opposing squads to engage at a bridge rather than pass through each other', () => {
    const { world, match } = stage();
    const roman = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 52, y: 50 });
    const carthaginian = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'libyan-spear', men: 24, x: 56, y: 50 });
    match.step([attack('rome', [roman.id], carthaginian.id), attack('carthage', [carthaginian.id], roman.id)]);
    let fought = false;
    for (let tick = 0; tick < 250; tick += 1) {
      match.step();
      const rome = observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === roman.id);
      const carthage = observeSiege(match.state.world, 'carthage').squads.find((squad) => squad.id === carthaginian.id);
      if (rome === undefined || carthage === undefined || rome.men < 24 || carthage.men < 24) { fought = true; break; }
    }
    expect(fought).toBe(true);
  });
});
