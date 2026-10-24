# Issue #70: entry, suspended Match and practical Tutorial

The implementation starts from `6c484f2`. The pause menu, settings, Encyclopedia,
construction catalogue, compact economy panels and concise Guide from #69 remain
the teaching controls. This change adds the missing page lifetime around them.

## Behavior

The root entry opens Gioca, Tutorial, Enciclopedia and Opzioni. Gioca opens the
existing configuration; valid `play=1` addresses still enter a Match directly.
Addresses are composed with `ENTRY_PATH`, including a hosted repository prefix.
The pause menu's Menu principale preserves the normal Match in memory and offers
Riprendi. Configuration, reference and options do not step or replace it. Starting
a replacement or restarting requires confirmation. Reload and closure lose it;
the menu says so, and leaving the page with an unfinished session has a safeguard.

`input/journey.ts` owns the current host. `render/journey.ts` retains its renderer,
camera and selection, stops its animation loop and removes its canvas from the
active document. Resume reattaches that same renderer, resets its frame clock and
preserves a Guide-owned pause. Keyboard bindings belong to the active canvas;
disposal aborts renderer window listeners and destroys Pixi resources. There is
one active Controller loop, even with a normal Match suspended behind practice.

Tutorial chapters start independent ordinary rules sessions on seed 7 as Rome:

1. Economy: complete construction and experience a Season boundary.
2. Recruitment: raise two real 24-man Squads and complete construction.
3. Movement/combat: move two Squads through a group order and enter real combat
   against a Controller that recruits one defending Squad through normal Commands.
4. Territory/Siege: capture a minor settlement, enter combat against the shipped
   Tiro AI and open a real Siege front. Outcomes can be performed in any order;
   the instructions advance in teaching order.

The first two opponents remain idle. No chapter changes rules, grants resources,
reveals fog or mutates a live world. An after-tick presentation observer receives
copies of only the human Faction's Observation and Commands. Objectives depend on
resolved outcomes, not submission or acknowledgement. Next appears only after
completion and returns to chapter selection; it never awards an objective.
Retry creates a fresh session after confirmation. Exit returns to chapters, and
the preserved normal Match remains paused. Aiuto/F1 uses the existing reference;
the concise Guide can be reopened from the existing pause settings.

## Verification and limits

Non-browser behavioral tests cover refusal, construction completion, real sizes,
group movement, repeat attempts, normal-session isolation and exact clock/log/hash
continuity against an uninterrupted host. The final practice test reaches combat
against the normal AI, captures a village and opens a permitted Blockade through
ordinary human Commands. Public UI models check entry/configuration and complete
Tutorial instruction geometry at 1280x720 and 1920x1080.

`e2e/journey.spec.ts` adds real pointer/keyboard entry, practice, reference/options,
Resume, recruitment and final normal-AI encounter coverage and optional frames.
Existing entry specs now pass through the main menu. The `host` profile owns these
checks; the visual profile owns their frame production.

`npm run verify` passed: lint, TypeScript, guards, 124 files / 1,431 non-browser
tests and production build.

**Chromium has not been run.** Browser interactions, actual rendered frames,
console health and hosted entry remain unverified in this delivery. AGENTS.md
requires an explicit user request before any Chromium test. Model geometry and
headless rules outcomes do not replace those acceptance requirements, so #70
must remain open pending browser evidence.

## Standards review

No mandatory documented-standard breach was found. PixelBuffer/PixiJS, Italian
String table, Controller/Observation/Command discipline and presentation-only
suspension follow PLAN sections 2-3 and ADR-0014.

One maintenance judgement remains: the entry settings dispatcher shares the
layout/scale/navigator/reset transition shape with the existing in-Match settings.
A future common preference change should update both; Guide and clock effects
remain specific to their host. A shared pure transition could reduce this later.
No rules or preference-system refactoring was added to this ticket.

Standards total: zero mandatory findings, one possible duplication smell.

## Spec review

Two P2 findings were corrected and rechecked:

- A refused group order could inherit progress from earlier individual movement.
  The objective now excludes refused/routing Squads and records previous observed
  positions. A regression reproduces an off-map group refusal while both Squads
  are already moving independently and confirms progress remains zero.
- Keyboard activation of Exit/Next/Retry could dispose practice and then repaint
  its destroyed stage. The handler now stops when navigation detaches the canvas;
  the authored browser journey includes F6/Enter activation of Exit.

Drawing the actual non-browser menu plate also exposed a DOM title's unsupported
em dash. The bitmap entry now has its own String table title and a rendering
regression at both resolutions. The 1280x720 generated menu plate was inspected;
this is a procedural specimen, not a browser frame or interaction verdict.

Spec total: two initial P2 findings fixed; zero remaining concrete defects in the
recheck. Browser acceptance remains unverified as described above.
