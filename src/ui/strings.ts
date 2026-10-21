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
  'ui.keyboard': { it: 'F6: controlli. Tab: scegli. Invio: attiva. Esc: torna alla mappa.', en: 'F6: controls. Tab: choose. Enter: activate. Esc: return to the map.' },
  'ui.commandHelp': { it: 'Icone: passa il puntatore o usa F6 per leggere gli ordini.', en: 'Icons: hover or use F6 to read orders.' },
  'ui.commandNow': { it: 'Ordine immediato', en: 'Immediate order' },
  'ui.scaleFitted': { it: 'UI {requested}x > {scale}x', en: 'UI {requested}x > {scale}x' },
  'match.setup': { it: 'Prepara la partita', en: 'Match setup' },
  'match.objective': { it: 'Obiettivo: conquistare la Roccaforte nemica con un Assalto o un Blocco. La partita dura tre anni; se nessuno vince, finisce allo scadere.', en: 'Objective: take the enemy Stronghold by Assault or Blockade. The Match lasts three years; if nobody wins, it ends on the clock.' },
  'match.factionHelp': { it: 'Fazione: Roma schiera fanteria disciplinata; Cartagine mercenari veloci ed elefanti. Cambia i reparti e l\'economia.', en: 'Faction: Rome fields disciplined foot; Carthage fast mercenaries and elephants. It changes the roster and the economy.' },
  'match.difficultyHelp': { it: 'Difficoltà: quanto l\'avversario è rapido e aggressivo. Non cambia mappa, risorse o regole.', en: 'Difficulty: how fast and aggressive the opponent is. It changes no map, resource or rule.' },
  'difficulty.tiro': { it: 'Tiro', en: 'Tiro' },
  'difficulty.centurio': { it: 'Centurio', en: 'Centurio' },
  'difficulty.imperator': { it: 'Imperator', en: 'Imperator' },
  'match.faction': { it: 'Fazione', en: 'Faction' },
  'match.difficulty': { it: 'Difficoltà', en: 'Difficulty' },
  'match.seed': { it: 'Seme', en: 'Seed' },
  'match.seedHint': { it: 'Seme facoltativo: vuoto usa {seed}', en: 'Optional seed: empty uses {seed}' },
  'match.invalidSeed': { it: 'Inserisci un intero da 0 a 4294967295', en: 'Enter an integer from 0 to 4294967295' },
  'match.start': { it: 'Inizia partita', en: 'Start Match' },
  'match.setupHelp': { it: 'Tab: scegli  Frecce: cambia  Invio: conferma. Il seme si digita o si incolla.', en: 'Tab: select  Arrows: change  Enter: confirm. The seed is typed or pasted.' },
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
  // The first-entry guide (U8, Q11): fixed sentences that teach the real acts and
  // read nothing from the Match, so they cannot leak the other Faction's ground.
  'guide.title': { it: 'Guida', en: 'Guide' },
  'guide.step': { it: 'Guida {step}/{total}', en: 'Guide {step}/{total}' },
  'guide.done': { it: 'Guida completata', en: 'Guide complete' },
  'guide.welcomeObjective': { it: 'Obiettivo: conquistare la Roccaforte nemica prima che finiscano i tre anni.', en: 'Objective: take the enemy Stronghold before the three years run out.' },
  'guide.welcomePaused': { it: 'La partita è in pausa. Inizia riprende il tempo; Salta chiude la guida.', en: 'The Match is paused. Begin restarts the clock; Skip closes the guide.' },
  'guide.begin': { it: 'Inizia', en: 'Begin' },
  'guide.skip': { it: 'Salta guida', en: 'Skip guide' },
  'guide.close': { it: 'Chiudi guida', en: 'Close guide' },
  'guide.stronghold': { it: 'Apri la tua Roccaforte: clic sulla struttura sulla mappa, o sulla riga in Insediamenti.', en: 'Open your Stronghold: click the structure on the map, or its row under Settlements.' },
  'guide.recruit': { it: 'Nella scheda Reclutamento scegli un Reparto: il costo è sulle risorse dell\'insediamento.', en: 'On the Recruitment page choose a Squad: its cost is paid from the settlement\'s resources.' },
  'guide.select': { it: 'Seleziona il Reparto: clic sui soldati sulla mappa, o sulla riga in Reparti.', en: 'Select the Squad: click its soldiers on the map, or its row under Squads.' },
  'guide.move': { it: 'Indica una destinazione: clic destro sul terreno, oppure icona Muovi e clic. I comandi sono in basso a destra.', en: 'Give it a destination: right-click the ground, or press the Move icon and click. The Commands sit at the bottom right.' },
  'guide.complete': { it: 'Guida completata. L\'esito dell\'ordine compare sopra i comandi; Spazio ferma e riprende la partita.', en: 'Guide complete. The order\'s result appears above the Commands; Space pauses and resumes the Match.' },
  'ui.smallWindow': { it: 'Consigliata finestra desktop 1280x720. Scorri la pagina per i controlli.', en: 'Desktop window 1280x720 recommended. Scroll the page for controls.' },
  'ui.scaleWarning': { it: 'Scala richiesta troppo grande: adattata alla finestra. La preferenza resta salvata.', en: 'Requested scale too large: fitted to the window. The preference is still saved.' },
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
  'ui.capacity': { it: 'Reclutati', en: 'Recruited' },
  'ui.force': { it: 'Forza', en: 'Force' },
  'ui.recruitCount': { it: 'Reparti', en: 'Squads' },
  'ui.countValue': { it: '{label}: {count}', en: '{label}: {count}' },
  'ui.perSeason': { it: 'per Stagione', en: 'per Season' },
  'ui.recruitNote': {
    it: '{men} x {count} = {total} {menLabel} - {cost} - {payrollLabel} {payroll} {perSeason}',
    en: '{men} x {count} = {total} {menLabel} - {cost} - {payrollLabel} {payroll} {perSeason}',
  },
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
  'refusal.noSpace': { it: 'Spazio insufficiente vicino alla destinazione', en: 'Insufficient space near the destination' },
  'ui.nothingSelected': { it: 'Nessuna selezione', en: 'Nothing selected' },
  'ui.none': { it: '-', en: '-' },
  'ui.listItem': { it: '{name} {id}', en: '{name} {id}' },

  // The rules in words (#66): what the Encyclopedia says about force, the
  // exchange, missiles, a Siege and the roster's own weights. The numbers in
  // these sentences are placeholders filled from the rules themselves
  // (`ui/reference.ts`), so a sentence cannot outlive the rule it describes.
  "category.production": { it: "Produzione", en: "Production" },
  "category.economy": { it: "Economia e scorte", en: "Economy and stocks" },
  "category.development": { it: "Popolazione e sviluppo", en: "Population and development" },
  "category.military": { it: "Supporto militare", en: "Military support" },
  "ref.info": { it: "?", en: "?" },
  "ref.open": { it: "Enciclopedia F1", en: "Encyclopedia F1" },
  "ref.close": { it: "Torna alla partita [Esc]", en: "Return to Match [Esc]" },
  "ref.previous": { it: "Indietro", en: "Previous" },
  "ref.next": { it: "Avanti", en: "Next" },
  "ref.help": { it: "Tab: controlli. Frecce: voci. PagSu/Giu: testo. Esc: ritorna.", en: "Tab: controls. Arrows: entries. PageUp/Down: text. Esc: return." },
  "economy.buildTerms": { it: "Costo iniziale locale: {cost}. Durata con personale: {seconds} s. Lavoratori: {workers}, in costruzione e in esercizio. Richiede livello {tier}; limite {max} per insediamento.", en: "Initial local bill: {cost}. Staffed duration: {seconds} s. Workers: {workers}, during construction and operation. Requires tier {tier}; limit {max} per settlement." },
  "economy.potential": { it: "Produzione potenziale: {yield} per Stagione, dopo il completamento e solo con personale sufficiente.", en: "Potential output: {yield} per Season, after completion and only when staffed." },
  "economy.denarii": { it: "Entrata potenziale: {amount} denari per Stagione alla Tesoreria, solo con personale.", en: "Potential income: {amount} denarii per Season to the Treasury, only when staffed." },
  "economy.housing": { it: "Dal completamento: +{amount} posti abitativi.", en: "On completion: +{amount} housing." },
  "economy.storage": { it: "Dal completamento: +{amount} capacità per ciascuna delle quattro risorse.", en: "On completion: +{amount} capacity for each of the four resources." },
  "economy.progression": { it: "Dal completamento porta al livello {tier}; abilita i reparti della propria fazione tra: {unlocks}.", en: "On completion raises tier to {tier}; unlocks own Faction types among: {unlocks}." },
  "economy.camp": { it: "Solo Roma: quartieri invernali entro {radius} caselle per reparti fermi in posizione.", en: "Rome only: winter quarters within {radius} tiles for Squads holding position." },
  "economy.scope": { it: "Scorte locali / Tesoreria di fazione", en: "Local stocks / Faction Treasury" },
  "economy.scopeBody": { it: "Grano, legname, pietra e ferro appartengono al singolo insediamento e pagano costruzioni e reclutamento lì. I denari sono condivisi nella Tesoreria della fazione e pagano il soldo a ogni Stagione. Limite Tesoreria: {cap}.", en: "Grain, timber, stone and iron belong to each settlement and pay its construction and recruitment. Denarii are shared in the Faction Treasury and pay Payroll each Season. Treasury cap: {cap}." },
  "economy.labourTitle": { it: "Lavoro automatico e giacimenti", en: "Automatic Labour and nodes" },
  "economy.labourBody": { it: "La popolazione lavora automaticamente: prima gli edifici in ordine di costruzione, poi i terreni. Se manca personale per un edificio, questo non costruisce e non produce; si prova il successivo. I lavoratori rimasti si distribuiscono tra le quattro risorse. Un giacimento amplia il terreno lavorabile entro {radius} caselle: è capacità, non una risorsa che si esaurisce.", en: "Population works automatically: buildings in construction order, then land. An understaffed building neither builds nor produces; the next is tried. Remaining workers spread over four resources. A node adds workable land within {radius} tiles: capacity, not a depleting pile." },
  "economy.seasonTitle": { it: "Produzione, consumo e Raccolto", en: "Production, consumption and Harvest" },
  "economy.seasonBody": { it: "Una Stagione dura {seconds} s attivi. Al confine: produzione e limite delle scorte, consumo e crescita, tasse, soldo, rifornimento; poi Raccolto in autunno. Ogni lavoratore sul terreno produce {yield} risorsa per Stagione; in inverno il terreno produce metà, arrotondata in basso. Gli edifici con personale mantengono la resa. Il Raccolto aggiunge {harvest} grano per lavoratore agricolo dopo la crescita e rispetta il limite. Un blocco interrompe produzione, tasse e crescita, ma la popolazione mangia ancora.", en: "A Season lasts {seconds} active seconds. At the boundary: production and storage cap, consumption and growth, tax, Payroll, resupply; then autumn Harvest. Each land worker yields {yield} resource per Season; winter halves land output, rounded down. Staffed buildings keep their output. Harvest adds {harvest} grain per farming worker after growth, capped by storage. A blockade stops production, tax and growth, but people still eat." },
  "economy.populationTitle": { it: "Popolazione, case e magazzini", en: "Population, housing and storage" },
  "economy.populationBody": { it: "Capacità iniziale: {housing} abitanti e {storage} di ogni risorsa. Consumo per Stagione: almeno 1 grano, altrimenti popolazione divisa per {heads}, arrotondata in basso. Con cibo sufficiente e spazio si cresce di {growth}; senza cibo si perde {loss} abitante. Si tassa la popolazione dopo il pasto: 1 denaro ogni {tax} abitanti. Eccedenze oltre la capacità sono perse; il Granaio amplia tutte le risorse.", en: "Base capacity: {housing} people and {storage} of each resource. Seasonal consumption: at least 1 grain, otherwise population divided by {heads}, rounded down. With enough food and room population grows by {growth}; without food loses {loss}. Tax follows feeding: 1 denarius per {tax} people. Excess beyond storage is lost; Granary expands all resources." },
  "economy.assumption": { it: "Condizioni attuali; cantieri esclusi.", en: "Current conditions; unfinished works excluded." },
  "economy.boundary": { it: "Prossima Stagione tra {seconds} s: entrate {income}, soldo {payroll}, Tesoreria {resulting} denari; {unpaid} reparti non pagati. {assumption}", en: "Next Season in {seconds} s: income {income}, Payroll {payroll}, Treasury {resulting} denarii; {unpaid} Squads unpaid. {assumption}" },
  "economy.workProgress": { it: "In costruzione ({seconds} s)", en: "Building ({seconds} s)" },
  "economy.localForecast": { it: "Stima scorte al confine", en: "Boundary stock estimate" },
  "economy.staffing": { it: "Personale edifici: {staffed}/{needed}; abitanti {population}/{housing}; limite scorte {storage} ciascuna.", en: "Building staff: {staffed}/{needed}; population {population}/{housing}; stock cap {storage} each." },
  "ref.commandsTitle": { it: "Ordini e movimento di gruppo", en: "Commands and group movement" },
  "ref.commandsBody": { it: "Seleziona un Reparto o trascina un riquadro. Muovi e Marcia offensiva distribuiscono il gruppo su arrivi legali separati: nei passaggi stretti possono sovrapporsi temporaneamente. Non è una formazione rigida. Attacca richiede un nemico visibile; Ferma mantiene la posizione; Ripiega torna verso casa. Linea e Colonna cambiano lo schieramento. Presidia richiede mura proprie a portata; Assalta e Blocca richiedono un insediamento nemico noto. Costruisci e Recluta usano le scorte del luogo selezionato. Ogni ordine passa dalla stessa coda; in pausa attende la ripresa. Gruppi rapidi da 1 a {groups}, Ctrl+numero per assegnare.", en: "Select a Squad or drag a box. Move and Attack-move distribute groups among separate legal arrivals, with temporary overlap in narrow passages. This is not a rigid formation. Attack needs a visible enemy; Hold keeps position; Withdraw returns home. Line and Column change formation. Garrison requires own walls in reach; Assault and Blockade need a known enemy settlement. Build and Recruit spend selected local stocks. Orders use one queue; while paused they await resumption. Control groups 1 to {groups}, Ctrl+number to bind." },
  "ref.conditionsTitle": { it: "Formazioni, Morale e condizioni", en: "Formations, Morale and conditions" },
  "ref.conditionsBody": { it: "La linea combatte a piena forza; la colonna ne porta un quarto e marcia più rapidamente. Fatica, terreno, fianco e spalle modificano il combattimento. Morale a zero provoca la fuga; il soldo non pagato toglie {loss} Morale per Stagione e può causare diserzione. I missili si riforniscono nel proprio Territorio. Il pannello mostra condizioni attuali e rifiuti individuali: un ordine di gruppo può riuscire solo per alcuni Reparti.", en: "Line fights at full force; Column brings a quarter and marches faster. Fatigue, terrain, flank and rear affect combat. Zero Morale causes routing; unpaid Payroll removes {loss} Morale per Season and can cause desertion. Missiles resupply in own Territory. The panel shows current conditions and individual refusals: a group order may apply only to some Squads." },
  "ref.territoryTitle": { it: "Territorio e inverno", en: "Territory and winter" },
  "ref.territoryBody": { it: "Il Territorio arriva entro {radius} caselle dai propri insediamenti, con prevalenza del più vicino. Fuori si perde il {outside}% degli uomini per Stagione, il {winter}% in inverno; nel proprio Territorio, in inverno senza quartieri, il {field}%. La perdita minima applicata è 1. Presidio o centro di un proprio insediamento danno quartieri; Roma può usare un Castrum entro {camp} caselle, tenendo la posizione.", en: "Territory reaches {radius} tiles from own settlements, nearest taking precedence. Outside, losses are {outside}% each Season, {winter}% in winter; inside in winter without quarters, {field}%. Minimum charged loss is 1. Garrison or own settlement centre gives quarters; Rome can use a Castrum within {camp} tiles while holding." },
  "ref.squadTerms": { it: "{faction}. Livello {tier}. Taglie acquistabili e costo locale: {sizes}. Soldo: {rate} denari ogni {basis} superstiti per Stagione, arrotondato in alto. Peso per uomo: {impact}. {figures}", en: "{faction}. Tier {tier}. Purchasable sizes and local bills: {sizes}. Payroll: {rate} denarii per {basis} survivors per Season, rounded up. Weight per man: {impact}. {figures}" },
  "ref.beast": { it: "Una sola figura di elefante con forza astratta; la taglia non indica più animali.", en: "One elephant figure with abstract strength; size does not mean more animals." },
  "ref.soldiers": { it: "Una figura per superstite; la capacità acquistata resta fissa.", en: "One figure per survivor; purchased capacity stays fixed." },
  'ref.force.title': { it: 'Forza di un Reparto', en: 'A Squad’s force' },
  'ref.force.body': {
    it: 'Un Reparto vale per gli uomini che porta in battaglia, non per il numero di Reparti in cui sono divisi. ' +
      'Si contano in punti-forza, {points} punti per uomo ucciso: un Reparto da {large} uomini ne vale {large}, ' +
      'e cinque Reparti da {small} uomini ne valgono insieme {large}. La colonna porta in battaglia un quarto ' +
      'del suo valore: schierarsi in linea è una decisione, e una colonna sorpresa in mischia vale meno.',
    en: 'A Squad is worth the men it brings to battle, not the number of Squads they are divided into. ' +
      'These are counted in force points, {points} points to a man killed: a {large}-man Squad is worth {large}, ' +
      'and five {small}-man Squads are worth {large} between them. A column brings a quarter of its force: ' +
      'deploying in line is a decision, and a column caught in melee is worth less.',
  },
  'ref.force.points': { it: 'Punti-forza per uomo', en: 'Force points to a man' },
  'ref.force.smallest': { it: 'Reparto più piccolo', en: 'Smallest Squad' },
  'ref.force.largest': { it: 'Reparto più grande', en: 'Largest Squad' },
  'ref.force.column': { it: 'Quarti di forza in colonna', en: 'Quarter of the force in column' },
  'ref.combat.title': { it: 'Lo scontro', en: 'The exchange' },
  'ref.combat.body': {
    it: 'Ogni secondo di mischia contiene {rounds} scontri, e ogni scontro toglie uomini e Morale a entrambe le parti. ' +
      'Il Morale cala di {base} per ogni Reparto attaccato, più {flank} se colpito al fianco e {rear} alle spalle: ' +
      'chi è accerchiato perde il Morale una volta sola, però, non una volta per nemico. ' +
      'Chi resta senza Morale si rompe e fugge verso un proprio insediamento invece di morire fino all’ultimo uomo.',
    en: 'Every second of melee contains {rounds} exchanges, and every exchange takes men and Morale from both sides. ' +
      'Morale falls by {base} for each Squad attacked, plus {flank} if struck in the flank and {rear} from behind: ' +
      'a surrounded body loses Morale once, however, not once per enemy. ' +
      'A Squad that reaches no Morale breaks and runs for one of its own settlements rather than dying to the last man.',
  },
  'ref.combat.base': { it: 'Morale per scontro', en: 'Morale an exchange' },
  'ref.combat.flank': { it: 'Morale in più al fianco', en: 'Extra Morale in the flank' },
  'ref.combat.rear': { it: 'Morale in più alle spalle', en: 'Extra Morale from behind' },
  'ref.missiles.title': { it: 'Missili', en: 'Missiles' },
  'ref.missiles.body': {
    it: 'Un Reparto che porta missili ne lancia una salva per ogni scontro in cui è impegnato, e ogni salva ' +
      'aggiunge uomini uccisi e {shock} Morale a chi la riceve. Le munizioni non tornano: si riforniscono solo ' +
      'in una Stagione passata nel proprio territorio. Contano molto all’inizio e niente alla fine.',
    en: 'A Squad carrying missiles throws one volley for every exchange it is engaged in, and every volley ' +
      'adds men killed and {shock} Morale to whoever takes it. The missiles never come back: they are restocked ' +
      'only by a Season spent inside its own territory. They matter at the start and not at all at the end.',
  },
  'ref.missiles.shock': { it: 'Morale per salva', en: 'Morale a volley' },
  'ref.siege.title': { it: 'Assedio', en: 'Siege' },
  'ref.siege.body': {
    it: 'La guarnigione difende le mura con i suoi uomini: {ram} punti-forza di guarnigione tolgono un punto ' +
      'all’ariete per scontro, e chi sta sotto le mura paga {loss} uomini per ogni {bearing} punti-forza portati. ' +
      'Gli uomini sotto le mura aprono una breccia a {escalade} danni per scontro al massimo, e solo se sono in ' +
      'tanti da poter lavorare. Un blocco affama la piazza di {grain} grano a Stagione, e fino a {cap} volte ' +
      'tanto se chi assedia è più forte di chi difende. Il centro di un insediamento si prende con gli uomini: ' +
      'chi ne ha di più lo tiene, e a parità nessuno lo tiene finché lo scontro non decide.',
    en: 'A garrison holds the walls with its men: {ram} force points of garrison take a point off the ram an ' +
      'exchange, and the men under the walls pay {loss} men for every {bearing} force points they bring. ' +
      'The men at the wall open a breach for at most {escalade} damage an exchange, and only if there are enough ' +
      'of them to work. A blockade starves the town of {grain} grain a Season, and up to {cap} times as much when ' +
      'the besiegers outweigh the defenders. A settlement’s centre is taken with men: the larger body holds it, ' +
      'and at equal strength nobody holds it until the fight decides.',
  },
  'ref.siege.ram': { it: 'Punti-forza per punto d’ariete', en: 'Force points to a point of ram' },
  'ref.siege.escalade': { it: 'Danni alle mura per scontro', en: 'Wall damage an exchange' },
  'ref.siege.loss': { it: 'Uomini persi sotto le mura', en: 'Men lost under the walls' },
  'ref.siege.grain': { it: 'Grano perso per Stagione', en: 'Grain lost a Season' },
  'ref.siege.cap': { it: 'Volte al massimo', en: 'Times at most' },
  'ref.roster.title': { it: 'Il peso di ogni tipo', en: 'Each type’s weight' },
  'ref.roster.body': {
    it: 'La fanteria vale un uomo per uomo. I cavalieri numidi valgono il doppio dei loro uomini, e l’elefante ' +
      'quattro volte i suoi: la sua forza è quella di un reparto molto più numeroso, e per questo è disegnato ' +
      'come una sola figura.',
    en: 'The infantry is worth a man for a man. The Numidian horse is worth twice its men, and the elephant four ' +
      'times its own: its strength is that of a much larger body, which is why it is drawn as a single figure.',
  },

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

  // What the theatre and the journal say about a Squad's condition (#58). The
  // thresholds behind these words are presentation conventions (Q16), not rules.
  'notice.morale': { it: 'Morale basso: {name}', en: 'Low morale: {name}' },
  'notice.fatigue': { it: 'Fatica alta: {name}', en: 'High fatigue: {name}' },
  'notice.ammunition': { it: 'Munizioni esaurite: {name}', en: 'Out of missiles: {name}' },
  'notice.routing': { it: 'In rotta: {name}', en: 'Routing: {name}' },
  'notice.unpaid': { it: 'Soldo non pagato: {name}', en: 'Payroll unpaid: {name}' },
  'notice.seasons': { it: '{count} stagioni', en: '{count} seasons' },
  'notice.supply': { it: 'Fuori rifornimento: {name}', en: 'Out of supply: {name}' },
  'notice.winter': { it: 'Inverno in arrivo', en: 'Winter approaching' },
  'notice.seconds': { it: 'tra {seconds} s', en: 'in {seconds} s' },
  'notice.blockade': { it: 'Blocco su {name}', en: 'Blockade at {name}' },
  'notice.refusal': { it: 'Ordine rifiutato: {name} - {reason}', en: 'Order refused: {name} - {reason}' },
  'notice.engaged': { it: 'A contatto: {name}', en: 'In contact: {name}' },
  'notice.loss': { it: 'Reparto perduto: {name}', en: 'Squad lost: {name}' },
  'notice.siege': { it: 'Assedio su {name}', en: 'Siege at {name}' },
  // How a notice is written: the mark that says whether it is standing or an
  // event, the detail beside it, and the suffix a lost target wears.
  'notice.standing': { it: '! {text}', en: '! {text}' },
  'notice.event': { it: '> {text}', en: '> {text}' },
  'notice.withDetail': { it: '{label}: {detail}', en: '{label}: {detail}' },
  'notice.lostText': { it: '{text} ({lost})', en: '{text} ({lost})' },
  'ui.noticesCount': { it: 'Avvisi ({count})', en: 'Notices ({count})' },
  'ui.noticeClose': { it: 'Chiudi avvisi', en: 'Close notices' },
  'ui.noticeLost': { it: 'Posizione non più nota', en: 'Position no longer known' },

  // The economy's forecast (#58): an estimate, in words that say so, and only
  // when the Season boundary's own order (production, tax, then Payroll) makes it
  // derivable from what the Faction knows.
  'forecast.harvestUnknown': { it: 'Stima scorte autunnali non disponibile: la crescita cambia il personale del Raccolto.', en: 'Autumn stock estimate unavailable: growth changes Harvest staffing.' },
  'forecast.title': { it: 'Stima prossima Stagione', en: 'Next Season estimate' },
  'forecast.net': { it: '{amount} denari', en: '{amount} denarii' },
  'forecast.value': { it: '{net} - {unpaid} ({season})', en: '{net} - {unpaid} ({season})' },
  'forecast.unpaid': { it: '{count} reparti non pagati', en: '{count} Squads unpaid' },
  'forecast.none': { it: 'tutti pagati', en: 'all paid' },
  'forecast.unavailable': { it: 'Non disponibile: {reason}', en: 'Not available: {reason}' },
  'forecast.blockaded': { it: 'insediamento bloccato', en: 'a settlement is blockaded' },
  'forecast.season': { it: 'al confine di {season}', en: 'at the {season} boundary' },

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
  'no-space': 'refusal.noSpace',
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
