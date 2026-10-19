import type { Behaviour } from '../../../src/ai/registry.ts';
import type { Command } from '../../../src/sim/command.ts';
import type { SiegeVisible } from '../../../src/sim/siege.ts';

/** A test adapter, not D3's military policy. */
export const military: Behaviour<SiegeVisible, Command> = {
  id: 'military',
  strategic: () => [{
    id: 'defend', utility: 9, reason: 'Keep the observed home settlement.', commands: [],
    plan: { posture: 'growth', budget: { reserve: 100 }, objective: '0' },
  }],
  operational: () => [{ id: 'recruit', utility: 3, reason: 'Storage takes priority over a reserve.', commands: [] }],
};
