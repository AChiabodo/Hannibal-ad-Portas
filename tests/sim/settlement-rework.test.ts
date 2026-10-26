import { describe, expect, it } from 'vitest';
import { build, move, garrison, recruit, validateCommand, type Command } from '../../src/sim/command';
import { createMatch } from '../../src/sim/match';
import { createFogs } from '../../src/sim/fog';
import { createEconomy } from '../../src/sim/economy';
import { startCalendar } from '../../src/sim/season';
import { musterSquad } from '../../src/sim/movement';
import { createSiege, observeSiege, siegeMatchRules, type SiegeWorld } from '../../src/sim/siege';
import { testMap } from './economy-fixtures';
import { buildingCode } from '../../src/content/buildings';

function stage() {
  const map = testMap({ strongholds: [{ x: 25, y: 25 }, { x: 75, y: 75 }] });
  const economy = createEconomy(map);
  const world: SiegeWorld = { map, economy, calendar: startCalendar(), autumns: 0, winters: 0,
    fog: createFogs(), siege: createSiege(map, economy) };
  const match = createMatch<SiegeWorld, Command>({ seed: 1, rules: { ...siegeMatchRules, createWorld: () => world } });
  return { world, match };
}

describe('the shared settlement rules (#74)', () => {
  it('does not reserve Garrison capacity for a distant Squad and rejects it explicitly on arrival', () => {
    const { world, match } = stage();
    const distant = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 60, x: 55, y: 25 });
    const nearby = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 37, y: 25 });
    match.step([garrison('rome', [distant.id, nearby.id], 0)]);
    for (let tick = 0; tick < 500; tick += 1) match.step();
    const seen = observeSiege(match.state.world, 'rome');
    expect(seen.squads.find((squad) => squad.id === nearby.id)?.garrison).toBe(0);
    expect(seen.squads.find((squad) => squad.id === distant.id)).toMatchObject({ garrison: null, refused: 'garrison-full' });
    expect(seen.squads.find((squad) => squad.id === distant.id)?.passage).toBeUndefined();
  });
  it('keeps recruitment unpaid until its entire new formation fits the muster area', () => {
    const { world, match } = stage();
    world.economy.settlements[0]!.stocks.fill(100);
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 30, y: 25 });
    blocker.facing = 1;
    const before = observeSiege(world, 'rome').settlements[0]!.stocks;
    match.step([recruit('rome', 0, 'hastati', 120, 1)]);
    const waiting = observeSiege(match.state.world, 'rome');
    expect(waiting.squads).toHaveLength(1);
    expect(waiting.settlements[0]).toMatchObject({ stocks: before, pending: [{ kind: 'recruit', reason: 'space', men: 120 }] });
    match.step([move('rome', [blocker.id], 45, 25)]);
    for (let tick = 0; tick < 250; tick += 1) match.step();
    const after = observeSiege(match.state.world, 'rome');
    expect(after.settlements[0]?.pending).toEqual([]);
    expect(after.squads).toHaveLength(2);
    expect(after.squads.find((squad) => squad.id !== blocker.id)).toMatchObject({ capacity: 120, men: 120, garrison: null });
    expect(after.squads.find((squad) => squad.id !== blocker.id)?.x).not.toBe(25);
  });
  it('marches an outside Squad through its Gate before granting Garrison protection', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 40, y: 25 });
    match.step([garrison('rome', [squad.id], 0)]);
    const approaching = observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)!;
    expect(approaching.garrison).toBeNull();
    expect(approaching.passage?.phase).toBe('approaching');
    expect(approaching.x).toBeGreaterThan(32);
    for (let tick = 0; tick < 250; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)?.garrison).toBe(0);
  });
  it('keeps a Garrison protected until a free departure can actually begin', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    match.step([garrison('rome', [squad.id], 0)]);
    for (let tick = 0; tick < 150; tick += 1) match.step();
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 30, y: 25 });
    blocker.facing = 1;
    match.step([move('rome', [squad.id], 45, 25)]);
    const current = observeSiege(match.state.world, 'rome').squads.find((candidate) => candidate.id === squad.id)!;
    expect(current.garrison).toBe(0);
    expect(current.passage?.phase).toBe('leaving');
    match.step([move('rome', [blocker.id], 48, 25)]);
    for (let tick = 0; tick < 200; tick += 1) match.step();
    const outside = observeSiege(match.state.world, 'rome').squads.find((candidate) => candidate.id === squad.id)!;
    expect(outside.garrison).toBeNull();
    expect(outside.x).toBe(45);
  });
  it('waits before charging a building lot occupied by a field formation, then starts once clear', () => {
    const { world, match } = stage();
    const blocker = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 20, y: 30 });
    const before = observeSiege(world, 'rome').settlements[0]!.stocks;
    match.step([build('rome', 0, 'house')]);
    const waiting = observeSiege(match.state.world, 'rome').settlements[0]!;
    expect(waiting.works).toHaveLength(0);
    expect(waiting.stocks).toEqual(before);
    expect(waiting).toMatchObject({ pending: [{ kind: 'build', reason: 'space', building: 'house' }] });
    match.step([move('rome', [blocker.id], 45, 25)]);
    for (let tick = 0; tick < 100; tick += 1) match.step();
    const started = observeSiege(match.state.world, 'rome').settlements[0]!;
    expect(started.works).toHaveLength(1);
    expect(started.stocks.timber).toBe(before.timber - 4);
    expect(started).toMatchObject({ pending: [] });
  });
  it('cancels only the owned unpaid order through the shared Command', () => {
    const { world, match } = stage();
    world.economy.settlements[0]!.stocks.fill(0);
    match.step([build('rome', 0, 'house')]);
    const pending = observeSiege(match.state.world, 'rome').settlements[0]!.pending![0]!;
    match.step([validateCommand({ kind: 'cancelPending', faction: 'carthage', settlement: 0, order: pending.id })]);
    expect(observeSiege(match.state.world, 'rome').settlements[0]!.pending).toHaveLength(1);
    match.step([validateCommand({ kind: 'cancelPending', faction: 'rome', settlement: 0, order: pending.id })]);
    expect(observeSiege(match.state.world, 'rome').settlements[0]!.pending).toEqual([]);
    expect(observeSiege(match.state.world, 'rome').settlements[0]!.stocks).toEqual({ grain: 0, timber: 0, stone: 0, iron: 0 });
  });
  it('does not route a field Squad into the roof of a started Work', () => {
    const { world, match } = stage();
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 25, y: 25 });
    match.step([build('rome', 0, 'house')]);
    match.step([move('rome', [squad.id], 19, 30)]);
    const seen = observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)!;
    expect(seen.refused).toBe('unreachable');
    expect(seen.goal).toBeNull();
  });
  it.each([false, true])('admits an enemy through the gate only when broken: %s', (broken) => {
    const { world, match } = stage();
    if (broken) world.siege.fronts[1]!.structures[0]!.hp = 0;
    const squad = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 60, y: 75 });
    match.step([move('rome', [squad.id], 75, 75)]);
    const seen = observeSiege(match.state.world, 'rome').squads.find((current) => current.id === squad.id)!;
    expect(seen.refused).toBe(broken ? null : 'unreachable');
    expect(seen.goal).toEqual(broken ? { x: 75, y: 75 } : null);
  });
  it('does not engage field bodies through an intact enemy gate', () => {
    const { world, match } = stage();
    const defender = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 32, y: 25 });
    const attacker = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'gaul', men: 24, x: 33, y: 25 });
    defender.facing = 1;
    attacker.facing = 3;
    match.step();
    expect(observeSiege(match.state.world, 'rome').squads.find((squad) => squad.id === defender.id)?.engaged).toBe(false);
  });
  it.each([
    ['rome', 1, [60], 60], ['rome', 2, [120], 120], ['rome', 3, [120, 120], 240],
    ['carthage', 1, [24, 24], 60], ['carthage', 2, [48, 48, 24], 120], ['carthage', 3, [48, 48, 48, 48, 48], 240],
  ] as const)('enforces %s Tier %i capacity on whole Squads', (faction, tier, sizes, limit) => {
    const { world, match } = stage();
    const site = faction === 'rome' ? 0 : 1;
    world.economy.settlements[site]!.tier = tier;
    const at = world.economy.settlements[site]!;
    const squadType = faction === 'rome' ? 'hastati' : 'libyan-spear';
    const admitted = sizes.map((men) => {
      const squad = musterSquad(world.economy, world.map, { faction, squadType, men, x: at.x, y: at.y });
      match.step([garrison(faction, [squad.id], site)]);
      for (let tick = 0; tick < 200; tick += 1) match.step();
      return squad;
    });
    const overflow = musterSquad(world.economy, world.map, { faction, squadType, men: 24, x: at.x, y: at.y });
    match.step([garrison(faction, [overflow.id], site)]);
    for (let tick = 0; tick < 200; tick += 1) match.step();
    const seen = observeSiege(match.state.world, faction);
    expect(seen.fronts.find((front) => front.settlement === site)?.garrisonCapacity).toBe(limit);
    expect(admitted.every((squad) => seen.squads.find((current) => current.id === squad.id)?.garrison === site)).toBe(true);
    expect(seen.squads.find((squad) => squad.id === overflow.id)?.garrison).toBeNull();
  });
  it('counts survivors and rejects a whole Squad which exceeds the Tier I limit', () => {
    const { world, match } = stage();
    const worn = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 120, x: 25, y: 25 });
    worn.strength = 50;
    match.step([garrison('rome', [worn.id], 0)]);
    for (let tick = 0; tick < 200; tick += 1) match.step();
    const next = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', men: 24, x: 26, y: 25 });
    match.step([garrison('rome', [next.id], 0)]);
    for (let tick = 0; tick < 200; tick += 1) match.step();
    const seen = observeSiege(match.state.world, 'rome');
    expect(seen.squads.find((squad) => squad.id === worn.id)?.garrison).toBe(0);
    expect(seen.squads.find((squad) => squad.id === next.id)?.garrison).toBeNull();
    expect(seen.fronts.find((front) => front.settlement === 0)).toMatchObject({ garrisonMen: 50, garrisonCapacity: 60 });
  });
  it('does not admit cavalry or elephants to the wall defenders', () => {
    const { world, match } = stage();
    const horse = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'numidian-horse', x: 75, y: 75 });
    const beast = musterSquad(world.economy, world.map, { faction: 'carthage', squadType: 'elephant', x: 75, y: 75 });
    match.step([garrison('carthage', [horse.id, beast.id], 1)]);
    for (let tick = 0; tick < 200; tick += 1) match.step();
    expect(observeSiege(match.state.world, 'carthage').squads.every((squad) => squad.garrison === null)).toBe(true);
  });
  it('upgrades real resistance proportionally without closing an existing Breach', () => {
    const { world, match } = stage();
    const site = world.economy.settlements[0]!;
    site.population = 40;
    site.works.push({ building: buildingCode('villa')!, remaining: 1 });
    world.siege.fronts[0]!.structures[1]!.hp = 30;
    world.siege.fronts[0]!.structures[2]!.hp = 0;
    match.step();
    const front = observeSiege(match.state.world, 'rome').fronts.find((current) => current.settlement === 0)!;
    expect(front.structures[0]).toMatchObject({ hp: 180, maxHp: 180 });
    expect(front.structures[1]).toMatchObject({ hp: 45, maxHp: 90 });
    expect(front.structures[2]).toMatchObject({ hp: 0, standing: false });
    site.works.push({ building: buildingCode('forum')!, remaining: 1 });
    match.step();
    const third = observeSiege(match.state.world, 'rome').fronts.find((current) => current.settlement === 0)!;
    expect(third.structures[0]).toMatchObject({ hp: 240, maxHp: 240 });
    expect(third.structures[1]).toMatchObject({ hp: 60, maxHp: 120 });
    expect(third.structures[2]).toMatchObject({ hp: 0, standing: false });
  });
});
