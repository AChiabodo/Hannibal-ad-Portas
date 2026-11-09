# P7 — Main menu, paused Resume and a complete practical Tutorial

Published: [#70](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/70). Parent: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63). Triage: ready-for-agent. P aliases refer to the adjacent published index.

## What to build

The human enters through Play, Tutorial, Encyclopedia or Options, can leave a Match paused in memory and Resume, and learns the opening-to-Siege loop in repeatable practical chapters. Integrate navigation and teaching as one complete user journey using P6's reference rather than shipping a menu of empty destinations.

## Acceptance criteria

- [ ] Main menu offers Play, Tutorial, Encyclopedia and Options. Play leads to the existing seed/Faction/difficulty configuration; preserve valid shareable direct-Match addresses, hosted base paths and clear navigation back to the menu.
- [ ] Returning from an active Match preserves it paused in memory and exposes Resume. Opening Options/Encyclopedia, returning from practice and navigating configuration do not silently discard or advance that suspended Match. Retain explicit new/restart/leave safeguards and one clearly active Match/Controller loop.
- [ ] A repeatable dedicated Tutorial has practical chapters for economy/Seasons, construction/recruitment, movement/combat and Territory/Siege. It teaches the new size/Payroll, economic categories and basic group handling rather than the obsolete 120-man-only opening.
- [ ] Opening opposition is exercise-controlled; the final chapter uses the shipped normal AI and a real encounter. Tutorial data stays isolated from a suspended normal Match, never injects unseen facts into its UI and cannot change its resource/rule state.
- [ ] Objectives transition only after real permitted outcomes through the Controller/Command/Observation path, with correct refusal/retry/reset behavior. Next/dismiss cannot award an unperformed objective. The human can repeat chapters, exit safely, reopen concise Guide/help and consult the Encyclopedia.
- [ ] Pointer/keyboard focus, scrolling, exit/return and progression are usable at both desktop sizes in the existing bitmap/procedural style. Explain that Resume is in-memory and does not survive page reload/closure; do not add a save system or make storage failure block entry.
- [ ] Test public menu/Tutorial progression and suspension through behavior: an objective not performed stays incomplete, a valid Command advances it, practice exit restores the paused normal Match unchanged, and Resume continues its existing clock/log without catch-up or duplicate AI ticks.
- [ ] Demonstrate actual normal entry → configure → play → menu/reference/options → Resume and Tutorial → final AI encounter → return using real pointer/keyboard interactions. Verify valid direct configuration links and hosted entry paths. Inspect representative menu/Tutorial frames.

## Testing decisions

Reuse public navigation, Guide/UI models and host interfaces. Keep objective breadth outside Chromium; browser checks prove a real exercise and entry/return flows. A scripted Tutorial opponent is an ordinary exercise Controller, not a privileged rule-mutating UI. P8 retains multi-seed timing acceptance; this ticket still proves its own final-chapter real encounter.

## Shared constraints

Keep Italian String table text, procedural PixelBuffer/PixiJS and Observation/Command discipline. Presentation/menu suspension is hash-neutral; practice runs in its own normal deterministic rules session. Preserve current privacy of unknown/remembered enemy information.

## Blocked by

P6 — Understandable economy and Encyclopedia (transitively includes P3/P5; required for accurate practical content, completed movement behavior and working reference entry).

## Out of scope

Persistent saves, global content progression/unlocks, player-facing Replay, hosted public wiki, new AI difficulty rules, audio and release/deployment.
