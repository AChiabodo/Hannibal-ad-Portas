# Browser UI review and approved direction

Reviewed on 2026-10-19 at commit `f6c9e22`. This is a design record and delivery roadmap, not evidence that the proposed work has shipped.

## Evidence and current limitations

The review inspected the open GitHub issues, source, the game page and the Atelier. Chromium software WebGL was used because Browser discovery returned no available browsers and opening an in-app tab failed with `Browser is not available: iab`. Desktop captures covered 1440x900 and 1280x720. Boot, selection, pause and applying a movement Command were exercised. No application errors were observed during the initial boot check. A complete Match, Firefox and hardware frame rate were not verified.

- `src/render/view.ts` fixes the canvas at 640x480 and the viewed Faction at Rome.
- `src/ui/hud.ts` reserves seven detail lines but supplies nine for a Squad and at least eight for a settlement. Order, refusal information and Works are cut off. Lists also stop when their space runs out.
- `src/render/game.ts` connects the human Controller, without an AI opponent deciding in the browser loop.
- `src/render/controls.ts` exposes movement and formation gestures, but no visible construction, recruitment or Siege controls.
- The main theatre lacks settlement and fortification artwork and map-based settlement picking.
- The Minimap does not navigate on click; its settlement colours use original map placement rather than current known ownership.
- Squad detail shows raw quantities without enough context, and multiple selection is represented by the first Squad's detail.

## Approved decisions

The user approved these decisions on 2026-10-19:

1. A desktop layout with a large map, a contextual bottom panel and a collapsible side navigator. The Minimap is adjacent to the contextual area and navigable.
2. Full tactical information for selected Squads, with concise signals for other Squads in difficulty. Multiple selection needs a group summary and individual exceptions.
3. A brief, dismissible first-entry guide covering selection, movement and opening a settlement.
4. Preserve the visual identity and the **exact existing method of asset definition and rendering**, extending it where necessary. This is stricter than merely keeping assets procedural.
5. Give military command more information: current order, refusal, destination, men, Morale, Fatigue, Ammunition and Supply where known.
6. Follow the delivery order below.

The visual direction keeps the existing earth, bronze, parchment, olive and water palette, bitmap glyphs, individual soldier figures and formations. Improve hierarchy, silhouette, spacing and feedback within that vocabulary.

## Definition and rendering constraints

Keep the current pure pixel generators, declarative content/specification approach, PixelBuffer boundary and PixiJS adapters. Extend their existing contracts and catalogue rather than introducing a replacement art system, a second drawing path or another rendering engine. Preserve deterministic generation, regeneration and the Atelier inspection workflow. No external image, font or audio assets and no image-generation model (ADR-0002).

Keep orthogonal 16x16 Tiles, existing sprite projection and integer map zoom. Do not add playable elevation or change collision, pathfinding, formation geometry or combat to improve the picture (ADR-0007). Interface scale is separate from map zoom; exact sizes remain implementation choices to verify visually.

All player-facing text remains Italian through the String table. All human actions remain Commands through the Controller seam. Presentation changes must not change the simulation state hash. Views must preserve visible, remembered and unknown information rather than consulting hidden current enemy state.

## Delivery order and acceptance targets

### 1. Repair essential information

Make Order, refusal and Works accessible without silent clipping. Make pause explicit. Support growing lists with accessible overflow and selection retention. Preserve these repairs when the layout changes.

### 2. Complete the browser Match

Connect both Factions and the existing AI; provide construction, recruitment and Siege actions through existing Commands. Show costs, duration, requirements and reasons an action is unavailable from current content and rules. A Match must reach an understandable result. This is a functional delivery gap, not artwork polish.

### 3. Deliver the desktop layout

Use the available desktop viewport with readable bitmap text and useful click targets. Put calendar, Treasury, pause and speed in the top bar. Keep per-settlement stocks clearly associated with their settlement. Use contextual bottom detail and Commands plus a collapsible navigator with counts and scrolling. The Minimap navigates and reflects known current ownership. Verify at 1280x720 and 1920x1080; mobile remains outside v1 scope.

### 4. Improve theatre and tactical readability

