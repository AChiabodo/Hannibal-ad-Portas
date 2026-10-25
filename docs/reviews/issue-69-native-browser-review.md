# Issue #69: native-browser review, 22 October 2026

## Scope and method

The user requested completion of #69 and an honest review of every player-facing
menu, with correctness, usability and first-time comprehension as the priorities.
They confirmed direct fixes within #69, recommendations for the other menus, and
the existing public HUD/order/reference and canonical-rule test seams.

Starting point: `6e367841246d3c622d2e0f26570ab351dad286d4`, on
`feat/faction-refactoring`. The pre-existing AGENTS.md modification is excluded.
This report supersedes the earlier report's lack of interactive browser evidence.

The application ran locally on port 5177. Checks used the native in-app browser,
real pointer/keyboard input, screenshots and its CDP viewport/input capabilities
for 1920x1080. The ordinary native viewport was 1280x720. No standalone Chromium,
Playwright CLI suite, CI run or hidden-state mutation was used. Viewport overrides
were cleared afterward. Screenshots and per-section accessibility records are
outside the repository in the chat's visualization directory.

## Corrections made

- Kept settlement tabs and category targets in the same positions when the
  Carthaginian military category has no offers. Previously they moved by 148
  screen pixels at 1280x720 when switching into and out of the empty category.
- Distinguished `Voci prima`/`Altre voci` from `Pagina prima`/`Pagina dopo` and
  added the visible topic range and total. At 720p only five topics fit; the old
  navigation did not indicate how many more existed.
- Made page turns advance by a complete page, including the final short page.
  Previously the last page backed up and repeated the preceding page's tail.
  Scrolling no longer increments the displayed page before crossing its boundary.
- Removed the false claim that Column moves faster. The simulation's movement
  pace depends on troop type and terrain; Column changes shape and melee force.
- Corrected wall-assault losses: their per-Squad minimum and recruited capacity
  matter, rather than only surviving force. Explained blockade pressure,
  population loss, garrison morale loss and the actual surrender condition.
  Capture-check cadence and required consecutive checks now come from the rules.
- Added canonical initial Morale, ammunition and pace to every troop article.
- Added `Schermata e controlli`, covering camera, lists, purchase icons, quantity,
  locks, contextual help, scrolling, keyboard focus, pause and wiki navigation.
- Added `Esplorazione e contatti`, explaining unexplored/explored/visible ground,
  current sight versus last known contact, target requirements and Forecast limits.
- Removed future-season forecasts after the Match ends. The final account states
  that the Match is over and shows current Treasury. The defect was seen at the
  natural clock ending; its correction is covered at the public HUD seam.
- Corrected a misleading internal Payroll comment: an unaffordable Squad does
  not prevent a later cheaper Squad from being paid. Rule behavior is unchanged.

No new economic rules, worker-assignment system, roster, rendering pipeline or
domain terminology was introduced. No new ADR was needed for these reversible
presentation and factual corrections.

## Menu-by-menu assessment

