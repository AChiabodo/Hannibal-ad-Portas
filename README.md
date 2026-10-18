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
with the settlements standing on it, and C1 adds the Squads that walk on it. The
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
a drag, zoomable with the wheel, at whole-number magnifications only.

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
`render/view.ts` holds the three numbers that decide the page (seed, zoom,
viewport) where a Node test can reach them without loading PixiJS.

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

## The seam

One seam carries every decision in the game (PLAN §3, ADR-0003). A **Controller**
reads an **Observation** and emits **Commands** — and the human input handler,
the built-in AI, a scripted test driver and an external agent are all
Controllers, differing in nothing else.

- An **Observation** is the world filtered for one Faction, stamped with the
  Faction and the tick being decided. It is the only thing a Controller is
  handed, and reaching past it does not compile: a test in
  `tests/sim/controller.test.ts` fails if Match state ever becomes readable
  through one.
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
that moves the hash is a decision in review (ADR-0006). It plays four more: the
default Match over its whole three-year bound, the clock's own `seasons` Match,
the engine-only `empty` Match, and one that draws on every tick, so the economy,
the clock, the seed expansion and the draw loop are each gated rather than
inferred from the others.

The exit codes are the same three `npm run guard` uses: **0** the Match ran,
**1** a game invariant was violated — a hash that is not the expected one, a
Command outside the vocabulary, a float where state must be integers — and **2**
the command line was misused. A violated hash still prints the report first: the
interesting number is the one the Match ended on.

Today the Match has a theatre, a clock and an economy (B1, B5, B6): its world is
the map the seed generated, the calendar, and the settlements standing on it, and
the tick bound is what ends the run (`src/sim/economy-match.ts`). `--rules`
chooses which harness Match the CLI plays: `economy` is the default, `seasons` is
the clock on its own, `empty` is the engine and the seam alone, and `draws` plays
one whose rules draw from the seed on every tick, so the golden hash in CI covers
the draw loop as well as the seed expansion (`src/cli/rules.ts`). The harness
around it is the point, and the waves that build the world change what is inside
it rather than how it is driven.

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
    economy.ts      settlements, labour, the four resources, tiers and Payroll
    economy-match.ts  the Match that joins the map, the clock and the economy
  content/          the typed tables the rules read: resources, Squad types, buildings
  art/              pure pixel generation: PixelBuffer in, PixelBuffer out (no engine imports)
    pixel-buffer.ts the one currency: RGBA bytes, the drawing primitives and the pixel hash
    palette.ts      nine bases, and the ramps derived from them by integer arithmetic
    font.ts         the bitmap font: 5×7 letterforms, an accent band, every glyph the UI needs
    terrain.ts      the seven materials, the five dual-grid shapes, the six road pieces
    nodes.ts        the four resource markers: a sheaf, two logs, a heap and a diamond
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
  render/           the application's one PixiJS-aware layer
    camera.ts       a whole-pixel position and a whole-number zoom, and no smoothing
    stage.ts        the adapter: PixelBuffer to texture, the camera on a container, the frame read back
    terrain.ts      the map composed into one image: ground, roads over it, markers over those
    view.ts         the seed, zoom and viewport the page opens on, with no engine in sight
    boot.ts         the game page's boot: the theatre, the camera, the pointer, the debug hooks
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

Further modules from the plan's architecture (`ai/`, `audio/`, `ui/`)
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
  against the same pixels generated in Node, point for point.