- Draw and pick settlements, Walls, Gate, breaches and relevant Siege structures through the existing pipeline. Derive displayed condition and ownership from permitted knowledge.
- Reduce distracting terrain contrast while preserving Terrain identity and Resource marker readability.
- Differentiate Factions and Squad types by silhouette and equipment as well as colour. Preserve the visible men and formation system.
- Show orientation, contextual Morale and condition, multiple-selection summary and distinct movement/attack-move feedback. Retain the existing destination marker and improve its meaning.
- Avoid permanent labels and bars on every healthy, unselected Squad. Critical states need more than colour alone.

### 5. Guide and verify

Add the approved brief guide, actionable high-priority notices and coordinate synthesized feedback with #30. Verify real pointer/keyboard flows and complete Matches for both Factions with #28. Verify full-density performance under #31 and final delivery under #32. Software WebGL screenshots are not 60 fps evidence.

## Existing ticket coordination

No dedicated open UI/art overhaul ticket existed at review time. #31 owns full-density rendering performance, #32 final release evidence, #28 browser verification, #30 synthesized audio and #29 balance data. The new roadmap and art tickets complement these responsibilities; they do not claim those gates have passed.

## Design record

The approved layout does not prescribe every pixel dimension or an implementation technology change. The rounds below record the resolved interaction decisions. Exact spacing and artwork remain implementation choices to assess against the agreed visual acceptance scenes. No new domain terms were introduced, so the glossary is unchanged. These reversible presentation decisions do not require a new ADR; ADR-0002 and ADR-0007 remain authoritative.

### Interview round 2 — approved decisions

The user explicitly approved Q4-Q11 on 2026-10-19. These are requirements for the design, not evidence of implementation:

- **Q4 — Desktop scale:** validate from 1280x720 upward, adapt the map viewport, and offer independent integer UI scaling, defaulting to readable 2x glyphs where the layout fits.
- **Q5 — Multiple selection:** show total men, composition, Morale range and critical exceptions; selecting an exception opens its individual detail while preserving a way back to the group. Never represent mixed conditions by the first Squad alone.
- **Q6 — Action targeting:** visible buttons and shortcuts arm the same Command; indicate the pending target and let Escape cancel it. Explain unavailable actions and refusals explicitly. Confirmation is for leaving a Match, not routine military orders.
- **Q7 — Navigation:** a single list click selects, double-click centres; Minimap click/drag moves the camera without issuing Commands. Provide a visible way to return to the selected entity.
- **Q8 — Warnings:** use persistent critical conditions and short actionable event notices, with duplicate suppression. Derive rule-backed conditions from existing rules; distinguish predictive warnings from facts. Do not automatically pause the Match for ordinary warnings.
- **Q9 — Settlement detail:** separate overview, construction and recruitment; show local stocks, automatic Labour allocation, active progress, costs, requirements and explicit unavailable reasons. Preserve the existing Command semantics rather than introducing new economy rules.
- **Q10 — Art ticket boundaries:** prepare separate work for terrain/readability, settlements/fortifications, and Squad readability/feedback, all extending the existing definition and rendering method. Exact ticket scope and readiness remain subject to the remaining design decisions.
- **Q11 — Entry and guide:** select Faction and difficulty before the Match, state the objective briefly, and offer skippable contextual guidance with a way to reopen it. The guide starts paused, waits for the Player to begin, and exposes no enemy knowledge.

Round 3 resolves dependent details such as fallback layouts, mixed-selection Command eligibility, pause feedback, warning policy and fortification knowledge states.

### Interview round 3 — approved decisions

Source checks for this round: `input/human.ts` snapshots the selected IDs for each queued order and drains them on the next deciding tick; `sim/movement.ts` applies eligible Squads independently and later valid movement orders replace their routes. These are not waypoint orders. `sim/siege-fog.ts` retains contact identity, position, type and sighting time, not historical wall condition or enemy stocks. Live Siege fronts are filtered by ownership, besieger or own sight. Presentation must not invent richer memory than the Observation supplies.

The user explicitly approved Q12-Q19 on 2026-10-19. These are design requirements, not evidence of implementation:

