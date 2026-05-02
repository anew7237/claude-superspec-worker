<!--
SYNC IMPACT REPORT
==================
Version change: 1.0.0 → 1.1.0 (MINOR) → 1.1.2 (PATCH)

Amendment date: 2026-04-30 (same day as initial 1.0.0 ratification —
v1.1.0 lands together with feature `002-cloudflare-worker`, which is
the actual implementation of the dual-runtime structure that v1.0.0
described prospectively).

Initial ratification (2026-04-30) — first constitution for the
claude-superspec-worker unified monorepo.

This repo houses **two coexisting runtimes** (Node + Cloudflare Worker)
under a single .specify/ baseline, single package.json, and single
toolchain. The constitution is written natively for this dual-runtime
reality; it is NOT an amendment of any predecessor nodejs-only
constitution. Each principle and section reflects how the rule applies
to BOTH runtimes from day one.

History context: an earlier session imported the nodejs sibling's
v1.2.2 constitution as a placeholder; that import was reverted
(commits b9fba00 → d1c1a0c) so this constitution could start fresh.
The v1.2.2 content remains accessible at b9fba00 for reference
during future amendments.

Modified principles in 1.0.0: N/A (initial ratification).
Modified principles in 1.1.0: none (the five Core Principles are
  unchanged in body; the Variant Amendment is additive and clarifies
  scope, it does NOT redefine any principle).
Modified principles in 1.1.2: none (PATCH-level wording refinement
  only, see "Modified sections in 1.1.2" below).
Added principles: I-V (full set, see Core Principles below).
Added sections in 1.0.0: Technology Stack & Constraints, Development
  Workflow & Quality Gates, Governance, Reference Implementation Notes.
Added sections in 1.1.0: "Variant Amendment — Cloudflare Worker
  Companion (2026-04-30)" (declares the dual-runtime variant explicitly,
  per design source `.docs/20260430a-cloudflare-worker.md` §5.7 revised
  text + spec FR-016).
