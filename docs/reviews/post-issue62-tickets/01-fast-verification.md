# P1 — Fast focused verification with explicit browser and visual gates

Published: [#64](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/64). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

Developers can select a focused check, a small real-browser smoke, relevant feature checks, complete acceptance or visual-evidence generation without repeatedly executing every Chromium matrix. Keep coverage attributable and the normal failure evidence usable. This is a complete developer-workflow slice across local commands, CI selection and documented evidence, not a ticket to delete tests by count.

## Acceptance criteria

- [ ] Inventory all current browser responsibilities and map each retained, consolidated or relocated check to its new owner. Distinguish expensive frame producers from functional regressions. Remove a duplicate only when another check demonstrably protects the same behavior.
- [ ] Provide documented commands/profiles for focused non-browser checks, browser smoke, targeted feature checks, complete pre-integration acceptance and explicit visual-frame production. Smoke drives real boot, an ordinary Command/input path and rendering/console health without a full art/economy matrix.
- [ ] Measure focused ≤60 seconds and browser smoke ≤90 seconds on a recorded environment; report warm/cold state, provisioning time and actual results. Failures must explain the defect, not require a blind retry to collect evidence.
- [ ] CI exposes fast feedback and an explicit complete acceptance gate. Selection rules and a fail-safe for broad/shared changes are documented; no integration path silently skips required complete acceptance. Do not weaken existing release/performance gates.
- [ ] Preserve meaningful pointer/keyboard, fog/Observation, queued/applied, Replay, Atelier and asset-guard coverage. Do not hide a failing scenario behind larger global timeouts, retries, looser assertions or an indiscriminate path filter.
- [ ] Demonstrate the workflow against a representative narrow change/check selection and a complete baseline run. Archive the coverage map and timing report as text; explain existing flaky/failing cases rather than relabel them passed.

## Testing decisions

Use existing public Match/Controller/Observation and UI models for breadth, existing browser hooks plus real gestures for integration. Verify that a deliberately selected failing sample is still included by the relevant profile. Avoid new tests that merely mirror command aliases or implementation lists.

## Shared constraints

Preserve procedural PixelBuffer/PixiJS, deterministic generation and integer authoritative simulation; Italian player text and faction-filtered knowledge. This ticket changes verification workflow, not game rules. No binaries or image-generation models. Every following feature ticket still supplies its own checks.

## Blocked by

None (can start immediately). Other feature tickets need not wait for this reorganization to use the existing checks.

## Out of scope

Feature implementation, arbitrary test deletion, claiming hardware 60 fps, and closing #29/#31/#32 or modifying unrelated parent issues.
