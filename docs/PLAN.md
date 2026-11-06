# SPQR — Hannibal ad Portas

Development plan for v1. Domain vocabulary lives in [GLOSSARY.md](../GLOSSARY.md); the decisions behind this plan are in [docs/adr/](adr/).

## 1. The game

A browser real-time strategy game set in the Second Punic War, in an abstract Italian theatre: **Rome** against **Carthage**. A **Match** is one continuous map carrying economy, army command and siege — there is no separate battle scene. Roughly 25–45 minutes, 2–3 game years.

The player manages a real economy (land, labour, four resources, denarii, per-settlement stocks) and commands **Squads**: blocks of soldiers with aggregate strength and morale whose men are drawn but never simulated individually. A Match ends when the enemy **Stronghold** falls, or when the enemy has neither settlements nor Squads left.

The two Factions are asymmetric by system, not by statistics:

| | Rome | Carthage |
|---|---|---|
| Character | Disciplined, durable, slow to replace | Mercenary coalition, cheap but fragile, dependent on Payroll |
| Supply | Interior lines; strong Territory | Far from home; weak Territory in Italy |
| Field | **Castrum**: fortified camp, rest and recover in the field | No camp |
| Siege | **Assault** with the ram, or **Blockade** | **Blockade only** |

The Carthaginian asymmetry is the historical one: Hannibal could not take the fortified towns of Italy. It is deliberate, it is the plan's single largest balance risk, and §8 states the escape hatch.

### Non-goals for v1

Multiplayer; saves; diplomacy; naval warfare; a scripted historical campaign; separate battle scenes; generals or heroes; a technology tree; razing settlements; siege towers, multiple ladders, mines or artillery; mobile browsers.

## 2. Hard constraints

1. **Every pixel, sound and glyph is produced by code.** No image, audio or font file is ever committed, and no image-generating model is used at any point. (ADR-0002)
2. **2D browser game in TypeScript, rendered by PixiJS 8** (pinned to 8.22.0 or later in the 8.x line). (ADR-0001)
3. **The game must be fully playable and verifiable headlessly by an agent** — a complete Match from the CLI, in a deterministic replay. (ADR-0003)
4. **Code, identifiers, issues and documents in English. Player-facing text in Italian**, behind a string table with an English fallback path.

## 3. Architecture

### Modules and import rules

Boundaries are enforced in CI, because they are what makes headless testing possible rather than a matter of taste. The reachability fences start from every root the plan counts as the simulation — `sim/`, `ai/` and `content/` — because ADR-0001 counts the AI as part of the simulation even though it lives beside `sim/`; a root that does not exist yet is skipped, so the day it appears it is already fenced. A separate check allows `pixi.js` only under `render/`, which is what makes the `art/` and `render/` rules below true.

- **`sim/`** — the Match: map, visibility, seasons, economy, Squads, combat, siege, victory. Pure TypeScript. Imports nothing from `render/`, `art/`, `ui/` or `ai/`, and never `pixi.js`.
- **`content/`** — Factions, Squad types, buildings, costs, as typed TypeScript data. No runtime parsing, no fetching. Fenced as part of the simulation, on the same terms as `ai/`.
- **`ai/`** — Controllers that reason. May import an Observation's *types*; never the internals of `sim/`. Fenced as part of the simulation: nothing reachable from here may import `pixi.js` or use arithmetic ECMA-262 leaves implementation-approximated.

D1's [AI contract](AI.md) documents the three clocks, independent behaviour
registration and scored decision logs. The AI import fence follows local helpers
and re-exports, and is enforced by `guard` and `build`.
- **`art/`** — pure pixel generators: `PixelBuffer` in, `PixelBuffer` out. Never imports `pixi.js`, enforced by the render allow-list.
- **`audio/`** — score and effects described as data, synthesized by a WebAudio adapter.
- **`render/`** — the only place `pixi.js` exists, enforced. Converts `PixelBuffer` into `BufferImageSource`; owns camera, culling and picking.
- **`input/`** — the human's hands: the selection and the control groups, which are the Player's memory and not state, and the Controller that turns an order into a Command (C2).
- **`ui/`** — Italian HUD, string table, minimap.
- **`cli/`** — headless runner and the external-agent protocol.

### The one seam

A Controller observes an Observation and emits Commands. Four implementations: the human input handler, the built-in AI, scripted test drivers, and an external agent. Nothing else in the system decides anything, which is what makes an AI-vs-AI Match a test rather than a demo.

The Command vocabulary is closed: **Move, Attack-move, Attack, Hold, Garrison, Withdraw, Build, Recruit, Assault, Blockade**, plus formation (acies) and control groups. Adding a Command means implementing it twice — once for a human clicking and once for a machine emitting it — so the set is deliberately small.