Modified sections in 1.1.2 (PATCH, 2026-05-03 — wording-only refinement,
  no principle change; triggered by post-merge code review on
  001-superspec-baseline + 002-cloudflare-worker specs):
  - Reference Implementation Notes (Source-control credential
    forwarding bullet): removed `${localEnv:SSH_AUTH_SOCK}` mount
    reference to align with post-issue-#1 `.devcontainer/devcontainer.json`
    + `specs/001-superspec-baseline/contracts/sensitive-material.md`
    (PR #4's `5bc629e` patched contracts but missed the constitution).
  - Variant Amendment "Type Safety End-to-End strengthened":
    "mechanical" → "partially mechanical" to match
    `specs/002-cloudflare-worker/contracts/dual-tsconfig.md` §3.1 +
    `.docs/baseline-traceability-matrix.md` FR-022 row. Full
    mechanization (ESLint `no-restricted-imports` rule for explicit
    named imports) tracked as separate follow-up; SC-011 enforcement
    on ambient / builtin violations remains active from v1.1.0.
Removed sections in any version since 1.0.0: none.

Templates requiring updates (current status, manual follow-up):
  ✅ plan-template.md — abstract Constitution Check gate, no rebinding needed
  ✅ spec-template.md — agnostic, no rebinding needed
  ⚠ tasks-template.md — sample tasks use Python paths
    (`tests/contract/test_[name].py`); should be updated to TS / vitest
    when next touched. Non-blocking; tasks-template is generic placeholder
    and is overwritten per feature by /speckit-tasks.
  ✅ CLAUDE.md — SPECKIT block + Git Workflow project override aligned;
    no drift from constitution

Follow-up TODOs (current status):
  - ✅ RESOLVED in 1.1.0: When the Worker runtime lands (per
    .docs/20260430a-cloudflare-worker.md §5 / 002-cloudflare-worker
    spec), add concrete entries to Reference Implementation Notes: dual
    tsconfig (tsconfig.{node,worker}.json), dual vitest config,
    wrangler.jsonc, .dev.vars handling. — Reference Implementation Notes
    already enumerated these as "planned" at v1.0.0; the Variant
    Amendment in v1.1.0 explicitly anchors them as "active from this
    commit forward" and feature 002-cloudflare-worker mechanically
    delivers them (T001–T011 toolchain tasks).
  - Widen package.json `vite` peer pin to mirror vitest 4 peer range
    (currently `^6.0.0`; vitest 4's range is `^6 || ^7 || ^8`). Tracked
    in B-narrow follow-ups, not constitutional.
  - ✅ RESOLVED: README.md "v1.2.2" reference + non-existent
    `specs/001-superspec-baseline/` path queued for rewrite — README
    rewrite landed alongside 001-superspec-baseline merge (PR #4).
-->

# Claude SuperSpec Worker Monorepo Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

Tests MUST be written before implementation. The cycle is RED → GREEN →
REFACTOR: write a failing test, watch it fail, implement the minimum to
pass, then refactor. The spec-driven implementation step enforces this
loop and adopters MUST NOT bypass it for non-trivial work.

The discipline applies to **both runtimes**:

- **Node side** (`src/node/`, `tests/node/`): tests run via vitest under
  the canonical containerised environment. A fresh clone with only
  Docker installed MUST be sufficient to run the full Node test suite.
- **Worker side** (`src/worker/`, `tests/worker/`): tests run via
  vitest with the Cloudflare workers pool plugin against miniflare.
  Worker tests do NOT run inside Docker — they run on the host or
  inside the dev container, with miniflare simulating the Workers V8
  isolate, D1, and KV bindings.

Test execution MUST NOT depend on host-installed runtimes, language
package managers, or test frameworks for the Node side. For the Worker
side, the dev container provides the necessary host runtime; production
Worker testing is covered by the same vitest invocation against
miniflare, not by deploying to a real Cloudflare environment for every
test.

**Rationale**: TDD is the only discipline that keeps the spec → tasks →
implement pipeline honest. Without a failing test, "implement" silently
degrades into "guess and ship". Container-bound (Node) and
miniflare-bound (Worker) test execution is what makes the discipline
portable across contributor machines.

### II. Observability by Default

Every running component MUST expose an observability surface
appropriate to its platform.

**Node runtime requirements** (Hono on `@hono/node-server`):

- Structured JSON logs via `pino`. Application code MUST NOT use
  `console.log` (or equivalent `print`-style calls) for diagnostic
  output — the only sanctioned channel is the `pino` logger.
- A Prometheus-compatible `/metrics` endpoint via `prom-client`,
  exposing default runtime metrics (`process_*`, `nodejs_*`) plus the
  shared HTTP middleware metrics (per-route counters and latency
  histograms).
- A `/health` endpoint suitable for liveness/readiness probes.
- New HTTP routes MUST inherit per-route counters and latency
  histograms from the shared metrics middleware automatically. No
  per-route boilerplate.
- Adopters MAY opt out of HTTP-level metrics via a single env var
  (`HTTP_METRICS_ENABLED=false`) but MUST keep the runtime defaults
  (`process_*`, `nodejs_*`).
- Every orchestrated service MUST declare a `healthcheck` so
  orchestration tooling can detect degraded dependencies without
  out-of-band probes.

**Worker runtime requirements** (Hono on Cloudflare Workers fetch
handler):

- Structured logs via `console.log` / `console.error` (the canonical
  channel on Workers). Workers Logs and `wrangler tail` are the
  collection surface; `pino` and `prom-client` are NOT used because
  they are Node-only.
- A `/health` endpoint (touches no binding) returning
  `{ status, service, ts }` JSON.
- A Prometheus-style `/metrics` endpoint is OUT OF SCOPE for the
  Worker runtime. Workers observability is delegated to Cloudflare's
  built-in analytics; introducing prom-client to the Worker bundle is
  prohibited.
- Comparison demos: every Worker-native data path (e.g. `/d1/now`,
  `/kv/echo`) SHOULD have a counterpart on the Node side
  (`/app-api/now` via Postgres, `/app-api/echo` via Redis) so a reader
  can exercise both sides side-by-side.

**Rationale**: Observability retrofitted under load is expensive and
error-prone. Each runtime has a native observability stack that fits
its platform; the constitution codifies which mechanism applies where
so adopters never wire pino into a Worker bundle (would fail at
deploy) or prom-client into Workers (would bloat the bundle for no
benefit).

### III. Container-First Development, Per-Runtime Deployment

The dev container is the canonical development environment for **both
runtimes**. All build, test, lint, typecheck, format, and source-control
operations MUST work identically on macOS (Apple Silicon) and Linux
(WSL2 Ubuntu) when invoked inside the container. Adopters MUST NOT
introduce host-only steps, OS-specific scripts, or absolute paths that
depend on a particular workstation.

Adopters MUST NOT install application-layer dependencies on the host
machine — language runtimes, language-specific package managers (beyond
what the dev container needs to bootstrap), libraries, or databases
all live inside the dev container or its sibling compose stack. Only
Docker, an editor/IDE, and minimal version-control tooling belong on
the host.

**Production deployment is per-runtime** and intentionally diverges:

- **Node runtime**: deployed via a multi-stage container image
  (`Dockerfile`) and orchestrated by `docker-compose.yml`. The
  production stage MUST NOT contain build tooling, test frameworks, or
  development dependencies — only the runtime artifacts and runtime
  dependencies. The production image MUST run as a non-root user, with
  the user-selection directive explicit (not inherited).
- **Worker runtime**: deployed via `wrangler deploy` to Cloudflare's
  edge network. The Worker is bundled by wrangler's internal esbuild;
  there is no Docker image, no Dockerfile, and no compose entry for
  the Worker runtime. Wrangler-side configuration lives in
  `wrangler.jsonc` (and gitignored `.dev.vars` for local secrets).

Base images for the Node side SHOULD be multi-arch official images so
the same orchestration declaration works on arm64 (Mac) and amd64
(WSL/Linux). When an amd64-only image is unavoidable, the affected
service MUST pin the architecture explicitly in the orchestration
declaration AND the rationale MUST be recorded in adopter-facing
documentation. Image definitions MUST NOT hardcode `--platform` in
their base-image selection.

CI MUST execute on the same base image as the dev container (Node
side) and the same wrangler / vitest pool versions (Worker side) so
green CI implies a green local dev container (and vice versa).

**Rationale**: Cross-platform parity is the load-bearing promise of
this template. Drift between Mac and WSL contributors becomes "works on
my machine" debt that poisons onboarding speed; CI/dev divergence does
the same to the merge gate. Per-runtime deployment is honest about the
fact that Workers and Node are fundamentally different platforms — the
dev environment is unified to keep developer experience unified, but
production targets are NOT lied about.

### IV. Type Safety End-to-End

TypeScript strict mode is mandatory for both runtimes. `tsc --noEmit`
MUST pass before any merge. The configured linter (ESLint flat config)
and formatter (Prettier) MUST pass.

The two runtimes MAY use separate tsconfig files
(`tsconfig.{node,worker}.json` extending a shared base) so that
runtime-specific globals (Node types, Cloudflare workers-types) do not
leak into the wrong side. Tests MUST typecheck under their respective
runtime's tsconfig.

`src/shared/` MAY hold runtime-agnostic types and constants imported by
both sides. Anything in `src/shared/` MUST type-check cleanly under
both tsconfigs (no Node globals, no Workers globals).

Runtime type assertions are reserved for system boundaries (HTTP
request bodies, env vars, external APIs, Cloudflare bindings); internal
code trusts the TypeScript type system.

**Rationale**: Type checks plus formatter automation eliminate an
entire class of PR review noise (style debates, refactor regressions,
untyped API drift) so reviews can focus on behavior and correctness.
Separate tsconfigs prevent the most common dual-runtime hazard:
accidentally calling a Node-only API from Worker code (or vice versa)
and discovering it at deploy time.

### V. Spec-Driven Development

All non-trivial features MUST flow through the spec-kit pipeline:
`/speckit-constitution → /speckit-specify → /speckit-clarify →
/speckit-plan → /speckit-tasks → /speckit-implement`. Trivial fixes
(typos, single-line bugs, dependency bumps with no behavior change) MAY
skip the pipeline. Every plan MUST include a Constitution Check gate
that explicitly references the principles above and justifies any
deviations in the plan's Complexity Tracking section.

Each feature MUST be developed on its own spec-kit branch
(`NNN-feature-name`, e.g. `001-superspec-baseline`); branch creation is
automated by spec-kit and MUST NOT be short-circuited. Direct work on
`main` for non-trivial changes is prohibited.

A human reviewer MUST inspect the generated `spec.md` and `plan.md`
BEFORE `/speckit-implement` runs. AI-only authorship from prompt to
merged code is prohibited; the human review gate is the safety valve
that distinguishes spec-driven development from autopilot. The human
reviewer MAY be the author themselves (no enforced four-eyes), but the
review step MUST happen and MUST be evidenced (PR description, commit
message, or skill-pipeline checkpoint).

**Rationale**: Spec-driven development is the reason this template
exists. Bypassing the pipeline removes the very value the template
provides; codifying the gates (branch isolation + pre-implement human
review) prevents drift back into ad-hoc work and keeps a human in the
loop for irreversible code generation.

## Technology Stack & Constraints

The following stack is the constitutional baseline. Additions are
allowed; removals or substitutions of items marked **CORE** require a
constitutional amendment.

**Shared (both runtimes)**:

- **Language (CORE)**: TypeScript 5.7+, strict mode.
- **Web framework (CORE)**: Hono 4.x. The Node side uses
  `@hono/node-server`; the Worker side uses Hono's native fetch
  handler.
- **Test runner (CORE)**: vitest 4.x. The Worker side additionally
  uses `@cloudflare/vitest-pool-workers` to drive miniflare.
- **Lint / Format (CORE)**: ESLint 9 flat config + Prettier 3.
- **Package manager (CORE)**: pnpm 9.
- **AI tooling**: Claude Code (official `claude` CLI), spec-kit, and
  `obra/superpowers` skills. Each contributor authenticates with their
  own Claude subscription; OAuth credentials MUST NOT be baked into
  images or committed to VCS.

**Node-runtime-specific**:

- **Runtime (CORE)**: Node.js ≥ 22. Machine-enforced via
  `engines.node` + pnpm `engine-strict=true`, not relied on by
  convention. Dev TypeScript execution uses
  `--experimental-strip-types`.
- **Storage**: PostgreSQL via `pg`; Redis via `redis`. Adopters MAY
  remove either if their feature truly does not need it.
- **Observability (CORE)**: `pino` for structured logs; `prom-client`
  for metrics.
- **Containerization (CORE)**: Docker Compose for local orchestration;
  multi-stage image definition for production images;
  docker-outside-of-docker arrangement inside the dev container.

**Worker-runtime-specific**:

- **Runtime (CORE)**: Cloudflare Workers V8 isolate. Compatibility
  date is pinned in `wrangler.jsonc`.
- **Bindings**: D1 (SQL), KV (key-value cache). Bound at deploy time
  and exposed to the Worker via the `Env` type.
- **Local-dev runtime (CORE)**: `wrangler dev` (miniflare-backed). No
  Docker; no compose. Local secrets via gitignored `.dev.vars`.
- **Deployment (CORE)**: `wrangler deploy`. The Worker bundle is
  produced by wrangler's internal esbuild; the deployed artifact is
  not a container image.

**Target host platforms**: macOS Apple Silicon and Linux WSL2 Ubuntu
only. Native Windows hosts are explicitly out of scope.

**Operational constraints**:

- **Compose-only orchestration (Node side)**: Multi-service Node
  operations MUST use the project's Compose orchestration. Raw
  `docker run` MUST NOT be used to launch long-lived services — it
  bypasses the declarative service topology and the healthcheck graph.
- **Production stage hygiene (Node side)**: The production stage of
  the image definition MUST NOT contain build tooling, test
  frameworks, or development dependencies. Only the runtime artifacts
  and runtime dependencies belong in the final image.
- **Build artifact policy**: Build artifacts that suffer under
  cross-filesystem IO (`node_modules/`, `dist/`, `.vitest-cache/`,
  `.wrangler/`) MUST be backed by Docker named volumes OR ignored from
  version control — they MUST NEVER be bind-mounted across host
  filesystems (osxfs on Mac, `/mnt/c` on WSL2). This is what makes
  the cross-platform performance claim real.
- **Line endings**: Shell scripts and other LF-sensitive files MUST
  use LF line endings. The repository MUST enforce this at commit time
  (e.g. via repo-level line-ending attributes), not rely on
  contributor editor configuration.
- **Non-root production (Node side)**: Production container images
  MUST run as a non-root user. The directive that selects the runtime
  user MUST be explicit in the image definition (not inherited).
- **Port exposure policy (Node side)**: Service ports MUST be exposed
  to the host only for local development convenience. Production
  deployments MUST front services with a reverse proxy rather than
  expose application ports directly.
- **Worker bundle policy**: The Worker bundle MUST NOT depend on
  Node-only modules (`pg`, `redis`, `pino`, `prom-client`,
  `@hono/node-server`, `fs`, `child_process`, etc.). Wrangler will
  reject these at bundle time, but adopters SHOULD also rely on
  `tsconfig.worker.json`'s type-level isolation to catch the violation
  during typecheck rather than at deploy.

## Development Workflow & Quality Gates

Every change MUST clear the following gates before merge:

1. **Tests pass**: vitest MUST return green for both pools (Node and
   Worker, when both exist). When only the Node side is present, only
   the Node pool runs.
2. **Types clean**: Strict type-check MUST report zero errors for all
   relevant tsconfig projects.
3. **Lint clean**: ESLint MUST report zero errors. Prettier
   `--check` MUST report zero failures.
4. **Container parity (Node side)**: Node-side changes are validated
   inside the canonical containerised environment, not on the host.
   PRs that were tested only on the host MUST disclose this. Worker
   side changes are validated against miniflare via vitest; deploy-to-
   real-Cloudflare validation is OPTIONAL and only required when a
   change demonstrably depends on real platform behavior (e.g.,
   regional routing, real D1 query plans).
5. **Spec coverage**: Non-trivial changes link to a
   `specs/<NNN-feature>/` directory produced by spec-kit, including
   spec, plan, and tasks artifacts.
6. **Lockfiles committed**: All dependency lockfiles
   (`pnpm-lock.yaml`, and any other applicable lockfile) MUST be
   committed alongside the manifest change. Un-pinned or
   lockfile-skipped dependency changes MUST NOT be merged.

The standard inner loop inside the canonical environment exposes the
following capabilities (concrete invocations are listed in *Reference
Implementation Notes* below):

- Start the Node application stack (app + databases) for local
  development.
- Start the Worker locally via wrangler dev.
- Tail Node application logs; tail Worker logs via wrangler tail.
- Run tests, type-check, lint, and format for both runtimes.
- Open a shell in the running Node container or its database
  container.
- Source-control operations (such as `git push`) MUST be performed
  from inside the canonical environment with credentials forwarded
  from the host (never baked into images).

**Sensitive material policy** (enforced at the repository ignore
layer):

- `~/.claude/.credentials.json`, `~/.claude.json`,
  `.claude/.credentials.json` MUST NEVER be committed.
- `.env` (real secrets) MUST NEVER be committed; `.env.example` is
  the canonical template.
- `.dev.vars` (wrangler local secrets) MUST NEVER be committed; it
  is an adopter-local file analogous to `.env`.
- `*.pem`, `*.key`, `docker-compose.override.yml` (personal local
  tweaks), `.devcontainer/devcontainer.local.json` MUST NEVER be
  committed.

## Governance

This constitution supersedes ad-hoc practices. When a workflow, README
section, or external skill conflicts with these rules, the constitution
wins until the document itself is amended.

**Amendment procedure**: Run `/speckit-constitution` with the proposed
change. Update version per semantic versioning:

- **MAJOR**: removing or redefining a principle, or breaking
  adopter-facing contracts (e.g., changing the canonical package
  manager, dropping one of the two runtimes, prohibiting a previously
  permitted deployment target).
- **MINOR**: adding a new principle or materially expanding existing
  guidance.
- **PATCH**: clarifications, wording fixes, typo repair, non-semantic
  refinement.

**Amendment review checklist** (every amendment PR MUST):

1. State the rationale for the change in the PR description.
2. Verify that all existing artifacts under `specs/*/spec.md` and
   `plan.md` remain consistent with the amended constitution.
3. If conflicts exist, patch the affected specs/plans FIRST and merge
   those patches BEFORE merging the constitution change. The
   constitution and existing specs MUST NOT be inconsistent at any
   commit.

**Cross-cutting changes**: Any change that affects multiple services,
principles, or workflows MUST update the constitution FIRST and then
propagate to code, templates, and documentation. Code-first
cross-cutting changes that retroactively amend the constitution are
prohibited.

**Toolchain pinning**: The spec-kit version is pinned in
`.devcontainer/post-create.sh`. Upgrading spec-kit MUST be a dedicated,
isolated commit (no behavior changes, no other refactors) so the
upgrade is independently reviewable and revertible. The same isolation
rule applies to upgrading wrangler, vitest, and other CORE toolchain
items.

**Compliance review**:

- Every `/speckit-plan` MUST populate the `## Constitution Check`
  section, listing each principle and asserting alignment or
  justifying deviation.
- Deviations MUST be recorded in the plan's `## Complexity Tracking`
  table with a rejected simpler alternative.
- `/speckit-analyze` performs a non-destructive cross-artifact
  consistency check against this constitution and is recommended after
  `/speckit-tasks`.

**Runtime AI agent guidance** lives in `CLAUDE.md` at the repo root.
When constitutional rules change, `CLAUDE.md` and any per-feature plan
MUST be reviewed for drift.

## Reference Implementation Notes (non-normative)

The following lists the *current* implementation choices that satisfy
the normative rules above. They are descriptive, not prescriptive —
replacing any of these does NOT amend the constitution as long as the
underlying rule still holds. This section is a navigational aid for
new contributors; it MUST NOT be cited as authority for refusing or
accepting changes.

**Repository layout**:

- `src/node/` — Node runtime entry + shared modules (db, redis,
  logger, metrics, http-metrics).
- `src/worker/` — Worker runtime entry + routes (planned per
  002-cloudflare-worker; not yet present at v1.0.0 ratification).
- `src/shared/` — runtime-agnostic types and constants imported by
  both sides (planned).
- `tests/node/` — vitest tests for Node side.
- `tests/worker/` — vitest tests for Worker side using
  `@cloudflare/vitest-pool-workers` (planned).
- `.specify/` — spec-kit baseline (constitution, templates, scripts,
  extensions, workflows).
- `specs/<NNN-feature>/` — spec-kit deliverables per feature.
- `.docs/` — design notes and runbooks not under the spec-kit
  pipeline.

**Standard invocations**:

- Node side test/typecheck/lint/format: `pnpm test` / `pnpm typecheck`
  / `pnpm lint` / `pnpm format`.
- Node compose lifecycle: `make up`, `make down`, `make logs`,
  `make shell`, `make db-shell` (or the underlying
  `docker compose ...` commands).
- Worker side dev: `wrangler dev` (planned `pnpm dev:worker` script).
- Worker side deploy: `wrangler deploy` (planned `pnpm deploy:worker`
  script).

**Configuration files**:

- Runtime version enforcement: `engines.node` in `package.json` +
  `engine-strict=true` in `.npmrc`.
- TypeScript: planned dual `tsconfig.{node,worker}.json` extending a
  shared base; currently single `tsconfig.json` until 002 lands.
- Vitest: planned dual `vitest.config.{node,worker}.ts`; currently no
  vitest config (vitest auto-discovers `tests/node/**`).
- Image definition: `Dockerfile` (multi-stage, repo root).
- Compose orchestration: `docker-compose.yml` (repo root).
- Wrangler config: planned `wrangler.jsonc` at repo root once Worker
  side is implemented.
- Line-ending enforcement: `.gitattributes`.
- Repository ignore layer: `.gitignore` (includes `.dev.vars`,
  `.env*`, Claude credentials, build artifacts).
- Linter / formatter configuration: `eslint.config.js`,
  `.prettierrc.json`, `.prettierignore`.
- Source-control credential forwarding: SSH agent forwarded by the
  dev container via VS Code Dev Containers' built-in mechanism — no
  explicit `${localEnv:SSH_AUTH_SOCK}` mount; host `ssh-add` is the
  prerequisite. Historical context (Mac launchd path hard-fail) lives
  at `.docs/onboarding-stopwatch.md` Layer B caveat + issue #1.

## Variant Amendment — Cloudflare Worker Companion (2026-04-30)

This section is an amendment to the constitution recorded at v1.1.0. It
is **additive**: none of the five Core Principles above is redefined.
The amendment exists to anchor — explicitly and at constitutional level —
the dual-runtime reality that v1.0.0 described prospectively, and that
feature `002-cloudflare-worker` lands mechanically.

**Why this variant.** This monorepo (`claude-superspec-worker`) houses
**two runtimes coexisting** under a single `.specify/` baseline, single
`package.json`, and single toolchain:

- **Node runtime** (`src/node/`): Hono on `@hono/node-server`, Postgres
  via `pg`, Redis, `pino`, `prom-client`. Deployed via Docker
  (`Dockerfile` + `docker-compose.yml` at repo root).
- **Worker runtime** (`src/worker/`): Hono on Cloudflare Workers fetch
  handler, D1 + KV bindings, `console.log`, no Prometheus. Deployed via
  `wrangler deploy`.

The two share `.specify/`, toolchain, and `package.json`. They have
separate entries (`src/node/index.ts` vs `src/worker/index.ts`),
separate vitest pools (plain Node vs `@cloudflare/vitest-pool-workers`
miniflare), and separate tsconfigs (`tsconfig.node.json` vs
`tsconfig.worker.json`, both extending a shared base). `src/shared/`
holds the small set of runtime-agnostic types and constants both sides
import.

**Per-runtime deployment is intentional divergence.** Where the
predecessor `claude-superspec-nodejs/` constitution implied "Docker is
the deployment target," this monorepo amends that to: **Docker IS in
scope for the Node runtime; wrangler IS in scope for the Worker
runtime.** Each runtime uses its native deployment path; cross-runtime
deployment uniformity is NOT a goal and MUST NOT be pursued. Principle
III ("Container-First Development, Per-Runtime Deployment") already
encodes this divergence; this amendment names it explicitly so future
contributors do not interpret principle III as a defect to be cleaned
up by, e.g., containerizing the Worker.

**Type Safety End-to-End strengthened — partially mechanical.**
The dual `tsconfig.{node,worker}.json` structure supplies a
**partially mechanical** cross-runtime import ban: ambient globals
(`process`、`Buffer`)、`node:*` builtins、Workers-only globals
(`D1Database`、`KVNamespace`)在錯誤的 tsconfig 下 typecheck **會失敗**;
但**顯式 named import**(`import { Pool } from 'pg'`、
`import type {} from '@cloudflare/workers-types'`)目前**僅 advisory**
(per `specs/002-cloudflare-worker/contracts/dual-tsconfig.md` §3.1 +
`.docs/baseline-traceability-matrix.md` FR-022 row)。`pnpm typecheck`
chains both — 兩個 tsconfig 之 ambient / builtin 邊界皆 pass 才 exit 0。
完全機械化下一步為 ESLint `no-restricted-imports` rule(已知 follow-up,
非本 commit 範圍)。This converts baseline forward-declaration FR-022 from
fully aspirational to partially mechanical from this commit forward;
SC-011 violation count 從本 commit 起對 ambient / builtin 違規生效。

**Test-First continues — dual pool.** Vitest runs two pools (Node side
plain, Worker side miniflare via `@cloudflare/vitest-pool-workers`).
Both pools MUST be green before merge. Worker tests do NOT run inside
Docker; they run on the host (or inside the dev container) with
miniflare simulating the Workers V8 isolate, D1, and KV bindings.

**Comparison demos are first-class.** Every Worker-native data path
(`/d1/now`, `/kv/echo`) MUST have a counterpart on the Node side
(`/app-api/now` via Postgres, `/app-api/echo` via Redis). The Worker
`/app-api/*` route reverse-proxies (passthrough, no prefix-strip) to
whatever URL `UPSTREAM_URL` resolves to. README MUST ship a 3 row × 2
col endpoint table making this dual-runtime semantic visible to first
readers. These comparison endpoints are part of the starter contract,
not optional extras.

**Reference.** Feature `002-cloudflare-worker` lands this amendment
together with the source-tree changes that make it real. Baseline
forward-declarations from `001-superspec-baseline`
(FR-018 / FR-021 / FR-022 / SC-011) are mechanically active from this
commit forward. Principles inherited unchanged: TDD, frequent commits,
no over-engineering.

**Version**: 1.1.2 | **Ratified**: 2026-04-30 | **Last Amended**: 2026-05-03
