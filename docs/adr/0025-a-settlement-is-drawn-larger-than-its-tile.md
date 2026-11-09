# A settlement is drawn larger than its tile, under the fog, and picked by its drawing

**Partially superseded by [ADR-0030](0030-settlements-occupy-ground-and-show-their-works.md),
2026-10-25, for the agreed redesign.** A Settlement will occupy real ground rather
than remain a single simulation tile behind an enlarged drawing. The old fixed
sprite dimensions are not a constraint on the new design. Agreement between
drawing and picking, and the Observation / Fog of war knowledge boundary, remain
applicable. Remembered settlements will retain their last observed appearance,
clearly marked as memory and never updated without renewed sight; this supersedes
the neutral-silhouette-only memory decision below. Observed and remembered
appearance follows the portions actually seen, not automatic whole-settlement
revelation. Access and Garrison transitions follow ADR-0030; precise geometry and
depth treatment are delegated within that design. This amendment records design
decisions, not a delivered implementation.

**Amended by issue #67, 2026-10-21.** The approved comparative art work revises
the dimensions below to three tiles (48 pixels) for a minor settlement and four
and a half (72 pixels) for a Stronghold, so restored 1:1 infantry Figures do not
dwarf the structures. Draw bounds remain shared with picking, but clicks and
boxes now additionally test the generated alpha coverage: transparent ground
between roofs and vacant formation slots passes through to what is drawn behind
it. This supersedes the original bounding-box bargain recorded below; it avoids
an empty purchased slot intercepting a visible neighbouring Squad or structure.
Layer/depth priority, one authoritative Tile, filtered knowledge and memory
restrictions are unchanged. A completed Castrum known through the own Observation
joins the cached look, and memory strips that detail too. The comparative images
and rejected options are recorded in
[the #67 review](../reviews/issue-67-procedural-formations.md).

A settlement stands on **one tile** of the simulation — B1's `Site`, and the tile a Command names — and it is **drawn** at two tiles across for a minor settlement and three and a half for a Stronghold, centred on that tile. The rectangle it is drawn in is the rectangle a click picks: `render/settlements.ts`'s `siteRect` is handed to the settlement layer and to `input/selection.ts` alike, so a structure cannot be drawn in one position and picked in another. That is the same liberty `render/squads.ts` already takes with a block of men, which is a hundred and twenty soldiers standing up out of a single tile, and it changes nothing the rules can see: no footprint in the simulation moves, no route is priced differently, and `sim/` cannot reach this file.

**Where it stands in the stack is a decision, not a detail.** The world sorts its children by `zIndex`: the theatre at 0, the settlements on it at 1, the fog at 2, the dead at 10 and the living at 11. A settlement is *ground* — the veil over remembered ground has to fall on a Stronghold exactly as it falls on the field around it, which is why a remembered Stronghold is drawn as a stone silhouette under the fog rather than as a dimmed copy of its last frame above it. And a settlement is under the **men**: a Squad standing in a Stronghold must not be hidden behind its walls, so a Squad drawn over a settlement is a Squad picked before one, which is why `Pickable` carries the layer it is drawn in — the layer's own exported `zIndex` — and not only the row it stands on.

**What is remembered is the settlement, and nothing about it is claimed.** `ui/sites.ts` reads what a Faction may see from three things: the theatre's own list of settlements (`siteIdentities`, the same geography the minimap walks), the Observation (own settlements, contacts, and the fronts it holds, besieges or has an eye on — ADR-0020), and the fog the theatre is veiled with. A remembered settlement is drawn with **no owner's cloth, no gate, no damage and no ram**, because a contact records a settlement and not its walls; the drawing is re-tinted into the stone ramp and the fog dims it with the ground under it. Its *holder* is unknown for the same reason, and its panel says so. A wall's condition comes from `sim/siege.ts`'s own hit points and from nothing else, so the drawing cannot disagree with the mechanic about what "damaged" means.

**Considered Options**: baking the settlements into the theatre texture (`render/terrain.ts`) — rejected because a settlement's appearance is a function of live state (owner, wall hit points, breach, ram, memory), and the theatre is composed once per page; a one-tile sprite drawn where the settlement stands — rejected because at the lowest supported zoom it is the size of a resource marker and a Stronghold is not a marker; picking by the tile the settlement stands on — rejected because that is not what a Player sees: a click on a tower two tiles from the centre would miss, and a structure would be unclickable in most of its own drawing; drawing the settlements above the fog, with the memory dimming painted into the sprite — rejected because the veil is one blend and a second one written into the art would drift from it; picking with a second, tile-keyed table beside the drawing — rejected because two tables are two answers to "what did the Player click", and they would eventually disagree.

**Consequences**: a settlement's drawing is a cached sprite per *look* (`siteLookKey`: kind, owner, memory, gate side, gate, four walls, ram), so the layer uploads nothing while nothing changes, and two Strongholds in the same state share one texture. The breach of a wall is drawn as **two gaps either side of its middle** rather than one in the middle, because the middle of a wall is where its gatehouse stands and a single gap there would be hidden behind the gate. The rectangle a settlement is picked by is its art's bounding box, so a click on the ground *between* two roofs of a minor settlement selects it: that is the same bargain a Squad's block already makes (a click on the air above a marching Squad's men picks the Squad), and it is what keeps drawing and picking one declaration. A Player can select a settlement the Faction does not hold — an enemy Stronghold in sight, a minor settlement it remembers, one nobody holds — so the Selection now names settlements that are not the Faction's own, its panel reads only what the Observation and the fog allow (`ui/hud.ts`'s `knownSiteLines`), and the human Controller no longer prunes a settlement from the selection (`input/selection.ts`'s `stillHeld`): a settlement does not leave the field, and whether the panel may still describe it is the interface's question, not the Controller's. `sites()` and `showSettlements()` join the debug hooks for the same reason `squads()` and `showSquads()` exist: a test that compares the theatre pixel for pixel has to be able to take a Stronghold out of the picture.
