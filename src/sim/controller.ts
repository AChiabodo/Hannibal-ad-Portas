/**
 * The Controller seam: one interface, four implementations (PLAN §3, ADR-0003).
 *
 * A Controller reads an Observation and emits Commands. The human input
 * handler, the built-in AI, a scripted test driver and an external agent over
 * the CLI protocol are all Controllers, and they differ in nothing else. There
 * is no second place where the game decides anything, which is what makes an
 * AI-versus-AI Match a test rather than a demo: swap two scripted Controllers
 * into a headless driver and the Match runs with no browser, no human and no AI
 * anywhere in it.
 *
 * The interface is one method on purpose. Everything a Controller may know
 * arrives as an argument (`Observation`), everything it may do leaves as a
 * return value (`Command`), and nothing else is reachable from it — the seam's
 * honesty is a property of these two types, not of the discipline of whoever
 * writes the next Controller.
 *
 * The contract a Controller can rely on, and the driver guarantees:
 *
 * - `decide` is asked once per tick, before that tick is stepped, and the
 *   Observation's `tick` is the tick being decided.
 * - What it returns is validated at the seam, and a Command addressed to
 *   another Faction is refused: a Controller commands its own Faction only.
 * - Returning nothing is always legal. A Controller that never decides anything
 *   is a Controller that watches.
 *
 * Determinism is the driver's business as much as the Controller's: the same
 * seed and the same sequence of returned Commands produce the same Match, hash
 * for hash. A Controller that draws from `Math.random`, reads a clock or a file
 * breaks that, and ADR-0006 bans the first of those repository-wide.
 */
import { validateCommand, type Command } from './command.ts';
import type { Faction } from './faction.ts';
import type { Observation } from './observation.ts';
import type { CommandLog } from './replay.ts';
import { requireTickCount } from './ticks.ts';

/**
 * Whichever mind drives a Faction (GLOSSARY: Controller).
 *
 * `Visible` is the rules' projection of the world, the same one an Observation
 * carries; a Controller is written against it, so a Controller for one Match's
 * rules is reusable only there — which is the point.
 */
export interface Controller<Visible> {
  /**
   * The Commands to apply on the tick the Observation is stamped with.
   *
   * The Observation is the whole of what this Controller may know. It may
   * return an empty list — doing nothing is a decision too — and it may not
   * return a Command for another Faction: the driver refuses that rather than
   * handing it to the rules.
   */
  decide(observation: Observation<Visible>): readonly Command[];
}

/** Whichever Controller drives a Faction (GLOSSARY: Player). A Match has exactly two. */
export interface Player<Visible> {
  readonly faction: Faction;
  readonly controller: Controller<Visible>;
}

/**
 * A Match's two Players: one Rome, one Carthage.
 *
 * They decide in Faction order, Rome first, whatever order they are given in,
 * so that the same seed and the same Commands produce the same log and the same
 * hash (the driver normalises).
 */
export type Players<Visible> = readonly [Player<Visible>, Player<Visible>];

/** A tick with nothing stamped on it, so a script that stays silent allocates nothing. */
const NO_COMMANDS: readonly Command[] = [];

/**
 * A Controller that watches: it emits nothing, ever.
 *
 * The Player a Match runs when nobody is deciding anything — a headless Match
 * with no AI and no script, or one Faction of a Match left deliberately quiet
 * so a test can watch what the other one does. It is a Controller like any
 * other, not a special case in the driver: returning nothing is always legal,
 * and this is the Controller that does exactly that.
 */
export function idleController<Visible = unknown>(): Controller<Visible> {
  return { decide: () => NO_COMMANDS };
}

/**
 * A Controller that plays back a fixed script: at each tick it emits the
 * Commands the script stamped for that tick, and only those addressed to the
 * Faction it is looking for.
 *
 * One log therefore drives both Factions of a Match, which is what makes a
 * recorded Match replayable through the very same driver that produced it (E2):
 * hand the log to two scripted Controllers and the Match runs again. A script
 * is validated when the Controller is built, so a hand-written one fails where
 * it was written rather than on the tick it would have applied.
 *
 * @throws CommandValidationError when the log holds something that is not a
 *   Command in the vocabulary.
 * @throws RangeError when a stamp is not a whole non-negative tick.
 */
export function scriptedController<Visible = unknown>(
  log: CommandLog<Command>,
): Controller<Visible> {
  const scripts: Record<Faction, Map<number, Command[]>> = {
    rome: new Map(),
    carthage: new Map(),
  };

  for (const entry of log) {
    const tick = requireTickCount(entry.tick, 'a scripted tick', 0);
    const command = validateCommand(entry.command);
    const script = scripts[command.faction];

    const atTick = script.get(tick);
    if (atTick === undefined) script.set(tick, [command]);
    else atTick.push(command);
  }

  return {
    decide: (observation) => scripts[observation.faction].get(observation.tick) ?? NO_COMMANDS,
  };
}
