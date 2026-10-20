# Issue #57 — Settlements and fortifications, drawn and picked

Verified on 2026-10-20 against [#57](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/57), its blocker
[#55](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/55) and the shared approved requirements in
[#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51).

A settlement used to be a tile the rules knew about and a single coloured pixel on the
minimap. Now it is a **place on the main map**: a village of roofs two tiles across, or a
Stronghold three and a half tiles across inside a stone enceinte of four walls and a
gate, with towers, a keep, each Faction's cloth, and — from the Observation — walls that
are whole, hurt or broken, and the ram at the gate. Clicking a place's **drawing** opens
its panel; a place the Faction only remembers is drawn as a stone silhouette under the
fog, with no banner, no gate and no damage, and its panel says *ultimo contatto noto*.

Nothing in the rules moved. `sim/` was not edited at all: no collision, no footprint, no
route, no capture or Siege rule, and no enemy-memory rule. `e2e/boot.spec.ts`'s
"boots…" check and the whole `sim/` suite pass unmodified apart from the settlement
lens noted below, and every simulation hash pinned in the repository is untouched.

## What was extended, and where

- `src/art/settlements.ts` — **the drawing**. A declarative `SettlementLook` (kind, owner,
  memory, gate side, gate condition, four wall conditions, ram) and a pure
  `siteSprite(look)` that memoises per look. One **40×7 wall section** — merlons along the
  outer edge, a walk, a face, a shadow — is turned four ways for the four sides with
  `rotateQuarterTurns`, exactly as B3 turns one terrain transition; one 8×8 **tower** is
  placed four times; the **gatehouse** is drawn on the south wall and the whole town is
  then **rotated** so its gate faces the side the rules give it (`gateSide`), so one
  drawing serves all four and the four cannot disagree about the wall. Damage is a
  declared treatment of the same section, not a second wall: `damaged` knocks the merlons
  off, drops the walk into a notch and cracks the face, `breached` clears the wall from
  walk to shadow and leaves rubble. A **ram** (frame, or shed and beam) stands outside the
  gate it batters. A remembered look is forced to `owner: none`, no gate, whole walls, no
  ram, and then re-tinted into the stone ramp (`ghost`) — memory carries no condition.
  `SITE_SPECIMENS` is the plate's ten-row sample of that space.
- `src/ui/sites.ts` — **what the Faction may see**. `siteIdentities(map)` (the theatre's
  own list, the same one the minimap walks; a test pins its ids against `createEconomy`)
  and `knownSites(identities, observation, fog, faction)`. Ownership comes from the
  Observation (own settlements, contacts) and never from the map; a place remembered has
  `front: null`, so no wall, gate, breach, ram or garrison can be read out of memory.
  A place whose tile is unexplored is not in the list at all.
- `src/render/settlements.ts` — **one geometry for drawing and picking**. `siteRect` is the
  art centred on the tile, `siteDepth` is the tile row, and `siteLook` maps a `KnownSite`
  to the art's look at the rules' own thresholds (`WALL_HP`, `GATE_HP`, `standing`).
- `src/render/settlement-layer.ts` — the PixiJS adapter: one sprite per place, re-textured
  only when its look changes, one shared texture per look, bracket marks for the selected
  place, drawn **under the fog and under the men** (`zIndex` 1, between the terrain at 0
  and the fog at 2; `render/boot.ts` now sorts the world by `zIndex`).
- `src/input/selection.ts` — `Pickable` gained the kind it picks and the layer it is drawn
  in; a click on a place opens its panel, a box still picks only men, and `pickableAt` is
  the one "which one did the Player mean" rule the click and an armed action share.
- `src/render/game.ts` — the layer on every repaint, the same list for the panel
  (`HudSession.sites`), picking through `pickables()`, armed settlement targets by the
  drawn rectangle, and two new debug hooks: `sites()` and `showSettlements()`.
- `src/ui/hud.ts` + `src/ui/strings.ts` — a **known place** panel: state (in sight / last
  known contact), holder, and either the front's walls, gate, breach, ram, siege and
  garrison or, for a remembered Stronghold, `Fortificazioni non note`. Its stock figures
  read `Sconosciuto` rather than four zeroes.
- `src/input/human.ts` — the Controller no longer prunes a *settlement* from the selection:
  a place does not leave the field, and whether its panel may still describe it is the
  interface's question. Squads are pruned exactly as before.
- `src/art/catalogue.ts` — a `settlements` section on the plate: one row per specimen, the
  place beside its name, so both Factions, the three conditions, the ram and the two
  memories are judged on the neutral plate beside everything else the library draws.

`docs/adr/0025-a-place-is-drawn-larger-than-its-tile.md` records the decision (drawn
footprint, layer order, drawn geometry = picking geometry, memory carries no claim) and
the alternatives that were rejected; `GLOSSARY.md`'s **Selection** now says a settlement
may be one the Faction knows rather than one it holds.

## The rules the drawing obeys

- **Ownership** is the Observation's or memory's: an own settlement is the Faction's, a
  contact is the enemy's (contacts are written for enemy-held settlements only), and a
  place in view with neither is held by nobody. A **remembered** place has no banner and
  no condition — the drawing is stone and the fog veils it with the ground it stands on.
- **Condition** is the front's and nothing else: `standing === false` is `breached`,
  `hp < WALL_HP|GATE_HP` is `damaged`, otherwise `intact`. A place the Observation carries
  no front for has no condition to draw.
- **The gate's side** is the gate structure's `side`, and the town is turned to it.
- **Unknown** places are not drawn. A place nobody holds is drawn, unclaimed, once its
  tile has been seen — which is what ADR-0020's sighting through the fog already said.

## The numbers

Drawn pixels and drawn differences, from `siteSprite` in Node (`tests/art/settlements.test.ts`
holds the thresholds):

| measurement | value |
| --- | --- |
| a Stronghold's ink | **2666** of 3136 pixels (85 % of its rectangle) |
| a village's ink | **497** of 1024 (49 %) |
| whole → **damaged** north wall | **76** pixels differ |
| whole → **breached** north wall | **146** pixels differ (two gaps of 9 px, 14 px of missing walk) |
| whole → **damaged** gate | **27** pixels differ |
| whole → **breached** gate | **36** pixels differ |
| no ram → **ram building / built** | **35** / **81** pixels differ |
| seen → **remembered** Stronghold | **2531** pixels differ (every colour replaced by stone) |

Cost, measured in Node on this machine (not a frame-rate claim): `knownSites` plus the
geometry and look of every place it returns is **0.003 ms** per call on a real Match's
world (2000 calls); the **first** composition of a Stronghold sprite is **5.6 ms**, after
which a look is served from the memo in **0.0017 ms** per call. The layer uploads a texture
only when a look changes, so a still map uploads nothing; a real Match opens with **one**
place drawn (its own Stronghold) out of the six to eight a generated theatre carries.

The bake is **481 artefacts** (471 before: ten `site:` specimens), and the plate grew from
455×1254 to **455×1874** to hold the new section.

## Changed hashes, reviewed on purpose

- `catalogue` (the plate): `710051d5f6f235ab` → **`e566bc8e1bd75edc`**, 455×1874.
- Seven of the ten new specimens moved once during the ticket, when a single middle breach
  turned out to be hidden behind the gatehouse: the walls now break in **two spans either
  side of the middle**, so a breach is never behind the gate. `site:stronghold:rome:intact`
  `a650634053d52c2f`, `…:carthage:intact` `11df68855b2d1f4f`, `…:rome:damaged`
  `159ffa5a964fd8a3`, `…:rome:breached` `5117cc405309552d`, `…:rome:ram` `007bcdd1e7429921`;
  the three villages and the two remembered places (`c7b55509…`, `16d86833…`, `bb2d3941…`,
  `36df808b…`, `e81000f9…`) were unchanged by that rework.
- **Every hash already pinned in `tests/art/pixel-hash.test.ts` is byte-identical**: every
  glyph, every ramp, every terrain tile, every road piece, all four markers, every figure,
  every icon and badge, and all fourteen separation specimens. No existing art moved.

## Where each acceptance criterion is proved

| Criterion | Where |
| --- | --- |
| Generators/catalogue represent settlements and Walls, Gates, breaches and Siege structures, with recognizable silhouettes and condition states | `tests/art/settlements.test.ts` (declared sizes, a closed ring for a Stronghold and air at a village's edges, breach/damage/gate/ram differences *and where they are drawn*, four gate sides are one drawing turned, memory is stone and carries no condition), `tests/art/catalogue.test.ts` + a plate test that every specimen has a row of its own, `tests/art/pixel-hash.test.ts` |
| Integrate through the existing PixelBuffer/PixiJS adapters and projection; drawn geometry and picking agree, so a visible structure opens the right detail | `tests/render/settlements.test.ts` (`siteRect` centred on the tile, depth by row, look from the front's hit points), `tests/input/selection.test.ts` (a click on a place opens it; a Squad drawn over it wins; two overlapping places pick the front one; a box ignores places), `e2e/settlements.spec.ts` — a **pointer click** at a town's corner selects it and the panel titles that id, and bare ground beside it clears the selection |
| Ownership and live condition only from allowed Observation data; unobserved known contacts visibly last-known; no hidden damage/ownership and no invented history | `tests/ui/sites.test.ts` (own/contact/neutral ownership, a remembered place has `front: null`, an unexplored place is absent, ids are the economy's, a wrong-sized fog is refused), `tests/render/settlements.test.ts` (memory ignores a front even if handed one), `tests/ui/hud.test.ts` (a remembered Stronghold says *ultimo contatto noto* and *fortificazioni non note*, and no wall, ram or garrison line), `e2e/settlements.spec.ts` (a place appears only after a watch reaches it; its drawing turns to stone; its panel says last known) |
| Buildings, Squads and terrain layer coherently; no ambiguous selection; the selected object and the panel agree | `src/render/boot.ts` sorts the world by `zIndex` (terrain 0, places 1, fog 2, dead 10, living 11); `tests/input/selection.test.ts` and `e2e/settlements.spec.ts` cover the precedence; `e2e/settlements.spec.ts` clicks the drawing and reads the panel, and an armed **Garrison** aimed at a drawn wall names that settlement in the applied Command |
| Atelier and in-game evidence, both Factions, intact/damaged/breached, visible/remembered/unknown, reproducible | the Atelier plate's `settlements` section and the bake (`site-*.png`, `catalogue.png`), `e2e/settlements.spec.ts` — six scenes, below |

## Commands and results

- `npx vitest run` — **1219 tests across 103 files**, green (1173 before this ticket: 46 new
  tests in `tests/art/settlements.test.ts`, `tests/render/settlements.test.ts`,
  `tests/ui/sites.test.ts`, and additions to the selection, human and HUD suites).
- `npm run lint` — clean. `npm run guard` — all seven fences hold (278 files scanned, no
  committed assets). `npx tsc -b` and `npx tsc -p tsconfig.e2e.json --noEmit` — clean.
- `npm run build` — green.
- `node src/cli/bake-main.ts --out %TEMP%\spqr-issue57-bake` — 481 artefacts, including the
  ten `site:` specimens and the plate `455x1874 e566bc8e1bd75edc`; run twice, identical.
- `npx playwright test` — **97 browser tests passed in 2.0 minutes** (91 before: six new in
  `e2e/settlements.spec.ts`), including the Atelier's pixel-for-pixel column comparison at
  zooms 1, 2 and 4 with the taller plate, the fog and theatre comparisons, and the surface
  contract for the two new hooks and the new snapshot field. That comparison grew with the
  plate and became the suite's slowest test (3.2 minutes at its 180-second timeout, and a
  timeout failure in a fully parallel run); it now collects the mismatches and asserts them
  instead of building one matcher per sampled pixel — the same comparison, 8.6 seconds.
- `git diff --check` — no whitespace errors (only the repository's existing CRLF notices).

## Rendered evidence, and its limits

The spec writes PNGs outside the repository (the guard forbids committing image files) to
`%TEMP%\spqr-issue57`:

- `stronghold-{rome,carthage}-{1280x720,1920x1080}.png` — **four** scenes: each Faction's own
  Stronghold on the real Match page, paused, opening on its home, with the men hidden. Each
  was captured after the test had asserted, at zooms **1, 2, 4 and 8**, that every sampled
  pixel of the structure is the generator's own pixel (seen) or under the fog's own veil
  (remembered) — 15 or more compared points per zoom, zero mismatches, and at zooms 4 and 8
  the town fills the frame.
- `selected-stronghold-rome.png` — the Stronghold with its selection brackets, taken right
  after a **pointer click** on its corner.
- `remembered-stronghold-rome.png` — Carthage's Stronghold after the watch that saw it has
  moved away: the stone silhouette under the veil, with its panel open on *ultimo contatto
  noto*.
- `siege-before-rome.png`, `siege-under-the-ram-rome.png`, `siege-breached-rome.png` — the
  reproducible siege scene (`e2e/siege-fixture.html`, seed 7): three Roman Squads box-picked
  at Carthage's walls, an **Assault** aimed at the drawn gatehouse, then ticks stepped until
  the ram has hurt the gate and until it has broken it. The scene asserts the front's own hit
  points first (`hp < GATE_HP`, then `standing === false`), then that the drawing agrees
  (`siteLook` → `damaged`, then `breached`, with the ram at the gate), then the pixels, then
  the panel.
- `%TEMP%\spqr-issue57-bake\` — the whole catalogue as the Atelier's own bake: the ten
  `site-*.png` specimens and `catalogue.png` (455×1874) with the new section.

Applicability, stated rather than assumed:

- **Both Factions** — each Faction's own Stronghold is drawn, sampled and asserted in its own
  scenes at both resolutions; Carthage's damaged and breached state is the *in-game*
  defender's in the siege scene (a ram is Rome's, ADR-0008), and Rome's damaged and breached
  drawings are on the Atelier plate. Carthage cannot breach a gate by rule, so a
  Carthaginian *attack* on walls is not a case the game can produce.
- **Supported zooms** — the theatre suite already walks every whole magnification from 1 to
  8 against the generator; this ticket's own pixel comparison runs at 1, 2, 4 and 8, and the
  pointer scenes at 1 (picking) and 2 (the siege).
- **Visible / remembered / unknown** — visible and remembered are both sampled and both exact
  against the generator (remembered through the veil's blend, within one step either way);
  **unknown** is asserted as an absence: an enemy Stronghold is not in `sites()` and not on
  the map until a watch reaches it, and unexplored pixels of a footprint are skipped rather
  than compared, because what is there is the fog and not the settlement.
- **1280×720 and 1920×1080** — both, for both Factions, in the Stronghold scenes; the layout
  itself remains [#54](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/54)'s.

**The visual gate, and what is unrun.** This harness cannot display images, so the
implementing agent did **not** eyeball these scenes: what it could assert is live frame
sampling, generator comparison, pointer clicks, Commands and the panel's words. The scenes
are in `%TEMP%\spqr-issue57` for the maintainer's review, beside
`%TEMP%\spqr-issue57-bake\catalogue.png`. Hardware and full-density frame rate remain
[#31](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/31)'s, audio
[#30](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/30)'s, the release gate
[#32](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/32)'s, and first-entry guidance
[#59](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/59)'s; none of them is claimed
here.

## Three faults the ticket found and fixed

1. **The layer was drawn through a different fog than the veil over it.** Settlements were
   first read through the *Observation's* copy of the fog, so moving the page's debug watch
   changed the veil and the minimap but not the structures. `knownSites` now takes the fog
   explicitly, the page passes the same `FogView` the veil is built from, and `lookFrom` and
   `inspect` repaint the whole page rather than only the fog.
2. **The plate drew all ten specimens in one cell**, because the new row loop forgot to
   advance — invisible in a hash comparison and caught by a test that looks for every
   specimen on the plate.
3. **A single middle breach hid behind the gatehouse.** A wall now breaks in two spans either
   side of its middle, so the gate is never drawn over the hole and a Player is never told of
   a breach they cannot see.
