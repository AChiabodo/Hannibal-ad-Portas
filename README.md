# SPQR — Hannibal ad Portas

A browser real-time strategy game of the Second Punic War: Rome against Carthage
on an abstract Italic theatre, with an economy, Squads that break rather than die,
and sieges that can be starved as well as stormed.

Everything on screen, in the speakers and on the HUD is produced by code: no
image, audio or font file is ever committed (ADR-0002).

Start with [docs/PLAN.md](docs/PLAN.md). Vocabulary lives in
[GLOSSARY.md](GLOSSARY.md), the control surface every Player is written against
in [docs/COMMANDS.md](docs/COMMANDS.md), and the decisions behind the plan in
[docs/adr/](docs/adr/).

## Requirements

- **Node 22.18** or newer (see `.nvmrc`; 22.18 is where Node runs TypeScript
  source directly, which is how the CLI does it — ADR-0009) and npm.
- Nothing else. A clean clone needs no manual step: `npm ci` brings in the
  toolchain and `npm run build` compiles from source.

## Commands

| Command             | What it does                                                          |
| ------------------- | --------------------------------------------------------------------- |
| `npm run dev`       | Development server on `http://127.0.0.1:5173/`, with the Atelier on `/atelier.html` |
| `npm run build`     | Type-checks, then builds the static site into `dist/`                  |
| `npm run preview`   | Serves the built site on `http://127.0.0.1:5174/`                      |
| `npm run check`     | TypeScript in strict mode, all three projects, no emit                 |
| `npm run lint`      | ESLint over the repository                                             |
| `npm run guard`     | The six fences: `pixi.js` under `render/`, no `Math.random`, transcendentals or ambient clock in the simulation, no committed asset |
| `npm run match`     | One whole Match headless as a JSON report, or — with `--map` — the map a seed generates, with no build step |
| `npm run bake`      | Writes the whole generated catalogue into `artifacts/` as PNGs, with the pixel hash of each, for inspection |
| `npm test`          | Unit tests (Vitest, Node)                                              |
| `npm run test:e2e`  | Browser tests (Playwright, headless Chromium, software WebGL)           |
| `npm run verify`    | Lint, check, guard, unit tests and build in one go                      |

The first `npm run test:e2e` installs Chromium if it is missing; CI installs it
with `--with-deps` in its own step.

## The fences

Six architectural rules are cheap now and expensive later, so CI enforces them
on every push:

1. **Nothing reachable from the simulation may import the rendering engine**
   (`pixi.js`). "The simulation" is what `src/sim`, `src/ai` and
   `src/content` can reach — ADR-0001 counts the AI as part of it even though
   PLAN §3 places it beside `sim/` — and `sim/` must run in Node so an agent
   can play a whole Match headlessly (ADR-0001, ADR-0003).
2. **`pixi.js` stays under `render/`, with `e2e/` the one other place it may
   appear.** No other file — not `art/`, not the CLI, not a test — may import
   it: the engine has no headless Node path, and the code that has to run in Node
   must not need it (PLAN §3, ADR-0001). `e2e/` is allowed because Playwright
   drives a real browser.
3. **Nothing anywhere may call `Math.random`.** The simulation is seeded through
   `xmur3` into `sfc32`, and a replay is a seed plus a command log (ADR-0006).
4. **Nothing reachable from the simulation may use `Math.sin`, `cos`, `exp`,
   `pow`, `log` or their family, or the exponentiation operator `**`.** ECMA-262
   leaves those implementation-approximated, so two engines may legitimately
   disagree, and a Match that replays differently in another browser is not a
   replay (ADR-0006). The operator is `Math.pow` under another spelling
   (`Number::exponentiate`) and is banned with it — there is no integer-exponent
   carve-out, because the approximation belongs to the operation — and
   `Math.sqrt` is deliberately allowed.
5. **Nothing reachable from the simulation may reach the ambient clock or
   entropy** — `crypto.getRandomValues`, `crypto.randomUUID`, `Date.now`,
   `performance.now`. A Match's only time is its tick counter, so a wall-clock
   read is a Match that cannot be replayed (ADR-0006). The ambient four are
   simulation-scoped on purpose: a test, a tool and the CLI's report may read a
   wall clock; a rule may not.
6. **No image, font or audio file is committed.** Every pixel, glyph and sound is
   generated from code, so a `.png` in the tree is never a small mistake: it is a
   binary nobody can review and a second source of truth that drifts from the
   generator the moment either changes (PLAN §2.1, ADR-0002). The fence reads file
   names, and says so: it does not look inside a file, and it cannot see an asset
   pasted into a source file as a string.

The walk behind the `Math.random`, transcendental and ambient checks is
syntactic, and it says so instead of pretending to be complete. It sees a global
spelled out — `Math.random`, `Math["random"]`, `Math?.random`,
`const { random } = Math`, `Date.now()` — and it does not see through an alias, a
`globalThis`, or a name built at runtime: `const M = Math; M.random()`,
`globalThis.Math.random()`, `Math['ran' + 'dom']()`, `const D = Date; D.now()`
and `new Date()` all pass the guard today. A green tick means the ordinary
spellings are absent, not that no other spelling exists.

`npm run guard` walks all six fences. On a breach it prints the offending file,
the line, and — for reachability — the chain that got there. One file can breach
two of them, which is why they stay separately labelled: naming the wrong rule is
worse than reporting both.

```
FAIL  guard: simulation boundary          1 violation(s), entry src/sim
        src/art/palette.ts:1:1  imports "pixi.js" — pixi.js must never be reachable from the simulation (ADR-0001)
          how: src/sim/index.ts → src/art/palette.ts → pixi.js
FAIL  guard: pixi.js outside render/      1 violation(s), allowed under src/render/, e2e/
        src/art/palette.ts:1:1  imports "pixi.js" — pixi.js exists only under src/render/ or e2e/ (PLAN §3, ADR-0001)
```

The rules are deliberately crude and deliberately loud. A guard that cannot see
through an import says so instead of staying quiet. None of the fences walks
*inside* a bare package import — the guard does not resolve `node_modules` — so
today's simulation imports nothing but its own modules, and the day it imports a
package, the fence sees the dependency rather than what is inside it.

## The deterministic core

The tick contract every later wave is built on (PLAN §3, ADR-0006):

- **Time is whole ticks**, `TICK_HZ` in `src/sim/clock.ts` — one constant, and
  everything else about time derives from it. A Match never sees a variable
  delta, which is half of what makes it reproducible.
- **State is integers only.** `serializeState` writes a state down canonically
  or throws, so a float in state fails a test instead of quietly changing the
  hash; `hashState` is the fingerprint a replay is compared by, and it covers
  the clock, the world and the random cursor together.
- **Randomness is seeded**: `makeRng(seed)` is `sfc32` through `xmur3`, drawing
  integers. The cursor is part of the state, so a diverging draw diverges the
  hash at the tick it happens.
- **A replay is a seed plus a command log** (`src/sim/replay.ts`), hashed at
  checkpoints — not a video. `createMatch({ seed, rules })` is the engine; the
  game rules own the `world` and receive it as a value, so they cannot move the
  clock or reseed the generator by accident.

The tick rate and the hash are decisions, not accidents: the plan fixes the rate
at 10 Hz, and a test records the hash of a fixed state so changing it is visible
in review.

## The map

A Match begins on a map nobody drew. `generateMap(seed)` — `src/sim/map.ts` —
is a pure function of its seed, returning a 96×96 grid of 16×16 tiles: terrain,
one or two rivers crossed by fords, resource nodes of grain, timber, stone and
iron, four to six capturable minor settlements, a Stronghold for each Faction,
and roads joining the nodes to one another. The map is integer state like
everything else the world will hold, so the day a Match's rules put it in
`MatchState` the tiles it starts on are covered by the state hash and a replay
begins on the same ones (ADR-0006); **B6 put it there**, in `economyMatchRules`,
with the settlements standing on it, and **C1 put the Squads that walk on it**
there beside them. The
world the CLI played before that was the clock (`src/sim/season.ts`), which is the
piece of the Match B5 could put in `MatchState` without the map.

The theatre is **organic, not mirrored**: the two halves do not carry the same
hills in the same places, and no pass reflects one side onto the other. Fairness
is therefore not a symmetry baked into the generator; it is a set of invariants
the generator satisfies on purpose, and `tests/sim/map-invariants.ts` is where
they are asserted:

