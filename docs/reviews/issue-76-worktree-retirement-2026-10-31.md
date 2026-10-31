# Issue 76 — analisi dei residui e ritiro worktree

Data: 31 ottobre 2026. Base prodotto: `feat/map-rework`, `40a70f8`.
Ambito autorizzato: analizzare i quattro worktree con modifiche locali e ritirare
i tre puliti con codice integrato e i due con il prototipo risorse superato.

## Esito sui quattro worktree con modifiche locali

I quattro checkout e i loro branch sono conservati intatti. Nessuna modifica
di prodotto è necessaria in conseguenza di questa analisi. Prima del ritiro
degli altri ambienti sono stati copiati tutti i 27 file locali, con patch
binarie, manifest e verifica SHA-256 delle copie.

### issue76-audit — codex/issue76-pressure-current

- La modifica a `src/ai/scouting.ts` contiene precedenza delle bande in avanti
  dalle partenze estreme e aggiramento delle minacce sulla rotta. Entrambi i
  comportamenti sono presenti nella versione integrata, con ulteriori controlli
  sul terreno asciutto, ostacoli e pattuglia singola. Non riportare la versione
  locale precedente sopra quella attuale.
- `.confluence-matrix-audit.mjs`: misura attraversamenti dei rami fluviali su
  1000 seed; diagnostica geografica, non una funzionalità separata.
- `.pressure-audit.mjs`, `.pressure-audit-2c.mjs`,
  `.pressure-deep-2c.mjs`: tracciano contatto, ordini e posizioni di casi seed
  specifici. Conservati come diagnostica storica.
- `.pressure-matrix-audit.mjs`: campione Imperator di primo contatto a 1201
  tick. Superato, come verifica di consegna, dalla matrice canonica completa
  di pressione e replay; non è un gate aggiuntivo da integrare.
- `.pressure-crossings-audit.mjs`, `.pressure-river-audit.mjs`: elenchi di
  guadi, confluenze e gruppi di attraversamento del seed 2.
- `.pressure-map-audit.mjs`, `.pressure-map-detail.mjs`,
  `.pressure-map-east.mjs`: rappresentazioni ASCII della geografia del seed 2.
- `.scouting-extreme-experiment.patch`: alternativa sperimentale al punto di
  attraversamento; non validata come sostituzione della policy integrata.
- `tests/sim/.probe-distances.test.ts`: stampa distribuzioni tramite un
  confronto intenzionale con `{}`; è uno strumento diagnostico, non un test
  di regressione da promuovere nella suite.
- `tests/sim/.probe-extremes.test.ts`: cerca separazioni verticali estreme;
  la sua aspettativa vuota non rappresenta un vincolo concordato della mappa.

### issue76-perf — codex/issue76-perf

L'unica modifica locale è il test sui limiti di osservazione in
`tests/sim/settlement-knowledge.test.ts`. Il file locale è identico al file
del ramo integrato. Sono già coperti bordo del raggio, punto appena oltre,
angolo, osservatore con raggio zero, assenza di osservatori e aggiornamento
del Tier. Non manca alcuna integrazione.

### issue76-pressure-debug — codex/issue76-pressure-debug

- `src/ai/scouting.ts`: varianti di direzione della prima banda, assegnazione
  delle pattuglie, bonus stradale fisso e rimozione del vincolo di distanza
  dalle minacce ricordate. Non integrare: la nota locale documenta regressioni
  su seed già verdi; la policy attuale conserva l'evitamento delle minacce e
  usa costi di marcia effettivi anziché il bonus sperimentale.
- `src/cli/ai-match.ts`: configurazione per il bonus stradale e rimozione di
  `mapWidth`/terreni invalicabili dai contenuti militari. Configurazione
  sperimentale; il prodotto conserva tali dati per validare uscite conosciute.
- `.ai-match-backup.ts`, `.scouting-agent-backup.ts`: copie di sorgenti per
  il ripristino degli esperimenti, non implementazioni aggiuntive.
