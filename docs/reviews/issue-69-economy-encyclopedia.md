# Issue #69 — Economy and Encyclopedia

The construction page keeps one of four categories selected across settlement
changes. The public order model still supports an unfiltered content inventory;
the HUD requests one category and exposes only that list. Disabled purchases
remain inspectable. Every economic row has a contextual `?` reference link.

Building descriptions use content costs, staffed seconds, Labour, seasonal
potential output, passive housing/storage, Tier unlocks and the Roman camp rule.
The selected settlement explains current staffing, population/housing, local
storage and its next-boundary stocks. Treasury remains a Faction-wide estimate,
with a countdown in seconds, income before Payroll, and explicit assumptions.
Unfinished works are excluded. An observed blockade refuses the estimate;
autumn stocks are refused if population changes because the Observation's worked
land does not reveal capacity for the post-growth Harvest allocation.

The Encyclopedia has canonical entries for every resource, building and Squad
type, plus Labour, Seasons, population, Commands/group movement, conditions,
Territory, force, combat, missiles and Siege. It uses Italian string-table text
and the existing procedural bitmap rendering. The reusable layout/action/plate
surface can be hosted by the future #70 main menu without a Match.

In a normal Match, use F1, the top control or an offer's `?`. Escape or the return
control closes it. Tab traverses controls, arrows traverse entries, PageUp/Down
scroll text, and the pointer can navigate and page through both lists. Opening
pauses time; returning restores the prior pause state, selection and keyboard
focus. Presentation state is separate from the Match and its hash.

Verification boundaries:

- Final `npm run verify`: passed lint, TypeScript, all seven guards, 120 Vitest
  files / 1,392 tests and the production build. Chromium is not part of this command.
- Public order/HUD/reference checks cover every applicable content item, category
  membership, locked offers, complete text pagination and both desktop sizes.
- Real economy Match boundaries cover stock, population and Treasury results over
  four Seasons, including winter and Harvest.
- `e2e/economy-reference.spec.ts`, owned by the `economy` profile, provides normal
  Match samples for both Factions at 1280×720 and 1920×1080: category changes,
  available/unavailable purchases, contextual reference and pointer/keyboard
  return, hash/selection preservation and a real Season outcome comparison.
- Chromium samples, complete browser acceptance and actual-frame inspection are
  **unrun**: this task did not include an explicit request for a Chromium run.
  The browser spec is typechecked, not claimed as executed or visually accepted.

## Standards

The initial review found one P2: corrupted accented Italian letters in the new
string-table text. Fixed using valid UTF-8, with a string-table regression check
rejecting Unicode replacement characters. No other architecture or code-smell
findings warranted changes.

## Spec

The initial review found two P2s, both fixed:

- Arrow navigation could retain reference focus on a now-hidden entry. It now
  focuses the newly selected visible entry and normalizes stale control focus.
- The unavailable-purchase browser sample expected only a reason, while the real
  notice includes the offer name. It now checks both components. The sample also
  covers Enter after arrow navigation so the focus regression remains observable.

Initial totals: Standards 1 (P2 text corruption), Spec 2 (P2 hidden keyboard
focus and incorrect test expectation). No unresolved findings remain from those
reviews; both reviewers confirmed the staged corrections. The construction bitmap was inspected directly through the Node
PixelBuffer generator; only its fingerprint and the containing catalogue plate
changed. This is not browser-frame evidence.
