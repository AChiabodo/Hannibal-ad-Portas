# Issue 67: procedural formations and proportions

Reviewed on 2026-10-21 against `e94cc391baf16894fd4f7e1a00fc18eb8a4203c2`.
The live choice is enriched native 10x14 Figures, file/rank steps 4/5,
48x48 minor settlements and 72x72 Strongholds. Recruitment remains 24/60/120
for Roman infantry and 24/48 for Carthaginian infantry. No simulation file,
content price, combat frontage, Observation contract or simulation RNG changed.

## Visual decisions

| Candidate | Observed result at display size | Verdict |
| --- | --- | --- |
| Enriched native 10x14 | Shield shapes, helmet crests, breastplate/clasp/buckle and weapon lengths retain the existing silhouettes. Four-pixel file spacing bounds a 120-man line to 54x59. The enlarged roofs, keep and fortification give structures a coherent relative mass. | Ship |
| Authored compact 7x10 | Smaller individual silhouette, but the reduced head/shield space makes front/profile distinctions weaker and shields read as a repeated grille in full Squads. The whole formation is still dominated by its slot spacing. | Reject; retain in Atelier for comparison |
| Fine 20x28 source at half display scale | Added half-pixel seams/glints are real source detail. At zoom 1 they disappear; at zoom 3 nearest sampling gives unequal 1/2-screen-pixel widths. At even zooms they read as speckling on dense infantry rather than clearer equipment. | Reject; no fractional scaling in live Squads |
| Initial native 3/4 spacing | Strong horizontal bands hide too much equipment despite a small footprint. | Reject; revised to 4/5 before final frames |

The native result preserves the palette, generated font, orthogonal projection,
PixelBuffer composition and PixiJS nearest sampling. It deliberately keeps
overlapping ranks: these remain formations rather than separated portrait grids.
At zoom 1 equipment is compressed, so facing chevrons, standards and the selected
condition plate remain useful. At zoom 4 the camera must focus a selected block;
one frame cannot contain every large column and the entire surrounding army.

## Purchased slots and selection

Line grids are 6x4 / 10x6 / 12x10 for Rome and 6x4 / 8x6 for Carthage.
Columns halve the line files, rounding up: 3x8 / 5x12 / 6x20 and 3x8 / 4x12.
Slingers use 6x4 (column 3x8); Numidian cavalry use 4x3 (column 2x6).
An elephant remains one Figure, independently of abstract strength.

Casualties remove a fixed ordering of purchased slots derived from capacity and
Squad id. Existing holes persist and include interior gaps. Surviving slots,
buffer bounds, front-rank foot anchor, selection ring, standard and plate do not
recenter as strength falls. This is an illustration of aggregate losses, never
individual soldier state or a claim about historical casualty locations.
The grid rotates; Figures remain upright. Paint order follows screen depth.

Clicks and box selection use the same drawn alpha coverage. A vacant area passes
through to the visible Figure/structure behind it, preserving existing layer,
depth and id priority. The renderer caches the same shape-dependent image for
picking. Corpses continue to use the same roster's death frames and existing
fading/knowledge filters. A completed Castrum appears only when the own filtered
Observation explicitly supplies the work; unknown enemy works are not inferred.
Remembered structures lose camp, owner, damage, gate direction and ram detail.

## Real 60 versus 64 comparison

`proportions-*-native-*-z*.png` places 60 at 10x6 and 64 at 8x8 beside 120,
a minor settlement, a Stronghold with breaches/ram, overlap, a corpse and memory.
At native size, 60 is 46x39 pixels and 64 is 38x49: 64 is narrower but taller,
with 6.67% more men. Its 1862-pixel bounding area exceeds 60's 1794 pixels.
The compact square is not a free reduction in footprint or force.

A hypothetical 64 purchase would scale the 24-man resource basis by 8/3 instead
of 5/2, with integer rounding. For current Hastati arithmetic, 60 costs 20 grain
and 5 iron; hypothetical 64 costs 22 grain and 6 iron. Both round to 8 denarii
Payroll at full strength. These are arithmetic implications, **not legal 64-man
Recruit quotes**. Switching would also require explicit approval and renewed
#65/#66 validation. The visual evidence gives no reason to replace the approved
60 baseline, and 64 has not been added to recruitment.

## Producers and inspected evidence

Images are outside Git at
`C:/Users/aless/AppData/Local/Temp/spqr-visual/issue67/`.
No PNG or other binary is committed. Browser plugin not available; the repository
Playwright/Chromium workflow uses SwiftShader, which does not establish #31's
hardware full-density 60 fps target.

- `e2e/formation-art.spec.ts`, profile `squads`, produces 16 `field-{faction}-{width}-z{zoom}.png`
  and 96 `{formations|proportions}-{faction}-{native|compact|fine}-{width}-z{zoom}.png`.
  Factions: Rome/Carthage; viewports: 1280x720 and 1920x1080; zooms: 1/2/3/4.
  Formation plates show every facing, line/column, 24 full and 13/24 damaged.
  Proportion plates show 60/64/120, overlap, selected bounds, structures, memory,
  Castrum (Roman only) and residue. Real field scenes include mixed capacities,
  specialists, damaged columns, standards and selected condition plates.
- Reproduce: `node scripts/verify.mjs visual --grep=recruited`.
  `atelier.html?study=67&faction=rome&treatment=native&zoom=3&scene=proportions`
  is the interactive inspection entry; `scene=formations` shows the slot study.
  Atelier navigation links expose the studies; the ordinary catalogue includes
  the Castrum specimen and all roster directions/actions. Two columns keep the
  enlarged structure gallery within the existing 8192-pixel GPU limit.
- `before-field-{faction}-{1280|1920}.png` / `after-field-{faction}-{1280|1920}.png`
  use the same `e2e/formation-fixture.{html,ts}`, selected Squad 3 and the F camera
  command. Before is detached `e94cc39`, with only those two fixture files copied
  in, served on port 4401; after is the working revision on 4402. Both are paused.
  Before: 3/4 representative counts, shrinking/repacked damaged formations,
  armies visually larger than the old Stronghold. After: exact Figure counts,
  stable thinning, clearer structure/army mass and less lateral obstruction.
- Directly inspected native formations at zooms 1/2/3/4 across both Factions and
  reference sizes; representative compact/fine frames include zooms 1/2/3/4,
  especially fine at odd zoom 3. Inspected before/after field pairs for both
  Factions, selected field at zoom 4, and `catalogue-figures-browser.png` with all
  nine types, four facings and idle/walk/attack/death. The generated matrix is
  broader than these individual inspection samples; hashes are not an art verdict.
- Rejected intermediate/manual captures (`study-*`, `revised-native-*`) remain
  outside Git. The first field producer could drift to empty fog after repeated
  zooming; final field captures press F at every zoom to keep the subject visible.

## Verification

Focused red/green checks cover exact Figure count, purchased grids, persistent
interior gaps, anchors, alpha picking and Castrum knowledge. Browser samples use
real pointer selection and GPU readback; existing Squad/settlement specs retain
full generator/GPU comparisons and the fog/Siege/input regressions.
Art pins were refreshed only after the native/candidate/browser image inspection.
The final command results are recorded in the delivery commit and review.

`npm run verify` passed: 115 test files / 1349 tests, lint, TypeScript, all fences
and the production build. The four focused browser cases passed, and the explicit
visual producer passed all four viewport/Faction cases (112 final matrix frames).
