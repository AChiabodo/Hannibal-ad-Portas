# A readable, learnable and contested desktop Match

Status: approved and published as [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63) on 2026-10-20 after approval of Q1–Q31, the eight-ticket breakdown and test seams. Publication does not authorize implementation.

## Problem Statement

The human cannot reliably read, manage or learn the current Match. Squads dwarf settlements and overlap; reducing their representative figures left asymmetric formations. The economy exposes costs without explaining their consequences, the Guide teaches only four opening gestures, and there is no main menu or complete reference. The human reports never encountering the opponent in web play, although the browser host creates an AI Controller. Finally, repeated complete browser matrices make small changes expensive to verify.

Issue #62 completed a narrower visual delivery. Its passing tests and visual verdict do not establish acceptance of these remaining problems, nor authorize this spec's gameplay changes retroactively.

## Solution

Preserve the current procedural art direction while delivering smaller real Squads, richer readable Figures and proportionate settlements. Give Rome and Carthage distinct infantry organization, meaningful costs and survivor-based infantry Payroll. Make groups arrive separately, show losses through stable holes, and rebalance combat and Siege so the number of Squad entities alone does not multiply force.

Provide understandable economic panels, categorized construction, an in-game Encyclopedia and practical Tutorial reached from a proper main menu. Demonstrate a visible, contesting AI opponent through the normal web entry and pacing path. Deliver these behaviors through bounded vertical tickets with fast focused checks and retained complete acceptance gates.

## User Stories

1. As the human, I want Squads and settlements to have readable relative proportions so I can understand and select the theatre.
2. As the human, I want richer Figures and structures in the existing style so the game improves without losing its identity.
3. As the Roman human, I want real infantry sizes of 24, 60 and 120 so I can choose flexibility or concentration.
4. As the Carthaginian human, I want real infantry sizes of 24 and 48 so my army has a distinct organization.
5. As the Carthaginian human, I want Gallic affordability and fragility, Libyan spears and Iberian equipment to remain distinct so smaller contingents are not interchangeable copies.
6. As the human, I want one fixed specialist size of 24 slingers or 12 Numidian cavalry so their numbers remain manageable.
7. As the human, I want an elephant to be one visible beast with appropriate staying power so its abstract strength does not look like many elephants.
8. As the human, I want to choose size when recruiting so the purchase is explicit.
9. As the human, I want recruitment to quote the actual men and resource bill so I know what I receive.
10. As the human, I want the current melee-infantry prices to be the initial 24-man price basis, with proportional larger purchases, so the new scale has a consistent starting economy.
11. As the human, I want infantry Payroll to decrease with surviving men so casualties have understandable economic consequences.
12. As the human, I want quoted costs, actual deductions and next-Season estimates to agree, including rounding, so the economy can be trusted.
13. As the human, I want roughly comparable frontal combined capability from five 24-man Squads and one 120-man Squad so multiplying entities is not a free combat exploit.
14. As the human, I want troop type and actual force to matter in Garrison, Assault and Blockade so entity count does not create automatic military power.
15. As the human, I want small contingents to occupy undefended places so their maneuvering flexibility remains useful.
16. As the human, I want one Figure per surviving infantryman so the drawn count communicates real losses.
17. As the human, I want persistent holes in the ranks and stable survivor positions so a damaged Squad visibly thins without continuous shuffling.
18. As the human, I want line and column to remain distinct at full strength and after losses so formation is legible.
19. As the human, I want picking, standards and condition plates to follow the drawn formation so I can issue orders reliably.
20. As the human, I want selected Squads to arrive at separate legal positions near my destination so they remain individually readable and manageable.
21. As the human, I want groups to pass narrow ground and then redistribute so a ford does not make group movement unusable.
22. As the human, I want group orders to explain partial refusal without losing selection so I can understand constrained destinations.
23. As the human, I want construction grouped by purpose so I can find an appropriate building.
24. As the human, I want unavailable buildings to show their requirements so progression is discoverable.
25. As the human, I want each building to explain its initial cost, workers, effects and timing so I can choose it for a reason.
26. As the human, I want local settlement stocks distinguished from faction Treasury so I understand where spending and income occur.
27. As the human, I want automatic Labour allocation and insufficient staffing explained so building a producer does not promise unconditional output.
28. As the human, I want production and Payroll stated per Season, durations in seconds and a boundary countdown so the strategic clock is understandable.
29. As the human, I want the next-Season estimate to explain its known inputs and uncertainty so it is useful without inventing knowledge.
30. As the human, I want to consult resources, buildings, troops and rules in an Encyclopedia during play so I can recover information without abandoning the Match.
31. As the human, I want a main menu with Play, Tutorial, Encyclopedia and Options so I can find the game's modes and help.
32. As the human, I want Play to lead to configuration with Faction, difficulty and seed so I can start a reproducible Match.
33. As the human, I want returning to the menu to preserve my current Match paused in memory and offer Resume so navigation does not discard progress.
34. As the human, I want a repeatable Tutorial whose practical objectives are checked so I learn by acting.
35. As the human, I want Tutorial chapters for economy/Seasons, building/recruitment, movement/combat and territory/Siege so I can learn the whole opening-to-conflict loop.
36. As the human, I want exercise-controlled early opposition and normal AI in the final chapter so learning is safe before becoming a real test.
37. As the human, I want brief Guide/context help alongside the Tutorial and Encyclopedia so normal play remains supported.
38. As the human, I want an enemy contact actually rendered, announced and reachable by camera so AI activity is perceptible.
39. As the human, I want difficulty-appropriate early contact and concrete enemy pressure so the Match is contested.
40. As the human, I want the opponent to obey its own Observation and the same economy so pressure is not produced through cheating.
41. As the developer, I want focused checks within 60 seconds and a browser smoke within 90 seconds on a recorded environment so routine feedback is practical.
42. As the developer, I want browser matrices selected by responsibility, with complete pre-integration acceptance retained, so faster checks do not silently remove essential coverage.
43. As the reviewer, I want real comparative images and observed web play, with unrun gates stated, so hashes and headless stepping are not mistaken for visual or gameplay acceptance.

