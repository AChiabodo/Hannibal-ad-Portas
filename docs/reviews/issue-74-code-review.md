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
