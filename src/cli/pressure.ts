import { createArmyController } from './ai-match.ts';
import type { DifficultyName } from '../ai/difficulty.ts';
import type { Faction } from '../sim/faction.ts';
import { TICK_HZ } from '../sim/clock.ts';
import { runMatch } from '../sim/driver.ts';
import { replay } from '../sim/replay.ts';
import { createNoticeBook } from '../ui/conditions.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeVisible } from '../sim/siege.ts';

/** Declared before sampling: no seed is replaced after observing an outcome. */
export const PRESSURE_SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
export const PRESSURE_LIMITS = {
  tiro: { contact: 5, pressure: 10 },
  centurio: { contact: 3, pressure: 6 },
  imperator: { contact: 2, pressure: 4 },
} as const;

/** Passive human, ordinary start, public observations; no hidden state informs either Player. */
export function diagnosePressure(seed: number, faction: Faction, difficulty: DifficultyName) {
  const enemy = faction === 'rome' ? 'carthage' : 'rome';
  let contact: { tick: number; id: number; x: number; y: number } | null = null;
  let pressure: { tick: number; settlement: number; effect: string } | null = null;
  let last: SiegeVisible | undefined;
  const notices = createNoticeBook();
  let contactNotice: { tick: number; x: number; y: number } | null = null;
  let lastOpponent: SiegeVisible | undefined;
  let unpaid = 0;
  let minimumTreasury = Number.MAX_SAFE_INTEGER;
  const limits = PRESSURE_LIMITS[difficulty];
  const ticks = limits.pressure * 60 * TICK_HZ;
  const ai = createArmyController(difficulty);
  const run = runMatch({ seed, ticks, rules: siegeMatchRules, observe: observeSiege,
    outcome: siegeMatchOutcome, players: [
      { faction, controller: { decide(observation) {
        const visible = observation.visible;
        const notice = notices.read(visible, observation.tick).find((entry) => entry.kind === 'contact');
        if (contactNotice === null && notice?.target != null) {
          contactNotice = { tick: notice.raised, x: notice.target.x, y: notice.target.y };
        }
        const spotted = visible.enemies[0];
        if (contact === null && spotted !== undefined) contact = { tick: observation.tick, ...spotted };
        for (const front of visible.fronts) {
          if (!visible.settlements.some((site) => site.id === front.settlement)) continue;
          const before = last?.fronts.find((entry) => entry.settlement === front.settlement);
          // An issued siege order alone is insufficient: the walls must actually lose health.
          if (pressure === null && before !== undefined && front.structures.some((wall, index) =>
            wall.hp < before.structures[index]!.hp)) {
            pressure = { tick: observation.tick, settlement: front.settlement, effect: 'wall-damage' };
          }
          // Presence at the walls makes this actual contention, not just a submitted Order.
          if (pressure === null && front.siege === 'blockade' && front.besieger === enemy &&
            visible.enemies.some((squad) => {
              const site = visible.settlements.find((site) => site.id === front.settlement)!;
              return Math.max(Math.abs(squad.x - site.x), Math.abs(squad.y - site.y)) <= 1;
            })) pressure = { tick: observation.tick, settlement: front.settlement, effect: 'occupied-blockade' };
        }
        last = visible;
        return [];
      } } },
      { faction: enemy, controller: { decide(observation) {
        minimumTreasury = Math.min(minimumTreasury, observation.visible.treasury);
        unpaid = Math.max(unpaid, ...observation.visible.squads.map((squad) => squad.unpaid));
        lastOpponent = observation.visible;
        return ai.decide(observation);
      } } },
    ] });
  const replayed = replay({ seed, ticks: run.result.tick, rules: siegeMatchRules,
    log: run.log, everyTicks: Math.max(1, run.result.tick) });
  const replayHash = replayed.checkpoints.at(-1)!.hash;
  const seen = contact as { tick: number; id: number; x: number; y: number } | null;
  const pressed = pressure as { tick: number; settlement: number; effect: string } | null;
  const final = ai.readLog().filter((entry) => entry.layer === 'operational').at(-1);
  const opponentView = lastOpponent as SiegeVisible | undefined;
  return { seed, faction, difficulty, policy: 'passive', paused: false, speed: 1,
    activeTicks: run.result.tick, activeMilliseconds: run.result.tick * 1000 / TICK_HZ,
    contact: seen, contactNotice, pressure: pressed,
    pass: seen !== null && seen.tick <= limits.contact * 60 * TICK_HZ && pressed !== null &&
      pressed.tick <= ticks && replayHash === run.hash && unpaid === 0 && contactNotice !== null,
    hash: run.hash, replayHash, finalOperational: final?.selected,
    commands: run.log.length, unpaid, minimumTreasury,
    // Diagnostic-only: never consumed by the browser or the human-facing journal.
    opponent: opponentView === undefined ? null : { treasury: opponentView.treasury,
      squads: opponentView.squads, settlements: opponentView.settlements, contacts: opponentView.contacts } };
}
