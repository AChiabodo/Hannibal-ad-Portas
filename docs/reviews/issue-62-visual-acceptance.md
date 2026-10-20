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
`$env:SPQR_VISUAL_PHASE='before'`. The UI-focus-only regression is intentionally
skipped on that revision. Delete that environment override for candidate frames.
No PNG is committed (ADR-0002).

The primary spec tests each military command at both desktop sizes for both
Factions with pointer and keyboard, settlement tabs by both paths, numbered
control groups, queued/applied/armed/disabled feedback, and console health.
Functional and additional evidence producers are `acceptance`, `first-entry`,
`commands`, `desktop`, `hud-repair`, `orders`, `surface`, `settlements`,
`readability`, `terrain-readability` and `atelier` browser specs.

Final command results, inspected supplementary paths and the independent review
record are appended after the final verification run.

## Gates outside this delivery

Hardware/full-density 60 fps (#31), other browsers, mobile, audio (#30), balance
acceptance (#29) and release/deployment (#32) are unrun. SwiftShader frames prove
what was drawn, not hardware frame rate. This work does not close the roadmap or
those issues. Unknown places have no settlement panel; remembered places have no
live owner, wall damage, stocks or unseen Siege progress. An unavailable Roman
ram for Carthage is explicitly reviewed, not silently omitted.
