# Issue #64 — Fast focused verification with explicit browser and visual gates

Status: implemented and verified. The delivered workflow is documented for daily
use in [docs/VERIFICATION.md](../VERIFICATION.md); this file is the evidence:
the inventory, the timings, the demonstration and the failures that existed
before this change.

## What changed

- `scripts/profiles.mjs` is the inventory: every browser responsibility, the
  specs that own it, the protected behaviors, the deliberately selected samples,
  and the frame producers.
- `scripts/verify.mjs` is the single entry point for `focus`, `unit`, `smoke`,
  `feature`, `accept` and `visual`. It prints the selection before running it, so
  attribution is in the output rather than in a wiki.
- `scripts/selection.mjs` and `scripts/selection-rules.mjs` decide whether a
  change must take complete acceptance. Documentation is the only skip; an
  empty/unreadable diff escalates.
- `e2e/evidence.ts` is the only writer of visual frames. Captures are off unless
  `SPQR_VISUAL=1`, which is why acceptance is a functional gate rather than a
  screenshot generator. Frames keep their issue folders (`issue52`… `issue64`).
- `e2e/smoke.spec.ts` is the small real-browser smoke: real boot, a Squad raised
  and moved through real pointer presses, the frame read back, and the console,
  page errors and failed requests checked. Its third test boots the Atelier and
  samples one pixel; the full catalogue remains the `atelier` responsibility.
- Every browser spec now imports `test` from `e2e/fixtures.ts`, including the four
  (`acceptance`, `first-entry`, `readability`, `settlements`) that had kept
  Playwright's bare `test` and therefore registered no diagnosis fixture. A
  failure in them now attaches the page's own account too.
- `playwright.config.ts` bounds local workers at two and serves on 4399 without
  reusing an existing server.
- CI gained `plan`, `browser-smoke`, `browser-acceptance` and an explicit manual
  `visual-frames` job. The existing `verify`, `guards`, release and performance
  gates are untouched.
- `tests/verify/profiles.test.ts` and `tests/verify/selection.test.ts` keep the
  inventory from rotting. The CI plan escalates when the selection script itself
  crashes, and the acceptance job runs unless the plan explicitly said `false`.

**No test was deleted to make a profile faster.** The only structural move is the
U9 review scene, split from one 150-line test into "panels and commands" and
"theatre and options" so a slow visual failure names its half. Every assertion
was kept, and both halves still reach their scene through the interface: the
second selects the Squad through its navigator row, not through a hook. The only
other test-content change is the Fatigue scene's tick budget (80→160), explained
below, with its assertion unchanged.

## Inventory: every browser spec and its owner

`npm run test:profiles` prints the live list. Cost is the class observed in the
complete run below, not a promise.

| Spec | Owner | Role | Cost |
| --- | --- | --- | --- |
| `e2e/smoke.spec.ts` | `smoke` | Boot, one ordinary Command, frame/console health, Atelier health | ~10 s |
| `e2e/boot.spec.ts` | `boot` | Theatre, camera, zooms, pan, drag | functional |
| `e2e/commands.spec.ts` | `commands` | Shared submission surface, panels, queued/applied | functional + frames |
| `e2e/orders.spec.ts` | `orders` | Pointer/keyboard gestures, control groups | ~10 s |
| `e2e/hud.spec.ts` | `hud` | Italian interface, rows, minimap | functional |
| `e2e/hud-repair.spec.ts` | `hud` | Overflow, pause, secondary scrolling | functional + frames |
| `e2e/fog.spec.ts` | `fog` | Knowledge states, no reveal | functional |
| `e2e/settlements.spec.ts` | `settlements` | Structures, picking, memory, gate damage | functional + frames |
| `e2e/squads.spec.ts` | `squads` | Drawn formation matches the Match | functional |
| `e2e/readability.spec.ts` | `squads` | Plates, standards, notices, Fatigue | functional + frames |
| `e2e/terrain-readability.spec.ts` | `terrain` | Quietened ground, figure over ground | functional + frames |
| `e2e/setup.spec.ts` | `host` | Setup, seed, real rules, ending | functional + frames |
| `e2e/first-entry.spec.ts` | `host` | The guide's four acts, whole Match | functional + frames |
| `e2e/match.spec.ts` | `host` | Pause, advance, fast-forward, end | functional |
| `e2e/inspect.spec.ts` | `host` | Snapshot, copy, hash, failure evidence | functional |
| `e2e/surface.spec.ts` | `host` | The declared hook surface and nothing else | functional |
| `e2e/desktop.spec.ts` | `host` | Desktop layout, scale, preferences, minimap | functional + frames |
| `e2e/atelier.spec.ts` | `atelier` | Catalogue geometry and magnification | functional |
| `e2e/acceptance.spec.ts` | `acceptance` | Reference-resolution matrices, both Factions | functional + frames |
| `e2e/appearance.spec.ts` | `acceptance` | U9 reproducible states, economy rows, Siege frames | functional + frames |

Nothing was consolidated away: no two specs were found to protect the same
behavior with the same gesture and the same assertions. The duplication that did
exist was in *cost*, not coverage — every spec took its own screenshots and made
its own `%TEMP%` directory — and that now has one owner in `e2e/evidence.ts`.

