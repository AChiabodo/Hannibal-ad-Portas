# Issue #74 — implementation progress

Implementation authorized on 2026-10-25 after the Q1–Q40 design interview.

- Branch: `feat/outpost-reworking`.
- Review baseline: `7e67ee6e2e0878f0870cefa8f9234b5df88ea3dd` (confirmed by the user).
- Confirmed TDD seams: Command/Match/Observation; pure PixelBuffer generators and public geometry; public HUD/Controller/AI/headless contracts.
- Chromium and browser CI are not authorized. Pure-generator PNG comparisons are not browser acceptance.
- A checked item means the complete requirement is implemented and verified; partial work remains unchecked.

## Requirements

- [ ] **Q1** — Occupazione reale
- [ ] **Q2** — Ogni costruzione lascia una traccia
- [ ] **Q3** — Disposizione automatica
- [ ] **Q4** — Identità distinta dei minori
- [ ] **Q5** — Spazio massimo riservato e cinta stabile
- [ ] **Q6** — Edifici economici senza distruzione individuale
- [ ] **Q7** — Presidio tramite avvicinamento reale
- [ ] **Q8** — Cantieri visibili dall'avvio
- [ ] **Q9** — Informazioni ottenute esplorando
- [ ] **Q10** — Distribuzione dentro e fuori
- [ ] **Q11** — Attraversare è diverso da presidiare
- [x] **Q12** — Capienza obbligatoria dalla prima implementazione
- [ ] **Q13** — Presidio visibile e gestibile
- [ ] **Q14** — Ultimo aspetto visto nella memoria
- [ ] **Q15** — Livelli con resistenza effettiva
- [x] **Q16** — Contano i superstiti
- [x] **Q17** — Capienza iniziale uguale per fazione
- [x] **Q18** — Ammessi al presidio
- [x] **Q19** — Upgrade con danni preesistenti
- [ ] **Q20** — Ingombro del cantiere fin dall'inizio
- [ ] **Q21** — Tre aspetti per Tier
- [ ] **Q22** — Linguaggi architettonici delle fazioni
- [ ] **Q23** — Nessuna nuova adiacenza economica ai giacimenti
- [ ] **Q24** — Colonna reale nelle strettoie
- [ ] **Q25** — Visione parziale
- [ ] **Q26** — Capienza all'ingresso, senza prenotazione durante la marcia
- [ ] **Q27** — Scala ancorata ai soldati
- [ ] **Q28** — Porta e brecce come accessi reali
- [ ] **Q29** — Confine atomico della protezione
- [ ] **Q30** — Conquista tramite piazza visibile
- [x] **Q31** — Parametri iniziali della resistenza e prezzi
- [ ] **Q32** — Quartieri d'inverno riconoscibili
- [ ] **Q33** — Zona di raduno dei reclutati
- [ ] **Q34** — Lista degli ordini in attesa
- [ ] **Q35** — Traffico degli accessi
- [ ] **Q36** — Presidio dall'interno
- [ ] **Q37** — Geometria delle distanze dell'assedio
- [ ] **Q38** — Soccorso con peso militare reale
- [ ] **Q39** — Conquista e storia dell'architettura
- [x] **Q40** — Calibrazione delegata e confronto iniziale

## Evidence log

- Initial red/green: `tests/render/settlement-growth.test.ts` checks all 25 permanent lots, non-overlap, reserved capture/muster/assembly space and interior/exterior assignment. This is foundational geometry, not completion of the integrated map or rendering requirements.

- Q40 complete: pure generator matrix produced by 
ode scripts/settlement-comparison.mjs at artifacts/issue-74/initial-comparison.png; inspected locally. Both traditions, three Tiers, full 25/24-Work development and Rome 24/60/120, Carthage 24/48 plus horse/elephant references. Public geometry/art tests: 2 passed; TypeScript passed. Dimensions remain candidates until navigation/map calibration. No Chromium executed.


- Q12/Q16/Q17/Q18 complete at the shared rules seam: mandatory survivor capacity (60/120/240 for both Factions), whole-Squad rejection, purchased Capacity unchanged, cavalry/elephant admission refused. tests/sim/settlement-rework.test.ts: 8 passed across both Factions and all Tiers. TypeScript passed. Physical admission/exit and HUD remain separate open requirements.


- Q19/Q31 complete: Walls 60/90/120 and Gate 120/180/240, proportional integrity at Villa/Forum completion, destroyed structures remain open. Observation exports maxHp and the renderer uses it for condition thresholds. Villa/Forum prices and timers unchanged. Shared rules tests: 9 passed, covering both upgrades; TypeScript previously passed.

