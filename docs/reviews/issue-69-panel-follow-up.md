# Construction text defect and panel alternatives

22 October 2026. Follow-up to the native-browser review of #69.

## Confirmed defect

The construction inspector passes complete, multi-paragraph building descriptions
to `wrapText`. That function previously fitted horizontal width but left embedded
newlines in a single returned row. `drawText` then rendered those newlines as
additional vertical lines, while the layout reserved only one line. Scrolling to
`Il progetto`/cost/time/workers therefore painted paragraphs over later lines and
the scroll buttons. Merely shortening descriptions or widening the card would
have hidden the defect for some offers rather than corrected it.

The public-HUD regression iterates applicable building offers for both Factions,
at both reference sizes, through every inspector scroll offset. It failed before
the correction (`rome/build:farm/3`: a row contained multiple paragraphs).
`wrapText` now separates explicit line breaks, preserves blank paragraph rows,
and wraps each paragraph. The native browser reproduced the old overlap and
showed separated cost, duration and worker rows on a clean page after the fix.
The panel height and position are unchanged.

## Reference discoverability

Three explicitly named articles now live under **Primi passi**. They are placed
immediately after the campaign introduction, so all three are visible without
scrolling the topic list at 1280x720:

- **Cattura e luoghi neutrali**: move onto the exact center, consecutive capture
  checks, strength contests, routing, walls, acquired local stocks and territory.
  A Roman Castrum is an attached building rather than an independently captured
  tent; Carthage does not gain Roman winter quarters from capturing one.
- **Come esplorare la mappa**: actual Move/right-click gestures, canonical vision
  radii, black versus remembered/current terrain, camera versus exploration,
  exploration versus ownership, and a safe return before the seasonal boundary.
- **Rifornimenti dei reparti**: own territory, seasonal ammunition replacement,
  lack of automatic casualty replacement, attrition and Morale outside territory,
  shared-Treasury Payroll, and winter quarters as a separate requirement.

Capture cadence, vision radii, supply Morale and attrition figures come from the
canonical rules. The existing territory, visibility and Siege articles remain as
the detailed reference. No rules, unit commands or domain definitions changed.

## Design question

How can the lower panel show a decision clearly without gaining height? The user
requested evaluation and alternatives, so the production layout is not replaced
before a choice. Three read-only prototypes run on the existing Match route in
the isolated branch `codex/issue69-panel-prototypes`.

They retain the actual generated theatre, palette, bitmap font and PixelBuffer
drawing. Their catalogue is a presentation mock: selection/category/tab switching
does not buy buildings or issue orders. All variants share the same viewport,
seed and initial state. The floating blue switcher is a prototype-only tool.

| Variant | Structure | Benefit | Cost |
| --- | --- | --- | --- |
| A — Horizontal dock (recommended) | Minimap top right; full-width bottom dock; settlement summary, catalogue and short selected-offer card in separate columns. | Roughly 200 extra screen pixels at 1280x720, about 19% more usable width; the selected benefit and explicit purchase button are visible together. | Minimap occupies another part of the theatre. The persistent Forecast/Notices must become a compact summary with a separate account/journal surface to avoid fighting for that corner. |
| B — Side catalogue | Minimap left under the navigator; vertical settlement catalogue on the right; bottom reduced to rapid army commands. | More vertical map space and a longer catalogue/inspection area. | A persistent side panel covers a substantial horizontal band. Camera centering would need to account for the available map area. |
| C — Contextual panel | Minimap stays bottom right; small summary and one active content page below; click an offer to open details above the dock. | Smallest permanent lower-panel footprint; no minimap relocation. | A temporary detail card covers the theatre and adds a selection step before purchase. |

Recommendation: develop **A**, with **C's explicit selection-before-purchase**
behavior. Selecting an offer shows a short decision card (local bill, duration,
workers, staffed benefit and lock reason); a distinct button commits the purchase.
The Encyclopedia owns long prose. Do not keep the complete reference article in
the lower card merely because more width becomes available. Avoid repeating
stocks, work lists, last-order status and full descriptions in every tab.

At 720p the prototype A dock is 196 screen pixels tall and C is 176, versus the
current construction panel's 228. B's rapid-order strip is 72 pixels tall but its
side catalogue is persistent. These are prototype geometry, not an approved
production specification. At 1080p the layouts gain horizontal room without
making the lower dock taller. The preview reserves 44 additional screen pixels
below the dock for its floating comparison tool; that tool is not part of any
proposed game layout.

## Local prototype

Worktree: `C:/Users/aless/.codex/worktrees/issue69-panel-prototypes/SPQR`.

Run `npm run dev -- --host 127.0.0.1 --port 5178 --strictPort` there, after
installing the usual dependencies when needed. This session reuses the main
checkout's dependencies through a local junction; that junction is not committed.

Open the root Match route with
`?play=1&seed=7&faction=rome&difficulty=centurio&prototype-panel=1&variant=A`.
The bottom arrows (or left/right keys) select A/B/C and update the URL. Click
categories, tabs and building names to compare the hierarchy. `Costruisci
(simulato)` never writes to a real Match. The prototype only mounts in dev mode.

