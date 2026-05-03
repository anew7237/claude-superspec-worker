<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/003-ci-workflow/plan.md` (Ubuntu CI workflow + Dependabot —
mechanize 001 FR-017 / SC-005 / SC-006 + 002 FR-009 / SC-003).
Phase 1 design artifacts:

- `specs/003-ci-workflow/spec.md` — 4 user stories / 13 FRs / 11 SCs / 10 edge cases / 6 clarifications
- `specs/003-ci-workflow/research.md` — Phase 0 (14 design decisions:devcontainers/ci action / gitleaks-action / cache strategy / wrangler-bundle-check mechanism / Dependabot grouping / advisory comment via github-script / branch protection guidance)
- `specs/003-ci-workflow/data-model.md` — Phase 1 (CI workflow entity 結構 + 5 jobs + Dependabot config + .gitleaks.toml + README §)
- `specs/003-ci-workflow/contracts/` — Phase 1 (2 contracts:
  ci-gates / dependabot-policy)
- `specs/003-ci-workflow/quickstart.md` — Phase 1 (Adopter fork walkthrough + maintainer ops + reviewer 看 PR + 6 negative test scenarios)

Background:

- `specs/001-superspec-baseline/` — baseline spec / plan / contracts (merged to main, 5 contracts)
- `specs/002-cloudflare-worker/` — Worker runtime + dual-runtime monorepo refactor (merged to main, 4 contracts;PR #5/#13/#17/#18/#19/#20 後續清完 audit + SC-002 strict pair fully verified)
- `.specify/memory/constitution.md` — project constitution v1.1.3
  (Node + Worker dual-runtime principles + Variant Amendment + FR-022 fully mechanical)
- `.docs/parity-validation.md` — SC-002 measurement records(WSL2 + Mac M1 strict-pair verified at vitest-pool-workers 0.15.2)
- `.docs/baseline-traceability-matrix.md` — 001/002 之 FR/SC 機械化狀態總表
<!-- SPECKIT END -->

# Git Workflow (Project-Specific Override of Global Preferences)

This project enforces stricter rules than the global preferences �X **both `commit` and `push` require an explicit user command before execution**.

- **commit**: When a commit is warranted, **first remind the user** (draft the message, list the file groups proposed for inclusion). Accumulate uncommitted files and let me classify which ones should be committed together. **Only execute when the user issues `commit`**.
- **push**: Same rule �X only execute when the user issues `push`.
- **Combined commit + push**: After reminding the user, wait until they issue `commit + push` before executing both together.
- **Exception**: If the user explicitly says something equivalent in the current conversation (e.g. "and push", "commit and push it"), the corresponding action may be executed directly that turn.
- **Rationale**: The user wants final approval over both staging scope and remote pushes.
- **Source**: Inherited from claude-superspec-nodejs. This is the unified-monorepo successor (Node + Worker runtimes coexisting).
