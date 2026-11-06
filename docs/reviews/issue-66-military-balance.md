# P3 — Comparable military force across Squad sizes, combat and Siege (#66)

Published: [#66](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/66). Parent:
[#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Decision:
[ADR-0028](../adr/0028-combat-reads-the-men-brought-to-bear.md).

The rule is one sentence: **military force is a function of the men brought to
bear, and of nothing about how those men are divided into Squads.** This document
is the measurement behind it: what was compared, with what metric, at what
tolerance, and what the answer was. Every number below is reached through the
public seam — `musterSquad` for the scene, the Command vocabulary for the orders,
`siegeMatchRules.step` for the clock — and every one of them is asserted in
[`tests/sim/balance.test.ts`](../../tests/sim/balance.test.ts), so a later change
that moves it fails a test rather than a paragraph.

## The metric, declared before measuring

**Metric.** The men a body of men takes off its enemy in one round of contact
(`POINTS_PER_MAN` twelve to a man, floored once per defender), and the Morale it
takes off in the same round, with the angle, the ground, the arms, fatigue and
missiles held equal between the two configurations compared. The comparison is
always the **same men**: as one Squad, and as several.

**Band.** Fifteen per cent either way — about twice the worst rounding one step
of the exchange chain can cost at point scale, and wide enough to survive the
remainder a divided attention hands out unevenly. The entity-count exploits this
ticket closes were worth 400%, so a fifteen-per-cent band tells them apart from
rounding without argument.

**Limitations, declared with it.**

- The scenes are hand-built theatres with a handful of bodies, not Matches.
- The angle is held equal by giving every attacker its own identical enemy on its
  own tile, or by stacking the bodies on one tile — five Squads cannot all stand
  on one tile's *front*, and pretending otherwise would smuggle a flank into the
  measurement.
- Nothing here measures the value of *manoeuvre*, which is what several bodies
  are for. It measures only that dividing men buys no free blow, shock, volleys or
  Siege power.
- The AI-vs-AI matrix at the end is deliberately small. The win-rate verdict over
  hundreds of Matches is #29's.

## Combat: the same men, divided

One round of contact against a common enemy; the enemy is a 48-man Carthaginian
body for Rome's attackers and a 120-man Roman body for Carthage's.

| Attacker                          | Casualties dealt | Morale dealt | Apart from the full body |
| --------------------------------- | ---------------- | ------------ | ------------------------ |
| Rome, 1 × 120 `hastati`           | 14               | 2            | —                        |
| Rome, 2 × 60 `hastati`            | 14               | 2            | 0%                       |
| Rome, 5 × 24 `hastati`            | 13               | 2            | 7.1%                     |
| Carthage, 1 × 48 `libyan-spear`   | 4                | 1            | —                        |
| Carthage, 2 × 24 `libyan-spear`   | 4                | 1            | 0%                       |

The 7.1% on five 24-man bodies is the remainder `woundsOf` hands out unevenly
when one attacker's attention is divided; it is inside the band, and it is the
only place in the matrix where a division costs anything at all.

**Spread the men over more targets and they gain nothing.** With each body
fighting its own identical enemy, 5 × 24 deals 10 men a round where 1 × 120 deals
14: a defender's casualties are floored once, and five small shares round down
five times. Spreading loses a little and can never gain, which is the direction
the rule has to fail in.

The same holds from the attacking side. A 24-man body with no missiles lands 24
force points: against **one** enemy that is two men, and divided over **five** it
is four points each — less than a man, and therefore nobody. There is no floor at
"one man per enemy touched", because that floor would have been the same
entity-count exploit with the sign reversed.

**Morale is not multiplied.** 120 men pressing one body shakes 2 Morale a round
whether they are one Squad or five (the fight's base shock plus the volley), and
the same body is shaken by exactly as much. The base shock is not scaled by odds:
see ADR-0028 for why.

**The levers still move the same share of the fight at every size.** A rear attack
costs more men and more nerve than a frontal one at 24 and at 48; ground above the
defender is worth less at both; a column strikes for a quarter of a line's blow at
both; a tired body strikes weakly at both. The matchups still decide: 120 Roman
spearmen take 12 men off twelve Balearic slingers or Numidian horse and 10 off
forty-eight Libyan spearmen, which is the spear's edge over horse and its
disadvantage against archers.

## Specialists, measured against the new infantry

One round against a 120-man Roman `hastati` line, with the specialist at its own
size:

| Type                | Men | Impact | Casualties dealt | Morale dealt |
| ------------------- | --- | ------ | ---------------- | ------------ |
| `gaul` (foot)       | 24  | 1      | 2                | 1            |
| `numidian-horse`    | 12  | 2      | 2                | 2            |
| `elephant`          | 24  | 4      | 8                | 1            |
| `balearic-slinger`  | 24  | 1      | 5                | 2            |

Read against the foot row, that is the whole of what `impact` means: twelve riders
hit like twenty-four foot, one beast hits like ninety-six men, and a slinger hits
like twenty-four foot plus a heavier volley — five men in its first round against
two, and one a round with its stones spent. The slinger is therefore a missile
body and not a line: worth raising for its eight volleys, useless in a melee
against anything bigger than itself.

**Calibrations made, and why.** `impact` is the one new combat parameter, and it
is the smallest number that gives each specialist a role without overstating its
headcount: `2` for the horse because its twelve riders are the only body in the
roster that can out-run a footsoldier, and `4` for the elephant because C4
shipped it with the staying power of twenty-four men and the nerve of sixteen, and
at `1` it would have been a 24-man Squad drawn as one figure. `WALL_ASSAULT_LOSS`
moved from four to five per hundred and twenty bearing so that the smallest real
size (24) pays exactly its share instead of being floored up to a whole man.
No price, payroll rate or type strength was moved: the specialists' resource and
recurring costs already scale from the twenty-four-man basis (ADR-0027), and the
measurements above show a defensible exchange rate between them and the line.

## Siege: men at the wall, men behind it

Twelve assault rounds against Carthage's Stronghold, with no ram bought:

| Besieging force                 | Wall hit points taken | Men lost under the walls |
| ------------------------------- | --------------------- | ------------------------ |
| Rome, 1 × 120 `principes`       | 22                    | 60                       |
| Rome, 5 × 24 `principes`        | 22                    | 60                       |

Identical. Before P3 the five bodies would have worked the wall at five times the
rate and paid half the blood. The 22 rather than 36 is the escalade damage falling
with the men still standing, and it falls the same way for both configurations.

One body alone is the one place the new rule is *harsher* than the old: `escaladeDamage`
is capped at a full line's three a round and floored at one, so a lone 24-man
body works a wall for one a round where the old per-Squad rule gave it three.
That is the intended direction — a handful of men cannot work a wall like a line —
and it is why a small contingent is for **holding** a village and not for storming
a Stronghold.

Eleven assault rounds with a paid ram and 120 Carthaginian spearmen on the wall:

| Garrison                        | Ram points left |
| ------------------------------- | --------------- |
| 5 × 24 `libyan-spear`           | 32              |
| 2 × 48 + 1 × 24 `libyan-spear`  | 32              |

One Season of blockade with 120 Roman men round the town:

| Ring                            | Grain lost in the Season |
| ------------------------------- | ------------------------ |
| 1 × 120 `hastati`               | 8                        |
| 5 × 24 `hastati`                | 8                        |

And the two rules that are about force rather than about numbers: a single
24-man body takes an undefended village through three capture checks, and a
120-man body takes a centre a 24-man body is contesting.

## Two Factions, and what the new rule does to them

The asymmetry survives and sharpens. Rome concentrates: 120 men in one body, ten
Morale, one bill. Carthage spreads: cheaper men, more bodies, 48 at most in any
one of them. Equal men now fight equally, so Rome's advantage is the
*concentration* of its nerve — a 120-man body breaks at 120 men's worth of
pressure, a 48-man body at 48 men's worth — and Carthage's is that its men cost
less and its blockade costs it no blood at all.

**Bounded AI matches.** Eight seeds at Centurio, each played to the headless
bound:

| Seed | 1   | 2       | 3       | 4       | 5       | 6       | 7       | 8       |
| ---- | --- | ------- | ------- | ------- | ------- | ------- | ------- | ------- |
| End  | Rome, assault | Carthage, blockade | Carthage, blockade | Carthage, blockade | Carthage, blockade | Carthage, blockade | Carthage, blockade | Carthage, blockade |

Seven to one for Carthage, all but one of them a blockade, and the two seeds
re-recorded at Tiro and Imperator split the same way (Rome storms on 13 and 12;
Carthage starves on 7). This is *not* a new imbalance — P2's recorded seeds were
all Carthage blockades too — but it is not a balance either, and it is the risk
ADR-0008 named in advance: Carthage has no ram, so it wins slowly and safely, and
Rome has to spend blood at a wall to win at all. **That is #29's verdict to
reach**, over enough Matches to mean it; what this ticket owes is that the
military exchange underneath it is honest, and it is.

The AI's own recalibration, so that its numbers mean what the rules mean:

- `enemyPower` now prices an observed enemy at its **type's** nominal bearing and
  nerve rather than its Morale alone, which had valued a 48-man body the same as a
  120-man one. It is the public roster, not the enemy's headcount: an enemy's men
  are not in an Observation and were not put there.
- `power` for the AI's own line is `men × impact × morale`, scaled by fatigue —
  the same units as the enemy estimate, so a comparison of the two is a
  comparison of forces.
- `garrisonEstimate`, the worth of one unseen garrison, is in the same units.
- Recruitment preferences are unchanged: they were already matchup-based, and the
  economy behaviour already prices every real size with `recruitCost` and bills it
  with `payrollBill`. What changed for it is only what those prices buy, which the
  AI now values correctly.

One deliberate asymmetry remains, and it is the conservative one: an observed
enemy is priced at its **type's full-strength body** (the roster's own answer to
"what is a full Squad of these"), while the AI's own bodies are priced on the men
they have. A body raised below its type's ceiling is therefore read as heavier
than it is — at worst five times, for a 24-man `hastati` seen by Carthage. An
enemy's headcount is not in an Observation and was not put there, so the choice is
between assuming the worst and assuming the best; a general with no headcount
should assume the worst, and the same estimate is used at every difficulty and by
both Factions.

## What the interface says

- `VisibleSquad.bearing` — the force a Squad brings, the one number the exchange,
  a wall's defence and a Controller's estimate all read. The HUD shows it as
  `Forza`.
- `WIRE_SQUAD_TYPE.impact` — the roster fact an external agent needs to price a
  purchase, beside the sizes and the price it already had.
- `src/ui/reference.ts` — the rule descriptions an Encyclopedia reads, with their
  numbers taken from the constants themselves so a sentence cannot outlive the
  rule it describes (`tests/ui/reference.test.ts`). P6 owns the panels.
- Nothing was added that a Faction cannot know: an enemy's men, an enemy's stocks
  and a Siege's live state are exactly as absent as they were.

## Replay and hashes

Four golden hashes moved, and six did not:

| Match      | Before             | After              | Why |
| ---------- | ------------------ | ------------------ | --- |
| `march`    | `22454ba666d71b92` | `93c41650cae7c719` | New exchange, and the scenario is now 240 men a side |
| `roster`   | `687d088f2f1e9395` | `a5e7bcf64fca8b7e` | New exchange, `impact` on the roster |
| `assault`  | `f5fef8a61ef4b00e` | `0f37cc5352591836` | New exchange, wall work, ram defence |
| `blockade` | `f3df38e2cf5012df` | `1f42040d1278803f` | New exchange, blockade pressure |
| `economy`, `seasons`, `empty`, `draws`, `fog`, `attrition` | unchanged | unchanged | No Squads are raised, so no rule this ticket wrote can run |

That shape is itself evidence: a change that had touched hashed state rather than
behaviour would have moved the economy Match too. Every arithmetic step stays
integer — points, bearing, floored shares and the remainder handed out in the
economy's own order — and nothing is drawn from the Match's random source.

## Remaining work

- **#29** owns the win-rate and duration verdict, and this batch says what it
  should look at first: Carthage's blockade wins seven of eight seeds, and the
  match length spreads from 6,300 to 10,500 ticks. Whether the answer is a
  dearer ring, a faster ram, or a Roman Assault that costs less blood is a global
  balance decision this ticket deliberately did not take.
- **#71** owns the AI timing matrix. The field never massed an attack inside a
  merged candidate on any seed this batch played, so the attribution test now
  asserts the property over the field's orders rather than over an attack that a
  particular seed happened to produce.
- The specialist exchange rates above are measured, not optimised: the elephant's
  `impact` of four is the smallest number that keeps C4's shipped role, and
  whether an elephant is worth its twelve grain and eight denarii a Season beside
  four 24-man bodies of Gauls is a purchase question for a Player and a win-rate
  question for #29.
