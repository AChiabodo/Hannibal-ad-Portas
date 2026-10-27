# Issue #74 — implementation progress

Implementation authorized on 2026-10-25 after the Q1–Q40 design interview.

- Branch: `feat/outpost-reworking`.
- Review baseline: `7e67ee6e2e0878f0870cefa8f9234b5df88ea3dd` (confirmed by the user).
- Confirmed TDD seams: Command/Match/Observation; pure PixelBuffer generators and public geometry; public HUD/Controller/AI/headless contracts.
- Interactive Browser validation was explicitly authorized on 2026-10-27, after the initial non-browser delivery. Browser CI has not been requested. Pure-generator PNG comparisons remain distinct from browser acceptance.
- A checked item means the complete requirement is implemented and verified; partial work remains unchecked.

## Browser follow-up — 2026-10-27

The user explicitly requested Browser validation after delivery. Tested the real Vite page at `http://127.0.0.1:5175/` with the in-app Browser, including 1280×720, 1280×900 and 1920×1080 desktop views. Ordinary pointer/keyboard interactions covered setup, construction/recruitment, a Villa upgrade, admission from the courtyard, sentries, protected roster, sortie/re-entry, pending-resource cancellation, exploration, neutral capture and repeated houses. The Carthaginian campaign also reached Tier III with its Forum and 24/240 Garrison readout. The existing public `advance`/`fastForward` hooks skipped waiting while retaining normal rules, payments and AI: campaigns reached both the three-year clock and Roman defeat by blockade. A separate existing neutral fixture verified the remembered site after the Squad left: only 17 observed architectural cells remained recorded. Page identity, meaningful rendering, absence of error overlays and console health passed.

Three reproduced defects are now fixed, each with a failing public regression before its fix:

- **Q1/Q21/Q22/Q28 — Wall continuity:** all segments had horizontal paint, leaving transparent joins on the west/east walls. Their paint now follows each side's axis and outer face; gate/breach exclusions and upright sentries remain intact. The regression checks every vertical cross-section between corner towers, both traditions and all three Tiers.
- **Q4/Q5/Q40 — Minor settlement scale:** an undeveloped village inherited the fortress's 20×13-tile military roads. It now starts with one-tile-wide paths contained in a 7×7-tile centre. All 25 permanent lots and the 25×25 growth reserve remain available; completed copies still appear independently. The same shared geometry governs drawing and discovery, so empty future grounds do not disclose the village. All four orientations are covered.
- **Q11/Q29 — Exposed passage wording:** ordinary field traffic leaving a Gate could read “Ingresso: ancora esposto”. The neutral label is now “Passaggio: ancora esposto”; an actual departure journey still reads “Uscita in corso”. The HUD regression and a second rendered sortie verified the correction.

The complete AI pressure matrix passed again: **60/60 cases, 60/60 replay hashes, unpaid 0**, with unchanged game deadlines. Lint, TypeScript, guards and production build passed. The first complete unit batch passed 1,551 cases and hit two 30-second compute timeouts; both long campaigns then passed in the focused single-worker run (11 tests). The final complete batch passed **1,554/1,554 tests in 137 files** with two workers, unchanged timeouts and no failures (`unit-final.json`, 571.33 s). Both delta review axes have no unresolved findings; see [the review report](issue-74-code-review.md).

Screenshots and raw test evidence are local, outside Git, under `C:/Users/aless/.codex/visualizations/2026/10/25/01a1738c-6754-7130-a06e-7a93ba3daf1f/issue74-browser/`, including `walls-before.jpg`, `walls-after.jpg`, `village-before.jpg`, `village-after-compact.jpg`, `village-growth-two-houses.jpg`, `desktop-wide-ui2.png` and `passage-after.jpg`. Browser interaction/inspection was performed through the Browser runtime and its CDP developer capability, not an external Playwright process. This is explicit interactive evidence, not a claim that the complete automated browser acceptance profile or hardware performance was measured. Temporary viewport overrides were reset and the original UI scale restored. No push or CI run was triggered.

## Delivery verification before Browser acceptance — 2026-10-27

All Q1–Q40 are implemented. The complete non-browser suite passed **1,551/1,551 tests in 137 files**, with no failures (`artifacts/issue-74/unit-verified.json`). Lint, TypeScript, architecture guards and the production build passed.

The complete AI pressure matrix passed **60/60 cases** (10 seeds, both human factions, three difficulties), with **60/60 matching replay hashes** and no unpaid commands. It ran through the documented per-seed CLI in four isolated processes; contact and pressure deadlines were unchanged. Evidence: `artifacts/issue-74/pressure-verified.jsonl`. Earlier failed runs below are retained as implementation history and are superseded by these final results.

Both final review axes are clear: Standards has no unresolved violations; Spec has no unresolved requirement gaps. See [the review report](issue-74-code-review.md). Pure procedural comparisons are available at `artifacts/issue-74/compositional-comparison.png`, including empty initial sites, three Tiers, completed development, construction stages and troop-scale references.

At this delivery checkpoint, Chromium/browser acceptance was **unrun** without an explicit user request; the subsequent authorized interactive validation is recorded above. All commits remain local on `feat/outpost-reworking`; no push or browser CI was triggered.

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

- Integration follow-up: legal unaffordable HUD offers can be queued, and pending building copies count towards the per-kind limit. A recruitment batch starts one complete Squad at a time; `count` and quoted `cost` retain only its unpaid remainder. This avoids a permanent wait when two 120-man bodies cannot both fit the Muster area. Red/green at Command/Match/Observation and public offer-model seams; 54 focused tests passed in three files, with 148 tests passed in the preceding economy/HUD slice.

