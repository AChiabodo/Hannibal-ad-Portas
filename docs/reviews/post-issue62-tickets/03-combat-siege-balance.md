# P3 — Comparable military force across Squad sizes, combat and Siege

Published: [#66](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/66). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

The new sizes offer real tactical choices without obtaining free attack, Morale shock, volleys or Siege power by multiplying Squad entities. The human can use small forces flexibly and concentrate a large Roman body; Garrison, Assault and Blockade account for actual force and type. Recalibrate the AI's force estimates and report the changes in terms the UI/reference can accurately explain.

## Acceptance criteria

- [ ] In controlled comparable frontal conditions, five 24-man Squads have roughly the combined capability of one 120-man Squad. Declare a defensible outcome metric/tolerance before running the comparison; record results and limitations. Cover both focused and distributed targets to detect entity-count shock/damage exploits.
- [ ] Reconcile strength/frontage, casualties, ammunition, per-exchange Morale, routing and type advantage under the new sizes. Do not infer equivalence merely from equal prices or a rectangular drawing. Preserve meaningful flank/rear and condition effects.
- [ ] Garrison, Assault, Blockade and contested capture use actual force/type rather than automatically scaling with entity count. Verify meaningful rule effects, not just accepted Commands. Small contingents can still occupy undefended sites.
- [ ] Reduced slingers and cavalry, and the single elephant with abstract strength, have measured roles against the new infantry. Calibrate resource price, recurring cost and numeric combat parameters as necessary; report changed values and reasons instead of declaring the initial headcounts balanced by inspection.
- [ ] Update AI recruitment preferences, force/support/garrison estimates and tactical/Siege choices to the new force model without hidden state, bonus resources or privileged vision. Normal openings remain sustainable after the fivefold 120-man price change.
- [ ] Expose accurate own-force facts and refusal/requirement explanations through the existing Observation/UI contracts. Do not leak enemy men, stocks or live Siege state that the Faction cannot know. Provide rule descriptions/data usable by the Encyclopedia.
- [ ] Preserve deterministic Replay and integer authoritative arithmetic. Update affected expected hashes only with an explained rule/balance delta and meaningful outcome evidence.
- [ ] Provide bounded headless comparisons across sizes/types, conditional terrain/aspect, volleys, casualties, defensive/offensive Siege and unopposed capture; include one representative normal-browser battle/Siege interaction. Record the revised baseline and remaining global balance work for #29.

## Testing decisions

Run complete rule scenarios through public Commands/Observations rather than testing private damage helpers as the sole proof. Separate controlled equal-man comparisons from broader AI Matches. The final AI timing matrix belongs to P8; this ticket must still demonstrate its own military outcomes.

## Shared constraints

Retain aggregate Squads, asymmetric Factions, existing Roman/Carthaginian Siege capabilities, seeded/integer simulation, procedural art and Italian UI. The new rules deliberately supersede visual-only scope restrictions of #62; do not reopen or rewrite that delivery. No individually simulated soldiers or new troop types.

## Blocked by

P2 — Real recruitment and survivor-based infantry Payroll.

## Out of scope

The 200-Match/global win-rate and duration verdict owned by #29; granting a Carthaginian ram without separate balance authority; new collisions, saves, audio, release or unrelated AI refactoring.
