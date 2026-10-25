# Issue #69 — Economy and Encyclopedia

For the subsequent native-browser audit, corrections and menu-by-menu assessment,
see [the 22 October browser review](issue-69-native-browser-review.md). Its browser
evidence supersedes the unrun-browser limitation recorded below.

## Revision after human review, 22 October 2026

The reopened issue replaces the original flat reference with five browsable
sections: Primi passi, Economia, Edifici, Esercito, Guerra e territorio. Each
section lists only its own articles. Contextual links select the matching section;
keyboard navigation keeps the current topic visible. Articles preserve paragraph
breaks and paginate without clipping at both reference desktop sizes.

The Italian prose starts from player decisions. First steps explain the campaign
objective, actual menu names, spending, recruitment, movement and the two siege
paths. Every resource has its own purpose and advice. Buildings explain when to
build, then cost, staffed seconds, permanent workers, effects and actual unlocks.
Troop articles explain roles before listing canonical sizes, prices and Payroll.
The Latin and Carthaginian economic notes distinguish shared production/tax rules
from roster costs and the Roman Castrum. The reference explains the second ration
needed for growth, the work displaced by buildings, non-depleting resource nodes,
all-resource storage, winter and the limits of the Forecast.

The user approved sections, prose, economic-menu changes and public-model/rule
verification in Q1–Q3. Q4 superseded an intermediate dense account view: the
Panoramica is now a compact card, 800 by 200 screen pixels at 2x without control
groups, showing only population/workers and paired local stocks/capacities.
Bilancio stagionale and Edifici e lavoro open separately within that card;
Panoramica returns to the summary. Construction and Recruitment remain direct
tabs. Bound control groups retain their own reserved strip. Construction offers
use two columns, with names above costs instead of competing for one line.

Existing works distinguish active, understaffed and stalled construction. Named
land allocations replace the four unexplained numbers. The seasonal account
separates local stocks from shared Treasury, income before Payroll, unpaid Squads,
countdown and assumptions. No economic rules, worker commands or ownership/fog
semantics change. Presentation remains outside Match state and hashes.

## Verification

Final `npm run verify` passed on the corrected candidate: lint, TypeScript, all
seven guards, 120 Vitest files / 1,395 tests and the production build. Focused
HUD/reference checks also passed during development. Canonical four-Season
comparisons cover both Factions, including growth, Harvest and winter.
The accepted construction specimen was inspected directly before updating its
fingerprint and the containing catalogue plate; no other artwork changed.

Bitmap plates were generated outside the repository for both Factions at
1280x720 and 1920x1080, and inspected for representative reference, summary and
offer surfaces. These are renderer output, not real-browser frames.

Interactive browser verification could not run: the in-app browser was
unavailable, native Computer Use could not connect to its pipe, and automatic
approval review rejected the visible Chromium launch with `blocked by policy`.
No Playwright tests or headless Chromium were launched. Real pointer/keyboard
navigation, pause/return integration, browser console and rendered Match frames
remain unverified; the issue should not be represented as visually accepted.

## Standards

One P2 was found: the new Force paragraph confused the displayed value (survivors
weighted by troop type) with damage points per casualty, contrary to GLOSSARY.md.
The sentence now explains the two separately. The Standards reviewer confirmed
the correction; no other substantive standard violations or actionable baseline
smells were found. Renderer, Observation and presentation-state boundaries hold.

## Spec

One P2 was found: the timber article claimed that some recruitment spends timber,
although all canonical troop bills use grain and iron. The sentence now explicitly
limits timber to construction and excludes it from recruitment. The Spec reviewer
confirmed the correction; no additional scope or implementation findings remain.
Generic matchup advice was also changed to name troops actually in the roster.

Review totals: Standards 1 P2, corrected; Spec 1 P2, corrected. No unresolved code
findings. Interactive browser verification remains unrun for the reasons above.
