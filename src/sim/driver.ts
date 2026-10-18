/**
 * The headless driver: two Controllers play a Match to a result.
 *
 * Everything else in a Match is a rule; this is the loop that asks the Players
 * what they want and applies it. It exists so that the game can be played with
 * no browser, no human and no AI (PLAN §3, ADR-0003): a Match driven by two
 * scripted Controllers is a test, and the same loop driven by an external agent
 * over the CLI is a whole Match run by a machine (A4, E1).
 *
 * What the driver owns, and why it is the driver that owns it:
 *
 * - **The Observation.** Each tick, each Player is handed the world filtered
 *   for its own Faction, stamped with the Faction and the tick. A rule supplies
 *   the projection and nothing else, so a rule cannot claim to be another
 *   Faction or to be another tick. The driver deep-copies the projection before
 *   it is handed over, not the projection itself (see `decide`).
 * - **The validation.** What a Controller returns is read through
 *   `validateCommand` before anything is applied, and a Command addressed to
 *   the other Faction is refused outright: a Controller commands its own Faction
 *   and no other.
 * - **The log.** Every Command that was applied is written down with the tick
 *   it applied on, in the order it was applied — Rome's Commands before
 *   Carthage's, always, whatever order the Players were handed in. That log
 *   plus the seed is the Match (E2): replay it, and it happens again.
 *
 * There is no wall clock anywhere in here. The loop runs ticks as fast as the
 * processor allows, which is what makes a hundred Matches a routine command
 * rather than an afternoon, and the only bound is the one the caller sets.
 */
import { validateCommand, type Command } from './command.ts';
import type { Player, Players } from './controller.ts';
import type { Faction } from './faction.ts';
import { createMatch, type Match, type MatchRules } from './match.ts';
import type { Observation } from './observation.ts';
import type { CommandLog, LoggedCommand } from './replay.ts';
import { requireTickCount } from './ticks.ts';

/**
 * A Controller emitted a Command for a Faction that is not its own.
 *
 * Not a malformed Command — the Command may be perfectly well formed — but a
 * breach of the seam, and one the rules must never have to defend against:
 * ownership is checked here, before the world sees anything, so no rule needs
 * to ask whether the Command it is applying came from the right Faction.
 */
export class ForeignCommandError extends Error {
  /** The Faction the Controller drives. */
  readonly faction: Faction;

  /** The Faction the refused Command was addressed to. */
  readonly commanded: Faction;

  constructor(faction: Faction, commanded: Faction) {
    super(
      `a ${faction} Controller emitted a command for ${commanded}: ` +
        'a Controller commands its own Faction and no other',
    );
    this.name = 'ForeignCommandError';
    this.faction = faction;
    this.commanded = commanded;
  }
}

/**
 * The rules returned a projection the core cannot carry to a Controller.
 *
 * The seam's contract on `observe` is structured-cloneable plain data (see
 * `MatchSetup.observe`), and this is the failure of that contract: a function, a
 * proxy, or anything else `structuredClone` refuses to copy. It is a sim-owned
 * error rather than the clone's own `DataCloneError` for the ordinary reason —
 * it is a failure of a rule, and a reader of it should not have to know which
 * primitive noticed. The clone's own refusal is kept as `cause`, so nothing
 * about *why* it could not be carried is lost by naming the seam.
 *
 * Nothing but the hand-over can raise it: the copy is made once per Player per
 * tick, before the Controller sees anything and before the tick is stepped.
 */
export class ObservationProjectionError extends Error {
  /** The Faction the projection was built for. */
  readonly faction: Faction;

  constructor(faction: Faction, cause: unknown) {
    super(
      `observe returned a projection for ${faction} that the driver cannot carry to its Controller: ` +
        'a projection must be structured-cloneable plain data',
      { cause },
    );
    this.name = 'ObservationProjectionError';
    this.faction = faction;
  }
}

