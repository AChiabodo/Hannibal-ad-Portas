# Issue #52 - Essential HUD repair

Verified on 2026-10-20 against [#52](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/52) and the shared approved requirements in [#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51).

The HUD now keeps the selected Squad's Order/refusal, or the first active settlement Work, above scrollable secondary figures. Text wraps within the existing column, including long unbroken values. Entity names include their IDs; pinned headings show settlement and Squad counts. Scrolling does not replace selection; vanished entities are dropped and surviving selected Squads remain available. Offsets clamp after content shrinks and detail scrolling resets on a new selection.

Pause has a visible button and explicit IN PAUSA / IN CORSO text. Space, pointer and hooks redraw the same state immediately. HUD controls also work while an attack-move is armed. The existing PixelBuffer generator and Pixi adapter draw every new control; no external assets, new glyphs, simulation rules, Commands or dependencies were added. The now-visible Work separator and empty marker use supported ASCII glyphs.

## Environment and checks

Browser plugin not available; used the repository Playwright workflow with headless Chromium and software WebGL (SwiftShader). Base URL: `http://127.0.0.1:4173/`. Desktop browser viewports: 1280x720 and 1920x1080. The existing production canvas remains 640x480; adaptive layout/UI scaling belongs to #54. A separate 640x320 test canvas makes the real opening roster overflow using the existing public `createGame` size parameter, without a production scenario hook.

| Check | Evidence |
| --- | --- |
| Page identity | Main route and Italian title checked in both desktop viewport tests |
| Nonblank rendering | Actual live and regression scene screenshots inspected; selected details, controls and overflow rows render |
| Framework overlay | No Vite error overlay in live interaction tests |
| Console health | No uncaught/request errors or warning/error messages in live HUD checks; the full diagnostics suite's deliberate error is expected |
| Interaction proof | Live pause and detail tests at both desktop sizes; real overflowing-list test with pointer, wheel, keyboard and shared hooks |
| Simulation boundary | Paused hash remains identical after selection/scroll interactions; no simulation or content files changed |

## Commands and results

- `npx vitest run tests/ui/hud.test.ts tests/ui/strings.test.ts tests/render/browser-docs.test.ts` - targeted public HUD/model checks.
- `npm run check` - TypeScript checked repeatedly during implementation.
- `npx playwright test e2e/hud-repair.spec.ts --workers=1` - seven focused browser tests passed before final verification.
- `npm run verify` - lint, TypeScript, guards, all 1107 tests across 96 files, and production build passed on the final code.
- `npx playwright test --workers=2` - all 56 browser tests passed on the final code, including Atelier, map zoom, fog, selections, orders, hooks and complete-Match regression suites.
- `git diff --check` - passed.

The red/green regressions first demonstrated the missing pinned Order and survivor selection behavior. Review added A -> HUD scroll/pause tests, which failed before the control precedence fix and then passed. An existing empty-map click helper was corrected to exclude HUD rectangles. An earlier overlapping pair of Playwright invocations shared output files and invalidated diagnostics; the final full browser run used one invocation and stable source.

## Exact interaction paths

- Pause hook -> select Squad -> wheel over detail -> Shift+PageUp -> A -> click detail Giù -> scroll hook -> click panel background -> unchanged selection/hash.
- A -> click visible Riprendi -> IN CORSO -> Space -> IN PAUSA -> resume hook -> IN CORSO -> Space.
- Real overflowing list -> wheel down -> PageUp -> A -> click list Giù -> PageDown -> unchanged selection/hash -> scroll hooks to both limits -> Escape targeting -> click last visible row -> that Squad selected.
- Public model: 80 Squads -> final row reachable/hit-testable -> selected Squad disappears -> surviving selected Squad shown -> smaller list clamps offset. Long labels and uninterrupted numeric values remain reachable through detail scrolling.

## Rendered evidence and applicability

`e2e/hud-repair.spec.ts` regenerates ten PNGs outside the repository at `%TEMP%\spqr-issue52`:

- `live-paused-1280.png`, `live-paused-1920.png`: actual theatre, selection, explicit pause and detail overflow controls.
- `{rome,carthage}-squad-{1280,1920}.png`: refused Order, selected final Squad in an 80-Squad list, counts and overflow controls.
- `{rome,carthage}-settlement-{1280,1920}.png`: active Villa Work with a deliberately long remaining-time value wrapped above secondary figures, plus the overflowing roster.

The faction regression scenes use real `observeEconomy` filtering before constructing the HUD model, then draw it with the production `createHudLayer` / PixelBuffer adapter. Refusals and the long Work are controlled fixtures, not claims of a new player construction/refusal flow. Full live Faction setup and economy Commands remain #53/#55 work.

The HUD is in screen space and lists only owned entities from the allowed Observation. Remembered/unknown enemy details are therefore non-applicable: this repair adds no enemy detail or live hidden-world reads. Live screenshots retain the existing visible/unknown map; the unchanged fog suite exercises visible, remembered and unknown transitions. HUD placement is checked at all supported map zooms (1-8) by the full existing browser suite; duplicating each screen-space fixture screenshot at every map zoom would show identical HUD pixels. No art asset definition, palette or glyph was changed, so a new Atelier catalogue entry is non-applicable; the existing Atelier suite passed through the same adapter.

Review base: `0ca84da212abd4437cf748045d5b8cfc9ca1cd9e`. Implementation commits: `7f0b7bb`, `62aaf51`.

## Standards

Initial review: no documented-standard violations; one nonblocking concern about using translated label/value text to identify priority lines. Resolved by building explicit priority indices, preserving distinct identical Work descriptions. Final read-only re-review: zero findings.

## Spec

Initial review: P2, armed attack-move swallowed pause/scroll button clicks. Resolved by giving interface clicks precedence over armed map targeting, with red/green pointer tests. The missing live-list interaction evidence was added via the existing game composition seam. Final read-only re-review: zero residual findings; visual applicability is recorded above.

## Remaining gates

Hardware/full-density 60 fps measurement (#31), other browsers, mobile, adaptive desktop layout (#54), complete new functional UI flows (#53/#55) and release/deployment (#32) were not performed or claimed by this repair. SwiftShader screenshots establish rendering, not hardware frame rate. No density reduction or map resize was used in production. Related issues, roadmap and native dependencies remain unchanged. Commits are local on `develop`; no push or tracker closure was performed.