- the same seed always produces the same map, tile for tile;
- the land is **one landmass**, and every Stronghold, minor settlement and
  resource node stands on it, so everything on the map is reachable from
  everywhere;
- every river runs from one edge of the map to the other — a river that stopped
  inside the map could seal a piece of land off — and carries at least **two
  fords a Squad can cross**;
- the two Strongholds stand at least **56 tiles apart**;
- the two halves of the theatre — the two sides of the perpendicular bisector of
  the two Strongholds — hold the same number of nodes of each kind, and their
  resource totals differ by no more than **20%**, resource by resource;
- the roads join every settlement and resource node to the network, and the
  network to the Strongholds, over tiles a Squad can walk on.

`npm test` walks the invariants over **a thousand seeds**, so a change to the
generator that breaks the world fails a test instead of failing a Match three
game-years in; the same file checks that a seed is the only thing the map is a
function of, over a quarter of the thousand, because that check hashes every map
it looks at. What is deliberately not an invariant is the look of the map:
which hill stands where, how a river wiggles, where the forests grew.

To look at a map without a browser — B3 draws one on screen, and this is the same
map it opens on — the CLI dumps it:

```
npm run match -- --seed 7 --map
```

```
seed 7 — 96×96 tiles of 16×16 pixels

Rome's Stronghold at (14, 70); Carthage's at (88, 89); 76 tiles apart
5 minor settlements · 2 rivers, carrying 9 and 4 fords

resources, Rome's half against Carthage's — the two sides of the line between the Strongholds:
  Rome      grain 64, timber 48, stone 23, iron 17
  Carthage  grain 65, timber 51, stone 23, iron 16

   012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789012345
 0 ............fffff~fffffffff^^^.......................................ffffffffffffff.............
 1 ............fffff~fffffffff^^^.^^...................................fffffffffffffff.............
 2 .............ffff~ffffffff^^^^^^^^..................................fffffffffffffffff...........
 3 ..............fff~f-t-------------^..................................fffffffffffffffff..........
 4 ...............ff~ftffffff^^^^^^^-^^.................................ffffftfffffffffff..........
 5 .................~ffffffff^^^^^^^i^^^................................fffff-ffffffffff...........
   … ninety rows of map …
95 ............~~..................................^^^^^^^^^-s.....................................
legend: . plain   ^ hill   f forest   , farmland   ~ river   = ford   - road
        R Rome's Stronghold   C Carthage's Stronghold   o minor settlement
        g grain   t timber   s stone   i iron
```

The dump is a reading of the map and not a second opinion about it: it is
byte-stable for a seed, so two runs diff cleanly, and it holds no timing, no
path and no wall clock, the same as the Match report.

## The strategic clock

Time has a shape. A game year is four **Seasons** of three and a half minutes
each — `SEASON_TICKS` in `src/sim/season.ts` — and the calendar is integer state
like everything else, so the state hash covers it and two replays cross the same
boundaries on the same ticks. Spring and summer are the campaign season, autumn
brings the harvest and winter brings Attrition; those last two are the **only
hooks another system needs**, so no system counts the year for itself:

```ts
const changes = advanceCalendar(world.calendar, tick); // once per tick
announceSeasons(changes, economy.seasons, attrition.seasons);
```

`advanceCalendar` is handed the tick being *left* — the same argument a rule's
`step` receives — and puts the calendar where the Match's own clock says it is.
It reports; it does not announce. `announceSeasons` hands the same report to
every subscriber, so the economy and Attrition both hear the year turn and
neither can be starved by whoever advanced the clock first. A boundary therefore
falls on the same tick in every run, a second reading of the same tick reports
nothing, and a rules step that missed a tick catches up without swallowing a
harvest. A Controller reads the season as a word and the year as a number from
its Observation; the index the world stores never leaves it.

A Match plays at **three speeds** — 1x, 2x and 3x — and can be **paused**, and
both are the driver's business rather than the simulation's: they change how much
wall time a tick costs, never what a tick does, so a paused Match and a fast one
are the same Match on the same seed (`src/sim/pacing.ts`). Orders given while
paused are held by the Player's Controller and applied on the first tick after
the resume, in the order they were given, so thinking costs nothing. Pausing is
idempotent, and the time spent paused is not banked and then replayed as a burst.

A human Match has no time limit. A **headless Match is bound to three game
years** — `HEADLESS_TICKS`, 25 200 ticks, 42 minutes of Match time — because a
Match that can never end is a test that can never finish (ADR-0010). The CLI's
default bound is exactly that, and its default Match is the one with the theatre
and the economy in it.

## The economy

A real economy with nobody to click (B6, ADR-0005). There are no worker units
and no supply lines: a **settlement** holds a pool of **population**, and the
pool is *allocated* — staffed onto the settlement's **works** in the order it
raised them, and whatever is left onto its **land**. Production follows that
allocation and nothing else, which is why a work nobody can staff neither builds
nor yields.

```ts
const allocation = allocate(settlement, landCapacity(map, settlement));
const produced = seasonYield(settlement, allocation, season); // + harvest in autumn
```

- **Four resources, held per settlement.** Grain, timber, stone and iron
  accumulate in the settlement that produced them, up to what it can store; there
  is no shared national pool. A settlement's land is the ground around it —
  farmland feeds, forest yields timber, hill yields stone — and the **resource
  nodes** the map put there add their own amount on top, which is what makes a
  node worth marching to. Iron has no terrain of its own, so above the base it
  comes from a node or from a mine.
- **Denarii, held once per Faction.** One treasury, taxed from the people a
  Faction's settlements hold and from its markets, and capped like a war chest.
- **Construction is a labour allocation plus a timer.** Starting a building pays
  its cost out of the settlement's stock and appends a work; the work is staffed
  out of the population and counts its ticks down, and when the timer runs out it
  stands and produces. There is no construction scene, on purpose (ADR-0005).
- **Three tiers, and no technology tree.** `villa` raises a settlement to its
  second tier and `forum` to its third, and a Squad type states the tier it
  needs: a tier-2 Squad cannot be recruited in a tier-1 settlement. The
  progression is the tiers.
- **Payroll every Season.** A Faction owes its Squads' Payroll each Season out of
  its treasury; a Squad it cannot pay loses morale and, after enough Seasons
  owed, **deserts**. A paid Squad recovers a little of what it lost, so a rough
  patch is survivable and a permanent one is not.
- **The autumn harvest is a peak.** Ordinary production runs every Season
  (`onSeason`); the harvest arrives on top of it on the autumn boundary
  (`onAutumn`), so the grain it brings in is a number a reader can see apart from
  the Season's own work.

`economyMatchRules` joins B1's map, B5's clock and B6's economy in one
`MatchState` — the first Match whose hash covers the tiles it begins on — and
`observeEconomy` is what a Faction reads of it: its settlements and where they
stand, their tier, people, stocks, land and works, its treasury, and its Squads
with the Payroll terms they are charged on. An enemy's settlement is not in the
Observation, which is the one filtering B6 can do before fog (B4) arrives.

The plan's own test of the thing is a Match left alone: over three game years an
idle economy neither **stalls** — production in year three is still real — nor
becomes **infinite** — every population, stock and treasury stays inside its
ceiling. That is asserted end to end in `tests/sim/economy-match.test.ts`, and
its three years are what the CLI's golden hash covers by default.

## Movement

A Squad is the atomic unit (ADR-0004): one entity, and one block of soldiers on
one tile — the settlement that raises it pays for it (B6), and from there it
walks, faces one of four ways and holds a formation. The two halves B6 left apart
on purpose are one interface now: `economy.ts`'s `Squad` carries its type, its
home, its Payroll and its morale, and the `Block` C1 gave it carries where it
stands, how many men are left, what shape it holds, the way it faces and the
route it is walking.

The men inside it are drawing and nothing else — they are never simulated one at
a time — and the block's frontage, its depth and the places its men stand are
*derived* from the formation and the men left, so turning a Squad cannot
rearrange it and losing a man loses the last one rather than shuffling the block
(C2 draws exactly that list). A line is twelve files abreast and a column three,
whatever the size of the Squad, and a Squad ordered somewhere turns to face the
way it is about to go on the tick it is told.

