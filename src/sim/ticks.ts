/**
 * What a whole number of ticks is.
 *
 * The Match counts time in whole ticks and nothing else (`clock.ts`), so every
 * interface that takes a tick or a count of them refuses everything else in the
 * same words: a replay's length, a Command log's stamps, the bound a headless
 * Match runs to. The refusal is loud rather than tolerant on purpose — a caller
 * who hands over half a tick is told which number was wrong, instead of
 * watching a Match quietly not run.
 *
 * The module is small because the rule is small; it is shared because three
 * modules would otherwise each have their own idea of what a tick count is.
 */

/**
 * @param value The candidate count.
 * @param what What to call it in the failure message, e.g. `everyTicks`.
 * @param minimum The smallest count that means anything to the caller.
 * @returns `value`, so a call site can read as an assignment.
 * @throws RangeError when `value` is not a whole number of ticks, or is below
 *   `minimum`.
 */
export function requireTickCount(value: number, what: string, minimum: number): number {
  // `isSafeInteger` rather than `isInteger`: a tick count past 2^53 is a count
  // no Match can reach, and accepting it would turn a bounded run into one that
  // never ends.
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(
      `${what} must be a whole number of ticks, ${minimum} or more, got ${String(value)}`,
    );
  }

  return value;
}
