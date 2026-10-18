/**
 * The two Factions of the war: Rome and Carthage (GLOSSARY: Faction).
 *
 * A Faction is not a Player. A Player is whichever Controller drives a Faction
 * (GLOSSARY: Player), and the two stay apart here for a reason: the Command
 * vocabulary names the Faction that issued a Command, while the driver names
 * the Players that decide, so a Command addressed to the wrong Faction can be
 * refused at the seam instead of being discovered three systems later.
 *
 * The identifier is a word rather than a number. State may hold integers only
 * (ADR-0006), but a Faction is not state: it is what a Controller emits and
 * what a document an external agent reads, and `"rome"` in a JSON line is worth
 * more than `0` with a comment.
 *
 * State does have to hold a Faction somewhere, though — a settlement belongs to
 * one, a Squad belongs to one, and a treasury is one Faction's — so the number a
 * Faction is held as lives here too, beside the word: one place decides what `0`
 * means, so a map's halves (`Half`) and a world's owners cannot come to disagree.
 */

/** One of the two historical Factions a Match pits against each other. */
export type Faction = 'rome' | 'carthage';

/** Both Factions, Rome first, in the order the plan introduces them. */
export const FACTIONS: readonly Faction[] = ['rome', 'carthage'];

/**
 * The number a Faction is held as in state: the index `FACTIONS` keeps it at.
 *
 * Rome is 0 and Carthage is 1, which is also the order the plan introduces them
 * in and the order `map.ts` numbers the halves of the theatre by, so a map's
 * `Half` and a world's owner read as the same number.
 */
export type FactionCode = 0 | 1;

/** The number a Faction is held as. */
export function factionCode(faction: Faction): FactionCode {
  return faction === 'rome' ? 0 : 1;
}

/** The Faction a number names. @throws RangeError when it names no Faction of the two. */
export function factionOf(code: number): Faction {
  const faction = FACTIONS[code];
  if (faction === undefined) throw new RangeError(`${String(code)} is not one of the two Factions`);

  return faction;
}

/**
 * Whether a value that came from outside TypeScript is a Faction.
 *
 * The vocabulary has no third Faction, and this is where that is decided: a
 * Command naming a Faction nobody implements is refused by its own message
 * rather than falling through a `switch`.
 */
export function isFaction(value: unknown): value is Faction {
  return value === 'rome' || value === 'carthage';
}
