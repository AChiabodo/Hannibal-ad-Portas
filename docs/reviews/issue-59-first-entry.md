# Issue #59 — First-entry guidance and integrated visual acceptance

Verified on 2026-10-20 against [#59](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/59), its blockers
[#56](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/56), [#57](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/57) and
[#58](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/58), and the shared approved requirements in
[#51](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/51) (Q3, Q11, Q19, Q22, Q23).

A first human used to meet a theatre, a list and a card of commands without being told what any of
them is for, and the only help was two lines of text in the corner of the detail panel. Now **setup
states the Match being configured** — the Faction's character, what difficulty changes and the actual
objective — and a **first entry starts paused on a short, optional Guide** that teaches the four acts a
Match opens with. The Guide is performed in the real interface: the Player opens the drawn Stronghold,
presses the Recruitment card, clicks the soldiers and right-clicks the ground, and the Guide moves on
only when those acts have actually happened. It can be skipped, dismissed and reopened, remembers only
its dismissal as a presentation preference, issues no Command and reads no Observation.

Nothing in the rules moved. The approximate diff of the whole ticket is `src/ui`, `src/render`,
`src/main.ts`, the string table, the glossary, tests and this document; `git diff --stat -- src/sim
src/content src/ai` is **empty**, and every simulation, replay and AI hash in the repository is
untouched. The art is untouched too: `npm run bake` still reports **494 artefacts**, a
**455×1964** catalogue plate and the unchanged plate hash **`280d0f795302fecb`**.

## What was added, and where

- `src/ui/guide.ts` — **the Guide as a pure state machine**. Six stages (`welcome`, `stronghold`,
  `recruit`, `select`, `move`, `complete`) and one event per real act (`begin`, a `selection`, a
  submitted Command verb, `skip`, `close`, `reopen`). `guideNext` is monotonic: an act carries the
  Player forward and never back, so a Player who recruits, selects and marches before reading cannot
  be sent back to a line they have passed. Every line is a fixed sentence from the string table; the
  module takes no Observation and therefore cannot name the enemy. `guidePanel` returns the Italian
  title, step count, lines and controls.
- `src/ui/strings.ts` — the setup explanations (`match.objective`, `match.factionHelp`,
  `match.difficultyHelp`, a longer `match.setupHelp`) and the Guide's sentences
  (`guide.welcomeObjective`, `guide.welcomePaused`, `guide.stronghold`, `guide.recruit`,
  `guide.select`, `guide.move`, `guide.complete`, `guide.begin`, `guide.skip`, `guide.close`), in
  Italian and English. The old one-line `ui.navigationGuide` is gone: it was the help the Guide
  replaces.
- `src/ui/match-menu.ts` — `setupLayout` was recomposed as a **600×360 page** with wrapped lines:
  title, the objective, the Faction's character, what difficulty changes, the seed hint (and the
  invalid-seed sentence), four controls, and the keyboard hint. `setupPlate` draws it. The old menu's
  fixed y-offsets and the `matchMenu` announcement plate are unchanged; `wrapText` is exported from
  the HUD so both pages wrap a sentence the same way.
- `src/ui/hud.ts` — the Guide's **panel**: `HudModel.guide`, a placed rectangle, its wrapped lines
  and its buttons (`guideBegin`, `guideSkip`, `guideClose`), drawn with the HUD's own ground and inks.
  `hudHit` returns the Guide's buttons before anything under them, and the non-desktop layout returns
  an empty rectangle, because the Guide is a desktop first-entry surface.
- `src/render/game.ts` — the wiring: the Guide opens on a first entry; the page pauses the clock it
  now holds; **Begin** (or Space, which is beginning too) releases that pause; Skip/Close release it
  and write `guideDismissed`; Options → *Nascondi guida* closes it and *Mostra guida* reopens it at
  the welcome line; `resetPreferences` reopens it; a finished Match closes it without changing the
  preference. The page reports every real act (`human.select`, box selection, row selection, group
  recall, group back, each submitted Command) to `guideNext`. It also includes the panel in
  `hudRects`/`interfaceRects`, so the theatre under it cannot be clicked or ordered through.
- `src/render/boot.ts` + `src/main.ts` — **first entry is a property of the entry page**. The Guide is
  asked for by `main.ts` (`firstEntry: true`) and not by composed fixtures or scenarios
  (`firstEntry` defaults to `false`), so the evidence and regression scenes are not changed by an
  onboarding overlay.
- `GLOSSARY.md` — **Guide** is now a term: the optional first-entry sequence that names the real
  controls and waits for the Player, not a tutorial, rule set or scripted army.
- `docs/BROWSER.md` — `toggleGuide` now means "open the Guide at welcome, or close it and record the
  dismissal"; its stage and lines are read from `hud().guide`, its controls from
  `hudLayout().guideButtons`. No hook or snapshot field was added, so the published surface and the
  documented surface still agree.

## The Guide's contract

| Subject | Rule | Where |
| --- | --- | --- |
| First entry | The welcome line, and the Match paused on tick 0 | `render/game.ts`, `ui/guide.ts` |
| Waiting | Only a real act or *Inizia* leaves welcome; wall time does not move the clock | `ui/guide.ts`, `e2e/first-entry.spec.ts` |
| Four acts | open a settlement → recruit → select a Squad → give a destination | `ui/guide.ts` |
| Monotonic | A later act never sends the Player back a line | `ui/guide.ts`, `tests/ui/guide.test.ts` |
| Skippable | `Salta guida` on the welcome line and every teaching line | `ui/guide.ts` |
| Dismissal | `guideDismissed` is the only preference it writes; storage failure cannot block play | `render/game.ts`, `ui/preferences.ts` |
| Reopen | Options → guide button, or `toggleGuide`; starts at welcome and holds the clock again | `render/game.ts`, `docs/BROWSER.md` |
| Ownership of the pause | The Guide releases only a pause it took; an explicit pause stays | `render/game.ts`, `e2e/desktop.spec.ts` |
| Begin | *Inizia* always resumes the clock the welcome line is about, including a pause the Player made before reopening | `render/game.ts`, `e2e/first-entry.spec.ts` |
| No Command | Every act is read, never emitted; the applied log is unchanged by the panel | `render/game.ts`, `e2e/first-entry.spec.ts` |
| No enemy knowledge | Every line is fixed text; no id, coordinate, count or Faction name | `ui/guide.ts`, `tests/ui/guide.test.ts` |
| No rule change | `src/sim`, `src/content` and `src/ai` untouched; the state hash does not move while paused | this report, `e2e/first-entry.spec.ts` |

Step numbering is the four teaching acts: `Guida 1/4` … `Guida 4/4`, with `Guida` on the welcome
line and `Guida completata` at the end.

## The observed walkthrough

The walkthrough below was performed twice: by `e2e/first-entry.spec.ts` through canvas clicks and
right-clicks, and by an independent Playwright session against the dev server that printed each
page state. The second run paused the clock between steps so that every step is one page state; the
browser spec separately proves that *Inizia* and Space resume it. These are the values that run
observed (seed 59, Rome, 1280×720, `centurio`):

| Step | Player act | Guide | Page |
| --- | --- | --- | --- |
| boot | — | `welcome`, actions `Inizia` / `Salta guida` | tick 0, paused, nothing selected, 1 navigator row |
| begin | press **Inizia** (or Space) | `stronghold`, `Guida 1/4` | Match running |
| 1 | click the drawn Stronghold | `recruit`, `Guida 2/4` | `settlement: 0`; the panel opens on its pages |
| 2 | press `Reclutamento`, then the `Astati` card | `select`, `Guida 3/4` | `Inviato: Astati | In attesa: 1 (in pausa)`; the card says `Grano 8, Ferro 2 - Uomini 120 - Soldo 3` |
| — | one tick | `select` | the card is now `Inviato: Astati`; 2 navigator rows; Squad 1 stands |
| 3 | click the soldiers | `move`, `Guida 4/4` | `squads: [1]`, `settlement: null` |
| 4 | right-click ground three tiles away | `completata`, action `Chiudi guida` | `Inviato: Muovi | In attesa: 1 (in pausa)`; after a tick `Inviato: Muovi` and the Squad panel says `In marcia` |
| close | press **Chiudi guida** | closed | `guideDismissed: true`; the player's own pause is still paused |

The walkthrough established the acceptance criterion's three questions without the README:

- **Where are the Commands?** After the Squad is picked, the card is at the bottom right and names
  `Muovi`, `Marcia d'attacco`, `Fermo`, `Ritirata`, the formations and the Siege offers, each with
  its icon and its key. The Guide's fourth line says exactly where that card is.
- **What is selected?** The picked block wears its condition plate and standard, every picked Squad
  is highlighted in the navigator, and a multiple selection shows a group panel with its exceptions.
  The walkthrough's selection was read back as `squads: [1]`, then a two-Squad box as two ids.
- **What did the order do?** The panel above the card says `Inviato: Muovi` and then, while a paused
  Match holds it, `In attesa: 1 (in pausa)`; after the tick the Squad's own line says `In marcia`,
  and a refused move says `Acque profonde` both in the Squad's panel and as a `>` notice.

## Rendered evidence

The two new browser specs write **50 PNGs** to `%TEMP%\spqr-issue59` (never committed: the guard
refuses image files). Every file's dimensions were checked after the run; the names are the matrix:

| Group | Files | What was asserted before the capture |
| --- | --- | --- |
| Setup | `setup-1280x720.png`, `setup-1920x1080.png` | the accessible label carries the objective, both explanations and both choices, in Italian |
| Welcome | `welcome-{rome,carthage}-{1280x720,1920x1080}.png` | the Guide is open, the Match is paused on tick 0 while 250 ms of wall time passes, and the Stronghold's drawn centre is bare theatre under the pointer |
| Settlement step | `settlement-open-{faction}-{size}.png` | a pointer click on the drawn Stronghold selects its id and moves the Guide to `recruit` |
| Pending order | `recruit-pending-1280x720.png`, `order-result-1280x720.png` | a queued Command says `In attesa`, the next tick says `Inviato`, and the Squad says `In marcia` |
| Individual / multiple selection | `single-selection-{faction}-{size}.png`, `mixed-selection-pending-{faction}-{size}.png` | a row press picks one; a dragged box picks both; one order goes to both and is queued while paused |
| Refused order | `refused-order-{faction}-{size}.png` | a right click on the seed's river produces a `refusal.water` notice and the same words in the Squad's panel |
| Zoom | `zoom1-{faction}-{size}.png`, `zoom8-{faction}-{size}.png` | the picked Squad centred at the camera's coarsest and finest magnifications |
| Fog | `fog-states-{faction}-{size}.png` | the knowledge array contains unexplored, remembered and in view in the same frame |
| Long list / long text | `long-list-{faction}-{size}.png`, `long-text-{faction}-{size}.png` | 28 Squads in the navigator with a real scroll window; a settlement with five works and a detail panel that scrolls rather than clips |
| Critical conditions | `critical-{faction}-{size}.png` | low Morale, Fatigue 18 and two unpaid Seasons appear as conditions, as notices, and as a full plate on the picked Squad |
| Match result | `match-end-rome-victory.png`, `match-end-carthage-victory.png` | a whole browser Match against the real AI for each Faction, to an existing ending, with the result announced |

The other states the ticket names are covered by the committed specs the roadmap already owns, and
this acceptance record links them rather than duplicating them:

| State | Spec | Evidence |
| --- | --- | --- |
| Terrain, zooms 1/2/4/8, visible and remembered ground, figure/ground contrast | `e2e/terrain-readability.spec.ts` | `%TEMP%\spqr-issue56` |
| Settlements, walls, gate, ram, breach, remembered silhouette, picking | `e2e/settlements.spec.ts` | `%TEMP%\spqr-issue57` |
| Standards, condition plates and pins, notice journal, estimate, attack-move mark | `e2e/readability.spec.ts` | `%TEMP%\spqr-issue58` |
| Command card, armed/pending/disabled, construction/recruitment, Siege offers | `e2e/commands.spec.ts` | `%TEMP%\spqr-issue55` |
| Adaptive layout, options drawer, scale warnings, minimap gestures | `e2e/desktop.spec.ts` | `%TEMP%\spqr-issue54` |
| Setup, configured Match, end of Match, final known situation | `e2e/setup.spec.ts` | `%TEMP%\spqr-issue53` |
| A whole Match through the page, its bound and its log | `e2e/match.spec.ts`, `e2e/first-entry.spec.ts` | assertions, plus the two result captures |
| The Atelier and the retained art identity | `e2e/atelier.spec.ts`, `npm run bake` | 494 artefacts; catalogue hash unchanged |

### Rendered evidence and its limits — read this before the hashes

**This implementation session could not display images** (the agent's image input was disabled), so
the 50 PNGs were produced, their dimensions and their presence checked, and the Guide's own title
ink was sampled from the live frame in the browser test — but **no human or model visual review of
the frames happened here**. That is the ticket's own rule: a matching hash, a passing geometry
assertion and an ink count are not a visual-quality verdict. The rendered-frame judgement is the
capability gate of [#62 (U9)](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/62); this ticket
leaves the frames reproducible from committed code, names them, and does not claim that they look
right. **The visual-review half of this acceptance criterion is therefore only partially met, and
that is a scope exception the parent and a human reviewer must accept rather than a silent waiver.**
Interaction outcomes were reviewed directly and are recorded in the walkthrough above.

## Remaining defects and limitations

These were observed during the work; the first four were found by a test or a run and fixed here, the
rest are recorded rather than hidden.

1. **The first Guide layout covered the place it asked the Player to click.** The first welcome text
   was tall enough that the panel's lower edge sat over the Stronghold's drawn structure. The
   welcome sentences were shortened and the panel anchored at the theatre's upper-left; the browser
   test now asserts that the Stronghold's drawn centre is not under any interface rectangle.
2. **Space used to leave the Guide stranded on the welcome line.** A keyboard Player who pressed
   Space resumed the Match but the Guide still waited for *Inizia*. Resuming is now an act of
   beginning, and the browser test presses Space and reads `stronghold` afterwards. The same review
   found that *Inizia* did not resume a clock the Player had paused *before* reopening the Guide;
   Begin now always resumes, as its own sentence promises.
3. **Closing the Guide could release a pause the Player had made.** `desktop.spec.ts` caught the
   state hash changing after a Guide close in a paused Match. An explicit `pause()` now takes
   ownership of the pause; the Guide only releases the one it took.
4. **The setup page's text outgrew its plate** (and the old fixed y-offsets made the two setup spec
   clicks fragile). The page was recomposed with wrapped lines, and `setup.spec.ts` now reads the
   seed and start rectangles from `setupLayout` instead of hard-coded y coordinates.
5. **A Player who pauses and presses Recruit** sees the Guide's "select the Reparto" line before the
   Squad exists, because the line advances on the queued Command (the panel does say `In attesa`).
   Resuming the clock makes the Squad appear. Advancing on the *applied* Command instead would leave
   a paused Player on the recruit line, free to press the card repeatedly, which is worse.
6. **The Guide's buttons are pointer targets**, like the rest of the HUD's buttons. A keyboard-only
   Player can begin with Space and play the Match (the panel is not modal and does not block the
   theatre outside its rectangle), but cannot press *Salta*/*Chiudi* without a pointer. This is a
   pre-existing HUD keyboard limitation, recorded rather than solved here.
7. **"Open a settlement" is satisfied by any settlement selection**, not only the player's
   Stronghold; the line names the Stronghold, and any settlement the Faction may see is a real
   opening of a panel. The Guide cannot enforce which one without rejecting a real act.
8. **At a requested UI scale of 3 in a 1280-wide window** the Guide's longer lines are clamped to the
   theatre's height (the layout slices what fits) and the second welcome line may not be drawn. The
   scale warning states the problem, the controls stay visible, and this is appearance/density work
   for #62, not a rules change.
9. **The Guide is a first-entry surface of the real page.** Composed fixtures and scenario pages do
   not show it (`firstEntry` is false), by design; their evidence is about the interface the Guide
   leads into.
10. **`resetPreferences` resets the Guide's dismissal but does not open the panel.** Opening it
    would pause a live Match from a control that promises to restore presentation defaults; the
    drawer's *Mostra guida* is the explicit reopen control, and it closes the drawer so the panel it
    opens is not hidden behind it. The next first entry shows the Guide again.
11. **One full browser run showed a single failure in the #58 fatigue scene** (a Squad marching until
    Fatigue 15 under three parallel workers); it passed standalone, in its own file with three
    workers, and in the next full run. The scene is timing-sensitive, not affected by this ticket's
    changes, and is not being treated as green until a run repeats it. No Guide or setup assertion
    was ever flaky in these runs.

## Two-axis review, and what changed

The change was reviewed along the repository's two axes before it was committed.

**Standards** — the Guide is a pure state machine that imports only the string table, so the
simulation/render fences and ADR-0014's rule that the interface asks rather than moves hold; all new
text is in the table; the old `menuPlate` focus branch was dead. Findings, all fixed:

- `docs/BROWSER.md` still advertised navigation-guide dismissal after the old hint was retired — the
  contract text now names the first-entry guide and its open/close control.
- The `skip` event was declared but production sent only `close` — `Salta guida` now sends `skip`,
  which is the distinction the type says it makes.
- The selected-kind answer was spelled in two places in `render/game.ts` — one `whatIsSelected` is
  used by both paths.
- The pause-release block was duplicated between close and Begin — one `releaseGuidePause`.
- `GuideActionName` was re-spelled as an inline union — `guideButton` takes the type.
- The Guide's title was recognised by array position when drawing — `GuideText.title` says which line
  is the title, so reordering the panel cannot silently quieten it.
- The browser helper restated the preferences key and shape — it now seeds storage from
  `UI_PREFERENCES_KEY` and `DEFAULT_UI_PREFERENCES`, so a change there cannot drift silently.

**Spec** — the Guide's acts, the panel's non-modal picking, the setup explanation and the walkthrough
were found implemented. Findings:

- **The rendered frames were not viewed** (see the scope exception above). This is the one criterion
  not met here; the interaction outcomes were reviewed and the frames are reproducible and named.
- ***Inizia* did not resume a clock the Player had paused before reopening the Guide**, while its own
  sentence promised it would — Begin now always resumes, and the reopen test pauses first and then
  reads the running clock. This also made the "Begin (or Space) releases the pause" claim true in
  every path.
- **`resetPreferences` opened the Guide and paused a live Match**, although that control promises to
  restore presentation defaults — reset now only resets the preference; the drawer's *Mostra guida*
  is the explicit reopen.
- The same stale `BROWSER.md` sentence.

`npm run verify` (lint, typecheck, guard, unit suite, build) was re-run after these changes, and the
browser suite was re-run in full.

## Unrun gates (not duplicated, not waived)

- **#31 — hardware and full-density performance:** not measured. The Guide adds one HUD panel and
  one text layout pass while it is open; no frame-rate claim is made from software WebGL.
- **#30 — audio:** there is no audio in the tree. The Guide is words and controls, and nothing waits
  on a sound.
- **#32 — release:** no release was prepared, deployed or published here. The build was produced and
  the suite is green; that is not a release gate.
- **#62 — final visual acceptance:** the frames were not viewed in this session. U9 owns the
  before/after visual verdicts and the appearance polish; this ticket does not pre-empt them.
- **Hardware/browser outside Chromium:** only Playwright's Chromium with SwiftShader was run, as in
  the rest of the suite. Firefox/Safari were not tested.

## Commands run

```
npm run lint                                  # clean
npm run check                                 # tsc -b, clean
npm run guard                                 # fences hold
npx vitest run                                # 109 files, 1291 tests passed
npx playwright test --project=chromium --workers=3   # 124 tests passed (3.1 m)
npm run build                                 # built
npm run bake                                  # 494 artefacts; catalogue 455x1964 280d0f795302fecb
```

The bake's catalogue hash and every other art hash are the ones #56–#58 left; the only source files
this ticket changed are outside the art, simulation and content trees.
