# The browser's debug hooks

The running game is not a black box (ADR-0003, [ADR-0022](adr/0022-a-match-in-a-browser-ends-at-its-bound.md)).
Every page publishes what it booted, what it is looking at, what the Match believes,
and the calls that move it — on `window.__SPQR`, from the first day the page existed,
because hooks bolted onto a user interface afterwards cost more than hooks designed
into it. This document is what a browser test, or an agent driving the page over
Playwright, is written from; its siblings are [COMMANDS.md](COMMANDS.md), the
vocabulary a Controller answers with, and [PROTOCOL.md](PROTOCOL.md), the pipe an
outside process plays a Match over.

Two pages publish the same shape. The game is `/`, the catalogue of generated art is
`/atelier.html`, and whichever of `view`, `game` and `atelier` is not this page is
`null` — so one inspection routine reads either.

## Opening the page

`npm run dev` serves both pages. A page marks itself booted on the body, and says
whether it worked, so a test never waits on a timeout:

```js
await page.goto('/');
await page.locator('body[data-spqr-booted="true"]').waitFor();
const { boot, view, game } = await page.evaluate(() => window.__SPQR);
```

`boot` is `{ booted: true, render }` with the renderer's own report — engine, WebGL
version, viewport and the centre pixel of the first frame — or
`{ booted: false, error }` with the reason, which is also what a page that failed
before its interface existed prints in Italian in the DOM.

## What a page publishes

Four fields, always all four, three of them `null` on any page but their own.

<!-- pages:start -->
| Field | What it holds |
| --- | --- |
| `boot` | The boot report: which renderer, and whether the page booted at all |
| `view` | The camera, the fog, the pixel read-back, and the Match behind the interface |
| `game` | The same object as `view` on the game page, by the name of what it is playing |
| `atelier` | The catalogue page's geometry and pixel read-back |
<!-- pages:end -->

The game page's `view` and `game` are one object — one camera, one Match, one answer —
so a hook may be read off either. Its whole surface is the `probe` it booted with,
the camera's hooks and the Match's hooks, and nothing else:

