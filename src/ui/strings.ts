/**
 * The string table: every word a Player reads, in one place (ticket B7, PLAN §2.4).
 *
 * The plan's fourth hard constraint is "code, identifiers, issues and documents
 * in English; player-facing text in Italian, behind a string table with an
 * English fallback path". This module is that table. It exists for a reason that
 * is easy to state and expensive to retrofit: a word typed straight into a HUD
 * module is a word nobody can translate, nobody can find, and nobody can check
 * for consistency with the GLOSSARY's `_UI_` terms — so the interface asks this
 * module for its words and asks it in the game's own vocabulary.
 *
 * ## What a key is
 *
 * A key is a stable, English, dotted name — `ui.treasury`, `resource.grain`,
 * `work.villa` — and a **translation** carries the same text in each language
 * the game speaks. Italian is *required*: it is the language the interface is
 * played in, and a key with no Italian is a blank panel rather than an
 * untranslated one, so `translate` refuses it by name. English is optional, and
 * that is the fallback path the plan asks for: a key that has been added in
 * Italian and not yet translated still reads, in Italian, instead of failing.
 *
 * ## Placeholders
 *
 * A translation may carry `{name}` placeholders, and `message` substitutes them.
 * The set of placeholders is part of the key's contract: `{name}` in Italian and
 * a different name in English would be a bug that only shows in the language
 * nobody is reading, so the table's own test asserts the two languages agree.
 * A value missing at substitution time is refused rather than printed as a hole
 * — a HUD that says `Soldo {payroll}` is worse than one that fails.
 *
 * ## Content ids, and the words for them
 *
 * A Squad type and a building arrive from the simulation as content ids
 * (`hastati`, `villa`), because content is code and code is English (PLAN §2.4).
 * What a Player reads is Italian, so the mapping from id to key lives here, in
 * `squadLabel` and `workLabel`, rather than in the content tables where it would
 * make English data carry Italian words.
 */
import { RESOURCE, type ResourceKind } from '../sim/map.ts';
import type { RouteRefusal } from '../sim/route.ts';
import type { Season } from '../sim/season.ts';

/** The languages the interface can be read in. */
export const LOCALES = ['it', 'en'] as const;

/** One of them. Italian is the game's own language; English is the fallback path. */
export type Locale = (typeof LOCALES)[number];

/** The language the interface reads in until a Player asks for another. */
export const DEFAULT_LOCALE: Locale = 'it';

/** One string in every language it has been written in. Italian is the one that must be there. */
export interface Translation {
  /** The Italian text: the interface's own language, and the fallback for every other. */
  readonly it?: string;

  /** The English text, where it has been written. */
  readonly en?: string;
}

/** A table of keys to translations, which is what `translateIn` walks. */
export type StringTable = Readonly<Record<string, Translation>>;

/**
 * Every word the interface says.
 *
 * The Italian follows the GLOSSARY's `_UI_` terms exactly — `Stagione` and not
 * "turno", `Soldo` and not "mantenimento", `Reparto` and not "unità" — because
 * the glossary is where the vocabulary is decided, and an interface that invents
 * its own synonyms makes the glossary a document nobody uses.
 */
