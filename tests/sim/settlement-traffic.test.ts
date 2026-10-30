import { describe, expect, it } from 'vitest';
import { attackMove, garrison, hold, move, type Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { createFogs } from '../../src/sim/fog';
import { createEconomy } from '../../src/sim/economy';
import { startCalendar } from '../../src/sim/season';
import { musterSquad, routeCacheFor } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { testMap } from './economy-fixtures';
import { formationFootprint } from '../../src/content/formation';
import { intersects } from '../../src/content/settlement-layout';
import type { VisibleSquad } from '../../src/sim/economy-match';

function ground(squad: VisibleSquad) {
  const rect = formationFootprint(squad.capacity, squad.formation, squad.facing);
  return { ...rect, x: rect.x + squad.x, y: rect.y + squad.y };
}

function stage() {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  return { world, match };
}

describe('physical access traffic (#74)', () => {
  it('bounds route searches when a group clicks an intact enemy courtyard (#76)', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 60, y: 75 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 60, y: 82 });
    const cache = routeCacheFor(world.map);
    const before = cache.searches;
    match.step([move('rome', [first.id, second.id], 75, 75)]);
    expect(cache.searches - before, 'at most a failed search and an accepted route per Squad').toBeLessThanOrEqual(4);
    const goals = observeSiege(world, 'rome').squads.map((squad) => squad.goal);
    expect(goals.every((goal) => goal !== null)).toBe(true);
    for (let tick = 0; tick < 500; tick += 1) match.step();
    const arrived = observeSiege(world, 'rome').squads;
    expect(arrived.map(({ x, y }) => ({ x, y }))).toEqual(goals);
    expect(arrived.every((squad) => squad.goal === null && squad.refused === null)).toBe(true);
  });

  it('keeps group arrivals unchanged while repeated orders cross the Gate (#76)', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 25 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 27 });
    const order = move('rome', [first.id, second.id], 33, 24);
    match.step([order]);
    const goals = observeSiege(world, 'rome').squads.map((squad) => squad.goal);
    for (let tick = 0; tick < 180; tick += 1) {
      match.step([order]);
      const seen = observeSiege(world, 'rome').squads;
      expect(seen.map((squad) => squad.goal ?? { x: squad.x, y: squad.y }), `arrivals at tick ${tick}`).toEqual(goals);
    }
    expect(observeSiege(world, 'rome').squads.every((squad) => squad.goal === null && squad.refused === null)).toBe(true);
  });

  it.each([false, true])('lets a moving peer yield without crossing the Gate itself, with repeated orders=%s (#76)', (repeated) => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 29, y: 24, facing: 'east' });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 30, y: 24, facing: 'west' });
    const orders = [move('rome', [first.id], 33, 24), move('rome', [second.id], 29, 24)];
    match.step(orders);
    for (let tick = 0; tick < 180; tick += 1) {
      match.step(repeated ? orders : []);
      const seen = observeSiege(world, 'rome').squads;
      expect(intersects(ground(seen[0]!), ground(seen[1]!)), `body overlap at tick ${tick}`).toBe(false);
    }
    expect(observeSiege(world, 'rome').squads[0]).toMatchObject({ x: 33, y: 24, goal: null, refused: null });
    expect(observeSiege(world, 'rome').squads[1]).toMatchObject({ x: 29, y: 24, goal: null, refused: null });
  });

  it.each([move, attackMove])('lets a group of full cohorts claim the clicked capture square behind an open Gate (#76)', (order) => {
    const { world, match } = stage();
    world.siege.fronts[1]!.structures.find((structure) => structure.kind === 0)!.hp = 0;
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 60, y: 75 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 60, y: 82 });
    match.step([order('rome', [first.id, second.id], 75, 75)]);
    expect(observeSiege(world, 'rome').squads.find((squad) => squad.id === first.id)?.goal).toEqual({ x: 75, y: 75 });
    for (let tick = 0; tick < 500; tick += 1) match.step();
    expect(observeSiege(world, 'rome').settlements.some((site) => site.id === 1)).toBe(true);
  });

  it.each([move, attackMove])('finds a column route before turning onto a narrow Gate shoulder (#76)', (order) => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 25 });
    match.step([order('rome', [squad.id], 33, 24)]);
    for (let tick = 0; tick < 180; tick += 1) match.step();
    expect(observeSiege(world, 'rome').squads[0]).toMatchObject({ x: 33, y: 24, goal: null, refused: null });
  });

  it.each([move, attackMove])('routes a group to the shoulder of its Gate in a pose the marching column can reach (#76)', (order) => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 25 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 27 });
    match.step([order('rome', [first.id, second.id], 33, 24)]);
    const goals = observeSiege(world, 'rome').squads.map((squad) => squad.goal);
    expect(goals.every((goal) => goal !== null)).toBe(true);
    expect(new Set(goals.map((goal) => JSON.stringify(goal))).size).toBe(2);
    for (let tick = 0; tick < 180; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'rome').squads;
      expect(intersects(ground(seen[0]!), ground(seen[1]!)), `body overlap at tick ${tick}`).toBe(false);
    }
    const arrived = observeSiege(world, 'rome').squads;
    expect(arrived.map(({ x, y }) => ({ x, y }))).toEqual(goals);
    expect(arrived.every((squad) => squad.goal === null && squad.refused === null)).toBe(true);
  });

  it('leaves the Gate usable when a small first arrival is followed by a full cohort (#76)', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 28, y: 25 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 25, y: 29 });
    match.step([move('rome', [first.id, second.id], 33, 24)]);
    const goals = observeSiege(world, 'rome').squads.map((squad) => squad.goal);
    expect(goals.every((goal) => goal !== null)).toBe(true);
    for (let tick = 0; tick < 350; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'rome').squads;
      expect(intersects(ground(seen[0]!), ground(seen[1]!)), `body overlap at tick ${tick}`).toBe(false);
    }
    const arrived = observeSiege(world, 'rome').squads;
    expect(arrived.map(({ x, y }) => ({ x, y }))).toEqual(goals);
    expect(arrived.every((squad) => squad.goal === null && squad.refused === null)).toBe(true);
  });

  it('releases a completed field passage whose tail still touches the Gate (#76)', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    match.step([move('rome', [squad.id], 34, 25)]);
    for (let tick = 0; tick < 180; tick += 1) match.step();
    const arrived = observeSiege(world, 'rome').squads.find((current) => current.id === squad.id)!;
    expect(arrived).toMatchObject({ x: 34, y: 25, goal: null });
    expect(arrived.passage).toBeUndefined();
    match.step([move('rome', [squad.id], 25, 25)]);
    for (let tick = 0; tick < 180; tick += 1) match.step();
    expect(observeSiege(world, 'rome').squads.find((current) => current.id === squad.id))
      .toMatchObject({ x: 25, y: 25, goal: null });
  });

  it('keeps passage precedence when a marching arrival is reassigned to wall duty (#76)', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 22 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 28 });
    match.step([move('rome', [first.id], 25, 22), move('rome', [second.id], 25, 28)]);
    let entering = false;
    for (let tick = 0; tick < 120; tick += 1) {
      const a = observeSiege(world, 'rome').squads.find((squad) => squad.id === first.id)!;
      if (a.passage?.phase === 'entering') { entering = true; break; }
      match.step();
    }
    expect(entering).toBe(true);
    match.step([garrison('rome', [first.id], 0)]);
    for (let tick = 0; tick < 350; tick += 1) {
      match.step();
      const seen = observeSiege(world, 'rome').squads;
      const a = seen.find((squad) => squad.id === first.id)!;
      const b = seen.find((squad) => squad.id === second.id)!;
      if (a.garrison === null) expect(intersects(ground(a), ground(b)), `body overlap at tick ${tick}`).toBe(false);
    }
    const seen = observeSiege(world, 'rome').squads;
    expect(seen.find((squad) => squad.id === first.id)?.garrison).toBe(0);
    expect(seen.find((squad) => squad.id === second.id)).toMatchObject({ x: 25, y: 28, goal: null });
  });

  it('uses a real marching column through a Gate even for a small field Squad, then restores line', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 25 });
    match.step([move('rome', [squad.id], 25, 25)]);
    let crossed = false;
    for (let tick = 0; tick < 140; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)!;
      if (seen.x === 32) { crossed = true; expect(seen.formation).toBe('column'); }
    }
    expect(crossed).toBe(true);
    expect(observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)).toMatchObject({ x: 25, y: 25, formation: 'line', goal: null });
  });
  it('serializes converging field Squads through one Gate without overlapping their bodies', () => {
    const { world, match } = stage();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 22 });
    const second = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 28 });
    match.step([move('rome', [first.id], 24, 22), move('rome', [second.id], 24, 28)]);
    for (let tick = 0; tick < 250; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads;
      const a = seen.find((squad) => squad.id === first.id)!;
      const b = seen.find((squad) => squad.id === second.id)!;
      expect(intersects(ground(a), ground(b)), `body overlap at tick ${tick}: ${a.x},${a.y}/${b.x},${b.y}`).toBe(false);
    }
    expect(observeSiege(match.state.world, 'rome').squads.filter((squad) => [first.id, second.id].includes(squad.id)).map((squad) => squad.goal)).toEqual([null, null]);
  });
  it('lets the losing arrival yield off the lane so opposing orders both finish', () => {
    const { world, match } = stage();
    const leaving = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    const entering = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 25 });
    match.step([move('rome', [leaving.id], 48, 25), move('rome', [entering.id], 25, 23)]);
    for (let tick = 0; tick < 320; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads;
      const a = seen.find((squad) => squad.id === leaving.id)!;
      const b = seen.find((squad) => squad.id === entering.id)!;
      expect(intersects(ground(a), ground(b)), `body overlap at tick ${tick}`).toBe(false);
    }
    const seen = observeSiege(match.state.world, 'rome').squads;
    expect(seen.find((squad) => squad.id === leaving.id)).toMatchObject({ x: 48, y: 25, goal: null });
    expect(seen.find((squad) => squad.id === entering.id)).toMatchObject({ x: 25, y: 23, goal: null });
  });
  it('lets an ordered field blocker clear the assembly space before a protected departure starts', () => {
    const { world, match } = stage();
    const leaving = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    match.step([garrison('rome', [leaving.id], 0)]);
    for (let tick = 0; tick < 150; tick += 1) match.step();
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 30, y: 25 });
    blocker.facing = 1;
    match.step([move('rome', [leaving.id], 45, 25)]);
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === leaving.id)?.garrison).toBe(0);
    match.step([move('rome', [blocker.id], 48, 25)]);
    for (let tick = 0; tick < 250; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === leaving.id)).toMatchObject({ garrison: null, x: 45, y: 25 });
  });
  it('coordinates a field passage with admission to wall duty', () => {
    const { world, match } = stage();
    const recruit = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 22 });
    const marching = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 28 });
    match.step([garrison('rome', [recruit.id], 0), move('rome', [marching.id], 24, 28)]);
    for (let tick = 0; tick < 300; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads;
      const a = seen.find((squad) => squad.id === recruit.id)!;
      const b = seen.find((squad) => squad.id === marching.id)!;
      if (a.garrison === null) expect(intersects(ground(a), ground(b)), `body overlap at tick ${tick}`).toBe(false);
    }
    const seen = observeSiege(match.state.world, 'rome').squads;
    expect(seen.find((squad) => squad.id === recruit.id)?.garrison).toBe(0);
    expect(seen.find((squad) => squad.id === marching.id)).toMatchObject({ x: 24, y: 28, goal: null });
  });
  it('cancels an off-lane wait with Hold rather than resuming its previous destination', () => {
    const { world, match } = stage();
    const leaving = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    const entering = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 25 });
    match.step([move('rome', [leaving.id], 48, 25), move('rome', [entering.id], 25, 23)]);
    for (let tick = 0; tick < 10; tick += 1) match.step();
    match.step([hold('rome', [entering.id])]);
    const at = observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === entering.id)!;
    for (let tick = 0; tick < 250; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === entering.id)).toMatchObject({ x: at.x, y: at.y, goal: null });
  });
  it('moves a full purchased cohort through the Gate and restores its original formation after the tail clears', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 45, y: 25 });
    match.step([move('rome', [squad.id], 25, 25)]);
    for (let tick = 0; tick < 300; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)).toMatchObject({ x: 25, y: 25, formation: 'line', goal: null, refused: null });
  });
  it('allows independent Breaches to carry concurrent passages', () => {
    const { world, match } = stage();
    for (const wall of world.siege.fronts[0]!.structures) if (wall.kind === 1 && [0, 2].includes(wall.side)) wall.hp = 0;
    const north = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 10 });
    const south = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 40 });
    match.step([move('rome', [north.id], 25, 23), move('rome', [south.id], 25, 28)]);
    let simultaneous = false;
    for (let tick = 0; tick < 180; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads;
      const a = seen.find((squad) => squad.id === north.id)!;
      const b = seen.find((squad) => squad.id === south.id)!;
      if (a.y >= 17 && a.y <= 19 && b.y >= 31 && b.y <= 33) simultaneous = true;
      expect(intersects(ground(a), ground(b))).toBe(false);
    }
    expect(simultaneous).toBe(true);
    expect(observeSiege(match.state.world, 'rome').squads.filter((squad) => [north.id, south.id].includes(squad.id)).map((squad) => squad.goal)).toEqual([null, null]);
  });
  it('clears a tightly spaced line of full cohorts so the FIFO leader can rotate into its marching column', () => {
    const { world, match } = stage();
    const squads = [25, 29, 33].map((y) => musterSquad(world.economy, world.map,
      { faction: 'rome', squadType: 'hastati', men: 120, x: 40, y }));
    match.step(squads.map((squad) => move('rome', [squad.id], 25, 25)));
    for (let tick = 0; tick < 220; tick += 1) {
      match.step();
      const seen = observeSiege(match.state.world, 'rome').squads;
      for (let first = 0; first < seen.length; first += 1) for (let second = first + 1; second < seen.length; second += 1)
        expect(intersects(ground(seen[first]!), ground(seen[second]!)), `body overlap at tick ${tick}`).toBe(false);
    }
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === squads[0]!.id)).toMatchObject({ x: 25, y: 25, goal: null });
  });
});