### Determinism

- Fixed **10 Hz** tick with an accumulator; the renderer interpolates. A headless Match runs about ten times faster than real time, which is what turns a balance tournament from an overnight job into a coffee break.
- **Authoritative state is integers only.** Derived floats are fine as long as they never feed state or the hash.
- **No `Math.sin`, `cos`, `exp`, `pow`, `log` or `**` anywhere the simulation reaches (`sim/`, `ai/`, `content/`)** — ECMA-262 leaves them implementation-approximated, so they are not portable across engines; the operator is `Math.pow` under another spelling (`Number::exponentiate`) and is banned with no integer-exponent carve-out. Lookup tables and integer approximation where geometry is needed.
- **`sfc32` seeded through `xmur3`.** `Math.random` is banned repository-wide.
- **The state hash is part of the tick contract.** Changing it is a decision, never an accident.
- A **replay is a seed plus a command log** — not a video. Free, given the above, and it is what lets CI reproduce a bug an agent reported.

### The pixel pipeline

One type crosses everything: `PixelBuffer`, a `Uint8ClampedArray` of RGBA with dimensions.

generator (`art/`, pure) → bake at build time (gitignored artefacts) → `BufferImageSource` at runtime (`render/`, the only PixiJS-aware step) → `renderer.extract.pixels` for agent-readable verification.

PixiJS 8 does not accept `ImageData` as a texture source and has no official headless Node path, so `art/` and `sim/` must stay PixiJS-free for tests to run in Vitest at all. Both facts come from research, not preference.

### The Atelier

A debug page that renders the entire generated catalogue: every Squad figure in every direction and frame, every building and its damage states, every terrain variant, every glyph of the font, on a neutral background at several zoom levels. Art nobody can see is art nobody can fix, and this page is also the surface an agent inspects instead of guessing from code.

## 4. Systems, as decided

**Map.** `generateMap(seed) → MapGrid`, a pure function on a **160×160** grid of 16×16 tiles (ADR-0030). Organic, not mirrored, with invariants that tests assert: full land connectivity, resource parity between halves within tolerance, at least N fords per river, separated maximum settlement grounds, every settlement reachable. Contents: 2 Strongholds, 6–8 capturable minor settlements, rivers with fords, occasional inland lakes and slowing marshes, forests, hills, resource nodes (grain, timber, stone, iron), roads generated as paths joining the nodes. Reserved grounds remain walkable except for actual structures and started Works. Not the real Italy — an abstract Italic theatre.

**Terrain.** Orthogonal top-down, square tiles, sprites drawn three-quarter. **No playable elevation** (ADR-0007): the heightmap is generative noise for placing biomes, never a height. Terrain *types* carry the modifiers: plain, hill (defensive), forest (conceals, penalises cavalry), ford (disorders), road (speed), farmland. Terrain tiles are autotiled with the **dual-grid technique — five tiles plus rotation**, not forty-seven variants.

**Fog of war.** Unexplored black, explored-but-unobserved dimmed, visible clear, with memory of terrain and of the **last known enemy contact**. Vision by radius per tile; no elevation-based line of sight in v1. An omniscient inspection mode exists for debugging only: it is not a Player and cannot emit Commands.

**Time.** A **Season** is 3–4 minutes; a game year is 13–16 minutes. Spring and summer are campaign season; autumn is harvest; **winter** brings Attrition outside friendly Territory and favours the defender, and the AI keeps winter quarters. Three speeds, and a real pause with queueable orders. A Match is bound to **3 game years**, in a browser and headless alike, so that every Match always terminates and one can be watched — or fast-forwarded — to its end (ADR-0022).

**Economy.** No worker units (ADR-0005). Population is a pool allocated to buildings and land; production matures on a timer; **resources accumulate per settlement** while denarii form one treasury. Construction is a labour allocation plus a timer. Three settlement tiers gate Squad tiers — the progression *is* the tiers, so there is no technology tree. **Payroll** is charged every Season: unpaid Carthaginian Squads lose morale and eventually desert.

**Squads.** The atomic unit (ADR-0004). Pathfinding is A* on the 160×160 grid with bounded path caching and shared formation footprints. Formations matter in space and combat. Gates and Breaches use real marching columns and one-Squad FIFO traffic; no individual soldier paths (ADR-0030).

**Combat.** Morale-primary: **Squads break, they do not die to the last man.** Levers: the matchup matrix (`spear > cavalry > light > archers > spear`), flanking and rear attacks as morale shock as well as damage, terrain, fatigue, ammunition, faction character, Payroll, and being cut off from Territory. Rout is automatic and rallying is automatic — no micro-recovery, consistent with ADR-0004. No generals. Corpses are visual residue that fades after about thirty seconds and never touches state.

