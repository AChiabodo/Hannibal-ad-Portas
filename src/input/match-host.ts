/** The browser's tick host. Controllers receive copies of their own Siege Observation. */
import { createArmyController } from '../cli/ai-match.ts';
import type { DifficultyName } from '../ai/difficulty.ts';
import { validateCommand, type Command } from '../sim/command.ts';
import type { Controller } from '../sim/controller.ts';
import { ForeignCommandError, type MatchResult } from '../sim/driver.ts';
import type { Faction } from '../sim/faction.ts';
import { createMatch, type MatchRules } from '../sim/match.ts';
import { createPacing } from '../sim/pacing.ts';
import type { LoggedCommand } from '../sim/replay.ts';
import { MATCH_TICKS } from '../sim/season.ts';
import { observeSiege, siegeMatchOutcome, siegeMatchRules, type SiegeWorld, type SiegeVisible } from '../sim/siege.ts';
import { requireTickCount } from '../sim/ticks.ts';
import { createHuman } from './human.ts';

export interface BrowserMatchOptions {
  readonly seed: number;
  readonly faction: Faction;
  readonly difficulty: DifficultyName;
  /** Composition seams for rules-driven scenarios; never exposed as browser hooks. */
  readonly rules?: MatchRules<SiegeWorld, Command>;
  readonly opponent?: Controller<SiegeVisible>;
}

export function createBrowserMatch(options: BrowserMatchOptions) {
  const match = createMatch({ seed: options.seed, rules: options.rules ?? siegeMatchRules });
  const pacing = createPacing();
  let result: MatchResult | null = null;
  const human = createHuman(options.faction, () => result === null);
  const opponent = options.opponent ?? createArmyController(options.difficulty);
  const enemy: Faction = options.faction === 'rome' ? 'carthage' : 'rome';
  const players = [{ faction: options.faction, controller: human }, { faction: enemy, controller: opponent }]
    .sort((a, b) => a.faction === b.faction ? 0 : a.faction === 'rome' ? -1 : 1);
  const log: LoggedCommand<Command>[] = [];

  function settle(): void {
    const decided = siegeMatchOutcome(match.state.world);
    if (decided !== null) result = { ...decided, tick: match.state.tick };
    else if (match.state.tick >= MATCH_TICKS) result = { kind: 'clock', tick: match.state.tick };
    if (result !== null) pacing.pause();
  }
  settle();

  return {
    match, human, pacing,
    get result(): MatchResult | null { return result; },
    observe: (): SiegeVisible => structuredClone(observeSiege(match.state.world, options.faction)),
    applied: (faction?: Faction): readonly LoggedCommand<Command>[] => structuredClone(
      faction === undefined ? log : log.filter(({ command }) => command.faction === faction)),
    elapse(milliseconds: number, afterTick?: () => void): void {
      if (result !== null) return;
      const ticks = pacing.ticksFor(milliseconds);
      if (ticks > 0) this.advance(Math.min(ticks, MATCH_TICKS - match.state.tick), afterTick);
    },
    /** Explicit debugging steps skip pacing, just like the existing browser advance hook. */
    advance(ticks: number, afterTick?: () => void): void {
      const count = requireTickCount(ticks, 'ticks', 0);
      if (result !== null) throw new RangeError('the Match ended and cannot be advanced further');
      if (match.state.tick + count > MATCH_TICKS) throw new RangeError('advancing would run past the Match bound');
      for (let i = 0; i < count && result === null; i += 1) {
        const entries: LoggedCommand<Command>[] = [];
        for (const player of players) {
          const observation = { faction: player.faction, tick: match.state.tick,
            visible: structuredClone(observeSiege(match.state.world, player.faction)) };
          for (const emitted of player.controller.decide(observation)) {
            const command = validateCommand(emitted);
            if (command.faction !== player.faction) throw new ForeignCommandError(player.faction, command.faction);
            entries.push({ tick: match.state.tick, command });
          }
        }
        match.step(entries.map(({ command }) => command));
        log.push(...entries);
        if (log.length > 128) log.splice(0, log.length - 128);
        settle();
        afterTick?.();
      }
    },
  };
}