- `.contact-probe.mjs`, `.economy-probe.mjs`: sonde di primo contatto ed
  economia, da conservare come strumenti storici.
- `.pressure-issue76-observations.md`: risultati storici e motivazioni di
  scarto; il documento stesso distingue primo contatto dalla verifica completa
  e registra varianti che peggiorano altri seed.

### issue76-seed12 — codex/issue76-seed12-current

- `src/ai/military.ts`: rilascio di difensori riposati dopo un assedio,
  attraverso un'uscita conosciuta e senza minacce vicine. Già integrato in
  forma rafforzata, inclusi recupero, forza residua e minacce ricordate.
- `tests/ai/military.test.ts`: i vincoli del test locale sono presenti nella
  suite attuale, con casi aggiuntivi per memoria della minaccia e terreno ignoto.
- `tests/ai/military-match.test.ts`: il caso locale che forza direttamente la
  guarnigione è superato dalla prova attuale con ammissione reale e rilascio
  tramite Controller/Match per entrambe le fazioni.
- `.seed12-current.mjs`: strumento storico di campagna e replay del seed 12.
- `.seed12-current-output.txt`: output diagnostico della sonda; non è sorgente
  da integrare né un risultato della revisione corrente.

## Verifica dell'analisi

Sul ramo prodotto passano **57/57 test in quattro file**:

```powershell
npm run test:focus -- tests/sim/settlement-knowledge.test.ts tests/ai/scouting.test.ts tests/ai/military.test.ts tests/ai/military-match.test.ts
```

Non sono stati eseguiti ulteriori test Chromium: questa attività non modifica
il prodotto. Il registro d'intervista non tracciato è conservato.

## Pulizia eseguita

Rimossi, dopo verifica di stato pulito e HEAD:

- `issue76-geography`, HEAD `638087d`;
- `issue76-pressure-followup`, stesso HEAD `638087d`;
- `issue76-river-baseline`, HEAD `f1f98b5`, antenato della base;
- `issue76-scouting-design`, HEAD `d14191f`, antenato della base.

Rimossi i branch `codex/issue76-resource-pressure-audit`,
`codex/issue76-resource-scout` e `codex/issue76-scouting-design`.
Le due prime referenze rappresentano il prototipo risorse superato; la terza
contiene una patch equivalente già integrata. Le altre attività non sono
state incluse in questa cancellazione.

Le junction sono state scollegate con operazioni non ricorsive prima della
rimozione dei checkout. Nessun comando di cancellazione ha operato sui target
delle junction. I file delle dipendenze TypeScript, Vitest e PixiJS nel checkout
principale hanno mantenuto gli stessi hash.

## Worktree protetto non rimosso

`C:/Users/aless/.codex/worktrees/issue76-repairs/SPQR`, branch
`codex/issue76-bridge-clearance`, è pulito e ha tre patch equivalenti integrate.
Il tentativo di acquisirlo tramite l'API Codex per consentirne l'archiviazione
è stato rifiutato: **"This worktree is owned by another task."**
Il checkout e il branch restano presenti. Non è stata aggirata la protezione
con una cancellazione da shell.

## Recuperabilità

Archivio esterno al repository:
`F:/Codice/Games/NewGames/SPQR-archives/issue76-2026-10-31-190446`.

- `manifest.json`: elenco e SHA-256 dei 27 file locali conservati;
- sottocartelle dei quattro worktree: file, patch completa e patch dell'indice;
- `retirement-manifest.json`: percorsi e HEAD dei quattro checkout ritirati;
- `retired-heads.bundle`: bundle Git verificato, con storia completa della
  base, dei tre branch ritirati e del branch protetto.

Una copia di lavoro è rimasta anche nella cartella temporanea; l'archivio
indicato sopra è conservato fuori dai worktree e non dipende dalla pulizia
della cartella temporanea.
