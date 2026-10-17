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
| `npm run dev`       | Development server on `http://127.0.0.1:5173/`                         |
| `npm run build`     | Type-checks, then builds the static site into `dist/`                  |
| `npm run preview`   | Serves the built site on `http://127.0.0.1:5174/`                      |
| `npm run check`     | TypeScript in strict mode, all three projects, no emit                 |
| `npm run lint`      | ESLint over the repository                                             |
| `npm run guard`     | The fences: `pixi.js` under `render/`, and no `Math.random`, transcendentals or ambient clock in the simulation |
| `npm run match`     | One whole Match headless, as a JSON report, with no build step         |
| `npm test`          | Unit tests (Vitest, Node)                                              |
| `npm run test:e2e`  | Browser tests (Playwright, headless Chromium, software WebGL)           |
| `npm run verify`    | Lint, check, guard, unit tests and build in one go                      |

The first `npm run test:e2e` installs Chromium if it is missing; CI installs it
with `--with-deps` in its own step.

## The fences

Five architectural rules are cheap now and expensive later, so CI enforces them
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

The walk behind the `Math.random`, transcendental and ambient checks is
syntactic, and it says so instead of pretending to be complete. It sees a global
spelled out — `Math.random`, `Math["random"]`, `Math?.random`,
`const { random } = Math`, `Date.now()` — and it does not see through an alias, a
`globalThis`, or a name built at runtime: `const M = Math; M.random()`,
`globalThis.Math.random()`, `Math['ran' + 'dom']()`, `const D = Date; D.now()`
and `new Date()` all pass the guard today. A green tick means the ordinary
spellings are absent, not that no other spelling exists.

`npm run guard` walks all five fences. On a breach it prints the offending file,
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
  "hash": "bf3d192e9ab9eb5f"
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
that moves the hash is a decision in review (ADR-0006).

The exit codes are the same three `npm run guard` uses: **0** the Match ran,
**1** a game invariant was violated — a hash that is not the expected one, a
Command outside the vocabulary, a float where state must be integers — and **2**
the command line was misused. A violated hash still prints the report first: the
interesting number is the one the Match ended on.

Today the Match is empty, on purpose: no system has been built yet, so nothing
can be lost and the tick bound is what ends the run (`src/sim/empty.ts`).
`--rules` chooses which harness Match the CLI plays, and `--rules draws` plays
one whose rules draw from the seed on every tick, so the golden hash in CI covers
the draw loop as well as the seed expansion (`src/cli/rules.ts`). The harness
around it is the point, and the waves that build the world change what is inside
it rather than how it is driven.

The command needs no build step. Node strips the types and runs `src/cli/main.ts`
as it stands, which is why every relative import under `src/` names its extension
(`./command.ts`) — see [ADR-0009](docs/adr/0009-the-cli-runs-the-source-with-node.md).

## Layout

```
index.html          the page Playwright drives
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
    empty.ts        the Match with no systems in it yet: what the CLI plays today
  cli/              the headless Match as a command
    arguments.ts    what the command line means, and what it refuses
    rules.ts        the Matches a run can play, by name, and what each draws
    run.ts          playing one Match, and the hash invariant the CLI checks
    report.ts       the JSON report, ordered and free of anything that varies
    main.ts         the entry: standard output, standard error, exit codes
  render/           the application's one PixiJS-aware layer
scripts/guard.mjs   the fences
tests/              Vitest unit tests
e2e/                Playwright browser tests (a real browser, so `pixi.js` is allowed)
docs/PLAN.md        the plan of record
docs/COMMANDS.md    the Command vocabulary an external agent is written from
```

Further modules from the plan's architecture (`content/`, `ai/`, `art/`,
`audio/`, `ui/`) arrive with the tickets that need them, under `src/`.

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

- **Unit tests** live in `tests/` and run in Node. Determinism, invariants and the
  guard rules belong here.
- **Browser tests** live in `e2e/` and run in headless Chromium. The page
  publishes its state on `window.__SPQR` (ADR-0003), which is how Playwright
  inspects the running game; `--enable-unsafe-swiftshader` lets WebGL fall back
  to SwiftShader on a machine with no GPU.
