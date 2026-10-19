/**
 * The four Seasons an Observation names, as the AI's own closed set.
 *
 * The simulation remains the calendar's owner; this is only the word a policy
 * reads. It is repeated here because the import fence lets the AI take nothing
 * from `sim/` but Observation types, and it is stated once so a misspelt Season
 * is a type error rather than a comparison that silently never matches.
 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
