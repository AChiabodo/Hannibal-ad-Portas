# P6 — Understandable economy, categorized construction and in-game Encyclopedia

Published: [#69](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/69). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

The human can understand why to build/recruit, how the next Season changes stocks/Treasury, and where to find a rule explanation. Deliver the complete economic decision loop with categorized construction and a consultable Encyclopedia, including its in-Match opening/return path. P7 later provides the main-menu entry and practical Tutorial using the same reference.

## Acceptance criteria

- [ ] Construction offers use four selectable categories with only one list visible: Produzione (Fattoria, Legnaia, Cava, Miniera); Economia e scorte (Mercato, Granaio); Popolazione e sviluppo (Casa, Villa, Foro); Supporto militare (Castrum). Preserve selected settlement/category coherently; applicable locked offers show requirements and unavailable reasons.
- [ ] Each offer explains initial resource bill, staffed construction duration, workers, ongoing effect, timing and relevant limits/unlocks. Secondary effects are visible: all-resource Granaio capacity, Villa/Foro Tier progression and the Roman Castrum's winter support rather than fictitious barracks/recruitment unlocks.
- [ ] Explain settlement-local stocks versus faction Treasury, automatic Labour allocation, staffing shortfalls, resource-node capacity rather than depletion, population/housing, storage caps, seasonal production/consumption/Harvest and winter/Territory effects. Label conditional/potential output rather than promising full production without workers.
- [ ] Use seconds for durations, per-Season recurring values and a next-boundary countdown. Next-Season Forecast agrees with the canonical order of production/tax/Payroll and quotes from P2; state uncertainty explicitly and never infer unknown enemy quantities.
- [ ] The Encyclopedia covers resources, buildings, the revised roster/sizes/Payroll, Commands, formations/conditions, group movement, Territory and Siege. Entries use canonical content/rule values and Italian String table text; contextual details can link directly to the relevant entry.
- [ ] Open/close the reference from a normal Match using pointer/keyboard while preserving selection and Match suspension/resumption semantics. Provide a reusable entry/return surface for the main menu; do not require P7 just to demonstrate the reference.
- [ ] Category/navigation, long text, scrolled rows, locked offers and contextual links remain readable and reachable at 1280×720 and 1920×1080 without re-expanding the bottom panel into the original obstruction. Preserve consistent focus and target areas.
- [ ] Public UI/reference model checks cover every applicable offer/entry and key economic relationships. Focused browser samples exercise category switching, one available and unavailable purchase, reference navigation and return by real pointer/keyboard for both Factions. Inspect representative actual frames and verify canonical displayed values against real Season outcomes.

## Testing decisions

Use public order/HUD/reference models for all-content coverage and canonical rule scenarios for the Forecast/actual delta. Browser tests check the interaction/render seam, not every numeric permutation. A complete content-reference map must catch missing entries and stale faction/size descriptions without duplicating rule implementations.

## Shared constraints

Preserve Italian text, bitmap/procedural rendering, filtered Observation and local/global ownership semantics. Presentation stays hash-neutral. No manual worker-assignment system, new technology tree, depletable-resource mechanic or hidden-state Forecast.

## Blocked by

- P3 — Comparable military force across Squad sizes, combat and Siege (including P2's economic contracts, required for accurate final roster/rule reference).
- P5 — Manageable group orders (required for the reference to explain the implemented group-movement behavior).

## Out of scope

Practical Tutorial objectives and main-menu lifecycle (P7), a separate hosted/public wiki, new economic rules, persistent saves and global release acceptance.
