<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/001-superspec-baseline-T009/plan.md` (GET /echo endpoint —
SC-007 walkthrough sample, branching off 001-superspec-baseline).
Phase 1 design artifacts:

- `specs/001-superspec-baseline-T009/spec.md` — feature specification
- `specs/001-superspec-baseline-T009/research.md` — Phase 0 (no unknowns; cite baseline decisions)
- `specs/001-superspec-baseline-T009/data-model.md` — Phase 1 (no entity; stateless echo)
- `specs/001-superspec-baseline-T009/contracts/echo.contract.md` — Phase 1 endpoint contract
- `specs/001-superspec-baseline-T009/quickstart.md` — Phase 1 (manual verify of 6 acceptance scenarios)

Background / parent baseline:

- `specs/001-superspec-baseline/` — full baseline spec / plan / contracts (merged to main)
- `.specify/memory/constitution.md` — project constitution v1.0.0
  (Node + Worker dual-runtime principles)
- `.docs/20260430a-cloudflare-worker.md` — design notes for the upcoming
  002-cloudflare-worker feature
<!-- SPECKIT END -->

# Git Workflow (Project-Specific Override of Global Preferences)

This project enforces stricter rules than the global preferences �X **both `commit` and `push` require an explicit user command before execution**.

- **commit**: When a commit is warranted, **first remind the user** (draft the message, list the file groups proposed for inclusion). Accumulate uncommitted files and let me classify which ones should be committed together. **Only execute when the user issues `commit`**.
- **push**: Same rule �X only execute when the user issues `push`.
- **Combined commit + push**: After reminding the user, wait until they issue `commit + push` before executing both together.
- **Exception**: If the user explicitly says something equivalent in the current conversation (e.g. "and push", "commit and push it"), the corresponding action may be executed directly that turn.
- **Rationale**: The user wants final approval over both staging scope and remote pushes.
- **Source**: Inherited from claude-superspec-nodejs. This is the unified-monorepo successor (Node + Worker runtimes coexisting).
