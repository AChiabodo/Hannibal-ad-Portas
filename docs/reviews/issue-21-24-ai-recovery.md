# AI recovery after the #71 audit

24 October 2026. Implementation baseline: `a6468d5`.
**Partial recovery; the AI audit and #71 remain incomplete.**

## Ownership and authorization

The user explicitly requested checking closed tickets, reopening the applicable
ones, publishing the specifications, and fixing the defects one at a time.
The original owners were reopened and verified open:

- [#21, economy](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/21#issuecomment-6386813711).
- [#22, military](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/22#issuecomment-6386813278).
- [#23, scouting](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/23#issuecomment-6386814160).
- [#24, siege/difficulty and complete recovery specification](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/24#issuecomment-6386812730).

Forum progression completes the policy requested by the audit: the original #21
asked for a Tier capable of fielding an army, without explicitly requiring Tier 3.
This distinction is retained rather than retrospectively changing its acceptance.
The proposed five-tile vision deadzone was withdrawn because its initial fixture
violated the public Observation contract; it is not counted as a confirmed bug.

## Implemented slices and public evidence

Each behavior fix was exercised through the agreed Controller/Observation or
Match seam, with a failing case before its implementation.

1. Exhausted, non-routing Squads outside friendly quarters receive withdrawal
   even without nearby enemies. The real seed-9/Tiro scout withdraws at tick
   4,200 and reaches home instead of remaining idle in the field. Existing return
   marches are preserved, and spent Squads at home are not reassigned.
2. Composition removes returning Squads before evaluating siege power or issuing
   siege orders. Spent committed Squads likewise no longer fund the decision.
   A further real regression exposed empty Withdraw orders after the ring had
   already left; the Controller now emits no such invalid command.
3. Economy plans Forum when staffing, food and costs allow. Real Match fixtures
   start from a legal developed Tier-2 economy, complete construction and buy
   the upper roster for both Factions. They do not claim every ordinary opening
   reaches Tier 3 within three Years.
4. Granary receives priority when reserves plus an otherwise sustainable recruit
   exceed storage. Real Match fixtures compare all three levels on the same
   developed economy: build, increased stocks and subsequent Triarii purchase.
   In the Imperator fixture, the 40-grain reserve plus the 10-grain purchase
   exceeds the previous 40 capacity (base 30 plus Villa 10). Lower levels retain
   their smaller reserves; larger Squads are not mandatory to prove the benefit.
5. Search no longer assumes mirrored latitude. It explores unknown frontier
   ground toward the opposite longitude, using only permitted information.
6. Imperator can assign two distinct opening patrols when two eligible Squads
   exist; Tiro and Centurio retain one. No resource, production or vision bonus
   was introduced.
7. Rome can plan Market and first detachment together when the paid work will
   finish before the first Payroll. Both costs, staffing and reserves are
   checked; blockade forbids the projected income. This removes the remaining
   seed-7/Imperator contact delay without changing a threshold.
8. Calendar projection is corrected: `advanceCalendar` resolves `tick + 1`.
   Observation 2,099 has one tick until Payroll; at 2,100 that bill is already
   paid and the next is a whole Season away. Controller regressions cover both.
9. `npm run test:ai-pressure` is now part of `npm run verify`, after unit tests.
   It preserves every seed and exits nonzero on a timing, Notice, Payroll or
   Replay failure. It is a non-browser gate.

## Matrix evolution

Seeds 1–10, both passive human Factions, all three difficulties, ordinary start.
Contact/pressure deadlines remain Tiro 5/10, Centurio 3/6, Imperator 2/4 active
minutes. Actual pressure requires wall damage or physical Blockade occupation,
not merely a submitted order.

| Version | Cases passed | Meaning |
| --- | --- | --- |
| Pre-#71 baseline | 10/60 | Historical committed baseline |
| `a6468d5` | 35/60 | Historical committed `headless.jsonl`; 25 retained failures |
| Recovery before combined opening | 59/60 | Seed 7, human Carthage/Imperator: contact 1,293 > 1,200 |
| Final recovery | **60/60** | [All cases](issue-71/recovery.jsonl), all Replay hashes match, no observed unpaid Seasons |

No seed was replaced and no deadline was loosened. This sample proves pressure
against the specified passive opening, not global balance or success against
arbitrary human counterplay.

Rejected experiments were not retained: a forced vertical sweep worsened the
matrix to 52/60; terrain-cost search did not fix the last failure; prioritizing a
second Market before Tier 2 delayed Tier progression in three economy fixtures
without resolving the historical military stalls.

## Remaining failures: do not close

The six remaining historical AI-vs-AI failures are independent of the passive
matrix and remain represented by failing assertions:

- Centurio seed 7 still ends at the three-Year clock, and now selects siege
  activity contrary to the previous no-siege assertion. This is changed behavior,
  not proof of taking a Stronghold.
- Four historical victory fixtures now end at the clock: Tiro seeds 13 and 7,
  Imperator seeds 12 and 7. Their victory assertions remain intact.
- The real-victory tournament contract, Tiro seed 13 at 7,000 ticks, ends at the
  clock instead of the expected Carthaginian victory at 6,300.

These samples must be diagnosed and fixed before the overall AI work can be
accepted. Returning exhausted scouts and refusing to count unavailable troops
correct specific errors but do not establish an effective offensive strategy
against another active army. Nominal enemy-strength estimates remain the public
roster estimates required by ADR-0028; hidden headcount was not exposed to force
a win. Costs, Payroll, aggregate force and simulation rules were not relaxed.

## Verification and independent review

Environment remains Windows/Node 22.22.2/npm 10.9.7; concurrent checks mean these
durations are execution evidence, not hardware performance benchmarks.

- `npm run verify`: lint, TypeScript and all seven guards passed; full Vitest
  recorded **1,453 passed / 7 failed**, 125 files, 138.81 seconds. One failure
  was the CLI command-count golden: Rome's funded tick-zero patrol legitimately
  adds 300 orders in the 301-tick fixture. Updating 304 to 604 passes all 19 CLI
  tests, including byte-identical repeated output. **Six behavioral failures
  remain.** The verify command stops there, before its matrix/build stages.
- Independently ran the complete pressure CLI: **60/60**, retained above.
- Independent production build passed.
- Focused pressure owner: **10/10**, 30.11 seconds, within the 60-second budget.
- Economy/season/siege checks: **47/47**, including real Forum and storage
  progression. The corrected explicit storage-purchase assertion was rerun.
- Standards review: **0 documented violations**, 1 optional duplication smell
  in ordinary versus combined recruitment affordability.
- Spec review: **1 remaining P1 finding**, the historical AI-vs-AI stalls.
  The earlier storage/Forum execution evidence gap was addressed with real Match
  tests. Neither axis accepts the AI audit as complete.

Chromium was not explicitly requested: smoke, acceptance, visual captures,
ordinary paced browser matrix and cohesive playthroughs remain **unrun**.
#71 stays open. #21–#24 also remain open while the recovery is incomplete.
#29, #31 and #32 are unchanged. No push is implied by this local recovery.
