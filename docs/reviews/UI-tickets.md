# Browser UI delivery — published issue specifications

Published on 2026-10-19 after explicit approval of Q1-Q23 in [UI-review.md](UI-review.md) and authorization to publish. The roadmap is [#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51). U1-U8 remain local aliases for the published children below. Implementation has not started.

| Alias | Published issue | Native blockers |
| --- | --- | --- |
| U1 | [#52 — Essential HUD information](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/52) | None |
| U2 | [#53 — Browser Match, setup and result](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/53) | #52 |
| U3 | [#54 — Desktop layout and navigation](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/54) | #53 |
| U4 | [#55 — Contextual Commands](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/55) | #54 |
| U5 | [#56 — Terrain readability](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/56) | #55 |
| U6 | [#57 — Settlements and fortifications](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/57) | #55 |
| U7 | [#58 — Squads and tactical feedback](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/58) | #55 |
| U8 | [#59 — Guidance and visual acceptance](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/59) | #56, #57, #58 |

Readback verified the complete published body and title of all nine open issues, child triage labels, eight native sub-issue links and nine native blocker edges. GitHub line endings were normalized for body comparison. The roadmap embeds the full approved design and a Q1-Q23 delivery-coverage table; each child repeats the mandatory shared constraints. No published issue depends on these uncommitted local files for its specification. Existing issues and their dependencies were not modified. No commit or push was performed.

## Roadmap specification

**Title:** Browser UI — a complete, readable desktop Match within the existing procedural style

The browser currently exposes a small command demonstration rather than the complete RTS: essential detail is clipped, the viewport is fixed, the opponent is not connected, and economy and Siege actions lack visible controls. Deliver a complete human Match with readable information, explicit Commands and improved procedural art, preserving the exact current asset-definition and rendering method.

The approved design record is `docs/reviews/UI-review.md`. Track eight children:

| Alias | Responsibility | Blockers |
| --- | --- | --- |
| U1 | Repair essential information | None |
| U2 | Complete browser Match host, setup and result | U1 |
| U3 | Adaptive desktop layout and navigation | U2 |
| U4 | Contextual military, economy and Siege panels | U3 |
| U5 | Terrain and Resource readability | U4 |
| U6 | Settlement and fortification artwork and picking | U4 |
| U7 | Squad artwork and tactical feedback | U4 |
| U8 | First-entry guidance and integrated visual acceptance | U5, U6, U7 |

The order follows the approved delivery sequence. The three art tickets share contracts and must preserve each other's changes; the dependency graph does not authorize concurrent writers in shared modules.

### Shared requirements for every child

- Preserve the **exact existing** declarative asset-definition approach, pure pixel generators, PixelBuffer boundary, PixiJS adapters, deterministic generation and Atelier workflow. Extend these rather than replacing them or adding a second drawing path.
- No external image, font or audio assets; no image-generation model. Keep existing palette identity, bitmap glyphs, orthogonal 16x16 Tiles, sprite projection, individual soldier rendering and integer map zoom (ADR-0002 and ADR-0007).
- Player-facing words remain Italian through the String table. Code, issues and documents remain English.
- Human actions use the same Controller/Command seam as other Players. Presentation must not change simulation rules, balance, authoritative hashes, pathfinding or formation geometry.
- All views use the Faction's allowed knowledge. Remembered contact data does not provide live ownership, wall damage, Garrison, enemy stocks or unseen Siege progress.
- Add meaningful verification for each changed user flow as part of its ticket; U8 is not permission to postpone functional checks. Use pointer/keyboard paths as well as the shared hooks, and report unrun gates explicitly.
- Art and layout changes need actual rendered evidence, not only unchanged pixel hashes or a passing build. Coordinate performance with #31 without claiming software WebGL screenshots prove hardware frame rate.
- Applicable visual evidence must cover both Factions, supported zooms and visible/remembered/unknown information, selection and critical states. Explain non-applicable cases rather than silently omitting them. Validate UI at 1280x720 and 1920x1080; preserve the 60 fps full-density target without reducing density or shrinking the map.

### Roadmap acceptance

- [ ] U1-U8 are linked and completed with their own evidence.
- [ ] A human can configure and play a Match as either Faction against the existing AI, using visible controls, through the actual ending and a comprehensible result.
- [ ] At 1280x720 and 1920x1080, essential information and Commands remain readable and reachable, including long lists and mixed selections.
- [ ] Atelier and representative in-game scenes demonstrate the retained visual identity and improved readability across both Factions, supported zooms and knowledge states.
- [ ] Existing verification responsibilities are linked: #28 browser E2E, #30 audio, #31 performance, #32 release. #29 remains owner of balance changes and its content data is the source of displayed costs/times.
- [ ] No existing issue, parent or release gate is closed merely because this roadmap is complete; each retains its own acceptance criteria.

Not included: saves, player-facing replay UI, multiplayer, mobile support, new combat/economy rules, richer enemy-memory rules, replacement renderer or art pipeline.

### Tracker check before publication

Read-only refresh on 2026-10-19 found no existing dedicated UI/art roadmap or child tickets to reuse. #28 and #30 had no open blockers; #29 was blocked by #27; #31 was blocked by #28; #32 was blocked by #29, #30 and #31. Those native dependencies were preserved. The U1-U8 edges were subsequently published as native dependencies using the issue numbers in the index above. Do not add a reverse dependency from #28 to the final UI acceptance ticket that would make verification wait on itself. #48 is an AI refactoring ticket with unchanged behaviour, not a blocker of this design.

## U1 — Repair essential HUD information and list access

**Problem:** detail rendering silently drops Order/refusal and Works; growing lists hide entities; pause is not visually explicit.

### Acceptance criteria

- [ ] Squad Order, refusal and settlement Works are accessible; long labels/values cannot overlap or disappear silently.
- [ ] Critical order information remains prominent, with secondary details scrollable where necessary.
- [ ] Lists support overflow, counts and selection retention as the number of entities grows or selected entities disappear.
- [ ] Pause/running state is explicit and updates through the same keyboard and visible-control actions.
- [ ] Rendered regression examples include a refused order, an active Work, long text and an overflowing list.

Keep this repair narrow and carry it through U3/U4. Do not redesign the layout or add new Commands here.

## U2 — Complete the browser Match host, setup and result

**Problem:** the browser is fixed to Rome and an opening army, and does not run an opposing AI Controller.

### Acceptance criteria

- [ ] Setup selects either Faction and an existing difficulty, with an optional field accepting an explicit map seed; new Matches propose a fresh valid seed through the existing deterministic generator.
- [ ] The actual seed is visible/copyable. Restart preserves seed/Faction/difficulty; New Match returns to setup and proposes a fresh seed.
- [ ] The browser hosts the existing complete rules and both Controllers, preserving Observation filtering, command validation, outcome rules and human Match time policy.
- [ ] Initial state follows the existing Match rules/content rather than depending on the Roman demonstration army. Necessary browser adapters reuse the existing rule and Controller contracts.
- [ ] The shared human submission surface can issue the existing military, construction, recruitment and Siege Commands. U4 supplies their complete visible panels; do not claim full human playability before U4.
- [ ] Pause and 1x/2x/3x pacing work for both Players, without simulation progress while paused or wall-time catch-up after resume.
- [ ] Victory/defeat shows the actual ending reason, stops the simulation and permits inspecting only the final known situation, restarting or returning to setup. Leaving an active Match asks for confirmation.
- [ ] Integration scenarios cover both Factions, AI decisions, setup/restart semantics, and a real rules-driven ending using the same submission surface; no fabricated UI outcome.

Do not rebalance the Factions, add saves/replays, reveal the enemy at the end or introduce a human time limit. Coordinate complete visible playthrough evidence with U4/U8 and #28.

## U3 — Adaptive desktop layout, navigation and preferences

**Problem:** the fixed 640x480 canvas wastes desktop space and renders small text and controls.

### Acceptance criteria

- [ ] A large map uses the available desktop viewport, with top readouts, a contextual bottom area, adjacent Minimap and collapsible side navigator.
- [ ] Top readouts show Year, Season and Season progression, Treasury, pause and speed, clearly distinguished from per-settlement stocks. Local resources clearly name their settlement.
- [ ] Integer UI scaling is independent of map zoom, targeting readable 2x glyphs where space permits. Scale changes and resizing keep display geometry and picking aligned.
- [ ] At 1280x720 and 1920x1080, essential controls are reachable. Collapse the navigator and scroll secondary detail before sacrificing primary Commands, critical state or Minimap. Indicate an unsuitable requested scale; do not silently change it.
- [ ] Below the reference minimum, recommend a larger desktop window and keep controls accessible rather than silently clipping them; mobile remains outside scope.
- [ ] One list click selects; double-click centres. A visible action centres the current selection. Minimap click/drag moves the camera without issuing Commands or changing selection.
- [ ] Minimap ownership reflects only known current ownership; stale knowledge is not drawn as confirmed live ownership.
- [ ] UI scale, navigator visibility and guide dismissal persist locally, with reset/reopen controls. Storage failures do not block play. Do not persist Match state or tactical selection; coordinate future audio preferences with #30.
- [ ] Rendered resize/scale/list/navigation checks demonstrate no overlap or unreachable controls, and no accidental orders from Minimap interaction.

Use the existing rendering method for every new interface component. Military/economy panel content belongs to U4.

## U4 — Contextual military, economy and Siege Commands

**Problem:** the human cannot discover or invoke the full RTS vocabulary, and selection detail does not explain group state or command outcomes.

### Acceptance criteria

- [ ] Squad detail prioritizes type, current/max men where available, current/max Morale, current order/destination/refusal, Fatigue, Ammunition, Payroll and known Supply/quarters conditions.
- [ ] Multiple selection shows composition, total men, Morale range and critical exceptions. Opening an individual exception preserves a way back to the group.
- [ ] Show known eligibility for mixed selections, preserve selection, allow rule-defined partial execution and summarize actual individual refusals. Do not invent all-or-nothing group rules or predict unseen path results as facts.
- [ ] Buttons and existing shortcuts use one submission/targeting path. Show the armed action, target requirements, unavailable reasons and pending/applied status. Escape cancels an armed target, not already submitted Commands. Ordinary military orders do not require confirmation dialogs; leaving an active Match does.
- [ ] Right-click ground movement and existing attack-move shortcuts remain. Attack, Garrison, Assault and Blockade have explicit contextual actions; ordinary clicks do not implicitly start Siege or enter Garrison.
- [ ] Orders while paused are visibly pending; successive movement orders are not shown as waypoint itineraries. Preserve existing queue/execution semantics.
- [ ] Visible numbered controls expose Control group membership, composition, recall and shortcuts alongside existing keyboard binding/recall.
- [ ] Settlement detail separates overview, construction and recruitment, showing named local stocks, labelled automatic Labour allocation, active progress, and content-backed costs/times/requirements/refusal reasons.
- [ ] Siege controls explain Faction-specific availability, target requirements and known Wall/Gate/breach/Garrison/ram/Blockade state. No enemy stock figures or unsupported remembered structural state are invented.
- [ ] Real visible-control scenarios cover movement, attack-move, attack, hold, withdraw, line/column formations, Control groups, mixed eligibility, pause, construction, recruitment, Garrison and the Factions' permitted Siege paths. Connect to #28's E2E ownership.

Do not add manual workers, new queue/cancel mechanics, path waypoints or a rule-bypassing UI API. U7 owns in-world visual feedback and notices; U4 owns panel information and submission feedback.

## U5 — Improve terrain and Resource readability within the current generators

**Problem:** repeated high-frequency ground detail competes with soldiers and interactive objects.

### Acceptance criteria

- [ ] Reduce distracting contrast in ordinary terrain while keeping Terrain types, boundaries, roads, fords and Resource markers distinguishable at supported zooms.
- [ ] Preserve existing palette identity, terrain-generation rules, deterministic seed behavior, Tile scale and autotiling method; no map or pathfinding changes for visual convenience.
- [ ] Extend current generators/specifications and catalogue; regenerate affected artifacts and deliberately review changed hashes.
- [ ] Atelier comparisons and representative in-game scenes demonstrate better figure/ground separation, including visible and remembered ground.

No replacement texture system, external art, playable elevation or reduction of world density.

## U6 — Render and pick settlements and fortifications

**Problem:** settlement locations exist in the rules and Minimap but lack recognizable and selectable main-map structures.

### Acceptance criteria

- [ ] Extend the existing generators/catalogue to represent settlements and relevant Walls, Gates, breaches and Siege structures, with recognizable silhouettes and condition states.
- [ ] Integrate through the existing PixelBuffer/PixiJS adapters and projection; define drawn geometry and picking consistently so visible structures can open the correct contextual detail.
- [ ] Ownership and live condition derive only from allowed Observation data. Unobserved known contacts are visibly last-known; never read hidden current damage/ownership or invent historical detail absent from memory.
- [ ] Buildings, Squads and terrain layer coherently without ambiguous selection of overlapping objects; the visible object selected and resulting panel agree.
- [ ] Atelier and in-game evidence cover both Factions, intact/damaged/breached states and visible/remembered/unknown cases, using reproducible scenarios.

Do not change collision, footprints in simulation, pathfinding, capture/Siege rules or the enemy-memory model to fit artwork.

## U7 — Squad readability, tactical feedback and notices

**Problem:** formations merge into striped blocks and the scene does not communicate orientation, condition and order outcomes clearly enough.

### Acceptance criteria

- [ ] Improve type/Faction recognition through equipment, silhouette and restrained insignia as well as colour, extending existing figure definitions and rendering.
- [ ] Preserve individual soldiers and actual formation/strength rendering at all supported map zooms. Do not replace formations with aggregate icons or alter formation geometry.
- [ ] Selected Squads show readable contextual indicators with Morale as the primary condition indicator, clear facing and distinct movement/attack-move feedback, extending the existing destination marker. Healthy unselected Squads do not carry permanent full labels/bars.
- [ ] Critical signals use shape/text as well as colour and remain useful over terrain and remembered-ground treatments.
- [ ] Persistent conditions and brief actionable event notices are distinct, deduplicated, and accessible through a compact current-Match history. Clicking a location-bearing notice centres the known location when permitted; stale or removed targets are handled explicitly. Notices never automatically pause ordinary play or reveal hidden information.
- [ ] Initial UI warning thresholds: positive Morale <=25% of type maximum; Fatigue >=15/20; zero Ammunition only for applicable types; winter within 30 simulation seconds. Actual Rout, unpaid Payroll and Supply conditions follow rules. These thresholds change presentation only.
- [ ] Economic forecasts are labelled estimates and only shown when derivable correctly from known data including Season-boundary production/tax/Payroll ordering; current Treasury alone does not prove future nonpayment.
- [ ] Atelier and representative scenes cover both Factions, types, zooms, mixed selections and critical states. Verify notices/markers with pause and speed changes; coordinate synthesized cues with #30 without making audio necessary to understand them.

No balance changes, new soldier simulation, omniscient notifications or replacement rendering pipeline.

## U8 — First-entry guidance and integrated visual acceptance

**Problem:** a new human must currently discover controls and objectives outside the game, and asset correctness alone does not establish in-game readability.

### Acceptance criteria

- [ ] Setup briefly explains Faction choice, difficulty and the actual Match objective in Italian.
- [ ] The optional guide starts paused, waits for the human to begin, and teaches selection, movement and opening a settlement through real UI paths. It can be skipped, dismissed and reopened without exposing enemy knowledge or changing rules.
- [ ] A new human can find Commands, understand selection and interpret an order's result without consulting README; document the observed walkthrough rather than asserting usability.
- [ ] Integrated visual evidence covers 1280x720 and 1920x1080, both Factions, supported zooms, fog knowledge states, long lists/text, individual/multiple selection, pending/refused orders and critical conditions.
- [ ] Reproducible scenarios demonstrate field command, economy, Siege and Match result through the delivered visible UI; include complete browser Matches for both Factions with #28.
- [ ] Review actual screenshots/interaction outcomes alongside deterministic artifact/hash checks. Record remaining defects and do not treat matching hashes as visual-quality approval.
- [ ] Link #31 hardware/full-density performance evidence, #30 audio status and #32 release requirements separately. Explicitly mark any unrun external/browser/performance gate; U8 does not duplicate or silently waive them.

No mobile expansion, campaign/tutorial rule variants, saves, replay interface or release publication as part of this ticket.
