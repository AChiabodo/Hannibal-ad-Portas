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
A Faction's fortified main settlement in the theatre, whose identity is independent of its Tier. The fall of the enemy Stronghold ends the Match.
_UI_: Roccaforte
_Avoid_: Capital, base, HQ, mother city

**Season**:
One quarter of a Match's game year, and the Match's strategic clock: harvest in autumn, Attrition every Season and worst in winter, and winter quarters in winter.
_UI_: Stagione
_Avoid_: Turn, phase, cycle

**Tick**:
The Match's smallest step: one tenth of a second at the pace the simulation runs, and the unit a timer, an order's queue and a Season's progress are counted in. It is the clock, never a turn — a Match steps ten thousandths of a second regardless of who is watching.
_UI_: tick
_UI note_: the interface's own word for a countdown keeps the code's short word because it is a number a Player reads beside a work or a ram, and no Italian term for it exists in the glossary.
_Avoid_: Turn, frame, step (a frame is the renderer's, and a step is a Command)

**Year**:
Four Seasons of Match time, counted from one. A Match is bound to three of them — twenty-five thousand two hundred ticks, in a browser and headless alike — and a caller may hand over another bound, but not none.
_UI_: Anno
_Avoid_: Cycle, age, era

**Record**:
A Match written down as a seed, the Command log it applied, how it ended, and the state hash at every checkpoint it was fingerprinted at — one small file, and everything a replay needs. It is not a video and not a snapshot of the world.
_UI_: —
_Avoid_: Replay file, savegame, demo, capture

**Replay**:
Running a Record again through the rules, with no Controllers at all, and comparing the hashes it reaches with the ones the Record was made with. It is a CLI and CI instrument in v1, not something the player watches.
_UI_: —
_Avoid_: Playback, video, recap

**Divergence**:
The first checkpoint at which a Replay's state hash disagrees with its Record's, quoted beside the last checkpoint the two still agreed on. It is either a bug or a decision, and which one is a reviewer's question.
_UI_: —
_Avoid_: Mismatch, desync, drift, hash failure

**Tournament**:
A batch of AI-vs-AI Matches on distinct seeds, played at one difficulty and one bound, and reduced to one Balance report. It is a CLI instrument, like the Record and the Replay, and not something the player ever sees.
_UI_: —
_Avoid_: League, ladder, season, benchmark

**Balance report**:
What a Tournament adds up to: each Faction's win rate over the batch, the median and the spread of how long a Match lasts, the share of Matches the clock decided, and the seed of every Match that was lopsided or stalled. It states measurements and no verdict.
_UI_: —
_Avoid_: Scoreboard, leaderboard, results table

**Lopsided**:
A victory that was not a contest: one won in at most half the batch's median duration, or one that left the loser neither settlement nor Squad. A reader has to look at it.
_UI_: —
_Avoid_: Blowout, stomp, rout

**Stalled**:
A Match no Faction could win, because the tick bound ended it. The clock decided it, which is the outcome the Definition of Done puts a ceiling on.
_UI_: —
_Avoid_: Draw, stalemate, timeout

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
The kind of ground or water a Squad encounters, such as plain, hill, forest, farmland, river, lake, marsh, ford or road, and the movement costs or effects it carries. Rivers and lakes stop Squads except at an available crossing.
_UI_: Terreno
_Avoid_: Ground, biome

**Ford**:
A place where a Squad may cross a river in the water, at the cost of disorder. Its presence and number depend on the course of the water and the crossings needed.
_UI_: Guado
_Avoid_: Bridge, crossing (reserve "crossing" for the act)

**Bridge**:
A structure that carries a path across water, allowing Squads to cross above it.
_UI_: Ponte
_Avoid_: Ford

**Marsh**:
Wet ground that Squads can cross more slowly than ordinary land.
_UI_: Palude

**Lake**:
An inland body of water that Squads cannot cross and must travel around.
_UI_: Lago

**Barbarian camp**:
A neutral place occupied by a group hostile to both Factions, which defends it and raids its surroundings. Eliminating it permanently removes the threat and yields a one-time reward, rather than capturing it as a minor settlement.
_UI_: Accampamento barbaro

**Resource node**:
A place on the map holding one resource — grain, timber, stone or iron — in a quantity the economy draws on each Season. Nodes stand on the terrain that suits them: timber in forests, stone and iron on hills, grain on farmland. The quantity is how much land a settlement can work, not a pile that runs out (ADR-0012).
_UI_: Giacimento
_Avoid_: Deposit, mine, patch, field

**Minor settlement**:
A capturable settlement that is not a Stronghold, even at the highest Tier. Minor settlements have no Walls and are taken by holding their Capture area.
_UI_: Insediamento minore
_Avoid_: Village, town, city, outpost

**Walls**:
The stretches of stone round a Stronghold, four of them, one to a side, each with its own hit points and each able to be broken on its own. A minor settlement has none, which is why it is taken by holding its centre.
_UI_: Mura
_Avoid_: Fortification (that is the walls and the gate together), rampart, defences

**Gate**:
The controlled passage in a Stronghold's Walls, open to its owner's Squads while intact and the structure a Ram is aimed at. It takes its own damage; a destroyed Gate is a Breach through which either Faction may pass.
_UI_: Porta
_Avoid_: Door, entrance

**Breach**:
A Gate or stretch of Walls broken open, creating a physical passage through the fortification. A Breach is necessary for an Assault to take a Stronghold, but its active Garrison must also be overcome.
_UI_: Breccia
_Avoid_: Gap, hole, breakthrough

**Road**:
A path forming part of a connected network between settlements and other relevant places: it carries a Squad faster, and crosses water at a Ford or a Bridge. The network connects to settlement entrances and internal passages.
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
Where an enemy Squad or a settlement stood when the Faction last saw it, kept after sight is lost; a settlement also retains its last observed appearance. This is dated knowledge, never a live position, a current appearance or a claim about who owns the place today.
_UI_: Ultimo contatto noto
_Avoid_: Blip, tracker, calling a thing the rules can see right now a "contact" (that is an enemy in sight; only the fog's *memory* of one is a last known contact)

**Enemy in sight**:
An enemy field Squad currently covered by the Faction's eyes. Its visible body, formation and facing may be seen; its nerve, supplies and intentions remain private. Once sight is lost, only its last known contact remains.
_UI_: Nemico avvistato
_Avoid_: Calling a remembered position a live enemy, treating a visible formation as knowledge of its orders

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

**Difficulty level**:
The selected challenge level: Tiro, Centurio or Imperator. It changes the built-in AI opponent's planning horizon, aggression, reaction time and scouting quality, and the frequency of Barbarian camp raids against both Factions; it does not change resources, production, vision or barbarian combat strength. “Level” here means one of these settings; a settlement's progression is its Tier.
_UI_: —
_Avoid_: setting

**Squad**:
The atomic unit that is ordered, moved and fought: one block of soldiers with aggregate strength, morale and facing. The individual soldiers inside a Squad exist only as rendering.
_UI_: Reparto
_Avoid_: Unit, regiment, formation, group

**Figure**:
One drawn soldier of a Squad's type — a man, a horse and rider, or a beast — in one direction and one frame. A Squad is drawn as its figures in formation, and a type that is a single creature is drawn as one figure whatever its strength.
_UI_: —
_Avoid_: Sprite, model, unit (the drawing code's `soldier()` is the entry point for every figure, a beast included)

**Capacity**:
The men a Squad was raised with, fixed for its life. Survivors are read against it, so a 60-man Squad worn down to 30 reads as `30/60` and no loss can silently change the size that was bought. A Squad type offers real sizes (Rome's melee 24/60/120; Carthage's 24/48; one fixed size for a specialist); choosing one is part of the Recruit Command, and there is no split or merge.
_UI_: Reclutati
_Avoid_: Max strength, health, full strength (capacity is a purchase, not a condition)

**Force**:
The military weight a Squad brings, measured in the men it has left times what one of its men is worth: one for the infantry of both rosters and for the slingers, two for the Numidian horse, four for the elephant. A column brings a quarter of it. It is what a fight, a wall's defence, a blockade and a settlement's centre are all decided by, and it is why dividing the same men into more Squads buys nothing. "Bearing" is the code's word for the same number (`bearing`); the interface calls it `Forza`.
_UI_: Forza
_Avoid_: Power, strength (that is the men a Squad has left), weight

**Force point**:
The unit a blow is counted in: twelve make one man killed. A blow is summed over every Squad that landed on the same defender and floored once, which is what makes five 24-man Squads cost exactly what one 120-man Squad costs. The interface never prints it; the code's `POINTS_PER_MAN` is the twelve.
_UI_: —
_Avoid_: Damage, hit points, blow (a blow is the act, a force point is the unit)

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
The stretch of map a Faction draws supply from, inferred from the settlements it holds: the ground within reach of them, and nothing drawn by hand. A Squad outside its own Territory suffers Attrition.
_UI_: Territorio
_Avoid_: Borders, land, zone of control, influence

**Front**:
One settlement's Siege as a Faction reads it: the path being followed, any breach in its walls, the ram at them, the garrison on them, and how far a hold has got. A front is *sighted*, not announced: it is shown only to the settlement's owner, to the Faction besieging it, or to a Faction one of whose own eyes covers it — an open settlement with no wall to keep a secret included (ADR-0020).
_UI_: Fronte
_Avoid_: Sector, battle-line, and using "front" for the Aspect sense (that is a target's facing)

**Siege**:
The contest over a settlement, conducted either as an Assault or as a Blockade. The two paths are alternatives, not stages.
_UI_: Assedio
_Avoid_: using "siege" for the assault alone

**Assault**:
The fast, expensive path of a Siege: breaking walls with the ram and taking the settlement by force.
_UI_: Assalto
_Avoid_: Attack, storm (reserve "attack" for combat between Squads)

**Blockade**:
The slow path of a Siege: cutting supply and starving a settlement into surrender, lifted when the besiegers leave or are eliminated, or an external relief army outweighs them. A ring that outweighs the Garrison starves it faster, up to twice the stated rate; troops still inside the settlement do not themselves lift the Blockade.
_UI_: Blocco
_Avoid_: Encirclement, investment, starvation

**Attrition**:
The per-Season loss of men a Squad suffers for being outside its Faction's Territory, or for wintering in the field without a camp. Worst in winter, a share of the men rather than a fixed number, and charged at the Season boundary.
_UI_: Attrito
_Avoid_: Decay, drain, penalty

**Quarters**:
Where a Squad winters under cover: inside its own Stronghold's Walls, in the inhabited core of its own Minor settlement, or in a Camp. A Squad in Quarters pays no Attrition for the winter; exterior productive grounds alone do not provide that shelter.
_UI_: Quartieri d'inverno
_Avoid_: Shelter, base, barracks

**Camp**:
The open ground round a settlement that holds a standing Castrum, which counts as quarters for the Squads holding position in it. Rome's alone, because the Castrum is (PLAN §1) and a Roman army's alone, so a camp that changes hands with the village it stands in is not the new holder's.
_UI_: Castrum
_Avoid_: Bivouac, fort, encampment (the camp is the ground, not the building)

**Supply**:
Whether a Squad can draw on its Faction's country where it stands: a Squad standing outside its own Territory is cut off, and being cut off costs it morale each Season. Not the four resources, and not a line drawn on the map — that is Territory.
_UI_: Rifornimenti
_Avoid_: Logistics, upkeep, in-supply/out-of-supply as a noun

**Morale**:
What a Squad has left to fight with, and the primary resource of a fight: it is what decides whether a Squad stands or breaks, as against its strength, which only decides how many men are still standing. Moved by the fight itself, by flanking and rear attacks, by fatigue, by Supply, and by Payroll. It is lost **once per body under attack**, not once per enemy attacking it: being pressed by five Squads is not five times the shock of being pressed by one.
_UI_: Morale
_Avoid_: Health, hit points, spirit, resolve

**Ram**:
The siege engine an Assault needs. Rome's alone, laid down at the walls it is aimed at, paid for from the treasury, slow to build and vulnerable to the garrison, and aimed at the gate. Carthage has none (ADR-0008).
_UI_: Ariete
_Avoid_: Battering ram, siege engine (that is the kind; the ram is the one v1 has), siege tower

**Garrison**:
The infantry and slinger Squads a Faction assigns to a Stronghold's walls instead of the field, within its Garrison capacity. It is a posture of ordinary Squads, protected from field contact, fed by the settlement's granary and measured by Force against a Ram; a storm that breaks it makes it surrender rather than Rout.
_UI_: Guarnigione
_Avoid_: Defender (any Squad defending is not necessarily a garrison), reserve, stack

**Garrison capacity**:
The maximum number of surviving men a Stronghold can accommodate in its Garrison, set by its Tier. It limits the whole Garrison, independently of the Squads' original purchased Capacity or how many Squads those men belong to.
_UI_: Capienza della guarnigione
_Avoid_: Capacity on its own, number of Squads

**Garrison assembly point**:
The gathering place just inside a Stronghold's Gate where field Squads join its Garrison, including Squads already in the courtyard.
_UI_: Punto di raccolta della guarnigione
_Avoid_: Muster area, Capture area

**Rout**:
What a Squad does when its morale is gone: it runs for the nearest settlement its Faction holds, strikes weakly, and is not butchered while it has somewhere to run. Automatic, and not a state a Player can order.
_UI_: Rotta
_Avoid_: Retreat, flee (reserve "withdraw" for the Command), break (as a noun)

**Rally**:
A routed Squad forming up again by itself, once the ground behind it is quiet. There is no Command for it and no micro-recovery: the player's job was to not get the Squad broken.
_UI_: Adunata
_Avoid_: Recover, regroup, reform

**Ammunition**:
The volleys of missiles a Squad carries into a fight: a Squad with ammunition left adds a volley to each round it is in contact, and spends one doing it. A volley is a weight of missiles **per man**, not per Squad, so splitting a body into five does not buy five bodies' worth of stones; a missile arm's volley is heavier than a line's. A type with none fights with its arm alone, and what has been thrown comes back only when the Squad is resupplied in its own country at a Season boundary. "Volley" is the unit; "missile" is only what is thrown.
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
The denarii a Faction owes each Season for the Squads it keeps; for infantry, the amount follows troop type and surviving men. A type's rate is denarii per 24 men, and a Squad's bill is that rate times its survivors, rounded up, so equivalent men cost the same wherever they stand and splitting them can never lower the bill. Unpaid Squads lose morale and eventually desert.
_UI_: Soldo
_Avoid_: Upkeep, maintenance, cost, salary

**Settlement**:
A place on the map with people, buildings and a stock: a Stronghold or a minor settlement. Its tier gates what may be raised in it.
_UI_: Insediamento
_Avoid_: City, town, base, colony (a Stronghold and a minor settlement are both settlements)

**Capture area**:
The recognizable, walkable part of a Settlement's central square whose sustained control determines capture. A Stronghold also requires a Breach and the neutralization or surrender of its Garrison.
_UI_: Piazza di controllo
_Avoid_: Centre tile, invisible capture point

**Settlement landmark**:
The permanent headquarters of a Stronghold or communal hall of a Minor settlement, identifying its civic centre beside the central square. It is distinct from commissioned Works and the Roman Castrum.
_UI_: —
_Avoid_: Work, Castrum, using the landmark to mean the Capture area

**Muster area**:
The open ground in a Settlement where newly recruited Squads assemble in the field, distinct from its Garrison.
_UI_: Zona di raduno
_Avoid_: Spawn point, automatic Garrison

**Settlement footprint**:
The ground a Settlement physically occupies, distinct from the surrounding Territory it supplies.
_UI_: —
_Avoid_: Territory, using the drawing's extent to mean the occupied ground

**Settlement grounds**:
The full area reserved for a Settlement and its future Works, including open ground and passages. Reserved ground is not necessarily an obstacle.
_UI_: —
_Avoid_: Territory, treating all reserved ground as impassable

**Tier**:
One of the three steps of a settlement's growth, raised by the building that raises it and governing which Squad types it may raise. A Stronghold's Tier also determines its Garrison capacity and fortification resistance; there is no separate technology tree.
_UI_: Livello
_Avoid_: Level for a settlement's progression, age, era, upgrade

**Labour allocation**:
How a settlement's population is divided between its works and its land. There is no Command for it: it follows from what the settlement has built and who lives in it.
_UI_: Manodopera
_Avoid_: Assignment, jobs, workers

**Pending order**:
A requested construction or recruitment waiting for its starting conditions, before payment and before a Work or Squad exists. It may be cancelled before it starts.
_UI_: Ordine in attesa
_Avoid_: Work, completed purchase

**Work**:
One commissioned building in one settlement: a labour demand plus a timer while it goes up, and a labour demand plus what it yields once it stands.
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

**Guide**:
The optional first-entry sequence that teaches the four acts a Match opens with — open a settlement, raise a Squad, select it, give it a destination — by naming the real controls and waiting for the Player to use them. It starts paused, can be skipped, dismissed and reopened, remembers only its dismissal as a presentation preference, issues no Command and reads no Observation; it is not a rule set, a scripted army or a second Match.
_UI_: Guida
_Avoid_: Tutorial, walkthrough, onboarding, help overlay

**Tutorial**:
A repeatable practical exercise that teaches economy, recruitment, movement, combat, territory and siege through objectives the human completes. Its chapters are distinct from the brief Guide available in a normal Match.
_UI_: Tutorial
_Avoid_: Guide, encyclopedia

**Encyclopedia**:
The reference a human can consult from the main menu or during a Match to understand resources, buildings, troops and rules. It complements practical teaching with explanations that can be revisited at any time.
_UI_: Enciclopedia
_Avoid_: Tutorial, Guide

**Readout**:
One labelled figure the interface always shows — the year, the Season, the treasury, a resource — as against a panel, which a selection opens.
_UI_: —
_Avoid_: Stat, indicator, counter

**Standard**:
The Faction's insignia carried above a Squad's block on the map: a rectangular banner for Rome and a swallow-tailed pennant for Carthage, in the same cloth as its soldiers. It marks the Faction where a mass of overlapping shields hides the cloth, and it is drawing and nothing else.
_UI_: Insegna
_Avoid_: Flag, banner (a banner is the shape a standard takes), icon

**Condition**:
What the theatre says about a Squad beyond its block: its Morale as the primary figure, and the shapes of the critical conditions it is in. A selected Squad wears a full plate; an unselected one in trouble wears a single shape; a healthy Squad nobody has chosen wears nothing.
_UI_: Condizione
_Avoid_: Status, state (state is the Match's), health

**Notice**:
A line the interface tells a Player about the Match: a condition that is true now (a low Morale, a rout, an unpaid Season, a ground the Squad is cut off from, the winter boundary close) or a brief event (an order refused, contact made, a Siege opened). Notices are deduplicated, kept in a compact history for the current Match, and carry only what the Faction's Observation holds; one that names a place can be clicked to centre it while that place is known.
_UI_: Avviso
_Avoid_: Alert, warning (a warning is the presentation threshold that raises a notice), message, toast

**Forecast**:
The interface's estimate of what the next Season boundary will do to the Treasury — production and tax first, then Payroll in the Squads' own order — shown only when the Faction's own knowledge makes it exact, and labelled as an estimate. It is presentation and decides nothing.
_UI_: Stima
_Avoid_: Prediction, projection, budget

**Selection**:
What the Player has picked — a settlement, or one or more Squads — and the panel that follows it. The settlement may be one the Faction knows rather than one it holds: an enemy Stronghold in sight, a village it remembers, a village nobody holds, each opened by clicking the structure drawn on the map (ADR-0025). It is the Player's own memory rather than Match state: nothing else can see it and it decides nothing on its own. A box selects every Squad it touches; one order goes to all of them, while the panel shows the first one picked. There is one selection at a time, and nothing selected is a state rather than an error.
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

**Debug hook**:
One call a page publishes on `window.__SPQR`, so that a test or an inspecting agent can move the camera, drive the Match and read what it drew. The hooks a Player's hands use are the same calls the page makes for them, and none of them issues a Command a Player could not; the rest step the clock, move the camera or read back what was drawn.
_UI_: —
_Avoid_: API, test helper, cheat

**Snapshot**:
The whole of what a running page believes, frozen at one tick and handed over as a plain-data copy: the result, the state hash, the Faction's Observation, the interface's model, the picked set and the Commands it has applied lately. It is data and not a handle — writing through it reaches neither the Match nor the interface — and it holds an Observation and its drawing, never the rules' own state.
_UI_: —
_Avoid_: State dump, save game, screenshot (a screenshot is pixels; a snapshot is data)
