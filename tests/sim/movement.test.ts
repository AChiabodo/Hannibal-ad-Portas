/**
 * Squads that go where they are told, one acceptance criterion at a time
 * (ticket C1).
 *
 * Everything here is asked through the seams the game itself uses: a Squad is
 * raised in the economy's world, orders arrive as Commands through the
 * vocabulary, the rules are `economyMatchRules`'s own, and what a Faction may
 * see is an Observation. A handful of questions are asked of
 * `applyMovementCommands` and `march` directly — how many searches an order
 * cost, what a Command for the other Faction's Squad does — because those are
 * about the rules rather than about the driver, and everything else is played
 * through `runMatch`.
 *
 * Where a test wants a theatre it can see, it paints one (`test-map.ts`) and
 * opens an economy on it; where it wants the real thing, it uses the Match's own
 * world on a seed and B1's generated map.
 */
import { describe, expect, it } from 'vitest';
import { squadTypeOf } from '../../src/content';
import {
  attack,
  attackMove,
  blockade,
  build,
  formation,
  garrison,
  group,
  hold,
  move,
  recruit,
  withdraw,
  type Command,
} from '../../src/sim/command';
import { scriptedController, type Controller } from '../../src/sim/controller';
import { runMatch, type MatchRun } from '../../src/sim/driver';
import { createEconomy, type Squad } from '../../src/sim/economy';
import {
  economyMatchOutcome,
  economyMatchRules,
  observeEconomy,
  type EconomyVisible,
  type EconomyWorld,
  type VisibleSquad,
} from '../../src/sim/economy-match';
import { factionOf, type Faction } from '../../src/sim/faction';
import { hashState } from '../../src/sim/hash';
import {
  isWalkable,
  MAP_HEIGHT,
  MAP_WIDTH,
  terrainAt,
  tileIndex,
  tileX,
  tileY,
  type MapGrid,
  type Site,
} from '../../src/sim/map';
import {
  applyMovementCommands,
  march,
  musterSquad,
  routeCacheFor,
  type Placement,
} from '../../src/sim/movement';
import { createRouteCache, NO_REFUSAL, type RouteCache } from '../../src/sim/route';
import { startCalendar } from '../../src/sim/season';
import { depth, FACING, formationCode, frontage, menOf } from '../../src/sim/squad';
import { squadTypeId } from './economy-fixtures';
import { paintedMap, plainMap, repeated } from './test-map';

/** A world on a theatre the test drew itself, with no Squads in it and no Season gone by. */
function worldOf(map: MapGrid = plainMap()): EconomyWorld {
  return { map, calendar: startCalendar(), economy: createEconomy(map), autumns: 0, winters: 0 };
}

/** The Squad with this id, or a failure: a test that cannot find it has nothing to assert about. */
function squadOf(world: EconomyWorld, id: number): Squad {
  const found = world.economy.squads.find((squad) => squad.id === id);
  if (found === undefined) throw new Error(`there is no Squad ${id} in the world`);

  return found;
}

/**
 * Musters one Squad of a type onto a tile of a theatre the test drew, owned by
 * the Faction whose roster the type is on.
 */
function place(world: EconomyWorld, squadType: string, x: number, y: number): Squad {
  const faction: Faction = squadTypeOf(squadTypeId(squadType))?.faction ?? 'rome';

  return musterSquad(world.economy, world.map, { faction, squadType, x, y });
}

/** A hastati at (5,5) on a plain theatre, and the cache its orders are planned in. */
function plainSquad(): { world: EconomyWorld; squad: Squad; routes: RouteCache } {
  const world = worldOf();
  const squad = place(world, 'hastati', 5, 5);

  return { world, squad, routes: createRouteCache(world.map) };
}

/** A Controller that emits the Commands a script stamps for each tick. */
function script(...orders: readonly (readonly [number, Command])[]): Controller<EconomyVisible> {
  return scriptedController<EconomyVisible>(orders.map(([tick, command]) => ({ tick, command })));
}

