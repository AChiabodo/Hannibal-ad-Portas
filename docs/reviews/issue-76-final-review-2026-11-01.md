# Issue 76 — revisione finale, 1 novembre 2026

Issue: Rework della mappa: paesaggi, strade, incursioni e riparazioni.
Base fissata: `9946a312ad6913ee399302f4ccf7d6385fd5173f`, merge-base con
`develop`. Prima revisione: `git diff 9946a312...c8e7485`, 162 file.
Revisione della correzione: `git diff c8e7485...dfbe4f7`.
Revisioni successive: fence su `8a94b38...6116bee` e fixture di pressione
su `6116bee...39e9eed`.
La correzione della fixture `43b5c08` attende il segnale di boot prima del
primo input. Il gate non browser è su `65e0558`, che limita il carico
concorrente del runner; la fixture finale di pressione è `cda7c5b`.

Due agenti indipendenti hanno esaminato Standards e Spec, senza modificare
file, creare worktree o eseguire test. La verifica automatica è gestita
separatamente dal responsabile dell'implementazione.

## Standards

### Violazione vincolante rilevata e risolta

**P2 — danno alle strutture moltiplicato dal numero di Squad.** Gli attacchi
contro Works e accampamenti applicavano quattro HP per Squad, due per
cavalleria, indipendentemente dai superstiti e dalla Force. Cinque gruppi da
24 fanti infliggevano cinque volte il danno di un gruppo da 120; un superstite
manteneva il danno del gruppo integro. Questo violava ADR-0026.

L'analisi ha esteso la correzione alle incursioni neutrali: due gruppi da
9 e 15 uomini, dopo il rinforzo, non devono infliggere più danno di uno da 24.
Il difetto è stato riprodotto prima della correzione, sia per opere/campi
sia per opere/fortificazioni colpite dai barbari.

`structure-exchange.ts` ora aggrega Force effettiva per bersaglio. Ciascun
contributo riceve la differenza fra danni cumulativi arrotondati, applicando
il minimo una sola volta per bersaglio. Sono conservati ordine degli attacchi,
colpo finale e ricompensa unica, oltre alle verifiche di visibilità, stato,
portata, linea libera e invulnerabilità.

Il revisore conferma a `dfbe4f7`: **P2 risolto; nessuna nuova violazione
vincolante individuata**. I contributi nulli non possono assegnare bottino e
un campo distrutto non può assegnarlo nuovamente.

### Osservazioni di manutenzione non bloccanti

- **Possibile Duplicated Code:** opere e campi conservano logica simile per
  annullamento, approccio, ammissibilità e cadenza degli attacchi. Il calcolo
  del danno è ora condiviso; un'eventuale estrazione del resto del ciclo
  richiede di preservare le differenze fra i bersagli.
- **Possibile Primitive Obsession / Repeated Switches:** gli stadi numerici
  delle Works sono interpretati in memoria, IA, ordini, HUD e composizione
  artistica. Costanti condivise e un predicato di attaccabilità renderebbero
  più esplicito il contratto, mantenendo lo stato intero richiesto da ADR-0006.

Queste sono valutazioni di manutenzione, non ulteriori violazioni vincolanti
o requisiti funzionali mancanti della #76.

Limiti: esaminate cronologia, documentazione architetturale e modifiche di
produzione dell'intero diff; test e documenti sono stati letti selettivamente.
La revisione non certifica ogni riga dei file modificati e non sostituisce i test.

## Spec

**Nessun finding azionabile** sulla revisione iniziale e sulla correzione.
Geografia, strade e attraversamenti, stagioni, accampamenti e incursioni,
danni, riparazioni, memoria della nebbia, risposte IA e replay coerente con
la difficoltà corrispondono alla specifica normativa e ad ADR-0031.

La calibrazione sostiene opportunità comparabili entro i limiti dichiarati;
non richiede identità di ogni campagna su una mappa organica. Le vecchie note
parziali del 29/30 ottobre non sostituiscono lo stato aggiornato.

Il conteggio della Force superstite e del tipo, l'arrotondamento aggregato
e l'attribuzione ordinata del colpo finale riallineano il codice ad ADR-0026
senza introdurre una meccanica fuori ambito.

Limiti: revisione in sola lettura di codice ed evidenze. Nessun test o browser
è stato eseguito dagli agenti revisori.

## Revisione delle fixture finali

La prima suite non browser dopo la correzione superava 1.780 casi su 1.781:
l'unico fallimento era il timeout di un test che cumulava sette scansioni
del repository. Le sette verifiche sono ora casi separati, con le stesse
asserzioni e lo stesso timeout predefinito per caso. Il revisore Standards
conferma che nessun controllo è stato eliminato; passano tutti i sette casi.

Tre accettazioni Chromium complete del 1 novembre superavano 180 casi su 181.
Il percorso romano reagiva troppo tardi quando perdeva il primo avvistamento,
oppure mostrava due reparti allo scout, inducendone correttamente la ritirata.
Il limite preesistente di 2.100 tick rifiutava le perdite stagionali; un singolo
passaggio mirato verde non aveva eliminato questa variabilità.

