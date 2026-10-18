/**
 * Pacing: the three speeds a Match runs at, the pause, and the orders given in it.
 *
 * A Match's time is whole ticks (`clock.ts`), and nothing here touches them. The
 * pace is a property of the *driver* — how much wall time a tick costs — and it
 * never enters state or the state hash, so a Match paused for a minute and one
 * that ran straight through are the same Match on the same tick (ADR-0006). What
 * `ticksFor` returns is how many ticks the host loop should step; the loop is
 * still the only thing that steps them.
 *
 * The pause exists so a Player can think without being punished for thinking: a
 * paused loop steps no ticks, and the orders given meanwhile are held and applied
 * on the first tick after the resume, in the order they were given. Holding them
 * is `PausableController`'s job rather than the driver's, because the driver
 * knows nothing about a pause — it is handed a Controller and asks it for
 * Commands, and a Controller that is holding some is simply one that returns
 * them a tick later.
 *
 * The queue belongs to the Controller that wrapped the Player, not to the Match:
 * a shared queue would let one Player's wrapper emit the other Faction's
 * Commands, and the driver would refuse them at the seam instead of applying
 * them where they belong.
 */
import { validateCommand, type Command } from './command.ts';
import { TICK_MS } from './clock.ts';
import type { Controller } from './controller.ts';

/** The speeds a Match can run at: real time, twice, three times. */
export type Speed = 1 | 2 | 3;

/** Every speed, slowest first, in the order a menu would offer them. */
export const SPEEDS: readonly Speed[] = [1, 2, 3];

/** The speed a Match runs at until someone asks for another. */
export const NORMAL_SPEED: Speed = 1;

/** Whether a value that came from outside TypeScript is one of the three speeds. */
export function isSpeed(value: unknown): value is Speed {
  return typeof value === 'number' && (SPEEDS as readonly number[]).includes(value);
}

/**
 * A Controller whose Player can give orders while the Match is paused.
 *
 * It is a Controller like any other — the driver cannot tell the difference, and
 * does not need to — with the two additions a paused Player needs: `order` to
 * issue a Command directly, and `queued` to see how many are waiting.
 */
export interface PausableController<Visible> extends Controller<Visible> {
  /** How many Commands are waiting for the next tick the Match decides. */
  readonly queued: number;

  /**
   * Issues one Command: applied on the next tick the Match decides, or held
   * until the Match resumes if it is paused.
   *
   * @throws CommandValidationError when the value is not a Command in the
   *   vocabulary. Ownership is the driver's check when the Command is emitted:
   *   this much is only "is it a Command at all", refused where it was given.
   */
  order(command: Command): void;
}

/**
 * How a Match is being played: its speed, its pause, and the Controllers built
 * on it.
 *
 * One of these belongs to one Match. `pause` and `resume` are the Match's, so
 * both Players stop together, while the Commands a pause holds stay with the
 * Player that gave them.
 */
export interface Pacing {
  /** The current speed: 1x, 2x or 3x. */
  readonly speed: Speed;

  /** Whether the Match is paused. A paused loop steps no ticks. */
  readonly paused: boolean;

  /**
   * Changes the speed, taking effect on the next reading of elapsed time.
   *
   * @throws RangeError when the value is not one of the three speeds.
   */
  setSpeed(speed: Speed): void;

  /** Stops the clock. Idempotent: pausing a paused Match does nothing. */
  pause(): void;

  /** Restarts the clock, releasing the orders the pause held. Idempotent. */
  resume(): void;

  /**
   * How many whole ticks this much elapsed wall time is worth at the current
   * speed, carrying the remainder into the next reading.
   *
   * Zero while paused: the time spent thinking is not banked and then replayed
   * as a burst of ticks, which is what a real pause means.
   *
   * @throws RangeError when the elapsed time is not a finite, non-negative
   *   number of milliseconds.
   */
  ticksFor(elapsedMs: number): number;

  /** Wraps a Controller so that what it decides while paused is held, not lost. */
  wrap<Visible>(inner: Controller<Visible>): PausableController<Visible>;
}

/** A tick with no Commands on it, so a held queue that is empty allocates nothing. */
const NO_COMMANDS: readonly Command[] = [];

/**
 * Starts a Match's pacing at a speed, unpaused.
 *
 * @throws RangeError when the speed is not one of the three.
 */
export function createPacing(speed: Speed = NORMAL_SPEED): Pacing {
  let current = requireSpeed(speed);
  let paused = false;

  // Wall time owed to the Match but not yet a whole tick. Derived, never state:
  // it is a display concern and does not reach the state hash (ADR-0006).
  let owedMs = 0;

  return {
    get speed(): Speed {
      return current;
    },

    get paused(): boolean {
      return paused;
    },

    setSpeed(next: Speed): void {
      current = requireSpeed(next);
    },

    pause(): void {
      paused = true;
    },

    resume(): void {
      paused = false;
    },

    ticksFor(elapsedMs: number): number {
      requireElapsed(elapsedMs);
      if (paused) return 0;

      owedMs += elapsedMs * current;

      const ticks = Math.floor(owedMs / TICK_MS);
      owedMs -= ticks * TICK_MS;

      return ticks;
    },

    wrap<Visible>(inner: Controller<Visible>): PausableController<Visible> {
      return pausable(inner, () => paused);
    },
  };
}

/**
 * A Controller that holds what it is given until the Match is running again.
 *
 * While paused, `decide` still asks the wrapped Controller what it wants — a
 * Player may think and look at the world — but what comes back is queued and
 * nothing is returned to the driver. On the first tick after the resume, the
 * whole queue is emitted at once, before anything decided on that tick, so the
 * log says when the orders took effect and not when they were thought of.
 */
function pausable<Visible>(
  inner: Controller<Visible>,
  isPaused: () => boolean,
): PausableController<Visible> {
  const waiting: Command[] = [];

  return {
    get queued(): number {
      return waiting.length;
    },

    order(command: Command): void {
      waiting.push(validateCommand(command));
    },

    decide(observation): readonly Command[] {
      waiting.push(...inner.decide(observation));

      if (isPaused()) return NO_COMMANDS;

      // `splice` on the whole length rather than reassigning: a Player holding a
      // reference to the array it was handed cannot watch it change later.
      return waiting.splice(0, waiting.length);
    },
  };
}

/**
 * @throws RangeError when the value is not one of the three speeds.
 */
function requireSpeed(speed: number): Speed {
  if (!isSpeed(speed)) {
    throw new RangeError(
      `a speed must be one of ${SPEEDS.map((value) => `${value}x`).join(', ')}, got ${String(speed)}`,
    );
  }

  return speed;
}

/**
 * @throws RangeError when the elapsed time is not a finite, non-negative number
 *   of milliseconds.
 */
function requireElapsed(elapsedMs: number): void {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new RangeError(
      `elapsed time must be a finite number of milliseconds, 0 or more, got ${String(elapsedMs)}`,
    );
  }
}