/**
 * What the rules say about a Match that has ended: who won, or that nobody did.
 *
 * Deliberately thin. The *reason* — a Stronghold fallen, an army annihilated —
 * belongs to the rules that decided it (C5), and arrives as more of this union
 * when there is a reason to name. A Match the rules never decide ends by the
 * clock instead, which is a fact about the run and not about the world, so it
 * is `MatchResult`'s to carry.
 */
export type Outcome =
  | { readonly kind: 'victory'; readonly winner: Faction }
  | { readonly kind: 'draw' };

/** How a Match ended: what the rules decided, or that it ran out of ticks. */
export type MatchResult =
  | { readonly kind: 'victory'; readonly winner: Faction; readonly tick: number }
  | { readonly kind: 'draw'; readonly tick: number }
  | { readonly kind: 'clock'; readonly tick: number };

/**
 * Everything a Match needs from the game besides its Players: the rules of the
 * tick (A2), the projection a Faction may see, the verdict, and the bound.
 *
 * The three rule-shaped fields belong together, because a world that can be
 * stepped but not observed is not a game, and a game that cannot end cannot be
 * tested.
 */
export interface MatchSetup<World, Visible> {
  readonly seed: number;

  /** The tick contract: a world built from the seed, and how a tick changes it. */
  readonly rules: MatchRules<World, Command>;

  /**
   * The world as `faction` may see it. The whole honesty of the project rests
   * on this function: a Controller can read nothing else (B4 filters it through
   * fog of war).
   *
   * It must return structured-cloneable plain data: the driver deep-copies the
   * result before a Controller sees it, so returning a reference — the world
   * itself, or part of it — is safe, and the copy carries nothing else (`decide`
   * says what that rules out). The copy only disconnects; filtering is this
   * function's job, and the driver cannot do it for you.
   */
  readonly observe: (world: World, faction: Faction) => Visible;

  /** The verdict, or `null` while the Match is still on. Asked before every tick. */
  readonly outcome: (world: World) => Outcome | null;

  /**
   * The two Players. They decide in Faction order — Rome first — whatever order
   * they arrive in, so the same seed and the same Commands produce the same Match.
   */
  readonly players: Players<Visible>;

  /** The longest the Match may run: headless and AI-versus-AI Matches must terminate (B5). */
  readonly ticks: number;
}

/** What one headless Match produced: its result, and everything needed to run it again. */
export interface MatchRun {
  readonly seed: number;

  /** How the Match ended, and on which tick. */
  readonly result: MatchResult;

  /** Every Command applied, stamped with the tick it applied on, in application order. */
  readonly log: CommandLog<Command>;

  /** The state hash at the end of the Match: A2's fingerprint of everything the rules own. */
  readonly hash: string;
}

/**
 * Plays a Match to its end, or to the tick bound, with two Controllers and no
 * browser anywhere.
 *
 * The bound is checked *after* the rules have had their say, so a Match that is
 * decided on the very tick it is decided on reports the victory rather than the
 * clock. A Match the rules never decide ends as `clock` at the bound, which is
 * the outcome a tournament counts as "decided by the clock" (DoD 5).
 *
 * @throws RangeError when the bound is not a whole non-negative number of
 *   ticks, or when both Players drive the same Faction.
 * @throws CommandValidationError when a Controller emits something that is not
 *   a Command in the vocabulary.
 * @throws ForeignCommandError when a Controller emits a Command for the other
 *   Faction.
 * @throws ObservationProjectionError when `observe` returns a projection that is
 *   not structured-cloneable plain data — a function or a proxy, which
 *   `structuredClone` refuses rather than copies.
 * @throws StateSerializationError when a tick leaves anything but integers in state.
 */