/** What a test says about a Match it is about to play: the world, the bound, and the orders. */
interface Play {
  readonly world: EconomyWorld;
  readonly ticks: number;
  readonly rome?: Controller<EconomyVisible>;
  readonly carthage?: Controller<EconomyVisible>;
}

/** Plays the economy Match's own rules on a theatre the test built, with orders scripted. */
function play(options: Play): MatchRun {
  return runMatch<EconomyWorld, EconomyVisible>({
    seed: 1,
    rules: { createWorld: () => options.world, step: economyMatchRules.step },
    observe: observeEconomy,
    outcome: economyMatchOutcome,
    players: [
      { faction: 'rome', controller: options.rome ?? script() },
      { faction: 'carthage', controller: options.carthage ?? script() },
    ],
    ticks: options.ticks,
  });
}

/** What one Faction sees of its Squads: an Observation of the world, filtered for it. */
function seen(world: EconomyWorld, faction: Faction = 'rome'): VisibleSquad {
  const [first] = observeEconomy(world, faction).squads;
  if (first === undefined) throw new Error('the Observation shows no Squad at all');

  return first;
}

/** The tile a Squad stands on, as the map's own flat index. */
function tileUnder(squad: Squad): number {
  return tileIndex(squad.x, squad.y);
}

/** How far apart two tiles are, counting only orthogonal steps. */
function stepsBetween(one: number, other: number): number {
  return Math.abs(tileX(one) - tileX(other)) + Math.abs(tileY(one) - tileY(other));
}

/** The facing a Squad should hold to step from where it stands to the next tile of its route. */
function wayTo(squad: Squad): number {
  const next = squad.steps[0];
  if (next === undefined) return squad.facing;
  if (tileY(next) < squad.y) return FACING.north;
  if (tileY(next) > squad.y) return FACING.south;

  return tileX(next) > squad.x ? FACING.east : FACING.west;
}

/** Walkable tiles of a theatre, in the order the map reads them: where a test stands Squads up. */
function walkableTiles(world: EconomyWorld, count: number): readonly number[] {
  const tiles: number[] = [];

  for (let y = 8; y < MAP_HEIGHT - 8 && tiles.length < count; y += 8) {
    for (let x = 8; x < MAP_WIDTH - 8 && tiles.length < count; x += 8) {
      let clear = true;
      for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1)
        if (!isWalkable(terrainAt(world.map, x + dx, y + dy))) clear = false;
      if (clear) tiles.push(tileIndex(x, y));
    }
  }

  return tiles;
}

/** A Squad of hastati on a plain theatre, ordered to one tile, played on for a bound. */
function marchTo(world: EconomyWorld, squad: Squad, x: number, y: number, ticks: number): void {
  play({ world, ticks, rome: script([0, move('rome', [squad.id], x, y)]) });
}

