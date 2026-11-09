# #71 — browser verification after AI recovery

25 October 2026. Integrated product baseline: local AI commits `929ee41` and
`f875586`, followed by the visible-enemy renderer and approved Observation change.
The user explicitly authorized Chromium, visual verification and closure of #71
and the resolved reopened owners #21–24. No push or deployment is part of this work.

## What the visual review found and fixed

The initial contact screenshot reproduced a separate presentation defect: the
human Observation contained the live enemy and its contact Notice, but the troop
layer received only owned Squads. The opponent could reach the Stronghold and
apply pressure while no enemy formation was drawn. This was not an absence of
recruitment or scouting. The old `contact-rome-centurio-1920.png` and
`pressure-rome-tiro-1280.png` were retained in the external `issue71/before` folder.

With the user's explicit approval, [ADR-0029](../adr/0029-visible-enemy-formations-share-the-observation.md)
replaces the old restriction on visible enemy headcount. Canonical Observation
now exposes current-sight men, capacity, figure count, formation and facing to
both human and AI. It exposes no morale, fatigue, ammunition, stocks, route or
orders. Appearance is never retained in last-known contact memory. A public
Match/Observation regression failed before this addition and passes after it,
including loss of sight and an exact permitted-field list. The renderer draws
the enemy through the established PixelBuffer/PixiJS formation and casualty-slot
path, with its Faction's cloth/standard and an idle pose. No enemy condition plate
or selection is added. Military policy retains its nominal type estimate.

The existing requested-scale warning had also disappeared through layout
filtering. It is restored. Public lifecycle hook declarations now agree with
the already published host methods and their browser documentation.

## Browser tests repaired rather than misclassified as AI failures

The first complete run found 104 passing and 62 failing checks. Many old specs
still assumed direct purchase on a card click, Esc clearing selection, the old
construction panel and old feedback locations. They now inspect and purchase,
open the actual works/balance views, preserve selection through the pause menu,
and assert feedback in the current layout. A seasonal forecast fixture uses an
idle opponent to isolate its stated no-intervening-orders premise; it is not AI
pressure evidence. The smoke Command test keeps the clock paused until its one
deliberate step, avoiding a goal that had already been reached before inspection.

Frame inspection then found that the group arrival image was covered by the
pause menu. Its obsolete Esc step also failed to exercise recall from a different
selection. The test now selects the settlement, asserts no selected Squads,
recalls the two IDs with `1`, and centres them with `F` before capture. This is a
test correction; no group movement rule was changed.

## Ordinary paced pressure

[Six machine-readable browser records](issue-71/browser-paced.jsonl): predeclared
seed 1, both passive human Factions, all three difficulties, ordinary resources
and no starting demo army. Centurio uses 1920×1080; Tiro/Imperator use 1280×720.
The real page host runs both Controllers from requestAnimationFrame. Speed 3×
is chosen through the actual pause/settings controls. No `advance` or
`fastForward` substitutes for pacing. Each scenario pauses through Space,
clicks the contact Notice, verifies that the camera exposes actual enemy pixels,
then resumes until wall damage or physical Blockade occupation is observed.
There are no owned troops in these passive cases, so the troop pixel differential
cannot accidentally prove only the human's army.

| Human / difficulty | Contact active / wall seconds | Pressure active / wall seconds | Effect |
| --- | --- | --- | --- |
| Rome / Tiro | 60.9 / 20.496 | 89.2 / 30.465 | Occupied Blockade |
| Rome / Centurio | 62.8 / 21.303 | 89.8 / 31.144 | Occupied Blockade |
| Rome / Imperator | 61.5 / 20.714 | 89.3 / 30.538 | Occupied Blockade |
| Carthage / Tiro | 98.0 / 32.864 | 101.5 / 34.637 | Wall damage |
| Carthage / Centurio | 99.5 / 33.415 | 104.5 / 35.980 | Wall damage |
| Carthage / Imperator | 96.8 / 32.479 | 101.6 / 34.644 | Wall damage |

All six meet the unchanged active-minute contact/pressure limits: Tiro 5/10,
Centurio 3/6, Imperator 2/4. The bounded browser sample complements the fixed
60-case public Match matrix; it does not replace that breadth.

## One normal-interface journey per Faction

[Two machine-readable journeys](issue-71/browser-journeys.jsonl), seed 1/Tiro:
Rome at 1280×720; Carthage at 1920×1080. Menu → keyboard setup → guide → seasonal
balance → Farm purchase/completion → recruitment → real marquee selecting two
Squads → Control+1 and Hold → contact/camera → real conflict → F1/reference
return → menu/Resume. The restored Match retains seed, Faction, completed Farm
and the group's surviving members. Commands are checked as they apply, before
the host's bounded 128-entry history can evict them.

