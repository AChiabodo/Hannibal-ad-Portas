/**
 * The map contract over a thousand seeds (ticket B1).
 *
 * This is the test the ticket asks for by name: "all invariants hold across a
 * thousand seeds", so that a generator change which breaks the world on one seed
 * in a thousand fails here rather than in a Match that happened to be created
 * with it. The invariants themselves are in `map-invariants.ts`, and the same
 * set is walked one acceptance criterion at a time, on a smaller sample, in
 * `map.test.ts`.
 *
 * Two things are asserted and they are not the same thing:
 *
 * - **the contract holds** on each of the thousand maps, and
 * - **the map is a function of the seed and of nothing else**: the same seed
 *   generates the same map, hash for hash, and a thousand different seeds are a
 *   thousand different maps rather than a handful of shapes repeated.
 */
import { describe, expect, it } from 'vitest';
import { hashState } from '../../src/sim/hash';
import { generateMap } from '../../src/sim/map';
import { findRoute } from '../../src/sim/route';
import { mapProblems } from './map-invariants';

/** How many seeds the contract is asserted over: a thousand, as the ticket says. */
const SEEDS = 1000;

/**
 * How long the two walks are given, in milliseconds.
 *
 * A thousand maps is a thousand full generations, which is seconds rather than
 * milliseconds of work even at a fraction of a millisecond each — and on a CI
 * machine slower than the one it was written on, the default five seconds is a
 * coin toss rather than a bound.
 */
const TIMEOUT = 60_000;

describe('the map contract, over a thousand seeds', () => {
  it('gives both Strongholds a nearby neutral settlement with a short walkable route', () => {
    const broken: string[] = [];
    for (let seed = 0; seed < SEEDS; seed += 1) {
      const map = generateMap(seed);
      for (const home of map.strongholds) {
        const nearby = map.settlements.filter((site) =>
          Math.abs(site.x - home.x) + Math.abs(site.y - home.y) <= 48);
        const lengths = nearby.flatMap((site) => {
          const route = findRoute(map, home, site);
          return route.kind === 'route' ? [route.steps.length] : [];
        });
        if (Math.min(...lengths) > 80) broken.push(`seed ${String(seed)}, Stronghold ${String(home.x)},${String(home.y)}`);
      }
    }
    expect(broken).toEqual([]);
  }, TIMEOUT);

  it('holds on every one of them', () => {
    const broken: string[] = [];

    for (let seed = 0; seed < SEEDS; seed += 1) {
      for (const problem of mapProblems(generateMap(seed))) {
        broken.push(`seed ${String(seed)}: ${problem}`);
      }
    }

    expect(broken).toEqual([]);
  }, TIMEOUT);

  it('makes the seed the only thing the map is a function of', () => {
    const broken: string[] = [];
    const hashes = new Set<string>();

    // A quarter of the thousand, not all of them: the invariants above are what
    // the ticket asks a thousand seeds of, and a map that depended on anything
    // but its seed — a leftover cursor, a shared array, a clock — would differ
    // on the very first pair. Hashing is what makes this sample expensive: the
    // canonical form of a whole grid, walked cell by cell (ADR-0006).
    const sample = SEEDS / 4;

    for (let seed = 0; seed < sample; seed += 1) {
      const once = hashState(generateMap(seed));
      if (once !== hashState(generateMap(seed))) broken.push(`seed ${String(seed)} made two different maps`);
      hashes.add(once);
    }

    expect(broken).toEqual([]);
    expect(hashes.size).toBe(sample);
  }, TIMEOUT);
});
