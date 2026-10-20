/**
 * The human Player, as a Controller: a hand on the map that emits Commands
 * (ticket C2, PLAN §3, ADR-0003).
 *
 * The plan's one seam has four implementations and this is the fourth: the
 * interface does not reach into the rules and move a Squad, it *asks* — the same
 * `move`, `attackMove`, `hold`, `withdraw`, `formation` and `group` Commands an
 * AI would emit and an external agent would write on a line. That is the whole
 * point of the ticket's "issue real Commands through the same seam the AI will
 * use": swap this Controller for a machine's and the Match runs the same way,
 * which is also what makes a replay of a human's Match a Match (E2).
 *
 * What the Player's *memory* is, and what it is not:
 *
 * - the **selection** and the **control groups** are the human's, held here and
 *   nowhere else. They never reach state, they are not hashed, and the other
 *   Faction cannot see them. A `group` Command is emitted when a group is bound
 *   so that the log re-enacts the selection (the vocabulary says a group
 *   commands nobody), but the list itself is this module's.
 * - An order is stamped with the selection **when it is given**, not when the
 *   tick applies it: a Player who presses W and then clicks another Squad has
 *   ordered the first lot to withdraw, and the second lot to be selected.
 *
 * ## On the tick, and never before it
 *
 * `decide` is the seam's one method, so orders are *queued* here and emitted on
 * the next tick the Match decides — which is also what B5's pause needs: a
 * paused Match steps no ticks, so the queue simply waits, and the first tick
 * after the resume applies everything in the order it was given. Nothing here
 * reads a clock, and a Match decided by this Controller replays from its log.
 *
 * ## What is refused here, and what is refused by the rules
 *
 * An order with nothing selected emits nothing and says so. A tile outside the
 * theatre is refused here, because it is not a question about the world a
 * Player can mean: a click past the map's edge is a click that missed. Whether
 * a Squad may *walk* there — water, a way no route reaches — is the rules'
 * question, and the answer comes back through the Observation as the Squad's
 * `refused` reason, which the interface shows instead of guessing (C1).
 */
import {
  attackMove,
  formation,
  group,
  hold,
  move,
  withdraw,
  validateCommand,
  type Command,
  type Formation,
} from '../sim/command.ts';
import type { Controller } from '../sim/controller.ts';
import type { EconomyVisible, VisibleSquad } from '../sim/economy-match.ts';
import type { Faction } from '../sim/faction.ts';
import { MAP_HEIGHT, MAP_WIDTH } from '../sim/map.ts';
import type { Observation } from '../sim/observation.ts';
import { NOTHING_SELECTED, stillHeld, type Selection } from './selection.ts';

/**
 * The control groups a Player can bind: the digits on the keyboard's top row.
 *
 * The same nine the Command vocabulary allows (`command.ts` refuses anything
 * else), because a group the interface could bind and the vocabulary could not
 * log would be a group a replay forgot.
 */
export const CONTROL_GROUPS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/**
 * An order, as the interface gives it: what to do, and where or how.
 *
 * The target is separate from the Squads on purpose: the Squads come from the
 * selection at the moment the order is given, and a `Withdraw` carries no
 * destination at all — which ground is behind a Squad is a question about the
 * map and the enemy, and the rules answer it (C3).
 */
export type Order =
  | { readonly kind: 'move'; readonly x: number; readonly y: number }
  | { readonly kind: 'attackMove'; readonly x: number; readonly y: number }
  | { readonly kind: 'hold' }
  | { readonly kind: 'withdraw' }
  | { readonly kind: 'formation'; readonly formation: Formation };

/** The four things a Player does with a mouse, as the interface names them. */
export type OrderKind = Order['kind'];

/**
 * The human Controller: a `Controller` a page drives with a pointer and a
 * keyboard, and a selection that is the Player's own.
 *
 * It is a Controller like any other — the driver and the page's loop cannot
 * tell it from a script or an AI — with the additions a hand needs: a
 * selection, control groups, and a way to give an order now that reaches the
 * Match on the next tick.
 */
export interface HumanController extends Controller<EconomyVisible> {
  /** Queues any existing Command through the human Controller, including economy and Siege. */
  submit(command: Command): boolean;
  /** What the Player has picked. */
  readonly selection: Selection;

  /** How many orders are waiting for the next tick. */
  readonly pending: number;

  /** Replaces the selection, pruning nothing: a page has just picked it. */
  select(selection: Selection): void;

  /**
   * Queues an order for the Squads selected right now.
   *
   * @returns whether there was anybody to order, and a tile in the theatre if
   *   the order needed one.
   */
  order(given: Order): boolean;

  /** Binds the selected Squads to a control group, replacing what was there. */
  bindGroup(index: number): boolean;