describe('the world the Squads walk on', () => {
  it('begins on the theatre its seed generates, with the map itself in state', () => {
    const world = economyMatchRules.createWorld(7);

    expect(hashState(world)).toBe(hashState(economyMatchRules.createWorld(7)));
    expect(hashState(world)).not.toBe(hashState(economyMatchRules.createWorld(8)));
    expect(world.map.terrain.length).toBe(MAP_WIDTH * MAP_HEIGHT);
  });

  it('begins with no Squads in it: where an army comes from is recruitment, not movement', () => {
    const world = economyMatchRules.createWorld(7);

    expect(world.economy.squads).toEqual([]);
    expect(world.economy.nextSquadId).toBe(1);
  });

  it('runs to its bound and ends by the clock, because nothing can win a Match yet', () => {
    const run = play({ world: economyMatchRules.createWorld(7), ticks: 5 });

    expect(run.result).toEqual({ kind: 'clock', tick: 5 });
    expect(run.log).toEqual([]);
  });

  it('leaves a recruited Squad in the settlement muster ground, at its purchased strength', () => {
    const world = economyMatchRules.createWorld(7);
    const stronghold = world.economy.settlements[0];

    play({
      world,
      ticks: 1,
      rome: script([0, recruit('rome', 0, 'hastati', 24, 1)]),
    });

    const raised = squadOf(world, 1);
    expect(Math.max(Math.abs(raised.x - stronghold!.x), Math.abs(raised.y - stronghold!.y))).toBeLessThanOrEqual(6);
    expect(raised.strength).toBe(24);
    expect(raised.capacity).toBe(24);
    expect(seen(world)).toMatchObject({ x: raised.x, y: raised.y, men: 24, capacity: 24, goal: null, garrison: null });
  });

  it('musters a Squad where a scenario says, and never gives two the same id', () => {
    const world = worldOf();
    const first = musterSquad(world.economy, world.map, { faction: 'rome', squadType: 'hastati', x: 3, y: 3 });
    const second = musterSquad(world.economy, world.map, {
      faction: 'carthage',
      squadType: 'libyan-spear',
      x: 4,
      y: 3,
    });

    expect(first.id).not.toBe(second.id);
    expect(world.economy.squads).toEqual([first, second]);
    expect(first.strength).toBe(120);
    expect(first.x).toBe(3);
    expect(first.refused).toBe(NO_REFUSAL);
  });

  it('refuses to stand a Squad on water, off the map, on another Faction’s type, or on a type nobody has', () => {
    const world = worldOf(paintedMap(['.~.']));
    const muster = (placement: Partial<Placement> & { readonly x: number; readonly y: number }): Squad =>
      musterSquad(world.economy, world.map, {
        faction: 'rome',
        squadType: 'hastati',
        ...placement,
      });

    expect(() => muster({ x: 1, y: 0 })).toThrow(RangeError);
    expect(() => muster({ x: MAP_WIDTH, y: 0 })).toThrow(RangeError);
    expect(() => muster({ x: 0, y: 0, squadType: 'libyan-spear' })).toThrow(RangeError);
    expect(() => muster({ x: 0, y: 0, squadType: 'war-elephant' })).toThrow(RangeError);
    expect(world.economy.squads).toEqual([]);
  });
});

