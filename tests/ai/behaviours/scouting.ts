import type { Behaviour } from '../../../src/ai/registry.ts';
import type { Command } from '../../../src/sim/command.ts';
import type { SiegeVisible } from '../../../src/sim/siege.ts';

/** A test adapter, not D4's scouting policy. */
export const scouting: Behaviour<SiegeVisible, Command> = {
  id: 'scouting',
  tactical: () => [{ id: 'explore', utility: -1, reason: 'No light Squad has been observed.', commands: [] }],
};