**Siege.** Walls have hit points. **Assault** is fast and expensive: it needs the **ram**, which only Rome can build, and an assault without a breach is possible but punishing. **Blockade** is slow and cheap in lives: it cuts supply and starves a settlement into surrender, and it can be broken by the besieged Faction's field army. Minor settlements are captured by holding their centre; nothing is razed in v1.

**AI.** Three utility-scored layers on the three clocks the game already has: **strategic** (per Season: posture, budget, objective selection), **operational** (per ~30 seconds: task assignment, build orders, recruitment composed to counter the *observed* enemy, assault versus blockade), **tactical** (per tick: facing, targets, reserves, withdrawal). Plus a per-region **threat map** for defence and **scouting** with a fraction of light Squads keeping last-known contact current. Difficulty — *Tiro*, *Centurio*, *Imperator* — changes planning horizon, aggression, reaction time and scouting quality, **never** resources or vision. Every decision logs its utility scores, so a bad decision can be read rather than guessed at.

**Audio.** Synthesized, no files: a seeded composer (modal progressions, aulos, lyre, horn, filtered-noise percussion) with two or three layers that respond to the state of the war, plus synthesized effects. Muted in CI.

**Font.** A bitmap font defined in code, 5×7 for the HUD plus large numerals for resources. A direct consequence of the no-external-assets constraint that is easy to notice too late.

## 5. Definition of Done for v1

1. A complete Match is playable in the browser, both Factions, from start to victory, with fog, seasons, economy, siege by assault **and** by blockade.
2. Zero external assets: everything generated, font and audio included. UI in Italian.
3. The CLI plays a full Match headless and prints a JSON result, with verified determinism.
4. **An external agent completes a Match over the CLI protocol**, and that Match is reproducible from its seed and command log.
5. Balance is **measured**: 200 AI-vs-AI Matches on distinct seeds at equal difficulty produce a win rate between 45% and 55%, a median duration of 25–45 minutes, and **fewer than 5%** of Matches decided by the clock.
6. The Atelier renders the whole catalogue and the pixel-hash tests are green.
7. 60 steady fps in desktop Chrome at full density: about 1200 sprites plus fog plus minimap.
8. Desktop Chrome and Firefox are primary, Safari best-effort, mobile out of scope.

## 6. Measurement

- **Unit and property tests** on `sim/`: `generateMap` invariants over 1000 seeds, economy, morale, the matchup matrix.
- **Determinism tests**: same seed and same command log imply an identical state hash.
- **Headless AI-vs-AI tournaments** as both integration test and balance instrument — this is where DoD 5 is measured, and the reason for the 10 Hz tick.
- **Pixel-hash tests** on `art/` output.
- **Playwright** in a real browser for boot, HUD, orders and one short Match, with `--enable-unsafe-swiftshader` for software WebGL in CI.
- **Import guards**: `sim/` never sees PixiJS; `ai/` never sees the internals of `sim/`.
- Not tested: pixel-perfect HUD assertions (it will change) and fuzzing of input signals.

## 7. Tickets

Thirty-one tickets in six waves. Each is a tracer bullet: a narrow but complete path, verifiable on its own, sized for one fresh context window. Blocking edges are native on the tracker.

### Wave A — Foundations (strictly sequential)

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| A1 | Repo scaffold, tooling and CI | `npm run dev/test/build/check` work; TypeScript strict, Vitest, Playwright, lint, import guards and a Pages deploy workflow all green in CI | — |
| A2 | Deterministic core skeleton | A Match that ticks at 10 Hz on integer state with `sfc32`/`xmur3`, hashes its state, and replays exactly from a seed plus a command log | A1 |
| A3 | The Controller seam | Controller/Observation/Command with a scripted driver; type-level and test-level proof that a Controller cannot reach raw state | A2 |
| A4 | Headless CLI Match | `sim` runs a complete Match headless, prints a JSON result, and exits non-zero on an invariant violation | A3 |

### Wave B — The world

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| B1 | Map generation | `generateMap(seed)` with terrain, rivers, fords, resources, settlements and roads; invariants asserted over 1000 seeds; dumpable from the CLI | A2 |
| B2 | Art bootstrap, font and camera | `PixelBuffer`, palette ramps, the bitmap font, the PixiJS render adapter, pan and integer zoom, the Atelier page — the first pixels on screen | A1 |
| B3 | Terrain on screen | Dual-grid autotiled terrain, a generated map rendered and pannable at several zooms | B1, B2 |
| B4 | Fog of war | Visibility grid in `sim/`, Observation filtered by it, fog rendering, terrain and last-contact memory | A3, B3 |
| B5 | Seasons and the clock | Season and year advance, harvest and winter hooks, three speeds, pause with queueable orders, bounded clock in headless mode | A2 |
| B6 | Settlements and economy | Labour allocation, four resources plus denarii, per-settlement stock, production, harvest, three settlement tiers, Payroll | B1, B5 |
| B7 | Italian HUD and minimap | String table, resource and season readouts, selection panel, minimap | B2, B3, B6 |

