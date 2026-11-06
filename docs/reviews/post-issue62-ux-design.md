# Player experience after Issue 62

Status: design interview complete, 2026-10-20. Q1–Q31 answered. The Player subsequently authorized spec/ticket preparation and approved the complete breakdown/test seams; publication is [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63) with children #64–#71. No implementation, commit or push has started. The earlier stop boundary was respected until the publication instruction arrived.

## Final agreed design

This section is the current agreement. The numbered rounds below preserve decision history; later answers supersede earlier alternatives.

| Area | Agreed behavior |
| --- | --- |
| Art direction | Preserve procedural PixelBuffer/PixiJS, palette/font family and orthogonal theatre. Enrich figures and structures; compare smaller figures, greater source detail and structure proportions using actual rendered scenes. |
| Roman melee infantry | Real 24/60/120-man Squads, independently commanded. Starting line layouts: 6 × 4, 10 × 6, 12 × 10. Compare 64 at 8 × 8 against 60 during later art approval; 36 is not added. |
| Carthaginian melee infantry | Real 24/48-man Squads. Preserve type-specific economic, equipment and Morale identities; the small-Squad organization distinguishes Carthage from Rome. |
| Specialists | One real size per type: 24 Balearic slingers, 12 Numidian cavalry, one elephant Figure with separate abstract combat strength. These are starting headcounts for balance validation, not tested balance results. |
| Recruitment and pay | Choose size at recruitment; splitting/merging deferred. Existing melee-infantry resource prices are the starting 24-man prices, scaling proportionally without bulk discounts. Infantry Payroll follows type and surviving men. Specialist prices and exact billing/rounding require calibration. |
| Combat and siege | Five 24-man Squads should have roughly one 120-man Squad's combined capability under comparable frontal conditions. Rebalance garrisons, assaults and blockades by actual force and troop type so entity count alone does not multiply military power. Small contingents may occupy undefended sites. |
| Visible losses | One Figure per surviving infantryman. Keep formation width and persistent empty slots, including interior holes, without continuously recentering survivors. These are visual losses in an aggregate Squad model, not individually simulated soldiers. |
| Group movement | Distribute legal arrival positions near the destination. Temporary Tile sharing through narrow passages is permitted; full physical collision simulation is not part of this change. |
| Construction navigation | Four selectable purpose categories, one list visible at a time: Produzione; Economia e scorte; Popolazione e sviluppo; Supporto militare. Locked buildings remain visible with requirements and refusal reasons. |
| Economic explanations | Show initial cost, workers, effects and production timing. Durations use seconds; production/Payroll use Seasons with a boundary countdown. Distinguish settlement-local stocks, faction Treasury and next-Season estimates. |
| Learning | Dedicated repeatable practical Tutorial, in-game Encyclopedia and brief contextual Guide/help. Exercise-controlled opponents in opening chapters; normal AI and a real encounter in the final chapter. |
| Main menu | Play, Tutorial, Encyclopedia, Options. Play leads to configuration. Returning to the menu preserves the current Match paused in memory and offers Resume; persistence after page closure/reload is outside this agreement. |
| AI acceptance | Active Match minute limits for contact / pressure: Tiro 5 / 10, Centurio 3 / 6, Imperator 2 / 4. Validate across multiple seeds and both Factions under the new economy, with a normal-interface observed playthrough. Require rendered enemies, contact Notice/camera access and actual contention/combat attempts; order submission alone is insufficient. |
| Verification | Focused local feedback target ≤60 seconds, browser smoke ≤90 seconds, targeted feature checks and full acceptance before integration. Visual evidence generation is explicit. Measure and inventory coverage before deleting duplication. |

Construction membership:

- **Produzione**: Fattoria, Legnaia, Cava, Miniera.
- **Economia e scorte**: Mercato, Granaio.
- **Popolazione e sviluppo**: Casa, Villa, Foro.
- **Supporto militare**: Castrum.

The Granaio increases capacity for all four resources; Villa and Foro raise settlement Tier; Castrum is Roman winter support rather than a recruitment barracks. Contextual explanations must describe the actual current rules.

## Confirmed constraint

The Player requires the current art direction to remain, with richer generated figures and structures. Preserve the procedural PixelBuffer/PixiJS pipeline, palette/font family and orthogonal theatre (ADR-0002, ADR-0007). The earlier Issue 62 verdict is evidence of that delivery, not acceptance of the remaining player experience.