Rome fields 24+24 Hastati, Carthage 24+48 Gauls, purchased with ordinary resources.
Carthage recruits early and pursues only currently observed or permitted last-known
contacts. Rome reacts to a physically occupied siege, raises one defender, waits
for a real casualty, then recruits its second defender and forms the group.
No test gives orders/resources/targets to the opponent.

An [earlier Rome visual attempt](issue-71/browser-attempts.jsonl) recruited both superior defenders together and
timed out waiting for combat: the scout withdrew and the human pursuit did not
catch it. This failure is retained, not counted as a pass. The controlled human
policy was corrected to intercept with the first defender while the siege is
still occupied. Independent Spec review confirmed that #71 permits this policy;
seed, AI, deadlines and casualty assertions are unchanged. Captures/navigation
are performed while paused. A single Attack at an obsolete tile is not evidence
that an intelligent withdrawing scout must be caught there.

| Journey | Contact tick | Conflict tick / active seconds | Wall seconds | Actual losses |
| --- | --- | --- | --- | --- |
| Rome | 616 | 977 / 97.7 | 39.007 | Visible Gaul corpse, 3 men |
| Carthage | 981 | 1,036 / 103.6 | 44.013 | Visible Hastati corpse, 5 men |

Both conflicts precede the first Season, excluding seasonal Attrition or Payroll
desertion as the cause. This run did not require human casualties: both human
armies survived intact. Dedicated formation fixtures separately inspect persistent
casualty holes; those fixtures are not normal-start AI evidence.

## Rendered-frame verdicts

Frames are stored outside Git under the configured `SPQR_VISUAL_DIR`; the final
run uses its `final` directory. No raster asset was added to the repository.

| Frames actually inspected | Verdict |
| --- | --- |
| `issue71/contact-rome-centurio-1920.png`, `contact-carthage-centurio-1920.png` | Keep: real opposing cloth/standards and formations visible, contact Notice legible, ordinary fog retained |
| `issue71/pressure-rome-tiro-1280.png`, `pressure-carthage-tiro-1280.png` | Keep: home and occupying/assaulting enemy in theatre, notices readable, camera access works |
| `issue71/journey-losses-rome-1280.png`, `journey-losses-carthage-1920.png` | Keep: real conflict aftermath at 4×, surviving troops and visible corpse residue; no assertion of human losses |
| `issue69/construction-rome-1280.png`, `reference-carthage-1920.png` | Keep: purchase/details and reference readable; long details use the intended scrolling/paging |
| `issue68/arrival-rome-1280.png`, `pending-carthage-1920.png` | Keep after correction: group recall/arrival uncovered, pending feedback readable |
| `issue62/siege-breach-rome-1280x720.png`, `siege-blockade-carthage-1920x1080.png` | Keep: critical Siege structures/forces and allowed information; fixture-only evidence |
| `issue67/formations-rome-native-1280-z4.png`, `formations-carthage-native-1920-z4.png` | Keep: full 24/24 versus 13/24 in line/column and all facings; lost men leave persistent empty slots rather than shrinking the footprint |

## Verification and scope

- `npm run verify`: exit 0; lint, TypeScript, guards, **126 files / 1,474 tests**
  (66.05s), all **60/60** mandatory pressure cases with matching Replay hashes,
  production build (1.80s). All 60 final hashes also match the retained recovery
  matrix: the appearance/render changes do not alter Match state or AI policy.
- Final focused affected checks: **109/109**, 10 files, **10.13s**, below 60s.
- Explicit Chromium smoke: **3/3**, **6.6s**, below 90s.
- Complete Chromium acceptance on the integrated product: **174/174**, **11.3m**.
- Relevant visual selection: initial **21/22**, with the Rome policy failure
  retained; after the two test-policy/capture corrections, the four group cases
  and both journeys pass **6/6 (1.8m)**. The six pressure, four economic, four
  critical-Siege and two entry/reference visual cases passed in the first run.
  This is a selected evidence run, not a claim to have run every visual scene.
- Additional explicit formation evidence: **2/2 (25.0s)**, Rome 1280 and Carthage
  1920, including full/wounded formations and supported zooms.
- Final TypeScript/lint checks repeated after the two test-only corrections.
- Independent Standards and Spec reviews: **0 actionable findings**; the
  previously reported coverage gaps were corrected and re-reviewed.

Environment: Windows 10 Home 10.0.19045, Node 22.22.2, npm 10.9.7, Playwright
1.64.1. Chromium reports WebGL2, ANGLE/Vulkan **SwiftShader**, a software renderer.
These frames prove rendering and interaction, not hardware 60 fps.

The seven retained full-Match AI victories and Replay hashes remain in the
[AI recovery report](issue-21-24-ai-recovery.md). The finite seeds/policies do not
prove all generated maps, arbitrary counterplay or monotonic win rates. #29
retains the broader balance study under the current rules/content; #31 retains
full-density hardware performance; #32 retains release/deployment. None is
closed or modified by this verification. No required #71 browser gate remains
unrun; exhaustive visual combinations and hardware performance are not claimed.