<!-- surface:start -->
| Hook | Signature | Page | What it does |
| --- | --- | --- | --- |
| `probe` | — | both | The frame report the page booted with: engine, viewport, centre pixel |
| `panBy` | `(dx, dy)` | view | Moves the camera by whole stage pixels; refuses anything else |
| `zoomTo` | `(zoom)` | view | Sets a whole-number magnification, keeping the viewport's middle where it is |
| `zoomAbout` | `(zoom, screenX, screenY)` | view | Sets a magnification, keeping one screen pixel where it is |
| `lookFrom` | `(x, y)` | view | Puts the debugging watch on one tile, which is the call a tick makes with a Faction's real eyes |
| `inspect` | `(revealed)` | view | Turns the inspection mode on or off: the whole theatre revealed, and no fog |
| `describe` | `() → ViewState` | view | Where the camera is, how big the viewport is, the seed, the map, the watch and the fog |
| `samples` | `(points) → Rgba[]` | view | Reads the current frame's pixels at canvas points, in the art library's own RGBA |
| `preferences` | `() -> UiPreferences` | Read presentation preferences |
| `setUiScale` | `(scale) -> void` | Request independent integer UI scale |
| `toggleNavigator` | `() -> void` | Toggle the navigator |
| `toggleGuide` | `() -> void` | Open the first-entry guide, or put it away |
| `resetPreferences` | `() -> void` | Restore presentation defaults |
| `centerSelection` | `() -> void` | Centre the selected entity |
| `navigateMinimap` | `(x, y) -> boolean` | Navigate without selecting or ordering |
| `doubleClickAt` | `(x, y) -> void` | Centre the selected list row |
| `submit` | `(command) -> boolean` | game | Validates and queues any existing Command through the human Controller; refuses foreign Factions and ended Matches |
| `configuration` | `() -> MatchConfiguration` | game | A copy of seed, human Faction and opponent difficulty |
| `matchLayout` | `() -> MatchMenu` | game | The actual bitmap menu text, buttons, enabled state and rectangles |
| `restart` | `()` | game | Confirms leaving an active Match, then restarts with the same configuration |
| `newMatch` | `()` | game | Confirms leaving an active Match, then returns to setup with a fresh proposed seed |
| `copySeed` | `() -> Promise<boolean>` | game | Copies the seed to the clipboard; reports success or a visible fallback |
| `hud` | `() → HudModel` | game | The Italian interface's model: the words and figures it is showing |
| `selection` | `() → Selection` | game | What the Player has picked: the Squads an order goes to, and the settlement the panel shows |
| `select` | `(selection), null to clear` | game | Selects a settlement or a Squad as the panel does |
| `hudRects` | `() → Rect[]` | game | Every rectangle the interface covers, which is what the theatre cannot be read through |
| `hudRows` | `() → RowRect[]` | game | Where each selectable row stands, so a test presses the row a Player would |
| `hudLayout` | `() → HudLayout` | game | The text, button rectangles, enabled states and scroll windows actually drawn |
| `scrollHud` | `(region, lines)` | game | Scrolls `list`, `detail`, `commands` or `notices` by whole bitmap text lines, without changing selection or the Match |
| `perform` | `(orderId) → boolean` | game | Performs one contextual action: arms it when it needs a target, submits it otherwise, through the shared human Controller |
| `cancelTargeting` | `() → boolean` | game | Cancels the armed action and nothing else: a Command already submitted is never taken back |
| `targeting` | `() → string or null` | game | The id of the action waiting for a target, or `null` |
| `targetAt` | `(screenX, screenY) → boolean` | game | Completes the armed action on the tile, enemy or settlement under a screen point |
| `targetSettlement` | `(settlement) → boolean` | game | Completes the armed action on a settlement a list row named |
| `setTab` | `(tab) → void` | game | Opens one page of a settlement's panel: `overview`, `construction` or `recruitment` |
| `groupBack` | `() → boolean` | game | Picks the control group an individual exception was opened from |
| `squads` | `() → SquadReport[]` | game | The Faction's Squads, each with the theatre rectangle its men are drawn in |
| `corpses` | `() → Corpse[]` | game | The men who fell lately where this Faction can see them, as residue |
| `notices` | `() → Notice[]` | game | The current-Match notice journal: standing conditions first, then the recent events, newest first |
| `centerNotice` | `(id) → boolean` | game | Centres the place a notice names, or marks it lost when the Faction no longer knows it |
| `indicators` | `() → SquadIndicator[]` | game | What the theatre annotates about each Squad: Morale, conditions, facing, destination mark and standard |
| `noticesOpen` | `() → boolean` | game | Whether the notice history is open |
| `toggleNotices` | `()` | game | Opens or closes the notice history, as its own control does |
| `selectAt` | `(screenX, screenY, additive?)` | game | Picks whatever is under a screen point: one click, with or without a shift |
| `selectIn` | `(fromX, fromY, toX, toY, additive?)` | game | Picks every Squad a box dragged between two screen points touches |
| `orderAt` | `(kind, screenX, screenY) → boolean` | game | Gives the picked Squads a `move` or an `attackMove` to the tile under a screen point |
| `orderNow` | `(kind) → boolean` | game | Gives the picked Squads a `hold` or a `withdraw` |
| `setFormation` | `(shape) → boolean` | game | Sets the shape the picked Squads hold: a `formation` Command |
| `bindGroup` | `(index) → boolean` | game | Binds the picked Squads to a control group |
| `recallGroup` | `(index) → boolean` | game | Picks the Squads a control group holds, as pressing its digit does |
| `groupOf` | `(index) → number[]` | game | The Squad ids a control group holds |
| `tick` | `() → number` | game | The tick the Match is on |
| `advance` | `(ticks)` | game | Steps a whole number of ticks with no wall clock; refuses a count that would run past the Match's end |
| `bound` | `() → number` | game | The tick the Match ends on |
| `result` | `() → MatchResult or null` | game | How the Match ended, or `null` while it is still being played |
| `state` | `() → GameSnapshot` | game | Everything the page believes, as one plain-data copy |
| `hash` | `() → string` | game | The fingerprint of the authoritative state, which is what two runs can be compared on |
| `fastForward` | `() → MatchResult` | game | Plays the Match to its end without waiting for wall time, and says how it ended |
| `pause` | `()` | game | Stops the real-time clock |
| `resume` | `()` | game | Restarts it, without charging the Match for the time spent paused |
| `paused` | `() → boolean` | game | Whether the clock is stopped |
| `speed` | `() → Speed` | game | The pace: 1×, 2× or 3× |
| `setSpeed` | `(speed)` | game | Sets the pace, which is a property of the loop and never of the Match |
| `minimapSamples` | `(points) → Rgba[]` | game | The generated minimap, sampled in the same currency the frame is |
| `knowledge` | `() → Knowledge[]` | game | What the Faction knows of each tile, row-major: unexplored, remembered or in view |
| `showSquads` | `(visible)` | game | Shows or hides the blocks of men: a lens for comparing the theatre, which changes nothing about the Match |
| `showSettlements` | `(visible)` | game | Shows or hides the settlements' structures: the same kind of lens, for the pixel comparisons that are about the theatre rather than about what stands on it |
| `sites` | `() → SiteReport[]` | game | Every place the Faction may see — its own, the enemy's it remembers, and nobody's it has looked at — each with the theatre rectangle its structure is drawn in |
| `applied` | `() → LoggedCommand<Command>[]` | game | The Commands the page has applied lately, stamped with the tick, oldest first |
<!-- surface:end -->