The prototypes remain separate from the current implementation branch. No design
alternative has been promoted to production, and no push is required to inspect
the local versions.

## Verification

`npm run verify` passed: lint, TypeScript, seven guards, 120 test files / 1,402
tests and production build. Focused checks passed in 18 related files / 230
tests. The prototype branch separately passes TypeScript; it is a throwaway UI
exploration, not an implementation tested for production.
After the final article reorder, the three focused HUD/reference files passed
21 tests and TypeScript passed again; the full suite was not repeated for that
discoverability-only change and its additional regression.

Native browser evidence includes the reproduced paragraph overlap, its corrected
scrolled inspector, complete traversal of the three new articles, and A/B/C
switching at 1280x720 and 1920x1080. Representative frames were inspected. The
final corrected game page and prototype page reported no console warnings/errors.
Standalone Chromium/Playwright suites were not run.

Prototype snapshot: `bbf40a4` on `codex/issue69-panel-prototypes`. The current
implementation branch contains only the text fix, reference articles, regressions
and this design assessment. AGENTS.md remains outside the scoped commit.

Independent code review of the follow-up found no actionable Standards or Spec
findings. A final discoverability-only reorder was checked with the public
reference-layout regression so the three requested topics are immediately visible.

## Approved implementation: B default, A and C saved alternatives

The Player selected B and asked to retain the two alternatives as selectable
preferences. This decision supersedes the earlier recommendation of A; the
separate prototype worktree and its three variants remain available.

The real Match now defaults to **B - Laterale**. `Opzioni` has a `Pannello`
control cycling B, A and C; its selection is saved in `spqr.ui.v1`. Old saved
preferences migrate to B while retaining scale, navigator and guide settings.
Reset returns to B. These are named presets, not a freeform editor: positions,
widths and UI customization beyond those presets are future work.

All three arrangements use the existing PixelBuffer/PixiJS renderer, filtered
Observation and Command submission. Choosing a layout keeps the selected entity,
selected purchase offer, category, group bindings and Match state. Detail and catalogue scroll offsets
reset to fit the new arrangement. The camera and minimap use the actual available
theatre rectangle, so a side panel is not mistaken for map space.

B keeps the catalogue and selected-offer facts on the right and moves the minimap
under the left navigator. Its military strip is 88 screen pixels high at UI 2x,
including the border. Compact icons at 720p gain labels when there is room;
hovering or keyboard focus shows their meaning and target instructions in the
information panel. This is a tradeoff: B gives the map more vertical room while
using a persistent horizontal band. At 1080p the offer inspector uses additional
vertical room instead of forcing the same amount of scrolling as at 720p.

An economic row selects an offer; `Costruisci` or `Recluta` commits it. The selected
card shows canonical local costs, staffed benefits and lock reasons; `Dettagli
[F1]` opens the full article. A retains a horizontal dock and upper-right minimap.
C retains a compact dock and floating offer card. Opening the journal in C
replaces that floating card temporarily, retaining its selection for return.
Summary, seasonal Balance and Works remain separate views in every preset.

### Standards

Independent review found the missing persistent pace label and its recognition
by private coordinates. Both were corrected: `IN PAUSA` / `IN CORSO` remains
visible beside a separate Avvisi control, and the shared chrome identifies that
label by an explicit role. The independent follow-up found no actionable
Standards issues.

### Spec

Independent review found two input/geometry conflicts: C group chips overlapped
purchase controls, and A expanded notices could reach groups/the dock. Both
received public HUD regressions and fixes. C reserves group space inside the
inspector; the journal now derives its page from available space and owns its
scrolling region. The final journal fix was checked locally against the reported
case, including twelve long notices and nine groups in all three layouts; an
additional independent re-review was unavailable.

### Validation of the selectable layouts

Native browser gestures covered B/A/C switching, saved preference recovery in a
new tab, preserved offer/entity selection, building inspection and scrolling,
contextual F1 and return, purchases queued in pause and applied on resume,
recruitment quantity totals, disabled purchases, Works, military orders and
control-group recall. Rome and Carthage were inspected at 1280x720 and 1920x1080
across representative views. The final C group-card regression was also exercised
with two actually recruited Roman squads and a real Ctrl+1 binding. Final
reference/purchase geometry and journal paging receive public-model regressions.
Standalone Chromium/Playwright suites were not run; no new claim is made about
combat completion, every victory/result variant or hardware performance.

Final verification: lint, TypeScript, all seven guards and production build pass.
The full non-browser suite passes in 121 files / 1,415 tests using
`npx vitest run --maxWorkers=2`. The preceding default-concurrency `npm run verify`
attempt had one five-second timeout in the repository-fence test; every other
test passed, and the rerun passed without changing tests or timeouts. Options and
result catalogue fingerprints were updated for the reviewed preset selector;
all other accepted artefact fingerprints remain unchanged. Native F6/Tab/Enter
also cycles B/A/C correctly, and the final Rome and Carthage pages have no console
warnings/errors. A paused B construction page remains open for inspection.
