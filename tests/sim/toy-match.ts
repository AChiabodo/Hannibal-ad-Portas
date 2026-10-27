import type { Command, CommandKind } from '../../src/sim/command';
import type { Outcome } from '../../src/sim/driver';
import type { Faction } from '../../src/sim/faction';
import type { MatchRules } from '../../src/sim/match';
import type { Rng } from '../../src/sim/rng';

/**
 * The rules A3's tests drive: a toy Match of two Factions and three Squads.
 *
 * A3 ships the Controller seam, not a world — the map, the economy and combat
 * arrive with the waves that need them — so the tests bring their own world,
 * one small enough to reason about by hand and real enough to prove the seam.
 * It understands the whole Command vocabulary, moves Squads towards their goal
 * one tile a tick, strikes one enemy a tick, and ends when a Faction has no
 * Squad left: enough for a Match that is played, won and replayed.
 *
 * The world holds integers only, as all state must (ADR-0006), so a Faction is
 * stored as its code and a formation as a number; the *Commands* carry words,
 * because a Command is not state but data on its way into it.
 */

/** Faction codes, because state holds integers and not words. */
export const ROME = 0;
export const CARTHAGE = 1;

/** Command codes, one per kind, so a test can read back what the rules received. */
export const CODE_OF: Record<CommandKind, number> = {
  move: 1,
  attackMove: 2,
  attack: 3,
  attackStructure: 16,
  hold: 4,
  garrison: 5,
  withdraw: 6,
  build: 7,
  recruit: 8,
  assault: 9,
  blockade: 10,
  formation: 11,
  group: 12,
  cancelPending: 13,
  repairFortification: 14,
  cancelFortificationRepair: 15,
};

/** One Squad: a block, with everything a Tick might move or spend. */
export interface ToyMatchSquad {
  readonly id: number;
  readonly owner: number;
  x: number;
  y: number;
  strength: number;
  formation: number;
  /** Where the Squad is marching, or `-1` while it has no goal. */
  goalX: number;
  goalY: number;
  /** The enemy Squad it is striking, or `-1`. */
  target: number;
}

export interface ToyMatchWorld {
  squads: ToyMatchSquad[];
  /** Control groups, indexed `faction * 10 + group`, each a list of Squad ids. */
  groups: number[][];
  /** Every Command the rules received, as flat `tick, code` pairs. */
  applied: number[];
}

/** A Squad as the Faction that owns it sees it: no owner, because it is always yours. */
export interface ToyMatchSeenSquad {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly strength: number;
  readonly formation: number;
}

/** What a Faction may know: its own Squads, and nothing of the enemy at all. */
export interface ToyMatchVisible {
  readonly squads: readonly ToyMatchSeenSquad[];
}

/** A world with two Roman Squads, one Carthaginian, and no control groups bound yet. */
export function makeToyMatchWorld(): ToyMatchWorld {
  const squad = (id: number, owner: number, x: number, y: number, strength: number): ToyMatchSquad => ({
    id,
    owner,
    x,
    y,
    strength,
    formation: 0,
    goalX: -1,
    goalY: -1,
    target: -1,
  });

  return {
    squads: [squad(1, ROME, 0, 0, 10), squad(2, ROME, 1, 0, 10), squad(3, CARTHAGE, 9, 9, 3)],
    groups: Array.from({ length: 20 }, (): number[] => []),
    applied: [],
  };
}

/**
 * One tick of the toy rules. The world does not draw, so it ignores the Match's
 * random source: the tests that care about seeds and draws are A2's.
 */
export const toyStep: MatchRules<ToyMatchWorld, Command>['step'] = (world, _rng: Rng, tick, commands) => {
  for (const command of commands) {
    world.applied.push(tick, CODE_OF[command.kind]);
    obey(world, command);
  }

  march(world);
  strike(world);
};

/** The toy Match's rules, ready to hand to `createMatch`. The seed changes nothing in it. */
export const toyMatchRules: MatchRules<ToyMatchWorld, Command> = {
  createWorld: () => makeToyMatchWorld(),
  step: toyStep,
};

/** What one Faction may see: its own Squads, projected field by field. */
export function observeToyMatchWorld(world: ToyMatchWorld, faction: Faction): ToyMatchVisible {
  const owner = codeOf(faction);

  return {
    squads: world.squads
      .filter((squad) => squad.owner === owner)
      .map((squad) => ({
        id: squad.id,
        x: squad.x,
        y: squad.y,
        strength: squad.strength,
        formation: squad.formation,
      })),
  };
}

/** The verdict: a Faction with no Squad left has lost. */
export function toyOutcome(world: ToyMatchWorld): Outcome | null {
  const rome = world.squads.some((squad) => squad.owner === ROME);
  const carthage = world.squads.some((squad) => squad.owner === CARTHAGE);

  if (rome && carthage) return null;
  const reason = { kind: 'annihilation' } as const;

  if (rome) return { kind: 'victory', winner: 'rome', reason };
  if (carthage) return { kind: 'victory', winner: 'carthage', reason };

  return { kind: 'draw' };
}

/** The Faction code a Command's own Faction names. */
function codeOf(faction: Faction): number {
  return faction === 'rome' ? ROME : CARTHAGE;
}

/** The Squads a Command addresses, and that its Faction actually owns. */
function owned(world: ToyMatchWorld, command: Command): ToyMatchSquad[] {
  const owner = codeOf(command.faction);

  return world.squads.filter(
    (squad) => squad.owner === owner && 'squads' in command && command.squads.includes(squad.id),
  );
}

/**
 * Applies one Command to the world. The three orders the toy models are enough
 * to play a Match; the rest reach the rules and are recorded, which is what the
 * test that walks the whole vocabulary checks.
 */
function obey(world: ToyMatchWorld, command: Command): void {
  switch (command.kind) {
    case 'move':
    case 'attackMove':
      for (const squad of owned(world, command)) {
        squad.goalX = command.x;
        squad.goalY = command.y;
      }
      return;

    case 'attack':
      for (const squad of owned(world, command)) squad.target = command.target;
      return;

    case 'formation':
      for (const squad of owned(world, command)) {
        squad.formation = command.formation === 'line' ? 0 : 1;
      }
      return;

    case 'group':
      world.groups[codeOf(command.faction) * 10 + command.group] = [...command.squads];
      return;

    default:
      return;
  }
}

/** One tile a tick towards the goal, along the longer axis first. */
function march(world: ToyMatchWorld): void {
  for (const squad of world.squads) {
    if (squad.goalX < 0) continue;

    if (squad.x !== squad.goalX) squad.x += Math.sign(squad.goalX - squad.x);
    else if (squad.y !== squad.goalY) squad.y += Math.sign(squad.goalY - squad.y);

    if (squad.x === squad.goalX && squad.y === squad.goalY) {
      squad.goalX = -1;
      squad.goalY = -1;
    }
  }
}

/** One man a tick from every Squad with a target, all at once, then the dead leave the field. */
function strike(world: ToyMatchWorld): void {
  const blows = new Map<number, number>();
  for (const squad of world.squads) {
    if (squad.target < 0) continue;
    blows.set(squad.target, (blows.get(squad.target) ?? 0) + 1);
  }

  for (const squad of world.squads) squad.strength -= blows.get(squad.id) ?? 0;

  world.squads = world.squads.filter((squad) => squad.strength > 0);

  for (const squad of world.squads) {
    if (!world.squads.some((other) => other.id === squad.target)) squad.target = -1;
  }
}
