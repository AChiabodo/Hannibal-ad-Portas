# Issue #55 — Contextual military, economy and Siege Commands

Verified on 2026-10-20 against [#55](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/55), its blocker [#54](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/54) and the shared approved requirements in [#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51).

The bottom panel is now a contextual command panel beside the detail it belongs to. A Squad selection offers Move, Attack-move, Attack, Hold, Withdraw, Line, Column, Garrison, Assault and Blockade; a settlement offers three pages — Overview, Construction and Recruitment — whose rows carry the content table's own cost, time, tier and refusal reason. A mixed selection gets a group summary instead of one man's figures: composition, total men, the Morale band, and the individuals that need attention as rows that open one Squad, with a visible way back to the group. Numbered control groups are visible chips beside the existing keyboard binding and recall.

Everything goes through one submission and targeting path. `perform(id)` arms an action that needs a target and submits one that does not; a button, the existing `A`/`S`/`W`/`L`/`C` keys, Escape, a left click on the theatre and the shared `submit` hook all end at the same human Controller. The armed action, what it still wants clicked, how many orders are queued (including "in pausa") and the last order given are drawn in the panel. Escape cancels the target and never a Command already submitted; the ordinary military actions still need no confirmation, while leaving an active Match still does. Right-click ground movement and the classic `A` + click remain.

Siege availability is stated rather than hidden: Carthage sees Assault disabled with "Solo Roma ha l'ariete" and Blockade enabled; a target has to be a walled settlement of its own (Garrison) or a known enemy settlement (Assault, Blockade), named by its row or its tile. What is known of the walls — sections standing, gate, breach, ram, path and garrison count — is read from the Observation's `fronts`, so a remembered Stronghold nobody has eyes on contributes a tile to target and no structural fact at all. No enemy stock, Payroll or unseen Siege progress is invented anywhere in the panel.

Nothing in the simulation changed: no new Command, no new rule, no path or formation change, no hash change. New controls are drawn by the same declarative PixelBuffer generator and the same PixiJS adapter; no external asset, font, glyph, dependency or manual worker was added, and no new queue/cancel mechanic exists.

## Where each acceptance criterion is proved

| Criterion | Where |
| --- | --- |
| Squad detail prioritises type, men, Morale, order/destination/refusal, fatigue, ammunition, Payroll, supply and quarters | `tests/ui/hud.test.ts` (model), `e2e/hud.spec.ts` (live page) |
| Mixed selection composition, total men, Morale range, exceptions, way back | `tests/ui/hud.test.ts`, `tests/ui/orders.test.ts`, `e2e/commands.spec.ts` |
| Known eligibility, preserved selection, rule-defined partial execution, individual refusals | `tests/ui/orders.test.ts` (reach, reasons), `e2e/commands.spec.ts` (one of two garrisons, exceptions) |
| One submission/targeting path, armed state, requirements, unavailable reasons, pending/applied | `tests/ui/orders.test.ts`, `tests/ui/hud.test.ts`, `e2e/commands.spec.ts`, `e2e/surface.spec.ts` |
| Right-click movement and keys kept; explicit Attack/Garrison/Assault/Blockade | `e2e/orders.spec.ts` (unchanged regression), `e2e/commands.spec.ts` |
| Paused orders visibly pending; no waypoint itinerary | `e2e/commands.spec.ts` |
| Numbered control groups with membership, composition, recall | `tests/ui/orders.test.ts`, `e2e/commands.spec.ts` |
| Settlement Overview/Construction/Recruitment with stocks, automatic Labour, progress, content costs/requirements | `tests/ui/orders.test.ts`, `tests/ui/hud.test.ts`, `e2e/commands.spec.ts` |
| Siege availability, targets, known Wall/Gate/breach/Garrison/ram/Blockade, no enemy figures | `tests/ui/orders.test.ts`, `tests/ui/hud.test.ts`, `e2e/commands.spec.ts` (both Factions) |
| Real visible-control scenarios connected to #28's E2E ownership | `e2e/commands.spec.ts` + `e2e/commands-fixture.ts`, run by the existing Playwright configuration and the page's own hooks |

## Commands and results

- `npx tsc -b` — checked repeatedly through the work; the final state is clean.
- `npx vitest run tests/ui/orders.test.ts` — 21 new action-eligibility tests, red before the module existed.
- `npx vitest run tests/ui tests/render` — 154 tests across 11 files, including the new HUD panel, rendered-ink and enemy-front assertions.
- `npm run lint` — clean.
- `npm run guard` — all eight fences hold (simulation boundary, AI Observation imports, PixiJS outside `src/render/`, no `Math.random`, no transcendental math, no ambient clock or entropy, no committed assets).
- `npm run verify` — lint, TypeScript, guards, **1147 tests across 98 files** and the production build all passed on the final code.
- `npx playwright test` — **87 browser tests passed** on the final code, including the 9 new `e2e/commands.spec.ts` scenarios and the unchanged Atelier, fog, orders, setup, desktop and surface suites.
- `git diff --check` — no whitespace errors (only the repository's existing CRLF notices).

## Exact interaction paths

- Button `Muovi` → armed line "Mira: Muovi - Clicca il terreno" → left click on a theatre tile → `move` in the applied log on the next tick; second `Muovi` + tile replaces the destination, and the panel shows one Destinazione line.
- Button `Marcia d'attacco` (or `A`) → `Escape` → nothing armed, no Command, selection kept; `S` → Hold queued while the Match is paused, `Escape` drops the selection but the queued Hold still lands on the next tick; `C`/`L` → `formation` Commands.
- Button `Attacca` (enabled only with an enemy in view) → click the enemy's tile → `attack` naming a live enemy id.
- Box-drag two Squads → group panel with "su 2 a portata" on `Guarnigione` → arm it → click the settlement row → `garrison` to that settlement; next tick exactly the Squad in reach is inside. Click the exception row (unpaid), panel opens that Squad, `Torna al gruppo` restores both.
- Settlement row → `Costruzione` tab → `Fattoria` (cost and ticks from the content table) → `build`; next tick the work appears "In costruzione (…)". `Reclutamento` tab → `Astati` → `recruit` count 1.
- Rome: Squad beside the enemy Stronghold → panel names Mura/Porta/Presidio of the known front → bar `Centra [F]` → `Assalto` → click the Stronghold tile → `assault`. Carthage: `Assalto` disabled with the ram reason, `Blocco` submits a `blockade`.
- Two Squads → `Ctrl+1` → numbered chip `1 Astati 2` visible → clear selection → click the chip → both Squads picked again.
- Both Factions, 1280x720 and 1920x1080: construction page and Squad page captured; controls asserted inside the detail panel, non-overlapping, and the armed row's pixels differ before and after arming.

## Rendered evidence and applicability

`e2e/commands.spec.ts` regenerates eight PNGs outside the repository at `%TEMP%\spqr-issue55`:

- `construction-{rome,carthage}-{1280x720,1920x1080}.png`: a settlement's Construction page with its tabs, content-backed offers and costs.
- `commands-{rome,carthage}-{1280x720,1920x1080}.png`: a Squad's command page with Attack-move armed, its requirement line and the Siege offers.

The checks beside those pictures are the ones a picture cannot make cheaply, and they run on every pass: every command and tab rectangle lies inside the detail panel, no two controls overlap, the armed row is drawn on its own ground (asserted from a live `samples` read of the frame, not from the model), and the panel frame holds at least the ground, the edge and the two inks it paints. `tests/ui/hud.test.ts` additionally composes the plate through the production generator and asserts ink inside each command rectangle and the armed tint.

**Unrun gate, stated plainly:** this harness cannot display images, so the agent did not eyeball the eight PNGs; what is asserted above is geometry, live frame sampling and generated pixels. A human should open the files under `%TEMP%\spqr-issue55` before the visual acceptance in [#59](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/59). The desktop layout is the product; the legacy 640x480 fixture page keeps its own detail rendering and was not given the new panel, which is why its captures are not part of this evidence.

Both Factions and both reference resolutions are covered, as are visible and remembered information: known enemy fronts are drawn; a remembered settlement contributes a target tile and no structural fact. Visible/remembered/unknown transitions are exercised by the existing fog suite, which still passes. HUD pixels are screen-space and identical at every map zoom, so repeating each capture at zooms 1–8 would restate the same plate; the full browser suite still exercises 1–8. No art definition, palette or glyph changed, so no new Atelier entry is applicable; the existing Atelier suite passed.

## Standards

Implementation re-read against the repository's own standards: the panel model stays in `ui/` (Node-testable, no engine), the page keeps the only PixiJS and wall-clock code, every player-facing word comes from the string table (the no-literal-text test passes), and all offers are read from `content/` with the same `pay()`/tier rules the economy uses. No documented standard violation is known; the ARIA label and the page hooks were extended with the new controls in the same shape as before.

## Spec

All ten acceptance criteria are covered above. Deliberately not done, because they belong to siblings: in-world strike/notice feedback (#58), settlement and fortification artwork and map picking (#57 — the panel targets by known tile and list row), terrain and Resource readability (#56), guidance and integrated visual acceptance (#59), hardware 60 fps at full density (#31), audio (#30), release (#32). No balance or content value was changed; #29 remains the owner of displayed costs and times, which are read from its tables rather than restated.

## Remaining gates

Hardware/full-density frame rate (#31), other browsers and mobile, the sibling art tickets, and release/deployment (#32) were not performed or claimed. Software-WebGL Chromium screenshots establish rendering, not hardware frame rate. The eight PNGs were captured but not visually inspected by the agent (see above). Commits are local on `feat/ui-rework`; no push, tracker closure or roadmap change was performed.
