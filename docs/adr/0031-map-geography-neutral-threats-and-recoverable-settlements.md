# The map joins geography, neutral threats and recoverable settlements

Status: accepted; partially implemented. Current evidence and remaining work are recorded in `docs/map-rework-spec.md`.

The procedural theatre will remain an organic, deterministic and fairly accessible Italian landscape, with one connected road network, variable water crossings and room for future larger maps. Neutral barbarian camps provide bounded, local risks to both factions, rather than becoming capturable settlements. This combines strategic variety with routes and opportunities players can understand, and leaves future trade and larger matches open without implementing them now.

This decision revises ADR-0030's exclusion of attacks on individual economic Works: completed Works can be attacked, become persistent repairable ruins and retain agreed housing, storage and Tier protections. Walls and gates can also be repaired, but new repairs cannot begin during Siege; work started beforehand continues and remains invulnerable, at the cost of suspended production. Unfinished Works remain invulnerable. These rules preserve the identity and continuity of settlements while giving raids and lasting fortification damage a counterplay. The detailed accepted conditions and calibration boundaries are recorded in the map rework specification.

Difficulty also governs the frequency of neutral raids against both Factions, revising the previous AI-only interpretation without changing faction resources, visibility or barbarian combat strength. Existing saves and replays need not remain compatible with the new version; deterministic reproduction within the new version remains required.
