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