The non-browser side is unchanged and remains the breadth layer: `tests/sim`
(rules, determinism, fog, Replay), `tests/ai`, `tests/ui`, `tests/input`,
`tests/render` and `tests/art`, `tests/cli`, `tests/guards`, and the new
`tests/verify`.

## Timing report

Environment (recorded): Windows 10 19045, AMD Ryzen 5 5600X (6 cores / 12
threads), 31.9 GB RAM, Node 22.22.2, npm 10.9.7, Playwright 1.64.1, Chrome for
Testing 156.0.8078.4 through software WebGL (`--enable-unsafe-swiftshader`).
"Warm" means `node_modules` and that Chromium build were already present.

| Run | Selection | Warm/cold | Actual |
| --- | --- | --- | --- |
| Focused, no arguments | `tests/verify` through the working-tree change | warm | **1.5 s** |
| Focused, core seams | the `CORE_TESTS` fallback, 7 files / 146 tests | warm | **2.2 s** |
| Focused, one shared module | `npm run test:focus -- src/ui/strings.ts`, 14 files / 186 tests | warm | **11.6 s** |
| Focused, the worst hub | `npm run test:focus -- src/sim/state.ts`, 42 files / 510 tests | warm | **51.8 s** |
| Smoke | `npm run test:smoke`, 3 tests | warm | **8.3 s** (10.9 s with the provisioning pre-step) |
| Feature `orders` | 8 tests | warm | **10.0 s** (Playwright reports 8.5 s) |
| Feature sample | `feature orders --grep` "right click", 1 test | warm | **3.9 s** |
| Complete acceptance | `npm run test:accept`, 148 tests, captures off, 2 workers | warm | **503 s (8.4 min)**, 148 passed |
| Visual, one 1920×1080 scene | one split review test, frames on, 1 worker | warm | **52.3 s**, 9 frames (392 KB) |
| Full unit suite | `npm test`, 112 files / 1321 tests | warm | **63.2 s** after the follow-up (56.4 s / 1297 tests at the start) |
| Provisioning, warm | `npx playwright install chromium`, nothing to download | warm | **1.9 s** |

Provisioning time is reported separately and is not part of the 60/90-second
budgets. Each browser profile has the same `pretest:` step as `test:e2e`, so a
fresh clone works with the documented command. A warm `playwright install
chromium` (nothing to download) took **1.9 s**. The cold download was not measured
on this machine: it is network-bound, CI runs it as its own step, and its log
reports the time. Cold page/browser start is inside every run: Playwright launches
the browser and Vite boots the page per run, because the web server is never
reused.

The 60-second focused budget and the 90-second smoke budget both hold with a wide
margin. Complete acceptance is deliberately not a fast profile: it is the gate
before integration, and it is the only run in this report that uses the CPU for
minutes.

## The workflow, demonstrated

### A narrow change and its checks

The `orders` responsibility was selected and run, then narrowed to the
deliberately kept sample:

```sh
npm run test:feature -- orders
#   # the orders responsibility
#   e2e/orders.spec.ts
#   8 passed (8.5 s)

npm run test:feature -- orders --grep=right
#   1 passed (3.9 s)  — "moves a Squad with a right click, and the men march"
```

A focused non-browser selection was measured the same way:

```sh
npm run test:focus
#   # tests related to: scripts/profiles.mjs, scripts/selection-rules.mjs, ...
#   Test Files 2 passed, Tests 15 passed, 1.5 s

npm run test:focus -- src/ui/strings.ts
#   Affected 14 of 112 test files, Tests 186 passed, 11.6 s

npm run test:focus -- src/sim/state.ts
#   Affected 42 of 112 test files, Tests 510 passed, 51.8 s
```

### A deliberately failing sample is still included

A temporary spec with one failing assertion was added to `e2e/`, and complete
acceptance was asked for only that test. The run printed the new file as part of
its selection and failed on it:

```
# complete browser acceptance (captures off)
  e2e/zz-selection-demo.spec.ts
Running 1 test using 1 worker
  Error: the demo failed on purpose
  1 failed
```

The file was deleted immediately. This is the directory-glob fail-safe: a new
spec cannot be silently outside complete acceptance.
`tests/verify/profiles.test.ts` additionally pins the named samples to their
feature profiles, so a sample cannot disappear from a narrow selection either.

### The complete baseline

`npm run test:accept` ran **148 tests, all passed, in 503 s**, with captures off.
The slowest tests were the U9 economy-row matrices (34.6 s and 40.6 s) and the
split review-panel scenes (37.4 s and 39.2 s); the Atelier magnification test was
24.5 s. The two 1920×1080 review scenes that used to hit the 120-second timeout
passed inside their unchanged 120-second per-test budgets.

## Follow-up: two-tier CI gates (same branch)

The delivery first ran the browser jobs on every push and every pull request. That
made a feature branch with an open pull request run the workflow twice, and it made
a `develop` pull request pay for Chromium even when its change was one button.