## Accepted decisions — round 1

1. Infantry uses real, independently commandable Squad sizes of 24, 60 and 120 men. Evaluate additional sizes before finalizing the roster. Cavalry and elephants need separate treatment.
2. Individual figure dimensions may change. Compare figure, formation and structure proportions while preserving the art direction. The Player permits exploring greater source detail when reducing displayed size; lossless preservation of that detail at a smaller pixel footprint is not assumed.
3. Learning has three complementary surfaces: practical tutorial, in-game encyclopedia and contextual explanations in the economic panels.
4. The main menu offers Play, Tutorial, Encyclopedia and Options; Match configuration follows Play, and the menu is reachable from pause.
5. The opponent must contest territory/resources in the early Match, with pressure appropriate to difficulty. Actual evidence of encounter/pressure is required, including human play if needed; source wiring alone is insufficient.
6. Verification uses fast non-browser checks, a small browser smoke suite, targeted feature suites and complete acceptance before integration. Visual evidence generation is explicit. Remove duplication only after identifying the coverage it protects.

These decisions authorize design documentation and investigation. They are not an implementation plan or approval to change game rules yet.

## Accepted decisions — round 2

1. Keep the three proposed infantry sizes as the starting set, without adding 36 or 48 globally. The Player permits revisiting counts for aesthetic requirements and requests meaningful Carthaginian asymmetry; the final faction/type size tables remain open.
2. Choose size when recruiting. Splitting and merging existing Squads are deferred.
3. Existing recruitment resource prices become the starting hypothesis for 24 men; larger sizes begin with proportional prices (24: 1, 60: 2.5, 120: 5), without bulk discounts. This requires checking starting stocks and recruitment pace. Rounding and Payroll remain open.
4. At otherwise comparable frontal conditions, five 24-man Squads should have roughly the combined capability of one 120-man Squad. Small Squads gain flexibility; large ones concentrate force. This is a balance target, not a claim of current equivalence or identical outcomes.
5. Apply the new organization to infantry. The Player did not accept a uniform Roman/Carthaginian size table: investigate type-specific or smaller/cheaper Carthaginian contingents. Other troop categories remain separate decisions.
6. A repeatable dedicated tutorial verifies practical objectives, with chapters for economy/seasons, construction/recruitment, movement/combat and territory/siege. Brief help remains available in a normal Match; the encyclopedia is available during play.
7. Return to the main menu keeps the current Match paused in memory and exposes Resume. Persistence after reload or page closure is not included.
8. AI acceptance requires both an enemy actually shown in the normal interface and a concrete attempt to contest a settlement or attack a Squad. Use reproducible cases across multiple seeds and both Factions, plus an observed normal-interface playthrough. Time targets remain open.
9. Target local focused checks within 60 seconds and a browser smoke within 90 seconds, measured before/after reorganization. Complete acceptance remains a pre-integration gate.

## Accepted decisions — round 3

1. Carthaginian melee infantry uses 24/48-man Squads. Keep type-specific prices, Morale and equipment: Gauls are cheap and fragile; Libyans and Iberians retain distinct roles. This deliberately limits Carthaginian concentration per Squad and increases the importance of group handling.
2. Roman line layouts 24 = 6 files × 4 ranks, 60 = 10 × 6, 120 = 12 × 10 are accepted as the starting comparison. The Player explicitly reopened the middle choice for evaluation of 36 = 6 × 6 and 64 = 8 × 8. Keep 24 and 120; neither 36 nor 64 has been added or selected yet.
3. Infantry returns to one Figure per surviving man. Figure dimensions and structures must be compared together so the 120-man Squad does not recreate the current scale problem. Single-creature exceptions remain separate.
4. Payroll decreases proportionally to surviving men, with type-specific rates. Display the due amount and rounding explicitly. Exact billing/rounding policy remains to be specified.
5. Multi-Squad movement distributes destinations near the clicked point and keeps separate arrival positions. It does not introduce individually simulated soldiers. Rules for constrained ground and special targets remain open.
6. AI acceptance targets, in active Match minutes: Tiro contact ≤5 / pressure ≤10; Centurio ≤3 / ≤6; Imperator ≤2 / ≤4. Validate these under the revised economy. Pressure requires a concrete contention/combat attempt, not repeated order submissions. Normal browser evidence includes rendered enemies, the contact Notice and camera access to the contact.
7. Initial tutorial chapters use an exercise-controlled opponent; the concluding chapter uses normal AI and requires an actual encounter.