describe('a Squad ordered to a tile it can reach', () => {
  it('arrives there and stands, having walked the route the order cost', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 5, 5);

    marchTo(world, squad, 15, 5, 40);

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 15, y: 5 });
    expect(squad.steps).toEqual([]);
    expect(squad.wait).toBe(0);
    expect(seen(world)).toMatchObject({ goal: null, refused: null });
  });

  it('arrives on the tick its route costs, and not before: ten tiles of plain ground, four ticks each', () => {
    // A tile is paid for before it is entered, so the walk to a tile ten away
    // costs four ticks a tile however far along it is; the tick the order is
    // applied on is one of them.
    const arrived = worldOf();
    const arrivedSquad = place(arrived, 'hastati', 5, 5);
    marchTo(arrived, arrivedSquad, 15, 5, 40);

    const short = worldOf();
    const shortSquad = place(short, 'hastati', 5, 5);
    marchTo(short, shortSquad, 15, 5, 39);

    expect(arrivedSquad.x).toBe(15);
    expect(shortSquad.x).toBe(14);
  });

  it('marches a horse at its own pace: the same plain ground costs half the ticks', () => {
    // Plain ground is four ticks a tile for a man on foot and two for the
    // Numidian horse, whose type's speed is 2 (C4). The tick the order is
    // applied on is one of them, so ten tiles is forty ticks and twenty.
    const foot = worldOf();
    const footSquad = place(foot, 'hastati', 5, 5);
    marchTo(foot, footSquad, 15, 5, 39);

    const horse = worldOf();
    const horseSquad = place(horse, 'numidian-horse', 5, 5);
    play({ world: horse, ticks: 19, carthage: script([0, move('carthage', [horseSquad.id], 15, 5)]) });

    const arrived = worldOf();
    const arrivedHorse = place(arrived, 'numidian-horse', 5, 5);
    play({ world: arrived, ticks: 20, carthage: script([0, move('carthage', [arrivedHorse.id], 15, 5)]) });

    expect(footSquad.x).toBe(14);
    expect(horseSquad.x).toBe(14);
    expect(arrivedHorse.x).toBe(15);
  });

  it('charges the terrain it crosses, the tile it is about to enter paid for before it enters', () => {
    // Two tiles across a picture, the last one farmland: each tile is paid for
    // as the Squad waits to enter it, so the crossing costs what the two tiles
    // cost — the destination included.
    const crossingIn = (row: string): number => {
      const world = worldOf(paintedMap([row], 20, 20));
      const squad = place(world, 'hastati', 20, 20);
      const cache = createRouteCache(world.map);
      applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 22, 20)], cache);

      for (let tick = 1; tick <= 40; tick += 1) {
        march(world.economy, world.map);
        if (squad.x === 22) return tick;
      }

      throw new Error('the Squad never arrived at all');
    };

    expect(crossingIn('...')).toBe(8);
    expect(crossingIn('.^,')).toBe(13);
    expect(crossingIn('.f,')).toBe(13);
    expect(crossingIn('.,,')).toBe(10);
    expect(crossingIn('.=,')).toBe(15);
    expect(crossingIn('.-,')).toBe(7);
  });

  it('stands on land the whole way, and steps one tile at a time', () => {
    const world = economyMatchRules.createWorld(3);
    const [rome, carthage] = world.map.strongholds;
    const squad = place(world, 'hastati', rome.x, rome.y);
    applyMovementCommands(
      world.economy,
      world.map,
      [move('rome', [squad.id], carthage.x, carthage.y)],
      createRouteCache(world.map),
    );

    let previous = tileUnder(squad);
    let steps = 0;

    for (let tick = 0; tick < 3_000 && squad.steps.length > 0; tick += 1) {
      march(world.economy, world.map);

      const here = tileUnder(squad);
      if (here === previous) continue;

      expect(stepsBetween(previous, here)).toBe(1);
      expect(isWalkable(terrainAt(world.map, squad.x, squad.y))).toBe(true);
      previous = here;
      steps += 1;
    }

    expect(steps).toBeGreaterThan(1);
    expect({ x: squad.x, y: squad.y }).toEqual(carthage);
  });

  it('sends the Squad where the newest Command names it, so a second order replaces the first', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 5, 5);

    play({
      world,
      ticks: 45,
      rome: script([0, move('rome', [squad.id], 25, 5)], [1, move('rome', [squad.id], 5, 15)]),
    });

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 5, y: 15 });
  });

  it('marches on an attack-move exactly as it does on a move: what it meets on the way is C3', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 5, 5);

    play({ world, ticks: 40, rome: script([0, attackMove('rome', [squad.id], 15, 5)]) });

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 15, y: 5 });
  });
});

describe('a Squad ordered to a tile no way reaches', () => {
  it('refuses the order, says why, and keeps doing what it was already doing', () => {
    const world = worldOf(paintedMap(['..........~.....', '..........~.....'], 20, 20));
    const squad = place(world, 'hastati', 20, 20);

    play({
      world,
      ticks: 30,
      rome: script([0, move('rome', [squad.id], 34, 20)], [4, move('rome', [squad.id], 30, 20)]),
    });

    // The second order named water. The Squad heard it, remembers why it could
    // not be taken, and is still on its way to where it was already going.
    const observed = seen(world);
    expect(observed.refused).toBe('water');
    expect(observed.goal).toEqual({ x: 34, y: 20 });
    expect(stepsBetween(tileUnder(squad), tileIndex(34, 20))).toBeLessThan(14);
    expect(squad.steps.length).toBeGreaterThan(0);
  });

  it('refuses a tile that is not on the map at all, and leaves the Squad standing', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 4, 4);

    play({ world, ticks: 10, rome: script([0, move('rome', [squad.id], MAP_WIDTH + 10, 4)]) });

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 4, y: 4 });
    expect(squad.steps).toEqual([]);
    expect(squad.refused).toBeGreaterThanOrEqual(0);
    expect(seen(world)).toMatchObject({ refused: 'off-map', goal: null });
  });

  it('refuses a tile the land does not reach, and says that instead', () => {
    const world = worldOf(paintedMap(repeated(MAP_HEIGHT, '....~....')));
    const squad = place(world, 'hastati', 1, 0);

    play({ world, ticks: 10, rome: script([0, move('rome', [squad.id], 6, 0)]) });

    expect(seen(world)).toMatchObject({ refused: 'unreachable', goal: null });
  });

  it('takes the next order it is given, and forgets the refusal', () => {
    const world = worldOf(paintedMap(['..........~.....'], 20, 20));
    const squad = place(world, 'hastati', 20, 20);

    play({
      world,
      ticks: 10,
      rome: script([0, move('rome', [squad.id], 34, 20)], [1, move('rome', [squad.id], 24, 20)]),
    });

    expect(seen(world)).toMatchObject({
      id: 1,
      x: 22,
      y: 20,
      facing: 'east',
      goal: { x: 24, y: 20 },
      refused: null,
    });
  });
});