A signature is the arguments a caller passes and, where the call answers with
something, the type it answers with; the types themselves are named where they live
(`GameSnapshot` in `render/game.ts`, `HudModel` in `ui/hud.ts`, `LoggedCommand` in
`sim/replay.ts`), because a document that repeated them would be a second definition
of them.

The Atelier publishes three hooks and a frame report of its own. `report` is the
page's geometry — canvas size and every column's zoom and rectangle — `zooms` is the
magnifications it laid out, and `samples` reads its pixels exactly as the game page's
does.

<!-- atelier:start -->
| Hook | Signature | What it does |
| --- | --- | --- |
| `report` | `AtelierLayout` | The page's geometry: its canvas, and every column's zoom and rectangle |
| `zooms` | `number[]` | The magnifications on the page, in the order it laid them out |
| `samples` | `(points) → Rgba[]` | Reads the rendered page's pixels at canvas points |
<!-- atelier:end -->

## What the Match believes: `state()`

One call, one object, one copy. `state()` is the surface an inspecting agent is
written against, and the individual hooks above are how it is assembled: the
snapshot is what the page *is* at one tick, where a sequence of hook reads would be
a sequence of ticks.

<!-- snapshot:start -->
| Field | What it is |
| --- | --- |
| `tick` | The tick the Match is on |
| `bound` | The tick the Match ends on |
| `seed` | The seed the Match was generated from, which is what an onlooker needs to regenerate the theatre |
| `faction` | The Faction the page plays, and the only one whose Observation it reads |
| `paused` | Whether the clock is stopped |
| `speed` | The pace the Match runs at when it is not paused |
| `result` | How the Match ended, or `null` while it is still being played |
| `hash` | The hash of the authoritative state |
| `visible` | The Faction's own Siege Observation, including only allowed fronts and remembered contacts |
| `hud` | The Italian interface's model, as it stands |
| `selection` | What the Player has picked, which is the Player's memory and not the Match's |
| `squads` | The Faction's Squads, each with the rectangle its men are drawn in |
| `sites` | Every place the Faction may see, each with the rectangle its structure is drawn in, and what is known of its walls |
| `corpses` | The dead this Faction can see |
| `notices` | The current-Match notice journal: standing conditions and the recent events |
| `indicators` | What the theatre annotates about each Squad, which is what the annotations were drawn from |
| `knowledge` | What each tile is known as, row-major, one entry per tile of the theatre |
| `applied` | The Commands the page has applied lately, oldest first |
<!-- snapshot:end -->

It is *data*: plain, `structuredClone`-able, and copied by the page before anyone
sees it. Writing through what came back reaches neither the Match, the interface nor
the fog, so an inspector may keep it, diff two of them, or carry it wherever it likes.
It holds an Observation and its drawing, and no part of the rules' own state.

## Pause, fast-forward and the end of a Match

The top bar always says `IN PAUSA` or `IN CORSO`. Its visible pause/resume control,
Space and the `pause`/`resume` hooks update the same state and redraw immediately.
The list headings include entity counts. Use its Su/Giu controls, the wheel over
the column, or PageUp/PageDown to reach overflow. Shift+PageUp/PageDown scrolls
secondary detail; the Order/refusal or first active Work stays above it. Scrolling
never changes selection or zoom. Clicking panel backgrounds keeps selection.
Detail scrolling resets when the selected entity changes, and both offsets clamp
when their contents shrink. These are presentation values, outside the state hash.

