# A resource node is capacity, not a pile

A resource node's `amount` is how much of its resource a settlement can work per
Season, and the land around the settlement yields grain, timber and stone
beside it. Nothing depletes, and every settlement works a small amount of each
resource in its own immediate ground whatever the seed put near it. The
alternatives were both worse: **depleting nodes** would run the economy dry
inside a game year — the map's nodes hold single- and double-digit amounts — or
need refilling, which is a different game; **nodes alone as the land** would
leave settlements dependent entirely on the distribution of nearby nodes. The base
working is what lets a settlement on a plain feed itself and raise its first
buildings; terrain and nodes are the surplus above it, and iron above the base
still needs a node or a mine, so scarcity is where the map says it is.

**Considered Options**: finite depleting piles with regeneration; a settlement's
land being only the nodes within reach, with no base.

**Consequences**: storage capacity is what bounds a stock, not scarcity of
ground; how rich an untouched settlement is, is a balance constant rather than a
map invariant; and the map still decides *which* resources are worth marching
for, because the surplus is where the nodes and the good terrain are.

Issue #76 revises placement, not this production rule: each Stronghold and its
nearest neutral opportunity receive workable nodes of all four resources, and
all other nodes remain within settlement reach. Locally suitable terrain is
preferred, with other dry land as a fallback. Edge placement no longer implies
that a Stronghold has no nodes; the base yield still provides the same floor.
