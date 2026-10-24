# Verification profiles

How this repository decides what to run for a change, what each profile owns, and
why complete acceptance stays a gate (ticket #64). The commands live in
`scripts/verify.mjs`; the responsibilities live in `scripts/profiles.mjs`; the
bare numbers and the environment they were measured on live in
[the issue #64 report](reviews/issue-64-fast-verification.md).

## The idea

"Run the tests" used to mean two things: every Vitest file, or every Playwright
spec. A one-button change therefore paid for the complete Chromium matrix — both
Factions, 1280×720 and 1920×1080, every frame producer — and a failure arrived
without saying which responsibility it belonged to.

The profiles separate **responsibilities**, not assertion strength:

- a **focused** check runs the non-browser tests that reach a changed file;
- a **smoke** boots the real page, gives one ordinary Command through a real
  gesture, and reads the frame and the console back;
- a **feature** check runs the specs that own one browser responsibility;
- **acceptance** runs every browser spec, with visual captures off;
- **visual** runs the frame producers, with captures on.

No profile loosens a timeout, adds a retry or filters a spec by an arbitrary path.
A quick profile is a *selection of owners*; the assertions are the same ones
complete acceptance runs.

## Commands

| Command | What it runs | Measured on the recorded environment |
| --- | --- | --- |
| `npm run test:focus` | Non-browser tests related to the working tree's changes; the core public seams when nothing is traceable | 1.5 s (changes), 2.2 s (core seams) |
| `npm run test:focus -- src/ui/strings.ts` | Vitest's import graph from one or more changed paths | 11.6 s (14 files, 186 tests) |
| `npm run test:focus -- src/sim/state.ts` | The same, on the most connected module there is | 51.8 s (42 files, 510 tests) |
| `npm run test:unit` | Every non-browser test | 63.2 s warm; not a 60-second promise |
| `npm run test:ai-pressure` | Fixed 60-case passive-human AI matrix, Replay, contact and actual pressure | Non-browser; separate from the focus budget |
| `npm run test:smoke` | `e2e/smoke.spec.ts`: real boot, one Command, rendering, console health and the Atelier | 8.3 s warm (10.9 s with the provisioning pre-step) |
| `npm run test:feature -- <name>` | One browser responsibility from the table below | 10 s (`orders`) up to a few minutes (`squads`, `terrain`) |
| `npm run test:accept` | Every browser spec; no screenshots | 503 s, 148 tests, all passed |
| `npm run test:visual` | The frame producers; PNGs under `SPQR_VISUAL_DIR` | explicit, slow, not a gate |
| `npm run test:profiles` | The responsibility names and their specs | instant |

A *responsibility* is what the code calls a `FEATURES` entry: the name after
`test:feature`. The focused budget holds even for the worst case measured, a hub
module whose import graph reaches 42 files; the whole unit suite is a different,
unbudgeted profile.

`npm run verify` includes `test:ai-pressure` after the unit suite. Every declared
seed 1–10, human Faction and difficulty must pass; a failure exits nonzero.
This headless gate neither launches Chromium nor replaces interactive browser
acceptance, and does not authorize any browser profile.

Extra Playwright arguments pass through. Use the `--flag=value` form for a value
with spaces, because npm re-splits a command line:

```sh
npm run test:feature -- orders --grep=right            # one word: safe through npm
node scripts/verify.mjs feature orders --grep "right click"   # spaces: call the script
```

Each browser profile has a `pretest:` step that runs `playwright install chromium`,
like `test:e2e` always had, so the documented commands work on a fresh clone. A
warm check takes 1.9 s; the cold download is network-bound, runs in CI as its own
step, and is not part of the 60/90-second budgets.

`npm run test:e2e` still runs the whole Playwright directory; it is the old name
for complete acceptance and remains for compatibility. `npm run verify` still
means lint, types, fences, unit tests and build; it never claimed to be browser
acceptance and still does not.

## Browser responsibilities

`scripts/profiles.mjs` is the inventory. `npm run test:profiles` prints it.

| Profile | Owner specs | What it protects | Frames |
| --- | --- | --- | --- |
| `smoke` | `e2e/smoke.spec.ts` | Real boot, one ordinary gesture, frame and console health | no |
| `boot` | `e2e/boot.spec.ts` | The theatre, the camera, every integer zoom, panning and dragging | no |
| `commands` | `e2e/commands.spec.ts` | The shared human submission surface, contextual panels, queued/applied Commands | yes |
| `economy` | `e2e/economy-reference.spec.ts` | Both Factions and resolutions, categories, locked/available offers, Encyclopedia pointer/keyboard return and canonical boundary values | yes (`economy-reference`) |
| `orders` | `e2e/orders.spec.ts`, `e2e/group-orders.spec.ts` | Click and box selection, Move/Attack-move/Hold/Withdraw, control groups, normal-Match group arrivals for both Factions at both reference resolutions | yes (`group-orders`) |
| `hud` | `e2e/hud.spec.ts`, `e2e/hud-repair.spec.ts` | Italian interface, rows, scrolling, pause, minimap, narrow rooms | yes (`hud-repair`) |
| `fog` | `e2e/fog.spec.ts` | Three knowledge states, faction-filtered sight, no reveal | no |
| `settlements` | `e2e/settlements.spec.ts` | Structures, picking, remembered settlements, gate damage | yes |
| `squads` | `e2e/squads.spec.ts`, `e2e/readability.spec.ts`, `e2e/formation-art.spec.ts` | Drawn formations, purchased slots, alpha picking, comparative art, plates, standards, notices, Fatigue scene | yes (`readability`, `formation-art`) |
| `terrain` | `e2e/terrain-readability.spec.ts` | The quietened ground and the figures above it | yes |
| `host` | `e2e/journey.spec.ts`, `e2e/setup.spec.ts`, `e2e/first-entry.spec.ts`, `e2e/match.spec.ts`, `e2e/inspect.spec.ts`, `e2e/surface.spec.ts`, `e2e/desktop.spec.ts` | Setup, the first-entry guide, a whole Match, the debug surface, desktop presentation | yes (`setup`, `first-entry`, `desktop`) |
| `atelier` | `e2e/atelier.spec.ts` | The generated catalogue and its magnifications | no |
| `acceptance` | `e2e/acceptance.spec.ts`, `e2e/appearance.spec.ts` | The reference-resolution matrices, for both Factions | yes |

Complete acceptance is read from `e2e/*.spec.ts`, not from this table: a new spec
is included by existing. `tests/verify/profiles.test.ts` fails when a browser spec
has no responsibility, when a protected behavior loses its owner, when a
deliberately selected sample disappears from its spec, or when a spec produces
frames outside the visual profile.

### The non-browser side

| Area | Owns |
| --- | --- |
| `tests/sim/` | Rules, determinism, hashes, fog, Siege, routes, seasons, Replay semantics |
| `tests/ai/` | Controllers, difficulty, scored decisions |
| `tests/ui/` | HUD, orders, conditions, guide, strings, setup, minimap |
| `tests/input/` | The human Controller and the selection model |
| `tests/render/`, `tests/art/` | Layouts, drawing and the procedural catalogue (no PixiJS in Node) |
| `tests/cli/` | Arguments, protocol, records, Replay, tournaments, golden hashes |
| `tests/guards/` | The seven fences, including the asset guard |
| `tests/verify/` | The profiles and the escalation rules in this document |

## Two levels of browser gate

Acceptance is a **gate**, not evidence production. It runs every browser spec
with screenshots off, which is both the honest functional check and the reason it
fits in a CI job rather than a screenshot generator. Browser work is also the most
expensive thing CI does, so it is concentrated where integration happens:

| Event | Fast checks (`verify`, `guards`) | Smoke | Complete acceptance |
| --- | --- | --- | --- |
| Pull request into `main` | yes | yes | yes, unless documentation only |
| Push to `main` | yes | yes | yes, unless documentation only |
| Pull request into `develop` | yes | no | no |
| Pull request into `develop`, labelled `browser` | yes | yes | yes |
| Push to `develop` (post-merge) | yes | yes | no |
| Manual `workflow_dispatch` | yes | yes | yes |
| Any other target, or an unreadable diff | yes | yes | yes (fail-safe) |

`main` is the integration gate. `develop` is the fast integration branch: its pull
requests get lint, types, build, unit tests, the CLI hash gates and the fences, and
no Chromium. A merge into `develop` runs the smoke as a post-merge safety net, so a
page that no longer boots is noticed long before the main pull request. Add the
`browser` label to a develop pull request when the change touches the host, the
interface or input and deserves the matrix before it lands.

Documentation (`docs/`, `*.md`, `.agents/`, `LICENSE*`) may skip complete acceptance
but still takes the smoke on `main`. Everything else escalates, and an empty or
unreadable diff escalates to **both** gates — "I could not tell" is never a reason
to run less. `scripts/selection.mjs` prints the decision and the reason; the rules
are in `scripts/selection-rules.mjs` and are unit-tested in
`tests/verify/selection.test.ts`.

Feature branches are checked through their pull request, not twice. `push` is
limited to `main` and `develop`, so a branch with an open pull request no longer
starts a second identical run.

| CI job | When | What it proves |
| --- | --- | --- |
| `verify` | always | Lint, types, build, unit tests, and the recorded CLI hashes (determinism) |
| `guards` | always | The seven fences, including "no committed image, font or audio file" |
| `plan` | always | Which browser gates this event takes, with the fail-safe above |
| `browser-smoke` | unless the plan says `false` | Boot, one ordinary Command, frame and console health |
| `browser-acceptance` | unless the plan says `false` | Every browser spec, captures off |
| `visual-frames` | manual dispatch with `visual: true` | The frames themselves, uploaded as an artifact; never a gate |

A failed or skipped `plan` leaves its outputs empty, and an empty answer runs both
browser jobs — the same fail-safe direction as an unreadable diff. If a develop
pull request has no browser jobs, its checks section shows the fast jobs only;
the plan's log states why.

Branch protection should match the policy: require `verify`, `guards` and `plan`
on `develop`, and add `browser-smoke` and `browser-acceptance` as required checks
on `main`. A required browser check that a develop pull request skips would
otherwise show as a missing check instead of a deliberate decision.

Release and performance gates owned by #29, #31 and #32 are untouched; this
reorganization adds a workflow around them and does not declare them passed.

## Evidence and failure diagnosis

Every browser spec runs on the fixture in `e2e/fixtures.ts`. On failure — and only
on failure — it attaches the page's own account of itself: the boot report, the
camera, the Match snapshot with its state hash, the console, uncaught errors,
failed requests and the DOM as text, plus Playwright's retained trace. No
screenshot is taken in an ordinary run, because a picture of a canvas cannot say
which tick it was.

Visual frames are a separate, explicit request:

```sh
npm run test:visual
# writes under %TEMP%\spqr-visual on Windows, /tmp/spqr-visual elsewhere
SPQR_VISUAL_DIR="$TMPDIR/spqr-frames" npm run test:visual   # outside the repository
```

Keep the directory outside the working tree: fence 6 refuses a committed image,
and it walks the repository rather than reading `.gitignore`.

`e2e/evidence.ts` is the only writer. Frames are grouped by the issue that asked
for them; `artifacts/` stays a gitignored bake directory and no image is ever
committed (ADR-0002).

## The recorded environment, and two traps

The numbers in the report were measured on a Windows 10 machine (Ryzen 5 5600X,
6 cores / 12 threads, 32 GB) with Node 22.22.2, npm 10.9.7, Playwright 1.64.1 and
Chrome for Testing 156.0.8078.4 through software WebGL. "Warm" means `node_modules`
and the Chromium build are already present; "cold" provisioning (`npm ci` plus
`npx playwright install --with-deps chromium`) is reported separately and is not
part of the 60/90-second budgets. The cold Chromium download was not measured on
this machine (it is network-bound); the warm check is 1.9 s, and CI's install step
reports its own time.

Two failures in the old workflow are worth remembering, because both blamed the
wrong thing:

1. **An unrelated server on the old port.** `vite preview`'s 4173 is common; a
   foreign site answered there, and Playwright's `reuseExistingServer` drove it
   while reporting failures about this repository. The browser profiles now use
   port 4399 (`SPQR_E2E_PORT` overrides it) and never reuse a server: an occupied
   port fails loudly instead of silently testing another application.
2. **Unbounded local workers.** Software WebGL already uses every core a page is
   given; an unbounded local run opened more canvases than the CPU could serve,
   and a scene that waited on the page's frames failed on contention rather than
   on its subject. Local Playwright runs use two workers; CI keeps one.

## Adding a spec

1. Put the file in `e2e/` as `*.spec.ts`. Complete acceptance picks it up because
   it reads the directory.
2. Add it to a responsibility in `scripts/profiles.mjs` (or to `SMOKE`). The
   profile test fails until you do, so no spec is unreachable by name.
3. If it writes frames, call `capture(page, name, folder)` from `e2e/evidence.ts`
   and add it to `VISUAL_SPECS`. The profile test fails if a frame producer is
   missing from the visual profile.
4. If it protects a behavior named in `RESPONSIBILITIES`, keep the owner entry.
   If it is a sample a developer would deliberately select, keep it in `SAMPLES`.

Prefer behavior through the existing seams: public Match/Controller/Observation
for rules, public UI models for breadth, and existing hooks plus real pointer and
keyboard gestures for the browser. A test that mirrors a command alias or an
implementation list is not worth a profile slot.
