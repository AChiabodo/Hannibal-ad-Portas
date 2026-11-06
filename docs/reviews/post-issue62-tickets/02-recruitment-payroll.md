# P2 — Real faction-specific recruitment and survivor-based infantry Payroll

Published: [#65](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/65). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

The human can recruit genuinely smaller Squads with explicit size/cost quotes, see their real men and recruited capacity, and understand the next infantry Payroll after casualties. Carry the same contract through Commands, Observation, normal browser controls, external Controllers and Replay. This ticket makes purchasing and paying the new roster usable; final equal-man combat/Siege equivalence belongs to P3.

## Acceptance criteria

- [ ] Roman melee types offer 24/60/120; Carthaginian melee types offer 24/48 with their distinct type prices, equipment and Morale. Fixed specialist starting sizes are 24 Balearic slingers, 12 Numidian cavalry and one elephant Figure with separate abstract strength. Explain that specialist prices/effectiveness remain subject to P3 calibration.
- [ ] Recruitment visibly chooses type, real size and count, quotes the exact purchase, and produces that many men through the public Command path. Preserve foreign/locked/unaffordable refusal, queue feedback and both pointer/keyboard access. There is no split/merge behavior.
- [ ] Recruited capacity remains distinguishable from survivors, including after losses and across Observation, hashing and Replay. Invalid sizes are rejected. Existing callers/records are either supported with a documented deterministic default or rejected explicitly under a documented compatibility rule; never silently reinterpret purchases.
- [ ] Use current melee resource prices as the initial 24-man basis, proportional 1/2.5/5 Roman and 1/2 Carthaginian bills without bulk discounts. Publish the before/after roster and any measured calibration. Do not assume current specialist prices are balanced for the reduced numbers.
- [ ] Infantry Payroll follows type and surviving men. Define deterministic integer-compatible rounding/accrual behavior and the initial per-type rate explicitly. Quoted cost, actual deductions and the next-Season estimate agree. Splitting equivalent men across Squads must not create free Payroll or systematic per-Squad rounding advantage.
- [ ] The HUD/readouts and recruitment controls show capacity/survivors, price, recurring bill and why an offer is unavailable. Use seconds/Season labels for any newly displayed durations; do not introduce private UI state mutations.
- [ ] Existing AI can issue valid purchases with the new contract and respects affordable sizes/reserves using only its Observation. Preserve a viable normal opening for both Factions; detailed military scoring is recalibrated in P3 and final pressure in P8.
- [ ] Deliver behavior tests for all legal sizes, representative illegal/foreign/locked/unaffordable requests, Season billing after casualties, quote/execution agreement and deterministic headless/browser-host Replay. Include a small real pointer/keyboard recruitment sample for both Factions.

## Testing decisions

Use the public Controller/Command/Observation seam for the purchase-to-payment path and public HUD/order models for offers. Browser checks establish actual selection/activation; do not repeat the full arithmetic matrix in Chromium. Establish expected economic outcomes rather than assert copied helper formulas.

## Shared constraints

Keep aggregate Squads, integer authoritative state, seeded determinism, filtered Observation, Italian strings and the existing procedural renderer. This ticket intentionally changes roster/economic hashes; document new baselines rather than calling them presentation-neutral. 64 is a visual comparison candidate only, not a fourth size.

## Blocked by

None (can start immediately).

## Out of scope

Split/merge, new types, soldier entities, a global economy redesign, persistent saves and global #29 balance acceptance. P2 passing does not establish completed combat or Siege balance.