## Accepted decisions — round 4

1. Keep Roman 24/60/120 as the baseline. Compare 60 against 64 during later visual approval; do not add 36 or 64 to recruitment now.
2. Specialists have one size per type, but the Player explicitly requires smaller headcounts than the current slinger 90 / Numidian horse 60. Exact new counts remain open. The elephant remains one Figure; its abstract combat strength is separate from beast count.
3. The Player accepts stable formation width and visible losses, mentioning holes in the ranks. Clarify whether this means interior gaps retained at fallen slots or the previously proposed incomplete rear rank; do not silently equate these treatments.
4. Groups may share a Tile temporarily through narrow ground, then occupy separate arrival positions. Full physical collision/occupancy simulation is outside this decision.
5. Display construction/recruitment durations in seconds, production/Payroll per Season, and time to the next boundary. Building offers explain initial cost, required workers, effect and timing. Economic panels distinguish local stocks, faction Treasury and next-Season estimates.
6. New request: organize construction offers by building purpose rather than one undifferentiated list. Categories and navigation are pending.
7. Explicit stop boundary: once design questions are finished, wait for the Player's next command. Do not begin implementation, create tracker items, commit or push on completion of the interview.

## Accepted decisions — final round

1. Q28: accept all four construction categories and memberships above, selectable with one list visible; locked offers remain visible with explanations.
2. Q29: accept real starting specialist headcounts of 24 slingers, 12 Numidian cavalry and a single elephant Figure, with specialist balance explicitly unverified.
3. Q30: accept persistent interior gaps and stable survivor positions. This supersedes the centered incomplete rear-rank treatment considered earlier. Derived visual slots may represent losses without introducing individual-soldier simulation or claiming to reconstruct exact historical casualty positions.
4. Q31: include garrison, assault and blockade balance by actual force/type. Avoid automatic power multiplication from counting more Squad entities; retain small contingents' ability to occupy undefended places.

## Verified starting points

- `render/squads.ts::visualShape` displays 90 figures for 120 men. The fixed twelve-file line in `sim/squad.ts` leaves a partial final rank. This explains asymmetry; it does not establish every reported formation defect.
- `input/match-host.ts::createBrowserMatch` creates the opposing army Controller and calls both Controllers each advancing tick. This source inspection does not establish timely contact in a real browser Match.
- `package.json` separates `verify` from Playwright. `.github/workflows/ci.yml` runs the complete browser suite on pushes and pull requests. The Issue 62 report records 141 browser tests taking 8.1 minutes with two workers; this is recorded evidence, not a new timing measurement.
- `GLOSSARY.md` calls the commandable aggregate a Squad (Italian: Reparto). A Figure is its drawing. Smaller independently commanded Squads can retain ADR-0004; individually simulated soldiers would reopen it.
- At current spacing, the 90-figure line occupies 65x49 pixels, while the 90-figure column occupies 20x159; minor settlements are 32x32 and Strongholds 56x56. Relative scale remains a concrete problem after the figure-count reduction.
- Combat uses frontage rather than total strength for damage, with morale shocks per exchange. Five independently commanded 24-man Squads cannot be assumed equivalent to one 120-man Squad. Current recruitment creates full type-sized Squads and Payroll is per type, not proportional to remaining strength.
- The complete-browser-Match test in `e2e/first-entry.spec.ts` accepts a clock ending and does not require enemy contact or combat. Existing green tests do not settle the Player's report about missing opposition.

## Historical reference

The setting is the Second Punic War, so Republican organization is the relevant reference. Polybius VI.21 and VI.24 describe 1,200 hastati, 1,200 principes and 600 triarii, each class divided into ten maniples: 120 for the first two and 60 for triarii. A legion is much larger than 120 men. These passages do not establish 24 as a standard formation; that size remains a possible gameplay abstraction. These Roman infantry numbers do not establish suitable sizes for Carthaginian troops, cavalry or elephants.

