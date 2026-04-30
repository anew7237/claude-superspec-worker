<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at `specs/002-cloudflare-worker/plan.md` (Cloudflare Worker runtime +
monorepo dual-runtime refactor;兌現 001-baseline forward-declarations).
Phase 1 design artifacts:

- `specs/002-cloudflare-worker/spec.md` — 5 user stories / 17 FRs / 11 SCs / 15 edge cases / 1 clarification
- `specs/002-cloudflare-worker/research.md` — Phase 0 (Q1 Clarification + 設計源 §6 decisions log + §2.3 7 lessons)
- `specs/002-cloudflare-worker/data-model.md` — Phase 1 (Worker entry + Bindings + Dual tsconfig + Dual Vitest + Constitution amendment)
- `specs/002-cloudflare-worker/contracts/` — Phase 1 (4 contracts:
  worker-routes / reverse-proxy / bindings / dual-tsconfig)
- `specs/002-cloudflare-worker/quickstart.md` — Phase 1 (Mode A quick / Mode B full / Mode C deploy walkthrough)

Background:

- `specs/001-superspec-baseline/` — baseline spec / plan / contracts (merged to main, 5 contracts)
- `.specify/memory/constitution.md` — project constitution v1.0.0
  (Node + Worker dual-runtime principles;本 feature 落地時升 v1.1.0 加 Variant Amendment)
- `.docs/20260430a-cloudflare-worker.md` — 設計源(working doc;本 feature 之 spec/plan 為其規格化產物)
<!-- SPECKIT END -->

# Git Workflow (Project-Specific Override of Global Preferences)

This project enforces stricter rules than the global preferences �X **both `commit` and `push` require an explicit user command before execution**.

- **commit**: When a commit is warranted, **first remind the user** (draft the message, list the file groups proposed for inclusion). Accumulate uncommitted files and let me classify which ones should be committed together. **Only execute when the user issues `commit`**.
- **push**: Same rule �X only execute when the user issues `push`.
- **Combined commit + push**: After reminding the user, wait until they issue `commit + push` before executing both together.
- **Exception**: If the user explicitly says something equivalent in the current conversation (e.g. "and push", "commit and push it"), the corresponding action may be executed directly that turn.
- **Rationale**: The user wants final approval over both staging scope and remote pushes.
- **Source**: Inherited from claude-superspec-nodejs. This is the unified-monorepo successor (Node + Worker runtimes coexisting).
