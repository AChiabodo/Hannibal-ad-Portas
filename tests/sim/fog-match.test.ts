/**
 * The Match the fog is part of: B1's theatre, both Factions' memory of it, and
 * the Observation built from that memory (ticket B4).
 *
 * These are the acceptance criteria of the ticket at the seam the seam is: a
 * visibility grid per Faction, recomputed on every tick from what the Faction
 * has standing on the map; an Observation that carries nothing about a tile its
 * Faction has never observed; and one Faction's knowledge that never enters the
 * other's Observation or its part of the state hash.
 *
 * The theatre is generated here in Node, and the *other* side of every
 * comparison is B1's own generator and `fog.ts`'s own primitives, so a Match that
 * projected too much, or too little, would have to disagree with both.
 */
import { describe, expect, it } from 'vitest';
import { idleController } from '../../src/sim/controller';
import { runMatch } from '../../src/sim/driver';
import { FACTIONS, type Faction } from '../../src/sim/faction';
import {
  KNOWLEDGE,
  SETTLEMENT_VISION,
  UNSEEN,
  believedTerrain,
  createFog,
  eyeOf,
  knows,
  observeContacts,
  refreshVision,
  type Eye,
  type FogView,
} from '../../src/sim/fog';
import {
  createFogMatchWorld,
  fogMatchOutcome,
  fogMatchRules,
  observeFogMatch,
  type FogMatchWorld,
} from '../../src/sim/fog-match';
import { MAP_HEIGHT, MAP_WIDTH, TERRAIN, terrainAt, tileIndex, type MapGrid } from '../../src/sim/map';
import { makeRng } from '../../src/sim/rng';
import { serializeState } from '../../src/sim/state';

/** The seed every Match here is played on. */
const SEED = 7;

/** The bound the driver runs these Matches to. */
const TICKS = 4;

/** The two Players: Controllers that watch, because this Match obeys no Command yet. */
const IDLE_PLAYERS = [
  { faction: 'rome', controller: idleController<FogView>() },
  { faction: 'carthage', controller: idleController<FogView>() },
] as const;

/** The whole Match as the driver runs it, on a world of the caller's choosing. */
function play(world?: FogMatchWorld) {
  return runMatch<FogMatchWorld, FogView>({
    seed: SEED,
    rules: world === undefined ? fogMatchRules : { createWorld: () => world, step: fogMatchRules.step },
    observe: observeFogMatch,
    outcome: fogMatchOutcome,
    players: IDLE_PLAYERS,
    ticks: TICKS,
  });
}

/** The tiles one eye covers, by the definition rather than by the fog. */
function disc(eye: Eye): number[] {
  const tiles: number[] = [];

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const dx = x - eye.x;
      const dy = y - eye.y;
      if (dx * dx + dy * dy <= eye.radius * eye.radius) tiles.push(tileIndex(x, y));
    }
  }

  return tiles;
}

/** How many tiles a fog remembers any ground for. */
function remembered(fog: FogView): number {
  return Array.from(fog.terrain).filter((ground) => ground !== UNSEEN).length;
}

describe('the theatre a Match opens on', () => {
  it('gives each Faction its own fog, and what its own Stronghold can see at tick zero', () => {
    const world = createFogMatchWorld(SEED);
    const map = world.map;
    const [rome, carthage] = map.strongholds;

    // Two Factions, two grids: no shared array could tell one Faction's story twice.
    expect(world.fog.rome.terrain).not.toBe(world.fog.carthage.terrain);
    expect(world.fog.rome.visible).not.toBe(world.fog.carthage.visible);

    // Rome sees the disc around its Stronghold, and remembers the ground there.
    for (const tile of disc(eyeOf(rome, SETTLEMENT_VISION))) {
      const x = tile % MAP_WIDTH;
      const y = Math.floor(tile / MAP_WIDTH);
      expect(knows(world.fog.rome, x, y)).toBe(KNOWLEDGE.visible);
      expect(believedTerrain(world.fog.rome, x, y)).toBe(terrainAt(map, x, y));
    }

    // The enemy Stronghold is a stroke of the map Rome has never seen.
    expect(knows(world.fog.rome, carthage.x, carthage.y)).toBe(KNOWLEDGE.unexplored);
    expect(believedTerrain(world.fog.rome, carthage.x, carthage.y)).toBe(null);

    // And Carthage, by the same rule, knows its own ground only.
    expect(knows(world.fog.carthage, carthage.x, carthage.y)).toBe(KNOWLEDGE.visible);
    expect(knows(world.fog.carthage, rome.x, rome.y)).toBe(KNOWLEDGE.unexplored);
  });

  it('counts the tiles it sees the way the definition of a disc counts them', () => {
    const world = createFogMatchWorld(SEED);
    const [rome] = world.map.strongholds;
    const seen = disc(eyeOf(rome, SETTLEMENT_VISION)).length;

    expect(seen).toBeGreaterThan(100);
    expect(remembered(world.fog.rome)).toBe(seen);
  });

  it('recomputes what each Faction sees on every tick, from the settlements it has', () => {
    const world = createFogMatchWorld(SEED);
    const map = world.map;
    const [rome] = map.strongholds;

    // Break the fog on purpose: wipe what is in view, and misremember the ground
    // under the Stronghold. A tick that did not recompute would leave both lies
    // in the state — and the hash would carry them into a replay.
    world.fog.rome.visible.fill(0);
    world.fog.rome.terrain[tileIndex(rome.x, rome.y)] = TERRAIN.forest;

    // The fog the tick should produce, built independently of the Match.
    const expected = createFog();
    refreshVision(expected, map, [eyeOf(rome, SETTLEMENT_VISION)]);

    fogMatchRules.step(world, makeRng(SEED), 0, []);

    expect(Array.from(world.fog.rome.terrain)).toEqual(Array.from(expected.terrain));
    expect(Array.from(world.fog.rome.visible)).toEqual(Array.from(expected.visible));
    expect(world.fog.rome.contacts).toEqual([]);
    expect(world.fog.carthage.contacts).toEqual([]);
  });
});