describe('movement that can be replayed', () => {
  it('marches the same Squad the same way twice, and the whole world hashes the same', () => {
    const crossed = (): EconomyWorld => {
      const world = economyMatchRules.createWorld(11);
      const [rome, carthage] = world.map.strongholds;
      const squad = place(world, 'hastati', rome.x, rome.y);

      play({ world, ticks: 200, rome: script([0, move('rome', [squad.id], carthage.x, carthage.y)]) });

      return world;
    };

    expect(hashState(crossed())).toBe(hashState(crossed()));
  });

  it('gives the same order the same route, tile for tile, whatever a cache remembers', () => {
    const route = (): readonly number[] => {
      const world = worldOf();
      const squad = place(world, 'hastati', 3, 3);
      applyMovementCommands(
        world.economy,
        world.map,
        [move('rome', [squad.id], 30, 40)],
        createRouteCache(world.map),
      );

      return squadOf(world, 1).steps;
    };

    expect(route()).toEqual(route());
  });

  it('marches no differently when the same order is repeated on every tick of the way', () => {
    // An order that reset the Squad's step timer would make repeating it stop
    // the Squad dead, which is the bug this test exists to catch.
    const once = worldOf();
    const onceSquad = place(once, 'hastati', 3, 3);
    play({ world: once, ticks: 100, rome: script([0, move('rome', [onceSquad.id], 30, 40)]) });

    const repeated = worldOf();
    const repeatedSquad = place(repeated, 'hastati', 3, 3);
    play({
      world: repeated,
      ticks: 100,
      rome: { decide: () => [move('rome', [repeatedSquad.id], 30, 40)] },
    });

    expect(hashState(repeated)).toBe(hashState(once));
  });

  it('obeys a Command for its own Faction and not for the other: a Controller commands its own Squads', () => {
    const world = worldOf();
    place(world, 'hastati', 3, 3);
    const enemy = place(world, 'libyan-spear', 8, 3);
    const cache = createRouteCache(world.map);

    applyMovementCommands(world.economy, world.map, [move('rome', [enemy.id], 30, 40)], cache);

    expect(enemy.steps).toEqual([]);
    expect(enemy.refused).toBe(NO_REFUSAL);
    expect(cache.searches).toBe(0);
  });

  it('leaves the Commands that belong to other systems alone, and searches for nothing', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 3, 3);
    const cache = createRouteCache(world.map);
    const before = hashState(world);

    applyMovementCommands(
      world.economy,
      world.map,
      [
        attack('rome', [squad.id], 9),
        garrison('rome', [squad.id], 1),
        withdraw('rome', [squad.id]),
        build('rome', 1, 'castrum'),
        recruit('rome', 1, 'hastati', 24, 2),
        blockade('rome', [squad.id], 1),
        group('rome', 2, [squad.id]),
      ],
      cache,
    );

    expect(hashState(world)).toBe(before);
    expect(cache.searches).toBe(0);
  });
});