export const STRINGS = {
  // The page itself.
  'ui.title': { it: 'SPQR — Annibale alle porte', en: 'SPQR — Hannibal at the Gates' },
  'ui.bootFailed': { it: 'Avvio fallito: {message}', en: 'Boot failed: {message}' },
  'ui.unknown': { it: 'Sconosciuto', en: 'Unknown' },

  // The readouts.
  'ui.year': { it: 'Anno', en: 'Year' },
  'ui.season': { it: 'Stagione', en: 'Season' },
  'ui.treasury': { it: 'Tesoreria', en: 'Treasury' },

  // The panels.
  'ui.settlements': { it: 'Insediamenti', en: 'Settlements' },
  'ui.squads': { it: 'Reparti', en: 'Squads' },
  'ui.settlement': { it: 'Insediamento', en: 'Settlement' },
  'ui.squad': { it: 'Reparto', en: 'Squad' },
  'ui.stronghold': { it: 'Roccaforte', en: 'Stronghold' },
  'ui.minorSettlement': { it: 'Insediamento minore', en: 'Minor settlement' },
  'ui.tier': { it: 'Livello', en: 'Tier' },
  'ui.type': { it: 'Tipo', en: 'Type' },
  'ui.population': { it: 'Popolazione', en: 'Population' },
  'ui.labour': { it: 'Manodopera', en: 'Labour' },
  'ui.works': { it: 'Cantieri', en: 'Works' },
  'ui.workStanding': { it: 'Completato', en: 'Standing' },
  'ui.workBuilding': { it: 'In costruzione', en: 'Building' },
  'ui.ticksLeft': { it: '{ticks} tick', en: '{ticks} ticks' },
  'ui.men': { it: 'Uomini', en: 'Men' },
  'ui.morale': { it: 'Morale', en: 'Morale' },
  'ui.fatigue': { it: 'Fatica', en: 'Fatigue' },
  'ui.ammunition': { it: 'Munizioni', en: 'Ammunition' },
  'ui.payroll': { it: 'Soldo', en: 'Payroll' },
  'ui.unpaid': { it: 'Soldo arretrato', en: 'Unpaid seasons' },
  'ui.home': { it: 'Insediamento', en: 'Home' },
  'ui.order': { it: 'Ordine', en: 'Order' },
  'order.marching': { it: 'In marcia', en: 'On the march' },
  'order.standing': { it: 'Fermo', en: 'Standing' },
  'order.routing': { it: 'In rotta', en: 'Routing' },
  'refusal.offMap': { it: 'Fuori mappa', en: 'Off the map' },
  'refusal.water': { it: 'Acque profonde', en: 'Deep water' },
  'refusal.unreachable': { it: 'Nessuna via', en: 'No way through' },
  'ui.nothingSelected': { it: 'Nessuna selezione', en: 'Nothing selected' },
  'ui.none': { it: '—', en: '—' },
  'ui.listItem': { it: '{name} {id}', en: '{name} {id}' },

  // The Factions, as a Player reads them.
  'faction.rome': { it: 'Roma', en: 'Rome' },
  'faction.carthage': { it: 'Cartagine', en: 'Carthage' },

  // The Seasons.
  'season.spring': { it: 'Primavera', en: 'Spring' },
  'season.summer': { it: 'Estate', en: 'Summer' },
  'season.autumn': { it: 'Autunno', en: 'Autumn' },
  'season.winter': { it: 'Inverno', en: 'Winter' },

  // The four resources.
  'resource.grain': { it: 'Grano', en: 'Grain' },
  'resource.timber': { it: 'Legname', en: 'Timber' },
  'resource.stone': { it: 'Pietra', en: 'Stone' },
  'resource.iron': { it: 'Ferro', en: 'Iron' },

  // The buildings a settlement raises, by content id.
  'work.farm': { it: 'Fattoria', en: 'Farm' },
  'work.lumberCamp': { it: 'Legnaia', en: 'Lumber camp' },
  'work.quarry': { it: 'Cava', en: 'Quarry' },
  'work.mine': { it: 'Miniera', en: 'Mine' },
  'work.market': { it: 'Mercato', en: 'Market' },
  'work.granary': { it: 'Granaio', en: 'Granary' },
  'work.house': { it: 'Casa', en: 'House' },
  'work.villa': { it: 'Villa', en: 'Villa' },
  'work.forum': { it: 'Foro', en: 'Forum' },
  'work.castrum': { it: 'Castrum', en: 'Camp' },

  // The Squad types, by content id.
  'squad.hastati': { it: 'Astati', en: 'Hastati' },
  'squad.principes': { it: 'Principi', en: 'Principes' },
  'squad.triarii': { it: 'Triarii', en: 'Triarii' },
  'squad.libyanSpear': { it: 'Lancieri libici', en: 'Libyan spearmen' },
  'squad.gaul': { it: 'Galli', en: 'Gauls' },
  'squad.iberianSword': { it: 'Spade iberiche', en: 'Iberian swordsmen' },
  'squad.balearicSlinger': { it: 'Frombolieri balearici', en: 'Balearic slingers' },
  'squad.numidianHorse': { it: 'Cavalleria numidica', en: 'Numidian horse' },
  'squad.elephant': { it: 'Elefanti', en: 'Elephants' },
} as const satisfies StringTable;

/** Every key the table holds, in the order it was written. */
export type StringKey = keyof typeof STRINGS;

/** The keys, as data: the coverage test and an agent inspecting the table both walk this. */
export const STRING_KEYS: readonly StringKey[] = Object.keys(STRINGS) as readonly StringKey[];

/** The Season each one is called. */
const SEASON_KEYS: Readonly<Record<Season, StringKey>> = {
  spring: 'season.spring',
  summer: 'season.summer',
  autumn: 'season.autumn',
  winter: 'season.winter',
};

/** The resource each one is called. */
const RESOURCE_KEYS: Readonly<Record<ResourceKind, StringKey>> = {
  [RESOURCE.grain]: 'resource.grain',
  [RESOURCE.timber]: 'resource.timber',
  [RESOURCE.stone]: 'resource.stone',
  [RESOURCE.iron]: 'resource.iron',
};