- Initial red/green: `tests/render/settlement-growth.test.ts` checks all 25 permanent lots, non-overlap, reserved capture/muster/assembly space and interior/exterior assignment. This is foundational geometry, not completion of the integrated map or rendering requirements.

- Q40 complete: pure generator matrix produced by `node scripts/settlement-comparison.mjs` at artifacts/issue-74/initial-comparison.png; inspected locally. Both traditions, three Tiers, full 25/24-Work development and Rome 24/60/120, Carthage 24/48 plus horse/elephant references. Public geometry/art tests: 2 passed; TypeScript passed. Dimensions remained candidates until the subsequent navigation/map calibration. No Chromium executed.


- Q12/Q16/Q17/Q18 complete at the shared rules seam: mandatory survivor capacity (60/120/240 for both Factions), whole-Squad rejection, purchased Capacity unchanged, cavalry/elephant admission refused. tests/sim/settlement-rework.test.ts: 8 passed across both Factions and all Tiers. TypeScript passed. Physical admission/exit and HUD remain separate open requirements.


- Q19/Q31 complete: Walls 60/90/120 and Gate 120/180/240, proportional integrity at Villa/Forum completion, destroyed structures remain open. Observation exports maxHp and the renderer uses it for condition thresholds. Villa/Forum prices and timers unchanged. Shared rules tests: 9 passed, covering both upgrades; TypeScript previously passed.


- Q15/Q30/Q32/Q37/Q38/Q39: resistenza per Tier, piazza di conquista 3x3 con presidio attivo bloccante, quartieri sull'intero nucleo abitato (corpo completo), distanze dal perimetro e soccorso esterno strettamente superiore, conservazione di Tier/Works/origini e annullamento degli ordini non pagati del precedente proprietario. Cinque casi pubblici Match/Observation in tests/sim/settlement-conquest.test.ts verdi; regressioni di integrazione ancora in corso.

- Q9/Q14/Q25: memoria autorevole numerica per cella, scritta soltanto sotto visione corrente; proiezione senza accesso al mondo nascosto. Completamenti, Tier, conquista, danni, presidio e ariete restano congelati nelle porzioni non riosservate; il terreno esterno vuoto non scopre il sito. Filtrate anche le strutture dell'Observation nemica. Test integrati knowledge/conquista/protocollo: 16 verdi in 3 file. Rendering e picking usano le medesime celle filtrate.

- Q2/Q3/Q4/Q5/Q6/Q8/Q10/Q20/Q21/Q22/Q23/Q27: composizione procedurale a lotti stabili 25/24 copie, cantieri in tre fasi, tre Tier e tradizioni distinte; minori aperti, cinta invariata, produttori senza nuovi vincoli o rese. Mappa 160x160 con riserve reali e accessi asciutti; matrice aggiornata generata e ispezionata in artifacts/issue-74/compositional-comparison.png. Nessuna distruzione economica individuale aggiunta.
- Q7/Q11/Q13/Q26/Q28/Q29/Q33/Q34/Q35/Q36: accesso reale, presidio esplicito distinto dal transito, protezione atomica, FIFO fisica per apertura e uscite bloccate; capienza verificata all'arrivo (nessuna prenotazione), esclusione esplicita dell'eccedenza. Raduno completo prima del pagamento, lista degli ordini sospesi e cancellazione, pannello con roster/uscita e sentinelle. Verificati 19 test Match sui requisiti, 103 test in sei file HUD/ordini/aspetto/traffico/geometria; mappa verificata su 1.000 seed. Le regressioni generali di navigazione/AI/tutorial restano in corso.
- Q1/Q24: ingombri condivisi con le figure effettive e colonna reale ai passaggi, mantenendo gli effetti di combattimento e ripristinando la formazione richiesta a corpo completamente libero. Corrette anche manovre rigide di arretramento/scarto prima della rotazione, code serrate di tre coorti da 120, ostacoli mobili alla rotazione e ripianificazione conservando la destinazione. 90 test mirati movimento/arrivi/route/traffico/navigazione verdi. Tutte le quaranta righe descrivono ora implementazioni verificate puntualmente; regressione complessiva, stabilizzazione AI/headless e review finale rimangono gate aperti.
- Ulteriore verifica integrata: 95 test in sei file (tutorial, UI siti, comandi/documentazione, protocollo, movimento) verdi. Aggiornati gli scenari precedenti con ingombri reali e memoria architettonica; il tutorial combatte tramite inseguimento di un nemico realmente osservato, rispettando la ritirata della normale AI.

- Two-axis review at a62268d: Standards reported one P3 copy-localization breach and one duplicated-opening-geometry judgement; Spec reported two P2 gaps (admission lost during a construction detour, and initial fortresses distinguished only by colour). All were corrected in 2c893c3, with public red/green regressions and shared geometry; both reviewers confirmed resolution. Full reports: issue-74-code-review.md.
- Additional integration correction in 2c893c3: an observed gate/wall emits only its filtered front even when the hidden centre cannot be seen. The public Match regression checks the two observed western structures and excludes the unseen sides and enemy roster size.
- The initial complete AI pressure matrix finished with 33/60 cases passing and 27 failing. This remains an open regression gate; no deadlines were relaxed. Focused traces isolated tactical orders repeatedly replacing a valid siege approach before its movement step could complete; controller stabilization is in progress. Do not infer overall acceptance from the checked requirement rows above.