describe('a Squad that is re-aimed keeps the tile it has already paid for', () => {
  it('keeps it when its goal moves before it arrives', () => {
    // A Squad walks plain ground at four ticks a tile. Its goal jumps one tile
    // east every `period` ticks, so an order re-plans its route while the Squad
    // is still paying for the tile it is entering. Re-aiming must not re-charge
    // that tile: the only thing that changes the Squad's pace is the ground it
    // crosses, so it must stand where a Squad given one order and left alone
    // stands, tick for tick.
    const oneOrder: Site[] = [];
    {
      const { world, squad, routes } = plainSquad();
      applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 89, 5)], routes);

      for (let tick = 0; tick < 60; tick += 1) {
        march(world.economy, world.map);
        oneOrder.push({ x: squad.x, y: squad.y });
      }
    }

    for (const period of [1, 2, 3, 4]) {
      const { world, squad, routes } = plainSquad();
      const moving: Site[] = [];

      for (let tick = 0; tick < 60; tick += 1) {
        const goal = 30 + Math.floor(tick / period);
        applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], goal, 5)], routes);
        march(world.economy, world.map);
        moving.push({ x: squad.x, y: squad.y });
      }

      expect({ period, positions: moving }).toEqual({ period, positions: oneOrder });
    }
  });

  it('keeps it when an order re-plans onto a route that still enters it', () => {
    // Two ticks into a four-tick tile, a new goal whose way still enters that
    // same tile: the step lands on the tick it was always going to land on.
    const { world, squad, routes } = plainSquad();

    applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 30, 5)], routes);
    march(world.economy, world.map);
    march(world.economy, world.map);
    applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 40, 5)], routes);
    march(world.economy, world.map);
    march(world.economy, world.map);

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 6, y: 5 });
  });

  it('pays for the new tile from the beginning when an order changes the tile it is entering', () => {
    // The tile it was paying for is no longer the tile it is about to enter, so
    // the ticks spent on the old one do not carry over: the new tile is paid for
    // in full, and the step comes when its own cost is met.
    const { world, squad, routes } = plainSquad();

    applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 30, 5)], routes);
    march(world.economy, world.map);
    march(world.economy, world.map);
    applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 5, 3)], routes);
    march(world.economy, world.map);
    march(world.economy, world.map);

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 5, y: 5 });

    march(world.economy, world.map);
    march(world.economy, world.map);

    expect({ x: squad.x, y: squad.y }).toEqual({ x: 5, y: 4 });
  });
});

describe('the routes a theatre does not work out twice', () => {
  it('searches once for an order repeated every tick, and answers the rest from memory', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 3, 3);
    const cache = createRouteCache(world.map);

    for (let order = 0; order < 20; order += 1) {
      applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], 30, 40)], cache);
      march(world.economy, world.map);
    }

    // The first order is a search; every order after it names the tile the
    // Squad is already walking to, so not even the cache is asked.
    expect(cache.searches).toBe(1);
    expect(cache.hits).toBe(0);
  });

  it('hands a second Squad the route the first was given, when they set out from the same ground', () => {
    const world = worldOf();
    const first = place(world, 'hastati', 3, 3);
    const second = place(world, 'hastati', 3, 3);
    const cache = createRouteCache(world.map);

    // Separate single-Squad Commands deliberately share a destination. A group
    // Command now reserves distinct arrivals (#68).
    applyMovementCommands(world.economy, world.map,
      [move('rome', [first.id], 30, 40), move('rome', [second.id], 30, 40)], cache);

    expect(squadOf(world, second.id).steps).toEqual(squadOf(world, first.id).steps);
    expect(cache.searches).toBe(1);
    expect(cache.hits).toBe(1);
  });

  it('remembers routes per theatre, so one map is never answered with another’s way', () => {
    const plain = plainMap();
    const walled = paintedMap(repeated(MAP_HEIGHT, '....~....'));

    expect(routeCacheFor(plain).route({ x: 1, y: 1 }, { x: 6, y: 1 })).toMatchObject({ kind: 'route' });
    expect(routeCacheFor(walled).route({ x: 1, y: 1 }, { x: 6, y: 1 })).toEqual({
      kind: 'refused',
      reason: 'unreachable',
    });
  });

  it('searches once per Squad for a dozen of them, and once each again when they are sent elsewhere', () => {
    const world = economyMatchRules.createWorld(7);
    const [rome, carthage] = world.map.strongholds;
    const cache = createRouteCache(world.map);
    const squads = walkableTiles(world, 12).map((tile) =>
      place(world, 'hastati', tileX(tile), tileY(tile)),
    );

    const sendAllTo = (x: number, y: number): void => {
      for (const squad of squads) {
        applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], x, y)], cache);
      }
    };

    sendAllTo(carthage.x, carthage.y);
    expect(cache.searches).toBe(12);

    sendAllTo(carthage.x, carthage.y);
    expect(cache.searches).toBe(12);

    sendAllTo(rome.x, rome.y);
    expect(cache.searches).toBe(24);
  });

  it('marches a dozen Squads across the theatre, all of them arriving and none of them slowly', () => {
    const world = economyMatchRules.createWorld(7);
    const [, carthage] = world.map.strongholds;
    const cache = createRouteCache(world.map);
    const squads = walkableTiles(world, 12).map((tile) =>
      place(world, 'hastati', tileX(tile), tileY(tile)),
    );

    const started = performance.now();
    for (const squad of squads) {
      applyMovementCommands(world.economy, world.map, [move('rome', [squad.id], carthage.x, carthage.y)], cache);
    }
    for (let tick = 0; tick < 2_000 && squads.some((squad) => squad.steps.length > 0); tick += 1) {
      march(world.economy, world.map);
    }
    const elapsed = performance.now() - started;

    for (const squad of squads) {
      expect({ x: squad.x, y: squad.y }).toEqual({ x: carthage.x, y: carthage.y });
    }

    // Generous on purpose: this is the ticket's "a dozen Squads moving at once
    // stay responsive" as a fence rather than a benchmark. A dozen Squads
    // walking a whole theatre take a few milliseconds here, and anything that
    // made them take a second would be a change of design rather than a slow
    // machine.
    expect(elapsed).toBeLessThan(1_000);
  });
});

