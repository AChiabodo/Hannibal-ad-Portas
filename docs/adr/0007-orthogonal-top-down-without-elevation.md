# Orthogonal top-down, square tiles, no playable elevation

The map is drawn in orthogonal top-down projection on square 16×16 tiles, with sprites composed three-quarter so that buildings read as volumes. There is no playable elevation: the map has terrain *types* (plain, hill, forest, ford, road, farmland) that carry gameplay modifiers, and the heightmap exists only as generative noise for placing biomes and patches.

**Considered Options**: isometric 2:1 — rejected because it is not a filter over the renderer: it changes picking, depth sorting and multi-tile footprints, and it would force the entire procedural art library to be authored in isometric coordinates; pure top-down with buildings as floor plans — rejected because a building without a visible façade is unreadable at zoom.

**Consequences**: hills exist as a modifier rather than a shape, so we never promise that a hill blocks a valley's line of sight — and fog of war therefore has no elevation-based line of sight in v1. Four logical directions, three of them drawn with horizontal mirroring for the fourth. Legibility of the two Factions must not rest on colour alone, because at low zoom and under fog a grid of red pixels and a grid of purple ones are the same grid.
