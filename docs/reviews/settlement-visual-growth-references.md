# Settlement growth and garrison — external references

Research checked on 2026-10-25 for the Stronghold / Minor settlement design
interview. These are precedents and design hypotheses, not accepted SPQR decisions.
The sources below are developer documentation, developer announcements or published
game source. No game was launched and no Chromium test was run.

## Age of Empires IV — modular growth and visible improvements

The Abbasid House of Wisdom advances through four Wings of Knowledge, which can
be completed in different orders and unlock further upgrades. This concentrates
progression in one landmark instead of requiring a separate landmark for each
age. The official civilization page illustrates the progression through the ages
and names the wings; it is used here as a modular-progression precedent, not as
proof that every researched technology has its own visible component.
[Source: official Abbasid civilization overview](https://www.ageofempires.com/games/age-of-empires-iv/civilizations/abbasid-dynasty/).

A more explicit visual-feedback precedent is the Season One patch: Spasskaya
Tower gained visible weapon emplacements for boiling oil, springald and cannon.
This is direct evidence of improvements represented on the building itself.
[Source: Season One release notes, Bug Fixes](https://www.ageofempires.com/news/age-of-empires-iv-season-one-update-release-notes/).

Update 9.1.109 also enlarged the appearance of several landmarks and wonders while
retaining their existing build-space. Visual size and occupied construction area
were deliberately changed independently.
[Source: Update 9.1.109, Landmark and Wonder Resizing](https://www.ageofempires.com/news/age-of-empires-iv-update-9-1-109/).

**Transfer hypothesis:** SPQR could combine a recognizable silhouette for each
Tier with individual additions for completed Works. Enlarging the drawing alone
is a viable option; it does not, by itself, solve troops crossing the apparent
walls or teach the Player where the real approach boundary lies. Those are SPQR
questions to resolve separately.

## 0 A.D. — a garrison leaves the field

The project's published `Garrisonable` source records the holder, changes the
unit to garrisoned state and calls `MoveOutOfWorld()` after admission succeeds.
Ungarrisoning obtains an exit position and restores the unit there; it can fail
when no exit position is available. This is an explicit inside/outside model,
rather than a field formation drawn over a building.
[Source: Wildfire Games generated source documentation, Garrisonable.js](https://docs.wildfiregames.com/javascript/simulation/Garrisonable.js.html).

The corresponding `UnitAI` source distinguishes approaching the target from
garrisoning it and checks the permitted loading range. This source demonstrates
approach and admission, not an animation of each soldier passing through a gate.
[Source: Wildfire Games generated source documentation, UnitAI.js](https://docs.wildfiregames.com/javascript/simulation/UnitAI.js.html).

For a different visual treatment, the official Alpha 27 announcement says that
wall garrisons were doubled so that two rows of units can be seen when fully
garrisoned. A garrison therefore need not be communicated only by a number or an
icon: selected defenders can visibly occupy the fortification itself.
[Source: official Alpha 27 announcement, Wall Buff](https://play0ad.com/new-release-0-a-d-alpha-27-agni/).

**Transfer hypothesis:** once a SPQR Squad is admitted, remove its field formation
and expose its presence through the settlement and its panel. Approach to the
Gate, wall defenders, exit ordering, capacity and what an enemy may learn remain
separate design choices. The cited generated documentation is a published code
snapshot, not a claim about the latest 0 A.D. release or its exact balance values.

## Stronghold — a castle is a collection of structures

The official Stronghold Legends editor guide places castle components as game
buildings: separate wall sections, stairs, gatehouses and towers, plus military,
civilian, food and industry buildings such as barracks, armoury and granary.
It describes the editor's building placement as using the buildings as they are
used in the game.
[Source: Firefly, Legends Editor Guide, Buildings Mode](https://fireflyworlds.com/downloads/legends-editor/index.html).

Firefly describes Stronghold 3's freeform construction as building castles with
individual layouts, alongside village simulation and siege warfare.
[Source: official Stronghold 3: Gold overview](https://fireflyworlds.com/games/stronghold3/).

**Transfer hypothesis:** this is the strongest precedent for making the built
settlement itself the Player's visible economic history. Applying its full
construction model to SPQR would entail consequential decisions about placement,
occupied ground and siege targets. An automatically arranged compound could
borrow the visual causality without introducing that entire model.

## Questions these precedents expose

- Does a larger Stronghold occupy more playable ground, or only more pixels?
- Does a completed Work add a component automatically, or does the Player choose
  a location whose position affects the Match?
- Does Tier replace the silhouette, enlarge the compound, or both? How is each
  individual Work still identifiable after that change?
- Does admission to a Garrison occur at the Gate or at an abstract range, and
  how is the inside state communicated after the field formation disappears?
- Which changes may an enemy see, and what survives only as a last known contact?

These are independent mechanisms that can be combined; the cited games do not
establish which combination SPQR should accept.
