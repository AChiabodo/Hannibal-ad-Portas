import type { DifficultyName } from '../ai/difficulty.ts';
import type { Faction } from '../sim/faction.ts';
import { MAX_SEED } from '../sim/rng.ts';

export interface MatchConfiguration {
  readonly seed: number;
  readonly faction: Faction;
  readonly difficulty: DifficultyName;
}

export function explicitSeed(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const seed = Number(value);
  return Number.isSafeInteger(seed) && seed >= 0 && seed <= MAX_SEED ? seed : null;
}

/** A shareable Match address; setup is the entry page without play=1. */
export function matchAddress(config: MatchConfiguration, entryPath: string): string {
  return `${entryPath}?play=1&seed=${String(config.seed)}&faction=${config.faction}&difficulty=${config.difficulty}`;
}

export function readConfiguration(params: URLSearchParams): MatchConfiguration | null {
  const seed = explicitSeed(params.get('seed') ?? '');
  const faction = params.get('faction');
  const difficulty = params.get('difficulty');
  if (params.get('play') !== '1' || seed === null || (faction !== 'rome' && faction !== 'carthage') ||
    (difficulty !== 'tiro' && difficulty !== 'centurio' && difficulty !== 'imperator')) return null;
  return { seed, faction, difficulty };
}