Source: [Polybius, Histories VI](https://penelope.uchicago.edu/thayer/e/roman/texts/polybius/6*.html), sections 21 and 24.

## Round 2 investigation

- Additional sizes considered: 36 and 48. Both increase roster/price/balance choices; 48 is twice 24, but proximity to 60 needs a distinct gameplay purpose. Neither is accepted. Do not choose real headcounts merely to make the current three-quarter rendering projection fill complete ranks.
- Smaller Squads alone do not fix line width: all sizes of at least 12 men retain the current twelve-file frontage. The figure dimensions and formation geometry still need review.
- A more detailed source drawn into fewer screen pixels cannot retain every detail. Current nearest filtering and integer camera zooms require checking odd zooms as well as even ones. Proposed comparison: enriched current native figure, redesigned compact native figure, and a higher-resolution source with explicitly reviewed small/large renderings. No approach selected yet.
- A live headless probe through `createBrowserMatch`, with normal rules/opponent and a passive Roman human Controller, ran seed 1 for 3,000 active ticks at all three difficulties. First human-visible enemy: Tiro 1,754; Centurio 854; Imperator 704. First recruitment: 1,200 / 300 / 150; first movement: 1,203 / 303 / 153. This demonstrates activity for those cases; it does not prove browser presentation, pressure, other seeds or the Player's specific Match.
- The bounded extension to 9,000 ticks passed the enemy-in-human-Observation assertion for all three difficulties. By that bound each had raised three enemy Squads and submitted Blockade orders; no Match had ended. Submitted orders do not prove successful damage/capture. Runtime was approximately 23 seconds total. Reproduction: `node "$env:TEMP/spqr-ai-pressure-probe.mjs" 9000 rome`; report: `%TEMP%/spqr-ai-pressure-probe-summary.json`. Both are temporary diagnostic artifacts, not committed regression tests. Explicit host stepping bypasses browser pacing/RAF and does not prove on-screen visibility. Source revision: `d3cc6a8cce0c81f47b66c4b6d61cc23a3cd98b13`.

## Interview closure and deferred work

- Interview frontier: empty. All questions asked in this session are answered. Wait for a new Player command.
- Settled military structure: Roman 24/60/120 baseline, Carthaginian melee 24/48; recruitment-only size choice; proportional recruitment-price hypothesis; survivor-based infantry Payroll; one Figure per infantryman. Exact combat/billing formulas and final specialist prices are later implementation/balance work, with the agreed proportionality and small/large equivalence targets as constraints.
- Settled group handling: distribute legal arrival positions near the clicked destination; temporary overlap through narrow passages is permitted. Current same-destination behavior is documented above as the baseline defect.
- Settled learning/menu structure: dedicated practical tutorial with exercise-controlled opening chapters and normal-AI final chapter; in-game encyclopedia; contextual economic explanations; four main-menu entries and paused in-memory Resume.
- Deferred art approval: compare enriched native, compact native and higher-resolution figures with actual settlements, formations and overlapping groups; compare Roman 60 against 64. Exact figure dimensions, pixel spacing and structure ratios require rendered evidence after a new Player command, not another speculative numeric interview.
- Deferred implementation/verification detail: derive column layouts from the settled size/formation goals; inventory coverage; measure checks; diagnose the normal web path and validate the agreed AI contact/pressure horizons under the new economy. These are explicitly unperformed work, not accepted evidence.

Deferred implementation details and evidence requirements are not further interview questions or permission to begin that work. Final figure dimensions/scale, column layouts, exact combat/billing formulas, specialist prices and rendered/balance acceptance remain unimplemented and unverified.

## Roman middle-size evaluation

The Player requested comparing 36 (6 × 6) and 64 (8 × 8), while retaining 24 and 120. Neither new middle size has been accepted. At one Figure per man, existing 10 × 14 figures and five-pixel spacing would yield these calculated south-facing bounds (not rendered acceptance): 24 at 6 × 4 = 35 × 29 pixels; 36 at 6 × 6 = 35 × 39; 60 at 10 × 6 = 55 × 39; 64 at 8 × 8 = 45 × 49; 120 at 12 × 10 = 65 × 59. A square headcount grid is not an exactly square silhouette; final figure dimensions remain open.

- 36 costs 1.5 times the 24-man base and is only 50% larger than the small size. The jump from 36 to 120 is large.
- 60 costs 2.5 times the base, and two full Squads have exactly the men and proportional recruitment price of one 120-man Squad. Current Roman resource costs yield integers at this size.
- 64 costs 8/3 times the base and is a compact middle candidate; it introduces thirds into some material prices. For example, the current hastati base 8 grain / 2 iron becomes 21⅓ / 5⅓ before any rounding policy.

Accepted outcome (Q23): retain 60 as the economic middle and compare its shape against 64 during later art approval. Do not add 36 and 64 as extra menu choices merely to obtain squares.