/** The building each content id is called. */
const WORK_KEYS: Readonly<Record<string, StringKey>> = {
  farm: 'work.farm',
  'lumber-camp': 'work.lumberCamp',
  quarry: 'work.quarry',
  mine: 'work.mine',
  market: 'work.market',
  granary: 'work.granary',
  house: 'work.house',
  villa: 'work.villa',
  forum: 'work.forum',
  castrum: 'work.castrum',
};

/** The refusal each reason is called, in the order `route.ts` states them. */
const REFUSAL_KEYS: Readonly<Record<RouteRefusal, StringKey>> = {
  'off-map': 'refusal.offMap',
  water: 'refusal.water',
  unreachable: 'refusal.unreachable',
};

/**
 * Why a Squad is not doing what it was told, as a Player reads it.
 *
 * A refused order is the one thing a Squad does that a Player cannot see: the
 * Squad keeps the route it had and stands still, which is indistinguishable from
 * a click that missed (C1). So the reason is a word, and this is the word —
 * `Acque profonde` rather than a Squad that ignores a click.
 */
export function refusalLabel(reason: RouteRefusal): string {
  return translate(REFUSAL_KEYS[reason]);
}

/** The Squad type each content id is called. */
const SQUAD_KEYS: Readonly<Record<string, StringKey>> = {
  hastati: 'squad.hastati',
  principes: 'squad.principes',
  triarii: 'squad.triarii',
  'libyan-spear': 'squad.libyanSpear',
  gaul: 'squad.gaul',
  'iberian-sword': 'squad.iberianSword',
  'balearic-slinger': 'squad.balearicSlinger',
  'numidian-horse': 'squad.numidianHorse',
  elephant: 'squad.elephant',
};

/**
 * The text of one key in one language.
 *
 * @throws Error when the key has no Italian: a key that cannot be read in the
 *   interface's own language is a hole in the interface, and naming it here is
 *   how it gets filled.
 */
export function translate(key: StringKey, locale: Locale = DEFAULT_LOCALE): string {
  return translateIn(STRINGS, key, locale);
}

/**
 * The same reading, against a table a caller supplies.
 *
 * The table is a parameter so that the fallback path can be walked in a test
 * without a half-translated copy of the real one: `translate` is this function
 * with `STRINGS`, and a test hands over two keys instead of two hundred.
 *
 * @throws Error when the key has no Italian.
 */
export function translateIn(table: StringTable, key: string, locale: Locale = DEFAULT_LOCALE): string {
  const translation = table[key];
  const italian = translation?.it;

  if (italian === undefined || italian === '') {
    throw new Error(`the string table has no Italian for "${key}"`);
  }

  const text = translation?.[locale];
  return text === undefined || text === '' ? italian : text;
}

/**
 * The text of one key, with its `{name}` placeholders filled in.
 *
 * @throws Error when the key has no Italian, or when a placeholder has no value:
 *   a missing value is a bug at the call site, and printing the placeholder is
 *   how it reaches a Player instead of a developer.
 */
export function message(
  key: StringKey,
  values: Readonly<Record<string, string | number>> = {},
  locale: Locale = DEFAULT_LOCALE,
): string {
  return substitute(translate(key, locale), values, key);
}

/** Fills the placeholders of one already-translated string. */
function substitute(text: string, values: Readonly<Record<string, string | number>>, key: string): string {
  return text.replace(PLACEHOLDER, (_whole, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new Error(`the string "${key}" needs a value for {${name}}`);
    }

    return String(value);
  });
}

/** `{name}`, where `name` is a letter followed by letters, digits or underscores. */
const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/g;

/** The placeholders a string carries, in the order they appear, repeats included. */
export function placeholders(text: string): readonly string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

/** The Season, as a Player reads it. */
export function seasonLabel(season: Season): string {
  return translate(SEASON_KEYS[season]);
}

/** One of the four resources, as a Player reads it. */
export function resourceLabel(kind: ResourceKind): string {
  return translate(RESOURCE_KEYS[kind]);
}

/** A building, as a Player reads it. An id no table knows reads as `Sconosciuto`. */
export function workLabel(id: string): string {
  const key = WORK_KEYS[id];

  return key === undefined ? translate('ui.unknown') : translate(key);
}

/** A Squad type, as a Player reads it. An id no table knows reads as `Sconosciuto`. */
export function squadLabel(id: string): string {
  const key = SQUAD_KEYS[id];

  return key === undefined ? translate('ui.unknown') : translate(key);
}