The Match's time is whole ticks, and the page plays them in real time at ten hertz:
a Season is three and a half minutes, and a Match is three game years — twenty-five
thousand two hundred ticks, forty-two minutes of Match time (ADR-0022). Two calls
take that away from the wall clock:

```js
// Stop, look, start again. A paused Match's own loop steps no ticks, and the
// orders given meanwhile are held until the first tick after the resume.
await page.evaluate(() => window.__SPQR.game.pause());
// ...inspect, issue orders...
await page.evaluate(() => window.__SPQR.game.resume());

// Play the rest now without waiting for wall time. AI planning still costs CPU
// time; the returned MatchResult is the same shape the headless driver reports.
const result = await page.evaluate(() => window.__SPQR.game.fastForward());
// A victory with its Siege reason, or { kind: 'clock', tick: 25200 }.
```

A pause stops the page's frame loop and nothing else: `advance` and `fastForward`
are a caller's own steps and are not held by it, which is what lets a test step a
Match a tick at a time while the clock is stopped.

`advance(ticks)` is the debugging step beside `fastForward`: exactly that many ticks, no wall
clock, and a refusal when the requested count would run past the bound or the Match has
already ended. A rules victory can stop an advance early, on the exact ending tick. A Match that has ended stops the frame loop,
and `state()` keeps reporting the ending it had; a second `fastForward` answers with
that same result rather than playing anything again.

## What the hooks cannot do

The ticket this surface exists for puts it best: the game exposes its state *without
exposing Commands a Player could not issue*. That is not a convention here, it is the
shape of the surface:

- **One shared submission surface.** `submit(Command)` accepts only the existing
  validated vocabulary, queues through the human Controller and rejects a foreign
  Faction or ended Match. The gesture hooks accept screen points, Formations and
  group digits. `e2e/surface.spec.ts` holds the full-Command entry to exactly
  `submit`; #55 adds its complete visible panels.
- **What they issue is a Player's own.** They hand the Command to the human
  Controller, which the page reads through `validateCommand` and checks for
  ownership: a Command for another Faction is refused with the driver's own error.
  An agent may put itself in a Player's seat; it cannot reach past one.
- **Reading is not reaching.** The snapshot is a copy, `applied()` is a bounded
  record of what was applied and not a door, and the three view hooks that change
  what is drawn — `lookFrom`, `inspect`, `showSquads` — change no state, issue no
  Command, and are the same calls the page's own debugging mode makes.
- **There is no driver here.** The page has no way to start a second Match, to hand a
  Faction to a Controller of its own, or to step the other Faction: a browser Match
  is the one the page opened, played by the one Player at the keyboard.

An agent that wants to play a whole Match as a process — its own Observation each
decision and its own Commands back — wants [PROTOCOL.md](PROTOCOL.md) and
`npm run agent`, not this document. An agent that wants to *watch and drive the page*
wants the hooks above.

## When a test fails

Every spec in `e2e/` runs on the fixture in `e2e/fixtures.ts`, which watches the page
from the moment it is opened. On a failure — and only on a failure — it attaches the
page's own account of itself: the boot report, `describe()`, the snapshot with its
state hash, the console, the uncaught errors and failed requests, and the DOM as
text. Plus the trace Playwright keeps, with `trace: 'retain-on-failure'`.

The state hash is the reason that is evidence rather than a log. Two runs that
disagree about a pixel and agree about the hash are a rendering question; two runs
that disagree about the hash are a rules question, and either way the tick is already
narrowed before anyone reads code. No screenshot is taken, because a picture of a
canvas cannot say which tick it was.


## Setup and the complete browser host (#53)

`/` opens setup, drawn through the existing bitmap/PixelBuffer/PixiJS pipeline.
Click Faction or difficulty to cycle; Tab chooses a field, Left/Right changes
its choice, and Enter activates it. The seed field accepts a decimal unsigned
32-bit integer (including zero); leave it empty to use the displayed proposal.
A proposal draws from the existing deterministic generator, seeded with browser
entropy outside the rules. Invalid seeds disable Start with an Italian explanation.
Setup briefly states the Stronghold objective and the existing three-year horizon.
Setup publishes the boot report and null game/view/atelier fields.