describe('a Squad keeps its formation, and turns', () => {
  it('takes the shape it is told to hold, and keeps every man it had', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 15, 15);
    const before = menOf(squad);

    play({ world, ticks: 2, rome: script([0, formation('rome', [squad.id], 'column')]) });

    expect(frontage(squad)).toBe(3);
    expect(depth(squad)).toBe(40);
    expect(squad.strength).toBe(120);
    expect({ x: squad.x, y: squad.y }).toEqual({ x: 15, y: 15 });
    expect(menOf(squad)).toHaveLength(before.length);
  });

  it('turns to face the way it is about to go on the tick it is ordered, and rearranges nobody to do it', () => {
    const sentTo = (x: number, y: number): string => {
      const world = worldOf();
      const squad = place(world, 'hastati', 15, 15);
      squad.formation = formationCode('column');
      const before = menOf(squad);
      applyMovementCommands(
        world.economy,
        world.map,
        [move('rome', [squad.id], x, y)],
        createRouteCache(world.map),
      );

      // Ordered, turned, and not yet walked: the turn is the Squad's own, and
      // the block it turns is the same block, man for man.
      expect({ x: squad.x, y: squad.y }).toEqual({ x: 15, y: 15 });
      expect(menOf(squad)).toEqual(before);
      expect(frontage(squad)).toBe(3);

      return seen(world).facing;
    };

    expect(sentTo(15, 12)).toBe('north');
    expect(sentTo(18, 15)).toBe('east');
    expect(sentTo(15, 18)).toBe('south');
    expect(sentTo(12, 15)).toBe('west');
  });

  it('faces the way it is about to step at every tick of a long march, through every bend', () => {
    const world = economyMatchRules.createWorld(5);
    const [rome, carthage] = world.map.strongholds;
    const squad = place(world, 'hastati', rome.x, rome.y);
    applyMovementCommands(
      world.economy,
      world.map,
      [move('rome', [squad.id], carthage.x, carthage.y)],
      createRouteCache(world.map),
    );

    let bends = 0;
    let faced = squad.facing;

    for (let tick = 0; tick < 3_000 && squad.steps.length > 0; tick += 1) {
      const position = tileUnder(squad);
      const direction = wayTo(squad);
      march(world.economy, world.map);
      if (position !== tileUnder(squad)) expect(squad.facing).toBe(direction);

      if (squad.facing !== faced) {
        faced = squad.facing;
        bends += 1;
      }
    }

    expect(bends).toBeGreaterThan(0);
  });

  it('stands where it is when it is told to hold, and stays there', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 5, 5);

    play({
      world,
      ticks: 12,
      rome: script([0, move('rome', [squad.id], 40, 5)], [5, hold('rome', [squad.id])]),
    });

    const stopped = { x: squad.x, y: squad.y };
    expect(stopped.x).toBeGreaterThan(5);
    expect(stopped.x).toBeLessThan(40);
    expect(squad.steps).toEqual([]);
    expect(squad.wait).toBe(0);
    expect(seen(world).goal).toBeNull();

    play({ world, ticks: 10 });
    expect({ x: squad.x, y: squad.y }).toEqual(stopped);
  });
});

