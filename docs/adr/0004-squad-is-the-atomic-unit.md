# The Squad, not the soldier, is the atomic unit

A Squad is one block of soldiers with aggregate strength, morale and facing; the men inside it are drawn but never simulated individually. We chose this over individual soldiers so that the AI plans over a dozen objects instead of several hundred, so that formation is a property of the unit rather than an accessory bolted onto it, and so that pathfinding and rendering stay cheap. Two kinds of entity are Squads of a single figure: war elephants and the siege ram.

**Considered Options**: individual soldiers with their own pathing and stats, as in classic RTS — rejected because it multiplies AI, pathfinding and render cost to buy micro control this game deliberately does not want.

**Consequences**: combat resolves as aggregate attrition plus morale, and Squads rout rather than being annihilated to the last man. Individual-soldier micro is impossible by design, so nobody should later try to add kiting or dodging. The paper-doll generator draws a Squad as N copies of one figure in formation, which is the art pipeline's easiest case and the reason unit variety is cheap here.
