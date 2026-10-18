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

**Year**:
Four Seasons of Match time, counted from one. A human Match has no limit on them; a headless Match is bound to three so that it always terminates.
_UI_: Anno
_Avoid_: Cycle, age, era

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
A place on the map holding one resource — grain, timber, stone or iron — in a quantity the economy draws on each Season. Nodes stand on the terrain that suits them: timber in forests, stone and iron on hills, grain on farmland. The quantity is how much land a settlement can work, not a pile that runs out (ADR-0012).
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

**Figure**:
One drawn soldier of a Squad's type — a man, a horse and rider, or a beast — in one direction and one frame. A Squad is drawn as its figures in formation, and a type that is a single creature is drawn as one figure whatever its strength.
_UI_: —
_Avoid_: Sprite, model, unit (the drawing code's `soldier()` is the entry point for every figure, a beast included)

**Elephant**:
A Squad of a single figure: one beast drawn in the same little box as a man, with the staying power of a body of men behind its strength. It is recruited, paid, ordered, flanked and routed like any other type; only its figure is extraordinary.
_UI_: Elefante
_Avoid_: War elephant, monster, beast (the beast is the figure, not the entity)

**Pace**:
The speed a Squad type marches at, as a whole number of tiles' worth of ground per tile's cost: 1 is a man on foot and 2 is a horse. A tile's ticks are the terrain's divided by the pace, and a route is planned in the walker's own pace.
_UI_: —
_Avoid_: Speed (reserve "speed" for the three settings a Match runs at), rate, velocity

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

**Supply**:
Whether a Squad can draw on its Faction's country where it stands: a Squad with no friendly settlement in reach is cut off, and being cut off costs it morale each Season. Not the four resources, and not a line drawn on the map — that is Territory, which C6 builds.
_UI_: Rifornimenti
_Avoid_: Logistics, upkeep, in-supply/out-of-supply as a noun

**Morale**:
What a Squad has left to fight with, and the primary resource of a fight: it is what decides whether a Squad stands or breaks, as against its strength, which only decides how many men are still standing. Moved by the fight itself, by flanking and rear attacks, by fatigue, by Supply, and by Payroll.
_UI_: Morale
_Avoid_: Health, hit points, spirit, resolve

**Rout**:
What a Squad does when its morale is gone: it runs for the nearest settlement its Faction holds, strikes weakly, and is not butchered while it has somewhere to run. Automatic, and not a state a Player can order.
_UI_: Rotta
_Avoid_: Retreat, flee (reserve "withdraw" for the Command), break (as a noun)

**Rally**:
A routed Squad forming up again by itself, once the ground behind it is quiet. There is no Command for it and no micro-recovery: the player's job was to not get the Squad broken.
_UI_: Adunata
_Avoid_: Recover, regroup, reform

**Ammunition**:
The volleys of missiles a Squad carries into a fight: a Squad with ammunition left adds a volley to each round it is in contact, and spends one doing it. A type with none fights with its arm alone, and what has been thrown comes back only when the Squad is resupplied in its own country at a Season boundary. "Volley" is the unit; "missile" is only what is thrown.
_UI_: Munizioni
_Avoid_: Missiles, ammo, rounds, shots (a round is a tick of contact, not a thing thrown)

**Fatigue**:
How tired a Squad is from marching and fighting, on a scale from fresh to spent. A tired Squad strikes weakly until it has stood still out of contact for a while.
_UI_: Fatica
_Avoid_: Stamina, exhaustion, endurance

**Arm**:
What a Squad is equipped with — spear, sword, cavalry, light or archers — and therefore its row and column in the matchup matrix. Latin has no word for this that is not also a weapon, so the word is English everywhere and the interface never shows it.
_UI_: —
_Avoid_: Weapon, class, type (a type is a Squad type, which names an arm)

**Matchup matrix**:
The table deciding who has the better of a fight: `spear > cavalry > light > archers > spear`, with the sword even against everything. It is a cycle and not a ladder, so no arm is best and the right roster depends on the enemy's.
_UI_: —
_Avoid_: Counter table, rock-paper-scissors, unit chart

**Aspect**:
Where a blow lands relative to the way the target faces: its **front**, its **flank** or its **rear**. A flank or rear attack costs the target both men and morale, and the target strikes weakly in return, because its front rank is facing the wrong way. Manoeuvre is worth what the aspect is worth.
_UI_: —
_Avoid_: Angle, direction, orientation (a facing is the way a Squad looks, not where it is hit)

**Corpse**:
One mark left on the tile where men of one Squad fell in one round: drawn as a body in that Squad's own silhouette, then faded away after about thirty seconds. One mark may stand for several men. Residue and never state — a corpse changes nothing, blocks nothing, and is not in the state hash.
_UI_: —
_Avoid_: Body, casualty marker, corpse pile (a corpse is one mark on one tile, not a stock)

### Economy

**Payroll**:
The denarii a Faction owes each Season for the Squads it keeps. Unpaid Squads lose morale and eventually desert.
_UI_: Soldo
_Avoid_: Upkeep, maintenance, cost, salary

**Settlement**:
A place on the map with people, buildings and a stock: a Stronghold or a minor settlement. Its tier gates what may be raised in it.
_UI_: Insediamento
_Avoid_: City, town, base, colony (a Stronghold and a minor settlement are both settlements)

**Tier**:
One of the three steps of a settlement's growth — raised by the building that raises it — and the gate on which Squad types it may raise. The progression is the tiers, and there is no technology tree beside them.
_UI_: Livello
_Avoid_: Level, age, era, upgrade

**Labour allocation**:
How a settlement's population is divided between its works and its land. There is no Command for it: it follows from what the settlement has built and who lives in it.
_UI_: Manodopera
_Avoid_: Assignment, jobs, workers

**Work**:
One building in one settlement: a labour demand plus a timer while it goes up, and a labour demand plus what it yields once it stands.
_UI_: Cantiere
_Avoid_: Building (a building is the kind; a work is the one in a settlement), construction site

**Treasury**:
The denarii a Faction holds, once per Faction rather than once per settlement, as against the four resources, which are held per settlement.
_UI_: Tesoreria
_Avoid_: Bank, gold

**Harvest**:
The extra grain the autumn Season brings in from the people on the land: a visible peak in the year's production, on top of the Season's ordinary work.
_UI_: Raccolto
_Avoid_: Yield, crop

### The interface

**String table**:
The one place a player-facing word lives: a stable English key, and the word in every language the game speaks. Italian is required — it is the language the interface is played in — and English is the fallback path for a key not yet translated.
_UI_: —
_Avoid_: Locale file, translations, i18n bundle

**Readout**:
One labelled figure the interface always shows — the year, the Season, the treasury, a resource — as against a panel, which a selection opens.
_UI_: —
_Avoid_: Stat, indicator, counter

**Selection**:
What the Player has picked — a settlement, or one or more Squads — and the panel that follows it. It is the Player's own memory rather than Match state: nothing else can see it and it decides nothing on its own. A box selects every Squad it touches; one order goes to all of them, while the panel shows the first one picked. There is one selection at a time, and nothing selected is a state rather than an error.
_UI_: Selezione
_Avoid_: Focus, target, highlight

**Control group**:
Numbered Squads a Player has bound to a digit, so that one key calls them back. It is a Command when it is bound, because a log has to re-enact the selection, and it commands nobody: the list belongs to the Player.
_UI_: Gruppo
_Avoid_: Hotkey group, squad slot

**Minimap**:
The theatre at one pixel per tile, drawn through the Faction's Fog of war: it shows what the Faction knows and nothing more.
_UI_: Mappa
_Avoid_: Overview, radar, small map
