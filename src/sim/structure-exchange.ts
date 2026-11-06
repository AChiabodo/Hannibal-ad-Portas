/** Structure damage is a body's work, not a bonus for each Squad entity. */
import { squadTypeOf } from '../content/squads.ts';
import { bearing } from './combat.ts';
import type { Squad } from './economy.ts';

/**
 * One exchange, counted cumulatively per target in attack order. A full 24-man
 * infantry body deals `fullBodyDamage` HP; cavalry contributes half its Force.
 * Floor once per target, with a one-HP minimum for any positive total Force.
 * Returning only each contribution's increment preserves final-blow ownership.
 */
export function createStructureExchange(fullBodyDamage = 4): (target: object, squad: Squad) => number {
  const committed = new Map<object, number>();
  const damageAt = (points: number) => points === 0 ? 0 : Math.max(1, Math.floor(points / 48));
  return (target, squad) => {
    const before = committed.get(target) ?? 0;
    const after = before + bearing(squad) * fullBodyDamage * (squadTypeOf(squad.type)?.arm === 'cavalry' ? 1 : 2);
    committed.set(target, after);
    return damageAt(after) - damageAt(before);
  };
}
