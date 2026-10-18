/**
 * `content/` — Factions, Squad types, buildings and costs, as typed TypeScript
 * data (PLAN §3).
 *
 * No runtime parsing and no fetching: the tables are the source of truth, and
 * the rules read them directly. The directory is fenced as part of the
 * simulation (ADR-0001), so nothing reachable from here may import `pixi.js`,
 * call `Math.random`, or use arithmetic ECMA-262 leaves implementation-
 * approximated (ADR-0006).
 *
 * B6 opened it with the economy's vocabulary: the four resources as content
 * states them, the Squad types a Faction may raise, and the buildings a
 * settlement may raise. C4 fills out the rosters; B7 reads the same tables for
 * the interface, which is why the names live here and not in a rule.
 */
export { amountOf, namedStock, NOTHING, pay, stockAt, stockOf, times } from './resources.ts';
export type { Payment, ResourceAmounts } from './resources.ts';

export { SQUAD_TYPES, squadTypeCode, squadTypeOf, squadTypesOf } from './squads.ts';
export type { SquadType, SquadTypeCode, Tier } from './squads.ts';

export { BUILDINGS, buildingCode, buildingOf } from './buildings.ts';
export type { BuildingCode, BuildingType } from './buildings.ts';