| Surface | Observed behavior and honest assessment | Recommended improvement |
| --- | --- | --- |
| Match setup | Both Factions, all three difficulty choices, seed editing, and start work. Objective and difficulty explanations are useful. Cycling rows resemble text fields, so alternatives are not immediately obvious. | Show explicit previous/next affordances and brief descriptions of each difficulty. Main-menu Encyclopedia/Tutorial access remains #70. |
| First-entry Guide | Welcome, start, settlement selection, recruitment, Squad selection, real movement and completion were exercised. Skip and reopen also work. It teaches a first interaction, not an economic or Siege strategy. | In #70, connect practical objectives to food, Payroll, winter and taking a settlement. Avoid presenting this four-action guide as a complete tutorial. |
| Top bar and pacing | Pause/resume and 1x/2x/3x are clear. Reference opening suspends the Match and returning preserves its previous pause state. | Keep the countdown easy to find; the permanent Forecast is wordier than the rest of the bar. |
| Navigator and minimap | Owned settlement/Squad selection, centering and show/hide are reachable. IDs such as `Roccaforte 0` are functional but feel technical. | Use player-oriented settlement names in a separate content decision; retain distinct identity for orders. |
| Settlement overview | Population/housing and paired stock/capacity values fit in the compact card. The separate account and works buttons reduce obstruction. | Explain the abbreviated staffing ratio on focus/hover. The full prose is now in the reference. |
| Seasonal account | Distinguishes common Treasury from local stocks and states uncertainty. In the observed Roman boundary, 20 Treasury + 2 income - 3 Payroll became 19, as predicted. | Consider a two-column current/next comparison with explicit plus/minus changes, rather than requiring the reader to compare sentences. |
| Buildings and Labour | The real Farm changed from a staffed countdown to `In attività`; the display named resource allocations. House completion raised housing from 12 to 18. | Keep active and stalled work visually distinct; add direct help from this panel in a later polish pass. |
| Construction | All four categories were exercised for both Factions at both sizes. Available purchase, locked Forum, help and return work. The empty Carthaginian military category explains why it has no Castrum. Category movement is fixed. | Make a short benefit visible before purchase, beyond icons and the `?` article. Keyboard focus/inspection already gives the full explanation; persistent one-line benefits would reduce discovery cost. |
| Recruitment | Roman and Carthaginian available purchases, locked offers, size choices and scroll controls are reachable. Long troop names fit the inspected two-column cards. | Explain `Reparti` quantity beside the control: changing this number buys multiple Squads, not a larger size. Add labeled cost/Payroll summaries on focus rather than relying on icon literacy. |
| Squad details and orders | Selection, real Move, Hold/formation affordances and condition information are visible. The first real movement completed the Guide. Attack and Siege remain context-dependent. | The arrow-only Withdraw control is hard to identify without its shortcut or focus hint. Give it a readable label when room permits. Keep order feedback visible without shifting purchase rows. |
| Notices | The contact warning opens from the notice strip; conditions and Forecast remain visible. | Distinguish a persistent condition from a newly arrived event and explain what clicking a row will center. |
| Options/session | Open/close, scale adaptation (requested 3x fitted to 2x at 720p), reset, Guide reopening, seed-copy feedback, restart and new-Match return were exercised. Abandoning a running Match prompts for confirmation. | Group session actions separately from display settings. `Copia` should say `Copia seme` without relying on context. |
| Encyclopedia | All 41 articles and their final pages were traversed at both desktop sizes. Contextual building/troop links, section navigation, keyboard paging and return worked. The rule prose is substantially more useful with the corrections above. | Next useful work is search and cross-links between related articles. It is still a reference requiring reading, not a substitute for #70's practical Tutorial. |
| Match conclusion | A normal Roman Match reached the three-year clock limit. The conclusion explains the reason, disables play and allows inspection, restart and a new Match. The old future-season promise is corrected in the HUD model. | Add an explicit result summary and explain what to do differently next time. Victory/defeat outcome variants were not reached interactively in this review. |

## Evidence and limits

- Both Factions were entered through setup; representative seeds were 7,
  797366748 and 2837771473. The latter Roman Match ran to the clock limit.
- Every article was visited at 1280x720 and 1920x1080, with every text page
  traversed by real keys. Coverage is 4 first-step, 10 economy, 10 building,
  12 army and 5 war articles. Actual representative frames were inspected.
- Purchase samples covered a staffed Farm, a House, Roman Astati and Carthaginian
  Libyan spears; locked Forum inspection explained the missing level. Purchases
  were applied after resuming, rather than treating a queued click as success.
- Reference return was exercised with running and manually paused Matches, and
  contextual selection/category state remained usable on return.
- Browser warning/error logs were empty in the three initial sessions. This is
  browser-log evidence, not a hardware frame-rate or performance claim.
- The clock-ending frame predates the final Forecast suppression correction.
  The correction is regression-tested through the public HUD model; a second
  complete timed Match was not run to reproduce that final frame.
- No hidden-enemy quantities were used. This review does not prove AI pressure,
  successful Attack/Assault/Blockade combat, or victory/defeat flows. The passive
  clock-limit sample is not evidence that the opponent is engaging effectively.
- The canvas accessibility label omits much of the settlement/order detail when
  no control has focus. Keyboard focus is usable, but a full screen-reader
  accessibility claim would be unjustified. A dedicated accessibility pass is
  recommended.
- Atelier and diagnostic hooks are developer surfaces, outside the player-menu
  review. No hosted wiki exists or is required by #69.
- The automated Chromium economy/host/acceptance suites were not run. Native
  interaction evidence is recorded above and is not relabeled as those gates.

## Verification and code review

Public model regressions were first observed failing for pagination, navigation
labels, missing beginner articles, empty-category geometry and post-Match Forecast.
Each was implemented and rerun at the agreed seams. Canonical four-Season
comparisons for both Factions remain part of the economic model tests.

Final `npm run verify` passed: lint, TypeScript, seven guards, 120 Vitest files /
1,400 tests and production build. The suite was rerun after the late post-Match
Forecast correction. Earlier focused checks covered 18 related files / 226 tests;
the final three targeted files passed before the complete run.

### Standards

Independent review of `6e36784...55b9691`: no actionable documented-standard
breaches or substantive heuristic smells. Italian text stays in the String table,
canonical numbers are imported, Observation and procedural-rendering boundaries
are preserved, and regressions use public models.

### Spec

Independent review of the same diff against the live #69: no actionable findings
or scope creep. Economic interaction evidence covers both Factions and sizes.
The broader review's successful combat and victory/defeat variants remain subject
to the explicit limitations above.

Review totals: Standards 0; Spec 0. Neither reviewer launched a browser.
