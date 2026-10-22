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
  'economy.balanceTitle': { it: 'Bilancio stagionale', en: undefined },
  'economy.worksTitle': { it: 'Edifici e lavoro', en: undefined },
  'economy.compactPeople': { it: '{population}/{housing} | Lavoratori edifici {staffed}/{needed}', en: undefined },
  'economy.stockPair': { it: '{first}/{capacity} | {name} {second}/{capacity}', en: undefined },
  'economy.treasuryChange': { it: '{current} > {next} denari (stima)', en: undefined },
  'economy.balance': { it: '+{income} denari; soldo -{payroll} (fazione)', en: undefined },
  'economy.localIncome': { it: 'Da questo insediamento', en: undefined },
  'forecast.unpaidLabel': { it: 'Reparti senza soldo', en: undefined },
  'economy.people': { it: '{population}/{housing} abitanti', en: undefined },
  'economy.staff': { it: '{staffed}/{needed} negli edifici; {land} ai terreni', en: undefined },
  'economy.staffTitle': { it: 'Lavoratori', en: undefined },
  'economy.landTitle': { it: 'Lavoro sui terreni', en: undefined },
  'economy.stocksTitle': { it: 'Scorte locali', en: undefined },
  'economy.commonTreasury': { it: 'Tesoreria comune', en: undefined },
  'economy.incomeTitle': { it: 'Entrate', en: undefined },
  'economy.income': { it: '{income} denari da questo luogo per stagione (stima)', en: undefined },
  'economy.active': { it: 'In attività', en: undefined },
  'economy.unstaffed': { it: 'Senza personale', en: undefined },
  'economy.stalled': { it: 'Cantiere fermo: manca personale', en: undefined },
  'economy.localStock': { it: '{amount} / {capacity}', en: undefined },
  'economy.noOffers': { it: 'Cartagine non costruisce Castrum. Per i quartieri d\'inverno usa i tuoi insediamenti.', en: undefined },
  'ref.section.start': { it: 'Primi passi', en: undefined },
  'capture.label': { it: 'Controllo del centro', en: undefined },
  'capture.control': { it: '{hold}/{total} verifiche consecutive', en: undefined },
  'capture.rediscover': { it: 'Riesplora il luogo: la situazione attuale è sconosciuta.', en: undefined },
  'capture.instructions': { it: 'Come catturarlo', en: undefined },
  'capture.quick': { it: 'Seleziona un reparto, poi Muovi o clic destro sul luogo. Deve fermarsi sulla casella centrale: essere vicino non basta. Servono {holds} verifiche, una ogni {seconds} secondi di gioco. In pausa il conto è fermo. Un reparto in rotta non cattura; se perdi il centro il conto riparte. Il luogo conquistato compare nella tua lista Insediamenti.', en: undefined },
  'capture.help': { it: 'Guida alla cattura [F1]', en: undefined },
  'hud.localStocks': { it: 'Scorte di {name}', en: undefined },
  'hud.calendar': { it: 'Anno {year} - {season} {progress}%', en: undefined },
  'hud.pace': { it: '{state} / {speed}x', en: undefined },
  'pause.open': { it: 'Menu [Esc]', en: undefined },
  'pause.finished': { it: 'CONCLUSA', en: undefined },
  'pause.title': { it: 'Partita in pausa', en: undefined },
  'pause.resume': { it: 'Riprendi partita', en: undefined },
  'pause.restart': { it: 'Ricomincia questa partita [F2]', en: undefined },
  'pause.new': { it: 'Nuova partita [F3]', en: undefined },
  'pause.copy': { it: 'Copia il seme della mappa [F4]', en: undefined },
  'pause.speed': { it: 'Velocità di gioco: {speed}x{selected}', en: undefined },
  'pause.settings': { it: 'Impostazioni', en: undefined },
  'pause.back': { it: 'Torna al menu', en: undefined },
  'pause.navigator': { it: 'Lista insediamenti e reparti: {state}', en: undefined },
  'pause.on': { it: 'visibile', en: undefined },
  'pause.off': { it: 'nascosta', en: undefined },
  'layout.sidebar': { it: 'B - Laterale', en: undefined },
  'layout.dock': { it: 'A - Orizzontale', en: undefined },
  'layout.compact': { it: 'C - Compatta', en: undefined },
  'ui.panelLayout': { it: 'Pannello: {layout}', en: undefined },
  'category.short.production': { it: 'Produzione', en: undefined },
  'category.short.economy': { it: 'Scorte', en: undefined },
  'category.short.development': { it: 'Sviluppo', en: undefined },
  'category.short.military': { it: 'Militare', en: undefined },
  'panel.bill': { it: 'Costo locale: {bill}', en: undefined },
  'panel.staff': { it: '{seconds} s; {workers} lavoratori durante e dopo.', en: undefined },
  'panel.yield': { it: 'Con personale: {yield} per stagione.', en: undefined },
  'panel.denarii': { it: '+{amount} denari per stagione con personale.', en: undefined },
  'panel.housing': { it: '+{amount} posti abitativi al completamento.', en: undefined },
  'panel.storage': { it: '+{amount} capacità per ciascuna risorsa.', en: undefined },
  'panel.tier': { it: 'Sblocca livello {tier} al completamento.', en: undefined },
  'panel.camp': { it: 'Quartieri invernali per Roma; non sblocca reparti.', en: undefined },
  'panel.limits': { it: 'Richiede livello {tier}; limite {max}.', en: undefined },
  'panel.balance': { it: 'Bilancio', en: undefined },
  'panel.works': { it: 'Lavoro', en: undefined },
  'ui.inspectHelp': { it: 'Scegli una proposta per leggere costi ed effetti.', en: undefined },
  'ui.purchase': { it: 'Costruisci', en: undefined },
  'ui.purchaseRecruit': { it: 'Recluta', en: undefined },
  'ui.shortDetails': { it: 'Dettagli [F1]', en: undefined },
  'ui.fullDetails': { it: 'Spiegazione completa [F1]', en: undefined },
  'ui.closeInspection': { it: 'Chiudi dettagli', en: undefined },
  'tab.short.overview': { it: 'Sintesi', en: undefined },
  'tab.short.construction': { it: 'Edifici', en: undefined },
  'tab.short.recruitment': { it: 'Recluta', en: undefined },
  'ref.capture.title': { it: 'Cattura e luoghi neutrali', en: undefined },
  'ref.capture.body': { it: "Un insediamento neutrale non appartiene a nessuna fazione. Prima devi scoprirlo esplorando; poi seleziona un tuo reparto e usa Muovi, oppure il clic destro, sul disegno del luogo: il comando punta alla sua casella centrale. Arrivare soltanto nelle vicinanze non basta.\n\nSe il luogo non ha mura, non serve dichiarare Assalto o Blocco. Mantieni il centro per {holds} verifiche consecutive: una verifica avviene ogni {seconds} secondi di gioco. Il conto dipende dal momento della prossima verifica, non dal tempo trascorso dal clic. In pausa il conto non avanza.\n\nConta la forza dei reparti presenti sul centro, non il loro numero. A parità di forza nessuna fazione prende il luogo; chi ha più forza può conquistarlo. Un reparto in rotta non contribuisce. Se perdi il controllo del centro, il progresso viene azzerato. Se ci sono mura, occorre prima aprire una breccia.\n\nQuando il luogo passa alla tua fazione compare nella lista Insediamenti. Puoi usare le sue scorte locali per costruire o reclutare; le sue entrate alimentano la Tesoreria comune. Il suo territorio arriva fino a {territory} caselle, salvo la contesa con altri insediamenti: diventa quindi una base per rifornire i reparti in avanzata.\n\nE gli accampamenti?\nIl Castrum è un edificio romano dentro un insediamento, non un obiettivo indipendente. Si conquista il luogo che lo contiene, non la singola tenda. Un Castrum conquistato non dà a Cartagine i quartieri invernali romani. I luoghi neutrali senza mura si occupano tenendo il centro come descritto sopra. Nel pannello del luogo trovi Controllo del centro e il pulsante Guida alla cattura.", en: undefined },
  'ref.exploration.title': { it: 'Come esplorare la mappa', en: undefined },
  'ref.exploration.body': { it: "Recluta un reparto, selezionalo e indica un punto sulla mappa con il clic destro o con Muovi. Avvicinandosi a terreno sconosciuto il reparto lo rende visibile: vede fino a {squad} caselle intorno a sé; i tuoi insediamenti vedono fino a {settlement}. Non esiste un ordine separato Esplora e non devi inviare lavoratori.\n\nLa parte nera non è ancora stata esplorata. Il terreno già scoperto resta noto anche quando il reparto si allontana, ma vedere la mappa non significa vedere ancora il nemico. In vista indica dati attuali; Ultimo contatto noto è un ricordo e può essere superato.\n\nUsa la rotella sulla mappa per lo zoom e trascina con il tasto destro per spostare la visuale. Un clic sulla minimappa sposta soltanto la visuale: non conquista terreno e non esplora da solo. Centra [F] riporta la visuale al reparto selezionato.\n\nProcedi per tratti e controlla gli Avvisi di contatto. Marcia d'attacco avanza cercando il combattimento; Muovi serve allo spostamento. L'esplorazione può scoprire luoghi neutrali, ma per possederli devi occupare il loro centro.\n\nTieni una via di rientro: un esploratore lontano dal tuo territorio resta soggetto a soldo, attrito e inverno. Tornare su terreno già esplorato non equivale a rientrare nei rifornimenti: conta il territorio della tua fazione.", en: undefined },
  'ref.supply.title': { it: 'Rifornimenti dei reparti', en: undefined },
  'ref.supply.body': { it: "Il rifornimento dipende dal territorio, non da carovane o da un pulsante. Un reparto è rifornito quando si trova nel territorio della propria fazione: fino a {territory} caselle dai tuoi insediamenti, considerando le zone contese. Nella scheda del reparto leggi Approvvigionamento: In territorio oppure Fuori territorio.\n\nMunizioni\nAl cambio di stagione le munizioni dei reparti nel tuo territorio tornano alla dotazione iniziale del loro tipo. Non basta fermarsi per qualche secondo: devi essere in territorio al momento del cambio. Fuori territorio non ricevi nuove salve. I tipi che partono senza munizioni non ne acquistano grazie al rifornimento.\n\nUomini e morale\nGli uomini perduti non vengono rimpiazzati automaticamente, neppure in guarnigione. Tornare a casa non riporta il reparto alla taglia acquistata. Fuori territorio perdi {outside}% degli uomini per stagione, {winter}% in inverno, con almeno una perdita quando si applica attrito; perdi inoltre {morale} morale al cambio di stagione.\n\nDenari e riparo sono problemi distinti\nIl soldo viene pagato dalla Tesoreria comune anche se il reparto è lontano. Essere rifornito non significa avere denari sufficienti per pagarlo. In inverno, anche nel tuo territorio, il campo aperto costa {field}% degli uomini: servono quartieri invernali, in un tuo insediamento o per Roma presso un Castrum completato.\n\nPrima di partire controlla quindi tre cose: soldo sostenibile, tempo alla prossima stagione e un insediamento amico dove rientrare. Conquistare un luogo neutrale può estendere il territorio e consentire il rifornimento più avanti.", en: undefined },
  'ref.interface.title': { it: 'Schermata e controlli', en: undefined },
  'ref.interface.body': { it: "In alto trovi stagione, Tesoreria, pausa e velocità. La lista a sinistra seleziona insediamenti e reparti; Nascondi lista libera spazio sulla mappa. Centra [F] riporta la visuale alla selezione. La minimappa sposta la visuale con un clic; non rivela i nemici nascosti.\n\nSulla mappa, trascina con il tasto destro per spostare la visuale e usa la rotella per lo zoom. Un clic destro senza trascinare ordina invece il movimento ai reparti selezionati. Shift+clic aggiunge o toglie un reparto; trascinare con il tasto sinistro seleziona un gruppo.\n\nLeggere gli acquisti\nLe icone accanto ai numeri indicano grano, legname, pietra e ferro; la clessidra indica secondi, l'uomo la taglia e la moneta il soldo per stagione. Nei reclutamenti i costi sono totali per il numero di reparti scelto con + e -. Un lucchetto indica un acquisto non disponibile: selezionalo per leggere il motivo. Seleziona una proposta per leggerne i dettagli; Costruisci o Recluta conferma l'acquisto. Dettagli [F1] apre la spiegazione completa. In Menu [Esc] > Impostazioni puoi scegliere B - Laterale, A - Orizzontale o C - Compatta; la scelta viene salvata.\n\nSe una lista non entra, usa Su e Giù o la rotella sopra il pannello. F6 entra nei controlli, Tab passa al successivo, Shift+Tab torna indietro, Invio attiva. Esc apre il menu di pausa; al suo interno torna indietro o lo chiude mantenendo la selezione. Gli ordini in pausa si applicano alla ripresa con Spazio.\n\nF1 apre l'Enciclopedia e ferma il tempo. A sinistra scegli una sezione e una voce: il contatore mostra quante altre voci esistono. Altre voci cambia la lista; Pagina dopo cambia il testo. Frecce su/giù cambiano voce, PagSu/PagGiù cambiano pagina. Esc torna alla stessa partita, mantenendo la selezione e la pausa precedente.", en: undefined },
  'ref.visibility.title': { it: 'Esplorazione e contatti', en: undefined },
  'ref.visibility.body': { it: "La mappa distingue tre situazioni: terreno mai esplorato, terreno esplorato ma ora fuori vista e terreno attualmente visibile. Esplora con i reparti per trovare strade e insediamenti; vedere un luogo in passato non significa sapere cosa vi accade adesso.\n\nIn vista indica informazioni attuali. Ultimo contatto noto indica invece un ricordo: il titolare o le difese possono essere cambiati. I reparti nemici fuori vista non sono un elenco aggiornato delle forze avversarie. Non interpretare l'assenza di un nemico visibile come la certezza che la strada sia libera.\n\nPuoi indicare un insediamento conosciuto come obiettivo di Assalto o Blocco, ma Attacca richiede un reparto nemico visibile. Per avanzare senza conoscere la posizione dei nemici usa Marcia d'attacco.\n\nGli Avvisi segnalano contatti e problemi dei tuoi reparti. Apri l'elenco e seleziona una voce per raggiungere il luogo pertinente. Una stima economica descrive le tue informazioni attuali: non prevede eserciti nascosti, soccorsi o conquiste future.", en: undefined },
  'ref.section.economy': { it: 'Economia', en: undefined },
  'ref.section.buildings': { it: 'Edifici', en: undefined },
  'ref.section.army': { it: 'Esercito', en: undefined },
  'ref.section.war': { it: 'Guerra e territorio', en: undefined },
  'ref.topicRange': { it: 'Voci {first}-{last}/{total}', en: undefined },
  'ref.topicsPrevious': { it: 'Voci prima', en: undefined },
  'ref.topicsNext': { it: 'Altre voci', en: undefined },
  'ref.pagePrevious': { it: 'Pagina prima', en: undefined },
  'ref.pageNext': { it: 'Pagina dopo', en: undefined },
  'ref.topics': { it: 'In questa sezione', en: undefined },
  'ref.page': { it: 'Pagina {page}/{total}', en: undefined },
  'ref.start.title': { it: 'La tua prima campagna', en: undefined },
  'ref.start.body': { it: 'Devi conquistare la Roccaforte nemica prima che finiscano i tre anni della campagna. Per riuscirci ti servono un insediamento che sostenga la guerra, un esercito pagato e una strada sicura verso il nemico.\n\nApri la tua Roccaforte con un clic sulla mappa o nella lista Insediamenti. In Panoramica controlla grano, popolazione e lavoratori; apri Bilancio stagionale per le stime e Edifici e lavoro per le attività in corso; in Costruzione scegli cosa migliorare; in Reclutamento acquista i primi reparti. Le spese usano le scorte di quel luogo.\n\nNon spendere tutto subito. La produzione arriva al cambio di stagione e ogni nuovo edificio sottrae persone al lavoro nei campi. Confronta il soldo dei reparti con le entrate prima di allargare l\'esercito.\n\nSeleziona i soldati e indica una destinazione con il clic destro. Avanza verso gli insediamenti minori per ampliare il tuo territorio, osserva il nemico e prepara l\'assedio della sua Roccaforte. Non basta arrivare alle mura: scegli Assalto o Blocco.\n\nUsa Spazio per fermare il tempo mentre decidi. Gli ordini dati in pausa attendono la ripresa. F1 apre questa guida e sospende la partita; Esc ti riporta alla stessa selezione e ripristina la pausa precedente.', en: undefined },
  'ref.choices.title': { it: 'Cosa costruire per primo?', en: undefined },
  'ref.choices.body': { it: 'Parti dal problema che vuoi risolvere. Il grano sta calando? Controlla quante persone lavorano nei campi e valuta una Fattoria. Ti manca legname per costruire? Una Legnaia può aiutare, ma assorbirà altri lavoratori.\n\nSe gli abitanti hanno raggiunto i posti disponibili, costruisci una Casa e conserva cibo per farli crescere. Una Casa amplia lo spazio: non porta subito nuovi abitanti.\n\nSe le scorte si fermano al limite, un Granaio conserva più risorse. Se invece mancano denari per il soldo, valuta un Mercato: aumenta le entrate, non vende le tue merci.\n\nVilla e Foro aprono i livelli successivi e nuovi reparti. Prima di investirci, assicurati di poter sostenere sia il loro personale sia il soldo dei soldati che vuoi reclutare. Una costruzione avanzata troppo presto può lasciare fermi altri edifici.\n\nPillola di economia\nNon aprire tutti i cantieri insieme. Costruisci per uno scopo, lascia passare una stagione e osserva come cambiano le scorte. La crescita del tuo esercito deve seguire quella delle entrate.', en: undefined },
  'ref.latin.title': { it: 'Pillole di economia latina', en: undefined },
  'ref.latin.body': { it: 'A Roma il bilancio deve accompagnare la crescita delle legioni. Un reparto grande concentra più uomini, ma costa più risorse subito e più soldo ogni stagione: guarda la taglia, non soltanto il nome.\n\nPrima di ampliare l\'esercito, confronta le entrate dei tuoi insediamenti con il soldo totale. Conserva una riserva di denari per gli imprevisti e grano per la popolazione. Reclutare non sottrae abitanti: il suo costo pesa sulle scorte e sul soldo futuro.\n\nSviluppare non significa produrre di più\nLa Villa richiede {villa} lavoratori e il Foro {forum}, anche dopo il completamento. Aprono nuovi livelli, ma possono togliere personale a campi e attività. Cresci con Case e cibo prima di affrettare entrambi.\n\nIl Castrum prepara l\'inverno\nÈ un edificio romano: quando è completato, offre quartieri ai reparti romani fermi entro {camp} caselle. Non è una caserma e non sblocca reclutamenti. Usa il riparo per affrontare la stagione fredda senza consumare uomini in campo aperto.', en: undefined },
  'ref.punic.title': { it: 'Economia cartaginese', en: undefined },
  'ref.punic.body': { it: 'Cartagine usa le stesse regole di Roma per campi, edifici ordinari, crescita e tasse. Il Mercato non ha un commercio speciale e non puoi trasferire merci tra insediamenti: controlla le scorte del luogo in cui vuoi reclutare.\n\nIl bilancio cambia con l\'esercito\nLancieri, Galli e specialisti hanno prezzi e soldo diversi. Un acquisto accessibile può diventare impegnativo da pagare ogni stagione. Confronta le schede dei reparti, tieni una riserva di denari e non confondere la figura di un elefante con un solo uomo da mantenere.\n\nScegli quando avanzare di livello\nLa Villa apre Spade iberiche e Frombolieri balearici; il Foro permette Cavalleria numidica ed Elefanti. I lavoratori richiesti sono gli stessi di Roma: se li sottrai troppo presto alla raccolta, rischi di non avere le scorte per usare i nuovi reclutamenti.\n\nPrepara un rientro per l\'inverno\nCartagine non costruisce Castrum. Porta i reparti al centro di un tuo insediamento o dentro una guarnigione prima dell\'inverno. Un esercito lontano dal territorio può perdere uomini e morale anche senza combattere.', en: undefined },
  'ref.treasury.title': { it: 'Denari e soldo', en: undefined },
  'ref.treasury.body': { it: 'Grano, legname, pietra e ferro restano nel singolo insediamento. I denari, invece, confluiscono in una Tesoreria comune: le entrate di un villaggio possono pagare reparti reclutati altrove.\n\nA ogni cambio di stagione ricevi prima le entrate, poi paghi il soldo. Le tasse valgono un denaro ogni {tax} abitanti, contando la popolazione dopo il pasto e l\'eventuale crescita; Mercati e Foro aggiungono le proprie entrate se hanno personale. La Tesoreria può contenere fino a {cap} denari.\n\nIl soldo dipende dal tipo di reparto e dai superstiti, con arrotondamento in alto. I reparti vengono pagati nell\'ordine di reclutamento: se non puoi pagarne uno, i successivi meno costosi possono ancora ricevere il soldo. Chi resta senza perde {loss} punti di morale e può disertare se il morale arriva a zero.\n\nLeggere la stima\nIl conto della prossima stagione assume che la situazione resti quella attuale e non aggiunge gli effetti dei cantieri ancora incompleti. Nuovi ordini, conquiste, perdite e completamenti possono cambiarlo. Durante un Blocco la stima non è disponibile: non usarla come una promessa di entrate.', en: undefined },
  'ref.grain': { it: 'Il grano nutre la popolazione ed entra nel costo dei reclutamenti. Prima di comprare soldati, conserva ciò che servirà al prossimo pasto: senza cibo perdi abitanti e quindi anche lavoratori.\n\nI campi producono a ogni stagione, le Fattorie aggiungono grano se hanno personale e in autunno arriva il Raccolto. Il Granaio aumenta lo spazio per le scorte: non produce cibo. Una guarnigione assediata dipende anch\'essa dalle riserve del luogo.', en: undefined },
  'ref.timber': { it: 'Il legname serve ad avviare i cantieri. Non entra nel costo dei reclutamenti. È una scorta da pianificare: spendere l\'ultimo legname può impedirti di costruire proprio la Legnaia o la Casa di cui hai bisogno.\n\nLo ottieni dal lavoro automatico sul terreno e dalle Legnaie con personale. Un bosco o un giacimento amplia il terreno lavorabile; non devi mandare manualmente un reparto a raccogliere.', en: undefined },
  'ref.stone': { it: 'La pietra serve per Case, magazzini, Mercati e sviluppo dell\'insediamento. Conservala se vuoi raggiungere il livello successivo: Villa e Foro richiedono un investimento consistente.\n\nArriva dal terreno lavorato e dalle Cave con personale. Una Cava è utile quando la pietra limita i tuoi piani; se aprirla sottrae troppi abitanti ai campi, risolvi prima il problema del cibo e della popolazione.', en: undefined },
  'ref.iron': { it: 'Il ferro serve ai reclutamenti che lo richiedono e alla costruzione del Foro. Può diventare il vincolo dell\'esercito avanzato anche quando hai grano e denari.\n\nUna Miniera produce ferro con personale; i giacimenti aumentano la capacità del terreno vicino. Il ferro non si esaurisce sulla mappa: è il numero di lavoratori disponibili a limitare quanto ne entra nelle scorte.', en: undefined },
  'ref.sizeBill': { it: '{size} uomini: {cost}. Soldo {payroll} denari per stagione.', en: undefined },
  'ref.beastBill': { it: 'Un elefante, forza {size}: {cost}. Soldo {payroll} denari per stagione.', en: undefined },
  'ref.unit.hastati': { it: 'La prima linea romana è disponibile fin dall\'inizio. Gli Astati ti permettono di difendere la Roccaforte e iniziare ad avanzare senza aspettare una Villa. Scegli una taglia che il bilancio possa sostenere e schierali in linea prima della mischia.', en: undefined },
  'ref.unit.principes': { it: 'I Principi sono una linea romana più salda, disponibile dopo lo sviluppo al livello 2. Valuta il loro costo insieme a quello della Villa: aprire il reclutamento non basta, servono ancora scorte per acquistarlo e denari per pagarlo.', en: undefined },
  'ref.unit.triarii': { it: 'I Triarii sono i veterani armati di lancia del livello 3. Resistono con morale elevato e la lancia ha vantaggio contro la cavalleria. Preparali quando la tua economia sostiene lo sviluppo fino al Foro e il loro soldo.', en: undefined },
  'ref.unit.libyan': { it: 'I Lancieri libici formano una linea cartaginese disponibile dal livello 1. La lancia è adatta a contrastare la cavalleria; evita di lasciarli aggirare e confronta il loro soldo con quello delle altre truppe prima di reclutarne molti.', en: undefined },
  'ref.unit.gauls': { it: 'I Galli offrono fanteria da mischia fin dall\'inizio. Il morale più fragile richiede attenzione: cerca un vantaggio locale, proteggi i fianchi e non confondere il costo iniziale con la capacità di sostenere uno scontro lungo.', en: undefined },
  'ref.unit.iberian': { it: 'Gli Iberici sono la fanteria con spada del livello 2 cartaginese. Affiancali alle altre truppe dopo aver costruito una Villa, valutando quanto soldo aggiungono al totale dell\'esercito.', en: undefined },
  'ref.unit.balearic': { it: 'I Frombolieri balearici portano salve pesanti negli scontri. Non sono una linea da lasciare sola contro la cavalleria: proteggili con la fanteria e osserva le munizioni, che si riforniscono nel tuo territorio al cambio di stagione.', en: undefined },
  'ref.unit.numidian': { it: 'La Cavalleria numidica muove più rapidamente della fanteria ed è utile per aggirare e raggiungere posizioni scoperte. Il reparto ha pochi cavalieri: non sprecarli contro le lance o in una mischia frontale prolungata.', en: undefined },
  'ref.unit.elephant': { it: 'Un Elefante è una sola bestia con forza astratta e grande peso nello scontro. La sua figura non rappresenta un soldato economico: controlla il costo e il soldo prima di acquistarlo. Disponibile al livello 3 cartaginese.', en: undefined },
  'building.advice.farm': { it: 'Costruisci una Fattoria se il cibo limita crescita e reclutamento. Mantiene la propria resa anche in inverno, ma impiega persone che smetteranno di raccogliere sul terreno.', en: undefined },
  'building.advice.lumber-camp': { it: 'La Legnaia sostiene una fase di nuove costruzioni. Valuta quanto legname ti serve e conserva abbastanza abitanti per raccogliere anche cibo e altre risorse.', en: undefined },
  'building.advice.quarry': { it: 'La Cava aiuta quando la pietra frena Case, magazzini e sviluppo. Non costruirla soltanto perché è disponibile: i suoi lavoratori vengono sottratti al terreno.', en: undefined },
  'building.advice.mine': { it: 'La Miniera prepara i reclutamenti che consumano ferro e la costruzione del Foro. È impegnativa per il personale: controlla che restino abitanti per le altre attività.', en: undefined },
  'building.advice.market': { it: 'Il Mercato aiuta a pagare il soldo: versa denari nella Tesoreria comune. Non compra o vende risorse e non sposta scorte tra villaggi. Costruiscilo quando le entrate non tengono il passo con l\'esercito.', en: undefined },
  'building.advice.granary': { it: 'Il Granaio conserva più grano, legname, pietra e ferro. Conviene prima che il Raccolto o altre entrate superino il limite delle scorte. Non produce grano; la capacità aggiunta resta anche senza personale, una volta completato.', en: undefined },
  'building.advice.house': { it: 'La Casa offre spazio per nuovi abitanti senza richiedere lavoratori. Conviene quando la popolazione è vicina al limite; per riempirla servono tempo e cibo. Non aumenta subito la popolazione.', en: undefined },
  'building.advice.villa': { it: 'La Villa porta l\'insediamento al livello 2, amplia case e scorte e apre nuovi reclutamenti. I suoi lavoratori restano impegnati dopo il completamento: prepara una popolazione sufficiente prima di costruirla.', en: undefined },
  'building.advice.forum': { it: 'Il Foro porta al livello 3 e, con personale, aggiunge denari. È un investimento per i reparti avanzati, non una scorciatoia per produrre di più: la sua richiesta di lavoratori può lasciare ferme altre attività.', en: undefined },
  'building.advice.castrum': { it: 'Il Castrum aiuta Roma a preparare i quartieri d\'inverno intorno all\'insediamento. Offre anche un piccolo sostegno a cibo, abitazioni e scorte. Non sblocca reparti: il reclutamento dipende dal livello del luogo.', en: undefined },
  'ui.keyboard': { it: 'F6: controlli. Tab: scegli. Invio: attiva. Esc: menu di pausa.', en: 'F6: controls. Tab: choose. Enter: activate. Esc: return to the map.' },
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
  "ref.help": { it: "Tab: scegli. Frecce: voci. PagSu/Giu: testo. Esc: torna.", en: undefined },
  "economy.buildTerms": { it: "Il progetto\nCosto: {cost}, dalle scorte di questo insediamento.\nDurata: {seconds} s con tutto il personale.\nLavoratori: {workers}, sia durante i lavori sia dopo.\nRichiede livello {tier}; limite {max} per insediamento.", en: undefined },
  "economy.potential": { it: "Cosa ottieni\nFino a {yield} per stagione, dal completamento e con personale sufficiente. Non include ciò che gli stessi lavoratori avrebbero raccolto sul terreno.", en: undefined },
  "economy.denarii": { it: "Con personale, versa {amount} denari per stagione nella Tesoreria comune, dal primo cambio di stagione dopo il completamento.", en: undefined },
  "economy.housing": { it: "Al completamento offre spazio per altri {amount} abitanti. La popolazione crescerà se avrà cibo.", en: undefined },
  "economy.storage": { it: "Al completamento conserva altri {amount} di ciascuna risorsa, non soltanto grano.", en: undefined },
  "economy.progression": { it: "Sviluppo\nAl completamento raggiungi il livello {tier}. Nuove possibilità, secondo la fazione: {unlocks}.", en: undefined },
  "economy.camp": { it: "Quartieri invernali\nIl Castrum completato protegge i reparti romani fermi entro {radius} caselle. Non sblocca reclutamenti.", en: undefined },
  "economy.scope": { it: "Scorte locali / Tesoreria di fazione", en: "Local stocks / Faction Treasury" },
  "economy.scopeBody": { it: "Grano, legname, pietra e ferro appartengono al singolo insediamento e pagano costruzioni e reclutamento lì. I denari sono condivisi nella Tesoreria della fazione e pagano il soldo a ogni Stagione. Limite Tesoreria: {cap}.", en: "Grain, timber, stone and iron belong to each settlement and pay its construction and recruitment. Denarii are shared in the Faction Treasury and pay Payroll each Season. Treasury cap: {cap}." },
  "economy.labourTitle": { it: "Chi lavora e dove", en: undefined },
  "economy.labourBody": { it: "Non devi assegnare i lavoratori: gli abitanti si dividono automaticamente tra edifici e terreno. Gli edifici hanno precedenza, nell'ordine in cui li hai avviati, e trattengono il personale anche quando sono completati.\n\nSe un edificio non riceve tutti i lavoratori richiesti, il suo cantiere si ferma e non produce. Il personale rimasto viene offerto agli edifici successivi, poi distribuito tra grano, legname, pietra e ferro sul terreno. Puoi acquistare un cantiere anche senza personale sufficiente, ma resterà in attesa.\n\nI giacimenti entro {radius} caselle aumentano il terreno lavorabile. Non si esauriscono e non richiedono ordini di raccolta. Avere molto terreno non serve se tutti gli abitanti sono impegnati negli edifici.\n\nPillola di economia\nUn nuovo edificio non è tutto guadagno: confronta la sua resa con ciò che raccoglievano le persone che impiegherà. Per aumentare il lavoro disponibile servono più abitanti, quindi spazio e cibo.", en: undefined },
  "economy.seasonTitle": { it: "Il ritmo delle stagioni", en: undefined },
  "economy.seasonBody": { it: "Le scorte non aumentano continuamente. Ogni stagione dura {seconds} secondi di gioco alla velocità normale; pause e Enciclopedia fermano il tempo. Guarda il conto alla rovescia per sapere quando arriveranno le prossime entrate.\n\nAl cambio di stagione entrano i prodotti degli edifici con personale e del terreno, entro il limite dei magazzini. Poi gli abitanti mangiano e, se possono, crescono. Si raccolgono le tasse e si paga il soldo. Seguono i rifornimenti; in autunno si aggiunge il Raccolto.\n\nOgni lavoratore sul terreno produce {yield} risorsa per stagione. In inverno questa produzione si dimezza, arrotondando in basso per risorsa; gli edifici con personale mantengono la propria resa. Il Raccolto autunnale aggiunge {harvest} grano per lavoratore agricolo, contando il personale dopo la crescita.\n\nPrima dell'inverno\nConserva grano e prepara i quartieri per l'esercito. Il Raccolto può riempire i magazzini, ma ciò che supera il limite va perso. Durante un Blocco l'insediamento non produce, non riscuote tasse e non cresce, mentre gli abitanti continuano a mangiare.", en: undefined },
  "economy.populationTitle": { it: "Cibo, abitanti e magazzini", en: undefined },
  "economy.populationBody": { it: "Un insediamento parte con spazio per {housing} abitanti e {storage} di ogni risorsa. Le Case aumentano lo spazio abitativo; il Granaio amplia tutti i magazzini. Costruirli non crea da solo cibo o nuovi abitanti.\n\nA ogni cambio di stagione gli abitanti consumano un grano ogni {heads} persone, arrotondando in basso, con un minimo di un grano. Per crescere di {growth} abitante serve spazio e deve restare nelle scorte almeno un'altra razione dopo il pasto. Se manca la prima razione, perdi {loss} abitante, senza scendere sotto uno.\n\nEsempio pratico\nCon dieci abitanti servono due grani per il pasto e altri due devono restare per consentire la crescita. Spendere il grano per reclutare può quindi rallentare lo sviluppo, anche senza causare fame.\n\nDopo il pasto e la crescita incassi un denaro ogni {tax} abitanti. Le risorse oltre la capacità del magazzino sono perse quando arriva la produzione: costruisci spazio prima di riempirlo.", en: undefined },
  "economy.assumption": { it: "Condizioni attuali; cantieri esclusi.", en: "Current conditions; unfinished works excluded." },
  "economy.boundary": { it: "Prossima Stagione tra {seconds} s: entrate {income}, soldo {payroll}, Tesoreria {resulting} denari; {unpaid} reparti non pagati. {assumption}", en: "Next Season in {seconds} s: income {income}, Payroll {payroll}, Treasury {resulting} denarii; {unpaid} Squads unpaid. {assumption}" },
  "economy.workProgress": { it: "In costruzione: {seconds} s con personale", en: undefined },
  "economy.localForecast": { it: "Alla prossima stagione", en: undefined },
  "economy.staffing": { it: "Personale edifici: {staffed}/{needed}; abitanti {population}/{housing}; limite scorte {storage} ciascuna.", en: "Building staff: {staffed}/{needed}; population {population}/{housing}; stock cap {storage} each." },
  "ref.commandsTitle": { it: "Ordini e movimento", en: "Commands and group movement" },
  "ref.commandsBody": { it: "Seleziona un reparto con un clic sui soldati o nella lista; trascina un riquadro per selezionarne più di uno. Il clic destro indica dove muoversi. Muovi sposta, Marcia d'attacco avanza cercando il combattimento, Attacca sceglie un nemico visibile.\n\nUn ordine di gruppo assegna ai reparti arrivi separati vicino alla destinazione. Nei passaggi stretti possono sovrapporsi per un tratto: non avanzano come un'unica formazione rigida. Se manca spazio, leggi i rifiuti dei singoli reparti.\n\nFermo mantiene la posizione; Ritirata torna verso casa. Usa Linea prima dello scontro e Colonna per disporre i soldati in profondità. La formazione non cambia la velocità di movimento. Guarnigione porta i soldati dentro mura proprie a portata. Assalto e Blocco indicano come affrontare un insediamento nemico conosciuto.\n\nPer agire sull'economia seleziona invece un insediamento: Costruisci e Recluta spendono le sue scorte. In pausa gli ordini attendono la ripresa. Ctrl+numero assegna un gruppo rapido; i numeri da 1 a {groups} lo richiamano.", en: undefined },
  "ref.conditionsTitle": { it: "Morale e fatica", en: "Formations, Morale and conditions" },
  "ref.conditionsBody": { it: "Prima di attaccare, guarda morale, fatica e formazione. La Linea combatte a piena forza; la Colonna dispone i soldati in profondità e porta soltanto un quarto della forza in mischia; non aumenta la velocità di movimento. Passa in linea prima di entrare nello scontro.\n\nLa fatica riduce l'efficacia: lascia riposare i reparti fermi fuori dal combattimento. Proteggi i fianchi e le spalle, perché essere colpiti da quelle direzioni costa uomini e morale.\n\nA morale zero il reparto fugge verso un proprio insediamento; si riordina da solo quando è al sicuro. Se invece non riceve il soldo perde {loss} morale per stagione e può disertare. Il territorio nemico e l'inverno rendono una lunga spedizione più rischiosa.\n\nControlla le munizioni: una volta esaurite, le salve tornano al cambio di stagione nel tuo territorio. Nei gruppi, un ordine può riuscire soltanto per alcuni reparti: i rifiuti individuali spiegano chi non ha potuto eseguirlo.", en: undefined },
  "ref.territoryTitle": { it: "Territorio e inverno", en: "Territory and winter" },
  "ref.territoryBody": { it: "Il territorio rende sostenibile la tua avanzata. Si estende fino a {radius} caselle dagli insediamenti che possiedi; nelle zone contese conta quello più vicino. Prendere un insediamento minore apre quindi una base più avanzata.\n\nFuori dal tuo territorio perdi il {outside}% degli uomini a ogni stagione, il {winter}% in inverno. Anche nel tuo territorio, un reparto in campo aperto perde il {field}% in inverno. Quando si applica una perdita, il minimo è un uomo.\n\nCome preparare i quartieri\nUsa Guarnigione in un tuo insediamento oppure porta il reparto esattamente al suo centro. Roma può anche fermare i propri reparti entro {camp} caselle da un Castrum completato. Cartagine deve usare i propri insediamenti. I quartieri evitano le perdite invernali nel tuo territorio; fuori resta l'attrito per la lontananza.\n\nNon partire soltanto perché hai abbastanza uomini. Controlla quanto tempo manca all'inverno, dove potrai riparare e se avrai denari per il soldo mentre sei lontano.", en: undefined },
  "ref.squadTerms": { it: "{faction}, livello {tier}.\n\nScegli la taglia\n{sizes}\n\nDopo le perdite il soldo si ricalcola: {rate} denari ogni {basis} superstiti, arrotondati in alto, per stagione.\n\nIn battaglia\nPeso per uomo: {impact}. Morale iniziale: {morale}. Munizioni iniziali: {missiles} salve. Passo: {pace} (1 è il passo base; un valore maggiore riduce il tempo di attraversamento, secondo il terreno). {figures}", en: undefined },
  "ref.beast": { it: "La forza indica la resistenza di una sola bestia, non il numero di animali.", en: undefined },
  "ref.soldiers": { it: "Ogni soldato superstite è visibile nella formazione. Gli uomini perduti non vengono sostituiti automaticamente.", en: undefined },
  'ref.force.title': { it: 'Forza di un Reparto', en: 'A Squad’s force' },
  "ref.force.body": { it: "Un reparto grande porta più uomini nello scontro e resiste più a lungo alle perdite. Dividere gli stessi soldati in tanti reparti ti dà più libertà di manovra, non più forza complessiva.\n\nPer esempio, cinque reparti da {small} uomini hanno insieme gli uomini di uno da {large}. Scegli gruppi piccoli per coprire più punti e corpi grandi quando vuoi concentrare la linea.\n\nLa formazione conta\nIn colonna combatti con un quarto della forza: passa in linea prima della mischia. La Forza del pannello conta i superstiti con il peso del loro tipo di truppa. Le perdite si calcolano a parte: {points} punti di danno equivalgono a un uomo perduto.", en: undefined },
  'ref.force.points': { it: 'Punti-forza per uomo', en: 'Force points to a man' },
  'ref.force.smallest': { it: 'Reparto più piccolo', en: 'Smallest Squad' },
  'ref.force.largest': { it: 'Reparto più grande', en: 'Largest Squad' },
  'ref.force.column': { it: 'Quarti di forza in colonna', en: 'Quarter of the force in column' },
  'ref.combat.title': { it: 'Lo scontro', en: 'The exchange' },
  "ref.combat.body": { it: "Cerca lo scontro nelle condizioni che hai scelto: una linea riposata, fianchi coperti e truppe adatte al nemico. Le lance hanno vantaggio sulla cavalleria; i Frombolieri balearici hanno vantaggio sulle lance. La spada non ha questi vantaggi di tipo.\n\nNon guardare soltanto gli uomini rimasti. Il morale decide se un reparto resta a combattere o fugge: proteggere i fianchi e aggirare il nemico può valere più di un attacco frontale. Un reparto in rotta cerca un proprio insediamento e si riordina quando è al sicuro.\n\nDurante la mischia\nCi sono {rounds} scambi al secondo. Ogni reparto sotto attacco perde {base} morale per scambio, con {flank} in più se colpito al fianco e {rear} alle spalle. Essere attaccato da più reparti non moltiplica da solo questa perdita di base.", en: undefined },
  'ref.combat.base': { it: 'Morale per scontro', en: 'Morale an exchange' },
  'ref.combat.flank': { it: 'Morale in più al fianco', en: 'Extra Morale in the flank' },
  'ref.combat.rear': { it: 'Morale in più alle spalle', en: 'Extra Morale from behind' },
  'ref.missiles.title': { it: 'Missili', en: 'Missiles' },
  "ref.missiles.body": { it: "Le munizioni danno peso ai primi momenti di uno scontro. Un reparto che ne dispone lancia una salva per ogni scambio in cui è impegnato: aggiunge perdite e {shock} punti di perdita del morale al bersaglio.\n\nLe salve finiscono. Controlla le munizioni prima di riprendere un combattimento e, quando puoi, torna nel tuo territorio: al cambio di stagione avviene il rifornimento. Aspettare sul terreno nemico non riempie le scorte.\n\nI Frombolieri balearici hanno salve pesanti, ma non sono una linea da lasciare esposta. Usa la fanteria per proteggerli e scegli con attenzione dove iniziare lo scontro.", en: undefined },
  'ref.missiles.shock': { it: 'Morale per salva', en: 'Morale a volley' },
  'ref.siege.title': { it: 'Assedio', en: 'Siege' },
  "ref.siege.body": { it: "Per vincere devi prendere la Roccaforte nemica. Seleziona i reparti, scegli Assalto o Blocco e indica l'insediamento conosciuto. I tuoi uomini marciano verso il bersaglio: osserva le mura e l'esercito nemico prima di impegnare tutto.\n\nAssalto: aprire una breccia\nRoma costruisce automaticamente un ariete quando assalta mura intatte e può pagarlo: costa {ramCost} denari dalla Tesoreria e richiede {ramSeconds} secondi. Conserva denari anche per il soldo; la guarnigione può distruggere l'ariete. Cartagine non lo costruisce e deve aprire la breccia con gli uomini sotto le mura.\n\nSenza ariete, ogni reparto sotto le mura perde uomini a ogni scambio: {loss} ogni {bearing} punti di forza originariamente reclutata, arrotondando in basso con un minimo di uno. Il costo dipende dalla taglia iniziale e dal peso delle truppe, non dai superstiti: dividere gli uomini in molti piccoli reparti può aumentare le perdite. La scalata infligge al massimo {escalade} danni alle mura per scambio; ogni {ram} punti di forza della guarnigione contribuisce a danneggiare l'ariete. Una volta aperto il passaggio, devi ancora prendere il centro.\n\nBlocco: tagliare i rifornimenti\nIl Blocco ferma produzione, tasse e crescita della piazza. Ogni stagione sottrae {grain} grano, {population} abitanti (senza scendere sotto uno) e {morale} morale alla guarnigione. La pressione cresce per multipli interi della forza dei difensori: raddoppia quando gli assedianti hanno almeno il doppio della loro forza, fino a {cap} volte. Senza guarnigione resta la pressione base. I difensori a morale zero abbandonano il presidio; la piazza si arrende quando il grano è zero e non resta alcuna guarnigione. Serve tempo e una posizione sostenibile. Un esercito nemico che arriva in soccorso può rompere il Blocco.\n\nInsediamenti minori\nPer prendere un luogo aperto, porta i soldati sulla casella centrale e mantieni il controllo per {holds} verifiche consecutive, una ogni {captureSeconds} secondi. Conta la forza presente: se le due parti si equivalgono, nessuna prende il luogo. Le mura devono prima avere una breccia se l'insediamento è fortificato.", en: undefined },
  'ref.siege.ram': { it: 'Punti-forza per punto d’ariete', en: 'Force points to a point of ram' },
  'ref.siege.escalade': { it: 'Danni alle mura per scontro', en: 'Wall damage an exchange' },
  'ref.siege.loss': { it: 'Uomini persi sotto le mura', en: 'Men lost under the walls' },
  'ref.siege.grain': { it: 'Grano perso per Stagione', en: 'Grain lost a Season' },
  'ref.siege.cap': { it: 'Volte al massimo', en: 'Times at most' },
  'ref.roster.title': { it: 'Il peso di ogni tipo', en: 'Each type’s weight' },
  "ref.roster.body": { it: "Componi l'esercito pensando a cosa deve fare. Roma offre tre linee di fanteria via via più salde; Cartagine affianca alla fanteria frombolieri, cavalleria ed elefanti. I livelli dell'insediamento aprono i reclutamenti avanzati.\n\nI soldati di fanteria pesano uno per uno nel calcolo della forza. I Numidi pesano il doppio per uomo e gli Elefanti quattro volte la propria forza astratta: una bestia viene disegnata da sola, ma non vale un singolo fante.\n\nNon esiste un tipo migliore per ogni situazione. Confronta ruolo, taglia, costo locale e soldo nelle schede dei reparti, poi considera il nemico e lo spazio in cui combatterai.", en: undefined },

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