- **Q12 — Limited space:** collapse the navigator and scroll secondary detail before sacrificing primary Commands, critical state or Minimap; show when a requested integer UI scale cannot fit. Below 1280x720 show a desktop size recommendation rather than silently clipping controls. Mobile remains out of scope.
- **Q13 — Partial group orders:** preserve per-Squad rule eligibility, show which selected Squads can execute an action, and summarize partial success and individual refusals. Do not make a mixed group artificially all-or-nothing or silently change its selection.
- **Q14 — Orders during pause:** visibly distinguish pending Commands from applied orders; disclose that successive movement Commands for one Squad are not waypoints. Escape cancels an armed target, not Commands already submitted. Keep current execution semantics.
- **Q15 — Tactical overlays and control groups:** retain individual soldier rendering at every supported map zoom, add concise contextual symbols and readable selected-state indicators, and expose control-group membership/recall with visible numbered controls. Do not substitute aggregate icons for formations.
- **Q16 — Warnings:** prioritize rule-backed danger and explicit refusals, retain a compact actionable notice history for the current Match, and use conservative labelled forecasts only when derivable from the Player's known data, including Season-boundary effects. Initial presentation thresholds: positive Morale at or below 25% of the Squad type maximum; Fatigue at least 15/20; zero Ammunition only for types that use it; winter approaching during the final 30 simulation seconds before its boundary. These are UI conventions to validate visually, not simulation or balance changes.
- **Q17 — Remembered places:** visually distinguish observed, last-known and unknown settlement information. Display only details actually retained by the Faction; hide unavailable current quantities and never extrapolate an unseen Siege's progress as a live fact.
- **Q18 — Match result:** clearly show victory/defeat and the actual ending reason, offer a new Match or return to setup, and allow inspection of the final known situation with simulation stopped. Do not reveal hidden enemy information or add save/replay UI to this work.
- **Q19 — Visual acceptance:** require Atelier evidence and representative in-game scenes at supported zooms, both Factions, fog states, selection and critical conditions; validate readable controls at 1280x720 and 1920x1080. Pixel-hash consistency alone does not establish visual quality. Coordinate performance evidence with #31.

### Interview round 4 — approved decisions

The user explicitly approved Q20-Q23 on 2026-10-19. These are design requirements, not evidence of implementation:

- **Q20 — Contextual gestures:** retain right-click ground movement and the existing attack-move shortcuts; expose attack, Garrison, Assault and Blockade as explicit contextual actions with targeting and requirements. A plain click must not implicitly launch a Siege or move a Squad into Garrison. Keep both existing gestures and visible Commands discoverable through contextual help.
- **Q21 — Match setup:** offer a new map seed for each new Match and an optional explicit seed field, with the actual seed visible and copyable for reproduction. A restart of the same setup preserves seed, Faction and difficulty; a new Match may choose a fresh seed. Keep this within the existing deterministic map generator.
- **Q22 — Preferences:** remember only presentation preferences locally (UI scale, navigator visibility and first-entry-guide dismissal), with reset/reopen controls; keep Match state and tactical selection out of this persistence. Browser storage failure must not block play. Audio preferences remain coordinated with #30.
- **Q23 — Delivery breakdown:** prepare one UI roadmap with eight bounded child scopes: essential information repairs; complete browser Match and setup/result; adaptive desktop layout and navigation; contextual military/economy/Siege panels; terrain readability art; settlement/fortification art; Squad readability and tactical feedback art; guidance and visual acceptance. Repairs precede integration, functional integration precedes delivery of dependent panels, and the three art scopes share the existing pipeline without replacing it. Guide/visual acceptance follow the relevant UI/art work; existing #28/#30/#31/#32 retain their responsibilities. Publish-ready tickets need explicit acceptance criteria, dependencies and exclusions, with no claim of shipped work.

## Consolidation and next action

Q1-Q23 are resolved. There are no remaining product-design questions in this review's scope. The user confirmed the final shared understanding and explicitly authorized publishing the roadmap and eight tickets on 2026-10-19. Publication is complete: [roadmap #51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51) with children #52-#59. [UI-tickets.md](UI-tickets.md) records their acceptance criteria, boundaries, issue links and verified native dependencies. The roadmap embeds this full approved record so implementation does not depend on unpublished local documents. Implementation has not started; publication does not authorize closing existing issues or claim the work has shipped.
