import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, drawsRules, isRulesName, RULES, type DrawsWorld } from '../../src/cli/rules';
import type { Command } from '../../src/sim/command';
import { createMatch, type Match } from '../../src/sim/match';
import type { RngState } from '../../src/sim/rng';
import { HEADLESS_TICKS } from '../../src/sim/season';

/** The cursor of a Match, copied, so a later draw cannot rewrite what was read. */
function cursor(match: Match<DrawsWorld, Command>): RngState {
  return { ...match.state.rng };
}

describe('a Match whose rules draw, which is what CI needs a golden hash of', () => {
  it('leaves the random cursor somewhere else after one tick: the draw loop runs', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const before = cursor(match);

    match.step();

    expect(cursor(match)).not.toEqual(before);
  });

  it('draws at least once on every tick: no two cursors in the Match are the same', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const cursors = [JSON.stringify(cursor(match))];

    for (let tick = 0; tick < 5; tick += 1) {
      match.step();
      cursors.push(JSON.stringify(cursor(match)));
    }

    // The cursor before the first tick and after each of five: six spellings,
    // all different, so the generator advanced on every tick rather than once.
    expect(new Set(cursors).size).toBe(cursors.length);
  });

  it('takes both kinds of draw: a whole word, and an unbiased digit in [0, 9]', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });

    match.step();

    expect(match.state.world.word).toBeGreaterThanOrEqual(0);
    expect(match.state.world.word).toBeLessThan(0x1_0000_0000);
    expect(match.state.world.digit).toBeGreaterThanOrEqual(0);
    expect(match.state.world.digit).toBeLessThanOrEqual(9);
    expect(match.state.world.total).toBe(match.state.world.digit);
  });

  it('draws both ways round: the words differ between ticks, and the digits are not all zero', () => {
    const match = createMatch({ seed: 1, rules: drawsRules });
    const words = new Set<number>();
    let digits = 0;

    // Thirty-two ticks, so the strong claim here is the second one: a digit
    // that came from the generator sums to more than zero with probability
    // 1 - (1/10)^32, while a digit that is never drawn at all sums to exactly
    // zero every time. The test fails if either draw path stops running.
    for (let tick = 0; tick < 32; tick += 1) {
      match.step();
      words.add(match.state.world.word);
      digits += match.state.world.digit;
    }

    expect(words.size).toBeGreaterThan(1);
    expect(digits).toBeGreaterThan(0);
  });
});

describe('the Matches the command line can play, by name', () => {
  it('plays the drawing Match again from the same seed, hash for hash', () => {
    const first = RULES.draws.play(1, 600);
    const second = RULES.draws.play(1, 600);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ends the drawing Match by the tick bound, which is the outcome the empty one reports too', () => {
    expect(RULES.draws.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
  });

  it('gives the drawing Match a different hash from the empty Match on the same seed and bound', () => {
    expect(RULES.draws.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });
});

describe('a Match on the strategic clock, which is the one the command line plays by default', () => {
  it('plays the seasons Match by name, and ends it by the tick bound like any other', () => {
    expect(isRulesName('seasons')).toBe(true);
    expect(RULES.seasons.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
    expect(RULES.seasons.play(1, 600).hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives the seasons Match a different hash from the empty one, so the clock really reaches the state', () => {
    expect(RULES.seasons.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });

  it('runs a headless Match bound to three game years, and always terminates', () => {
    const run = RULES.seasons.play(7, HEADLESS_TICKS);

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
  });
});

describe('the Match on the theatre and the economy, which is the one the command line plays by default', () => {
  it('plays the economy Match by name, and ends it by the tick bound like any other', () => {
    expect(isRulesName('economy')).toBe(true);
    expect(DEFAULT_RULES).toBe('economy');
    expect(RULES.economy.play(1, 600).result).toEqual({ kind: 'clock', tick: 600 });
    expect(RULES.economy.play(1, 600).hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('gives the economy Match a hash of its own, so the settlements and the map really reach the state', () => {
    const economy = RULES.economy.play(1, 600).hash;

    expect(economy).not.toBe(RULES.seasons.play(1, 600).hash);
    expect(economy).not.toBe(RULES.empty.play(1, 600).hash);
    expect(economy).not.toBe(RULES.draws.play(1, 600).hash);
  });

  it('runs a headless economy Match bound to three game years, and always terminates', () => {
    const run = RULES.economy.play(1, HEADLESS_TICKS);

    expect(run.result).toEqual({ kind: 'clock', tick: HEADLESS_TICKS });
    expect(run.log).toEqual([]);
  });

  it('plays the same three game years again from the same seed, hash for hash', () => {
    expect(RULES.economy.play(7, HEADLESS_TICKS).hash).toBe(RULES.economy.play(7, HEADLESS_TICKS).hash);
  });
});

describe('a Match on the theatre and the fog', () => {
  it('plays the fog Match again from the same seed, hash for hash, and ends by the clock', () => {
    const first = RULES.fog.play(1, 600);
    const second = RULES.fog.play(1, 600);

    expect(first.hash).toBe(second.hash);
    expect(first.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(first.result).toEqual({ kind: 'clock', tick: 600 });
    expect(first.log).toEqual([]);
  });

  it('gives the fog Match a different hash from the empty Match: the map and what each Faction knows are in state', () => {
    expect(RULES.fog.play(1, 600).hash).not.toBe(RULES.empty.play(1, 600).hash);
  });
});

describe('the names of the Matches the command line ships', () => {
  it('names the Matches it ships, and nothing else', () => {
    expect(isRulesName('economy')).toBe(true);
    expect(isRulesName('seasons')).toBe(true);
    expect(isRulesName('empty')).toBe(true);
    expect(isRulesName('draws')).toBe(true);
    expect(isRulesName('fog')).toBe(true);
    expect(isRulesName(DEFAULT_RULES)).toBe(true);

    for (const value of ['', 'Empty', 'empty ', 'draws\n', 'anything else']) {
      expect(isRulesName(value)).toBe(false);
    }
  });
});