describe('what a Faction is shown of its Squads', () => {
  it('shows its own Squads where they stand, with the shape they hold and where they are going', () => {
    const world = worldOf();
    const ours = place(world, 'hastati', 5, 5);
    place(world, 'libyan-spear', 8, 9);
    applyMovementCommands(
      world.economy,
      world.map,
      [move('rome', [ours.id], 20, 5)],
      createRouteCache(world.map),
    );

    expect(observeEconomy(world, 'rome').squads).toHaveLength(1);
    expect(seen(world)).toEqual({
      id: 1,
      type: 'hastati',
      x: 5,
      y: 5,
      men: 120,
      capacity: 120,
      figures: 120,
      formation: 'line',
      facing: 'east',
      goal: { x: 20, y: 5 },
      refused: null,
      morale: 10,
      fatigue: 0,
      ammunition: 4,
      routing: false,
      engaged: false,
      payroll: 15,
      unpaid: 0,
      bearing: 120,
      garrison: null,
      home: 0,
      inTerritory: true,
      inCamp: false,
      inQuarters: false,
    });

    expect(seen(world, 'carthage')).toMatchObject({ id: 2, type: 'libyan-spear', goal: null });
  });

  it('reports the figures a Squad is drawn as right now: men thin out, a beast stays one', () => {
    const world = worldOf();
    const hastati = place(world, 'hastati', 5, 5);
    const elephant = place(world, 'elephant', 8, 5);

    // A Squad of men is drawn one figure per man, so losing men thins the block
    // on screen (the criterion C1 and C3 are read through).
    hastati.strength = 100;
    expect(seen(world)).toMatchObject({ men: 100, figures: 100 });

    // An elephant is a Squad of a single figure whatever its strength has
    // fallen to: its men are staying power, and one beast is still one beast.
    elephant.strength = 5;
    expect(observeEconomy(world, 'carthage').squads[0]).toMatchObject({ men: 5, figures: 1 });
  });

  it('keeps what a Squad is to the economy while it marches: one entity, two halves', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 5, 5);
    const before = { type: squad.type, home: squad.home, morale: squad.morale, owner: squad.owner };

    marchTo(world, squad, 15, 5, 40);

    expect({ type: squad.type, home: squad.home, morale: squad.morale, owner: squad.owner }).toEqual(before);
    expect(seen(world)).toMatchObject({ type: 'hastati', payroll: 15, morale: 10, home: 0, x: 15, y: 5 });
  });

  it('is plain data: what a Faction is shown can be copied and handed to a Controller', () => {
    const world = worldOf();
    place(world, 'hastati', 5, 5);

    expect(structuredClone(observeEconomy(world, 'rome'))).toEqual(observeEconomy(world, 'rome'));
  });
});

describe('the Squad the economy and the map share', () => {
  it('is one entity: the block the movement rules walk is the Squad the economy keeps', () => {
    const world = worldOf();
    const squad = place(world, 'hastati', 2, 2);
    const held = squadOf(world, squad.id);

    expect(held).toBe(squad);
    expect(held).toBe(world.economy.squads[0]);
    expect(factionOf(held.owner)).toBe('rome');
    expect(held.type).toBe(squadTypeId('hastati'));
    expect({ x: held.x, y: held.y, strength: held.strength }).toEqual({ x: 2, y: 2, strength: 120 });
  });
});
