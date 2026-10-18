/**
 * The four resources, as content states them (GLOSSARY: Resource node).
 *
 * `map.ts` already numbers the four resources, because the map is state and
 * state holds integers (`RESOURCE`). Content is not state — it is the typed
 * table the rules read — so it can afford the names, and this module is the one
 * place that decides how a named basket of grain, timber, stone and iron reads
 * beside the numbered stock a settlement holds.
 *
 * The conversion is not decoration: a building's cost and a settlement's stock
 * are the same four quantities, and the rules compare them every time someone
 * builds something. If each call site did its own lookup, the day a fifth
 * resource arrived the ones that were not updated would silently read zero.
 */
import { RESOURCE, RESOURCE_KINDS, type ResourceKind } from '../sim/map.ts';

/** How much of each resource something costs, yields or houses. */
export interface ResourceAmounts {
  readonly grain: number;
  readonly timber: number;
  readonly stone: number;
  readonly iron: number;
}

/** Nothing of each: an empty cost, an empty yield. */
export const NOTHING: ResourceAmounts = { grain: 0, timber: 0, stone: 0, iron: 0 };

/** The field a resource kind is read from, in `RESOURCE_KINDS` order. */
const KIND_FIELDS: Readonly<Record<ResourceKind, keyof ResourceAmounts>> = {
  [RESOURCE.grain]: 'grain',
  [RESOURCE.timber]: 'timber',
  [RESOURCE.stone]: 'stone',
  [RESOURCE.iron]: 'iron',
};

/**
 * How much of one resource an amount carries.
 *
 * A total `Record`, so a `ResourceKind` always addresses a field and the answer
 * is never `undefined`; the four keys above are exhaustive by the type.
 */
export function amountOf(amounts: ResourceAmounts, kind: ResourceKind): number {
  return amounts[KIND_FIELDS[kind]];
}

/** How much of one resource a stock holds. A stock is indexed by `RESOURCE`. */
export function stockAt(stock: readonly number[], kind: ResourceKind): number {
  return stock[kind] ?? 0;
}

/** A stock with all four cells set: what `createEconomy` writes a settlement's opening stock as. */
export function stockOf(amounts: ResourceAmounts): number[] {
  return RESOURCE_KINDS.map((kind) => amountOf(amounts, kind));
}

/**
 * What paying a cost out of a stock would leave, or that it cannot be paid.
 *
 * A union rather than a pair of fields, because "can I afford this" and "what do
 * I have left" must never disagree: a caller that checked one and then computed
 * the other itself is exactly how a settlement ends up with negative timber.
 * There is no remainder to read from a payment that did not happen.
 */
export type Payment =
  | { readonly affordable: false }
  | { readonly affordable: true; readonly remaining: readonly number[] };

/**
 * Pays a cost out of a stock, or reports that it cannot.
 *
 * The stock is a plain array because that is how settlement state holds it; the
 * cost is named because that is how content writes it. The answer is a fresh
 * array, so the caller decides whether to keep the old stock — nothing here
 * mutates what it was handed, and a whole number is never left negative.
 */
export function pay(stock: readonly number[], cost: ResourceAmounts): Payment {
  const remaining = RESOURCE_KINDS.map((kind) => stockAt(stock, kind) - amountOf(cost, kind));
  if (remaining.some((left) => left < 0)) return { affordable: false };

  return { affordable: true, remaining };
}

/** A stock indexed by `RESOURCE`, read back as the named amounts content writes. */
export function namedStock(stock: readonly number[]): ResourceAmounts {
  return {
    grain: stockAt(stock, RESOURCE.grain),
    timber: stockAt(stock, RESOURCE.timber),
    stone: stockAt(stock, RESOURCE.stone),
    iron: stockAt(stock, RESOURCE.iron),
  };
}

/** A cost paid `count` times, so a Recruit of several Squads is priced in one place. */
export function times(cost: ResourceAmounts, count: number): ResourceAmounts {
  return {
    grain: cost.grain * count,
    timber: cost.timber * count,
    stone: cost.stone * count,
    iron: cost.iron * count,
  };
}
