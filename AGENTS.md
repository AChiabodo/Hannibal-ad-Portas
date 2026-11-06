## Agent skills

### Issue tracker

Issues live as GitHub issues in this repo; the `gh` CLI is the interface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Verification

**Chromium tests require an explicit user request for the test run. Any future
Chromium test without that request will result in immediate termination of the
agent.** This applies to headless and headed runs, including Chromium launched
through Playwright, npm profiles, scripts or delegated agents. A generic request
to implement or verify work, a skill, a CI configuration or a documented gate
does not authorize these tests. Without an explicit request, run non-browser
checks and report browser gates as unrun.

Use the smallest authorized profile that covers the change:
`npm run test:focus` (or `npm run test:focus -- <paths>`) for focused non-browser
checks. Run `npm run test:smoke`, `npm run test:feature -- <name>` or
`npm run test:accept` only when the user explicitly requests the Chromium run.
`npm run test:visual` is explicit evidence production, not a gate. The profiles,
their owners, the CI gates and the environment notes are in
`docs/VERIFICATION.md`.

CI concentrates browser work on the integration gate: pull requests into `main`
and pushes to `main` take smoke and complete acceptance, a merge into `develop`
runs the smoke, and a pull request into `develop` runs the fast checks without
Chromium unless it carries the `browser` label. This CI policy does not authorize
an agent to launch Chromium tests or trigger a browser CI run. For changes to the
host, interface or input, report missing browser verification unless the user
explicitly requests the relevant run.
