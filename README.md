# SPQR — Hannibal ad Portas

A browser real-time strategy game of the Second Punic War: Rome against Carthage
on an abstract Italic theatre, with an economy, Squads that break rather than die,
and sieges that can be starved as well as stormed.

Everything on screen, in the speakers and on the HUD is produced by code: no
image, audio or font file is ever committed (ADR-0002).

Start with [docs/PLAN.md](docs/PLAN.md). Vocabulary lives in
[GLOSSARY.md](GLOSSARY.md) and the decisions behind the plan in [docs/adr/](docs/adr/).

## Requirements

- **Node 22** (see `.nvmrc`; `vitest` needs 22.12 or newer) and npm.
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
| `npm run guard`     | The two fences: import guard and `Math.random` guard                   |
| `npm test`          | Unit tests (Vitest, Node)                                              |
| `npm run test:e2e`  | Browser tests (Playwright, headless Chromium, software WebGL)           |
| `npm run verify`    | Lint, check, guard, unit tests and build in one go                      |

The first `npm run test:e2e` installs Chromium if it is missing; CI installs it
with `--with-deps` in its own step.

## The fences

Two architectural rules are cheap now and expensive later, so CI enforces them on
every push:

1. **Nothing reachable from the simulation may import the rendering engine**
   (`pixi.js`). `sim/` must run in Node so an agent can play a whole Match
   headlessly (ADR-0001, ADR-0003).
2. **Nothing anywhere may call `Math.random`.** The simulation is seeded through
   `xmur3` into `sfc32`, and a replay is a seed plus a command log (ADR-0006).

`npm run guard` walks both fences. On a breach it prints the offending file, the
line, and — for reachability — the chain that got there:

```
FAIL  guard: simulation boundary     1 violation(s), entry src/sim
        src/art/palette.ts:1:1  imports "pixi.js" — pixi.js must never be reachable from the simulation (ADR-0001)
          how: src/sim/index.ts → src/art/palette.ts → pixi.js
```

The rules are deliberately crude and deliberately loud. A guard that cannot see
through an import says so instead of staying quiet.

## Layout

```
index.html          the page Playwright drives
src/                application code
  sim/              the Match: map, economy, squads, combat, siege (no engine imports)
  render/           the only place `pixi.js` exists
scripts/guard.mjs   the fences
tests/              Vitest unit tests
e2e/                Playwright browser tests
docs/PLAN.md        the plan of record
```

Further modules from the plan's architecture (`content/`, `ai/`, `art/`,
`audio/`, `ui/`, `cli/`) arrive with the tickets that need them, under `src/`.

## Continuous integration

| Workflow                       | Trigger                   | What it proves                                                  |
| ------------------------------ | ------------------------- | --------------------------------------------------------------- |
| `.github/workflows/ci.yml`     | every push, every PR      | install, lint, strict types, build, unit tests, fences, browser |
| `.github/workflows/pages.yml`  | push to `main`, manual    | the static build deploys to GitHub Pages                        |

### Deployment

Pages serves `main` at `https://<owner>.github.io/2DSQPR/`; the workflow sets
`PAGES_BASE` so Vite emits assets under that path.

The deploy workflow needs Pages enabled for the repository with **GitHub Actions**
as the source (Settings → Pages). Until that setting exists the workflow fails at
`actions/configure-pages` and says so. On a private repository this also requires
a plan that includes Pages.

## Testing

- **Unit tests** live in `tests/` and run in Node. Determinism, invariants and the
  guard rules belong here.
- **Browser tests** live in `e2e/` and run in headless Chromium. The page
  publishes its state on `window.__SPQR` (ADR-0003), which is how Playwright
  inspects the running game; `--enable-unsafe-swiftshader` lets WebGL fall back
  to SwiftShader on a machine with no GPU.