Three files carry the rest (`src/sim/route.ts`, `squad.ts` and `movement.ts`):

- **What a tile costs.** Road 2 ticks a tile, plain 4, farmland 5, hill and
  forest 8, a ford 10, and a river is not crossed at all. The same table is the
  search's edge weight and the Squad's marching speed, and a tile is paid for
  *before* it is entered, so a route costs exactly the ticks it was costed at —
  the destination included — and the way chosen is the way that arrives first.
  The price is divided by the *walker's* pace (C4): a horse's tile is
  `ceil(cost / pace)`, and the search weighs a route in the same currency, so a
  fast Squad is not merely quicker along a footsoldier's road.
- **The way there.** A* over the 96×96 grid, four-connected, with a Manhattan
  heuristic times the cheapest tile — admissible and consistent, so a tile
  leaving the frontier is settled. Every number is an integer and ties break on
  the order tiles were queued, never on a heap's internal shape: the same
  question has the same answer on every engine (ADR-0006).
- **Routes are not worked out twice.** `createRouteCache(map)` remembers what it
  searched on one theatre — a bounded memory, forgotten least-recently-first,
  and one route per *pace*, because a horse's quickest way is not always a
  footsoldier's — and an order to the tile a Squad is already walking to is not a
  new order at all. The memory is derived rather than state, so whether a route
  happened to be remembered cannot move a hash.

A Squad ordered to a tile no way reaches walks nowhere, forgets nothing and
remembers why: the order is refused with one of three reasons — the tile is not
on the map, it is water, or the land does not reach it — and the next order that
is taken clears it. `observeEconomy` reports the reason in words, which is what
an interface shows a Player (`refused`), beside the tile the Squad is still
walking to and where it stands.

The CLI can play a harness Match that is nothing but movement — a dozen Squads,
six a Faction, mustered at their own Stronghold and ordered across the theatre to
the other one:

```
npm run match -- --seed 1 --ticks 600 --rules march
{
  "seed": 1,
  "ticks": 600,
  "outcome": "clock",
  "winner": null,
  "reason": "the Match reached its tick bound of 600 ticks without a decision",
  "commands": 2,
  "hash": "dcc3c947981d98f7"
}
```

Two Commands, twelve Squads, and a hash CI gates: it covers the map in state,
the routes worked out over it, the terrain costs walked, every turn taken and
the economy's half of every Squad beside them, so a change to any of it is a
decision in review rather than a silent one. `musterSquad` is a scenario's way
in — recruitment is the economy's — and the `march` Match exists because a
ticket that says "a dozen Squads moving at once" should be something the
repository runs rather than something it claims. Since C3 the two forces meet in
the middle of that theatre, so the hash covers the fight as well as the march:
the survivors are the men who got through, and every one of them still stands on
the Stronghold it was sent to.

C4 adds a second harness Match, `--rules roster`, which fields both Factions'
whole rosters — the nine types of `content/squads.ts`, the elephant included —
and sends them at each other. Its hash is the one number that covers every
strength, morale, arm and pace in the tables, so a balance change moves it:

```
npm run match -- --seed 1 --ticks 600 --rules roster
{
  "seed": 1,
  "ticks": 600,
  "outcome": "clock",
  "winner": null,
  "reason": "the Match reached its tick bound of 600 ticks without a decision",
  "commands": 2,
  "hash": "d77285a51c049c74"
}
```

## Combat and morale

Two Squads that touch fight, and what they fight over is not a health bar. Each
round of contact moves the same two quantities on both sides — how many men are
left, and how close the Squad is to breaking — and a Squad that breaks runs
rather than dying to the last man (ADR-0004, ADR-0015). Everything the plan
lists as a lever moves one of those two numbers and nothing else:

| Lever | What it does |
| --- | --- |
| the matchup matrix | `spear > cavalry > light > archers > spear`, the sword even against all; an advantage is ×3/2 and a disadvantage ×2/3 |
| flank and rear | more men and more morale shock, and the flanked Squad strikes weakly back, because its front faces the wrong way |
| terrain | a hill is harder to assault, a ford disorders whoever stands in it, cavalry in a forest cannot charge |
| fatigue | a march and a fight both cost; a spent Squad strikes for 40% of a fresh one |
| ammunition | the first volleys add men and shock; after that the type fights with its arm alone |
| Supply | a Squad cut off from its Faction's country loses morale at every Season boundary |
| Payroll | a Season in arrears is a Season of morale lost, and a Squad that breaks sooner |

**One round, resolved at once** (`src/sim/combat.ts`). A round is five ticks —
half a second — and every blow in it is computed from the state as the round
*began*, then applied, so it cannot matter which Squad the list walked first.
Nothing draws from the Match's generator: a fight is a pure function of the
world, a replay reproduces it, and a balance change is a measurement. Every
modifier is a ratio of whole numbers applied in a fixed order, which is why the
test that predicts a number can work it out by hand.

**Breaking, running, rallying.** A Squad at no morale has *routed*: it runs for
the nearest settlement its Faction holds, strikes at a third of its weight,
gives no shock at all, and cannot be ordered anywhere — no manual rallying, no
micro-recovery. It also cannot be annihilated while it still has a route to
walk: its strength floors at one man for as long as there is somewhere to run,
which is what "breaks rather than dies to the last man" means mechanically. Once
the ground behind it is quiet it recovers a point of morale a round and forms up
by itself. That is the only fast recovery there is: a Squad in good order gets
its nerve back from being paid (`chargePayroll`), not from waiting.

**The dead are residue** (`src/sim/residue.ts`, `src/render/corpses.ts`). The men
a round costs are recorded *beside* the Match, in a `WeakMap` keyed by the
economy: one mark per round per Squad, on the tile they fell on, drawn as the
death frame of the figure they were, faded over the last seconds of thirty and
then swept away. None of it is in `MatchState`, so a Match that recorded a
thousand corpses hashes as the Match that recorded none — which is the ticket's
own criterion, asserted directly. The page draws only the ones its own fog is
looking at (`visibleCorpses`): the residue list holds both Factions' dead, and a
corpse on a tile nobody has an eye on is a fact about the enemy the Faction has
not paid for.

**What C3 does not own.** No generals or heroes; no ram, which is siege (C5); no
manual rallying. Being cut off is read for now as "no settlement the Faction
holds within `SUPPLY_RADIUS`", charged with Payroll at the Season boundary — C6
replaces that inference with real Territory and per-Season Attrition, and
`inSupply` is the one function that moves when it does.

The Observation carries the fight to the Faction that is in it: `morale`,
`fatigue`, `ammunition`, whether the Squad has `routed` and whether it is
`engaged`. Contact is one tile, which is inside any Squad's own eyes, so the fog
is not being spent by it. The HUD prints the figures, and reads a routed Squad as
*In rotta* rather than naming an order it is not obeying.

## The Carthaginian roster

The other half of the game (C4). `content/squads.ts` now carries both rosters,
and they are not two sets of numbers: Rome's three lines are disciplined,
durable and slow to replace, and Carthage's six are a mercenary coalition —
cheap to raise, brittle in morale, dearer to keep and, in the elephant, unlike
anything Rome fields at all.

| type | tier | men | arm | morale | volleys | pace | Payroll |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `hastati` | 1 | 120 | sword | 10 | 4 | 1 | 3 |
| `principes` | 2 | 120 | sword | 12 | 4 | 1 | 4 |
| `triarii` | 3 | 100 | spear | 14 | 0 | 1 | 6 |
| `libyan-spear` | 1 | 120 | spear | 9 | 0 | 1 | 3 |
| `gaul` | 1 | 140 | sword | 6 | 0 | 1 | 2 |
| `iberian-sword` | 2 | 120 | sword | 11 | 2 | 1 | 5 |
| `balearic-slinger` | 2 | 90 | archers | 8 | 8 | 1 | 4 |
| `numidian-horse` | 3 | 60 | cavalry | 10 | 6 | 2 | 4 |
| `elephant` | 3 | 24 | cavalry | 16 | 0 | 2 | 8 |

