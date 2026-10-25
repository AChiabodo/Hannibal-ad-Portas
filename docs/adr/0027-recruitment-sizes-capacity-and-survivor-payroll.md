# Recruitment names a real size, capacity outlives it, and Payroll follows survivors

ADR-0026 settled that infantry is raised in real, independently commandable
Squads. P2 had to turn that decision into a contract that the Command seam, the
Observation, the economy and a Replay can all carry without inventing a second
interpretation of a purchase.

**The Recruit Command names the size.** `recruit` gained a `men` field, and it is
required. Rome's melee types offer `24`, `60` and `120`; Carthage's offer `24`
and `48`; a specialist has one starting size (24 Balearic slingers, 12 Numidian
horse, and the elephant's single figure with an abstract strength of 24). A size
the type does not offer is refused by the rules, never rounded to a neighbouring
size. A log recorded before P2 therefore has no `men` and is **rejected at the
seam** with `the command at command.men is not a positive size: undefined`; it is
not given a deterministic default, because a default would silently reinterpret
the old purchase at a different size and price.

**Capacity is state; survivors are strength.** A Squad keeps `capacity`, the men
it was raised with, beside `strength`, the men still standing. Capacity never
changes, is hashed and replayed, and is what the HUD reads survivors against. It
is deliberately not the Payroll denominator: the bill follows survivors, not the
purchase.

**A 24-man basis, with no bulk discount.** A type's `cost` is the price of its
24-man Squad and its `payroll` is denarii per 24 survivors. Both bills are
computed from that basis with ceiling integer arithmetic:
`recruitCost(type, men) = ceil(cost × men / 24)` and
`payrollBill(type, men) = ceil(payroll × men / 24)`. Every shipped legal size
lands on whole resources, so the ceiling is exact for every purchase the roster
offers. It is not a bulk discount: five 24-man Roman Squads cost exactly one
120-man Squad, and two 48-man Carthaginian Squads cost exactly one 96 (which the
roster does not sell). The ceiling on Payroll is the anti-fragmentation property:
splitting equal men across more Squads can cost the same or more, never less, so
there is no free-Payroll exploit and no systematic per-Squad advantage.

**Considered Options**: add a free `men` number and validate only that it is
positive — rejected because a Player could buy a 37-man Squad that no formation,
price or roster row describes, and every later system would have to answer for
it. Default a missing `men` to the type's full strength — rejected because a
pre-P2 log then silently changes both the men bought and the resources paid.
Round an illegal size to the nearest offered one — rejected for the same reason:
the purchase the Player wrote down is not the purchase that happened. Bill
Payroll per Squad as a flat type rate — rejected because a 24-man remnant would
pay a 120-man bill, which is neither survivor-based nor fair; round down per
Squad instead of up — rejected because it makes fragmentation into many small
Squads a free-Payroll strategy.

**Consequences.** `Squad` and `VisibleSquad` carry `capacity`; `VisibleSquad`'s
`payroll` is the next Season's bill on the men still standing, so the quotes, the
rules' deduction and the Forecast read one number. `SquadType.strength` is now
the largest legal size, and `SquadType.sizes` is the real offer. The state hash
moved for every Match that raises a Squad, and the `march`, `roster`, `assault`,
`blockade`, `attrition` and `ai` golden hashes moved with it; ADR-0006 says a
moved hash is a decision in review, and this is that decision. Those baselines are
recorded in CI, and in the README where a report is shown. The existing
procedural renderer is kept as it stands — three representative figures per four
survivors — because P4 owns the 1:1 figure pass and P2 is not an art change.
Specialist prices, the 24/60/120 combat
equivalence target and the AI's military scoring are **not** settled here: #66
owns that calibration, and #71 owns the final pressure. P2 establishes the
purchase, the capacity, the bill and the Replay, not the balance.