## Implementation Decisions

- **Shared architecture:** extend the existing procedural generators, PixelBuffer/PixiJS adapters, String table, public Controller/Command and filtered Observation. Keep seeded determinism, integer authoritative state, aggregate Squads and existing fog knowledge limits. Presentation alone remains hash-neutral; deliberate recruitment/combat/movement rule changes may change authoritative hashes with explained evidence.
- **Roster and recruitment:** Roman melee infantry uses 24/60/120; Carthaginian melee infantry 24/48. Specialists have one real size: 24 slingers and 12 Numidian cavalry. An elephant remains one Figure with separate abstract combat strength. Size is chosen at recruitment; there is no split/merge feature. Preserve recruited capacity separately from survivors so losses cannot silently change purchase size or formation width.
- **Starting geometry:** Roman line candidates are 6 files × 4 ranks, 10 × 6 and 12 × 10. A later real-image comparison evaluates 64 at 8 × 8 against 60; neither 36 nor 64 is an additional recruitment option now. A preferred 64 comparison is a proposed substitution to be explicitly accepted, with cost/combat/AI contracts revalidated before switching the baseline. Column and Carthaginian layouts must be bounded, distinct and compatible with their real counts; exact dimensions are implementation/art work rather than invented here.
- **Figure treatment:** restore 1:1 surviving infantry Figures. Losses leave persistent empty slots including interior holes and do not continuously recenter survivors. These slots are visual derivations, not individual soldier state or historically exact casualty locations. Inspect full and damaged formations in every facing. Enrich figure equipment and structures, compare compact native and higher-resolution alternatives, and preserve meaningful detail at actual display sizes. More source pixels do not guarantee more visible detail after reduction.
- **Economic arithmetic:** initial melee-infantry resource prices use current costs as the 24-man basis, with 1/2.5/5 multipliers for Rome and 1/2 for Carthage, without bulk discounts. Infantry Payroll follows type and surviving men. Specialist prices, starting stocks and recruitment pace require measured calibration. Choose and document deterministic integer-compatible invoice/accrual/rounding behavior; quotes, execution and Forecast must agree, and per-Squad rounding must not create a free fragmentation strategy. Exact formulas are not claimed settled or implemented.
- **Military balance:** recalibrate combat and Siege together around actual force, troop type, aspect and condition. Five 24-man Squads versus one 120-man Squad is a controlled equivalence target, not a promise of identical outcomes. Preserve meaningful flanking/flexibility and concentration. Garrison, Assault, Blockade, ammunition and Morale effects must not scale merely with the count of entities. Small forces can still occupy undefended places. Retain existing Faction Siege asymmetry unless separate balance authority changes it.
- **Group movement:** the shared Command/rules path assigns deterministic legal arrival positions near a destination. Results must not depend on selected-ID iteration order accidentally. Temporary overlap in narrow passages is allowed. Preserve target semantics for explicit Attack, Garrison, Assault and Blockade; do not turn settlement orders into arbitrary ground movement. Existing selection, partial refusal, pause and replay behavior remain comprehensible.
- **Construction:** show one of four purpose lists at a time: Produzione (Fattoria, Legnaia, Cava, Miniera); Economia e scorte (Mercato, Granaio); Popolazione e sviluppo (Casa, Villa, Foro); Supporto militare (Castrum). Keep applicable locked offers visible with their requirements. Explain secondary effects: Granaio expands all-resource capacity; Villa/Foro raise Tier; Castrum is Roman winter support, not a barracks. Do not fabricate unavailable Carthaginian buildings.
- **Economic UI and reference:** explain local stocks, global Treasury, automatic Labour allocation, staffing-dependent production, housing/storage limits, costs, unlocks and the next Season. Use seconds for durations and Seasons for recurring flows. Forecast only what the human's Observation supports, labelled as an estimate when needed. Reference entries and contextual panels derive factual values from canonical content/rules rather than duplicate hard-coded balances. Encyclopedia covers economy, roster, Orders, movement, conditions, territory and Siege.
- **Menu and learning:** Play, Tutorial, Encyclopedia, Options; Play leads to existing configuration. Preserve paused in-memory Match and expose Resume on menu return. Opening reference/options must preserve the suspended Match; explicit Resume controls resumption. Keep existing leave/new/restart safeguards. Tutorial is separate repeatable practice with real Commands and objectives checked from permitted outcomes. Early opposition is exercise-controlled; final chapter uses the normal AI. Never award completion merely because Next was clicked. Tutorial progress cannot modify a suspended normal Match. Persist only existing presentation preferences, not an unrequested save system.
- **AI and evidence:** use the shipped Controller in the ordinary web host and pacing path. Contact/pressure limits in active simulation minutes are Tiro 5/10, Centurio 3/6, Imperator 2/4. A controlled acceptance scenario starts with the normal economy and viable defended/contested targets, not fabricated enemy resources or a demonstration army. Count contact in the human's permitted sight and separately demonstrate rendered troops and contact Notice/camera navigation. Pressure requires observed meaningful contention/combat, not merely submitted/repeated Commands. Record seed, Faction, difficulty, active ticks, progress and why a target was not reached. Do not guarantee attack through every arbitrary human counterstrategy; use reproducible passive/controlled-human acceptance policies. A proposed initial headless matrix uses ten fixed, distinct seeds × both human Factions × all difficulties, declared before tuning; require every sampled case to meet the targets or report it as a failure, not silently drop seeds. Use a small representative normal-browser matrix and an observed normal-interface playthrough for both Factions, covering all difficulties across the evidence set. Exhaustive generated-seed coverage is not claimed.
- **Verification workflow:** inventory existing coverage before consolidating the 19 browser specs. Focused checks, smoke, targeted feature checks, complete functional regression and visual-evidence generation are separate named responsibilities. Prefactor only where needed for this workflow, keeping the existing test seams. No global timeout/retry inflation, blanket assertions removal or adoption of guessed pixel hashes. Fast checks do not establish full acceptance; software WebGL frames do not establish hardware 60 fps.