**A pace is a type's own.** `pace` is a whole number of tiles' worth of ground
per tile's cost: `1` is a man on foot and `2` is a horse. `route.ts`'s
`paceCost` divides the ground's ticks by it and rounds up, the search weighs
every route with it, and the route cache remembers one answer per pace — so the
Numidian horse and the elephant are quicker *and* routed as what they are. A
faster Squad is the whole of "light mobile cavalry rather than a line to hold":
the Numidians are faster than anything Rome fields, carry six volleys and are
fewer men than any Roman line, so they harass and do not stand. The rest of the
harassment — refusing a line, falling back before contact, keeping the last
known enemy current — is what a Controller does with those numbers, and it is
D3 and D4's; C4's half is the type that is worth doing it with.

**Nine types, five arms.** A type's `arm` is its row and column in the matchup
matrix, and more than one type may carry the same one: the Libyan spearman and
the triarius are both `spear`, and the Numidian horse and the elephant are both
`cavalry` — the mobile arm, which beats light troops and is broken by spears.
The elephant's distinctness is not a matrix row of its own but its figure, its
pace, its strength of staying power and its morale above every Roman line's;
C4's criterion is that every type *has* a matchup behaviour, not that all nine
differ, which five arms and nine types could not do.

**A Squad of a single figure.** An elephant is one figure — `figures: 1` — whose
`strength` of 24 is the staying power that figure is worth, which is what lets a
single beast weather a round or two of a Roman line instead of dying to the
first blow. `figuresOf(type)` is the one place the two numbers are tied, and the
Observation carries both, so a drawing code lays out a beast as one figure and a
body of men as one figure per man; `render/squads.ts` uses the figures and the
fight uses the strength. Everything else about an elephant is an ordinary Squad:
it is recruited, paid, ordered, flanked and routed like any other (the ticket's
own "an ordinary Squad type with an extraordinary figure").

**The silhouette is the design and the colour is the confirmation**, and C4 is
where that rule is a criterion rather than a preference: every type has to be
tellable from its Roman counterpart **in greyscale**. So the nine types have no
shield in common — the parma, the scutum, the hoplon, the thureos, the
little caetra, the tall gaulish wall, the two who carry none — and the weapon
and the head say the same thing a second time: a pilum, a gladius, a hasta, a
plain spear, a curved falcata, a longsword that reaches the top row, a sling, a
fistful of javelins; a cap, a crest, a transverse crest, and a bare head. The
rider is drawn on a horse under him, and the elephant is not a paper doll at all
but a beast with a trunk, ears and a trapper in its Faction's cloth.

**The whole roster is on the Atelier's plate.** `art/figures.ts` names both
rosters (`FIGURE_NAMES`), gives each figure the Faction whose cloth it wears
(`FIGURE_FACTION`), and `figureEntries()` composes every one of them in four
directions and all six frames, so the Carthaginian roster is looked at exactly
the way the Roman one is — and `tests/art/figures.test.ts` tells every pair of
the nine apart in greyscale, by luminance and by pixels of ink, rather than
trusting the palette.

## Siege

The other way a Match ends (C5). A settlement falls either to an **Assault** —
fast, expensive, and needing the ram, which only Rome can build — or to a
**Blockade**, which is slow and cheap in lives, starves the place into surrender,
and is broken by the besieged Faction's field army. The two are alternatives and
not stages, and Carthage has no siege engine at all, which is the historical
asymmetry and the plan's largest balance risk (ADR-0008, ADR-0018).

| path | pace | costs | broken by |
| --- | --- | --- | --- |
| Assault | a fight: a round a second, under a minute to the Stronghold | denarii for the ram, men and nerve under the walls, the ram itself | a garrison strong enough to break the ram, and the wall |
| Blockade | Seasons: about three to an empty granary, ten minutes of Match time | almost nothing in lives | the besieged Faction's field army, within `RELIEF_RADIUS` |

**Walls are structures, not a health bar** (`src/sim/siege.ts`). A Stronghold
carries a **gate** and four stretches of **wall**, one to a side, each with its
own hit points, and a **breach** is any one of them broken. The ram goes for the
gate; the men under the walls work at a wall too, at about a third of the speed,
and the walls cost them lives and nerve while they do it. That is the whole of
"an assault without a breach is possible but punishing": an assault can be issued
before anything is broken, waiting for the breach is the sane order of business,
and a ram the garrison has wrecked pays for itself in blood. Walls do not repair,
so a failed assault leaves the place weaker for the next one.

**The ram** is laid down on the spot, paid out of the Faction's one treasury,
built over `RAM_BUILD_TICKS`, and it is the only thing that shields an assault —
while it is still being built the walls cost men and morale every round, and once
it is at work they cost nothing. It is also **vulnerable**: the garrison's files
take it apart at `RAM_FILES_PER_BLOW`: one Squad's twelve files need twenty
rounds to break a ram and the gate needs eight, but three Squads break it in
seven and the gate stands — so a manned Stronghold turns an assault into an
escalade that pays for itself in blood. `canAssault` is the whole of "Rome's
alone", and ADR-0008's escape hatch — *give Carthage a ram* — is that one
function.

**A garrison is a posture, not a second army.** A Squad told to `garrison` stands
at its settlement's centre but is *inside* the walls: the contact rules skip it
(`Block.garrison`), so an enemy at the gate fights the wall and not the men
behind it, while the settlement's own supply, Payroll and eyes still cover it. A
move order takes it out again, which is the whole of how a garrison sallies. A
garrison that breaks in the storm **surrenders** rather than running through the
men who just came over the wall, and one that is starved sheds nerve each Season
until it slips away in the night.

**A blockade uses the settlement's own granary.** The Siege supplies the
predicate the economy already needed — `produceSeason` and `harvest` take a
`Supplied`, and a blockaded settlement works no land, earns no tax and grows no
people. What its granary holds is what it lives on, and every Season of blockade
spoils `BLOCKADE_GRAIN_LOSS` of grain and takes `BLOCKADE_POPULATION_LOSS` of its
people; a town with no grain and nobody left on its walls opens its gates. A
*field* army of the besieged Faction within `RELIEF_RADIUS` lifts the ring — the
garrison is the thing being starved, so only men outside it can threaten the
besiegers — and the besieger has to close the ring again.

**A minor settlement is taken by holding its centre**, and nothing is razed. An
open settlement has no wall to break and nothing to starve: a Squad that stands on
its tile, uncontested, for `CAPTURE_HOLDS` checks takes it, and its people, its
works and its stocks stay. Only a Stronghold's fall ends the Match, and the result
names it as the reason:

```
npm run match -- --seed 1 --ticks 9000 --rules assault
{
  "seed": 1,
  "ticks": 251,
  "outcome": "victory",
  "winner": "rome",
  "reason": "rome won the Match: the carthage Stronghold fell to an assault",
  "commands": 2,
  "hash": "f854cb39e4a9e78d"
}
```

`--rules blockade` is the same Match won the other way, in Seasons rather than in
a fight, and its reason says so:

```
npm run match -- --seed 1 --ticks 9000 --rules blockade
{
  "seed": 1,
  "ticks": 6300,
  "outcome": "victory",
  "winner": "rome",
  "reason": "rome won the Match: the carthage Stronghold fell to a blockade",
  "commands": 2,
  "hash": "9f77bb70706b1b68"
}
```

Two whole Matches won headless, one by each path, with the fall of a Stronghold as
the golden hash: a change to the walls, the ram, the starvation or the verdict
moves those numbers and has to be a decision in review. The blockade's 6300 ticks
against the assault's 251 is the asymmetry the ticket is about, in one pair of
numbers — three Seasons of siege to twenty-five seconds of storm.

**What C5 does not own.** No siege towers, multiple ladders, mines or artillery:
the plan excludes them from v1. No decision about when to assault and when to
blockade, which is D5's; `observeSiege` carries the walls, the breach, the ram,
the hold and the garrison for it to decide with, and nothing more. The page still
plays the economy Match, so a wall is something the CLI and the tests exercise
rather than something drawn on screen yet: putting the walls in the interface is
B7's and E4's, and `observeSiege` is the projection they will read.

## The first pixels

Everything on screen — and, later, everything in the speakers and on the HUD —
is generated by `src/art/`, a library with no engine in it, which is what lets a
pixel be tested, baked and compared in Node with no browser anywhere (ADR-0002).
The page itself draws the theatre of the next section; the pipeline that puts it
there is B2's.

