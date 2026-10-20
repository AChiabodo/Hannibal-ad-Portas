# P4 — Rich procedural figures, proportionate structures and readable formations

Published: [#67](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/67). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

Squads, camps and settlements look coherent together and remain selectable in a crowded theatre. Restore one Figure per surviving infantryman, enrich existing generated models and make damaged formations retain stable holes. Deliver actual comparative art decisions and complete renderer/picking integration, not only a new figure generator or hash update.

## Acceptance criteria

- [ ] Preserve the current procedural art direction, palette/font family, orthogonal projection and PixelBuffer/PixiJS pipeline while enriching equipment, silhouettes and structures. Compare enriched current native, compact native and higher-source-resolution candidates at actual screen size; do not assume downsampling preserves detail.
- [ ] Compare Figures, full Squads, overlapping groups and structures in the same scene. Judge relative scale against both minor settlements and Strongholds/Castrum context. A nicer isolated soldier does not pass if the army still dwarfs or obscures settlements.
- [ ] Show one Figure per surviving infantryman and the agreed real specialists; keep one elephant Figure. Roman line starting layouts are 6×4, 10×6, 12×10; define readable Carthaginian and column layouts. Preserve distinct line/column/facing information.
- [ ] Keep recruited width/slots stable while casualties create persistent holes, including interior gaps. Survivor positions do not continuously recenter. Visual derivation does not add soldier simulation, consume simulation randomness or claim exact historical casualty positions.
- [ ] Produce a real-image 60-at-10×6 versus 64-at-8×8 comparison, including cost/proportion implications. Keep 60 as the live recruitment baseline unless an explicit reviewed substitution authorizes changing it and revalidating P2/P3 contracts; never add both as near-duplicate options by accident.
- [ ] Update draw bounds, anchors, picking, box selection, standards, condition plates, corpse presentation and Atelier/catalogue integration consistently. Clicking visible Figures/structures selects what is drawn; unknown/remembered information retains its existing restrictions and layer order.
- [ ] Inspect actual comparative frames at 1280×720 and 1920×1080 for both Factions, all four facings, line/column, full/damaged formations, overlap, selection and relevant knowledge/Siege conditions. Include zoom 1/2/3/4, preserve all existing integer zooms and explicitly inspect odd-zoom behavior of higher-resolution candidates.
- [ ] Record image paths/producers, before/after verdicts with concrete reasons and any rejected approach. Update deliberate art pins only after image inspection; retain pure-generator and actual-browser GPU checks without treating a hash as aesthetic proof. No PNG or other binary is committed.

## Testing decisions

Use pure art/layout outputs and public renderer/picking models for count, bounds and slot stability; use Atelier and a small representative real browser matrix for display/picking. Visual acceptance requires actual image inspection and a recorded verdict. Hardware full-density 60 fps remains #31 and is not inferred from SwiftShader frames.

## Shared constraints

This is a presentation change over the P2 roster: preserve authoritative simulation hashes, integer Tile/projection conventions, Italian UI and filtered Observation. Do not change combat width/damage to make a screenshot attractive. Any required formation-rule change must be explicit and coordinated with P3 rather than hidden in rendering.

## Blocked by

P2 — Real recruitment and survivor-based infantry Payroll (recruited capacity, survivors and roster contract).

## Out of scope

Replacement renderer, image-generation models, external assets, new map density, individual soldier state, extra recruitment choices, global balance and performance acceptance.