A validated `/?play=1&seed=7&faction=rome&difficulty=centurio` address opens a Match.
The entry is prefixed by Vite's configured base path in a repository Pages build;
setup, Restart and New Match all retain that path without relying on redirects.
`configuration()` reports those three choices. The browser uses the complete
`siegeMatchRules`, `observeSiege`, `siegeMatchOutcome` and existing difficulty AI.
Both Controllers decide in Faction order with independent copied Observations;
no free opening army is added. `submit(Command)` validates and queues through
`HumanController`, just as the existing military gestures do. Both Players stop
while paused; explicit `advance`/`fastForward` remain debugging steps that skip
wall time. `applied()` and snapshot logs expose only human Commands, never the
opponent's hidden plans. Complete visible construction/recruitment/Siege panels
and a full human playthrough remain #55/#59 work.

The bitmap menu shows the actual seed, clipboard control, 1x/2x/3x pace,
Restart (F2), New Match (F3) and Copy seed (F4). Restart preserves all three
configuration fields. New Match returns to setup with a proposal distinct from
the previous seed. Leaving an active Match asks for confirmation, including
browser navigation; menu cancellation restores its previous pause state and
resume resets the wall-time baseline. Native browser unload dialogs use the
browser's own wording. No Match is saved.

The announced ending is the held `MatchResult`: victory/defeat with the actual
Stronghold/path or annihilation reason, draw if supplied by rules, or the three
year clock bound. #53 follows ADR-0022 and the issue owner's follow-up: it
presents the existing `MATCH_TICKS`, without adding a new human deadline. The
announcement persists while selection, detail, camera and minimap remain usable.
Pause and speed controls cannot restart the clock. No Commands can be queued
after the ending, and diagnostic `inspect(true)`/`lookFrom` cannot reveal new
information then. Restart and return to setup remain available.

The old Roman army remains only in `e2e/game-fixture.*` as a composed scenario
for existing drawing/input tests. It is not the normal browser opening. The
functional `setup.spec.ts` tests use the real entry and complete rules; its
short Siege fixture injects initial conditions through the rules composition
seam and reaches the result with actual Commands, never a fabricated UI verdict.


### Desktop presentation hooks

| Hook | Meaning |
| --- | --- |
| `preferences()` | Copy of UI scale, requested navigator visibility and guide dismissal. |
| `setUiScale(scale)` | Request integer 1x, 2x or 3x UI scale independently of map zoom. |
| `toggleNavigator()` | Toggle the navigator preference (Tab). Limited space collapses it temporarily. |
| `toggleGuide()` | Opens the first-entry guide at its welcome line (pausing the clock it now holds), or closes it and records the dismissal (U8, Q11). Its stage and lines are read from `hud().guide`; its controls are `hudLayout().guideButtons`. |
| `resetPreferences()` | Restore presentation defaults; never restores or changes a Match. |
| `centerSelection()` | Centre the camera on the current selection (F or visible button). |
| `navigateMinimap(x, y)` | Navigate at a screen point on the Minimap; return false outside it. |
| `doubleClickAt(x, y)` | Centre a selected list row, as a pointer double-click does. |

Desktop Matches use the available viewport. Below 1280x720, or when a requested UI scale cannot fit,
the canvas remains scrollable at that scale and an Italian recommendation is shown. Requested scale
is never silently changed. Only `spqr.ui.v1` presentation preferences are saved; audio (#30), Match
state and tactical selection are excluded. Storage failure falls back to defaults without blocking play.


The desktop HUD keeps calendar, Treasury, pause and speed above the theatre. The compact navigator
ends after its contents when they fit. Selecting an entity opens two columns of contextual detail;
with no selection only a short hint remains. The Minimap stays available beside this area. Use
**Opzioni / UI** for seed/session actions, scale, reset and the first-entry guide's dismissal or
reopen. This drawer can be closed without changing the Match. The camera centres inside the unobstructed theatre,
including at map edges and zoom 1; the Minimap camera outline covers that theatre rather than the HUD.
A collapsed navigator can be reopened even below the recommended window size.