**One type crosses the pipeline**: `PixelBuffer`, a `Uint8ClampedArray` of RGBA
with integer channels and whole dimensions (`art/pixel-buffer.ts`). A generator
takes one and returns one; the catalogue is a list of them; a pixel-hash test
pins them; `render/stage.ts` turns one into a texture. PixiJS does not accept an
`ImageData` and has no headless Node path, so a second pixel type would be a
second, untested implementation of every generator.

**The palette is derived, not declared** (`art/palette.ts`). Nine bases, and six
ramps of seven shades computed from them by integer arithmetic: `-100` is black
and `+100` is white for every base, and the middle shade of an odd ramp is the
base exactly. Generators pick from ramps, which is how a stone wall, a hill and a
HUD frame cannot drift into three different greys (PLAN §8). `water` joined the
bases with B3: a river painted out of the stone ramp reads as wet rock, and a map
is not allowed to have that confusion.

**The font is data** (`art/font.ts`). Seven rows of five pixels per letterform,
written as 5-bit numbers — `0b01110` is `.###.` — for every printable ASCII
character, plus the twelve accented vowels Italian writes. An accent lives in a
two-row band *above* the letterform rather than inside it, so `à è é ì ò ù` are
their letters with a mark over them and share a baseline with `a e i o u`; the
band is why the plan's 5×7 cell survives a language that accents vowels. Text is
drawn at any whole-number magnification, which is the large-numeral path a
resource readout needs.

**The catalogue is the whole of the art** (`art/catalogue.ts`): one named entry
per glyph (`glyph:U+00E0`), per ramp (`ramp:bronze`) and per terrain tile
(`terrain:forest:13`, `road:5`), and one plate that lays them all out. The Atelier
page renders that plate — `/atelier.html` in `npm run dev`, `atelier.html` in
`dist/` — at 1×, 2× and 4×, on neutral grey, captions and all in the generated
font. Art nobody can see is art nobody can fix, and the page is also what an agent
inspects instead of guessing at pixels from source.

**The bake step writes it out** (`npm run bake`, `src/cli/bake.ts`). Baking is the
middle of the plan's pipeline — generator, bake, texture — and its value is
inspection rather than loading: the runtime regenerates from the same library, so
the files land in the gitignored `artifacts/` and the command prints the *pixel
hash* of each one. That hash is what CI holds: the PNG encoder
(`src/cli/png.ts`) is code like everything else, tested by decoding what it wrote,
and what is pinned is the pixels rather than the compression. The game never reads
these files back (ADR-0002).

**The camera is arithmetic** (`render/camera.ts`): a whole-pixel position and a
whole-number zoom, with no smoothing and no zoom anchored at a fractional point,
because a camera at `x = 0.5` samples between texture pixels and softens every
edge on screen. `render/stage.ts` is the only place a buffer becomes a texture:
RGBA uploaded as RGBA, sampled `nearest`, and the camera applied as an integer
translation and scale.

The page publishes its state on `window.__SPQR` (ADR-0003), which is how a test
checks the renderer against the generator: it generates the art *in Node*, asks
the page for the pixel the camera says is there, and compares the two. Two
independent sides of the pipeline, neither able to pass alone — and the same hook
an external agent will inspect the game through.

Pixel output is pinned by hash (`tests/art/pixel-hash.test.ts`): one number
covers the whole Atelier plate, and per-artefact numbers say which glyph, ramp or
terrain tile moved. A change to a generator is a line in review, not a surprise
three waves later.

## The theatre on screen

`npm run dev`, and the page draws the map B1 generates from seed 7: pannable with
a drag, zoomable with the wheel, at whole-number magnifications only — and, since
B4, under the fog of the Faction the player controls (see *Fog of war* below).

**Terrain is generated, like everything else** (`art/terrain.ts`). Seven materials
— plain, hill, forest, farmland, river, ford, road — each a 16×16 tile of
dithered colour from the palette's ramps, and each a function of a pixel's
coordinates *inside its own tile* and of nothing else: two tiles of the same
material side by side have no seam to hide, and a tile split across four cells can
be put back together exactly.

**A rendered tile is chosen by the dual grid, not by its eight neighbours.** A
tile that knows its eight neighbours needs forty-seven sprites, and forty-seven
hand-tuned shapes is forty-seven chances to ship an incomplete set. Instead the
map is rendered on a grid offset half a tile from the logical one, so each
rendered *cell* covers the corner where four logical tiles meet: the cell's
appearance depends on a four-bit mask of which quadrants share its foreground
material, and the sixteen masks are **five tiles plus rotation** — `solid`, `edge`,
`outer` (a promontory), `inner` (a bay) and `saddle` — with the empty mask being
the background material's own tile. `TERRAIN_VARIANTS` is that table, *built and
checked* rather than typed out: every mask is a rotation of exactly one shape, and
a test walks all sixteen proving it, so a mask with no variant is a failing build
rather than a hole in the map.

**A transition is a style, not a sprite.** Each material carries an outline, a lit
band inside it and a band outside it on the neighbour — the shore a river leaves
on the land, the moss under a forest's edge, the shoulder of a road. Where two
materials meet, the minority corner is chamfered, so a coastline turns rather than
steps; where three or four meet there is no single other side to curve against, so
the corner stays square and every quadrant keeps its own texture. A cell is four
quadrants, so even a four-material corner is right rather than approximated.

**Roads are autotiled by their connections** — the other half of the same idea.
The sixteen four-neighbour masks are six canonical pieces (isolated, end, straight,
corner, tee, cross) and `roadTile` draws one and turns it. A ford is water, so a
road's path stops at each bank and the ford is what crosses: the map says so, and
the renderer does not argue with it.

**Resource nodes are markers, not ground** (`art/nodes.ts`). B1 places them on the
terrain that suits them, and the ticket asks that they stay legible at every zoom
level, so each kind is a small pile drawn over the map: a tall sheaf of grain, two
flat logs, a heap of stone, a diamond of iron. Legibility at 1× is a question of
*silhouette* before colour — the plan's own warning is that a grid of coloured
pixels reads the same at low zoom whatever the colours are — so no two of the four
share a profile, and the colours only confirm what the shapes already say.

**The whole theatre is one texture** (`render/terrain.ts`). The map is composed
once, on boot, into a 1552×1552 `PixelBuffer` — the logical map translated by half
a tile, with a half-tile margin of edge tile around it — and drawn as a single
sprite under the camera. Panning and zooming move one container: no tile is culled
and no sprite is created, so the work per frame is the same at the corner of the
map as at its centre. That is what the ticket's "panning and zooming across a full
96×96 map stays responsive" is built on — a property of the design rather than a
hope about the engine, and measured rather than asserted: a browser test moves the
camera two hundred times inside the page and holds the total to a couple of
seconds, which a per-frame recomposition of the map could not come near.
`render/view.ts` holds the numbers that decide the page (seed, zoom,
viewport, whose fog it shows) where a Node test can reach them without loading
PixiJS.

**The camera can zoom about a point** (`render/camera.ts`). B2 left that out on
purpose, because a zoom centred on a fractional cursor puts the camera between two
pixels; `zoomAbout` asks which stage pixel a screen point is showing, then puts
that pixel back under it, and the answer is whole because `screenToStage` is whole
in and whole out. `clampTo` is the other half of a camera a player moves: the
viewport stops at the edge of the theatre instead of showing the page behind it.

**The Atelier shows the terrain beside everything else.** The catalogue now
carries every material's own tile, one row of sixteen dual-grid variants for each
material that can be a boundary's foreground, the sixteen road connections and the
four resource markers — 107 more named entries, laid out in rows on the same plate
as the glyphs and the ramps, and baked like the rest by `npm run bake`. A row shows
its material against the ground it crosses, which is how a coastline is judged
rather than a tile in isolation, and the markers stand on the plate's neutral grey
because reading on nothing is exactly the question a marker has to answer. Plain
has no row of its own because plain is the ground everything else is laid over: it
is never the foreground of a boundary, and its boundary with a hill is the hill's
variant seen from the other side.

## Fog of war

A Controller may only know what its Faction has seen (ADR-0003), and since B4
that is a fact about the code rather than a promise about discipline: the
Observation is the Faction's fog, and the fog holds nothing else.

