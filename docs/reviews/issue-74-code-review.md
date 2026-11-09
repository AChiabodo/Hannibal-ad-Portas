# Issue #74 — two-axis code review

- Confirmed baseline: `7e67ee6e2e0878f0870cefa8f9234b5df88ea3dd`.
- Original reviewed tip: `a62268dd7f9b0663c910fdc7ebfc0c7422df8484`.
- Command: `git diff 7e67ee6e2e0878f0870cefa8f9234b5df88ea3dd...a62268dd7f9b0663c910fdc7ebfc0c7422df8484`.
- Separate Standards and Spec reviewers performed read-only inspection. Neither ran tests, browsers, CI or pushes.
- Fixes reviewed separately at `2c893c3ff83f2d90b3188934d013b5e51e728a03`.

## Standards

**Documented breach — P3:** `src/ui/hud.ts` formatted the capacity with the literal Italian suffix `uomini`. PLAN requires player-facing copy behind the string table with an English fallback path.

**Resolution:** the full value now uses `message('settlement.capacityValue', ...)`, with Italian and English entries. The Standards follow-up confirmed resolution.

**Heuristic judgement — Duplicated Code:** simulation, procedural art and observed AI navigation independently reconstructed perimeter sides and the same breach-opening calculation. A calibration change could make movement, drawing and planning disagree.

**Resolution:** `perimeterPoint`, `gateTile` and `breachTile` are shared public content geometry. Rules and art use the perimeter/opening helpers; AI uses the same breach predicate while retaining its own filtered knowledge checks. The follow-up found no unresolved Standards findings.

## Spec

**P2 — Dynamic replanning cancelled admission:** Q7 requires automatic travel to the access and assignment point; Q20 requires paths to update when obstacles change. An internal `march` replan called `orderSquadTo` as a new field order, deleting the garrison journey after a new Work obstructed its route.

**Resolution:** internal replanning preserves the journey and access state. A public Command/Match/Observation regression starts a mine across a pending approach and checks eventual protected admission. It failed before the fix and passed afterwards. The Spec follow-up confirmed resolution.

**P2 — Empty initial strongholds relied on colour:** Q22 requires architectural differences readable without relying on colours or banners. Initial strongholds have no Works; their original wall, gate and tower geometry was identical across traditions.

**Resolution:** Carthaginian fortifications now use broad flat parapets and merlons, contrasting with the Roman profile. A pure generator regression compares alpha silhouettes without flags or Works at all three Tiers. It failed before the change and passed afterwards. The Spec follow-up confirmed resolution.

The same follow-up inspected the additional observed-front correction: a visible wall or gate can expose its filtered front without seeing the hidden centre; unseen structural sides remain absent. No unresolved P2 was found.

Review totals: Standards 2 findings (worst documented severity P3), both addressed; Spec 2 findings (worst severity P2), both addressed.

## Final source delta

Both reviewers independently inspected `git diff 2c893c3..65b0cd8 -- src` after
the completed AI integration. Standards reported no unresolved violations or
meaningful maintenance smells; Spec reported no unresolved P2 or requirement
gap. The review confirmed that historical breach and garrison evidence remains
filtered knowledge, physical readiness uses public body geometry, and exploratory
guidance uses public dimensions and observed terrain. No hidden Match reads,
resource bonuses or payment shortcuts were introduced.

## Browser follow-up delta from a463758

The Standards reviewer found no documented violation or meaningful maintenance
smell in the wall-orientation, compact village-path and exposed-passage wording
fixes. Geometry remains shared content, art remains procedural PixelBuffer, and
Italian wording remains in the string table. Regressions inspect public art and
HUD output.

The Spec reviewer found no unresolved P2 or requirement gap. Wall painting joins
the vertical sides while preserving tile boundaries, upright sentries and real
openings; filtered rendering still copies only observed cells. Compact initial
village paths preserve all growth lots, capture geometry and navigation. The
neutral passage label distinguishes exposed field traffic from Garrison admission
without changing rules or the public protocol.

Follow-up totals: Standards 0 findings; Spec 0 findings. Both reviews were read-only.

## Settlement landmark delta from 7a7a7f7

Standards reported no unresolved documented violation or meaningful maintenance
smell. Geometry remains shared across art, collision, map reservation and observed
navigation. Connectivity reuses the existing flood, while CLI exercise placement
checks complete initial formations against the same obstacles.

Spec reported no unresolved P2 or requirement gap. The calibrated landmark keeps
capture axes, paid building lots and Muster space free; partial knowledge retains
the observed original architecture on conquest. Resource masking and CLI placement
resolve the new physical constraints without resource or production bonuses.
Lone-scout routing uses eligible own patrols and permitted terrain only. Confining
the heading assertion to free-field turns is justified, with rigid manoeuvre
coverage retained; Command-count migration keeps decision cadence and Replay.

Landmark review totals: Standards 0 findings; Spec 0 findings. Read-only reviews.

Both axes also reviewed the final headless hash migration: nine updated CI pins
and the current README example match 12 paired local command results, with
byte-identical output on repetition. Rules, seeds, tick bounds and assertions
are unchanged; three unaffected pins remain intact. No findings on either axis.

The final tutorial-only assertion repair was also reviewed independently on both
axes: remember observed opponent Commands before the bounded 128-entry history
evicts them. Actual encounter, capture, Siege and original time bounds remain
required. Standards 0 findings; Spec 0 findings. Production source unchanged.
