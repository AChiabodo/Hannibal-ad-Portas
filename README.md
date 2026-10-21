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
| `npm run build`     | Checks the architectural fences and types, then builds into `dist/`   |
| `npm run preview`   | Serves the built site on `http://127.0.0.1:5174/`                      |
| `npm run check`     | TypeScript in strict mode, all three projects, no emit                 |
| `npm run lint`      | ESLint over the repository                                             |
| `npm run guard`     | The seven fences: rendering boundaries, deterministic simulation, no committed asset, AI Observation imports |
| `npm run match`     | One whole Match headless as a JSON report, or — with `--map` — the map a seed generates, with no build step |
| `npm run agent`     | One whole Match with an outside process playing one Faction over the protocol in [docs/PROTOCOL.md](docs/PROTOCOL.md) |
| `npm run replay`    | Re-runs a Match recorded with `--record` and reports whether it still happens, and where it first diverges |
| `npm run tournament`| The balance instrument: a batch of AI-vs-AI Matches on distinct seeds, and one JSON report of what they add up to |
| `npm run bake`      | Writes the whole generated catalogue into `artifacts/` as PNGs, with the pixel hash of each, for inspection |
| `npm test`          | Unit tests (Vitest, Node)                                              |
| `npm run test:unit` | Every non-browser test, through the profile entry point                |
| `npm run test:focus`| The non-browser tests related to the working tree's changes            |
| `npm run test:smoke`| The small real-browser smoke: boot, one ordinary Command, frame and console health |
| `npm run test:feature -- <name>` | One browser responsibility: `orders`, `fog`, `hud`, `host`, …  |
| `npm run test:accept`| Complete browser acceptance, with visual captures off                 |
| `npm run test:visual`| Explicit visual-frame production into `SPQR_VISUAL_DIR`               |
| `npm run test:profiles` | List the browser responsibilities and their owner specs            |
| `npm run test:e2e`  | Browser tests (Playwright, headless Chromium, software WebGL)           |
| `npm run verify`    | Lint, check, guard, unit tests and build in one go                      |

The profiles and their selection rules are in [docs/VERIFICATION.md](docs/VERIFICATION.md).
The first browser run installs Chromium if it is missing; CI installs it with
`--with-deps` in its own step. In CI, a pull request into `main` and a push to
`main` take the smoke and complete acceptance; a pull request into `develop` runs
the fast checks and no Chromium unless it carries the `browser` label; a merge into
`develop` runs the smoke as a post-merge net.

## The fences

Seven architectural rules are cheap now and expensive later, so CI enforces them
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
7. **The AI may import only Observation types from the simulation.** The fence
   follows local helpers and re-export barrels too, refuses unresolved imports,
   and runs before every build. See [docs/AI.md](docs/AI.md) for the contract.

The walk behind the `Math.random`, transcendental and ambient checks is
syntactic, and it says so instead of pretending to be complete. It sees a global
spelled out — `Math.random`, `Math["random"]`, `Math?.random`,
`const { random } = Math`, `Date.now()` — and it does not see through an alias, a
`globalThis`, or a name built at runtime: `const M = Math; M.random()`,
`globalThis.Math.random()`, `Math['ran' + 'dom']()`, `const D = Date; D.now()`
and `new Date()` all pass the guard today. A green tick means the ordinary
spellings are absent, not that no other spelling exists.

`npm run guard` walks all seven fences. On a breach it prints the offending file,
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

## The AI foundation

`npm run match -- --rules ai --seed 1 --ticks 2101` runs two AI Controllers
headlessly across a Season boundary. Its JSON report includes every strategic,
operational and tactical decision, all candidate utilities and reasons, and the
selected candidate. The economy policy grows settlements and recruits against
recurring Payroll capacity; the military policy defends observed threats,
chooses counters, commits reserves and withdraws beaten Squads. Shipped scouting
keeps last-known contacts current, and the siege policy chooses between Assault
and Blockade. See
[docs/AI.md](docs/AI.md) for clocks, registration and log interpretation.

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
brings the harvest and winter is the Season whose own rules a system may want to
single out; every Season is announced to every subscriber, and autumn and winter
have a hook of their own on top of that, so **no system counts the year for
itself** (ADR-0010, ADR-0011):