**Three states, two grids per Faction.** A tile is *unexplored* (no eye has ever
covered it), *remembered* (an eye covered it once, and the terrain it had then is
still there) or *visible* (an eye covers it now). The three are answered by two
`Uint8Array`s per Faction (`src/sim/fog.ts`): the terrain as last seen, with
`UNSEEN` where nobody has looked, and a flag per tile for what is in view. The
memory grid answers both "has this been seen" and "what is believed", so a
seen-flag beside a terrain grid cannot drift out of step with it.

**Vision is a disc of tiles around an eye** — a Squad, a settlement — compared
squared, in integers, so a radius is exact and no engine has to agree about a
square root. There is no line of sight and no elevation to block it: the theatre
has no playable height (ADR-0007), so a hill hides nothing. `refreshVision`
takes the eyes as an argument and knows nothing about where they came from;
`eyesOf` is the one place that says which of a Faction's settlements are looking
— today the Stronghold it opens in — which is why the day Squads see too, or a
settlement changes hands, is a change to one function.

**The fog is memory, and memory is state.** A Squad that marches away leaves its
terrain behind it: what is in view is recomputed on every tick, and what has been
seen is written once and kept. That is why the grids are in the state hash
([ADR-0013](docs/adr/0013-the-fog-is-memory-and-each-faction-owns-its-own.md)) —
what a Faction has seen decides what it can decide, so two Matches whose memory
differed would not be the same Match. Each Faction owns its own grids, built by
`createFogs` as two separate arrays, and a test asserts that one Faction's
knowledge neither appears in the other's Observation nor in the other's part of
the canonical form.

**Last known contact.** `observeContacts` remembers an enemy at the tile it
stands on *when the Faction can see it*, and keeps that tile after the enemy
marches out of view: the memory is where it was, with the tick it was seen, and
not a live position. The fog does the filtering, so a rule cannot hand a Faction
knowledge its eyes never reached; the fog also never forgets on its own, because
how long a stale contact is worth planning against is the AI's question (D4) and
`forgetContacts` is how a rule says a contact is gone. Squads stand on the
Faction's tiles since C1 and own their ids, so what a Faction *could* see of the
enemy exists at last — but the fog and the Squads are still two world shapes
(`fog-match.ts` and `economy-match.ts`), and joining them into one Match is C2's
ticket: the eyes a Squad has, and the contact its marching makes, arrive with
that join rather than with either half.

**The debugging inspection mode is not a Player.** `inspectionView` answers with
the whole theatre known, and with a `FogView` — which has no `decide`, so it
cannot emit a Command. `tests/sim/fog.test.ts` makes both of those compile
errors, which is the strongest thing a test can say about a shape.