  /** Selects the Squads a control group holds, pruned to the ones still afield. */
  recallGroup(index: number): boolean;

  /** The Squads a control group holds, in the order they were bound. */
  groupOf(index: number): readonly number[];
}

/**
 * One queued order: what was asked, and the Squads that were picked when it was.
 *
 * A control-group binding is queued the same way but is not an *order*: it
 * commands nobody (the vocabulary says so), so it travels with the group number
 * rather than with a list of Squads.
 */
type Queued =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'order'; readonly given: Order; readonly squads: readonly number[] }
  | { readonly kind: 'binding'; readonly index: number; readonly squads: readonly number[] };

/**
 * A human Controller for one Faction.
 *
 * @throws RangeError when the Faction is not one of the two the vocabulary names.
 */
export function createHuman(faction: Faction, canSubmit: () => boolean = () => true): HumanController {
  if (faction !== 'rome' && faction !== 'carthage') {
    throw new RangeError(`"${String(faction)}" is not one of the two Factions`);
  }

  let selection: Selection = NOTHING_SELECTED;
  const queued: Queued[] = [];
  const groups = new Map<number, readonly number[]>();

  return {
    submit(emitted): boolean {
      if (!canSubmit()) return false;
      const command = validateCommand(emitted);
      if (command.faction !== faction) return false;
      queued.push({ kind: 'command', command });
      return true;
    },
    get selection(): Selection {
      return selection;
    },

    get pending(): number {
      return queued.length;
    },

    select(next: Selection): void {
      selection = { squads: [...next.squads], settlement: next.settlement };
    },

    order(given: Order): boolean {
      if (!canSubmit()) return false;
      const squads = selection.squads;

      if (squads.length === 0) return false;
      if ('x' in given && !isTile(given.x, given.y)) return false;

      queued.push({ kind: 'order', given, squads: [...squads] });

      return true;
    },

    bindGroup(index: number): boolean {
      if (!canSubmit()) return false;
      if (!CONTROL_GROUPS.includes(index)) return false;

      groups.set(index, [...selection.squads]);
      // The binding is a Command as well as a memory: the log has to be able to
      // re-enact the selection, and this is the only vocabulary word that says
      // who was in the group when it was made.
      queued.push({ kind: 'binding', index, squads: [...selection.squads] });

      return true;
    },

    recallGroup(index: number): boolean {
      const held = groups.get(index);
      if (held === undefined) return false;

      selection = { squads: [...held], settlement: null };

      return true;
    },

    groupOf(index: number): readonly number[] {
      return groups.get(index) ?? [];
    },

    decide(observation: Observation<EconomyVisible>): readonly Command[] {
      // The Player's memory against the world it may see: a Squad that has left
      // the field cannot be ordered, and a selection that still named it would
      // send a Command the rules would have to refuse.
      selection = stillHeld(selection, observation.visible.squads.map((squad) => squad.id));
      prune(groups, observation.visible.squads);

      const commands: Command[] = [];
      for (const entry of queued.splice(0, queued.length)) commands.push(...commandsFor(faction, entry));

      return commands;
    },
  };
}

/** The Commands one queued order becomes: one per kind, all addressed to the Controller's Faction. */
function commandsFor(faction: Faction, entry: Queued): readonly Command[] {
  if (entry.kind === 'command') return [entry.command];
  // A group binding is the Player's memory of a selection, and commands
  // nobody: it is emitted as it stands, empty list and all, because an empty
  // group is how one is cleared.
  if (entry.kind === 'binding') return [group(faction, entry.index, entry.squads)];

  if (entry.squads.length === 0) return [];

  switch (entry.given.kind) {
    case 'move':
      return [move(faction, entry.squads, entry.given.x, entry.given.y)];
    case 'attackMove':
      return [attackMove(faction, entry.squads, entry.given.x, entry.given.y)];
    case 'hold':
      return [hold(faction, entry.squads)];
    case 'withdraw':
      return [withdraw(faction, entry.squads)];
    case 'formation':
      return [formation(faction, entry.squads, entry.given.formation)];
  }
}

/** The groups' lists, pruned to the Squads still afield; a group nobody has left is dropped. */
function prune(groups: Map<number, readonly number[]>, squads: readonly VisibleSquad[]): void {
  const held = squads.map((squad) => squad.id);

  for (const [index, ids] of groups) {
    const kept = ids.filter((id) => held.includes(id));
    if (kept.length === 0) groups.delete(index);
    else if (kept.length !== ids.length) groups.set(index, kept);
  }
}

/** Whether a pair of numbers addresses a tile of the theatre. */
function isTile(x: number, y: number): boolean {
  return (
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < MAP_WIDTH && y < MAP_HEIGHT
  );
}
