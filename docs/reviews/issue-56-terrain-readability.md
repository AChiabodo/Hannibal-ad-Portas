# Issue #56 — Terrain and Resource readability within the current generators

Verified on 2026-10-20 against [#56](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/56), its blocker [#55](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/55) and the shared approved requirements in [#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51).

The terrain stopped competing with the men. Every material is still the material it
was — plain on olive, hill on stone, forest a dark olive canopy, farmland on
parchment, water on its own blue, a ford two steps lighter with its stone slabs, a
road's verge gravel in bronze — but its texture now dithers **between neighbouring
shades of a finer ramp of the same base** instead of jumping a whole shade of the
standard one. A standard shade steps twenty percentage points of a base's spread and
a detail shade ten. On the theatre the average brightness jump from a pixel to the
one beside it roughly halves or better (table below), and the same in-game scene
measures **2.18 times** as much contrast in a Squad block as in the terrain under it
before the change and **4.58 (Rome) / 4.97 (Carthage)** after it.

Nothing about the map, the rules or the pipeline moved. `art/terrain.ts`'s painter is the same painter with its numbers read from a declaration; the autotiling is the same five shapes plus rotation; `cellTile`, `roadTile`, the dual grid, the tile size and the seed are untouched. `sim/`, `render/terrain.ts` and `render/fog.ts` were not edited at all, so the authoritative hashes, pathfinding and formation geometry cannot have changed — and `tests/render/fog.test.ts`, `tests/render/terrain.test.ts` and the whole simulation suite pass unmodified apart from the one fog assertion noted below.

## What was extended, and where the contrast now lives

- `src/art/palette.ts` — **`DETAIL_RAMPS`**, `DETAIL_SHADES` (13) and `detailAt`. The same bases, the same derivation (`ramp(base, 13)`), the same dark and light ends, **twice the granularity**: ten points of the spread to a step rather than twenty, and a detail ramp's even indices *are* the standard shades (`DETAIL_RAMPS.olive[6]` is `RAMPS.olive[3]` is `BASE.olive`), so it is a subdivision of the palette and not a second one. Its odd indices are colours nothing else in the library paints — which is what a *surface* needs and a drawn thing does not, and is the one way this change leaves the standard ramps' grid. Same bases, same derivation, same travel: palette identity is preserved, and no new base and no second drawing path exist.
- `src/art/terrain.ts` — **`MATERIAL_TEXTURES`**, a declared texture per material: the **body** (the shade most pixels take), the **dark** (exactly one detail step, the dither), and the one **mark** that names the material — a blade of grass, a lit outcrop, a canopy blot, a furrow and its drill, a wave, a ford's stepping stones, a road's gravel — with the share of the tile that mark may cover. `materialShades()` is the declaration as the colours a test compares the pixels against. The painter reads it; nothing else draws.
- `src/art/separation.ts` — **separation specimens**, new to the catalogue: three tiles of every material, tiled edge to edge, with one soldier of each Faction standing on the middle one. It is the picture U5 is judged on: a single tile cannot show *repetition*, which is the complaint the ticket starts from, and a terrain patch without a man cannot show *figure over ground*.
- `src/art/catalogue.ts` — a **`separation`** section on the plate: a caption row of material names, then one row per Faction (Rome's `hastati`, Carthage's `libyan-spear`), each a patch per material. Fourteen new named entries `separation:<faction>:<material>`.

No external asset, dependency, font or image model; no second drawing path; no change to `PixelBuffer`, the PixiJS adapters, the Atelier workflow, the Tile scale, the autotiling or the map.

## The numbers

Mean brightness jump between neighbouring pixels inside one material's tile, and the tile's own brightness spread (0–255 scale). These are the numbers `tests/art/terrain.test.ts` bounds, and they are why the change was made:

| material | mean jump before → after | spread before → after |
| --- | --- | --- |
| plain | 19.6 → **7.7** | 80 → **26** |
| hill | 35.6 → **7.2** | 102 → **26** |
| forest | 11.9 → **5.4** | 69 → **23** |
| farmland | 16.4 → **7.4** | 92 → **40** |
| river | 11.8 → **5.3** | 71 → **31** |
| ford | 16.2 → **5.3** | 61 → **52** |
| road | 10.7 → **8.5** | 23 → **27** |

A standard ramp shade steps twenty percentage points of a base's spread and a detail
shade ten, which is why the bars in the tests are the detail step and not an invented
constant: a dither of **one** detail step, a mark of the terrain's own base at most
**two**, no material above a mean jump of **10**. The two floors that did not move: hill's lit outcrop is now a detail step rather than a whole ramp shade, and a ford's stepping stones are still the loudest thing on the water (spread 52) because a crossing is a landmark and is meant to be found.

The reference figures came from `meanNeighbourJump` in the test and from a one-off run of both trees' `materialTile`; the in-game figure is `e2e/terrain-readability.spec.ts`'s own annotation.

## Where each acceptance criterion is proved

| Criterion | Where |
| --- | --- |
| Distracting contrast reduced in ordinary terrain | `tests/art/terrain.test.ts` (`meanNeighbourJump ≤ 10`, and the dither is one detail step), `tests/art/palette.test.ts` (a detail step is finer than a standard one) |
| Terrain types still distinguishable at supported zooms | `tests/art/terrain.test.ts` (mean colour distance between materials), `tests/render/fog.test.ts` (a remembered theatre keeps them apart), `e2e/terrain-readability.spec.ts` (a screen holding five terrains still spans a wide brightness) |
| Boundaries, roads and fords still legible | `tests/art/terrain.test.ts` (the silhouette is painted where the region changes, unchanged), the road tests (unchanged), the ford's stones declared as its mark, and the before/after spread of the road material above |
| Resource markers still distinguishable | `tests/art/nodes.test.ts` (every marker reaches at least two detail steps outside the whole brightness range of every terrain, and spans at least 60 levels of its own), `tests/render/terrain.test.ts` (every node is drawn where B1 placed it) |
| Palette identity, generation rules, seed, Tile scale, autotiling preserved | `tests/art/palette.test.ts` (a detail ramp holds every standard shade, one index in two), `tests/art/terrain.test.ts` (unchanged variant/rotation/road tables), `tests/render/terrain.test.ts` (same pixels for the same seed, different for another), `tests/render/camera.test.ts` and the untouched `sim/` suite |
| Generators/specifications and catalogue extended; artifacts regenerated; changed hashes reviewed | `MATERIAL_TEXTURES`, `DETAIL_RAMPS`, `separation.ts`, the plate's new section, `tests/art/pixel-hash.test.ts`, and the diff of the bake below |
| Atelier comparisons and representative in-game scenes show better figure/ground separation, visible and remembered | the plate's `terrain` row (each material bare) beside its `separation` rows (the same materials under a man of each Faction), and `e2e/terrain-readability.spec.ts`: both Factions, 1280x720 and 1920x1080, zooms 1/2/4/8, visible and remembered terrain sampled from the live frame |

## The changed hashes, reviewed on purpose

`npm run bake` was run on both trees and the two directories compared byte for byte. **88 artefacts moved and nothing else did** — the seven material tiles, the eighty variant tiles of the five materials that have variant rows, and the plate:

| artefact | before | after |
| --- | --- | --- |
| `terrain:plain` | `a38e504004e2b885` | `d14d3e402472f841` |
| `terrain:river` | `071c4ea85185bd39` | `a2579b9a216a4285` |
| `terrain:forest:1` | `ca8c7a531f8ac267` | `13d735e83c0f4576` |
| `terrain:forest:3` | `05220f100872dc91` | `39b83fd25393c7fe` |
| `terrain:ford:15` | `7d34527f96548791` | `8eba09ba35bdbb45` |
| `catalogue` (plate) | `7bb2e03b154fc922` (455×1120) | `710051d5f6f235ab` (455×1254) |

Every hash that did **not** move is the other half of the review: every glyph, every
ramp, every figure, every icon and badge, all four `node:` markers, and the sixteen
`road:` path pieces are byte-identical. The road *path* is drawn on top of the verge,
so a road still looks like a road; only the verge under it was quietened. All
**fourteen** new `separation:` artefacts are pinned in `tests/art/pixel-hash.test.ts`,
beside one hash per moved terrain material.

## Commands and results

- `npx vitest run tests/art/palette.test.ts` — the new detail-ramp tests, red first (`detailAt is not a function`).
- `npx vitest run tests/art/terrain.test.ts` — the new terrain-texture tests, red first (`plain: expected 19.570455833333348 to be less than or equal to 10`), then green.
- `npx vitest run tests/art/separation.test.ts` — the new specimen tests, red first (no module), then green.
- `npx vitest run tests/art tests/render` — **198 tests across 17 files**, green after the hash repin.
- `npx vitest run` — **1173 tests across 100 files**, green (1159 before this ticket: fourteen new).
- `npm run lint` — clean.
- `npm run guard` — all seven fences hold (no `Math.random`, no transcendentals, no ambient clock, PixiJS under `render/`, no committed assets).
- `npx tsc -b` and `npx tsc -p tsconfig.e2e.json --noEmit` — clean.
- `npm run build` — green.
- `node src/cli/bake-main.ts --out …` on both trees; equal output for every artefact except the 88 listed above.
- `node src/cli/bake-main.ts` — `catalogue 455x1254 710051d5f6f235ab`, twice, identical.
- `npx playwright test e2e/terrain-readability.spec.ts` — 4 passed.
- `npx playwright test` — **91 browser tests passed** (87 before this ticket), including the Atelier's pixel-for-pixel column comparison at zooms 1, 2 and 4 with the taller plate.
- `git diff --check` — no whitespace errors (only the repository's existing CRLF notices).

A one-off timing of `renderTerrain` on two seeds came out at 64 ms / 33 ms after the change and 65 ms / 37 ms before it, on the same machine: composing the theatre costs what it cost. This is a Node measurement of the generator, not a frame-rate claim — hardware and full-density performance remain [#31](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/31)'s.

## Rendered evidence, and its limits

The spec writes PNGs outside the repository (the guard forbids committing image files) to `%TEMP%\spqr-issue56`:

- `match-{rome,carthage}-{1280x720,1920x1080}-zoom{1,2,4,8}.png` — sixteen scenes. Each is the real Match page opened through the setup's own `?play=` address, paused, with a watch moved out and back so that **visible and remembered terrain are on screen side by side**; each was captured after asserting that every sampled point of it is the generator's own pixel exactly (in view) or under the fog's own veil (remembered, within the one rounding an 8-bit framebuffer adds).
- `match-rome-1920x1080-every-terrain.png` — the full theatre at 1:1, squads hidden, for judging the seven materials side by side.
- `squad-{rome,carthage}-1280x720.png` — a Squad raised through the settlement's own recruitment page, standing on its terrain.

The same run *measures* the figure/ground claim instead of asserting it from source: the block's screen rectangle is sampled twice, with the men and with the page's own `showSquads(false)` lens, and the men's brightness range is compared with the median central tile of the terrain beneath them. On the art before this ticket that measurement is `figure 200.6 / terrain 92.1 = 2.18` and the test fails; on the delivered art it is `184.8 / 40.3 = 4.58` (Rome) and `200.6 / 40.3 = 4.97` (Carthage). The before-run's sixteen screenshots were kept beside the after-run's (`%TEMP%\spqr-issue56-before`, `%TEMP%\spqr-issue56`), and the two bakes in `%TEMP%\spqr-bake-before` and `%TEMP%\spqr-bake-after`.

Applicability, stated rather than assumed:

- **Both Factions** — the terrain is Faction-independent, and the men are not: the separation specimens and the Squad scenes use a Roman and a Carthaginian first line.
- **Supported zooms** — every whole magnification from 1 to 8 is exercised by the existing browser suite against the generator; this ticket's scenes are captured and asserted at 1, 2, 4 and 8, the two extremes and two between.
- **Visible / remembered / unknown** — visible and remembered are both in every scene and both exact against the generator. Unknown is deliberately *not* sampled as terrain: an unexplored tile is the fog and nothing else, so it says nothing about the quietened art (`tests/render/fog.test.ts` owns that state, and still passes).
- **1280x720 and 1920x1080** — both resolutions, both Factions, and the layout itself is [#54](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/54)'s to own.

**Unrun gates, stated plainly.** This harness cannot display images, so the agent did not eyeball the sixteen scenes, the fourteen specimens or the two bakes; what is asserted above is live frame sampling, generator comparison and measured contrast. A human should open the files under `%TEMP%\spqr-issue56` beside `%TEMP%\spqr-issue56-before` before the visual acceptance in [#59](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/59). No hardware or full-density frame-rate evidence is claimed here: that is #31's, and a software-WebGL screenshot could not prove it. Nothing in this ticket touched audio (#30), release (#32), balance (#29) or the E2E hooks (#28).

## Review

Two-axis review against `f98d79a` (the ticket's work uncommitted), both axes run
independently as parallel sub-agents: **Standards** (repo conventions plus the Fowler
smell baseline) and **Spec** (issue #56 and its acceptance criteria). Their findings,
and what was done with each:

### Standards

- **Hard, fixed.** `GLOSSARY.md` keeps *Terrain* and avoids *Ground*; the new public
  API named Terrain "ground". Renamed to `MATERIAL_TEXTURES`, `MaterialTexture`,
  `MaterialShade`, `MaterialColours`, `materialShades`; prose now says *terrain*, and
  the one place that keeps "figure and ground" says why — it is the trade's word for
  the pair in a picture, not a second name for Terrain.
- **Hard, fixed.** `README.md` said the palette is "six ramps of seven shades", which
  the detail ramps make false. It now documents `DETAIL_RAMPS` and why a surface and a
  drawn thing want different steps.
- **Hard, fixed.** The README's `art/` module tree omitted `src/art/separation.ts`
  (and, from #55, `src/art/icons.ts`); both are listed.
- **Hard, fixed.** The prose said "a fifth … a tenth" of a ramp's travel. A standard
  shade steps twenty percentage points of the base's spread and a detail shade ten;
  said that way in `palette.ts`, `terrain.ts`, the test and this report.
- **Judgement, taken.** Three copies of `luminance` (and two of a brightness range)
  became `tests/art/brightness.ts`, the precedent being `tests/sim/map-invariants.ts`;
  the browser spec keeps its own three-line copy because `tsconfig.e2e.json` cannot
  import `tests/`.
- **Judgement, taken.** `covers` was about to become a third copy in `e2e/`, and
  `press` a second: both moved into `e2e/hooks.ts` and `boot.spec.ts`, `fog.spec.ts`
  and `commands.spec.ts` now import them instead of keeping their own.
- **Judgement, taken.** Two catalogue aliases (`SEPARATION_CAPTIONS`,
  `SEPARATION_ROW_LABELS`) that only re-named their imports were deleted, and a
  150-column test constant was wrapped.
- **Judgement, kept deliberately.** `body`/`dark` are indices into the terrain's own
  ramp while `mark` carries its own: the mark is the only shade that may leave the
  base (a ford's stones are stone on water). `MaterialTexture` now says so, which is
  the difference between an inconsistency and a rule.
- **Judgement, kept deliberately.** "separation" names the plate section after the
  property the picture is for, and the picture itself is a *specimen*; the module
  documents the split.

### Spec

- **P1, fixed.** The report claimed all fourteen `separation:` hashes were pinned when
  four were. All fourteen are now in `tests/art/pixel-hash.test.ts` and the sentence
  matches the file.
- **P2, fixed.** "Palette identity preserved" was resting on a false claim: a detail
  ramp's odd indices *are* colours no other art uses. Said plainly in `palette.ts`,
  `palette.test.ts` and the report — the decision stands (same bases, same derivation,
  same travel, the standard shades at every other index), and the reason a surface
  wants a step the drawn art does not is the ticket's own subject.
- **P2, fixed.** The browser test was titled "at every zoom" while walking 1, 2, 4 and
  8. The title now says which zooms; the note below says where the other magnifications
  are covered.
- **P2, clarified.** "Atelier comparisons" existed only as PNG pairs outside the
  repository. The plate's comparison is the `terrain` row (each material bare) beside
  the `separation` rows (the same materials under a man of each Faction); a *before*
  picture cannot live on the plate without keeping the old generator as a second
  drawing path, which the ticket forbids, so the before/after pair is the bake diff
  plus the two `%TEMP%` directories named above.
- **P2, kept deliberately.** `DETAIL_RAMPS` covers all six bases although only terrain
  reads them: the two ramps of a base are one derivation at two resolutions, and a
  partial second table is a table that drifts. `tests/art/palette.test.ts` checks the
  pair base by base, which is what a partial table could not.

Both axes' non-findings are worth one line: the reviewers agreed the simulation,
`render/terrain.ts`, `render/fog.ts` and the dual grid are untouched, that the hashes
were re-pinned rather than the tests weakened, and that the new material is covered by
tests that fail without it.