describe('an Observation of the fog', () => {
  it('carries no information about a tile its Faction has never observed', () => {
    const first = createFogMatchWorld(SEED);
    const second = createFogMatchWorld(SEED);
    const away = farthestTile(first.map);

    // A tile Rome will never look at, holding different ground in the two
    // worlds. The premise is asserted, so this test fails loudly if a later
    // change to vision ever made the tile visible.
    expect(knows(observeFogMatch(first, 'rome'), away.x, away.y)).toBe(KNOWLEDGE.unexplored);
    second.map.terrain[tileIndex(away.x, away.y)] = otherTerrain(terrainAt(first.map, away.x, away.y));

    // The two worlds really do differ — the test cannot pass on a world nobody changed.
    expect(terrainAt(second.map, away.x, away.y)).not.toBe(terrainAt(first.map, away.x, away.y));

    expect(observeFogMatch(second, 'rome')).toEqual(observeFogMatch(first, 'rome'));
  });

  it("never lets one Faction's knowledge into the other's Observation", () => {
    const world = createFogMatchWorld(SEED);
    const frozen = structuredClone(observeFogMatch(world, 'rome'));

    // Carthage learns a great deal: a watch in the middle of the theatre, and an
    // enemy remembered there.
    refreshVision(world.fog.carthage, world.map, [eyeOf({ x: 48, y: 48 }, 10)]);
    observeContacts(world.fog.carthage, [{ id: 1, kind: 1, x: 48, y: 48 }], 3);

    expect(observeFogMatch(world, 'rome')).toEqual(frozen);
    expect(observeFogMatch(world, 'rome').contacts).toEqual([]);
    expect(observeFogMatch(world, 'carthage')).not.toEqual(frozen);
  });

  it("never lets one Faction's knowledge into the other Faction's part of the state hash", () => {
    const world = createFogMatchWorld(SEED);
    const carthage = serializeState(world.fog.carthage);
    const before = serializeState(world);

    // Rome learns one more thing, and only Rome's part of the state changes.
    world.fog.rome.terrain[tileIndex(48, 48)] = TERRAIN.hill;
    world.fog.rome.visible[tileIndex(48, 48)] = 1;

    expect(serializeState(world.fog.carthage)).toBe(carthage);
    expect(serializeState(world)).not.toBe(before);
    expect(serializeState(world)).toContain(`"carthage":${carthage}`);
  });
});

describe('a Match the fog is part of', () => {
  it('runs, replays to the same hash, and is decided by the clock because nothing can be lost on it yet', () => {
    const once = play();
    const again = play();

    expect(again.result).toEqual(once.result);
    expect(again.hash).toBe(once.hash);
    expect(once.result).toEqual({ kind: 'clock', tick: TICKS });
    expect(once.log).toEqual([]);
  });

  it("hands each Controller its own Faction's fog, and never the other Faction's grid", () => {
    const world = createFogMatchWorld(SEED);
    const seen: { readonly faction: Faction; readonly view: FogView }[] = [];

    runMatch<FogMatchWorld, FogView>({
      seed: SEED,
      rules: { createWorld: () => world, step: fogMatchRules.step },
      observe: (from, faction) => {
        const view = observeFogMatch(from, faction);
        seen.push({ faction, view });

        return view;
      },
      outcome: fogMatchOutcome,
      players: IDLE_PLAYERS,
      ticks: 2,
    });

    // Four Observations — two Factions, two ticks — each stamped with the Faction
    // it was filtered for, and each the grid of that Faction alone.
    expect(seen.map((one) => one.faction)).toEqual([...FACTIONS, ...FACTIONS]);
    expect(seen[0]?.view).not.toBe(seen[1]?.view);
    expect(seen[0]?.view.terrain).not.toBe(seen[1]?.view.terrain);
  });
});

/** The tile of the theatre farthest from Rome's Stronghold: the last place Rome will ever look. */
function farthestTile(map: MapGrid): { readonly x: number; readonly y: number } {
  const [rome] = map.strongholds;
  let best = { x: 0, y: 0 };
  let bestDistance = -1;

  for (let y = 0; y < MAP_HEIGHT; y += 1) {
    for (let x = 0; x < MAP_WIDTH; x += 1) {
      const dx = x - rome.x;
      const dy = y - rome.y;
      const distance = dx * dx + dy * dy;

      if (distance > bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }

  return best;
}

/** A terrain that is not the one given, and is a terrain the map knows. */
function otherTerrain(ground: number): number {
  return ground === TERRAIN.plain ? TERRAIN.hill : TERRAIN.plain;
}
