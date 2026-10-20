# Issue #58 — Squad readability, tactical feedback and notices

Verified on 2026-10-20 against [#58](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/58), its blocker
[#55](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/55) and the shared approved requirements in
[#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51).

A Squad used to be a block of men with a destination diamond, and everything else about it lived
in the side panel. Now the theatre itself says what the men are: their **Faction** stands over them
as a standard, **Morale** is the primary condition on the plate of a picked Squad, the way they face
is a chevron on the ground, a **move** and an **attack-move** wear different marks, and a Squad in
trouble keeps one small shape even when nobody has picked it. Beside that, the interface keeps a
**current-Match notice journal** — standing conditions and brief events, deduplicated, clickable
where they name a place — and a labelled **estimate** of the next Season's Payroll, shown only when
the Faction's own knowledge makes it exact.

Nothing in the rules moved. `git diff --stat -- src/sim src/content src/ai` is empty: no rule, no
balance value, no pathfinding, no formation geometry and no authoritative hash changed. The whole
ticket is `src/art`, `src/render`, `src/ui` and their tests.

## What was extended, and where

- `src/art/figures.ts` — **the standard**. `standardInsignia(faction)` draws a six-by-thirteen
  banner on a pole: Rome's a rectangle with the aquila's bar, Carthage's a pennant tapering to a
  tail with the Tanit sign. The two differ in **silhouette** as well as cloth, and both are
  appended to `figureEntries()`, so the Atelier judges them beside the soldiers they mark. This is
  the ticket's *restrained insignia*: a mass of shields hides the cloth, and a standard stands
  above it. The **type** half of recognition remains C4's equipment and silhouette — the nine
  figures are byte-identical — and the ticket's own greyscale and silhouette tests still hold it.
- `src/art/markers.ts` — **the ground marks**, in the same declarative character-table style as
  the icons and resource markers. `orderMarker('move')` is C2's diamond, pixel for pixel;
  `orderMarker('attackMove')` is that diamond with a cross of blood inside it. `facingMarker()`
  is one chevron authored pointing south and turned with `rotateQuarterTurns` for the other three,
  and `conditionMark()` draws five shapes — a struck flight arrow (rout), a barred coin (unpaid),
  a cut chain (no supply), a drooping bar (fatigue) and an empty quiver (no missiles).
  `markerEntries()` names all eleven `mark:…` artefacts for the catalogue and the bake.
- `src/ui/conditions.ts` — **what the interface says about a condition**. The approved thresholds
  (Q16) live here as presentation constants: `MORALE_WARNING_SHARE = 0.25` (a *positive* Morale at
  or below a quarter of the type's maximum), `FATIGUE_WARNING = 15` of 20,
  `AMMUNITION_WARNING = 0` only for types that carry volleys, and `WINTER_WARNING_TICKS = 30 ×
  TICK_HZ`. Rout, an unpaid Season and a lost supply line are read from the Observation. The same
  module opens the **notice journal** (`createNoticeBook`): persistent conditions refreshed in
  place, events raised on a change, stable ids for deduplication, a bounded history of 24 events,
  and `lose(id)` for a target that has gone.
- `src/ui/forecast.ts` — **the labelled estimate**. `forecastTreasury` mirrors the boundary's own
  order *including the feeding step between production and tax*: each settlement produces its
  staffed, standing works' yield and its worked land's grain (halved in winter), the people eat and
  grow out of that granary up to the home they have built, and only then is the tax charged on the
  people still there — then the total is capped at the war chest and Payroll is charged out of the
  one Treasury in the Squads' order, with the rules' desertion threshold. It refuses to guess when
  an own settlement is blockaded, because whether the blockade holds is not known.
- `src/render/indicators.ts` — **the annotation's drawing and placement**. A 42×11 status plate:
  five Morale pips filled in proportion to the type's maximum, the figure, and up to two condition
  shapes. Low Morale is drawn in another colour *and* with hollow pips. `markerPlacement` keeps the
  plate above the block, the chevron two pixels outside the edge the Squad faces, and the standard
  above the top edge — all outside the men.
- `src/render/squad-layer.ts` — **four thin layers over the men**: standards under every block
  (so a standard never hides a soldier), the blocks themselves, and annotations over both. One
  sprite per Squad per annotation, textures shared by kind and re-composed only when their key
  changes; a healthy unselected Squad gets nothing but its standard, and a troubled one gets a 9×9
  pin with the most urgent condition's shape.
- `src/ui/hud.ts` — **the notice strip**. A floating panel at the theatre's top-right (clear of
  the bar and the minimap): `Avvisi (n)` opens the current-Match history in place, `!` marks a
  standing condition and `>` a brief event, each line is a hit target, and the labelled estimate
  sits under the lines. It is added to `hudRects()` and to the pointer's own interface test, so a
  click on a notice is a click on the notice and not on the tile behind it.
- `src/render/game.ts` — the wiring and the inspector surface: the journal is read once per redraw,
  the page remembers the verb of each movement order (the rules keep one route), `centerNotice(id)`
  centres through the same `centerOn` as the Centre control or records the target as lost, and the
  `notices`, `indicators`, `centerNotice`, `noticesOpen` and `toggleNotices` hooks publish what the
  theatre shows. The snapshot gained `notices` and `indicators`.
- `src/art/catalogue.ts` — the standards close the figures section and a **marks** section shows
  the two destinations, four chevrons and five condition shapes on the neutral plate. The plate is
  now 455×1964.
- Tests: `tests/art/markers.test.ts`, `tests/ui/conditions.test.ts`, `tests/ui/forecast.test.ts`,
  `tests/render/indicators.test.ts`, additions to the figure, catalogue, HUD and pixel-hash suites,
  and `e2e/readability.spec.ts`.

## The conventions this ticket adds

| Subject | Rule | Where |
| --- | --- | --- |
| Low Morale | positive and ≤ 25 % of the type's maximum | `ui/conditions.ts` |
| Fatigue | ≥ 15 of 20 | `ui/conditions.ts` |
| Ammunition | zero, **only** for a type whose maximum is above zero | `ui/conditions.ts` |
| Winter | the autumn→winter boundary is within 300 ticks (30 simulation seconds) | `ui/conditions.ts` |
| Rout, unpaid Payroll, Supply | the rules' own facts, read from the Observation | `ui/conditions.ts` |
| Event notice freshness | six simulation seconds, then history only | `ui/conditions.ts` |
| History | the 24 most recent events plus every standing condition | `ui/conditions.ts` |
| Estimate | production/tax, then Payroll, cap at 200, refuse on a blockade | `ui/forecast.ts` |

These are **presentation** values. They change what the interface says and nothing about what the
rules do; no simulation file was touched.

## The numbers

- **Bake**: **494 artefacts** (481 before: the two standards and eleven marks), catalogue plate
  **455×1964**, hash **`280d0f795302fecb`**.
- **Changed hashes, reviewed on purpose**: the plate (`e566bc8e1bd75edc` → `280d0f795302fecb`,
  taller by 90 px for the standards and the marks section) and thirteen new artefacts:
  `insignia:rome 427559bbe6cfc0ce`, `insignia:carthage 51c811280a90e122`,
  `mark:order:move 0c5953cd1b170478`, `mark:order:attackMove b0fdd0d2423547df`,
  the four chevrons `9229abee…`, `95a103c8…`, `349a8aae…`, `64f66cce…`, and the five conditions
  `ec5b91d5…`, `cca7758a…`, `fc46a87d…`, `53036533…`, `527b1967…`. **Every hash pinned before
  this ticket is byte-identical** — every glyph, ramp, terrain tile, road, node marker, separated
  specimen, settlement and figure — so “the readability work extends the art rather than repainting
  it” is a diff and not a promise.
- **Drawn sizes**: status plate 42×11, condition pin 9×9, destination mark 9×9, facing chevron
  7×7, condition shapes 5×5, standard 6×13.
- **Unit suite**: 107 files, **1275 tests** (1219 before; 56 added).
- **Browser suite**: **104 tests** (97 before; seven new in `e2e/readability.spec.ts`).

## Where each acceptance criterion is proved

| Criterion | Where |
| --- | --- |
| Type/Faction recognition by equipment, silhouette and insignia, not colour alone | `tests/art/figures.test.ts` (the standards differ with the cloth taken out; every roster pair still differs in silhouette), `tests/art/markers.test.ts`, the catalogue's figures and marks sections |
| Individual soldiers and formation/strength rendering preserved at every zoom, no aggregate icon, no geometry change | `src/render/squads.ts` untouched except for the mark's removal; `tests/render/squads.test.ts` unchanged; the annotations are separate sprites in their own layer; `e2e/squads.spec.ts` still compares the block's own pixels |
| Selected Squads show Morale first, clear facing and distinct movement/attack-move feedback; healthy unselected Squads carry nothing | `tests/render/indicators.test.ts` (pips, hollow low Morale, placement), `tests/ui/hud.test.ts`, `e2e/readability.spec.ts` tests 1–3 (`plate`/`pin`/`none`, chevron, move vs attack-move pixels) |
| Critical signals use shape/text as well as colour, over terrain and remembered ground | `tests/art/markers.test.ts` (five pairwise-distinct silhouettes), `tests/render/indicators.test.ts` (hollow pips, two shapes, opaque plate ground), the `!`/`>` marks in `noticeLine` |
| Persistent conditions and brief events are distinct, deduplicated, reviewable, and clickable with stale targets handled; no auto-pause and no hidden information | `tests/ui/conditions.test.ts` (dedup, bound, lost, winter window, own settlement only), `tests/ui/hud.test.ts` (strip, history, lost text), `e2e/readability.spec.ts` tests 4 and 6 (a refused order; every target is the Faction's own; `paused()` stays false; the line centres the place through the Centre control's own camera) |
| Approved warning thresholds; rules-owned conditions follow the rules; presentation only | `tests/ui/conditions.test.ts`; empty `src/sim` diff |
| Forecast labelled, derivable from known data including boundary ordering; Treasury alone proves nothing | `tests/ui/forecast.test.ts` (production → eat/grow → tax → Payroll, winter land, cap, greedy order, desertion, blockade refusal), `e2e/readability.spec.ts` (the label is on the strip) |
| Atelier and representative scenes: both Factions, zooms, mixed selections, critical states; pause/speed; audio coordinated without being necessary | catalogue's figures + marks sections; `e2e/readability.spec.ts` (both Factions at 1280×720 and 1920×1080, a mixed selection of two raised lines, a Fatigue-15 scene reached by marching, pause and speed-3 checks). No audio exists; every signal is visual, and #30 owns synthesized cues |

## Rendered evidence

Written outside the repository (the guard forbids committed images), under
`%TEMP%\spqr-issue58` on this machine:

| File | What it shows |
| --- | --- |
| `selected-rome-1280x720.png`, `selected-rome-1920x1080.png` | a picked Roman line: plate with Morale, chevron, standard, destination |
| `selected-carthage-1280x720.png`, `selected-carthage-1920x1080.png` | the same for Carthage, in its own cloth and pennant |
| `attack-move-rome.png` | the attack-move's crossed diamond at its destination, after the same Squad had worn the move diamond |
| `notice-refusal-1920x1080.png` | a refused order as a `>` notice on the strip, after a real right click on deep water |
| `fatigue-plate-rome-1280x720.png` | two picked lines at Fatigue 15: two plates, the fatigue shape beside the Morale pips |
| `fatigue-pin-rome-1280x720.png` | the same two Squads unpicked: one condition shape each, no bar, no label |
| `zoom-1-rome-1920x1080.png`, `zoom-8-rome-1920x1080.png` | the same picked Squad at the camera's coarsest and finest magnifications: the soldiers are still individual and the plate still reads |
| `mark-over-remembered-ground-rome.png` | a destination mark over ground the Faction has marched past and now only remembers, sampled pixel for pixel against the mark's own art |

The screenshots are evidence a human reviews; what the tests assert is data, clicks and pixels.
The browser tests run under software WebGL (SwiftShader), which is **not** frame-rate evidence.

## Commands run

```
npm run lint                                  # clean
npm run check                                 # tsc -b, clean
npm run guard                                 # fences hold
npx vitest run                                # 107 files, 1275 tests passed
npx playwright test --project=chromium --workers=4   # 104 tests passed (2.5 m)
npm run build                                 # built
npm run bake                                  # 494 artefacts; plate 280d0f795302fecb
```

## Unrun gates and known limitations

- **Hardware frame rate and full density (#31)**: not measured. The annotations add at most four
  sprites to a selected Squad and one to a troubled unselected one, share their textures by kind
  and re-upload only when their key changes, but no 60 fps claim is made from a software renderer.
- **Audio (#30)**: there is no audio in the tree. Notices and marks are fully understandable from
  shape and text, so synthesized cues remain an enhancement and never a requirement.
- **Release and integrated acceptance (#32, #59)**: not run and not claimed.
- **Stale-notice scene in the browser**: the unit journal test marks a target lost and the hook's
  refusal of an unknown id is checked in the browser, but no live scene removes a Squad mid-Match
  to show the lost line; doing so needs a rout/desertion scene, which belongs to #29/#32.
- **Fast-forward and multi-tick steps**: the journal compares consecutive *reads*. An event that
  begins and ends inside one `advance(n)`/`fastForward` is not journalled. Ordinary play reads on
  every stepped tick, which is the case the ticket asks about.
- **Compact (non-desktop) layout**: the notice strip is desktop-only; the fixed 640×480 fixture
  layout returns a zero-size strip. The Match page is desktop, and #59 owns integrated acceptance.
- **Pre-existing block anchoring**: `render/squads.ts`'s `blockAnchor` anchors the front rank's
  head to the tile's ground line, so a block is drawn one to two tiles low relative to its tile.
  U7 deliberately preserves it — the ticket forbids altering the rendering/formation contract —
  and every annotation is placed relative to the block as drawn, so the two cannot disagree.
  Correcting it moves every Squad's drawn rectangle and belongs with the rendering work in #31/#32.
