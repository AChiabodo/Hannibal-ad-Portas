# A5 — Review of the foundations against ADR-0001, 0003 and 0006

- **Revision reviewed:** `2733053649b9b3367475c6eab2e3fc4a3bd98d00` (`develop`, "feat(cli): a whole Match from the command line (A4)")
- **Ticket:** [#6](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/6), child of [#1](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/1)
- **Scope:** the decisions the code claims to implement — engine-free simulation (ADR-0001), a single decision seam over partially-observable state (ADR-0003), integer determinism (ADR-0006). Findings only; no code was changed.
- **Baseline before review:** `npm run verify` green (lint, strict types across three projects, fences, 177 tests in 23 files, build); `npm run test:e2e` green (1 test, headless Chromium, WebGL2, probe pixel `[255,136,0,255]`).

## How this was checked

1. Each ADR was read, then the code that claims to implement it was read, and the claim was matched against the code.
2. Every fence and every compile-time guard was **deliberately broken** and re-run, to confirm it fails rather than merely to observe that it passes when unbroken. The matrix is in [Part B](#part-b--each-guard-deliberately-broken).
3. Everything is reversible: each mutation was applied, observed, and reverted; `git status` is clean and `node scripts/guard.mjs` is green at the end.
4. Two throwaway probes (not committed, run from outside the repo against `file://` imports of `src/sim/*.ts`) demonstrate the two behavioural findings: the Observation write-through and the replay validation gap.

## Verdict

| # | Finding | ADR | Severity | Where the fix belongs |
| - | ------- | --- | -------- | --------------------- |
| F1 | The `**` operator is `Math.pow` and the transcendental fence does not see it | 0006 | **High** | new ticket / B1–C1 |
| F2 | A Controller can read the whole world and **write authoritative state** through `Observation.visible` | 0003 | **High** | B4, D1 |
| F3 | The fences start at `src/sim`, but the plan puts the AI in `src/ai/` | 0001, 0003, 0006 | Medium-High | before D1 |
| F4 | "`pixi.js` only in `render/`" and "`art/` never imports `pixi.js`" are stated rules with no fence | 0001 | Medium | B2 |
| F5 | The CI determinism gate exercises **zero random draws** | 0006, 0003 | Medium | E2/E3 |
| F6 | `replay` is a second path into the rules and validates nothing | 0003 | Medium | E2 |
| F7 | The state hash is not a pure function of state: accessors are invoked | 0006 | Low-Medium | E2 / hardening |
| F8 | "Every draw comes from sfc32" is enforced only as "no `Math.random`", and five spellings escape | 0006 | Low | hardening |
| F9 | `scripts/guard.mjs` numbers two of its three fences | — | Trivial | `scripts/guard.mjs` (B2 ticket) |

What the ADRs state is, on the whole, what the code does: the three foundational decisions survive contact with the code better than is usual at this size. The two High findings are both *narrow funnels standing next to wide ones*: the transcendental fence is exact about member access and blind to an operator that is the same operation; the Observation is exact about the Controller's types and blind to the reference it is handed.

---

## Part A — each ADR checked against the code

### ADR-0001 — PixiJS as renderer over an engine-free simulation core

**The claim.** "the simulation (map, economy, squads, combat, AI, victory) is plain TypeScript that imports no engine code and therefore runs in Node."

**What holds.**

- `pixi.js` is imported in exactly one file: `src/render/boot.ts:9` is `import { Application, Graphics } from 'pixi.js';`. (`grep -rn "pixi.js" src index.html` has three hits — that import and the two comments at `src/render/boot.ts:2` and `src/sim/index.ts:6`; no other file imports it.)
- The fence is reachability, not direct import, and it is complete about import syntax. `scripts/guards/sim-reachability.mjs` follows static imports, re-exports, `import type`, `import()` and `require()` (`importsOf`, lines 170–203), resolves a `.js` specifier to the `.ts` beside it (lines 26–31), follows extension-less imports into a directory's `index.ts` (lines 143–149), and treats **every** file under `src/sim` as an entry point (line 83). An unresolvable relative import is itself a violation (`simulation-boundary.mjs:54-56`), so the fence says "I cannot see through this" rather than staying quiet.
- The simulation runs in Node with no build step: CI's `verify` job plays a whole Match with `npm run match`, and `playMatch` imports only `../sim/index.ts` (`src/cli/run.ts:18-27`).
- The documented limit is honest and load-bearing: the walk "does not resolve `node_modules`" (`sim-reachability.mjs:59-62`, README). ADR-0001's guarantee therefore holds at source-reachability level only — a bare dependency reachable from `src/sim` could import the engine, and the fence would see the dependency, not what is inside it.

**Deviation:** the fence's entrance is `src/sim` while ADR-0001 counts **AI** as part of the simulation and PLAN §3 places the AI in `src/ai/` — see **F3**. The narrower-and-wider mismatch in "the only place `pixi.js` exists" — see **F4**.

### ADR-0003 — agent-testability is architecture, not tooling

**The claim.** "One seam carries every decision-maker… No Controller may read state outside its own Observation. The core runs at a fixed timestep with a seeded PRNG, and identical seeds must produce identical result hashes, which CI verifies. The CLI can play a complete Match headless and fails the build on invariant violations."

**What holds.**

- **One interface.** `Controller<Visible>` is one method, `decide(observation): readonly Command[]` (the interface is `src/sim/controller.ts:45-55`, `decide` at `:54`), and `Player` is a `Faction` plus a `Controller`. The two shipped implementations (`idleController`, `scriptedController`) are Controllers like any other, not driver special cases.
- **The driver owns the seam's hard parts.** `runMatch` stamps the Observation (`driver.ts:174-178`), validates every emitted Command (`driver.ts:181`), refuses a foreign Faction (`driver.ts:183-185`), and normalises decision order to Rome-first so the log and hash are canonical (`decidingOrder`, `driver.ts:216-222`, tested by "decides in Rome-first order, whatever order the Players were handed in").
- **The Controller-side funnel is enforced at compile time, not merely asserted.** `tests/sim/controller.test.ts` carries three `@ts-expect-error` exemptions (`observation.seed`, `observation.visible.hidden`, `match.state` as an Observation). `tsconfig.node.json` includes `tests/**/*.ts`, so `npm run check` — which CI runs — type-checks them. Removing the three exemptions produces exactly three errors (Part B, B3). The claim in the README that reaching past an Observation "does not compile" is therefore true today.
- **A bounded clock.** `runMatch` requires `ticks` (`requireTickCount`, `driver.ts:148`) and terminates at the bound; `RunOptions.ticks` defaults to 25 200 (three game years).
- **The CLI plays a whole Match and fails the build on an invariant.** `src/cli/main.ts` exits 0/1/2, prints the report before a hash violation, and CI's `verify` job runs `npm run match -- --seed 1 --ticks 600 --expect-hash bf3d192e9ab9eb5f`. `requireExpectedHash` throws `HashMismatchError` naming both numbers.
- **Debug hooks exist from the first day.** `window.__SPQR` is published on both boot paths (`src/main.ts:29,37`), typed in `src/debug.ts`, and read by `e2e/boot.spec.ts`, which also asserts no page or console errors.
- **The prose and the code cannot drift.** `tests/sim/command-docs.test.ts` parses the vocabulary table and the example block out of `docs/COMMANDS.md` and checks them against `COMMAND_KINDS` and `ONE_OF_EACH`.

**Deviations:** the Observation funnel is narrow at the Controller and wide at the rules (**F2**); there are two paths into the rules and only one is validated (**F6**).

### ADR-0006 — simulation math is integer, and its randomness is sfc32

**The claim.** "The authoritative state of a Match contains integers only, and every random draw comes from `sfc32` seeded through `xmur3`. `Math.random` is banned repository-wide, and `Math.sin`, `cos`, `exp`, `pow` and `log` are banned inside the simulation… Derived floating-point values are permitted as long as they never feed state or the state hash."

**What holds.**

- **Integer-only state is enforced where it matters and tested.** `serializeState` (`src/sim/state.ts`) rejects non-integers (`:75`), integers past `Number.MAX_SAFE_INTEGER` (`:78-83`), `null`/`undefined`/`bigint`/`symbol`/class instances/`Date`/`Map`/`Set`, the float and big-int typed-array kinds and `DataView` (`NON_INTEGER_VIEWS`, `:27-34`), symbol keys (`:103`), and cycles (`:151-157`). Keys are sorted so the hash cannot depend on field order (`:109-110`). Non-enumerable own fields are written (`Object.getOwnPropertyNames`, `:109`), so a float cannot hide from the hash — asserted in `tests/sim/state.test.ts`.
- **The algorithm is what the ADR names, and it is pinned twice.** `rng.ts:77-91` is `xmur3`, `rng.ts:101-115` is `sfc32` with the float division removed so a draw is the whole word. `tests/sim/rng.test.ts` checks three draws against a vector worked by hand **and** records the first four words of seed 0, so a change is a visible decision. `nextBelow` rejects rather than takes a remainder (`:124-132`), and `nextInt`/`nextBelow` validate their bounds, so a draw is an unbiased integer.
- **The cursor is authoritative state, and a diverging draw diverges the Match.** `MatchState.rng` is the live cursor (`match.ts:105`), and `tests/sim/match.test.ts` "covers the random cursor, so one diverging draw diverges the Match" proves it.
- **The hash is engine-independent arithmetic.** FNV-1a over the canonical text in `BigInt` (`hash.ts:32-41`); no `imul`, no float, no `Math` member.
- **The fences exist and are wired to the real tree.** `repo-fences.test.ts` runs all three against the repository as it stands, so a breach inside `src/` fails `npm test` as well as `npm run guard`.

**Deviations:** the exponentiation operator escapes the transcendental fence (**F1**); the CI determinism gate never draws (**F5**); accessors make the hash impure (**F7**); "every draw comes from sfc32" is under-enforced (**F8**).

---

## Part B — each guard deliberately broken

Three kinds of guard are broken here, each the way it is meant to fail: the repository fences through their CLI (B1), the guard's own unit tests by breaking the guard implementation (B2), and the compile-time seam guard by removing the exemption that suppresses its error (B3). Everything was reverted; `git status` is clean and `node scripts/guard.mjs` is green at the end. "GUARD-PASS" in B1 means the fence **did not** catch the violation — a finding, not a failure of the review.

### B1 — the three repository fences

| Mutation | Result |
| -------- | ------ |
| *(baseline, unbroken)* | ok, fences hold (exit 0) |
| `src/sim/index.ts` → `export { bootRenderer } from '../render/boot.ts'` | **FAIL**, chain `src/sim/index.ts → src/render/boot.ts → pixi.js` |
| same, `export type { RenderProbe } from …` (type-only) | **FAIL**, same chain |
| same, `export const load = () => import('../render/boot.ts')` (dynamic) | **FAIL**, same chain |
| `export * from './does-not-exist.ts'` (unresolvable relative) | **FAIL**, "the guard cannot resolve it" |
| `import 'pixi.js'` directly in `src/sim/index.ts` | **FAIL**, chain `src/sim/index.ts → pixi.js` |
| `src/sim/index.ts` → `src/art/link.ts` → `src/render/boot.ts` (two hops) | **FAIL**, chain `src/sim/index.ts → src/art/link.ts → src/render/boot.ts → pixi.js` |
| `Math.random()` in `src/sim/rng.ts` | **FAIL** |
| `Math.random()` in `src/render/boot.ts` | **FAIL** (fence is repo-wide) |
| `Math.random()` in `e2e/boot.spec.ts` | **FAIL** (fence is repo-wide) |
| `const M = Math; M.random()` in `src/sim/rng.ts` | **GUARD-PASS** — F8 |
| `globalThis.Math.random()` in `src/sim/rng.ts` | **GUARD-PASS** — F8 |
| `Math['ran'+'dom']()` in `src/sim/rng.ts` | **GUARD-PASS** — F8 |
| `crypto.getRandomValues(new Uint32Array(1))` in `src/sim/rng.ts` | **GUARD-PASS** — F8 |
| `Date.now()` in `src/sim/rng.ts` | **GUARD-PASS** — F8 |
| `Math.sin(x)` in `src/sim/index.ts` | **FAIL** |
| `Math.pow(x, 2)` in `src/sim/index.ts` | **FAIL** |
| `Math.exp(x)` in `src/sim/index.ts` | **FAIL** |
| `x ** 2` in `src/sim/index.ts` | **GUARD-PASS** — F1 |
| `x ** 0.5` in `src/sim/index.ts` | **GUARD-PASS** — F1 |
| `Math.log(x)` in `src/render/boot.ts` (unreachable from `sim`) | GUARD-PASS — by design |
| `Math.pow(t, 2.5)` in `src/art/noise.ts` reached from `sim` | **FAIL**, chain named |
| `import 'pixi.js'` in `src/main.ts` | **GUARD-PASS** — F4 |
| `import 'pixi.js'` in `src/cli/main.ts` | **GUARD-PASS** — F4 (runtime would fail; the fence would not) |
| `import 'pixi.js'` in `src/art/generator.ts` | **GUARD-PASS** — F4 |
| `Math.sin(x)` in `src/ai/tactical.ts` | **GUARD-PASS** — F3 |
| `node scripts/guard.mjs --wat` | exit 2, "is not an option" |
| `node scripts/guard.mjs --scan /nonexistent` | exit 2, "scan root does not exist" |

### B2 — the guard *tests* themselves

The unit tests in `tests/guards/` were confirmed to fail when the guard is broken, not merely to pass when it is whole. The five library and CLI files are broken through the guard implementation; `repo-fences.test.ts`, which runs the fences against the real repository, is broken by putting a violation into the real repository:

| Guard broken | Test file | Result |
| ------------ | --------- | ------ |
| `isForbidden` always `false` | `simulation-boundary.test.ts` | 6 failed / 6 passed |
| `math-members.mjs` never reports a member | `find-math-random.test.ts`, `transcendental-math.test.ts` | 6 failed / 6 passed |
| `transcendental-math.mjs` returns `[]` | `transcendental-math.test.ts` | 3 failed / 3 passed |
| `source-files.mjs` stops skipping ignored dirs | `source-files.test.ts` | 1 failed / 2 passed |
| `guard.mjs` accepts an unknown argument | `guard-cli.test.ts` | 1 failed / 5 passed |
| `Math.random()` appended to `src/sim/rng.ts` | `repo-fences.test.ts` | 1 failed / 1 — the real tree does not hold fence #2 |
| `export { bootRenderer } from '../render/boot.ts'` appended to `src/sim/index.ts` | `repo-fences.test.ts` | 1 failed / 1 — the real tree does not hold fence #1 |

Restored: all six files of `tests/guards` are green — 6 files, 34 tests.

### B3 — the compile-time seam guard

Removing the three `@ts-expect-error` exemptions from `tests/sim/controller.test.ts` makes `npm run check` fail with exactly the three intended errors:

```
tests/sim/controller.test.ts(37,34): error TS2339: Property 'seed' does not exist on type 'Observation<SecretVisible>'.
tests/sim/controller.test.ts(48,44): error TS2339: Property 'hidden' does not exist on type 'SecretVisible'.
tests/sim/controller.test.ts(59,11): error TS2739: Type 'MatchState<SecretWorld>' is missing the following properties from type 'Observation<SecretVisible>': faction, visible
```

So ADR-0003's "reaching past it does not compile" is enforced by the type-check CI runs, not by a promise.

---

## Part C — findings

### F1 — the `**` operator is `Math.pow`, and the transcendental fence does not see it

**ADR:** 0006. **Severity: High.**

**Evidence.** The fence bans 22 `Math` members, `pow` among them (`scripts/guards/transcendental-math.mjs:20-43`, `'pow'` at `:40`). The walk that finds them recognises only member access and destructuring (`scripts/guards/math-members.mjs:81-112`):

```js
function mathMemberOf(node) {
  if (ts.isPropertyAccessExpression(node)) {
    return isMathIdentifier(node.expression) ? node.name.text : undefined;
  }

  if (ts.isElementAccessExpression(node)) {
    const argument = node.argumentExpression;
    if (!isMathIdentifier(node.expression) || argument === undefined || !ts.isStringLiteral(argument)) {
      return undefined;
    }

    return argument.text;
  }

  return undefined;
}
```

Every path to a `Math` member the walk can name — `Math.sin`, `Math["sin"]`, `Math?.sin`, and destructuring (`destructuredMembersOf`, `:104-112`) — is a member access. The exponentiation operator is not one: there is no branch for `ts.isBinaryExpression` with an `AsteriskAsteriskToken`, so `x ** y` never reaches the fence at all. ECMA-262 puts `**` and `Math.pow` on the same operation: `Math.pow` step 3 is "Return Number::exponentiate(base, exponent)" (ECMA-262 §21.3.2.27), and `Number::exponentiate` "returns an implementation-approximated value representing the result of raising base to the exponent power" (§6.1.6.1.3). MDN states it plainly: "`Math.pow()` is equivalent to the `**` operator, except `Math.pow()` only accepts numbers."

Deliberately broken: `export const p = (x: number): number => x ** 0.5;` appended to `src/sim/index.ts` leaves `node scripts/guard.mjs` at **exit 0, "fences hold"**. The same expression with `Math.pow(x, 0.5)` fails.

**Consequence.** The single most likely way for a rule to become engine-dependent is also the one way the fence cannot see. `x ** 0.5` (a distance or a scatter radius) reads as ordinary arithmetic, passes review, compiles, runs identically on the machine that wrote it, and can legitimately differ on another engine — which is precisely the divergence ADR-0006 exists to prevent. The failure is silent at every layer the project has: the fence is green, CI's golden hash does not cover it (F5), and the first symptom would be a replay that disagrees on someone else's machine.

**Recommendation.** Treat `**` as reaching `Number::exponentiate` in `math-members.mjs` and report it exactly as `Math.pow` is reported. If integer exponents are to be permitted (`x ** 2` is exact), say so in ADR-0006 and in the fence as a carve-out, because the spec's approximation applies to the operation, not to a particular exponent. This is cheap now and touches one guard module and its fixtures; it belongs with B1/C1, the first tickets that do geometry.

### F2 — a Controller can read the whole world and write authoritative state through `Observation.visible`

**ADR:** 0003. **Severity: High.**

**Evidence.** The Observation's funnel is a shallow `readonly`:

```ts
// src/sim/observation.ts:32
readonly visible: Visible;
```

and the driver hands the rules' projection over by reference, with no copy, no freeze and no check:

```ts
// src/sim/driver.ts:174-178
const observation: Observation<Visible> = {
  faction: player.faction,
  tick,
  visible: setup.observe(world, player.faction),
};
```

`MatchSetup.observe` is `(world: World, faction: Faction) => Visible` (`driver.ts:101`) — unconstrained. Nothing requires it to filter (there is no fog yet) and nothing requires it to copy. Probe, against a world the rules own:

```js
const observe = (w) => w;                      // the projection *is* the world
const cheating = { decide: (o) => { o.visible.secretTotal = 9999; return []; } };
runMatch({ seed: 1, rules, observe, outcome, players: [rome: cheating, carthage: idle], ticks: 3 });
// world after the cheating Controller ran : {"secretTotal":9999,"tribute":0}
// commands logged by the driver            : 0 []
// hash of the run with the cheat           : ac6613f40363ee47
// hash of the same seed without the cheat  : 5eaf6a783681928a
```

The Controller saw everything (there is no `visible` field it could not reach) **and wrote authoritative state** with no Command, so the write is absent from the log a replay is made of.

**Consequence.** Two distinct failures, both on the boundary ADR-0003 says is non-negotiable:

1. **Partial observability is not in the core.** ADR-0003: "fog of war is not optional — an AI that could see the whole map would make the Observation contract a lie, so partial observability belongs in the core from the first commit." What is in the core is the *seam* (`faction`, `tick`, who decides when); the **filtering** is a rules callback with no enforcement anywhere — not in the type (`Visible` is a free parameter), not in the driver, and not in any test that would fail if the callback returned the world. B4 owns the filter; nothing currently makes B4's result verified rather than promised.
2. **The seam has a second entrance for state, not just for decisions.** A Controller can mutate the world through the Observation, bypassing `validateCommand`, the ownership check, and the log. Replays then diverge for a reason the log cannot explain. The asymmetry is telling: `command.ts` is explicit that the flow *in* is copied ("`validateCommand` copies what it accepts, so a Controller cannot keep a hand on the Match through the object it handed over") while the flow *out* has the mirror-image hole, unremarked.

**Recommendation.** B4 should close both, and the closure should be testable in the core, not only in the rules:

- Make the Observation unfakeable rather than merely typed — e.g. a branded `Visible`, or a `MatchSetup.observe` whose result the driver deep-freezes/copies — so that "what a Controller sees" and "what a Controller can touch" are both determined by the driver.
- Add a `driver.test.ts` case, in the spirit of the existing `@ts-expect-error` tests, that a projection which aliases the world cannot be mutated through the Observation (or takes effect nowhere if it is).
- D1 ("an Observation hardened against leakage", PLAN §7) has the same requirement from the AI side; whoever moves first should own the type.

### F3 — the fences start at `src/sim`, but the plan puts the AI in `src/ai/`

**ADR:** 0001, 0003, 0006. **Severity: Medium-High.**

**Evidence.** One constant roots both reachability fences:

```js
// scripts/guards/sim-reachability.mjs:16
export const SIMULATION_ENTRY = 'src/sim';
```

ADR-0001 defines the simulation as "(map, economy, squads, combat, **AI**, victory)". PLAN §3 defines the module boundary explicitly and puts the AI outside `sim/`:

> **`ai/`** — Controllers that reason. May import an Observation's *types*; never the internals of `sim/`.

Reachability is directional: `src/sim` must not import `src/ai`, so `src/ai` is never walked. Deliberately broken: `src/ai/tactical.ts` containing `export const aim = (x: number): number => Math.sin(x);` leaves the guard green. The `Math.random` fence still covers it, because `GUARDED_ROOTS = ['.']` — the transcendental one does not, and neither does the renderer one.

**Consequence.** D1's AI is a decision-maker: its Commands are part of the Match and its determinism is what ADR-0003's "identical seeds produce identical result hashes" depends on. The day it lands in `src/ai/`, the one fence that exists to make "no engine may disagree" true stops covering the layer most likely to reach for `Math.sin`, `Math.atan2` or `Math.hypot` (facing, threat-map angles, distance). The failure is invisible to CI — it is a per-engine rounding difference, not a crash — and by then the AI is large enough that the fix is a migration rather than a rule.

**Recommendation.** Decide the AI's location *before* D1, and encode whichever decision is made in the guard: either `SIMULATION_ENTRY` becomes a list including `src/ai` (and `src/content`), or the plan says the AI lives under `src/sim/`. Either way add a fixture to `tests/guards` proving a transcendental inside the AI is caught. This is a one-line fence change plus a test, and it is worth doing at the same time as F1 because both are about the same fence.

### F4 — "pixi.js only in `render/`" and "`art/` never imports `pixi.js`" are stated rules with no fence

**ADR:** 0001. **Severity: Medium.**

**Evidence.** The fence implements the narrowest of the three statements of the rule. ADR-0001's operative sentence is about the simulation; PLAN §3 widens it — "**`art/`** — pure pixel generators: `PixelBuffer` in, `PixelBuffer` out. **Never imports `pixi.js`**" — and the README widens it further — "`render/` — the only place `pixi.js` exists". `simulation-boundary.mjs` only walks from `src/sim`, so a `pixi.js` import in `src/main.ts`, in `src/cli/main.ts`, or in a new `src/art/generator.ts` leaves the guard green (all three probed).

**Consequence.** The rule that keeps `art/` testable in Vitest is the same rule that the fence does not check. PLAN §3 gives the reason in the next paragraph: "PixiJS 8 does not accept `ImageData` as a texture source and has no official headless Node path, so `art/` and `sim/` must stay PixiJS-free for tests to run in Vitest at all." When B2 builds the real `art/` pipeline and the first render adapter, an accidental `pixi.js` import in `art/` silently removes the layer's headless testability; the fence, whose message names exactly this, stays quiet.

**Recommendation.** If "only `render/` imports `pixi.js`" is a rule, fence it with the same mechanism and an allow-list of files (`src/render/**`), and give the violation the same chain-shaped message. If it is not a rule, soften the README so the code and the prose agree. B2 is the ticket that creates the second candidate for the allow-list.

### F5 — the CI determinism gate exercises zero random draws

**ADR:** 0006 (with ADR-0003's "which CI verifies"). **Severity: Medium.**

**Evidence.** The gate is CI's step "Play a Match headless": `npm run match -- --seed 1 --ticks 600 --expect-hash bf3d192e9ab9eb5f`. That Match is the empty one: `playMatch` wires `emptyMatchRules` and two `idleController`s (`src/cli/run.ts:44-50`), and the rules are

```ts
// src/sim/empty.ts:51-54
export const emptyMatchRules: MatchRules<EmptyMatchWorld, Command> = {
  createWorld: () => ({}),
  step: () => {},
};
```

No rule body, and `idleController` returns `NO_COMMANDS` (`controller.ts:84-85`), so `rng.nextUint32` is never called. Probe:

```
reconstructed hash : bf3d192e9ab9eb5f    // hashState({ tick: 600, seed: 1, rng: {...makeRng(1).state}, world: {} })
CI golden hash     : bf3d192e9ab9eb5f
identical          : true
hash if one draw had happened: 48ab5ce0a762023c  (differs: true)
```

The golden hash *is* the seeded cursor, untouched after 600 ticks. It proves `xmur3`'s seed expansion, the canonical serialization and the hash function are portable across Windows and Linux — worth having — and proves nothing about `sfc32`'s draw loop, which is where `Math.imul`, `| 0` and `>>> 0` live and where an engine-dependent implementation could hide.

**Consequence.** ADR-0006 rejects "same-platform-only determinism" precisely because "development happens on Windows while CI runs on Linux", and ADR-0003 calls the hash check the thing CI verifies. Today the cross-machine gate covers the part of the generator that does not draw. Every test that does exercise draws (`tests/sim/rng.test.ts`'s hand-checked vector and recorded seed-0 stream, `match.test.ts`, `replay.test.ts`) runs twice on one machine, so it can only catch a *change*, never a *platform* difference.

**Recommendation.** Add a second golden-hash run whose Match draws. The cheapest shape that fits the existing design is a small committed rules fixture under `src/` — a rules/projection/outcome trio in the spirit of `tests/sim/toy-rules.ts` — selected by a new CLI flag, with its hash recorded in `ci.yml` next to the empty one. `runMatch` accepts such a `MatchSetup` already; `playMatch` is what hardcodes the empty one (`src/cli/run.ts:41-53`) and would need the flag. Two hashes — one with draws, one without — turn ADR-0006's consequential claim into a measurement. E2/E3 will need this harness anyway.

### F6 — `replay` is a second path into the rules and validates nothing

**ADR:** 0003. **Severity: Medium.**

**Evidence.** The driver validates what a Controller emits (`driver.ts:181-185`). The replay does not:

```ts
// src/sim/replay.ts:73-74
for (let tick = 0; tick < ticks; tick += 1) {
  match.step(schedule.get(tick) ?? NO_COMMANDS);
```

`scheduleByTick` checks only that a stamp is a whole tick inside the run (`replay.ts:86-95`); the Command itself is never read through `validateCommand`. Probe, with a log containing `{ kind: 'teleport', faction: 'rome' }`:

```
replay accepted the bogus command; rules saw: [ 'teleport' ]
the same log through the driver + scriptedController -> CommandValidationError
```

**Consequence.** The README's summary — "what a Controller returns is validated against the vocabulary before anything is applied… The driver never lets a rule defend against either" — is true of the driver and false of `replay`. That matters because `replay` is the function E2 will point at a log an **external agent** produced (E1: "an outside process plays a whole Match") or that a bug report carried in as a small text file. Every rule then has to defend against a shape the closed vocabulary was supposed to have made impossible, and a malformed log fails somewhere deep in the rules instead of at the boundary with a sentence naming the field.

**Recommendation.** Either validate in `replay` (one `validateCommand` per entry, reusing the driver's error type), or state explicitly in ADR-0003 and the README that replay is a *trusted re-enactment* and the log is not an input surface — and then make E1's protocol validate on the way in, since it is the one that writes logs from outside. The first is smaller and makes the invariant unconditional. Whichever is chosen, add a test: today nothing in `tests/sim/replay.test.ts` would fail if `replay` accepted `{ kind: 'teleport' }`.

### F7 — the state hash is not a pure function of state: accessors are invoked

**ADR:** 0006. **Severity: Low-Medium.**

**Evidence.** `serializeState` reads each own property by index:

```ts
// src/sim/state.ts:109-111
const parts = Object.getOwnPropertyNames(value)
  .sort()
  .map((key) => `${JSON.stringify(key)}:${write(value[key], `${path}.${key}`, seen)}`);
```

`value[key]` invokes a getter. Probe: a state carrying a getter `morale` that returns an incrementing integer serializes as `{"morale":1}` and then `{"morale":2}`, and hashes `33e90eadb0a17a16` and `33df0eadb0992591` — **the same object, two different hashes**.

**Consequence.** ADR-0006 makes the hash the fingerprint two runs are compared by, and `replay.ts` turns "the hashes differ" into a divergence report naming the first tick that differs. A rule that puts an accessor in the world — a plausible way to derive a value lazily — makes the hash unstable per call, so a replay comparison reports a divergence that is not one, and the report points at the wrong tick. The serializer was careful about the exotic cases that *look* like data (`DataView`, big-int typed arrays, symbol keys, hidden non-enumerable fields); an accessor is the one kind of own property that is not data at all.

**Recommendation.** Reject accessor properties in `serializeState` the way it rejects everything else that is not an integer, an array or a plain object — `Object.getOwnPropertyDescriptor(value, key)` with a `get` or `set` is a `StateSerializationError` naming the path. One condition, one message, one test; or freeze the world at the driver boundary, which would close F2 as well.

### F8 — "every draw comes from sfc32" is enforced only as "no `Math.random`", and five spellings escape

**ADR:** 0006. **Severity: Low.**

**Evidence.** The fence's walk is deliberately syntactic, and says so (`math-members.mjs:12-15`): "It cannot see through a computed member name or an alias of the global `Math`, and it does not try to: a guard that says what it cannot see beats one that quietly misses." The README and the guard output do not repeat that limitation, though. Probed inside `src/sim/rng.ts`, all of these leave the guard green: `const M = Math; M.random()`, `globalThis.Math.random()`, `Math['ran'+'dom']()`, `crypto.getRandomValues(new Uint32Array(1))`, `Date.now()`.

**Consequence.** Two of the five are outside the letter of the fence as written but inside the ADR's normative sentence, "every random draw comes from `sfc32` seeded through `xmur3`": `crypto.getRandomValues` is a random draw from somewhere else, and `Date.now()`/`performance.now()` are the other nondeterministic inputs a rule can reach. The remaining three are documented limits of a syntactic guard, which is acceptable — but they are limits the fence's own message ("never the global generator") implies do not exist.

**Recommendation.** Two cheap, honest changes: (1) extend fence #2's fenced members for the simulation to include `crypto` and the wall clock (`Date.now`, `performance.now`) — neither is ever legitimate inside a Match — and (2) say the alias/computed-name limitation in the README's fence #2 as clearly as `math-members.mjs` says it, so a reader knows what the green tick means. Full alias tracking is a taint analysis the guard explicitly declines; documenting the decline is the proportionate fix.

### F9 — `scripts/guard.mjs` numbers two of its three fences

**Severity: Trivial.** The header lists "1. … (ADR-0001); 3. … (ADR-0006)" and then says "All three are crude on purpose" (`scripts/guard.mjs:5-9`), skipping item 2.

**Consequence.** This doc comment is the shortest statement of what the fences are, and the file most likely to be opened first; a reader counts two rules, reads "all three", and has to go to the README to find the missing one. The cost is a minute of confusion per reader against a one-line fix.

**Recommendation.** Add the `Math.random` line to the header.

---

## Part D — what the code does that the ADRs did not anticipate

These are not deviations; they are decisions the code had to make where the ADRs are silent, and they are the parts of the foundations most likely to be mistaken for accidents later.

1. **Malformed and illegal are different refusals at different layers.** `command.ts` owns "this is not a Command" (unknown kind, missing or extra field, a Squad named twice, an empty Squad list, a Faction nobody implements); the rules own "this is a Command, but not one this Faction may issue now" (an enemy Squad, a tile under water, a ram Carthage does not have). ADR-0003 says the vocabulary is closed but does not say where a *well-formed but illegal* Command is refused. The split is deliberate and documented, and `runMatch` protecting the rules from having to say "was this the right Faction?" depends on it (`driver.ts:38-48`).
2. **A Command may hold words; state may not.** ADR-0006 says authoritative state is integers only and is silent about the Command log, which a replay is made of. The code decides a Faction is `'rome' | 'carthage'` and a formation is `'line' | 'column'` — "a `Faction` is not state: it is what a Controller emits and what a document an external agent reads, and `"rome"` in a JSON line is worth more than `0` with a comment" (`faction.ts:10-13`). Sensible, and worth recording as a decision rather than a corner.
3. **`-0` is `0`, and a `Uint8Array` is an array, for hashing purposes.** The canonical form writes `-0` as `0` (tested: "writes negative zero as zero, because they are the same integer") and writes integer typed arrays exactly as the equivalent plain array (tested). Both are canonicalizations the ADR does not mention: the first is right for an integer model, the second means a rule may change a grid's representation without moving the hash — which is desirable for avoiding false divergences and is also a real change the hash cannot see.
4. **The seed is part of the fingerprint.** `hashState` covers `{ tick, seed, rng, world }` (`match.ts:23-35`). The seed is provenance rather than state: every seed expands to exactly one starting cursor (`seedState`), and a Match that has drawn nothing already carries that cursor in its hash, so the seed distinguishes only seeds whose 128-bit expansions would collide. Including it makes the fingerprint cover where a Match came from as well as where it is. The README describes the hash as covering "the clock, the world and the random cursor together"; the seed is a fourth thing, and ADR-0006 does not say whether provenance belongs in it.
5. **The empty Match is a first-class, gated contract.** `src/sim/empty.ts` exists to make "no systems yet" runnable, hashed and golden in CI — `bf3d192e9ab9eb5f` at seed 1, 600 ticks. ADR-0001/0003 assume a simulation with systems in it. The code has turned the absence of systems into a stable value that B1–C5 will have to move deliberately, which is a stronger version of "changing the hash is a decision, never an accident" than the ADRs asked for.
6. **`Match.step` is public, so "the seam" is one interface, not one call site.** `createMatch` returns a `Match` with `step(commands)` (`match.ts:68`), and there are already two callers — the driver and `replay` (F6). A third caller anywhere would bypass whichever validation the other two did (or did not) do, and no fence looks for that. ADR-0003's "one seam" is enforced for *Controllers* by types and for *nothing else* by construction.
7. **The reachability fence stops at a bare specifier, by design.** The day `src/sim` imports its first package, the fence reports the dependency and cannot see inside it, so "imports no engine code" becomes "imports no engine code through repository sources". The README states this; ADR-0001's guarantee is stronger than what the fence can hold, and the gap grows with every dependency the simulation takes.

---

## Part E — limits of this review

- **Nothing was fixed.** As the ticket requires, findings only; each recommendation names the wave or ticket that should carry it.
- **The `node_modules` hole was not probed.** It is documented in the guard and the README; proving it would mean installing a package that imports `pixi.js` and reaching it from `src/sim`, which is a change to the tree rather than a review of it.
- **Computed-name and alias escapes were probed one spelling each**, not exhaustively; the guard's own doc comment is the authority on what it cannot see.
- **Cross-machine determinism was not measured** — only one machine was available. F5 is exactly about that: the gate that would measure it draws nothing.
- **The e2e suite was run once, headless, with SwiftShader**, as the repository configures it; it proves the debug hooks and the WebGL loop, not the rendering features that arrive with B2.
