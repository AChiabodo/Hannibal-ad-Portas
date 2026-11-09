/**
 * What `--help` looks like: the aligned option lines every command prints.
 *
 * Every command in `cli/` lays its options out the same way — a flag padded to a
 * column, then its description; a wrapped line starting where that description
 * starts — and the column differs per command because the flags do. The three
 * commands that have options had each written the same two functions out, which
 * is three places to change the day the layout does; this is the one place.
 *
 * It is the shape of a *usage text* and nothing else. What goes into a line, what
 * a flag means, and which flags a command has are that command's business:
 * `arguments.ts`, `agent-arguments.ts` and `tournament-arguments.ts` each own
 * their own `--help`, from their own tables.
 */

/** The two spaces before a flag, and the gap between it and its description. */
export const FLAG_INDENT = 2;

/**
 * One option as `--help` prints it.
 *
 * @param column The column every description in this usage starts at.
 * @param flag The flag as a reader types it, e.g. `--seed <n>`.
 * @param description What it does, in one line.
 */
export function optionAt(column: number, flag: string, description: string): string {
  return `${' '.repeat(FLAG_INDENT)}${flag.padEnd(column - FLAG_INDENT)}${description}`;
}

/**
 * A line continuing the option above it, starting where that option's
 * description starts.
 *
 * @param column The same column the option above it was printed with.
 * @param text The rest of the description.
 */
export function continuationAt(column: number, text: string): string {
  return `${' '.repeat(column)}${text}`;
}
