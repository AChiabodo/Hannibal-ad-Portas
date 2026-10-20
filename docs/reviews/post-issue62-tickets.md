# Post-Issue-62 delivery — published specification and tickets

Status: approved and published on 2026-10-20 after the Player confirmed the complete breakdown, dependencies and existing test seams. Specification: [#63](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/63); children: #64–#71. No implementation has started; no commit or push performed.

Specification: [A readable, learnable and contested desktop Match](post-issue62-spec.md).

## Published breakdown

| Alias | Complete deliverable | Blocking tickets | Full draft |
| --- | --- | --- | --- |
| P1 | Focused verification, browser profiles, CI gates and coverage/timing evidence | None | [Fast verification](post-issue62-tickets/01-fast-verification.md) |
| P2 | Real roster sizes, recruitment quote/Command/UI, survivor Payroll and Replay | None | [Recruitment and Payroll](post-issue62-tickets/02-recruitment-payroll.md) |
| P3 | Equal-man military balance, specialist calibration, Siege and AI force evaluation | P2 | [Combat and Siege](post-issue62-tickets/03-combat-siege-balance.md) |
| P4 | Rich procedural figures/structures, scale comparison, persistent holes and picking | P2 | [Art and scale](post-issue62-tickets/04-art-scale-formations.md) |
| P5 | Public group movement, distinct arrivals, narrow passages and refusal feedback | P2 | [Group movement](post-issue62-tickets/05-group-movement.md) |
| P6 | Economic explanations, construction categories, Forecast and Encyclopedia | P3, P5 | [Economy and Encyclopedia](post-issue62-tickets/06-economy-encyclopedia.md) |
| P7 | Main menu, suspended Match/Resume and practical Tutorial through real AI encounter | P6 | [Menu and Tutorial](post-issue62-tickets/07-menu-tutorial.md) |
| P8 | Normal-web AI diagnosis/pressure and integrated visible/playable acceptance | P1, P4, P7 | [AI and integrated acceptance](post-issue62-tickets/08-ai-integrated-acceptance.md) |

| Alias | GitHub issue | Native blockers |
| --- | --- | --- |
| P1 | [#64 — Fast verification](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/64) | None |
| P2 | [#65 — Recruitment and Payroll](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/65) | None |
| P3 | [#66 — Combat and Siege](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/66) | #65 |
| P4 | [#67 — Art and scale](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/67) | #65 |
| P5 | [#68 — Group movement](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/68) | #65 |
| P6 | [#69 — Economy and Encyclopedia](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/69) | #66, #68 |
| P7 | [#70 — Menu and Tutorial](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/70) | #69 |
| P8 | [#71 — AI and integrated acceptance](https://github.com/AChiabodo/Hannibal-ad-Portas/issues/71) | #64, #67, #70 |

Each feature ticket delivers a usable behavior through its public interfaces, UI and appropriate checks. P2 deliberately does not claim final combat balance; P3 closes that user behavior before the final integrated game is accepted. P1 is a substantial developer-workflow slice, not a mechanical one-line prefactor. P4/P5 can use the same declared size/formation contract without depending on one another; final integration checks their combined result.

No ticket is created solely for an icon, label, test case, menu entry or individual building. Grouped responsibilities share an actual user loop. The graph does not authorize simultaneous edits to shared modules or shared browser output directories; implementation concurrency would require separate worktrees and isolated resources.

## Coverage of the approved decisions

| Decisions | Delivery |
| --- | --- |
| Q1, Q7, Q8, Q9 | P2 real sizes, recruitment-only choice and proportional resource prices |
| Q10, Q19, Q31 | P2 survivor Payroll; P3 combat/volley/Morale, specialist and Siege equivalence |
| Q11, Q16 | P2 faction-specific roster; P3 preservation/calibration of Faction roles |
| Q2, Q17, Q18, Q23, Q25, Q30 | P4 relative proportions, 1:1 Figures, 60/64 comparison and persistent holes (final Q30 supersedes centered rear ranks) |
| Q20, Q26 | P5 separate arrival positions with temporary narrow-passage overlap |
| Q3, Q12, Q22 | P6 reference/contextual explanations; P7 practical chapters and exercise/normal-AI progression |
| Q4, Q13 | P7 menu/configuration and in-memory paused Resume |
| Q5, Q14, Q21 | P3 viable AI military model; P8 real normal-web contact/pressure, timing and observed play |
| Q6, Q15 | P1 measured layered workflow; P8 final budgets and complete acceptance; every ticket owns its checks |
| Q24, Q29 | P2 fixed 24 slingers / 12 cavalry / one elephant; P3 measured specialist balance; P4 visual integration |
| Q27, Q28 | P6 economic explanations, seconds/Season displays, Forecast and four categorized lists |

## Approved test seams

Reuse public Controller/Command plus faction-filtered Observation for recruitment/economy/movement/combat/Siege/AI; public HUD/order/reference/navigation/Tutorial models for explanatory and progression breadth; a small existing-hook + real pointer/keyboard browser set for integration; actual rendered comparative images for visual acceptance. Replay and repository/AI guards remain in their existing roles. No private rules mutation, privileged human input or second renderer/test-only gameplay interface is proposed.

## Verified publication record

1. Refreshed the tracker before creation; no intervening duplicate delivery was present.
2. Published the complete spec as #63 and eight complete children #64–#71, all open and labelled `ready-for-agent`. The parent embeds the agreement/test contracts and decision coverage; child bodies contain full behavior, acceptance, tests and exclusions, with actual issue references.
3. Verified all nine titles, complete normalized bodies, states and labels against the prepared publication payloads. GitHub content does not rely on uncommitted local files as its only specification.
4. Verified the exact eight native sub-issues and nine native blocker edges. The graph matches the approved acyclic dependency graph. Current frontier: #64 and #65; neither is assigned or started by this publication task.
5. Compared the title/body/state/labels/assignees of existing #1, #29, #30, #31, #32, #48, #51 and #62 with their pre-publication snapshots; all remained unchanged. No existing parent was closed or rewritten.
6. Updated local publication links and passed `git diff --check`. Only design/spec/ticket documentation was edited. No implementation, commit or push performed.

Nine planned native edges: P3←P2; P4←P2; P5←P2; P6←P3/P5; P7←P6; P8←P1/P4/P7. The eight parent/child links are separate. Publication verification must calculate the count from the graph as well as checking its expected value.