```ts
const changes = advanceCalendar(world.calendar, tick); // once per tick
announceSeasons(changes, economy.seasons, attritionSeasons(world.economy));
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

A **Match is bound to three game years** — `MATCH_TICKS`, 25 200 ticks, 42 minutes
of Match time — wherever it is played: the CLI's default bound and the bound the
page plays to are that one number, under the name (`HEADLESS_TICKS`) the CLI's
arguments read it by, because a Match that can never end is one nothing can watch
to the end (ADR-0022). A caller may hand over another length for a tournament or a
long test, but not none.

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
- **Payroll every Season, on the men still standing.** A Faction owes each Squad
  its type's Payroll rate per 24 survivors, rounded up, out of its treasury; a
  Squad it cannot pay loses morale and, after enough Seasons owed, **deserts**.
  A paid Squad recovers a little of what it lost, so a rough patch is survivable
  and a permanent one is not.
- **Recruited capacity is not strength.** A Squad is raised at one of its type's
  real sizes (`24`, `60` or `120` for Roman melee; `24` or `48` for Carthaginian;
  one fixed size for a specialist) and remembers those men as its capacity. Loss
  reduces its survivors and its Payroll bill, never the purchase it was.
- **A price is a 24-man price.** The starting resource bill is the old price
  applied to 24 men and scales exactly — `1`, `2.5`, `5` for Rome and `1`, `2`
  for Carthage — with no bulk discount. A 120-man line therefore costs five
  24-man lines and no more. Specialist prices and combat balance remain a later
  calibration (ADR-0026, ADR-0027).
- **The autumn harvest is a peak.** Ordinary production runs every Season
  (`onSeason`); the harvest arrives on top of it on the autumn boundary
  (`onAutumn`), so the grain it brings in is a number a reader can see apart from
  the Season's own work.

`economyMatchRules` joins B1's map, B5's clock and B6's economy in one
`MatchState` — the first Match whose hash covers the tiles it begins on — and
`observeEconomy` is what a Faction reads of it: its settlements and where they
stand, their tier, people, stocks, land and works, its treasury, and its Squads
with their recruited capacity, surviving men and the Payroll bill those survivors
owe. An enemy's settlement is not in the
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
  "hash": "93c41650cae7c719"
}
```

Two Commands, seven Squads, and a hash CI gates: it covers the map in state,
the routes worked out over it, the terrain costs walked, every turn taken and
the economy's half of every Squad beside them, so a change to any of it is a
decision in review rather than a silent one. `musterSquad` is a scenario's way
in — recruitment is the economy's — and the `march` Match exists because a
ticket that says "a body of Squads moving at once" should be something the
repository runs rather than something it claims. Since C3 the two forces meet in
the middle of that theatre, so the hash covers the fight as well as the march:
the survivors are the men who got through, and every one of them still stands on
the Stronghold it was sent to.

Since #66 the two forces are **the same men and not the same number of Squads**:
two Roman lines of 120 against five Carthaginian bodies of 48, two hundred and
forty a side. The fight is decided by the men brought to bear
(`docs/adr/0028-combat-reads-the-men-brought-to-bear.md`), so six 48-man bodies
against six 120-man ones would have been a walkover and a golden hash that
tested nothing. The new hash is a real engagement between two equal forces.

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
  "hash": "a5e7bcf64fca8b7e"
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
| the men brought to bear | a blow is counted in **force points**, twelve to a man, and read from the men a Squad has left times its type's `impact`: a 120-man line lands 120 points a round, and five 24-man Squads land 120 between them |
| the shape it holds | a line lands all of its points and a column a quarter of them |
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

