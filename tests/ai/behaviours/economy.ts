import type { Behaviour } from '../../../src/ai/registry.ts';
import type { Command } from '../../../src/sim/command.ts';
import type { SiegeVisible } from '../../../src/sim/siege.ts';

/** A test adapter, not D2's economy policy. */
export const economy: Behaviour<SiegeVisible, Command> = {
  id: 'economy',
  operational: ({ observation }) => observation.visible.settlements.slice(0, 1).map((settlement) => ({
    id: 'granary', utility: 6, reason: 'The observed settlement needs storage.',
    commands: [{ kind: 'build', faction: observation.faction, settlement: settlement.id, building: 'granary' }],
  })),
};
