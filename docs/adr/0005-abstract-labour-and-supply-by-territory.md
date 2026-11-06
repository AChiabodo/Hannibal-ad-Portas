# Abstract labour: no worker units, and supply by territory

**Amended by [ADR-0030](0030-settlements-occupy-ground-and-show-their-works.md),
2026-10-25, for the agreed redesign.** Construction gains visible, positioned
stages and a physical footprint from its actual start. This supersedes the
absence of a visible construction scene below; Labour remains abstract and no
worker or hauling units are introduced. The redesign is not yet implemented.

Population is a pool allocated to buildings and land, production matures on a timer, resources accumulate per settlement while denarii are a single treasury, and an army standing outside its own territory suffers attrition. There are no villager units and no supply-line units in v1.

**Considered Options**: worker units that harvest and haul, as in classic RTS — rejected because hundreds of civilians would dominate the AI's attention, the pathfinding budget and the render budget, and would turn a management game into a clicking game.

**Consequences**: Rome's interior lines and Carthage's inability to be reinforced in Italy become the Factions' central asymmetry without a single extra unit type. Siege by blockade works by cutting territory rather than by intercepting convoys. Because construction is abstract, there is no construction scene — a building is a timer plus a labour allocation.