**The same men fight the same, however they are divided** (ADR-0028, #66). A
Squad's blow is its `bearing` — men times `impact` — and a defender's casualties
are floored **once per round, from the sum of every blow that landed on it**, so
five 24-man Squads kill what one 120-man Squad kills and not five times as much.
Two rules finish the job: a Squad's attention is **divided** among the enemies it
is in contact with, so a body fighting on three sides inflicts its force once;
and Morale shock is counted **once per defender**, so five bodies pressing one
shake no more nerve than the one body they add up to. A volley is a weight of
missiles per man and not per Squad, for the same reason. The measurements — the
band they are held to, the scenes, and what they do not cover — are in
[the P3 review](docs/reviews/issue-66-military-balance.md).

**Breaking, running, rallying.** A Squad at no morale has *routed*: it runs for
the nearest settlement its Faction holds, strikes at a third of its force,
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
manual rallying. Being cut off was read as "no settlement the Faction holds
within thirty-two tiles", charged with Payroll at the Season boundary — a
stand-in C3 named and rejected for itself. C6 has replaced that inference with
real Territory: `inSupply` asks `territory.ts` whether a Squad stands in its own
country, and Attrition charges the men of the ones that do not at the same
boundary.

The Observation carries the fight to the Faction that is in it: `morale`,
`fatigue`, `ammunition`, whether the Squad has `routed` and whether it is
`engaged`. Contact is one tile, which is inside any Squad's own eyes, so the fog
is not being spent by it. The HUD prints the figures, and reads a routed Squad as
*In rotta* rather than naming an order it is not obeying.

## The two rosters, and their real sizes

The other half of the game (C4), and P2's real sizes on top of it. `content/squads.ts` now carries both rosters,
and they are not two sets of numbers: Rome's three lines are disciplined,
durable and slow to replace, and Carthage's six are a mercenary coalition —
cheap to raise, brittle in morale, dearer to keep and, in the elephant, unlike
anything Rome fields at all.

| type | tier | sizes | arm | morale | volleys | pace | 24-man cost | Payroll / 24 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hastati` | 1 | 24 / 60 / 120 | sword | 10 | 4 | 1 | grain 8, iron 2 | 3 |
| `principes` | 2 | 24 / 60 / 120 | sword | 12 | 4 | 1 | grain 10, iron 4 | 4 |
| `triarii` | 3 | 24 / 60 / 120 | spear | 14 | 0 | 1 | grain 10, iron 6 | 6 |
| `libyan-spear` | 1 | 24 / 48 | spear | 9 | 0 | 1 | grain 6, iron 2 | 3 |
| `gaul` | 1 | 24 / 48 | sword | 6 | 0 | 1 | grain 5, iron 1 | 2 |
| `iberian-sword` | 2 | 24 / 48 | sword | 11 | 2 | 1 | grain 8, iron 4 | 5 |
| `balearic-slinger` | 2 | 24 | archers | 8 | 8 | 1 | grain 8, iron 1 | 4 |
| `numidian-horse` | 3 | 12 | cavalry | 10 | 6 | 2 | grain 8, iron 2 | 4 |
| `elephant` | 3 | 24 (one figure) | cavalry | 16 | 0 | 2 | grain 12, iron 6 | 8 |

**Sizes, prices and Payroll (P2).** The small Carthaginian numbers are the
roster's distinct shape, not a discount: Carthage can field more, smaller
contingents and keep them through a wider front, while Rome can concentrate a
120-man line. A Recruit names one real size; `36`, `64` and every number between
the roster's sizes are refused rather than rounded. The resource bill is
`ceil(24-man cost × men / 24)` and the Payroll bill is
`ceil(rate × survivors / 24)`, both integer arithmetic. Rounding *up* is
deliberate: splitting the same men across more Squads can never lower the bill,
so fragmentation buys no free Payroll. A 120-man `hastati` therefore costs grain
40 and iron 10 to raise and 15 denarii a Season, while a 24-man one costs grain
8, iron 2 and 3 denarii. `capacity` is hashed state, so a Replay remembers what
each Squad was bought as even after casualties. Pre-P2 logs with no `men` are
rejected at the Command seam rather than defaulted (ADR-0026, ADR-0027).

**Before and after.** Before P2 a Recruit raised one full-strength block per type:
Rome at 120/120/100 and Carthage at 120/140/120/90/60/24 men, with the resource
cost above charged once per Squad and Payroll a flat 3/4/6 and 3/2/5/4/4/8. After
P2 the sizes in the table above are real purchases, the same resource figures are
the 24-man basis (so a 120-man `hastati` costs grain 40 and iron 10, five times
the old bill), and Payroll is 15 denarii for those 120 survivors against the old
flat 3. No combat calibration is claimed: the P2 checks measure the price,
capacity, bill and Replay arithmetic and the AI's opening purchases, while #66
owns whether the resulting armies fight each other fairly.

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
abstract `strength` of 24 is the staying power that figure is worth, which is
what lets a single beast weather a round or two of a Roman line instead of dying
to the first blow. `figuresOf(type)` is the one place the two numbers are tied,
and the Observation carries both, so a drawing code lays out a beast as one
figure and an infantry Squad as three representative figures per four survivors
(rounded up): a 120-man Squad draws 90. The elephant stays one figure, and its
`strength` is separate from the beast count. The 1:1 figure pass is P4's; P2
deliberately keeps the existing procedural renderer. Everything else about an
elephant is an ordinary Squad:
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
and the walls cost them lives and nerve while they do it. Both of those are read
off the besieging **force** and not off the number of Squads under the wall: three
Roman bodies chip it no faster than one, and a body of 120 pays exactly what five
bodies of 24 pay in blood (ADR-0028). That is the whole of
"an assault without a breach is possible but punishing": an assault can be issued
before anything is broken, waiting for the breach is the sane order of business,
and a ram the garrison has wrecked pays for itself in blood. Walls do not repair,
so a failed assault leaves the place weaker for the next one.

**The ram** is laid down on the spot, paid out of the Faction's one treasury,
built over `RAM_BUILD_TICKS`, and it is the only thing that shields an assault —
while it is still being built the walls cost men and morale every round, and once
it is at work they cost nothing. It is also **vulnerable**: the garrison takes it
apart at `RAM_BEARING_PER_BLOW`, one point of ram for every sixteen of its force
a round, so a 48-man body of spearmen needs twenty rounds to break a ram and the
gate needs eight, while four such bodies break it in five and the gate stands —
and five 24-man bodies defend the ram exactly as well as the 120-man body they add
up to, because the wall counts men and not Squads (ADR-0028). A manned Stronghold
turns an assault into an escalade that pays for itself in blood. `canAssault` is the whole of "Rome's
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
people — at up to twice that rate when the ring outweighs the garrison, because a
blockade is men against men and not Squads against Squads; a town with no grain
and nobody left on its walls opens its gates. A
*field* army of the besieged Faction within `RELIEF_RADIUS` lifts the ring — the
garrison is the thing being starved, so only men outside it can threaten the
besiegers — and the besieger has to close the ring again.

**A minor settlement is taken by holding its centre**, and nothing is razed. An
open settlement has no wall to break and nothing to starve: a Squad that stands on
its tile, uncontested, for `CAPTURE_HOLDS` checks takes it, and its people, its
works and its stocks stay. "Uncontested" is a question about men: the larger body
on the centre holds it, a tie holds nothing, and a single 24-man body is enough
for a village nobody is defending. An open settlement is still seen through the Faction's
own fog, though: no wall to keep a secret is not a licence to skip an eye, so an
unseen village's front is absent from the Observation until a Squad or settlement
of the Faction looks at it (ADR-0020). Only a Stronghold's fall ends the Match,
and the result names it as the reason:

```
npm run match -- --seed 1 --ticks 9000 --rules assault
{
  "seed": 1,
  "ticks": 251,
  "outcome": "victory",
  "winner": "rome",
  "reason": "rome won the Match: the carthage Stronghold fell to an assault",
  "commands": 2,
  "hash": "0f37cc5352591836"
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
  "hash": "1f42040d1278803f"
}
```

Two whole Matches won headless, one by each path, with the fall of a Stronghold as
the golden hash: a change to the walls, the ram, the starvation or the verdict
moves those numbers and has to be a decision in review. The blockade's 6300 ticks
against the assault's 251 is the asymmetry the ticket is about, in one pair of
numbers — three Seasons of siege to twenty-five seconds of storm. The blockade's
hash moved when C6 landed, because the Roman army at those walls now winters
outside its own country and Attrition takes its men: ADR-0006 says a moved hash is
a decision in review, and that was the decision. Both hashes moved again when D4
landed: the Siege world now carries each Faction's fog, that fog is hashed state,
and an open settlement's front is sighted through it rather than announced to
everyone who can read the map (ADR-0020). ADR-0006 says a moved hash is a decision
in review, and that was the decision too.

**What C5 does not own.** No siege towers, multiple ladders, mines or artillery:
the plan excludes them from v1. The shipped D5 siege policy chooses when to
Assault and when to Blockade from the walls, breach, ram, hold and garrison in
`observeSiege`. The page still
plays the economy Match, so a wall is something the CLI and the tests exercise
rather than something drawn on screen yet: putting the walls in the interface is
B7's and E4's, and `observeSiege` is the projection they will read.

## Territory and Attrition

Supply is a **place on the map** (C6, ADR-0005). A Faction's **Territory** is
inferred from the settlements it holds — there is no boundary to draw and no
supply line to cut — and a Squad standing outside its own country loses men to
**Attrition** every Season, worst in winter. Taking a village redraws the
Territory on the tick the village falls, so a campaign rewrites the map of
supply as it advances (GLOSSARY: Territory, Attrition, Supply).

**Territory is the ground within `TERRITORY_RADIUS` of a Faction's settlements**
(`src/sim/territory.ts`), twelve tiles of country each way, measured Chebyshev in
whole tiles, as the land a settlement works is (`LAND_RADIUS`). Two Factions' squares may overlap, and
a contested tile goes to the settlement nearer it — a tile exactly halfway goes
to the Faction the economy holds first, which is Rome's Stronghold by its id, so
the same position always draws the same boundary on every engine (ADR-0006).
Nothing stores the grid: it is inferred from who owns what, remembered until an
ownership changes, and handed to a Faction's Observation as its own country — the
far half of the theatre reads as nobody's, because whose settlements feed a
distant tile is that Faction's business.

**Attrition is charged at the Season boundary** and takes men rather than nerve:
`applyAttrition` runs on the same clock that pays Payroll and, since C6,
`inSupply` — C3's own being-cut-off rule — asks the same Territory rather than a
radius of thirty-two tiles. Two men in a hundred for a Season outside the
ground, three times that for a winter outside it, and two for wintering in the
open *inside* it with no roof over the army:

| where the Squad stands | spring, summer, autumn | winter |
| --- | --- | --- |
| its own Territory, in quarters | — | — |
| its own Territory, in the field | — | 2% of its men |
| outside its own Territory | 2% of its men | 6% of its men |

The cost is a share of the men a Squad is counted as, never less than one, rather
than a fixed number: a tax of one man a Season would be invisible in a line of a
hundred and twenty and ruinous to an elephant of twenty-four, and it would never
wear anything out. A share compounds — a third of an army is gone after three
years in the field — and a Squad worn to nobody leaves the list, so overextending
without supply costs the force it was overextended with.

**The Roman Castrum is what makes the field a place to winter.** A Squad is in
**quarters** when it is garrisoned in one of its Faction's settlements or
standing on its centre, and one that is holding position within `CAMP_RADIUS` of
a settlement with a standing `castrum` is in a **camp**: the open ground round
the camp counts as quarters, so a Roman army winters in the field without paying
for it. Carthage cannot — the Castrum is Rome's alone (`content/buildings.ts`), a
Carthaginian Faction cannot build one, and an open settlement cannot be
garrisoned at all — so Hannibal's army pays for every winter it spends in Italy,
which is the plan's asymmetry (PLAN §1) as a rule rather than a statistic. It is
read off the Faction and not off the ground (`canCamp`), so the camp a Roman
village holds is still Rome's when Carthage storms the village: nothing is razed
on capture, and the camp stands there unusable until Rome takes it back.

**What C6 does not own.** No supply lines, convoys or depots, and no naval supply
of any kind: ADR-0005 settled supply as Territory. Nothing draws the boundary on
screen yet — `observeEconomy` carries it for B7 and E4 to read — and the numbers
above are the second thing F1's balance pass measures, `TERRITORY_RADIUS` and the
three percentages all in one file.

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

The same derivation runs at a second resolution. **`DETAIL_RAMPS`** are the six
bases again at thirteen shades instead of seven — one between every two, the same
dark and light ends, ten points of the spread to a step rather than twenty — and
their even indices *are* the standard shades. They exist because a surface and a
figure want different steps: a helmet has an edge and wants a visible one, while a
tile of terrain is nine thousand tiles of dither, and a dither of whole standard
shades reads as flicker competing with the men standing on it (U5,
[#56](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/56)). Terrain paints
from the detail ramps and nothing else in the library does.

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
recorded, `--record` writes the record `npm run replay` re-runs (below), and
`--help` describes the lot.

CI plays that very command, with the hash above as its `--expect-hash`: a change
that moves the hash is a decision in review (ADR-0006). It plays more than one:
the default Match over its whole three-year bound, the clock's own `seasons`
Match, B4's `fog` Match — B1's theatre with both Factions' memory of it in state
— the engine-only `empty` Match, C1's `march` Match — a dozen Squads walking a
whole theatre — C4's `roster` Match, both Factions' whole rosters sent at each
other — C5's `assault` and `blockade` Matches, each a whole Match won headless by
one path of the Siege — C6's `attrition` Match, two armies in the field through
the Seasons with only one of them in a camp — and one that draws on every tick.
The economy, the clock, the fog, pathfinding and marching, the two rosters, both
ways a Stronghold falls, the country a Faction holds and what a Season outside it
costs, the seed expansion and the draw loop are each gated rather than inferred
from the others. C5 put a Squad's garrison posture into state, so the `march` and
`roster` goldens moved with it; C6 put Attrition on the Season boundary, so the
`blockade` golden moved — Rome's besieging army now winters in the field — and
both were decisions rather than drifts.

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
and `blockade` are whole Matches won by the two paths of the Siege, `attrition`
is two armies through the Seasons with only one of them in a camp, `siege` is the
bare theatre with nobody commanding it — the Match the external-agent harness
plays, and so the one an agent's record is filed under — `empty` is the engine and
the seam alone, and `draws` plays one whose rules draw from the seed on every
tick, so the golden hash in CI covers the draw loop as well as the seed expansion
(`src/cli/rules.ts`). The harness around it is the point, and the
waves that build the world change what is inside it rather than how it is driven.

The command needs no build step. Node strips the types and runs `src/cli/main.ts`
as it stands, which is why every relative import under `src/` names its extension
(`./command.ts`) — see [ADR-0009](docs/adr/0009-the-cli-runs-the-source-with-node.md).

## The outside agent

```
npm run agent -- --agent examples/agent.ts --seed 7 --opponent idle
```

```json
{
  "seed": 7,
  "ticks": 14700,
  "outcome": "victory",
  "winner": "rome",
  "reason": "rome won the Match: the carthage Stronghold fell to a blockade",
  "commands": 63,
  "hash": "29e12382a7559932",
  "agent": {
    "faction": "rome",
    "opponent": "idle",
    "status": "played",
    "stoppedBy": null,
    "detail": null,
    "decisions": 1470,
    "commands": 63
  }
}
```

The example now demonstrates the **Blockade** path. P2's smaller, dearer armies
no longer carry the old script's storm of the walls, and final Siege/combat
equivalence is #66's; what the example proves is the external-agent contract, not
a balance claim about the Assault.

A process that is not this codebase plays a whole Match: the harness starts the
file `--agent` names, speaks [the protocol](docs/PROTOCOL.md) to it over that
process's standard input and output, and puts the built-in AI — or nobody at all —
on the other side. What crosses the pipe is the seam and only the seam: one
**Observation** per decision, filtered through the agent's own fog, and the
**Commands** it answers with, read through the vocabulary before anything is
applied. No state, no seed of its own, no privileged window into the Match.

The ticket's fourth rule is the one that shapes the command: a malformed reply, a
reply that never arrives and a process that dies are all a **Player who stopped
playing**. The harness says `stopped` with the reason, asks nothing more, leaves
that Faction idle and plays the Match to its own end — so an agent whose answers
are not trusted can run in CI, and the exit code stays 0 because a Match was
played. `--decision-ticks` and `--deadline` are how often a process is asked and
how long it has, `--log` writes the Command log, and `--expect-hash` gates it.

A Match played this way is a seed plus the log it wrote, like any other:
`--record` writes it as the file `npm run replay` reads, and `npm run replay --
match.json` re-runs it in a process that could not talk to the agent at all —
which is the whole of "an external agent completes a Match" as a thing CI can
check.
`examples/agent.ts` is an agent written from the document alone — raise two
Squads, sweep the theatre until the enemy Stronghold is seen, assault it — and it
imports nothing from this repository. The suite runs it to a victory, replays the
Match from its log, and runs the skeleton agent the document ends with.

## The browser's hooks

`window.__SPQR` stops being a test's private convenience and becomes the product's
second interface (E4, ADR-0003). The page publishes what it booted, where it is
looking, what its Match believes, and the calls that drive it — and
[the document an agent is written from](docs/BROWSER.md) is the sibling of the
Command vocabulary and the external agent's protocol, written for whoever drives
the page instead of a pipe.

```js
await page.goto('/');
await page.locator('body[data-spqr-booted="true"]').waitFor();

const before = await page.evaluate(() => window.__SPQR.game.state());
await page.evaluate(() => window.__SPQR.game.pause());
await page.evaluate(() => window.__SPQR.game.select({ kind: 'squad', id: 1 }));
await page.evaluate(() => window.__SPQR.game.orderNow('hold'));
await page.evaluate(() => window.__SPQR.game.resume());

// 42 minutes of Match time, in about a second: the wall clock is skipped, not
// accelerated, so the answer is the rules' and not the frame rate's.
const result = await page.evaluate(() => window.__SPQR.game.fastForward());
// { kind: 'clock', tick: 25200 }
```

**`state()` is the whole of it in one call**: the tick, the bound, the result, the
state hash, the Faction's Observation, the interface's model, the picked set, the
Squads, the dead, the fog and the Commands applied lately — a plain-data copy, so an inspector
may keep it, diff two of them or carry it across the browser bridge. The hooks
beside it are how it was assembled, and a test that wants one figure asks for one.

The surface is deliberately narrower than a debugger's: **no hook takes a Command**.
The five that issue one (`orderAt`, `orderNow`, `setFormation`, `bindGroup`,
`recallGroup`) take a screen point, a kind with a fixed vocabulary, a Formation or a
digit — what a pointer or a keyboard produces — and hand it to the human Controller,
which validates it and refuses the other Faction's. That is the ticket's *without
exposing Commands a Player could not issue* as a property rather than a promise, and
`e2e/surface.spec.ts` proves it at the type level: a hook that took a Command would
stop the build. The names themselves live in `src/hooks.ts` as data, because an
interface erases when the page is built — one list is what the document, the
interfaces and the running page are all held to.

**A browser Match has an end**, which is what makes "one short Match played to its
end" a thing Playwright can assert: the page plays to `MATCH_TICKS` and reports the
`MatchResult` the CLI's report carries (ADR-0022). `advance` refuses to step past
the bound rather than clamping to it, a Match that has ended answers a second
`fastForward` with the ending it already had, and the frame loop stops with it.

**A failing browser test explains itself without a picture.** Every spec runs on
`e2e/fixtures.ts`, which watches its page from the moment it opens and, on a
failure only, attaches the boot report, `describe()`, the snapshot with its state
hash, the console, the uncaught errors and failed requests, the DOM as text, and the
trace Playwright kept. The state hash is what makes that evidence: two runs that
disagree about a pixel and agree about the hash are a rendering question, and two
that disagree about the hash are a rules question, with the tick already narrowed.
No screenshot is taken, because a picture of a canvas cannot say which tick it was.

## The record, and the replay

```
npm run match -- --rules march --seed 1 --ticks 600 --record march.json
npm run replay -- march.json
```

```json
{
  "seed": 1,
  "rules": "march",
  "ticks": 600,
  "everyTicks": 10,
  "checkpoints": 61,
  "outcome": "clock",
  "winner": null,
  "reason": "the Match reached its tick bound of 600 ticks without a decision",
  "hash": "93c41650cae7c719",
  "verdict": "reproduced"
}
```

A Match is reproducible by construction — integer state, a seeded generator, a
fixed step — so a **record** is not a video and not a snapshot: it is the seed,
the Command log, how the Match ended, and the state hash of every checkpoint it
was fingerprinted at. `npm run match -- --record <file>` and `npm run agent
-- --record <file>` write one; `npm run replay -- <file>` reads one back, re-runs
the Match with no Controllers at all, and prints the verdict on standard output.

The verdict is `reproduced` or `diverged`, and a divergence names the first
checkpoint whose two hashes disagree, quoting both, and the last checkpoint the
two still agreed on:

```
replay: the record and this replay diverged at tick 3400: the record has
0f1e2d3c4b5a6978, and this run reached 9a8b7c6d5e4f3021. They were still the same
Match at tick 3390
```

That is the instrument the ticket exists for: a bug an external agent reports
arrives as a small text file — some thirty kilobytes for a Match an agent played,
some hundred and sixty for one that ran its whole three-year bound, because a
checkpoint is a game second apart — and it replays on the machine of whoever fixes
it. A change to a game rule produces exactly this report, and the command exits 1
for it; the report is printed first, so the divergence is readable in a CI log
without a second run. The checkpoints are not the only check: the *ending* is
derived again too, because a rule can change when a Match is decided without
moving a single number in the world, and a record whose ending this build does not
reach is reported the same way, in the words a Match's own report uses
(`docs/adr/0023-a-record-is-a-seed-a-log-and-its-fingerprints.md`).

`npm run replay` exits 0 when the record reproduced, 1 when the replay parted from
it — the hashes at a tick, or the ending once every hash agrees — and 2 when the
command line was misused or the file is not a record: a record
arrives from outside, so it is read the way a Command from outside is — every
field checked, an unknown field refused by name, and the checkpoints required to
be the schedule a run keeps.

## The tournament

```
npm run tournament
```

One command plays a batch of AI-vs-AI Matches — one per distinct seed, two hundred
of them by default — and prints one JSON report of what they add up to. This is
where "is the game balanced?" stops being an opinion: the report states the win
rate of each Faction, the median and the spread of how long a Match lasts, the
share of Matches the clock decided, and the seed of every Match that was lopsided
or stalled, so the Match behind an odd number can be played again and read.

The report below was measured **before P2**. The smaller, dearer roster and the
survivor-based Payroll move every number in it; #29 owns re-measuring the batch,
and P2 records the baseline rather than pretending the old odds still hold.

```json
{
  "rules": "ai",
  "difficulty": "centurio",
  "bound": 25200,
  "seeds": { "first": 1, "count": 200 },
  "wins": { "rome": 7, "carthage": 185, "draws": 0 },
  "winRate": { "rome": 0.035, "carthage": 0.925 },
  "decidedByClock": { "matches": 8, "share": 0.04 },
  "duration": {
    "ticks": { "min": 5401, "p10": 6300, "median": 8400, "p90": 10500, "max": 25200 },
    "minutes": { "min": 9, "p10": 10.5, "median": 14, "p90": 17.5, "max": 42 }
  },
  "outliers": {
    "lopsided": [],
    "stalled": [
      { "seed": 10, "outcome": "clock", "winner": null, "victoryReason": null, "ticks": 25200, "decisions": 50592, "commands": 42375, "hash": "90ad57ccfd000e8d" }
    ]
  },
  "matches": [
    { "seed": 1, "outcome": "victory", "winner": "rome", "victoryReason": "stronghold", "ticks": 6651, "decisions": 13356, "commands": 13130, "hash": "5f6ee34847ce5b65" }
  ]
}
```

That report is the batch of seeds 1 to 200, and it is the first thing that says
something about the game rather than about a Match: Carthage wins nine Matches in
ten, the middle Match is over in fourteen game minutes rather than the twenty-five
to forty-five the plan asks for, and eight Matches — seeds 10, 18, 57, 75, 151,
171, 184 and 196 — ran their whole three-year bound with nobody able to win.
Nothing in this batch was lopsided: the shortest Match is 5,401 ticks against a
median of 8,400, and no Faction was ever annihilated. The numbers are stated, not
judged: rebalancing is F1's ticket, and a report that had already decided would
make F1's first job auditing the report.

Everything in it is a function of the seeds and the build. There is no timing, no
path and no wall clock in the report, so two runs of the same batch print the
same bytes — which is what lets a later ticket gate on it, and what lets a reader
diff this week's against last week's and see only what changed in the game. The
Matches themselves are independent, so they are played on the machine's other
cores: one core would take half an hour over this batch, and twelve take a few
minutes (`--workers` says how many, `--workers 1` says one). In a terminal the
run says how far it has got, on standard error; a pipe or a CI log gets the report
and nothing else.

A Match's decisions are not in the report — one Match's log is some twenty
megabytes of JSON, every candidate every behaviour proposed and the utility that
decided — so `--keep <dir>` writes them beside it, one file per seed:

```
npm run tournament -- --seeds 200 --keep artifacts/tournament   # every Match's decisions
npm run match -- --rules ai --seed 10 --difficulty centurio --ticks 25200
```

The file is the very report `npm run match --rules ai` prints for that Match,
decisions and all, and it is named after its seed by a rule rather than by a path
in the report — so the report does not even depend on whether logs were kept.
Without `--keep` a Match is retrieved by playing it again, which determinism makes
exact: name the seed the report names, at the `--difficulty` and `--ticks` it
states, and the `hash` it gives that Match is what proves the Match retrieved is
the Match measured. `--difficulty` is therefore a flag on `npm run match` too —
and it is refused beside any `--rules` that has no AI in it, because a level that
changed nothing would be a flag that lies.

Two Matches are a balance reader's business rather than a distribution's:
**stalled** is a Match the clock ended — nobody could win it — and **lopsided** is
a victory that was not a contest, either won in at most half the batch's median
duration or won outright by leaving the loser neither settlement nor Squad. Both
are listed by seed, so the Match behind an odd number can be opened and read.

The flags worth knowing before reading a report: `--first-seed` moves the batch,
`--ticks` moves the bound every Match is given, and `--difficulty` picks the level
both AIs play at, because a win rate means nothing without it.
The command exits 0 however the game turned out — a report is a measurement — 1
when a Match of the batch could not be played, naming its seed, and 2 when the
command line was misused or a decision log could not be written where `--keep`
asked for it.

Building this batch found the game's own hot spot: a Match spent most of its time
in the scouting behaviour, walking the whole theatre for frontier ground on every
tick, and planning the same patrols twice per tick for two different callers.
Computing the frontier once per theatre per call, and planning the patrols once per
Observation, cut a Match's cost by about two and a half times without changing a
single decision — the same state hashes, the same Command logs, the same decision
logs — which is what turned this batch from eleven minutes into four
(`src/ai/scouting.ts`, `src/cli/ai-match.ts`).

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
    replay.ts       a seed plus a command log, run again and compared; and where two runs part
    outcome.ts      how a Match ended and why: the verdict the rules give, and two endings compared
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
    siege-fog.ts    the siege world's fog contacts, and the typed kind each memory holds
    territory.ts    the country a Faction's settlements give it, and what a Season outside it costs
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
    icons.ts        the command card's verbs and the badges a panel reads a figure with
    separation.ts   a soldier of each Faction on three tiles of every material: the figure/ground specimens
    catalogue.ts    every artefact, named, and the one plate the Atelier renders
  cli/              the headless Match as a command
    arguments.ts    what the command line means, and what it refuses
    rules.ts        the Matches a run can play, by name, and what each draws
    ai-match.ts     composing economy, military, scouting and siege policies for headless AI Matches
    run.ts          playing one Match, and the hash invariant the CLI checks
    dump.ts         the map a seed generates, written out for inspection
    report.ts       the JSON report, ordered and free of anything that varies
    main.ts         the entry: standard output, standard error, exit codes
    protocol.ts     the external agent protocol's messages, the wire Observation, the reply reader
    agent.ts        an outside process as a Player: the pipe, the deadline, a Player who stopped
    agent-arguments.ts  what the agent command line means, and what it refuses
    agent-main.ts   the agent command: standard output, standard error, exit codes
    record.ts       a Match's record: the file a replay is made of, read strictly
    replay.ts       replaying a record: two kinds of departure, and the verdict
    replay-arguments.ts  what the replay command line means, and what it refuses
    replay-main.ts  the replay command: standard output, standard error, exit codes
    png.ts          a PNG encoder in the repository's own code, for the bake step
    bake.ts         the catalogue written out as files, and the table it prints
    bake-main.ts    the bake command: standard output, standard error, exit codes
  ai/               the built-in Controller, registered behaviours and difficulty levels
    controller.ts   three decision clocks, utility selection and replayable decision logs
    registry.ts     behaviour registration and deterministic candidate ordering
    economy.ts      settlement growth, production, recruitment and payroll planning
    military.ts     field defence, counters, reserves and withdrawal
    scouting.ts     exploration and last-known contact patrols
    contacts.ts     the last-known contact memory and the age limit every planner reads
    calendar.ts     the four Seasons a policy reads, as the AI's own closed word set
    site.ts         the tile a policy plans about, and the one Chebyshev distance between two
    siege.ts        Assault and Blockade prosecution
    difficulty.ts   Tiro, Centurio and Imperator settings
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
    game.ts         the Match behind the interface, the real-time loop that drives it, and its end
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
  hooks.ts          every hook and snapshot field a page publishes, by name, so a document can be held to it
  main.ts           the game page's entry
  atelier.ts        the Atelier page's entry
scripts/guard.mjs   the fences
scripts/profiles.mjs        the browser responsibilities, their owner specs and the coverage map
scripts/verify.mjs          the profile entry point: focus, unit, smoke, feature, accept, visual
scripts/selection.mjs       whether a change must take complete acceptance
scripts/selection-rules.mjs the escalation rules, as data and pure functions
tests/              Vitest unit tests
  verify/           the profile inventory and the escalation rules, held to their owners
e2e/                Playwright browser tests (a real browser, so `pixi.js` is allowed)
  hooks.ts          reading a page's hooks from a test, one datum at a time
  fixtures.ts       the `test` every spec runs on: a page watched for the evidence a failure needs
  diagnostics.ts    what that evidence is: the boot report, the snapshot, the console, the errors, the DOM
  evidence.ts       the only writer of visual frames: off unless `SPQR_VISUAL=1`
  smoke.spec.ts     the small real-browser smoke: boot, one Command, frame and console health
docs/PLAN.md        the plan of record
docs/COMMANDS.md    the Command vocabulary an external agent is written from
docs/PROTOCOL.md    the protocol an external agent is written from, and a skeleton agent
docs/BROWSER.md     the hooks an agent driving the page is written from, and what a failure leaves
docs/VERIFICATION.md  the verification profiles, their owners, the CI gates and the budgets
examples/agent.ts   an agent written from that document, importing nothing from this repository
```

Further modules from the plan's architecture (`audio/`) arrive with the tickets
that need them, under `src/`.

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
  GPU's pixels, so the men on screen are the generator's. Since E4 a whole Match
  is played in the browser too: the page is paused, ordered about and
  fast-forwarded to its bound, which is 42 minutes of Match time in about a second
  because the wall clock is skipped rather than accelerated (ADR-0022). Every spec
  runs on `e2e/fixtures.ts`, so a failure attaches the page's own account of itself
  — boot report, snapshot, state hash, console, errors, DOM — instead of a
  screenshot, and the surface itself is held to its document and to its interfaces
  by `e2e/surface.spec.ts` and `tests/render/browser-docs.test.ts`.

The browser suite is selected by [responsibility](docs/VERIFICATION.md), not run
whole for every change: `npm run test:smoke` boots the real page in under ninety
seconds, `npm run test:feature -- orders` runs one owner, `npm run test:accept`
runs every spec with captures off, and `npm run test:visual` is the explicit
request for frames. In CI, `main` is the integration gate: a pull request into
`main` and a push to `main` take the smoke and complete acceptance, while a
`develop` pull request runs the fast checks and opts into Chromium with the
`browser` label. A merge into `develop` runs the smoke as a post-merge net.
