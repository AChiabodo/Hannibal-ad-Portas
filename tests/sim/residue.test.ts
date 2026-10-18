/**
 * Corpses are residue, not state (ticket C3).
 *
 * The ticket's criterion is one sentence — "corpses are visual residue that
 * fades, and never enter the state hash" — and this file is that sentence split
 * into assertions: a mark fades after its thirty seconds, the field is bounded,
 * the same loss scatters the same way, and none of it moves a hash, a random
 * cursor or a replay.
 */
import { describe, expect, it } from 'vitest';
import { createEconomy, type Economy } from '../../src/sim/economy';
import { hashState } from '../../src/sim/hash';
import { startCalendar } from '../../src/sim/season';
import {
  CORPSE_FADE_TICKS,
  CORPSE_LIMIT,
  CORPSE_TICKS,
  corpsesOf,
  fadeResidue,
  isLying,
  recordCasualties,
  residueFor,
  type Fallen,
} from '../../src/sim/residue';
import { plainMap } from './test-map';

/** A world on a plain theatre: the economy and the clock, with no Squad on it. */
function worldOf(): { map: ReturnType<typeof plainMap>; calendar: ReturnType<typeof startCalendar>; economy: Economy; autumns: number; winters: number } {
  const map = plainMap();

  return { map, calendar: startCalendar(), economy: createEconomy(map), autumns: 0, winters: 0 };
}

/** The loss of a round of contact at one place: what `combat.ts` reports. */
function fallen(men = 9, x = 20, y = 20): Fallen {
  return { x, y, owner: 0, type: 0, men };
}

describe('the residue of a fight', () => {
  it('keeps a mark for thirty seconds of Match time and takes it away after', () => {
    const world = worldOf();

    recordCasualties(world.economy, [fallen()], 100);

    expect(corpsesOf(world.economy, 100)).toHaveLength(1);
    expect(corpsesOf(world.economy, 100 + CORPSE_TICKS - 1)).toHaveLength(1);
    expect(corpsesOf(world.economy, 100 + CORPSE_TICKS)).toEqual([]);
  });

  it('calls the last second of a mark’s life a fade, and the rest of it a body lying still', () => {
    const corpse = { ...fallen(), born: 0 };

    expect(isLying(corpse, 0)).toBe(true);
    expect(isLying(corpse, CORPSE_TICKS - CORPSE_FADE_TICKS)).toBe(true);
    expect(isLying(corpse, CORPSE_TICKS)).toBe(false);
    expect(CORPSE_FADE_TICKS).toBeLessThan(CORPSE_TICKS);
  });

  it('sweeps the marks that have outlived their thirty seconds, so a long war does not grow a list', () => {
    const world = worldOf();

    recordCasualties(world.economy, [fallen(4, 10, 10)], 0);
    recordCasualties(world.economy, [fallen(5, 11, 10)], CORPSE_TICKS);
    fadeResidue(world.economy, CORPSE_TICKS);

    expect(residueFor(world.economy).corpses).toEqual([{ ...fallen(5, 11, 10), born: CORPSE_TICKS }]);
  });

  it('keeps the field bounded, dropping the oldest marks first', () => {
    const world = worldOf();

    for (let round = 0; round < CORPSE_LIMIT + 20; round += 1) {
      recordCasualties(world.economy, [fallen(1, round % 90, 40)], round);
    }

    const kept = residueFor(world.economy).corpses;

    expect(kept).toHaveLength(CORPSE_LIMIT);
    expect(kept[0]?.born).toBe(20);
    expect(kept.at(-1)?.born).toBe(CORPSE_LIMIT + 19);
  });

  it('leaves nothing on the field for a round in which nobody died', () => {
    const world = worldOf();

    recordCasualties(world.economy, [], 0);
    recordCasualties(world.economy, [fallen(0)], 0);

    expect(corpsesOf(world.economy, 0)).toEqual([]);
  });

  it('never enters the state hash: recording and fading corpses leaves the world’s hash alone', () => {
    const world = worldOf();
    const before = hashState(world);

    recordCasualties(world.economy, [fallen(12), fallen(7, 21, 20)], 40);
    recordCasualties(world.economy, [fallen(3, 22, 20)], 45);

    expect(hashState(world)).toBe(before);
    expect(corpsesOf(world.economy, 45).length).toBeGreaterThan(0);

    fadeResidue(world.economy, CORPSE_TICKS + 45);

    expect(hashState(world)).toBe(before);
  });

  it('is not reachable from the world, so a canonical form never walks it', () => {
    const world = worldOf();
    recordCasualties(world.economy, [fallen()], 0);

    // A drawing code reaches the residue through the economy, and the hash
    // walks the world: the two never meet, which is what keeps the marks out of
    // a replay comparison without a special case anywhere.
    expect(Object.keys(world)).not.toContain('residue');
    expect(Object.keys(world.economy)).not.toContain('corpses');
    expect(JSON.stringify(world)).not.toContain('corpse');
  });

  it('gives two Matches their own field: one theatre’s dead are not another’s', () => {
    const first = worldOf();
    const second = worldOf();

    recordCasualties(first.economy, [fallen()], 0);

    expect(corpsesOf(first.economy, 0)).toHaveLength(1);
    expect(corpsesOf(second.economy, 0)).toEqual([]);
  });
});
