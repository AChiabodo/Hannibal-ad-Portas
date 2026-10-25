---
status: accepted
---

# Settlements occupy ground and show their completed Works

Agreed in rounds Q1-Q40 of the design interview on 2026-10-25. The gameplay and
art-direction decisions are settled; precise geometric and visual parameters are
delegated as described below. Implementation is not authorized by this record.

The complete, self-contained implementation specification, including all forty
decisions and acceptance criteria, is published as
[GitHub issue #74](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/74).

A Settlement has a real, multi-tile footprint: its physical perimeter constrains
field movement, rather than merely drawing a larger structure over one simulation
tile. Map generation, routing and Siege distances must account for that footprint.
This supersedes ADR-0025's single-tile simulation decision and reopens its fixed
drawing dimensions, because visible walls and approaches should agree with the
ground the army can actually use.

Every completed Work leaves a permanent, recognizable addition, including repeated
buildings of the same kind. Placement is automatic, stable and orderly: the Player
chooses what to build, without manually positioning each Work. A completed second
granary must therefore have its own visible contribution rather than leave the
settlement looking unchanged.

A Stronghold and a Minor settlement keep distinct strategic identities at every
Tier. The Stronghold remains the decisive fortified main settlement; Minor
settlements visibly develop as economic centres without automatically becoming
Strongholds or acquiring Walls. Fortifying them would require a separate decision.

Map generation reserves the maximum Settlement grounds from the start, and the
Stronghold's enclosing wall perimeter stays fixed through all three Tiers. Growth
changes architecture, silhouette and building density within the planned grounds.
Reservation is not a blanket movement obstacle: courtyards, roads and passages
must be distinguished from physical structures. No Tier increase expands the
wall perimeter into an army or a neighbouring road.

Economic Works are physically represented but cannot be attacked or destroyed as
individual targets, including those placed outside the Walls. Economic warfare
continues through Siege and capture. Raiding and rebuilding individual Works are
outside this redesign; visible position does not imply a new damageable structure.

A Garrison Command automatically approaches the Gate from the field. An approaching
Squad remains exposed; Garrison protection starts only when it actually enters.
The entry animation communicates that real transition rather than concealing an
earlier admission. Capacity is checked at the actual entrance, without reserving
places during approach. If a whole Squad no longer fits, its entry does not start
and the order ends with an explicit reason; a Squad approaching from outside stays
exposed outside, and does not silently enter later when places become available.
Ordering physical passage through a busy Gate is separate
from the Garrison capacity check. Admission protection starts only after the whole
Squad has entered; it remains vulnerable while the tail is outside. A Garrison
Squad waiting inside to exit remains protected, and loses protection when it
starts to emerge. This is an aggregate Squad transition communicated by animation,
not individual soldier simulation. Squads already in the courtyard can reach the
Garrison assembly point just inside the Gate without exiting and re-entering.
They remain field Squads until their assembly and admission finish. Passage and
admission must be coordinated so the accepted capacity is never exceeded.

Each access passes one Squad at a time, with arrivals and departures sharing
arrival-order scheduling. Different Breaches may support independent passages.
A blocked exit keeps the Squad waiting rather than moving it through an occupied
space. Outside waiting remains exposed; a Garrison waiting inside retains its
protection. Field Squads inside do not become protected merely by joining a queue.

Every Work is visible from the start of construction, with its own assigned space
and a few legible construction stages through to completion. A Work stalled by
insufficient Labour remains visibly incomplete. The panel carries detailed progress.
Its building footprint becomes an obstacle when construction actually starts,
not at completion. A future building space remains traversable until its Work
starts. If a field Squad occupies the space, the order waits with a visible reason
before starting construction and charging resources. Planned passages stay clear.

Scouting can reveal the Tier, completed Works and visible construction sites of an
enemy Settlement. That knowledge belongs in Observation; drawing must not obtain
it from unrestricted Match state. Stocks, Labour allocation and recruitment queues
remain private. This extends the visible-settlement knowledge contract. The
last-observed appearance is remembered as recorded below. Only actually observed
portions are revealed and remembered: seeing one corner does not reveal the
entire enlarged Settlement, and renewed sight refreshes only the portions seen.

The accepted building distribution places houses, granaries, markets, Villa and
Forum inside the Stronghold's Walls, and farms, lumber camps, quarries, mines and
Castrum in its exterior grounds. Minor settlements organize the same Works into
an inhabited core and a productive periphery without Walls. Productive Works keep
their current economic independence from adjacency to Resource nodes; their
surroundings may communicate timber working, excavation or mining without adding
new productive nodes or changing construction eligibility. Exact layout geometry
is delegated to implementation within this design. Building scale is anchored to individual Figures: houses are
roughly three or four soldiers wide, civic buildings appreciably larger, and a
Gate accommodates a marching column. Map dimensions may increase if needed to
preserve manoeuvring space; troops are not shrunk to fit the old settlement art.

Friendly field Squads may traverse the Gate and courtyards under ordinary movement
orders without becoming Garrison. The explicit Garrison Command instead admits
them to the protected posture; their field formation then disappears. A few
illustrative sentries on the walls and a discreet indicator communicate presence,
not a one-to-one count of the soldiers inside. The own settlement panel exposes
the actual roster, selection and exit controls. Enemy information remains limited
to what Observation grants.

Garrison capacity must be limited from the initial implementation, rather than
deferred. It is 60/120/240 surviving men at Tiers I/II/III for both Factions in the
initial design, so Tier III can house two complete 120-man Roman Squads or five
complete 48-man Carthaginian Squads. The symmetric limits are an initial balance
choice, subject to later review. Losses free places: a Squad raised at 120 and
reduced to 50 occupies 50 places. Garrison capacity is distinct from the Squad's
immutable purchased Capacity and from Force. Squads enter whole; no split or
merge is introduced to fill remaining places.

Only infantry and slingers may take up the protected Garrison posture. Cavalry
and Elephants may traverse and stand in courtyards as field Squads, but do not
become wall defenders. Counting their drawn Figures or abstract staying power
as men would not express the accepted Garrison limit.

On loss of sight, a Settlement retains its last actually observed appearance,
dimmed and clearly identified as memory. Its Works and construction stages never
advance in memory without another sighting. This supersedes ADR-0025's rule that
only a neutral silhouette survives; recorded appearance is historical evidence,
not a statement about current ownership, development or defence. Memory follows
the observed portions, rather than updating the whole complex when any part is
seen. Detailed knowledge fields and their presentation remain to be specified.

The accepted art direction gives Tier I a low wall, simple towers, a modest Gate
and an essential core; Tier II reinforces towers and parapets, articulates the
entrance and makes the completed Villa recognizable; Tier III adds more massive
towers, a monumental Gate and a legible Forum and square. The wall perimeter and
existing Work positions remain fixed. Minor settlements progress from an open
simple core to a more ordered Villa centre, then a developed Forum and square,
without acquiring Walls. Existing Works remain identifiable through the changes.

Factions differ in architectural form as well as colour: the accepted visual
proposal uses more regular axes and pitched roofs for Rome, and more pronounced
courtyards, terraced volumes and flatter roofs for Carthage. Both use the existing
procedural art system and perspective and the same physical accessibility
criteria. These are art directions, not additional economic bonuses.

Squads automatically take a marching column through narrow passages, restoring
their previous formation when enough space is available. This is a real formation
change, with the column's combat effects, not merely a deformation of the drawing.
Soldiers do not acquire individual paths. The existing centre-only route check
cannot by itself guarantee that the drawn formation clears roofs and Walls; the
redesign must reconcile passage geometry with the formation's occupied space.

A Stronghold retains one main Gate. While intact it admits the owner's Squads,
but enemies must use a destroyed Gate or a Breach in a Wall. A damaged but standing
Wall remains an obstacle. Intact Walls also prevent field contact combat through
them. The physical passage and its drawing must agree.

Capture is decided over a small, recognizable Capture area in the central square,
replacing the single invisible centre Tile. It remains walkable at every Tier.
The current three consecutive control checks at 50-Tick intervals remain; a Minor settlement is taken by
prevailing there. A Stronghold additionally needs a Breach and a Garrison that
has been neutralized or surrendered. An active Garrison cannot be ignored to
win by standing in the square. Blockade remains the alternative capture path.

Quarters cover the interior of an owned Stronghold's Walls or the inhabited core
of an owned Minor settlement, including Squads remaining in the field. Exterior
productive grounds alone do not grant shelter; Castrum retains its function.
Garrison capacity limits wall defenders, not all troops wintering under cover.

Recruitment creates field Squads at a designated free Muster area in the courtyard
or inhabited core, without automatic Garrison admission. If space is unavailable,
the order visibly waits before charging its cost and creating the Squad. It must
not overlap existing buildings or field formations.

Pending construction and recruitment orders are an explicit, cancellable list
with the reason for waiting and the unpaid cost. They may start automatically
when their starting conditions are satisfied. Cancellation before start needs no
refund because nothing was charged. This does not introduce demolition or
cancellation of already-started Works.

Blockade and relief distances are measured in exterior bands from the fortified
perimeter, or from the inhabited core of a Minor settlement, rather than from the
former centre Tile. The existing numeric radii are the initial parameters;
productive exterior Works do not enlarge the Siege perimeter. The Ram remains in
front of the Gate.

An external relief army must have actually emerged and outweigh the besiegers to
lift their Blockade; eliminating the besiegers or making them withdraw also lifts
it. Courtyard Squads and a token sortie cannot cancel a stronger Blockade merely
by being near the centre. This deliberately supersedes the existing any-field-
Squad-within-relief-radius rule and closes the instant-sortie loophole found while
designing physical exits.

Capture preserves Tier, Works, their positions, started construction and existing
fortification damage. Control insignia and banners change immediately,
but existing architecture does not instantly adopt the conqueror's style. New
Works follow their builder's architectural tradition; form can therefore indicate
origin while banners and the panel indicate current ownership. This refines the
faction art direction above. The former owner's Pending orders are cancelled
without charge. The existing victory framework remains: capture of the enemy
Stronghold ends the Match. Razing and reconstruction are outside the agreed scope.

A higher Stronghold Tier increases the resistance of Walls and Gate as well as
changing architecture and the existing progression effects. Assault and Blockade
retain their principles. The resistance values, costs and the treatment of
existing damage at the upgrade are now specified as initial balance parameters:

| Tier | Each Wall | Gate | Garrison capacity |
| --- | ---: | ---: | ---: |
| I | 60 | 120 | 60 |
| II | 90 | 180 | 120 |
| III | 120 | 240 | 240 |

Villa and Forum keep their current prices and construction times initially; no
second fortification purchase is required. Standing structures preserve their
integrity proportion against the new maximum. A half-intact wall remains
half-intact; a destroyed Wall or Gate remains destroyed, so upgrading cannot
close a Breach. This is not a separate repair action.

**Considered Options:** a larger drawing with the existing single-tile rules was
rejected because physical occupation is part of the requested redesign. Tier-only
visual variants cannot by themselves represent individual completed Works. Manual
building placement was rejected to preserve the existing strategic construction
interaction while making its results visible.

**Delegated calibration:** exact dimensions, map spacing and layout geometry;
construction-stage thresholds; interface details; and precise realization of the
accepted observation and movement rules belong to the future implementation
within the agreed constraints. The initial visual comparison must show both
Factions, all three Tiers, a fully built settlement and Squads of 24/60/120 men.
These comparisons inform geometric calibration before dimensions are consolidated.
They do not themselves authorize implementation, Chromium tests or an unrelated
economic or combat rebalance.

**Consistency requirements:** a new order or a changing obstacle must not teleport
a Squad, let it cross intact enemy fortifications, paint its Figures over a roof,
or contradict its actual formation and protection state. Queues, paid Works,
capacity checks and admission outcomes belong to the shared deterministic rules;
Human and AI use the same Command and filtered Observation contract. Appearance
alone never grants current knowledge beyond the actually observed portions.
Orders interrupted during passage must respect these same physical and atomic
protection boundaries. These are constraints on implementation, not additional
unresolved gameplay choices.

The external precedents and their limits are recorded in
[the research note](../reviews/settlement-visual-growth-references.md).