## Testing Decisions

- Prefer behavior through existing seams: public Controllers/Commands and their faction-filtered Observations for rules; public UI/order/Guide models for explanations and navigation; existing browser hooks plus actual pointer/keyboard actions for host, rendering and input integration. No privileged UI or AI state access is added for testing.
- Good tests exercise purchase, payment, losses, refusal, movement, combat, learning objectives or visible feedback. They must fail on the user's defect, not just on an exception or a changed internal helper. Avoid duplicating implementation formulas in assertions.
- Recruitment/Payroll scenarios cover each allowed size, invalid/foreign/locked/unaffordable requests, casualties across Season boundaries, exact quote/execution agreement and deterministic Replay. Keep single-creature count separate from strength.
- Combat/Siege scenarios compare equal-man configurations, isolate morale/volley/rounding exploits, verify Garrison/Assault/Blockade outcomes and retain unopposed capture. Record a defensible tolerance and metric before claiming approximate equivalence; do not select them after seeing a favorable result.
- Movement scenarios cover multi-selection, partial refusals, impassable destinations, constrained arrival space, narrow passages, pause queues and deterministic replay through the same Command path used by human and AI.
- UI/model checks cover all categorized offers and reference entries, staffing/limits, seconds/Season displays, Forecast consistency, menu suspension and actual Tutorial objective transitions. Browser samples verify real pointer/keyboard flows and scrolling instead of repeating every arithmetic combination in Chromium.
- Art acceptance requires actual comparative image inspection at 1280×720 and 1920×1080, both Factions, all four facings, line/column, full/damaged Squads, selection, overlapping groups and relevant visible/remembered/unknown states. Check low/high and odd zooms, including 1/2/3/4; preserve support for all existing integer zooms. Review Figures, full Squads and structure proportions together; no binary images are committed.
- AI checks use deterministic headless progression for breadth, then ordinary browser pacing for integration. Explicit stepping or command logs alone cannot pass the normal-web gate. Record active simulation time separately from wall time and pause/speed settings.
- Measure focused ≤60-second and smoke ≤90-second targets on a named environment with warm/cold setup distinguished. Provisioning/install time is reported separately. Complete acceptance remains required before integration; each ticket carries its own checks rather than deferring them all to the final ticket.
- Existing public Match, UI model, browser-hook, Atelier and Replay practices are the prior art. Reuse them; there is no separate private simulation test surface.