### Wave C — The war

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| C1 | Movement and formation | A* pathfinding with caching, Squad movement, formations, and facing | B1 |
| C2 | The first playable Match | Paper-doll Roman Squads rendered in formation, selection, order issuing, control groups — a human moves Squads on a map | B2, C1 |
| C3 | Combat and morale | Aggregate attrition, the matchup matrix, flanking, terrain, fatigue, ammunition, rout and rally | C2 |
| C4 | The Carthaginian roster | The Carthaginian Squad types including elephants, plus form-and-silhouette differentiation from Rome | C2 |
| C5 | Siege | Walls, the Roman ram, assault, blockade and starvation, settlement capture, Stronghold fall and Match end | B6, C3 |
| C6 | Territory and Attrition | Territory inference from settlements, out-of-territory Attrition by Season, minor-settlement conquest | C5 |

### Wave D — The intelligence (sequential: one writer per module)

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| D1 | AI skeleton with logged utility | The three layers, utility scoring with per-decision logs, an Observation hardened against leakage | B6, C3 |
| D2 | Economy AI | Build orders, settlement tiers, labour allocation, recruitment and Payroll management that survives three years | D1 |
| D3 | Military AI | Threat map, army composition answering the observed enemy, attack and withdrawal, reserves | D1 |
| D4 | Scouting AI | Light-Squad exploration keeping last-known contact current, and using it | B4, D1 |
| D5 | Siege AI and difficulty | Assault-versus-blockade decisions, Stronghold prosecution, and the three difficulty levels | C5, D3 |

### Wave E — The agent

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| E1 | External agent protocol | A documented text protocol on stdin/stdout over which an external agent plays a full Match | A4, C5 |
| E2 | Replay record and verify | Replays recorded as seed plus command log, replayed by CLI, with a divergence report | A2, C5 |
| E3 | Tournament harness and balance report | Batched AI-vs-AI Matches producing win rate, duration distribution, clock-decision rate and per-decision AI logs | D5, E2 |
| E4 | Browser debug hooks and E2E | `window.__SPQR` state, pause and fast-forward hooks, Playwright coverage of boot, HUD, orders and a short Match | B7, C2 |

### Wave F — Finishing (parallel: disjoint modules)

| ID | Ticket | What it delivers | Blocked by |
|---|---|---|---|
| F1 | Balance pass | The DoD 5 numbers reached, with the ram asymmetry resolved on evidence | E3 |
| F2 | Audio | Synthesized effects and an adaptive procedural score, muted in CI | B2 |
| F3 | Performance pass | 60 steady fps at full density, measured and reported | C4, E4 |
| F4 | Release | DoD verified end to end, Pages deployment live, README and onboarding | F1, F2, F3 |

## 8. Risks

| Risk | Why it matters | Response |
|---|---|---|
| **The ram asymmetry breaks balance** | Carthage cannot assault, so if Blockade is too slow Carthage cannot win and the win rate collapses | It is the first thing F1 measures on tournament data. Escape hatch, decided in advance: give Carthage a ram |
| **Procedural art has a quality ceiling** | Generated sprites can read as noise, and the ceiling is discovered late | Atelier from day one, palette discipline, and form-based Faction differentiation so legibility does not depend on colour |
| **Aggregate combat feels flat** | No micro means the fun must come from morale, terrain and timing, not from clicking | Morale-primary resolution, visual attrition, and routs as the dramatic beats |
| **PixiJS has no headless Node path** | Tempting to reach for Pixi in `sim/` for convenience, which would silently kill headless testing | The import guard is CI-enforced from A1 |
| **Determinism drifts as systems grow** | One float in hashed state breaks replays and turns tournaments into noise | Integer-only state, banned transcendentals, hash tests on every tick contract |
| **Scope: thirty tickets is a large v1** | The most likely failure is a half-built engine with no game | Explicit DoD and non-goals; each wave ends in something playable or measurable |
| **"Reasonably advanced AI" is vague** | An unfalsifiable promise invites an AI that only looks busy | Utility scores are logged, so behaviour is inspectable; tournaments measure outcomes |
| **Software WebGL in CI** | Headless Chromium fails without the right flag | `--enable-unsafe-swiftshader`, verified in A1 |

## 9. Out of scope

Everything listed under non-goals in §1, plus: rendering data exported to external tools, mod support, a map editor, and any player-facing replay UI (replays stay a CLI and CI instrument in v1).
