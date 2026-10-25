# AI recovery after the #71 audit

24 October 2026. Implementation baseline: `a6468d5`.
**Historical headless-stage report.** Browser verification was subsequently
authorized and completed on 25 October; see the
[final browser report](issue-71-browser-verification.md) for the current result
and closure evidence. Statements below about unrun Chromium/open issues describe
the earlier stage, before that verification.
The first batch's failures below are retained history. The second batch resolves
them and the additional historical Centurio seed 6 regression.

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

## First batch (`929ee41`): implemented slices and public evidence

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
| First batch (`929ee41`) | 60/60 | Pressure restored; active-opponent regressions still unresolved |
| Consolidated recovery | **60/60** | [All cases](issue-71/recovery.jsonl), all Replay hashes match, no observed unpaid Seasons |

No seed was replaced and no deadline was loosened. This sample proves pressure
against the specified passive opening, not global balance or success against
arbitrary human counterplay.

Rejected experiments were not retained: a forced vertical sweep worsened the
matrix to 52/60; terrain-cost search did not fix the last failure; prioritizing a
second Market before Tier 2 delayed Tier progression in three economy fixtures
without resolving the historical military stalls.

## First-batch failures, retained history

The six historical AI-vs-AI failures in the first batch were independent of the
passive matrix and remained represented by failing assertions:

- Centurio seed 7 still ends at the three-Year clock, and now selects siege
  activity contrary to the previous no-siege assertion. This is changed behavior,
  not proof of taking a Stronghold.
- Four historical victory fixtures now end at the clock: Tiro seeds 13 and 7,
  Imperator seeds 12 and 7. Their victory assertions remain intact.
- The real-victory tournament contract, Tiro seed 13 at 7,000 ticks, ends at the
  clock instead of the expected Carthaginian victory at 6,300.

These samples blocked acceptance of that batch. The second batch below resolves
the causes and verifies real conquests. Returning exhausted scouts alone did not
establish an effective offensive strategy against another active army.
Nominal enemy-strength estimates remain the public
roster estimates required by ADR-0028; hidden headcount was not exposed to force
a win. Costs, Payroll, aggregate force and simulation rules were not relaxed.

## First-batch verification and independent review

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
#71 stays open. #21–#24 remain open for review of the recovery.
#29, #31 and #32 are unchanged. No push is implied by this local recovery.

## Second batch: why the offensive campaigns stalled

1. **Withdrawal one round before protection.** Seed 13/Tiro recalled Rome's
   builders at tick 841, with morale 5/10 and a paid ram 10 ticks from completion
   at 850. Field and siege now share the visible remaining shock calculation:
   construction advances before punishment and the completion round shelters
   the ring. Only men who retain positive morale can continue. Half-strength
   and an overwhelming relief army still require withdrawal.
2. **Recovery ended too soon.** Men returned to quarters but resumed campaigns
   just above half morale, lost it again outside Supply, and repeated the loop.
   They now rest to nominal morale before offensive work. A threatened home
   still gets its defensive line through the existing 12-tile defence tasks.
   Review caught and corrected an initial four-tile-only defence exemption.
3. **No economic expansion from observed villages.** Neutral villages were
   discarded from contact memory, and no policy attempted their capture. They
   now enter memory through the same eyes and fog filter. Expansion can occupy
   a known open village after the first Payroll when the main siege is not
   sustainable. It leaves every non-hold field assignment, returning Squad and
   viable main siege untouched. Captured sites run the ordinary economy policy.
   Starting expansion during the opening caused a seed-7 regression; deferring
   it until the first Payroll lets the initial campaign resolve first.
4. **Village memory implied hostility in the interface.** A currently seen
   unowned village now carries `unowned: true`; it is not marked as enemy on the
   map/minimap. The flag is absent in memory. A real Match counterfactual proves
   that the remembered contact is identical whether an unseen village remains
   neutral or is secretly captured. The historical neutral-only enemy-contact
   assumption is updated in the glossary and protocol.
