# U9: visual acceptance and appearance polish

Issue: [#62](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/62).
Base revision: `37156ac8446d01a007dfa4f3a1f0b04f4db8ec4c`.

## Capability and scope

Codex (GPT-6) reviewed actual Chromium/SwiftShader frames using `view_image`
and image input. The capability gate was passed before source changes: regenerate
`e2e/first-entry.spec.ts --grep 'states Faction'`, then open
`%TEMP%/spqr-issue59/setup-1280x720.png`. Neither hashes nor geometry established
visual acceptance. Browser plugin was not available; the repository's Chromium
Playwright workflow was used, as explicitly requested by the Player.

Two subsequent Player instructions refine the original ticket: reduce the bottom
panel, improve the icons, and prefer modestly fewer representative soldiers while
keeping each soldier's size. Those instructions explicitly authorize the visual
density change below, overriding the ticket's original exclusion of density changes.
They do not authorize a simulation or balance change.

## Implemented decisions

- Default bottom detail: 302 -> 228 pixels at 1280x720; 380 -> 264 at 1920x1080.
  Bound control groups add 20 pixels. The command card keeps its three decision
  rows, with 40-pixel-high controls at 2x. Words sit beside an icon when they fit;
  narrower controls show the icon and key, with the full label/help in the context
  strip on pointer hover or keyboard focus. Short detail lines share two columns;
  long lines wrap and scroll, with space reserved for scroll controls.
- Redraw all ten military icons in the existing 16x16 declarative masks. Larger
  silhouettes, deliberate parchment highlights, bronze hilts/shield rims and a
  shared keep connect Garrison/Assault/Blockade. Badges, font and palette stay the
  same procedural families.
- Render three representative figures for every four men, rounded up: 120 -> 90.
  Original 10x14 figures, five-pixel file/rank spacing, same representative layout
  for drawing, picking, standards and condition plates. The elephant stays one
  figure; losses still thin the list from its back. Actual men, Observation,
  Command execution, simulation formation rules and authoritative hashes are not
  changed. No claim of passing #31 is made from the reduced visual count.
- Remove the redundant unwrapped stock sentence that crossed settlement tabs.
  Paint the selected tab's ground after its panel, and mixed-selection highlights
  before their text. Keep enemy settlement information free of the overlapping
  empty military card. Own stocks remain own stocks; enemy and remembered stocks
  stay unknown.
- Setup explanations/help use 2x bitmap glyphs, title 3x, a taller plate and a
  prominent Start button. Result headlines use twice the surrounding text scale.
- F6 enters UI focus, Tab/Shift+Tab traverse visible controls, Enter/Space press
  their drawn rectangle, Escape leaves focus/cancels targeting without dropping
  selection. Plain Tab retains navigator toggling outside UI focus. The focus
  outline differs from the armed card's solid bronze ground. Options advertises
  these keys; the canvas label names the focused control.
- Fit an oversized requested UI scale to the window using integer scaling; keep
  the requested preference. The warning and `UI 3x > 2x` explain the adaptation.
  The canvas no longer grows wider than a supported desktop to satisfy 3x.
- Centre a selected enemy/remembered settlement using only the Faction's known
  sites. Previously the button searched owned settlements only, leaving the
  selected Siege offscreen. Critical-state captures assert the target is in the
  theatre before taking a frame.

## Visual verdict ledger

`{side}` expands to `rome`, `carthage`; `{size}` to `1280x720`, `1920x1080`.
Every primary path below is under `%TEMP%/spqr-issue62/{before,after}/`.
The committed producer is `e2e/appearance.spec.ts`; identical named states and
viewports are reproduced on the base and candidate revisions. The old revision
uses pointer activation for the second act where UI focus did not yet exist.

| Surface / frame prefix | Before verdict and Player reason | Final verdict and reason |
| --- | --- | --- |
| `setup-{side}-{size}.png` | **change**: the explanation looks like fine print above oversized empty space | **keep**: I can read the objective and choices before starting |
| `overview-`, `construction-`, `recruitment-{side}-{size}.png` | **change**: stocks cross the tabs; I cannot see which page is open | **keep**: the active page is bronze; quantities and costs stay in their own columns |
| `idle-paused-{side}-{size}.png` | **change**: the bottom panel takes too much of my map | **keep**: more theatre is visible and the three kinds of action remain grouped |
| `armed-{side}-{size}.png` | **change**: the armed cell needs stronger emphasis and more recognizable art | **keep**: a bright edge and solid ground identify the armed order; the line says where to click |
| `pending-`, `applied-{side}-{size}.png` | **keep** the explicit queued/applied distinction; **change** its surrounding density | **keep**: queued orders still say they are waiting during pause; the compact card leaves room for the answer |
| `disabled-carthage-{size}.png` | **change** the weak silhouette; keep the refusal explanation | **keep**: the unavailable Assault is muted but recognizable and explains the missing ram |
| `mixed-{side}-{size}.png` | **change**: the highlighted exception is a blank stripe | **keep**: I can read who needs attention inside the selected stripe |
| `group-chip-{side}-{size}.png` | **keep** the numbered membership; **change** the enclosing panel height | **keep**: I can see what 1 recalls and retain more map above it |
| `siege-{side}-{size}.png` | **change**: unused military icons overlap under the settlement pages | **keep**: walls, gate, ram/path and Garrison are readable facts without that stray card |
| `siege-{building,ram,breach,blockade}-{side}-{size}.png` and matching `-structure-` frames | Added critical-state matrix after independent review | **keep**: I can distinguish a building/built ram, an open gate and a Blockade. Structure-only captures use the existing `showSquads(false)` inspection lens to inspect walls behind overlapping field armies, with identical Faction knowledge |
| `economy-{build,recruit}-{id}-{side}-{size}.png` | Added row-by-row keyboard coverage after independent review | **keep**: every content offer has its own name/cost or refusal, a drawn focus target and the same queue effect from pointer and keyboard |
| `options-{side}-{size}.png` | **keep** the concise session actions; add discoverable UI keyboard controls | **keep**: restart/new/copy and presentation controls remain separate and named |
| `scale3-options-`, `scale3-guide-{side}-{size}.png` | **change** at 720p: the canvas is wider than the window and cuts off controls | **keep**: every control fits; the requested scale survives and the warning explains why it was fitted |
| `guide-{side}-{size}.png` | **keep**: the welcome explains the objective without concealing the Stronghold's centre | **keep**: readable, nonmodal and now fully keyboard operable |
| `result-{side}-{size}.png` | **change**: defeat has the same emphasis as the configuration line | **keep**: I see the outcome first, then its actual reason and what I can do next |
| `zoom{1,2,4,8}-{side}-{size}.png` | **change** the crowding of individual figures; keep the camera's integer zooms | **keep**: fewer figures with unchanged soldier size show more silhouette, and the map still uses every supported zoom |

## Rejected alternatives

- Shrinking individual soldiers: rejected after the Player explicitly preferred
  their current size; helmets, shields and faction silhouettes need those pixels.
- Halving the displayed army or replacing it with aggregate counters: rejected;
  a 25% reduction is sufficient for this pass and retains individual figures.
- Enlarging settlements at the same time: not selected. It would consume the map
  space just recovered and increase overlap around a garrison. The chosen figure
  treatment addresses the Player's stated preference without a second scale change.
- Removing text everywhere: rejected. At larger widths the full short labels fit;
  the compact version retains full names, keys and requirements on hover/focus.
- Redrawing terrain, changing the palette/font, adding external art, changing
  map density, rules, pathfinding or formation mechanics: rejected as unnecessary
  to make these panels readable and inconsistent with the project constraints.

## Reproduction and validation

Primary command:

```powershell
npx playwright test e2e/appearance.spec.ts --project=chromium --workers=2 --output=test-results/issue62-appearance
```

For before frames, use a detached checkout of the base revision, copy the committed
`e2e/appearance.spec.ts` into it, and run the same command with
`$env:SPQR_VISUAL_PHASE='before'`. The new keyboard/economy and critical fixture
matrix regressions are candidate-only and explicitly skip on the base revision;
the comparison-frame routines use equivalent pointer actions there. Delete that
environment override for candidate frames.
No PNG is committed (ADR-0002).

The primary spec tests every military and economy command at both desktop sizes for both
Factions with pointer and keyboard (including scrolled/unavailable offers), settlement tabs by both paths, numbered
control groups, queued/applied/armed/disabled feedback, and console health.
Functional and additional evidence producers are `acceptance`, `first-entry`,
`commands`, `desktop`, `hud-repair`, `orders`, `surface`, `settlements`,
`readability`, `terrain-readability` and `atelier` browser specs.

The final source passed `npm run verify`: **110 files / 1297 tests**, lint,
TypeScript, repository/AI guards and production build. `npm run bake` regenerated
**509 artefacts**, including the catalogue. Final Chromium results are recorded below.

The overflow fixture now holds 48 Squads and nine Works: the compact dock makes
the old 28-row navigator fit entirely at 1080p. Increasing only the authored test
scene preserves a real overflow check instead of requiring unnecessary scrolling
or weakening the assertion.

An intermediate full-browser pass exposed an Atelier regression: the vertically
stacked UI specimens made its 4x framebuffer 15445 pixels tall. Chromium returned
transparent pixels and logged an out-of-range texture. Placing the UI beside the
original art preserves every entry and original art coordinate, with a 1107x1964
catalogue and a 7781x7885 Atelier canvas. The existing GPU pixel/magnification tests
pass; a public layout regression keeps both dimensions inside 8192 pixels.

Two old browser scenes needed corresponding geometry updates, with their strict
assertions retained: the Squad pixel comparison now places the public
representative shape, and the notice test pans into the theatre before pressing
Centre (negative panning already hit the home corner's clamp with the taller
viewport). Zoom evidence selects a known Squad and recentres it at each zoom,
so the reviewed army remains on screen rather than magnifying empty terrain.

## Inspected evidence and supplementary verdicts

Actual image input included the primary frames above and the following labelled
before/after contact sheets under `%TEMP%/spqr-issue62/review-sheets/`:
`{panels,orders,groups,entry,menus}-{side}-{size}.png`. Crops retain the original
bottom-panel area to make the recovered theatre visible. Native setup, armed,
pending, mixed, result and Siege frames were also opened to check text without
the contact sheets' overview scaling.

Additional actual image input:

- `economy-{build,recruit}-{side}-{size}.png` contact sheets: all offers, including
  locked and scrolled rows, with their keyboard focus and cost/refusal text.
- `zoom-comparison-{side}-{size}.png` contact sheets: before/after at 1x, 2x,
  4x and 8x, centred on the selected Squad; native
  `after/zoom2-rome-1280x720.png` additionally checks the compact card and army.
- `critical-{side}-{size}.png` contact sheets: four Siege stages, army-visible
  and structure-only; native `after/siege-ram-structure-rome-1280x720.png` and
  `after/siege-breach-carthage-1920x1080.png`, plus a nearest-neighbour crop of
  the latter's structure-only frame, resolve gate/ram detail.
- `supplement-{dock,map}-{side}-{size}.png` contact sheets compare the following
  committed `e2e/acceptance.spec.ts` producers, from
  `%TEMP%/spqr-issue62/before/spqr-issue59/` and `%TEMP%/spqr-issue59/`.
- `%TEMP%/spqr-issue57/remembered-stronghold-rome.png`, produced by
  `e2e/settlements.spec.ts`, and `artifacts/catalogue.png` from `npm run bake`.
  The catalogue was opened after the framebuffer repair; its UI/formation
  column and original art column are both visible. Individual baked setup,
  construction, armed/pending, options, result and control specimens were also
  opened during implementation.
- `%TEMP%/spqr-issue62/icons-before-after.png` compares all ten authored command
  masks at native size and enlarged nearest-neighbour size, from the two bakes.

| Supplementary producer / frame prefix | Before verdict | Final verdict and Player reason |
| --- | --- | --- |
| `long-list-{side}-{size}.png` | **keep** numbered rows and explicit scrolling | **keep**: I see more rows above the smaller dock; a longer authored army still exposes real scroll controls |
| `long-text-{side}-{size}.png` | **change**: stocks cross tabs and detail ends under scroll controls | **keep**: short facts pair up, long Works sentences wrap, and scrolling reaches the remaining facts |
| `critical-{side}-{size}.png` | **keep** the factual Morale/Fatigue/Payroll values; change their density | **keep**: critical values and disabled commands remain legible in the compact card |
| `refused-order-{side}-{size}.png` | **keep**: the order says deep water rather than silently failing | **keep**: the refusal remains beside the selected Squad and the notice can centre it |
| `fog-states-{side}-{size}.png` | **keep** the three knowledge states | **keep**: bright current ground, dim remembered ground and unknown black remain distinct; the larger theatre reveals only permitted knowledge |
| `remembered-stronghold-rome.png` and the catalogue's remembered-site specimens | **keep** the neutral memory silhouette | **keep**: I can find the known place without being told its current owner, stocks or unseen Siege state |
| `artifacts/catalogue.png` | **change**: UI surfaces were missing; the first vertical extension exceeded the framebuffer | **keep**: controls, panels and original art can be inspected together at all three Atelier zooms |

The overflow scene deliberately differs in authored count (28 -> 48 Squads,
five -> nine Works); it compares the same overflow condition, not an identical
army population. Unknown places have no place panel or command target to review.
Remembered terrain is exercised for both Factions and desktop sizes; the shared
neutral remembered Stronghold generator is additionally inspected in the Roman
fixture and Atelier. Offensive ram construction is Roman-only: the Carthaginian
critical matrix reviews the same front as defender, while its own Assault refusal
is reviewed separately. Actual victory/defeat layouts share the result generator;
the Match matrices show real defeats and the Atelier shows victory.

## Deliberate art pins

`tests/art/pixel-hash.test.ts` deliberately records the ten redrawn command icons,
five new interface specimens and ten new UI/formation specimens listed below.
The aggregate catalogue pin moves from `280d0f795302fecb` to
`e484917786b1c83b` after actual image inspection, including the final side-by-side
layout. The intermediate vertical layout's pin was superseded. Individual figure,
terrain, glyph, palette, badge and settlement generators retain their previous pins.

| Artefact | Accepted hash |
| --- | --- |
| `icon:move` | `952e726e0eb37f6a` |
| `icon:attackMove` | `53964edea73a915a` |
| `icon:attack` | `11b74db46105d1bd` |
| `icon:hold` | `a5f3b42e4270dc84` |
| `icon:withdraw` | `cb788016de9614fa` |
| `icon:line` | `283aa81ffa65652a` |
| `icon:column` | `b3e799eba94c99d2` |
| `icon:garrison` | `c7dd4c2e78f23077` |
| `icon:assault` | `d874def643ce88c4` |
| `icon:blockade` | `81721f3e3139d215` |
| `interface:idle` | `949bdad4ac7c1977` |
| `interface:selected` | `441968d0f235a997` |
| `interface:armed` | `7ccadea48dd904b7` |
| `interface:disabled` | `4612506f4557e9b7` |
| `interface:focus` | `74aad50e7b9be297` |
| `ui:setup` | `82906ab423edd8b4` |
| `ui:squad` | `69db12c004c98aa7` |
| `ui:armed-pending` | `be5b1e5381012a2d` |
| `ui:construction` | `02bca410e02e4c6e` |
| `ui:options` | `1e03d0df52d0241e` |
| `ui:result` | `e641e2c442783d44` |
| `ui:rome-line` | `fde3a2c084513c3a` |
| `ui:rome-column` | `a08469a1781f8143` |
| `ui:carthage-line` | `73b1d1b02cffe05a` |
| `ui:carthage-column` | `4b56aa9f36f49c4a` |

## Independent review

Standards: **0 documented violations, 0 substantial baseline smells**. The review
identified one stale browser-document paragraph describing an oversized scrollable
canvas; it now documents temporary integer fitting and the retained preference.

Spec: **2 partial evidence requirements**, both addressed: add advanced Siege
conditions for each Faction/viewport, and activate every construction/recruitment
offer by keyboard as well as pointer. Those tests additionally found a focus bug:
military hover logic could suppress a settlement's last-order line and move its
rows while traversing them. Restricting that logic to Squad cards keeps economy
rows stable. Reviewing the new Siege frames exposed the Centre bug described above.
Both axes then reviewed the incremental fixes: **0 remaining Standards findings,
0 remaining Spec findings**. Their source review does not substitute for the
rendered inspection or final browser run.

Two unit tests exceeded their unchanged five-second limits when the full Node
suite competed with the Chromium matrix (`rules.test.ts`, `repo-fences.test.ts`).
Both were timeout failures, not hash/guard mismatches. The subsequent serial
`npm run verify` passed all **110 files / 1296 tests**, lint, types, guards and build;
no timeout or production rule was changed.

One complete Chromium attempt finished **140 passed / 1 failed**: the existing
fatigue-march scenario left one Squad at 12 rather than 15 Fatigue. Its unchanged
march/assertion logic then passed three serial and eight two-worker replays. The
cause was not reproduced, so it is not claimed fixed by a guessed rule change.
The spec now attaches the public scene/view/Squad reports if that threshold fails,
to retain evidence rather than discard the failure. No threshold, retry count or
timeout was relaxed. The final complete rerun is recorded below.

## Final command record

The final complete Chromium rerun passed **141 / 141 tests** in 8.1 minutes,
with two workers and no retries. This includes the fatigue scenario, every
required command/desktop/HUD/orders/surface suite, the complete appearance matrix,
Atelier GPU pixels, fog, settlement and terrain zoom checks. Production code is
the reviewed `3b89914`; the only subsequent executable edit adds failure evidence
to that existing fatigue test. No image is committed.

| Command | Verified result |
| --- | --- |
| `npm run verify` | 110 files / 1297 tests passed; lint, types, guards and production build passed |
| `npm run bake` | 509 artefacts regenerated; final catalogue hash `e484917786b1c83b` |
| Baseline `e2e/appearance.spec.ts --grep 'review frames'` with `SPQR_VISUAL_PHASE=before` | 4 passed; both Factions and desktop sizes, including recentered zoom evidence |
| Fatigue regression, unchanged logic | 3 serial + 8 two-worker repetitions passed after the 140/1 run |
| Final diagnostic-only edit | `npm run lint` and `npm run check` passed |
| `npx playwright test --project=chromium --workers=2 --output=test-results/issue62-acceptance-final` | 141 passed, zero failures/skips/retries |

Final logs are `%TEMP%/spqr-issue62-verify-complete.log`,
`%TEMP%/spqr-issue62-bake-final.log`, `%TEMP%/spqr-issue62-before-final.log`
and `%TEMP%/spqr-issue62-acceptance-final.log`. The diagnostic repeat logs are
`%TEMP%/spqr-issue62-fatigue-diagnosis.log` and
`%TEMP%/spqr-issue62-fatigue-parallel.log`; the earlier 140/1 result is retained in
`%TEMP%/spqr-issue62-final-browser.log`, not presented as a passing run.

## Gates outside this delivery

Hardware/full-density 60 fps (#31), other browsers, mobile, audio (#30), balance
acceptance (#29) and release/deployment (#32) are unrun. SwiftShader frames prove
what was drawn, not hardware frame rate. This work does not close the roadmap or
those issues. Unknown places have no settlement panel; remembered places have no
live owner, wall damage, stocks or unseen Siege progress. An unavailable Roman
ram for Carthage is explicitly reviewed, not silently omitted.
