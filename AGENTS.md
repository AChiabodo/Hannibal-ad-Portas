## Agent skills

### Issue tracker

Issues live as GitHub issues in this repo; the `gh` CLI is the interface. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/`. See `docs/agents/domain.md`.

### Verification

Use the smallest profile that covers the change, not the whole matrix:
`npm run test:focus` (or `npm run test:focus -- <paths>`), `npm run test:smoke`,
`npm run test:feature -- <name>`, and `npm run test:accept` before integration.
`npm run test:visual` is explicit evidence production, not a gate. The profiles,
their owners, the CI gates and the environment notes are in
`docs/VERIFICATION.md`.

CI concentrates browser work on the integration gate: pull requests into `main`
and pushes to `main` take smoke and complete acceptance, a merge into `develop`
runs the smoke, and a pull request into `develop` runs the fast checks without
Chromium unless it carries the `browser` label. Do not rely on that to mean a
browser change is verified: run `test:smoke` / `test:feature` / `test:accept`
locally when the change touches the host, the interface or input.
