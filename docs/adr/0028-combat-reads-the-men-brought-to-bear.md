# A blow is counted in the men brought to bear, not in Squads

ADR-0026 gave the roster real, independently commandable sizes: Rome 24/60/120,
Carthage 24/48, and a fixed size for a specialist. C3's exchange, written before
any of that, counted a Squad's blow from its **frontage** — the files it stands
in, twelve at most — and its Morale shock from the fact that it was attacking at
all. Under those rules a 24-man Squad and a 120-man Squad struck for exactly the
same nine men a round, and five 24-man Squads struck for forty-five. Splitting a
body into five bought five times the attack, five times the shock and five times
the missiles for the same men and the same price. Every part of the military
game that read a count of Squads — the ram's defence, the work at a wall, the
men under it, the hold on a settlement's centre — had the same hole in it.

P3 closes it in one rule, applied everywhere: **military force is a function of
the men brought to bear, and of nothing about how they are divided into Squads.**

**Bearing.** A Squad brings its surviving men times its type's `impact`: one for
the infantry of both rosters and for the slingers, two for the Numidian horse
(twelve riders who are a charge and not a dozen skirmishers) and four for the
elephant (one beast whose twenty-four points of staying power are worth more than
four-score men's blows). `impact` is deliberately *not* `strength`: `strength` is
how many men a Squad has and how it is drawn, so raising it to make a horse hit
harder would draw twelve riders as twenty-four. A column brings a quarter of its
bearing, which is the ratio the file counts always had.

**Force points, twelve to a man.** A blow is counted in points rather than in men,
and a defender's casualties are floored **once per round, from the sum of every
blow that landed on it**. That scale is what makes the equivalence exact rather
than approximate: five 24-man Squads land 24 points each and one 120-man Squad
lands 120, and the two totals are floored to the same ten men. Flooring each
exchange separately would have lost half a man five times instead of once.

**A Squad's attention is divided.** Its blow is split among the enemies it is in
contact with, so a body fighting on three sides inflicts its force once, not
three times. Before this, a single Squad surrounded by five dealt its full damage
to each of them.

**Shock is counted once per defender.** A body under attack loses `BASE_SHOCK` a
round whether one Squad or five are pressing it, plus the worst angle among the
attackers, the matrix's edge, missiles and the ground. Odds are deliberately not
a lever: more men already kill more men, so pressing at two-to-one would be
counted twice, and a bigger body would be rewarded for its size in nerve as well
as in force — the snowball that leaves a coalition of small bodies unable to
fight at all.

**A volley is a weight of missiles per man.** A flat volley would have been a
second way to buy missiles by splitting a body; a missile arm's volley is heavier
than a line's, because a slinger's melee is a twenty-four-man body's and the
volley is what the slinger is for.

**Siege reads force.** Ram defence takes sixteen bearing off one point of ram a
round; the men at a wall open a breach for at most three damage a round however
many bodies are there; the walls cost each body its own men's share of five per
one hundred and twenty, counted on the men the body was *raised* with, because a
fight wears two bodies down and a wall is a wall; a blockade starves a town at
the rate its ring's force buys, capped at twice the stated rate; and a
settlement's centre is held by the larger body of men, with a tie holding nothing.

**Viewed from the Faction.** `VisibleSquad` gained `bearing`, the number every
rule above reads and the one the interface now shows (`Forza`); `impact` joined
the wire roster so an external agent can price a purchase. An enemy's men and
bearing remain outside an Observation: the AI prices an enemy at its **type's**
nominal strength and nerve, which is a public roster fact and the same estimate
for both Factions at every difficulty.

**Considered Options**: keep the frontage-based blow and cap how many Squads may
engage one tile — rejected because it makes the map's geometry, not the economy,
the thing a Player optimises, and because a squad's frontage still says nothing
about the men behind it. Scale casualties by men but leave shock per attacker —
rejected because five small Squads would still have shaken five times the nerve.
Scale shock by the attacker's share of the odds — rejected as the snowball above.
Give each specialist a `strength` that overstates its headcount — rejected
because `strength` is drawn one figure per man (ADR-0027, #67).

**Consequences.** `SquadType` gained `impact`; `VisibleSquad` gained `bearing`;
`WIRE_SQUAD_TYPE` gained `impact`; `Placement` gained an optional `men`, so a
scenario can stand a body at a real size its roster sells (the `march` harness is
the caller that does — two 120-man lines against five of 48), refused above the
type's own ceiling; `combat.ts` exchanged `STRIKE` for
`POINTS_PER_MAN`, added `FORMATION_STRIKE`, made `VOLLEY_STRIKE` a per-arm table,
and gave `Exchange`/`Wound` a `points` figure; `siege.ts` exchanged
`RAM_FILES_PER_BLOW` for `RAM_BEARING_PER_BLOW`, gained `escaladeDamage` and
`wallLoss`, raised `WALL_ASSAULT_LOSS` from four to five per hundred and twenty
bearing so that no legal body's share is floored away, and added
`BLOCKADE_PRESSURE_CAP` and `blockadePressure`. Four golden hashes moved —
`march`, `roster`, `assault`, `blockade` — and `economy`, `seasons`, `empty`,
`draws`, `fog` and `attrition` did not, which is the shape the change should have:
nothing that never raises a Squad can notice it. `march` also changed *scenario*,
from six Squads a Faction to 240 men a Faction, because six 48-man bodies against
six 120-man ones is no longer a contest. The measurements behind every number,
and the balance work this leaves to #29, are in
[the review](../reviews/issue-66-military-balance.md).