The gate rule now depends on the event and the target, in
`scripts/selection-rules.mjs` and unit-tested in `tests/verify/selection.test.ts`:

| Event | `verify` + `guards` | Smoke | Complete acceptance |
| --- | --- | --- | --- |
| Pull request into `main` | yes | yes | yes, unless documentation only |
| Push to `main` | yes | yes | yes, unless documentation only |
| Pull request into `develop` | yes | no | no |
| Pull request into `develop`, labelled `browser` | yes | yes | yes |
| Push to `develop` (post-merge) | yes | yes | no |
| Manual `workflow_dispatch` | yes | yes | yes |
| Any other target, or an unreadable diff | yes | yes | yes (fail-safe) |

- `main` remains the integration gate: a pull request into `main` and a push to
  `main` run the smoke and complete acceptance, so browser work is still verified
  before it reaches the integration branch.
- `develop` is the fast integration branch for pull requests; a merge into it runs
  the smoke as a post-merge net, so a page that no longer boots is noticed before
  the main pull request. The `browser` label opts a develop pull request into both
  gates when the change touches the host, HUD or input.
- `push` is limited to `main` and `develop`, so a branch with an open pull request
  no longer starts a second identical run.
- An unreadable diff, an unexpected target or a crashed `plan` runs both gates.

Local profiles and their measured budgets are unchanged; this changes only how CI
spends browser time. Branch protection follows the same split: `develop` requires
`verify`, `guards` and `plan`; `main` also requires `browser-smoke` and
`browser-acceptance`.

## Existing failures and flakes, explained

These are recorded because the ticket forbids relabelling them as passed.

1. **1920×1080 review frames timed out with screenshots on.** The pre-change
   complete matrix (4 workers, captures on) reported 3 failures: both 1920×1080
   `review frames` tests hit the 120-second test timeout while awaiting a
   `requestAnimationFrame` for yet another screenshot, and the Fatigue scene
   failed. The screenshots were the cost, not the assertions. Acceptance now runs
   the same assertions with captures off, and they pass in 37–40 s at 1280 and
   inside 120 s at 1920. The visual profile is explicit, sequential, and the one
   review scene was split in two so a slow visual failure names its half. No
   timeout was raised.
2. **The Fatigue scene failed at 12 points instead of 15 under load.** It passed
   alone in 9.1 s with
   `npx playwright test e2e/readability.spec.ts -g "tired Squad" --workers=1`, and
   failed with `Squad 1: the march tired it / Expected: >= 15 / Received: 12` in
   the fully parallel run. The scene is about the rules (Fatigue ≥ 15), and the
   flake was runway, not assertion: an order issued on one tick starts moving on
   the next, so contention changes how many ticks of the 80-tick budget are spent
   marching. The tick budget is now 160 and the assertion is unchanged. In the
   complete baseline it passed in 11.7 s.
3. **Unbounded local workers.** An unbounded local run opened more SwiftShader
   canvases than the CPU could serve. Local Playwright now uses two workers; CI
   keeps one. This is not a retry and not a timeout change.
4. **An unrelated application on the old port.** `vite preview`'s 4173 was
   occupied by a Python server serving another project; Playwright reused it and
   reported failures about this repository. The profile now serves on 4399
   (`SPQR_E2E_PORT` overrides it) and never reuses an existing server, so an
   occupied port fails loudly instead of testing a stranger.

## Coverage preserved

| Required behavior | Owner |
| --- | --- |
| Pointer and keyboard gestures | `e2e/orders.spec.ts`, `e2e/hud.spec.ts` |
| Fog and faction-filtered Observation | `e2e/fog.spec.ts`, `tests/sim/fog.test.ts`, `tests/sim/siege-fog.test.ts` |
| Queued and applied Commands | `e2e/commands.spec.ts`, `tests/input/match-host.test.ts` |
| Replay | `tests/sim/replay.test.ts`, `tests/cli/replay.test.ts` |
| Atelier | `e2e/atelier.spec.ts`, `tests/render/atelier-layout.test.ts` |
| Asset guard | `tests/guards/asset-files.test.ts`, `scripts/guards/asset-files.mjs` |
| Authoritative determinism | `tests/sim/hash.test.ts`, `tests/cli/run.test.ts` |
| A Match ends at its bound or by a rule | `e2e/match.spec.ts`, `tests/sim/outcome.test.ts` |

`tests/verify/profiles.test.ts` fails if any browser owner leaves complete
acceptance, if a protected behavior loses its owner, or if a frame producer is
missing from the visual profile.

## Not claimed

- The full visual matrix was not re-run after the split. One 1920×1080 split
  scene was produced (9 frames, 52.3 s) to prove the visual profile writes frames;
  the remaining frames are the same captures as before, now routed through
  `e2e/evidence.ts`.
- Hardware 60 fps is not claimed: software WebGL frames are evidence of
  correctness, not of performance. #31 retains that gate.
- #29 (global tournament balance) and #32 (release) were not touched or closed,
  and their gates were not weakened.
- No game rule, hash, pixel generator or Italian player string was changed by
  this ticket. The only behavior-adjacent changes are the test scene's tick
  budget and the Playwright port/worker settings.