export function runMatch<World, Visible>(setup: MatchSetup<World, Visible>): MatchRun {
  const ticks = requireTickCount(setup.ticks, 'ticks', 0);
  requireTwoFactions(setup.players);

  const match = createMatch({ seed: setup.seed, rules: setup.rules });
  const log: LoggedCommand<Command>[] = [];

  for (let tick = 0; ; tick += 1) {
    const decided = setup.outcome(match.state.world);
    if (decided !== null) return report(match, log, decided, tick);
    if (tick >= ticks) return report(match, log, null, tick);

    const entries = decide(setup, tick, match.state.world);
    match.step(entries.map((entry) => entry.command));
    log.push(...entries);
  }
}

/** Asks both Players what they want on this tick, and refuses anything the seam cannot allow. */
function decide<World, Visible>(
  setup: MatchSetup<World, Visible>,
  tick: number,
  world: World,
): LoggedCommand<Command>[] {
  const entries: LoggedCommand<Command>[] = [];

  for (const player of decidingOrder(setup.players)) {
    const observation: Observation<Visible> = {
      faction: player.faction,
      tick,
      // The Observation is the Controller's own, the way IN is copied too, in
      // `validateCommand`: the driver deep-copies what `observe` returned, so a
      // projection that aliases the world — the world itself, or a part of it —
      // cannot be written back through.
      //
      // `structuredClone` is the whole contract on a projection, and it is a
      // data copy, not a check. Arrays, plain objects, typed arrays and cycles
      // come through; everything else is silently flattened — a class instance
      // loses its prototype and its methods, an accessor becomes a data
      // property, and symbol keys and non-enumerable own fields are dropped. So
      // a projection must be structured-cloneable plain data, and nothing it
      // holds may rely on prototype identity, accessors, symbol keys or
      // non-enumerable fields. Only what the clone cannot carry at all — a
      // function, a proxy — is refused, and that refusal is the seam's own
      // (`ObservationProjectionError`), naming the Faction it was built for.
      visible: projectionOf(setup, world, player.faction),
    };

    for (const emitted of player.controller.decide(observation)) {
      const command = validateCommand(emitted);

      if (command.faction !== player.faction) {
        throw new ForeignCommandError(player.faction, command.faction);
      }

      entries.push({ tick, command });
    }
  }

  return entries;
}

/**
 * What one Faction may see of the world, copied so that the Controller owns it.
 *
 * A rules bug that throws from `observe` keeps its own error: only the copy is
 * the driver's to explain, and a failure of the copy is exactly the one the seam
 * has something useful to say about.
 *
 * @throws ObservationProjectionError when the projection is not
 *   structured-cloneable plain data.
 */
function projectionOf<World, Visible>(
  setup: MatchSetup<World, Visible>,
  world: World,
  faction: Faction,
): Visible {
  const projected = setup.observe(world, faction);

  try {
    return structuredClone(projected);
  } catch (error) {
    throw new ObservationProjectionError(faction, error);
  }
}

/** The end of the Match, as the run reports it. */
function report<World>(
  match: Match<World, Command>,
  log: CommandLog<Command>,
  decided: Outcome | null,
  tick: number,
): MatchRun {
  return {
    seed: match.state.seed,
    result: decided === null ? { kind: 'clock', tick } : { ...decided, tick },
    log,
    hash: match.hash(),
  };
}

/**
 * The Players in the one order a Match decides in: Rome, then Carthage.
 *
 * Normalising rather than trusting the tuple is what keeps the log canonical:
 * two callers who hand the same Players over in different orders get the same
 * Match, and the same hash, out of the same seed.
 */
function decidingOrder<Visible>(
  players: Players<Visible>,
): readonly [Player<Visible>, Player<Visible>] {
  const [first, second] = players;

  return first.faction === 'rome' ? [first, second] : [second, first];
}

/** @throws RangeError when both Players drive the same Faction. */
function requireTwoFactions<Visible>(players: Players<Visible>): void {
  const [first, second] = players;

  if (first.faction === second.faction) {
    throw new RangeError(
      `a Match is rome against carthage: both Players drive ${first.faction}`,
    );
  }
}
