# P5 — Manageable group orders with separate legal arrival positions

Published: [#68](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/68). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

A human commands many small Squads together, passes narrow ground and receives a readable group near the destination rather than a stack on one Tile. Apply the same deterministic movement contract to human and AI Commands; preserve real targeting and explain constrained/partly refused orders.

## Acceptance criteria

- [ ] Multi-Squad Move/Attack-move deterministically allocate distinct legal arrival positions near the clicked destination when space exists. Preserve a clear relation to the clicked point, stable ordering/tie-breaking and suitable separation for the declared Squad formation/size.
- [ ] The rules/public Command path owns the result so an AI, external Controller and Replay obtain the same movement; this cannot be a human-only rendering offset or a privileged browser shortcut. Simulation movement does not import pixel-rendering details.
- [ ] Groups may temporarily share a Tile while traversing constrained passages such as fords and redistribute at arrival. Do not introduce full collision/occupancy simulation as an accidental prerequisite.
- [ ] Impassable, edge-of-map and insufficient-space targets have deterministic, documented fallback/refusal behavior. Do not issue unreachable alternative destinations silently, require an all-or-nothing group, lose selection or let one refused Squad cancel eligible peers.
- [ ] Explicit Attack, Garrison, Assault and Blockade retain their target semantics; ground-arrival distribution must not scatter these Commands away from a required enemy/settlement. Show clear per-Squad/summary feedback for partial execution.
- [ ] Preserve armed/pending/applied feedback, queued orders during pause, control groups and subsequent movement-order replacement semantics. No new formation editor, waypoint mode or persistent save system.
- [ ] Exercise many 24-man Squads and mixed sizes through public movement scenarios: open destination, narrow passage, obstructed edge, insufficient space, partial refusal and repeated/paused orders. Replay verifies determinism.
- [ ] Demonstrate actual pointer/keyboard group movement for both Factions in the normal browser with selection and arrival positions visible, using the real renderer/picking contract rather than an instrumented success-only scene.

## Testing decisions

Use Controller/Command/Observation outcomes for route/arrival breadth, public human-selection models for feedback and a focused browser interaction for the real gesture/render seam. P4 supplies final art acceptance; use public formation/geometry declarations without making P5 depend on speculative pixel dimensions.

## Shared constraints

Keep aggregate Squads, existing seeded/integer movement and fog knowledge, Italian strings and procedural rendering. Intentional rule/hash changes are documented. No individually simulated men or full physical collision system.

## Blocked by

P2 — Real recruitment and survivor-based infantry Payroll (final size/capacity contract used to demonstrate groups of small Squads).

## Out of scope

Map-generator redesign, wholesale pathfinding replacement, unit micro, split/merge, saves and global performance acceptance.