## Out of Scope

- Implementation as part of spec/ticket publication; changing existing unrelated issue status or dependencies.
- Splitting/merging Squads, individually simulated men, full physical collision/occupancy simulation or a replacement pathfinding system.
- Committing raster/audio assets, image-generation models, a replacement renderer, isometric projection or a changed art direction.
- Adding 36/64 as additional recruitable sizes, new troop types, a new technology tree or unrelated economic rules.
- Persistent saves, player-facing Replay, multiplayer, mobile, new audio, release/deployment or automatic global balance/performance acceptance.
- Claiming the normal web AI defect fixed from a single seed, an Observation-only contact, a submitted order or the old green full-Match test.

## Further Notes

- The complete Q1–Q31 design and diagnostic limitations are recorded in the adjacent design document. The domain decision is ADR-0026; it extends aggregate Squads rather than replacing ADR-0004. Final visual dimensions, column layouts, numeric balance and rounding are implementation decisions subject to the stated contracts, not facts already verified.
- Live tracker refresh on 2026-10-20 found #62 closed and #51, #29, #31, #32, #30 and #48 open. The new work needs its own spec and children. Do not reopen #62, modify #51 or close existing release gates on publication.
- #29 owns global tournament balance, including its 200-Match, win-rate and duration requirements. This work owns the newly approved rules and bounded balance evidence, and must document the new baseline for #29 without claiming those global gates passed. #31 retains hardware/full-density performance; #32 retains release. No reverse dependency on those broad gates is introduced for work they will later assess.
- The initial seed-1, passive-Roman headless probe found first enemy sight at 175.4/85.4/70.4 active seconds for Tiro/Centurio/Imperator. It bypassed normal browser timing and did not prove rendered visibility or successful pressure. Its script/report were temporary diagnostic artifacts, not a committed regression or acceptance record.
- The Player approved the eight-ticket breakdown and test seams, then authorized publication. The spec is #63 and its children are #64–#71; the adjacent ticket index records native blockers and publication verification. Published bodies contain their complete behavior, acceptance, tests and exclusions rather than relying on uncommitted local files. Implementation remains a separate instruction.
