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
  'match.setup': { it: 'Prepara la partita', en: 'Match setup' },
  'match.objective': { it: 'Conquista la Roccaforte nemica. La partita dura tre anni.', en: 'Take the enemy Stronghold. The Match lasts three years.' },
  'difficulty.tiro': { it: 'Tiro', en: 'Tiro' },
  'difficulty.centurio': { it: 'Centurio', en: 'Centurio' },
  'difficulty.imperator': { it: 'Imperator', en: 'Imperator' },
  'match.faction': { it: 'Fazione', en: 'Faction' },
  'match.difficulty': { it: 'Difficoltà', en: 'Difficulty' },
  'match.seed': { it: 'Seme', en: 'Seed' },
  'match.seedHint': { it: 'Seme facoltativo: vuoto usa {seed}', en: 'Optional seed: empty uses {seed}' },
  'match.invalidSeed': { it: 'Inserisci un intero da 0 a 4294967295', en: 'Enter an integer from 0 to 4294967295' },
  'match.start': { it: 'Inizia partita', en: 'Start Match' },
  'match.setupHelp': { it: 'Tab: scegli  Frecce: cambia  Invio: conferma', en: 'Tab: select  Arrows: change  Enter: confirm' },
  'match.restart': { it: 'Ricomincia', en: 'Restart' },
  'match.new': { it: 'Nuova partita', en: 'New Match' },
  'match.copy': { it: 'Copia seme', en: 'Copy seed' },
  'match.copied': { it: 'Seme copiato', en: 'Seed copied' },
  'match.copyFailed': { it: 'Copia non disponibile: {seed}', en: 'Copy unavailable: {seed}' },
  'match.leave': { it: 'Abbandonare la partita in corso?', en: 'Leave the active Match?' },
  'match.ended': { it: 'PARTITA CONCLUSA', en: 'MATCH ENDED' },
  'match.victory': { it: 'VITTORIA', en: 'VICTORY' },
  'match.defeat': { it: 'SCONFITTA', en: 'DEFEAT' },
  'match.clock': { it: 'Conclusi i tre anni della partita', en: 'The three Match years have elapsed' },
  'match.draw': { it: 'Partita conclusa senza vincitore', en: 'Match ended without a winner' },
  'match.annihilation': { it: 'La Fazione sconfitta non ha insediamenti né reparti', en: 'The defeated Faction has no settlements or Squads left' },
  'match.stronghold': { it: 'Roccaforte {id} conquistata: {path}', en: 'Stronghold {id} taken: {path}' },
  'match.assault': { it: 'assalto', en: 'assault' },
  'match.blockade': { it: 'blocco', en: 'blockade' },
  'match.finalKnown': { it: 'Puoi esplorare la situazione finale conosciuta', en: 'You can inspect the final known situation' },
  'match.speed': { it: 'Velocità {speed}x', en: 'Speed {speed}x' },
  'ui.speed': { it: '{speed}x', en: '{speed}x' },
  'ui.speedCurrent': { it: '{speed}x*', en: '{speed}x*' },
  'match.restartControl': { it: 'Ricomincia [F2]', en: 'Restart [F2]' },
  'match.newControl': { it: 'Nuova [F3]', en: 'New [F3]' },
  'match.copyControl': { it: 'Copia [F4]', en: 'Copy [F4]' },
  // The page itself.
  'ui.title': { it: 'SPQR — Annibale alle porte', en: 'SPQR — Hannibal at the Gates' },
  'ui.bootFailed': { it: 'Avvio fallito: {message}', en: 'Boot failed: {message}' },
  'ui.unknown': { it: 'Sconosciuto', en: 'Unknown' },

  // The readouts.
  'ui.openGuide': { it: 'Mostra guida', en: 'Show guide' },
  'ui.hideGuide': { it: 'Nascondi guida', en: 'Hide guide' },
  'ui.options': { it: 'Opzioni / UI {scale}x', en: 'Options / UI {scale}x' },
  'ui.closeOptions': { it: 'Chiudi opzioni', en: 'Close options' },
  'ui.selectEntity': { it: 'Seleziona un insediamento o un reparto.', en: 'Select a settlement or Squad.' },
  'ui.seasonProgress': { it: 'Stagione: {progress}%', en: 'Season: {progress}%' },
  'ui.hideNavigator': { it: 'Nascondi lista', en: 'Hide list' },
  'ui.showNavigator': { it: 'Apri lista', en: 'Open list' },
  'ui.center': { it: 'Centra [F]', en: 'Centre [F]' },
  'ui.scale': { it: 'Scala UI: {scale}x', en: 'UI scale: {scale}x' },
  'ui.reset': { it: 'Ripristina UI', en: 'Reset UI' },
  'ui.guide': { it: 'Guida', en: 'Guide' },
  'ui.navigationGuide': { it: 'Lista: clic seleziona; doppio clic / F centra. Minimappa: clic o trascina. Comandi: icona e nome, tasto in alto a destra; clic destro muove.', en: 'List: click to select; double-click / F to centre. Minimap: click or drag. Commands: icon and name, key at the top right; right-click moves.' },
  'ui.smallWindow': { it: 'Consigliata finestra desktop 1280x720. Scorri la pagina per i controlli.', en: 'Desktop window 1280x720 recommended. Scroll the page for controls.' },
  'ui.scaleWarning': { it: 'Scala richiesta troppo grande: scorri la pagina o cambia scala UI.', en: 'Requested scale too large: scroll the page or change UI scale.' },
  'ui.year': { it: 'Anno', en: 'Year' },
  'ui.season': { it: 'Stagione', en: 'Season' },
  'ui.treasury': { it: 'Tesoreria', en: 'Treasury' },
  'ui.paused': { it: 'IN PAUSA', en: 'PAUSED' },
  'ui.running': { it: 'IN CORSO', en: 'RUNNING' },
  'ui.pause': { it: 'Pausa [Spazio]', en: 'Pause [Space]' },
  'ui.resume': { it: 'Riprendi [Spazio]', en: 'Resume [Space]' },
  'ui.previous': { it: 'Su', en: 'Up' },
  'ui.next': { it: 'Giù', en: 'Down' },
  'ui.listCount': { it: '{name}: {count}', en: '{name}: {count}' },

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
  'ui.none': { it: '-', en: '-' },
  'ui.listItem': { it: '{name} {id}', en: '{name} {id}' },

  // The contextual actions (#55): the verbs a Player can give and, beside them,
  // the key that gives it. A label and a shortcut are separate so that a button
  // can say `Fermo [S]` without the key becoming part of the word.
  'cmd.move': { it: 'Muovi', en: 'Move' },
  'cmd.attackMove': { it: "Marcia d'attacco", en: 'Attack-move' },
  'cmd.attack': { it: 'Attacca', en: 'Attack' },
  'cmd.hold': { it: 'Fermo', en: 'Hold' },
  'cmd.withdraw': { it: 'Ritirata', en: 'Withdraw' },
  'cmd.line': { it: 'Linea', en: 'Line' },
  'cmd.column': { it: 'Colonna', en: 'Column' },
  'cmd.garrison': { it: 'Guarnigione', en: 'Garrison' },
  'cmd.assault': { it: 'Assalto', en: 'Assault' },
  'cmd.blockade': { it: 'Blocco', en: 'Blockade' },
  'cmd.groupBack': { it: 'Torna al gruppo', en: 'Back to group' },
  'cmd.withShortcut': { it: '{label} [{keys}]', en: '{label} [{keys}]' },

  // The one word under a command icon: the full sentence would not fit a card,
  // and a Player reads the picture first and the word as confirmation.
  'cmdShort.move': { it: 'Muovi', en: 'Move' },
  'cmdShort.attackMove': { it: 'Marcia', en: 'March' },
  'cmdShort.attack': { it: 'Attacca', en: 'Attack' },
  'cmdShort.hold': { it: 'Fermo', en: 'Hold' },
  'cmdShort.withdraw': { it: 'Ritirata', en: 'Withdraw' },
  'cmdShort.line': { it: 'Linea', en: 'Line' },
  'cmdShort.column': { it: 'Colonna', en: 'Column' },
  'cmdShort.garrison': { it: 'Guarnigione', en: 'Garrison' },
  'cmdShort.assault': { it: 'Assalto', en: 'Assault' },
  'cmdShort.blockade': { it: 'Blocco', en: 'Blockade' },
  'ui.commands': { it: 'Comandi', en: 'Commands' },
  'ui.groups': { it: 'Gruppi', en: 'Control groups' },
  'ui.group': { it: 'Gruppo {index}', en: 'Group {index}' },
  'ui.groupMembers': { it: '{count} reparti: {composition}', en: '{count} Squads: {composition}' },
  'ui.composition': { it: 'Composizione', en: 'Composition' },
  'ui.compositionItem': { it: '{name} {count}', en: '{name} {count}' },
  'ui.costItem': { it: '{name} {amount}', en: '{name} {amount}' },
  'ui.groupChip': { it: '{index} {composition}', en: '{index} {composition}' },
  'ui.menTotal': { it: 'Uomini totali', en: 'Total men' },
  'ui.moraleRange': { it: 'Morale {low}-{high}', en: 'Morale {low}-{high}' },
  'ui.exceptions': { it: 'Eccezioni', en: 'Exceptions' },
  'ui.exception': { it: '{name}: {reason}', en: '{name}: {reason}' },
  'ui.armed': { it: 'Mira: {name}', en: 'Armed: {name}' },
  'ui.pending': { it: 'In attesa: {count}', en: 'Pending: {count}' },
  'ui.pendingPaused': { it: 'In attesa: {count} (in pausa)', en: 'Pending: {count} (paused)' },
  'ui.submitted': { it: 'Inviato: {name}', en: 'Submitted: {name}' },
  'ui.refusedOrder': { it: 'Rifiutato: {reason}', en: 'Refused: {reason}' },
  'ui.unavailable': { it: '{name}: {reason}', en: '{name}: {reason}' },
  'ui.partial': { it: '{near} su {total} a portata', en: '{near} of {total} in reach' },
  'ui.destination': { it: 'Destinazione', en: 'Destination' },
  'ui.supply': { it: 'Approvvigionamento', en: 'Supply' },
  'supply.inTerritory': { it: 'In territorio', en: 'In territory' },
  'supply.outside': { it: 'Fuori territorio', en: 'Outside territory' },
  'ui.quarters': { it: "Quartieri d'inverno", en: 'Winter quarters' },
  'quarters.camp': { it: 'Accampato', en: 'In camp' },
  'quarters.field': { it: 'In campo', en: 'In the field' },
  'ui.engaged': { it: 'A contatto', en: 'Engaged' },
  'ui.yes': { it: 'Sì', en: 'Yes' },
  'ui.no': { it: 'No', en: 'No' },
  'ui.garrisonAt': { it: 'Guarnigione {id}', en: 'Garrison {id}' },
  'ui.labourAuto': { it: 'Manodopera automatica', en: 'Automatic labour' },
  'ui.buildTime': { it: 'Tempo', en: 'Time' },
  'ui.workProgress': { it: 'In costruzione ({ticks} tick)', en: 'Building ({ticks} ticks)' },
  'ui.requirements': { it: 'Requisiti', en: 'Requirements' },
  'ui.tierRequired': { it: 'Livello {tier}', en: 'Tier {tier}' },
  'tab.overview': { it: 'Panoramica', en: 'Overview' },
  'tab.construction': { it: 'Costruzione', en: 'Construction' },
  'tab.recruitment': { it: 'Reclutamento', en: 'Recruitment' },

  // Why a Command is not on offer: the words a button says instead of pressing.
  'reason.noSquads': { it: 'Seleziona almeno un reparto', en: 'Select at least one Squad' },
  'reason.ended': { it: 'La partita è finita', en: 'The Match has ended' },
  'reason.noEnemy': { it: 'Nessun nemico in vista', en: 'No enemy in sight' },
  'reason.noOwnWalls': { it: 'Nessun tuo insediamento murato conosciuto', en: 'No own walled settlement known' },
  'reason.noEnemyWalls': { it: 'Nessun insediamento nemico con mura conosciute', en: 'No enemy walled settlement known' },
  'reason.noEnemySettlement': { it: 'Nessun insediamento nemico conosciuto', en: 'No enemy settlement known' },
  'reason.noRam': { it: "Solo Roma ha l'ariete", en: 'Only Rome has the ram' },
  'reason.tier': { it: 'Serve il livello {tier}', en: 'Needs tier {tier}' },
  'reason.cost': { it: 'Risorse insufficienti', en: 'Not enough resources' },
  'reason.maxWorks': { it: 'Massimo raggiunto', en: 'Maximum reached' },

  // What an armed action is waiting for.
  'target.ground': { it: 'Clicca il terreno', en: 'Click the ground' },
  'target.enemy': { it: 'Clicca un reparto nemico in vista', en: 'Click an enemy Squad in sight' },
  'target.settlement': { it: 'Clicca un insediamento sulla mappa o in lista', en: 'Click a settlement on the map or in the list' },
  'target.ownSettlement': { it: 'Clicca un tuo insediamento', en: 'Click one of your settlements' },
  'target.enemySettlement': { it: 'Clicca un insediamento nemico conosciuto', en: 'Click a known enemy settlement' },
  'target.ownWalled': { it: 'Clicca un tuo insediamento murato', en: 'Click one of your walled settlements' },

  // What is known of a fortification, and only what is known (ADR-0020).
  'ui.walls': { it: 'Mura', en: 'Walls' },
  'ui.gate': { it: 'Porta', en: 'Gate' },
  'ui.breach': { it: 'Breccia', en: 'Breach' },
  'ui.wallStanding': { it: 'In piedi ({hp})', en: 'Standing ({hp})' },
  'ui.wallBroken': { it: 'Rotta', en: 'Broken' },
  'ui.wallsStanding': { it: '{standing}/{total} in piedi', en: '{standing}/{total} standing' },
  'ui.breached': { it: 'Sì', en: 'Yes' },
  'ui.ram': { it: 'Ariete', en: 'Ram' },
  'ui.ramNone': { it: 'Nessuno', en: 'None' },
  'ui.ramBuilding': { it: 'In costruzione ({ticks} tick)', en: 'Building ({ticks} ticks)' },
  'ui.ramBuilt': { it: 'Costruito ({hp})', en: 'Built ({hp})' },
  'ui.besieger': { it: 'Assediante', en: 'Besieger' },
  'ui.siegePath': { it: "Via d'assedio", en: 'Siege path' },
  'ui.garrisonCount': { it: 'Presidio', en: 'Garrison' },
  'ui.frontUnknown': { it: 'Fortificazioni non note', en: 'Fortifications unknown' },

  // A place the Faction knows but does not hold: what is seen, and what is only
  // remembered (U6, GLOSSARY: Last known contact).
  'ui.siteState': { it: 'Stato', en: 'State' },
  'ui.inSight': { it: 'In vista', en: 'In sight' },
  'ui.lastKnown': { it: 'Ultimo contatto noto', en: 'Last known contact' },
  'ui.holder': { it: 'Titolare', en: 'Holder' },
  'ui.unclaimed': { it: 'Nessuno', en: 'Nobody' },

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
