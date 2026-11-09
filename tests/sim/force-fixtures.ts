/**
 * The fixtures the two force tests share (#66).
 *
 * `tests/sim/combat.test.ts` asks what one round does and `tests/sim/balance.test.ts`
 * asks whether dividing the men changes it; both need the same three things — a
 * body of a stated size on a stated tile, the men a set of bodies has lost, and
 * the band a comparison is held to. They live here so the two suites cannot drift
 * into measuring slightly different things, the way `map-invariants.ts` and
 * `brightness.ts` already hold the shared fixtures of their own suites.
 */
import type { Squad } from '../../src/sim/economy';
import { musterSquad } from '../../src/sim/movement';
import type { Facing } from '../../src/sim/squad';
import type { EconomyWorld } from '../../src/sim/economy-match';

/**
 * The band every equivalence comparison is held to: fifteen per cent either way.
 *
 * Declared before any comparison is run (ADR-0028): roughly twice the worst
 * rounding one step of the exchange chain can cost at force-point scale, and far
 * below the four hundred per cent the entity-count exploits were worth.
 */
export const BAND = 0.15;

/** How far apart two measurements are, as a share of the larger one. */
export function apart(one: number, other: number): number {
  const larger = Math.max(Math.abs(one), Math.abs(other));

  return larger === 0 ? 0 : Math.abs(one - other) / larger;
}

/**
 * A Squad of exactly `men` men of its type, fresh and in good order, on a tile.
 *
 * `musterSquad` is the scenario door the game itself uses to stand a body up
 * outside recruitment, and it holds a scenario to the type's own ceiling. A
 * *measurement* sometimes has to stand a Carthaginian body at 120 men, because the
 * only way to hold "how many men" equal between two rosters whose ceilings differ
 * is to overrule the ceiling — so the size is written on the body after it is
 * raised. That is a fixture's licence and not a rule's: nothing in `src/` can do
 * it, and the scenes that play real Matches (`tests/sim/balance.test.ts`) muster
 * at sizes the roster really sells.
 */
export function body(
  world: EconomyWorld,
  faction: 'rome' | 'carthage',
  squadType: string,
  x: number,
  y: number,
  men: number,
  facing: Facing = 'south',
): Squad {
  const squad = musterSquad(world.economy, world.map, { faction, squadType, x, y, facing });
  Object.assign(squad, { strength: men, capacity: men, fatigue: 0 });

  return squad;
}

/** The men a set of bodies has lost since they were raised. */
export function lost(squads: readonly Squad[]): number {
  return squads.reduce((total, squad) => total + Math.max(0, squad.capacity - squad.strength), 0);
}
