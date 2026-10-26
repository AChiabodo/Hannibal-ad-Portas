import { expect, it } from 'vitest';
import { move, attackMove, type Command } from '../../src/sim/command';
import { scriptedController } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import { createEconomy } from '../../src/sim/economy';
import { economyMatchRules, observeEconomy, type EconomyWorld, type EconomyVisible } from '../../src/sim/economy-match';
import { musterSquad } from '../../src/sim/movement';
import { startCalendar } from '../../src/sim/season';
import { plainMap } from './test-map';
import { paint } from './test-map';
import { TERRAIN, MAP_HEIGHT, MAP_WIDTH, tileIndex } from '../../src/sim/map';
import { replay } from '../../src/sim/replay';

function world(): EconomyWorld {
  const map = plainMap();
  const result = { map, calendar: startCalendar(), economy: createEconomy(map), autumns: 0, winters: 0 };
  for (let i = 0; i < 12; i += 1) {
    musterSquad(result.economy, map, { faction: 'rome', squadType: 'hastati', men: 24, x: 5, y: 5 });
  }
  return result;
}

function play(state: EconomyWorld, commands: readonly Command[], ticks = 200) {
  return runMatch<EconomyWorld, EconomyVisible>({ seed: 1, ticks,
    rules: { createWorld: () => state, step: economyMatchRules.step }, observe: observeEconomy,
    outcome: () => null,
    players: [{ faction: 'rome', controller: scriptedController(commands.map((command) => ({ tick: 0, command }))) },
      { faction: 'carthage', controller: scriptedController([]) }],
  });
}

it.each([move, attackMove])('a public group Command arrives at twelve distinct nearby positions', (command) => {
  const state = world();
  play(state, [command('rome', state.economy.squads.map((s) => s.id).reverse(), 20, 20)]);
  const visible = observeEconomy(state, 'rome').squads;
  expect(new Set(visible.map((s) => `${s.x},${s.y}`)).size).toBe(12);
  expect(visible[0]).toMatchObject({ x: 20, y: 20, goal: null, refused: null });
  expect(visible.every((s) => Math.max(Math.abs(s.x - 20), Math.abs(s.y - 20)) <= 12)).toBe(true);
});

it('stable ID assignments survive Command and economy ordering, repeated orders and Replay', () => {
  const state = world();
  const ids = state.economy.squads.map((s) => s.id);
  const commands = [move('rome', ids, 20, 20), move('rome', [...ids].reverse(), 20, 20)];
  const result = play(state, commands);
  const fresh = world();
  const repeated = replay({ seed: 1, ticks: 200, log: result.log,
    rules: { createWorld: () => fresh, step: economyMatchRules.step } });
  expect(repeated.hash).toBe(result.hash);
  const reordered = world();
  reordered.economy.squads.reverse();
  play(reordered, [move('rome', [...ids].reverse(), 20, 20)]);
  const positions = (s: EconomyWorld) => observeEconomy(s, 'rome').squads
    .map(({ id, x, y }) => ({ id, x, y })).sort((a, b) => a.id - b.id);
  expect(positions(reordered)).toEqual(positions(state));
});

it('mixed purchased sizes and formations cross a shared ford and spread on arrival', () => {
  const state = world();
  for (let y = 0; y < MAP_HEIGHT; y += 1) state.map.terrain[tileIndex(12, y)] = TERRAIN.river;
  // A full column needs both three abreast and room for its tail when turning.
  for (const y of [14, 15, 16]) state.map.terrain[tileIndex(12, y)] = TERRAIN.ford;
  musterSquad(state.economy, state.map, { faction: 'rome', squadType: 'hastati', men: 120,
    formation: 'column', x: 8, y: 25 });
  musterSquad(state.economy, state.map, { faction: 'rome', squadType: 'hastati', men: 60, x: 5, y: 5 });
  const ids = state.economy.squads.map((s) => s.id);
  play(state, [move('rome', ids, 28, 20)], 400);
  const visible = observeEconomy(state, 'rome').squads;
  expect(visible.every((s) => s.x > 12 && s.goal === null && s.refused === null)).toBe(true);
  expect(new Set(visible.map((s) => `${s.x},${s.y}`)).size).toBe(14);
  const large = visible.find((s) => s.capacity === 120)!;
  expect(visible.filter((s) => s.id !== large.id).every((s) =>
    Math.max(Math.abs(s.x - large.x), Math.abs(s.y - large.y)) >= 7)).toBe(true);
});

it('an obstructed map edge keeps arrivals legal and near the click', () => {
  const state = world();
  paint(state.map, ['~~~', '~..', '~..'], 0, 0);
  play(state, [move('rome', state.economy.squads.map((s) => s.id), 1, 1)]);
  const visible = observeEconomy(state, 'rome').squads;
  expect(visible.every((s) => s.x >= 0 && s.y >= 0 && s.x <= 13 && s.y <= 13 && s.refused === null)).toBe(true);
  expect(new Set(visible.map((s) => `${s.x},${s.y}`)).size).toBe(12);
});

it('insufficient space refuses only excess Squads and preserves their previous route', () => {
  const state = world();
  state.map.terrain.fill(TERRAIN.river);
  paint(state.map, ['............', '............', '............'], 4, 4);
  const ids = state.economy.squads.map((s) => s.id);
  play(state, [move('rome', [ids[11]!], 14, 5), move('rome', ids, 5, 5)], 1);
  const visible = observeEconomy(state, 'rome').squads;
  expect(visible.filter((s) => s.refused === null)).toHaveLength(3);
  expect(visible.filter((s) => s.refused === 'no-space')).toHaveLength(9);
  expect(visible[11]).toMatchObject({ goal: { x: 14, y: 5 }, refused: 'no-space' });
});

it('an unreachable low-ID Squad does not claim a slot or cancel eligible peers', () => {
  const state = world();
  for (let y = 0; y < MAP_HEIGHT; y += 1) state.map.terrain[tileIndex(12, y)] = TERRAIN.river;
  state.economy.squads.slice(1).forEach((s) => { s.x = 18; });
  play(state, [move('rome', state.economy.squads.map((s) => s.id), 20, 20)]);
  const visible = observeEconomy(state, 'rome').squads;
  expect(visible[0]).toMatchObject({ x: 5, y: 5, refused: 'unreachable' });
  expect(visible[1]).toMatchObject({ x: 20, y: 20, refused: null });
  expect(new Set(visible.slice(1).map((s) => `${s.x},${s.y}`)).size).toBe(11);
});

it.each([{ x: MAP_WIDTH, y: 5, refused: 'off-map' }, { x: 20, y: 20, refused: 'water' }])(
  'an invalid target $refused refuses every Squad without replacing a prior route', ({ x, y, refused }) => {
    const state = world();
    state.map.terrain[tileIndex(20, 20)] = TERRAIN.river;
    const ids = state.economy.squads.map((s) => s.id);
    play(state, [move('rome', ids, 10, 10), move('rome', ids, x, y)], 1);
    expect(observeEconomy(state, 'rome').squads.every((s) => s.refused === refused && s.goal !== null)).toBe(true);
  });

it('a later group order replaces earlier destinations for every eligible peer', () => {
  const state = world();
  const ids = state.economy.squads.map((s) => s.id);
  play(state, [move('rome', ids, 20, 20), attackMove('rome', ids, 40, 40)], 400);
  expect(observeEconomy(state, 'rome').squads.every((s) =>
    Math.max(Math.abs(s.x - 40), Math.abs(s.y - 40)) <= 12 && s.goal === null)).toBe(true);
});
