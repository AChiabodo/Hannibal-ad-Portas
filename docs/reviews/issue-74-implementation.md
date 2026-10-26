# Issue #74 — implementation progress

Implementation authorized on 2026-10-25 after the Q1–Q40 design interview.

- Branch: `feat/outpost-reworking`.
- Review baseline: `7e67ee6e2e0878f0870cefa8f9234b5df88ea3dd` (confirmed by the user).
- Confirmed TDD seams: Command/Match/Observation; pure PixelBuffer generators and public geometry; public HUD/Controller/AI/headless contracts.
- Chromium and browser CI are not authorized. Pure-generator PNG comparisons are not browser acceptance.
- A checked item means the complete requirement is implemented and verified; partial work remains unchecked.

## Requirements

- [x] **Q1** — Occupazione reale
- [x] **Q2** — Ogni costruzione lascia una traccia
- [x] **Q3** — Disposizione automatica
- [x] **Q4** — Identità distinta dei minori
- [x] **Q5** — Spazio massimo riservato e cinta stabile
- [x] **Q6** — Edifici economici senza distruzione individuale
- [x] **Q7** — Presidio tramite avvicinamento reale
- [x] **Q8** — Cantieri visibili dall'avvio
- [x] **Q9** — Informazioni ottenute esplorando
- [x] **Q10** — Distribuzione dentro e fuori
- [x] **Q11** — Attraversare è diverso da presidiare
- [x] **Q12** — Capienza obbligatoria dalla prima implementazione
- [x] **Q13** — Presidio visibile e gestibile
- [x] **Q14** — Ultimo aspetto visto nella memoria
- [x] **Q15** — Livelli con resistenza effettiva
- [x] **Q16** — Contano i superstiti
- [x] **Q17** — Capienza iniziale uguale per fazione
- [x] **Q18** — Ammessi al presidio
- [x] **Q19** — Upgrade con danni preesistenti
- [x] **Q20** — Ingombro del cantiere fin dall'inizio
- [x] **Q21** — Tre aspetti per Tier
- [x] **Q22** — Linguaggi architettonici delle fazioni
- [x] **Q23** — Nessuna nuova adiacenza economica ai giacimenti
- [x] **Q24** — Colonna reale nelle strettoie
- [x] **Q25** — Visione parziale
- [x] **Q26** — Capienza all'ingresso, senza prenotazione durante la marcia
- [x] **Q27** — Scala ancorata ai soldati
- [x] **Q28** — Porta e brecce come accessi reali
- [x] **Q29** — Confine atomico della protezione
- [x] **Q30** — Conquista tramite piazza visibile
- [x] **Q31** — Parametri iniziali della resistenza e prezzi
- [x] **Q32** — Quartieri d'inverno riconoscibili
- [x] **Q33** — Zona di raduno dei reclutati
- [x] **Q34** — Lista degli ordini in attesa
- [x] **Q35** — Traffico degli accessi
- [x] **Q36** — Presidio dall'interno
- [x] **Q37** — Geometria delle distanze dell'assedio
- [x] **Q38** — Soccorso con peso militare reale
- [x] **Q39** — Conquista e storia dell'architettura
- [x] **Q40** — Calibrazione delegata e confronto iniziale

## Evidence log

- Initial red/green: `tests/render/settlement-growth.test.ts` checks all 25 permanent lots, non-overlap, reserved capture/muster/assembly space and interior/exterior assignment. This is foundational geometry, not completion of the integrated map or rendering requirements.

- Q40 complete: pure generator matrix produced by 
ode scripts/settlement-comparison.mjs at artifacts/issue-74/initial-comparison.png; inspected locally. Both traditions, three Tiers, full 25/24-Work development and Rome 24/60/120, Carthage 24/48 plus horse/elephant references. Public geometry/art tests: 2 passed; TypeScript passed. Dimensions remain candidates until navigation/map calibration. No Chromium executed.