**Where it is wired.** `src/sim/fog-match.ts` is the Match the fog lands in: a
world holding B1's map and both Factions' fogs, a `step` that recomputes vision
on every tick from the settlements each Faction holds, and an `observe` that
projects the looking Faction's fog and nothing else. It is what `npm run match --
--rules fog` plays, and its golden hash is the one CI gates. `src/render/fog.ts`
draws the same object: an opaque cover over unexplored tiles, a translucent veil
over remembered ones, nothing over the tiles in view.

The fog follows the *logical* tile grid, not the dual grid B3 autotiles on:
vision is decided per tile, so a tile's whole 16×16 square carries one state and
the half-tile margin around the theatre takes the edge tile's, clamped the way
the terrain clamps its materials. A fog painted on the rendering grid would let
one tile's state leak half a tile into its neighbour's, which is a lie about what
the Faction can see.

The game page opens under the viewed Faction's fog — the ground its Stronghold
watches, and black beyond it — with two hooks that drive it the way a tick would:
`lookFrom(x, y)` puts a watch on a tile (the same call a tick makes with a
Faction's real eyes) and `inspect(true)` turns the inspection mode on, which is
the frame `sim/fog.ts`'s `inspectionView` describes. The browser tests walk one
tile through all three states with those two calls and compare the GPU's pixels
against the image composed in Node, at two zooms and after two hundred camera
moves. The same `FogView` is what B7's minimap is drawn through, so the corner of
the screen and the map under the camera are two drawings of one memory.

## The interface

The window a Player watches all of it through, in Italian, and the first thing
built to be *read* rather than merely rendered (B7). `src/ui/` is the interface
and it has no engine in it: the HUD is a `PixelBuffer` composed in Node, so what
it says and what it draws are both testable without a browser, and the page does
nothing but upload it.

**One string table, and no hard-coded text** (`ui/strings.ts`). Every word a
Player reads is a key — `ui.treasury`, `resource.grain`, `work.villa` — and a
translation carries the same text in each language the game speaks. Italian is
*required*, because it is the language the interface is played in and a key with
no Italian is a blank panel rather than an untranslated one; English is optional,
and that is the fallback path the plan asks for. Placeholders (`{name}`) are part
of a key's contract, so `message` substitutes them and refuses a value that is
missing rather than printing a hole. The ticket's criterion — *no player-facing
string is hard-coded* — is asserted against the source: a test walks every
drawing call under `ui/` and `render/` and fails on a literal string passed to
the font, because the only way text reaches the screen is through `drawText`.

**Readouts, and panels that say the figures that matter** (`ui/hud.ts`). The top
bar names the settlement whose stock it is showing — the Stronghold when nothing
is selected, because a readout with nothing in it is a readout a Player learns to
ignore — and then carries the year, the Season, the treasury and the four
resources. A readout says whether its figure is a *numeral*, which is drawn at
the plan's large size, and whether it starts a row; the bar's height follows from
how many rows its words need, so a translation or a third resource moves the list
down instead of being clipped at the screen's edge. The left column lists every
settlement and every Squad the Faction holds, and the panel under it says what
the selected one is: a settlement's tier, people, stock, labour and works; a
Squad's kind, its **morale**, its **Payroll** and the Seasons it has gone unpaid.
One module owns the model, the layout and the hit test, because a row a Player
can see and a row a click selects have to be the same rectangle — and the click
the page handles asks the same `hitTest` a test would, so the pointer and the
test drive one selection rather than two.

**A minimap that is honest about fog** (`ui/minimap.ts`). One pixel per tile, the
colour of its terrain, with the Strongholds in their Factions' colours, the
resource nodes as the lightest shade of what they hold, and the last known
position of an enemy where the Faction believes it is. The plate takes **B4's own
`FogView`** and nothing else — the same object the theatre is veiled with — so a
tile the Faction has never seen is drawn in the night colour whatever the map
holds underneath it, and a landmark on a tile nobody has looked at is not drawn
at all. An unexplored Stronghold showing through the fog is the leak this module
exists to prevent, and the browser test compares the whole plate against the map
and the fog regenerated in Node, pixel for pixel.

**The HUD is screen-space, which is what "legible at every zoom" means.** The
panels are composed at the viewport's own size and drawn over the theatre without
the camera, so a 5×7 glyph is five by seven screen pixels at 1× and at 8×, and no
panel is ever magnified into a smear. The minimap is the one piece that changes
with the camera, because marking what the camera is showing is the whole of its
job — and it lives on a sprite of its own, so a pan recomposes a hundred-pixel
square instead of a full-screen interface. Everything the interface is made of is
generated: the glyphs are `art/font.ts` and the colours are `art/palette.ts`, and
no file was added to draw a word.

**The page runs a Match** (`render/game.ts`). B3 drew the theatre and stopped;
B7 opens the economy Match of B6 on the same seed, plays it in real time at the
pace B5 built, and reads its own Faction's **Observation** — never the world —
into the HUD. Real time lives here and only here, because `sim/` may not read a
wall clock (ADR-0006): a `requestAnimationFrame` loop measures the frame and asks
`pacing.ticksFor` how many whole ticks that is worth, clamped at both ends — a
background tab does not owe the Match an hour, and a frame's timestamp is the
moment the frame began, which can precede the clock read that started the loop.
`advance` steps ticks with no wall time at all, which is how a browser test
watches a Season turn instead of waiting three and a half minutes for it.

## Playing

The Roman army, and a hand on it (C2). The page opens looking at its Stronghold,
where five Squads have mustered — `render/opening.ts`, real Squads of real types
through C1's scenario door, standing on free ground a block's width apart — and
the fog is the Faction's own, refreshed from the settlements and the men it is
marching (`eyesOfEconomy`, B4's radii), so what a Player can see follows what
they command.

**A Squad is drawn as its soldiers** (`art/figures.ts`, `render/squads.ts`). A
figure is a paper doll composed from parts — a helmet, a shield and a weapon,
each one a kind rather than a sprite — so the three Roman lines are told apart by
*shape* at the lowest zoom: the hastatus' little round parma and short pilum, the
principes' wall of a scutum under a low crest, the triarius' great round hoplon
with a spear that reaches over every other man's head. C4 draws the other roster
the same way and equally unlike it: the Libyan's tall oval thureos, the Gaul's
longsword behind a tall wall of a shield, the scutarius' little caetra and curved
falcata, a slinger with no shield at all, a horseman with none and a fistful of
javelins, and an elephant that is not a doll but a beast. Four directions and
four actions are drawn: two of the directions are authored (the front and the
profile) and the other two are mirrors with the face painted out, and the frames
are idle, walk and attack in two steps each and a death. The block is composed
from the *simulation's own* list of men (`sim/squad.ts`'s `menOf`), so the
formation on screen is the formation the rules hold, and it is anchored by the
middle of its front rank's ground line, so a Squad that loses a rank loses the
men at the back and nobody shuffles. One sprite per Squad, re-composed only when
the shape it draws has changed, and the whole of both rosters in every direction
and frame is on the Atelier's plate beside the glyphs, the ramps and the terrain.

**The Player is a Controller** (`input/`, ADR-0014). A click picks a Squad by the
rectangle its men are drawn in, a drag picks every block it touches, and an order
is queued and emitted on the next tick as a real `move`, `attackMove`, `hold`,
`withdraw`, `formation` or `group` Command — the same seam the built-in AI will
use (D3) and an external agent will write on a line (E1). The selection and the
control groups are the Player's memory: they are hashed by nothing and nobody else
can see them, and a `group` Command is recorded so that a replay re-enacts the
selection as well as the orders.

| Gesture | What it does |
| --- | --- |
| Left click | Pick the Squad under the pointer, or the interface row it landed on |
| Shift + left click | Add that Squad to the picked set, or take it out again |
| Left drag | Pick every Squad the box touches |
| Right click | `move` the picked Squads to that tile |
| Shift + right click, or `a` then left click | `attackMove` there |
| Right drag | Pan the camera |
| Wheel | Zoom about the pointer |
| `s` / `w` | `hold` / `withdraw` |
| `l` / `c` | Hold a line / a column |
| Ctrl (or ⌘) + digit | Bind the picked Squads to that control group |
| Digit | Pick the Squads that group holds |
| `Escape` | Drop the picked set, or the order being armed |
| `Space` | Pause and resume |

Everything a hand can do is a hook first (`selectAt`, `selectIn`, `orderAt`,
`orderNow`, `setFormation`, `bindGroup`, `recallGroup`), so the pointer and the
keyboard end at the same calls a test makes: nothing about the page is reachable
only by a hand. The browser tests click, drag and press keys on the real canvas,
and one of them compares the pixels of a Squad's block with the block composed in
Node — the men on screen are the generator's, where the simulation says they
stand.

## The seam

One seam carries every decision in the game (PLAN §3, ADR-0003). A **Controller**
reads an **Observation** and emits **Commands** — and the human input handler,
the built-in AI, a scripted test driver and an external agent are all
Controllers, differing in nothing else.

- An **Observation** is the world filtered for one Faction, stamped with the
  Faction and the tick being decided. It is the only thing a Controller is
  handed, and reaching past it does not compile: a test in
  `tests/sim/controller.test.ts` fails if Match state ever becomes readable
  through one. Since B4 the filtering is real rather than promised — the
  projection is the Faction's own fog, so what a Controller is handed holds
  nothing its Faction has not seen (see *Fog of war* below).
- A **Command** is one of twelve, and the vocabulary is closed on
  purpose: adding one means implementing it twice, once for a human clicking and
  once for a machine emitting it. It is documented in
  [docs/COMMANDS.md](docs/COMMANDS.md) — the document an external agent is
  written from — and a test reads that document back, so the two cannot drift.
- **`runMatch`** is the loop that ties them together: two Players, one seed, one
  tick bound, a result, and the command log a replay is made of. What it drives
  has no browser, no human and no AI anywhere in it, which is what makes an
  AI-versus-AI Match a test rather than a demo.

The seam is also where the two rules that keep a Match honest are enforced: what
a Controller returns is validated against the vocabulary before anything is
applied, and a Command addressed to the other Faction is refused outright. The
driver never lets a rule defend against either. The other way into the rules —
replaying a log that arrived from outside a Match — closes the same vocabulary
first: `replayCommands` (`src/sim/replay.ts`) reads every line through it before
the first tick runs, so a log is refused rather than replayed into a rule.

What a Controller is handed is *copied*, so the seam holds in both directions:
the driver deep-copies the projection on the way out, exactly as
`validateCommand` copies a Command on the way in, and a Controller writing
through `observation.visible` reaches neither the rules nor the hash. The copy
carries structured-cloneable plain data and nothing else; a projection the clone
cannot carry at all — a function, a proxy — is refused before the Controller is
asked anything, as `ObservationProjectionError`, which names `observe` and the
Faction rather than leaving a `DataCloneError` to be traced back by hand.

## The headless Match

```
npm run match -- --seed 1 --ticks 600
```

```json
{
  "seed": 1,
  "ticks": 600,
  "outcome": "clock",
  "winner": null,
  "reason": "the Match reached its tick bound of 600 ticks without a decision",
  "commands": 0,
  "hash": "3aaaf501674cafe1"
}
```

One command plays a whole Match with no browser, no human and no AI, and prints
what happened and why it ended. Standard output carries the report and nothing
else, so it pipes into `jq`; the report holds no timing, no path and no wall
clock, so two runs of the same command are byte-identical and a recorded hash can
be gated on. `--seed` and `--ticks` choose the Match, `--rules` chooses which
harness Match to play, `--expect-hash` requires it to end on a hash you
recorded, and `--help` describes the lot.

CI plays that very command, with the hash above as its `--expect-hash`: a change
that moves the hash is a decision in review (ADR-0006). It plays more than one:
the default Match over its whole three-year bound, the clock's own `seasons`
Match, B4's `fog` Match — B1's theatre with both Factions' memory of it in state
— the engine-only `empty` Match, C1's `march` Match — a dozen Squads walking a
whole theatre — C4's `roster` Match, both Factions' whole rosters sent at each
other — C5's `assault` and `blockade` Matches, each a whole Match won headless by
one path of the Siege — and one that draws on every tick. The economy, the clock,
the fog, pathfinding and marching, the two rosters, both ways a Stronghold falls,
the seed expansion and the draw loop are each gated rather than inferred from the
others. C5 put a Squad's garrison posture into state, so the `march` and `roster`
goldens moved with it, and that was a decision rather than a drift.

The exit codes are the same three `npm run guard` uses: **0** the Match ran,
**1** a game invariant was violated — a hash that is not the expected one, a
Command outside the vocabulary, a float where state must be integers — and **2**
the command line was misused. A violated hash still prints the report first: the
interesting number is the one the Match ended on.

Today the Match has a theatre, a clock, an economy, Squads that walk and fight
on it and a Siege that can end it (B1, B5, B6, C1, C3, C5): its world is the map
the seed generated, the calendar, the settlements standing on it, the Squads
those settlements raise and the walls they can hide behind, and either the fall
of a Stronghold or the tick bound ends the run (`src/sim/siege.ts`,
`src/sim/economy-match.ts`). `--rules` chooses which harness Match the CLI plays:
`economy` is the default, `seasons` is the clock on its own, `fog` is B1's
theatre with B4's two fogs in state, `march` is a dozen Squads ordered across the
theatre, `roster` is both Factions' whole rosters sent at each other, `assault`
and `blockade` are whole Matches won by the two paths of the Siege, `empty` is
the engine and the seam alone, and `draws` plays one whose rules draw from the
seed on every tick, so the golden hash in CI covers the draw loop as well as the
seed expansion (`src/cli/rules.ts`). The harness around it is the point, and the
waves that build the world change what is inside it rather than how it is driven.

The command needs no build step. Node strips the types and runs `src/cli/main.ts`
as it stands, which is why every relative import under `src/` names its extension
(`./command.ts`) — see [ADR-0009](docs/adr/0009-the-cli-runs-the-source-with-node.md).

## Layout

```
index.html          the page Playwright drives, and the page a player opens
atelier.html        the Atelier: the whole generated catalogue, at several zoom levels
src/                application code
  sim/              the Match: map, economy, squads, combat, siege (no engine imports)
    clock.ts        the fixed tick and the one constant that sets its rate
    ticks.ts        what a whole number of ticks is, refused in one place
    rng.ts          sfc32 seeded through xmur3, drawing integers
    state.ts        the canonical form of authoritative state, and what it refuses
    hash.ts         the state hash, over that canonical form
    match.ts        the tick: a clock, a world, a random cursor, a hash
    replay.ts       a seed plus a command log, run again and compared
    faction.ts      the two Factions, as words rather than as state
    command.ts      the closed Command vocabulary: constructors and a reader
    observation.ts  everything a Controller may know, and nothing else
    controller.ts   the one interface every mind implements, plus an idle and a scripted one
    driver.ts       two Controllers, one Match, a result and a command log
    empty.ts        the Match with no systems in it: the engine and the seam alone
    season.ts       the strategic clock, its Season hooks, and the season Match
    pacing.ts       three speeds, a pause, and the orders a pause holds
    map.ts          the theatre a seed generates, and the invariants it satisfies
    fog.ts          what each Faction has seen, remembers and can see, and the inspection mode
    fog-match.ts    B1's theatre with both Factions' fogs in state, and the Observation built from one
    economy.ts      settlements, labour, the four resources, tiers and Payroll
    economy-match.ts  the Match that joins the map, the clock, the economy and the Squads
    route.ts        what crossing a tile costs, A* to find a way, and routes not searched twice
    squad.ts        the block a Squad is: its facings, its formations, and where its men stand
    movement.ts     the moving half of a Squad: routes, refused orders, and the Commands obeyed
    combat.ts       the fight: contact, the matchup, flanking, fatigue, missiles, rout and rally
    siege.ts        walls, the Roman ram, the assault, the blockade and the fall of a Stronghold
    residue.ts      the dead, kept beside the Match because they fade and never enter a hash
  content/          the typed tables the rules read: resources, Squad types, arms, buildings
    arms.ts         the five arms, and the matchup matrix: a cycle, not a ladder
  art/              pure pixel generation: PixelBuffer in, PixelBuffer out (no engine imports)
    pixel-buffer.ts the one currency: RGBA bytes, the drawing primitives and the pixel hash
    palette.ts      nine bases, and the ramps derived from them by integer arithmetic
    font.ts         the bitmap font: 5×7 letterforms, an accent band, every glyph the UI needs
    terrain.ts      the seven materials, the five dual-grid shapes, the six road pieces
    nodes.ts        the four resource markers: a sheaf, two logs, a heap and a diamond
    figures.ts      the paper-doll soldiers: a body, and the helmet, shield and weapon hung on it
    catalogue.ts    every artefact, named, and the one plate the Atelier renders
  cli/              the headless Match as a command
    arguments.ts    what the command line means, and what it refuses
    rules.ts        the Matches a run can play, by name, and what each draws
    run.ts          playing one Match, and the hash invariant the CLI checks
    dump.ts         the map a seed generates, written out for inspection
    report.ts       the JSON report, ordered and free of anything that varies
    main.ts         the entry: standard output, standard error, exit codes
    png.ts          a PNG encoder in the repository's own code, for the bake step
    bake.ts         the catalogue written out as files, and the table it prints
    bake-main.ts    the bake command: standard output, standard error, exit codes
  input/            the Player's hands: a selection, control groups and a Controller (no engine imports)
    selection.ts    what a Player has picked, and how a click or a drag picks it
    human.ts        the human Controller: an order becomes a Command on the next tick
  ui/               the Italian interface: words, panels, minimap (no engine imports)
    strings.ts      every word a Player reads, with its English fallback path
    minimap.ts      the theatre at one pixel a tile, drawn through B4's fog
    hud.ts          the readouts, the selection panels, the layout and the hit test
    marquee.ts      the box a drag draws, as a buffer of its own size
  render/           the application's one PixiJS-aware layer
    camera.ts       a whole-pixel position and a whole-number zoom, and no smoothing
    stage.ts        the adapter: PixelBuffer to texture, the camera on a container, the frame read back
    terrain.ts      the map composed into one image: ground, roads over it, markers over those
    fog.ts          the fog over that image: unexplored opaque, remembered veiled, visible clear
    view.ts         the seed, zoom, viewport and Faction the page opens on, with no engine in sight
    boot.ts         the game page's boot: the theatre, its fog, the Match, the camera, the hooks
    game.ts         the Match behind the interface, and the real-time loop that drives it
    opening.ts      the army the page musters, and the eyes it therefore has
    squads.ts       a Squad drawn as its soldiers in formation, from the simulation's own list
    squad-layer.ts  one sprite per Squad on the map, the mark of where it was told to go, and the dead
    corpses.ts      a corpse: which body, where on its tile, and how far through its fade
    controls.ts     the pointer and the keyboard, ending at the hooks a test calls
    hud.ts          the interface's two plates on the stage, in screen space
    atelier-layout.ts  where the several zoom levels of the catalogue stand on the page
    atelier.ts      the Atelier page: the catalogue plate, one column per zoom level
  page.ts           where a page mounts, and what a failed boot looks like
  debug.ts          the hooks a page publishes: what booted, where the camera is, what it drew
  main.ts           the game page's entry
  atelier.ts        the Atelier page's entry
