# Issue #76 — economic and expansion calibration, 31 October 2026

The resource-placement correction supports the current campaign's growing local
production without changing economic formulas or adding adjacency bonuses.
This does not establish equal outcomes for whole campaigns.

## Measurement

For seeds 1–200, create the generated Map and Economy, then compare the two
Strongholds at equal population and development through production
`landCapacity`, `allocate` and `seasonYield`. Measure spring and winter. The
second configuration has one completed Farm, Lumber camp, Quarry and Mine.
No stocks, recruitment, combat or ownership changes are simulated in this probe.

| Population | Seeds with different yields, no Works | Seeds with different yields, four Works |
| --- | ---: | ---: |
| 10 | 0 / 200 | 0 / 200 |
| 22 | 0 / 200 | 0 / 200 |
| 40 | 0 / 200 | 0 / 200 |
| 60 | 180 / 200 | 0 / 200 |

The rules begin at ten citizens and allow at most one additional citizen per
Season. The current three-year horizon therefore reaches at most 22 naturally
grown citizens, when housing, food and survival permit growth. With equal
Works, their staffing consumes equal labour before the remaining citizens work
the land. Capacity at least ten per resource keeps ordinary balanced allocation
below terrain saturation throughout that horizon.

The yield comparison assumes sufficient housing at each population: Houses
consume no productive labour and add no resource yield. Population 60 also
exceeds the current housing ceiling; it is a sensitivity probe for a future
larger economy, rather than a reachable opening configuration.

Population 60 without Works exposes genuine differences in theoretical capacity.
For example, seed 71 produces spring grain/timber/stone/iron of 19/19/12/10 for
Rome and 16/16/12/16 for Carthage. Seed 77 produces 15/15/15/15 versus
19/18/13/10. These are recorded limits for larger future economies, not evidence
that current opening production differs. Four equal productive Works remove the
difference in this particular probe, not in every possible development pattern.

## First expansion access

On seeds 0–199, use the normal `orderSquadTo` planner for one 24-man hastati or
gaul Squad, starting ten tiles outside its own Gate. The destination is the
nearest neutral Minor in its half. This exercises the physical settlement and
crossing constraints; price the resulting route with the normal terrain costs.
All 400 routes are reachable. The greatest terrain cost is 212 ticks and the
largest difference between the two sides of one map is 126 ticks, compared with
2,100 ticks per Season. These costs exclude recruitment, admission, competing
traffic and capture time.

Only one route passes within eight anchor tiles of an initial neutral guard:
Carthage's route in seed 80. In an ordinary Match replay of that scene, Rome
arrives at tick 62 and captures at 201; Carthage arrives at 110 and captures at
251. Both retain all 24 men, with no engagement or refusal. The regression test
keeps both Factions and the real neutral guard, rather than deleting the threat.

Together with local production, this supports comparable opening opportunities
and first expansion for the current campaign. It is not a measurement of the
entire later expansion economy.

## Two successive developed expansions

Reproduce the dynamic measurement with the repository tool:

```powershell
node scripts/map-opportunities.mjs "$env:TEMP/spqr76-opportunities.jsonl"
node scripts/map-opportunities.mjs "$env:TEMP/spqr76-opportunities-levels.jsonl" all 0 1 2 3 4 5 6 7 8 9 10 11 12 13 80 199
```

The default is seeds 0–199, both Factions, Centurio. The second command samples
all three difficulty levels on sixteen seeds, including the initial guarded
route. Each ordinary Match runs for two Seasons (4,200 ticks), with normal
opening stocks, an idle opposing player and active neutral defenders, raids
and reinforcement. One 24-man hastati or gaul Squad is recruited normally, and
a Farm is ordered at home. From its actual assembly position the Squad takes
the cheapest reachable neutral Minor, builds a Farm there, waits until that
foundation exists, then prices and takes its next cheapest opportunity.

The scenario planner knows the generated destinations to compare geography;
it is not the production AI or a test of exploration. Route prices use the
normal physical planner and terrain costs. Capture and first-damage timestamps
are sampled every ten ticks. The record includes both chosen routes, actual
captures, survivors, engagements, damaged Works and final owned settlements.
For a separate comparison of productive capacity, each acquired Minor is
evaluated at twenty citizens with two completed Houses and no productive Works.
This supports the stated population without introducing a productive bonus.

The expanded measurement exposed four movement stalls (61/Carthage,
169/Rome, 178/Rome and 186/Carthage). A legal sideways passage pose retained
its current facing, but the movement order then rotated it toward the next
tile and invalidated that pose. The fix retains the legal facing; a minimal
both-Faction river-edge test and all four generated cases protect arrival.

On the corrected revision, all **400/400** Centurio scenarios capture both
Minors. The median second capture is tick 501 for each Faction. Rome's maximum
is 901 and Carthage's 701, both below the first Season boundary at 2,100.
The greatest individual planned terrain price is 400 ticks for Rome and 270
for Carthage; these are route costs, distinct from capture timestamps.

| Centurio, seeds 0–199 | Rome | Carthage |
| --- | ---: | ---: |
| Two completed captures | 200 / 200 | 200 / 200 |
| Scenes with damaged Works | 53 / 200 | 66 / 200 |
| Scenes with military losses | 11 / 200 | 7 / 200 |
| Minimum surviving men | 21 / 24 | 20 / 24 |
| Mean combined grain yield of two developed Minors | 15.280 | 15.940 |
| Mean combined timber yield | 9.190 | 8.455 |
| Mean combined stone yield | 8.650 | 8.815 |
| Mean combined iron yield | 6.880 | 6.790 |

The sixteen-seed, three-difficulty sample completes **96/96** scenarios by
tick 601. There are nine scenes with damaged Works for Rome and 27 for
Carthage (three and nine distinct seeds respectively, repeated over levels).
Damage generally begins earlier at higher difficulty; first observed damage
is tick 641 on Imperator, 1,241 on Centurio and 1,841 on Tiro. This smaller
sample deliberately includes guarded and raided locations and is visibly
uneven: it must not replace the wider distribution with a claim of symmetry.

The results support comparable usable opportunities at the current size and
horizon: all routes finish, median expansion time is equal, all four resources
remain productive as settlements grow, and neutral pressure causes bounded
losses on either side. They retain meaningful per-seed differences in terrain,
route cost, yields and danger. No faction bonus, extra crossing, resource
formula change or artificial campaign outcome was added to equalize them.

## Boundaries

`tests/sim/resource-opportunities.test.ts` protects generated productive reach
and the two sides' initial nearby neutral opportunities. The local-yield
comparison is separate from the price of reaching and taking an opportunity.
Natural and dynamic obstacles, barbarian threats, ownership, damaged Works,
resource expenditure and military losses can change campaign value. This
calibrates initial production and the two successive cheapest expansions;
it does not assert identical value for every Minor, every tactical policy,
competitive human play or all possible whole-campaign outcomes. The opposing
AI's discovery and pressure have a separate both-Faction/difficulty matrix.