- Q12/Q16/Q17/Q18 complete at the shared rules seam: mandatory survivor capacity (60/120/240 for both Factions), whole-Squad rejection, purchased Capacity unchanged, cavalry/elephant admission refused. tests/sim/settlement-rework.test.ts: 8 passed across both Factions and all Tiers. TypeScript passed. Physical admission/exit and HUD remain separate open requirements.


- Q19/Q31 complete: Walls 60/90/120 and Gate 120/180/240, proportional integrity at Villa/Forum completion, destroyed structures remain open. Observation exports maxHp and the renderer uses it for condition thresholds. Villa/Forum prices and timers unchanged. Shared rules tests: 9 passed, covering both upgrades; TypeScript previously passed.


- Q15/Q30/Q32/Q37/Q38/Q39: resistenza per Tier, piazza di conquista 3x3 con presidio attivo bloccante, quartieri sull'intero nucleo abitato (corpo completo), distanze dal perimetro e soccorso esterno strettamente superiore, conservazione di Tier/Works/origini e annullamento degli ordini non pagati del precedente proprietario. Cinque casi pubblici Match/Observation in tests/sim/settlement-conquest.test.ts verdi; regressioni di integrazione ancora in corso.

- Q9/Q14/Q25: memoria autorevole numerica per cella, scritta soltanto sotto visione corrente; proiezione senza accesso al mondo nascosto. Completamenti, Tier, conquista, danni, presidio e ariete restano congelati nelle porzioni non riosservate; il terreno esterno vuoto non scopre il sito. Filtrate anche le strutture dell'Observation nemica. Test integrati knowledge/conquista/protocollo: 16 verdi in 3 file. Rendering e picking usano le medesime celle filtrate.

- Q2/Q3/Q4/Q5/Q6/Q8/Q10/Q20/Q21/Q22/Q23/Q27: composizione procedurale a lotti stabili 25/24 copie, cantieri in tre fasi, tre Tier e tradizioni distinte; minori aperti, cinta invariata, produttori senza nuovi vincoli o rese. Mappa 160x160 con riserve reali e accessi asciutti; matrice aggiornata generata e ispezionata in artifacts/issue-74/compositional-comparison.png. Nessuna distruzione economica individuale aggiunta.
- Q7/Q11/Q13/Q26/Q28/Q29/Q33/Q34/Q35/Q36: accesso reale, presidio esplicito distinto dal transito, protezione atomica, FIFO fisica per apertura e uscite bloccate; capienza verificata all'arrivo (nessuna prenotazione), esclusione esplicita dell'eccedenza. Raduno completo prima del pagamento, lista degli ordini sospesi e cancellazione, pannello con roster/uscita e sentinelle. Verificati 19 test Match sui requisiti, 103 test in sei file HUD/ordini/aspetto/traffico/geometria; mappa verificata su 1.000 seed. Le regressioni generali di navigazione/AI/tutorial restano in corso.
- Q1/Q24: ingombri condivisi con le figure effettive e colonna reale ai passaggi, mantenendo gli effetti di combattimento e ripristinando la formazione richiesta a corpo completamente libero. Corrette anche manovre rigide di arretramento/scarto prima della rotazione, code serrate di tre coorti da 120, ostacoli mobili alla rotazione e ripianificazione conservando la destinazione. 90 test mirati movimento/arrivi/route/traffico/navigazione verdi. Tutte le quaranta righe descrivono ora implementazioni verificate puntualmente; regressione complessiva, stabilizzazione AI/headless e review finale rimangono gate aperti.
- Ulteriore verifica integrata: 95 test in sei file (tutorial, UI siti, comandi/documentazione, protocollo, movimento) verdi. Aggiornati gli scenari precedenti con ingombri reali e memoria architettonica; il tutorial combatte tramite inseguimento di un nemico realmente osservato, rispettando la ritirata della normale AI.