scripts/guard.mjs   the fences
tests/              Vitest unit tests
e2e/                Playwright browser tests (a real browser, so `pixi.js` is allowed)
docs/PLAN.md        the plan of record
docs/COMMANDS.md    the Command vocabulary an external agent is written from
```

Further modules from the plan's architecture (`ai/`, `audio/`)
arrive with the tickets that need them, under `src/`.

## Continuous integration

| Workflow                       | Trigger                   | What it proves                                                          |
| ------------------------------ | ------------------------- | ----------------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | every push, every PR      | install, lint, strict types, build, unit tests, fences, a Match, browser |
| `.github/workflows/pages.yml`  | push to `main`, manual    | the static build deploys to GitHub Pages                                |

### Deployment

Pages serves `main` at `https://<owner>.github.io/<repo>/`; the workflow sets
`PAGES_BASE` from the repository name so Vite emits its assets under that path.

The workflow needs Pages enabled for the repository with **GitHub Actions** as the
source (Settings → Pages) — so on a fork, it fails at `actions/configure-pages` and
says so, rather than silently skipping the deploy. A private repository also needs
a plan that includes Pages.

## Testing

- **Unit tests** live in `tests/` and run in Node. Determinism, invariants, the
  guard rules and pixel hashes belong here: `art/` generates its pixels in Node,
  which is what makes a font, a ramp or a whole plate something a test can pin.
- **Browser tests** live in `e2e/` and run in headless Chromium. The page
  publishes its state on `window.__SPQR` (ADR-0003), which is how Playwright
  inspects the running game; `--enable-unsafe-swiftshader` lets WebGL fall back
  to SwiftShader on a machine with no GPU. Both pages are checked this way: the
  theatre at every zoom the camera offers, at both corners of the map and after a
  drag and a wheel, and the Atelier's whole catalogue at 1×, 2× and 4× — each
  against the same pixels generated in Node, point for point. The interface is
  checked the same way since B7: the words come from the string table, a click
  selects the row a Player pressed, the minimap is the map through B4's own fog,
  and the HUD stays in screen space at every zoom — the theatre and fog
  comparisons drop the points the interface covers, using the page's own
  rectangles rather than a second layout kept in the test. The war is driven the
  way a Player drives it since C2: a real mouse clicks a Squad, drags a box over
  several, right-clicks a destination and presses keys, and the Commands that
  reach the Match are read back through the page's hooks. The army is hidden with
  the page's own `showSquads(false)` lens for the comparisons that are about the
  ground, and one test composes a Squad's block in Node and compares it with the
  GPU's pixels, so the men on screen are the generator's.
