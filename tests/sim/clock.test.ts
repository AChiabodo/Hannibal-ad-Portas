import { describe, expect, it } from 'vitest';
import { TICK_HZ, TICK_MS } from '../../src/sim/clock';

describe('the Match clock', () => {
  it('runs at 10 Hz, which is the decision the plan fixes', () => {
    // PLAN §3: a fixed 10 Hz tick with an accumulator. Ten hertz is what makes a
    // headless Match about ten times faster than real time, so a balance
    // tournament is a coffee break rather than an overnight job. The rate is a
    // decision, so the constant and this line change together and on purpose;
    // everything else about time derives from the constant.
    expect(TICK_HZ).toBe(10);
  });

  it('derives every other time from the one constant', () => {
    expect(TICK_MS * TICK_HZ).toBe(1000);
    expect(TICK_MS).toBe(1000 / TICK_HZ);
  });
});
