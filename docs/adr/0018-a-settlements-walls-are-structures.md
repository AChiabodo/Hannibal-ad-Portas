# A settlement's walls are structures, and the ram is built in the field

**Amended by [ADR-0030](0030-settlements-occupy-ground-and-show-their-works.md),
2026-10-25, for the agreed redesign.** Wall and Gate resistance scale with Tier;
their destroyed state remains a real passage. Garrison is limited to infantry
and slingers, has a Tier-based survivor capacity, and is admitted through the
physical Gate. Capture uses a visible central area and requires the active
Garrison to be overcome as well as a Breach. Siege proximity is measured from the
physical perimeter; relief must actually reach the exterior and outweigh the
besiegers, or the besiegers must leave or be eliminated. The separate structures,
field-built Ram and alternative Blockade path remain. These changes are not yet
implemented.

A Stronghold's fortification is **not** one pool of health. It is a gate and four stretches of wall, one to a side, each with its own hit points, and a **breach** is any one of them broken. The ram is aimed at the gate; the men who have no ram work at a wall, at about a third of the pace, and pay for every round of it in men and nerve. A **garrison** is a posture of an ordinary Squad — inside the walls, out of the field's contact rules, fed by the settlement's own granary — and the ram itself is **laid down at the walls**, paid for out of the besieging Faction's one treasury, built over `RAM_BUILD_TICKS`, and vulnerable to the garrison's files.

A **Blockade** uses the settlement's own granary rather than a supply meter of its own: `produceSeason` and `harvest` take a `Supplied` predicate, a blockaded settlement works nothing, earns no tax and grows no people, and each Season of blockade spoils grain and takes people. A town with no grain and nobody left on its walls opens its gates. A field army of the besieged Faction within `RELIEF_RADIUS` lifts the ring.

**Considered Options**: a settlement health pool, with the walls as decoration — rejected because it makes "walls and gates take damage as structures" a lie and turns the ram into a damage multiplier rather than a decision. Walls invulnerable to everything but the ram — rejected because it makes an assault issued before a breach impossible, when the ticket asks for one that is possible and punishing, and because a broken ram would then end the assault outright. A blockade supply meter stored beside the settlement — rejected because the economy already has a granary and a starving population, and a second, parallel scarcity would make a granary worth nothing to a besieged town. A separate `Ram` entity on the map with its own tile and route — rejected because there is no unit below a Squad (ADR-0004): the ram is a structure of the siege, not a Squad, and it is where the army is.

**Consequences**: the ram is the only thing that shields an assault, so its build time is the assault's real cost and the garrison's chance to break it is the defender's. An assault is fast and expensive, a blockade is slow and cheap in lives, and the two use different systems rather than the same one at different rates — which is what D5 will decide between. A garrison entering state put one field on every Squad (`Block.garrison`), which moved the `march` and `roster` golden hashes when C5 landed; ADR-0006 says a moved hash is a decision in review, and that was the decision. The blockade's numbers (`BLOCKADE_GRAIN_LOSS`, `BLOCKADE_MORALE_LOSS`, `RAM_*`) are the first thing F1's balance pass measures, and ADR-0008's escape hatch — give Carthage a ram — is `canAssault` returning `true` for both Factions and nothing else.