La fixture finale reagisce al primo avviso nemico, che persiste dopo la perdita
della visuale, reclutando un solo reparto. Durante l'intercettazione usa velocità
normale, pausa, minimappa e Attack/AttackMove tramite input ordinari. Aggiorna
la memoria a ogni campione pubblico, anche fra gli ordini, conservando l'ultima
posizione osservata invece di tornare alla posizione del primo avviso. Poi
ripristina 3x e recluta il secondo reparto. Non accede allo stato nascosto e
non usa advance/fastForward. I sei scenari di pressione passiva sono invariati.

Spec ha chiesto una prova delle perdite successive all'inizio dell'inseguimento.
Ora valgono una diminuzione degli uomini dello stesso reparto rispetto al suo
riferimento, oppure un nuovo cadavere avversario vicino al bersaglio osservato,
con nascita successiva al riferimento. Sono così escluse ferite e cadaveri
preesistenti; sono ammesse perdite su un solo lato dello scontro. Restano
necessari Attack applicato da Match, nemico realmente disegnato, limite
`< SEASON_TICKS`, selezione di due reparti, Group, Hold e Resume.
Il primo passaggio finale registra due morti avversari al tick 1.040 e conclude
al tick 1.163. Seguono **3/3 ripetizioni con due worker**, concluse ai tick
1.337, 1.256 e 1.167, con perdite nuove documentate su uno o entrambi i lati.
Standards e Spec confermano i rilievi risolti e nessun nuovo
finding sulla fixture `cda7c5b`; le evidenze registrano entrambe le velocità.

Il fallimento cartaginese in una delle esecuzioni era un Invio prima del boot:
la traccia mostrava la permanenza nel menu. La fixture attende ora
`body[data-spqr-booted="true"]`, il contratto già usato dagli helper, prima
del primo input. Standards conferma che il controllo della schermata di setup
e le soglie di gioco restano presenti.

La suite non browser successiva supera 1.786 casi su 1.787: il benchmark
dei cento Match impiega 5.000,51 ms contro il limite di 5.000 ms, con quattro
worker concorrenti. Il file isolato passa tutti gli otto casi in 4,4 secondi
complessivi. Il tetto del runner è quindi ridotto a tre worker, lasciando
invariati selezione, asserzioni, timeout e limite del benchmark. Standards
conferma che questo conserva il gate, coerentemente con il vincolo di carico
già documentato nella configurazione. La riesecuzione predefinita su `65e0558` supera
**1.787/1.787 test in 163 file**, in 532,23 secondi, compreso il benchmark
con il limite originale.

## Verifica della correzione

Passano 70 test mirati in otto file e il typecheck `tsc -b`. I 13 nuovi test
Command/Match/Observation verificano corpi equivalenti, superstiti, specialisti,
minimo per bersaglio, bersagli distinti e rinforzi neutrali contro entrambe le
fazioni.

I controlli nativi successivi alla correzione sono conclusi:

| Controllo | Esito del 1 novembre |
| --- | --- |
| Pressione AI, entrambe le fazioni e tre difficoltà | 60/60; replay identico in tutti i casi |
| Due espansioni successive, 200 seed a Centurio | 400/400 completate |
| Due espansioni successive, 16 seed e tre difficoltà | 96/96 completate |
| Scenari CLI della CI | 12/12 hash attesi e replay effettivi identici |
| Sei campagne storiche | 6/6 vittorie cartaginesi per blocco e replay identici |
| Lint, guard, typecheck e build | Superati |
| Suite non browser completa | 1.787/1.787 in 163 file; 532,23 s; runner predefinito a tre worker |
| Accettazione Chromium completa | 181/181 su `cda7c5b`; 17,9 minuti; nessun retry |

Nel passaggio completo il percorso romano registra due morti avversari al tick
1.045 e conclude al tick 1.238; passa anche il percorso cartaginese. Sono verdi
tutte le sei prove di pressione passiva, le riparazioni di entrambe le fazioni,
le cinque scene stagionali e i controlli di attraversamento e leggibilità.

Fra `65e0558` e `cda7c5b` cambia soltanto `e2e/pressure.spec.ts`;
runtime e test non browser sono invariati. Typecheck, lint e build passano
anche sulla fixture finale.

Le simulazioni native sono state eseguite prima di Chromium; la suite non
browser completa e Chromium sono eseguiti in sequenza, evitando concorrenza
con il rendering WebGL software. La calibrazione aggiornata e i suoi limiti
sono in [issue-76-economy-calibration.md](issue-76-economy-calibration.md).

Comandi conclusivi: `npm run test:unit`, `npm run test:accept`,
`npm run test:ai-pressure`, `npm run check`, `npm run lint` e `npm run build`
(che include le guard). Le espansioni usano `scripts/map-opportunities.mjs`;
i dodici record/replay seguono i casi della CI. I log finali e quelli diagnostici
sono conservati separatamente in
`F:/Codice/Games/NewGames/SPQR-archives/issue76-close-2026-11-01`, con manifesto
SHA-256. Il precedente avviso Vite sul chunk oltre 500 kB rimane un avviso di
build, senza errori o regressioni funzionali aperte.

## Esito per asse

- Standards: una violazione iniziale risolta; **zero violazioni vincolanti
  aperte**, due osservazioni di manutenzione non bloccanti.
- Spec: **zero finding azionabili**, nessuna nuova lacuna dopo la correzione.
