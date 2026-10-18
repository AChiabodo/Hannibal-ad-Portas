# SPQR

A browser real-time strategy game set in the Second Punic War in Italy. One continuous map carries economy, army command and siege; there is no separate battle scene.

Canonical terms are English (code, issues, docs). Where the player reads a different word in the Italian UI, it is recorded as `_UI_`.

## Language

### The Match

**Match**:
One play session on a single continuous map, from start to victory or defeat. Economy, army command and siege all happen on that one map.
_UI_: Partita
_Avoid_: Game, round, scenario, mission, level

**Faction**:
One of the two historical sides, Rome or Carthage, each with its own unit roster, buildings and economic character.
_UI_: Fazione
_Avoid_: Side, nation, civilization, team

**Player**:
Whichever Controller drives a Faction. A Match has exactly two Players.
_UI_: Giocatore
_Avoid_: using "player" to mean the human specifically

**Stronghold**:
A Faction's main settlement in the theatre. The fall of the enemy Stronghold ends the Match.
_UI_: Roccaforte
_Avoid_: Capital, base, HQ, mother city

**Season**:
One quarter of a Match's game year, and the Match's strategic clock: harvest in autumn, attrition and winter quarters in winter.
_UI_: Stagione
_Avoid_: Turn, phase, cycle

### The theatre

**Tile**:
One square of the theatre's grid, 16×16 pixels, and the unit everything on the map stands on.
_UI_: Casella
_Avoid_: Cell, square, hex

**Cell**:
One square of the *rendering* grid, which is half a tile out of step with the theatre's: it covers the corner where four tiles meet, and each of its four quadrants is one of those tiles' nearest quarter. Autotiling chooses for a cell, not for a tile, so a coastline's or a riverbank's shape belongs to a cell.
_UI_: —
_Avoid_: using "cell" for a Tile

**Resource marker**:
The small pile drawn on a Resource node's tile — a sheaf of grain, logs, a heap of stone, a stack of iron — sized and shaped to be read at the lowest zoom. It is a marker standing on the Terrain, not a kind of Terrain.
_UI_: —
_Avoid_: Icon, badge, sprite

**Terrain**:
What a tile is made of — plain, hill, forest, farmland, river, ford, road — and the modifier it carries. Only a river stops a Squad outright; the rest are costs and effects.
_UI_: Terreno
_Avoid_: Ground, biome

**Ford**:
A river tile a Squad may cross, at the cost of disorder. Every river carries several, because a river with one crossing is a wall with a gate.
_UI_: Guado
_Avoid_: Bridge, crossing (reserve "crossing" for the act)

**Resource node**:
A place on the map holding one resource — grain, timber, stone or iron — in a quantity the economy draws on. Nodes stand on the terrain that suits them: timber in forests, stone and iron on hills, grain on farmland.
_UI_: Giacimento
_Avoid_: Deposit, mine, patch, field

**Minor settlement**:
A capturable settlement that is not a Stronghold. Four to six stand on every map, and taking one means holding its centre.
_UI_: Insediamento minore
_Avoid_: Village, town, city, outpost

**Road**:
A path laid between settlements and resource nodes when the map is generated: it carries a Squad faster, and it crosses water only at a ford.
_UI_: Strada
_Avoid_: Highway, route (a route is what pathfinding returns)

**Half**:
One of the two sides of the perpendicular bisector of the two Strongholds: the territory each Faction starts nearest to, and the unit a generated map's resource parity is stated in. Not the map's left and right.
_UI_: —
_Avoid_: Side, half of the map

**Fog of war**:
What one Faction has seen of the theatre, in three states: unexplored — no eye has ever covered the tile; remembered — an eye covered it once, and the ground it had then is still known; visible — an eye covers it now. Vision is a radius around the Faction's own Squads and settlements, and the fog is *memory*: ground stays known after the Squad that saw it marches away.
_UI_: Nebbia di guerra
_Avoid_: Shroud, blackout, visibility mask, using "fog" for the unexplored state alone

**Last known contact**:
Where an enemy thing was standing when the Faction last saw it, kept after it marches out of view. The place is a memory and not a live position, and how stale that memory is matters.
_UI_: Ultimo contatto noto
_Avoid_: Blip, tracker, calling a thing the rules can see right now a "contact" (that is an enemy in sight; only the fog's *memory* of one is a last known contact)

### Command

**Controller**:
Whichever mind drives a Faction: the human input handler, the built-in AI, a scripted test driver, or an external agent. All four implement the same interface and differ in nothing else.
_Avoid_: Player, input handler, brain

**Observation**:
Everything a Controller is allowed to know: the Match state filtered through its Faction's fog of war. No Controller ever reads Match state outside its own Observation.
_UI_: —
_Avoid_: View, state (the raw Match state is not an Observation)

**Command**:
A single order a Controller emits. The set of Commands is the game's entire public control surface.
_UI_: Ordine
_Avoid_: Action, instruction, order (as a synonym for Command)

**Squad**:
The atomic unit that is ordered, moved and fought: one block of soldiers with aggregate strength, morale and facing. The individual soldiers inside a Squad exist only as rendering.
_UI_: Reparto
_Avoid_: Unit, regiment, formation, group

### War

**Territory**:
The stretch of map a Faction draws supply from, inferred from the settlements it holds. A Squad outside its own Territory suffers Attrition.
_UI_: Territorio
_Avoid_: Borders, land, zone of control, influence

**Siege**:
The contest over a settlement, conducted either as an Assault or as a Blockade. The two paths are alternatives, not stages.
_UI_: Assedio
_Avoid_: using "siege" for the assault alone

**Assault**:
The fast, expensive path of a Siege: breaking walls with the ram and taking the settlement by force.
_UI_: Assalto
_Avoid_: Attack, storm (reserve "attack" for combat between Squads)

**Blockade**:
The slow path of a Siege: cutting supply and starving a settlement into surrender, breakable by the besieged Faction's field army.
_UI_: Blocco
_Avoid_: Encirclement, investment, starvation

**Attrition**:
The per-Season loss a Squad suffers for being outside its Faction's Territory, or for wintering in the field without a camp.
_UI_: Attrito
_Avoid_: Decay, drain, penalty

### Economy

**Payroll**:
The denarii a Faction owes each Season for the Squads it keeps. Unpaid Squads lose morale and eventually desert.
_UI_: Soldo
_Avoid_: Upkeep, maintenance, cost, salary