5. **Fresh power paid for a tired approach.** The defence counted rested men
   when ordering a march, then withdrew the same line on arrival because Fatigue
   reduced its power. Approach allocation now includes maximum marching Fatigue
   outside local contact. Two 24-man Hastati do not fund the approach against a
   nominal Gaul; three do and commit the reserve. The old six-Spear input is
   retained as an insufficient approach, while a separate contact fixture
   verifies reserve commitment against the same six Spear Squads.

Public Controller and Match regressions cover each slice. No enemy headcount,
hidden ownership, bonus income or lowered costs/food reserves were introduced.
Fog memory now includes discovered villages and remains part of the state hash;
changed hashes are replayed rather than assumed presentation-neutral.

### Retained outcomes on the final policy

[Machine-readable outcomes and Replay hashes](issue-71/recovered-outcomes.jsonl).
All seven historical seed/level pairs are retained; none is replaced by an easier
sample. Victory assertions remain victories, and the former Centurio clock
assertions now require actual conquest.

| Seed | Difficulty | Winner / path | Tick |
| --- | --- | --- | --- |
| 1 | Centurio | Rome / Assault | 1,251 |
| 7 | Centurio | Carthage / Blockade | 4,200 |
| 6 | Centurio | Rome / Assault | 13,751 |
| 13 | Tiro | Rome / Assault | 1,051 |
| 7 | Tiro | Rome / Assault | 1,401 |
| 12 | Imperator | Rome / Assault | 801 |
| 7 | Imperator | Rome / Assault | 1,401 |

All seven Replay hashes match. Seed 13/Tiro changes winner because Rome now
finishes its ram before Carthage's blockade can win; the tournament fixture still
requires a real victory at its measured tick. Centurio seed 6 remains a clock at
the deliberately short 7,000-tick reporting bound, but its paired full Match
test requires the later victory. No clock golden conceals a whole-Match stall.

Separate permanent tests require a real Carthaginian Blockade victory on seed 13
against a passive Rome at **each** difficulty, tick 6,300, with matching Replay.
Those tests demonstrate capability, not equal-strength tournament balance.
#29 still owns its broader balance study; these samples are not a monotonic
win-rate guarantee across difficulty levels.

### Final verification

Final `npm run verify` completed with **exit 0**: lint, TypeScript, all guards,
**126 files / 1,473 tests** (70.39 seconds), all **60/60** mandatory pressure cases
with matching Replay hashes, and production build (Vite 1.88 seconds).

The latest pressure owner focus passed **10/10** in **22.37 seconds**, within its
60-second budget. The
whole suite is a separate unbudgeted profile. Smoke/acceptance budgets remain
unmeasured because Chromium is not authorized.

Independent final review has **0 documented Standards violations** and **0
actionable Spec findings**. The
defence-during-recovery finding was fixed with a red/green public regression.
Chromium remains unrun; the UI/minimap observation fix does not imply rendered
acceptance. All reopened issues remain open, with #71 still awaiting its browser
matrix and cohesive journeys.

## Standards

No documented violation remains. One optional duplication observation concerns
nearest-enemy selection in defensive availability versus assignment. It is a
maintenance suggestion, not a demonstrated functional defect.

## Spec

No actionable finding remains in the implemented AI recovery. The independent
review checked withdrawal ownership, actual construction/capture, remaining ram
shock, rest versus defence, approach power, and hidden ownership independence.
Browser evidence for #71 is still missing, explicitly outside the executed gates.

## Subsequent browser verification (25 October)

The [browser report](issue-71-browser-verification.md) supersedes the unrun-browser
status above: complete acceptance 174/174, smoke 3/3, all six ordinary paced
pressure cases and both real-input journeys verified, with inspected frames for
both Factions and reference resolutions. The review found and fixed missing
enemy rendering using the user-approved shared current-sight appearance
contract (ADR-0029). All 60 headless pressure cases still pass with the same
Replay hashes; the seven retained full-Match victories remain unchanged.
