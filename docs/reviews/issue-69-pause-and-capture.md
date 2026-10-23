# Issue 69: resource bar, pause menu and neutral capture

This follow-up implements the Player's additional four requests after `b560f49`.
B remains the default and A/C remain saved alternatives. All drawing remains
procedural PixelBuffer/PixiJS; no new gameplay state or hidden information is
introduced by the interface.

## Visible behavior

Without a selection, B's right panel disappears completely and releases both map
space and the input mask. The resource bar distinguishes faction Treasury from
named local stocks, displays the calendar and pace, and keeps only Menu,
Encyclopedia and Notices as permanent actions. Unknown local stocks read `?`.

Esc opens a centered RTS-style modal pause menu. Resume, Settings, Encyclopedia,
restart, new Match and copy-map-seed have full labels. Settings is a separate page
with a declarative list of controls, so new options do not crowd the resource bar.
It includes the retained A/B/C presets, scale, navigator, guide, reset and speed.
The background is dimmed and pointer/wheel/minimap/keyboard input cannot reach
the map. Esc from Settings returns to the main page; Esc from that page restores
the previous running/paused state and preserves selection. Resume explicitly
resumes a live Match; a first-entry Guide retains ownership of its own pause.

## Capture diagnosis and correction

The existing Encyclopedia already had a capture article. Its discoverability was
insufficient: a neutral place now shows the practical instructions, observed
centre-control count and a direct Guide/F1 link. Construction and recruitment
tabs are absent until the settlement belongs to the faction. Open places say
that they have no walls, rather than showing `0/0` standing walls.

The rules require an eligible field Squad on the canonical centre, for three
consecutive checks five active seconds apart. A roof or hut occupies pixels over
other terrain tiles. Previously a ground movement click used that underlying
tile, whereas Assault already targeted the drawn structure. Movement now snaps a
click on a currently sighted neutral structure to its centre. This changes the
input interpretation; it does not change capture radius, balance, timers, routing,
force, group arrivals, or simulation hashes for a given Command log.

A real Match regression marches two squads to a neutral place and captures it for
either faction. The original siege tests pass; no simulation-rule defect was
reproduced. Native browser checks also completed capture for Rome and Carthage
through a right-click on the drawn place, with the newly owned place appearing
in the navigator. These use an authored deployment on the real rules with an
idle opponent, rather than claiming an AI campaign was completed. The fixture
is `e2e/siege-fixture.html?stage=neutral&view=rome` (or `carthage`).

## Review

Standards review found two incorrectly encoded accented characters in new text.
They were repaired and modified sources are checked as strict UTF-8. No other
substantive Standards finding was reported. Spec review found no missing request,
incorrect implementation or scope creep in the examined implementation. Both
reviews were static and did not launch browser automation.

Native inspection also caught unknown resource words overlapping adjacent
readouts; the bar now uses bounded `?` values and a public-layout regression.
Browser acceptance specs were aligned to the new pause/settings navigation and
explicit purchase step. Standalone Chromium/Playwright profiles remain unrun.

## Final validation

`npm run verify` passed lint, TypeScript, guards, all 121 Vitest files / 1,420
non-browser tests and production build. The two static reviews have no residual
actionable findings after corrections.

Native IAB inspection covered the main pause menu at 1280x720 and 1920x1080,
full settings labels, Esc back/close, restoration of a manually paused Match,
selection preservation, background-input blocking, and B with no selection.
The final neutral view confirmed bounded unknown stocks and readable capture
instructions. Captures for both factions were completed through real gestures
in the authored neutral fixture. The final root and neutral tabs had no console
warnings or errors. This is interactive evidence, not a standalone Chromium
acceptance-suite result.

Screenshots are saved in the task's visualization folder as
`issue69-pause-final-720.png`, `issue69-pause-final-1080.png`,
`issue69-resourcebar-final-720.png` and `issue69-neutral-help-final-720.png`.
## Construction-list discoverability regression (2026-10-24)

The list had not been deleted: existing buildings and unfinished Works remained
under Overview's footer action, labelled `Lavoro`, but the construction catalogue
had no direct entry. Add `Lavori` beside the three settlement tabs in A/B/C;
activating it switches to Overview/Works, clears proposal inspection and resets
scroll. The full page name is `Edifici e coda`. No simulation state changes.

The public HUD regression first failed because the catalogue had no
`settlement:works` action, then passed for all three presets, including the
presence of a completed Fattoria and a construction countdown. Native IAB testing
followed the actual catalogue purchase and clicked Lavori to see the running
Fattoria countdown. Static Standards and Spec reviews reported no findings.

Final validation: `npm run verify` passed lint, TypeScript, guards, 121 test files /
1,421 tests and production build. Native purchase-to-completion showed the same
Fattoria first with a countdown and then `In attivita`; console warnings/errors
were empty. Standalone Chromium profiles were not run.
