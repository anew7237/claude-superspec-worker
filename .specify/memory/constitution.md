<!--
SYNC IMPACT REPORT
==================
Current version: 1.2.2

Version history (most recent first):

PATCH 1.2.1 → 1.2.2 (2026-04-28) — non-semantic refinement:
  - Resolved and removed TODO(README_LEGACY_SECTIONS). All "002" feature-id
    references inherited from a prior project have been cleaned from
    user-facing surfaces: README §10 wording, src/http-metrics.ts module
    docs, docker-compose.yml comments, and .env.example comments. The
    http-metrics middleware implementation itself was deliberately retained
    as the project's HTTP observability default (consistent with
    Principle II — Observability by Default).
  - Active follow-up TODOs after this patch: only TODO(PACKAGE_NAME)
    remains.
  - No principles, sections, quality gates, or normative text changed.

PATCH 1.2.0 → 1.2.1 (2026-04-28) — non-semantic refinement:
  - Updated TODO(README_LEGACY_SECTIONS) to record that the README's "Python
    migration" subsection was removed on 2026-04-28 along with the Makefile
    `prune-legacy` target. Only the "HTTP middleware metrics 002" item remains
    unresolved under that TODO.
  - Corrected stale "unchanged from 1.1.0" annotations on the Templates and
    Follow-up TODOs lists (those entries had in fact been refreshed during the
    1.2.0 rewrite, so the qualifier was misleading).
  - No principles, sections, quality gates, or normative text changed in 1.2.1.

MINOR 1.1.0 → 1.2.0 — re-worded normative rules to be tool- and file-agnostic
                where the underlying intent is portable, so the constitution no
                longer depends on neighbouring files (Makefile, Dockerfile path,
                docker-compose.yml, .gitattributes, .gitignore, eslint.config.js,
                package.json, README section numbers) for its meaning. Concrete
                implementation choices were consolidated into a new non-normative
                "Reference Implementation Notes" section. No principles renamed,
                removed, or weakened. Three references kept by deliberate
                exception (spec-kit version pin in `.devcontainer/post-create.sh`,
                runtime AI agent guidance in `CLAUDE.md`, and `/speckit-*`
                pipeline command names) because they name spec-kit/Claude Code
                integration contracts that this project explicitly opts into.

Modified principles in 1.2.0 (re-worded only, no semantic change):
  - III. Container-First Reproducibility — multi-arch policy now references
        "orchestration declaration" and "adopter-facing documentation" instead of
        `docker-compose.yml` and `README`; "image definitions" instead of
        `Dockerfile`.
  - IV. Type Safety End-to-End — ESLint/Prettier rule no longer points at
        `eslint.config.js` filename or `make lint`/`make format` invocations.

Modified sections in 1.2.0 (re-worded only):
  - Technology Stack & Constraints — runtime version enforcement (#2), line
        endings (#5), non-root production (#6), port exposure (#7) generalised.
  - Development Workflow & Quality Gates — quality gates 1-3 (#8), inner loop
        (#9), source-control operations (#10), ignore-layer wording (#11)
        generalised.

Added sections in 1.2.0:
  - Reference Implementation Notes (non-normative) — consolidates the concrete
        invocations and file paths that currently realise the normative rules.

Removed sections in any version since 1.0.0: none.

Templates requiring updates (current status, manual follow-up):
  ✅ plan-template.md — abstract `## Constitution Check` gate, no rebinding needed
  ✅ spec-template.md — agnostic, no rebinding needed
  ⚠ tasks-template.md — sample tasks reference `.py` extensions (Python-era
     leftover); should be updated to `.ts` / `vitest` examples to match the
     Node.js stack
  ⚠ plan-template.md — Technical Context examples ("Python 3.11", "FastAPI",
     "pytest") are generic NEEDS-CLARIFICATION fallbacks; non-blocking but
     adopters may want to localize them to the Node.js stack
  ✅ README — sections covering cross-platform differences and operational FAQ
     align with Container-First and Cross-Platform principles (referenced by
     topic, not by section number, since README headings may be renumbered)
  ✅ CLAUDE.md — referenced as runtime AI agent guidance; aligned

Follow-up TODOs (current status):
  - TODO(PACKAGE_NAME): `package.json` still uses `"name": "myapp"`; consider
    renaming to `claude-superspec-nodejs` to match the project identity declared
    here.
-->

# Claude SuperSpec Node.js Constitution

## Core Principles

### I. Test-First Development (NON-NEGOTIABLE)

Tests MUST be written before implementation. The cycle is RED → GREEN → REFACTOR:
write a failing test, watch it fail, implement the minimum to pass, then refactor.
`vitest` is the canonical test runner; tests live under `tests/` and run inside
the canonical containerised environment. The spec-driven implementation step
enforces this loop and adopters MUST NOT bypass it for non-trivial work.

All tests MUST execute inside the container. Test execution MUST NOT depend on
host-installed runtimes, package managers, or test frameworks; a fresh clone with
only Docker installed MUST be sufficient to run the full test suite.

**Rationale**: TDD is the only discipline that keeps the spec → tasks → implement
pipeline honest. Without a failing test, "implement" silently degrades into
"guess and ship". Container-bound test execution is what makes the discipline
portable across contributor machines.

### II. Observability by Default

Every running component MUST emit structured JSON logs (via `pino`) and expose:

- A Prometheus-compatible `/metrics` endpoint (via `prom-client`).
- A `/health` endpoint suitable for liveness/readiness probes.

Every orchestrated service MUST declare a `healthcheck` so orchestration tooling
can detect degraded dependencies without out-of-band probes. New HTTP routes MUST
inherit per-route counters and latency histograms from the shared metrics
middleware. Adopters MAY opt out of HTTP-level metrics via a single env var
(`HTTP_METRICS_ENABLED=false`) but MUST keep the runtime defaults (`process_*`,
`nodejs_*`).

Application code MUST NOT use raw `console.log` (or equivalent `print`-style
calls) for diagnostic output. The only sanctioned channel is the `pino` logger;
ad-hoc stdout writes bypass log levels, structured fields, and downstream
collectors.

**Rationale**: Observability retrofitted under load is expensive and error-prone.
Baking metrics, structured logs, health endpoints, and orchestration healthchecks
into the scaffold means every adopter inherits production-grade visibility on
day one.

### III. Container-First Reproducibility

The dev container is the canonical development environment. All build, test,
lint, typecheck, format, and source-control operations MUST work identically on
macOS (Apple Silicon) and Linux (WSL2 Ubuntu) when invoked inside the container.
Adopters MUST NOT introduce host-only steps, OS-specific scripts, or absolute
paths that depend on a particular workstation. Production images are built from a
multi-stage image definition; a docker-outside-of-docker arrangement is used so
the dev container can build and run sibling containers against the host Docker
daemon.

Adopters MUST NOT install application-layer dependencies on the host machine —
language runtimes, language-specific package managers (beyond what the dev
container needs to bootstrap), libraries, or databases all live inside containers.
Only Docker, an editor/IDE, and minimal version-control tooling belong on the
host.

Base images SHOULD be multi-arch official images so the same orchestration
declaration works on arm64 (Mac) and amd64 (WSL/Linux). When an amd64-only image
is unavoidable, the affected service MUST pin the architecture explicitly in the
orchestration declaration AND the rationale MUST be recorded in adopter-facing
documentation. Image definitions MUST NOT hardcode `--platform` in their
base-image selection — platform selection belongs to the orchestration layer.

CI MUST execute on the same base image as the dev container so green CI implies a
green local dev container (and vice versa).

**Rationale**: Cross-platform parity is the load-bearing promise of this template.
Drift between Mac and WSL contributors becomes "works on my machine" debt that
poisons onboarding speed; CI/dev divergence does the same to the merge gate.

### IV. Type Safety End-to-End

TypeScript strict mode is mandatory. `tsc --noEmit` MUST pass before any merge.
The configured linter (ESLint flat config) and formatter (Prettier) MUST pass.
Runtime type assertions are reserved for system boundaries (HTTP request bodies,
env vars, external APIs); internal code trusts the TypeScript type system.

**Rationale**: Type checks plus formatter automation eliminate an entire class of
PR review noise (style debates, refactor regressions, untyped API drift) so
reviews can focus on behavior and correctness.

### V. Spec-Driven Development

All non-trivial features MUST flow through the spec-kit pipeline:
`/speckit-constitution → /speckit-specify → /speckit-clarify → /speckit-plan →
/speckit-tasks → /speckit-implement`. Trivial fixes (typos, single-line bugs,
dependency bumps with no behavior change) MAY skip the pipeline. Every plan MUST
include a Constitution Check gate that explicitly references the principles above
and justifies any deviations in the plan's Complexity Tracking section.

Each feature MUST be developed on its own spec-kit branch (`NNN-feature-name`,
e.g. `001-todo-api`); branch creation is automated by spec-kit and MUST NOT be
short-circuited. Direct work on `main` / `master` for non-trivial changes is
prohibited.

A human reviewer MUST inspect the generated `spec.md` and `plan.md` BEFORE
`/speckit-implement` runs. AI-only authorship from prompt to merged code is
prohibited; the human review gate is the safety valve that distinguishes
spec-driven development from autopilot.

**Rationale**: Spec-driven development is the reason this template exists.
Bypassing the pipeline removes the very value the template provides; codifying
the gates (branch isolation + pre-implement human review) prevents drift back
into ad-hoc work and keeps a human in the loop for irreversible code generation.

## Technology Stack & Constraints

The following stack is the constitutional baseline. Additions are allowed;
removals or substitutions of items marked **CORE** require a constitutional
amendment.

- **Runtime (CORE)**: Node.js ≥ 22. The runtime version constraint MUST be
  machine-enforced by the project's package manifest (rejecting installs on
  lower versions), not relied on by convention. Dev TypeScript execution uses
  `--experimental-strip-types`.
- **Web framework (CORE)**: Hono 4.x with `@hono/node-server`.
- **Storage**: PostgreSQL via `pg`; Redis via `redis`. Adopters MAY remove either
  if their feature truly does not need it; doing so requires updating this
  section.
- **Observability (CORE)**: `pino` for structured logs; `prom-client` for
  metrics.
- **Testing (CORE)**: `vitest` 2.x (run + watch + bench).
- **Lint / Format (CORE)**: ESLint 9 flat config + Prettier 3.
- **Package manager (CORE)**: `pnpm` 9.
- **Containerization (CORE)**: Docker Compose for local orchestration; multi-stage
  image definition for production images; docker-outside-of-docker arrangement
  inside the dev container.
- **Target platforms**: macOS Apple Silicon and Linux WSL2 Ubuntu only. Native
  Windows hosts are explicitly out of scope.
- **AI tooling**: Claude Code (official `claude` CLI), spec-kit, and
  `obra/superpowers` skills. Each contributor authenticates with their own Claude
  subscription; OAuth credentials MUST NOT be baked into images or committed to
  VCS.

**Operational constraints**:

- **Compose-only orchestration**: Multi-service operations MUST use the project's
  Compose orchestration. Raw `docker run` MUST NOT be used to launch long-lived
  services — it bypasses the declarative service topology and the healthcheck
  graph.
- **Production stage hygiene**: The production stage of the image definition MUST
  NOT contain build tooling, test frameworks, or development dependencies. Only
  the runtime artifacts and runtime dependencies belong in the final image.
- **Build artifact policy**: Build artifacts that suffer under cross-filesystem
  IO (`node_modules/`, `dist/`, `.vitest-cache/`, equivalent for other stacks)
  MUST be backed by Docker named volumes OR ignored from version control — they
  MUST NEVER be bind-mounted across host filesystems (osxfs on Mac, `/mnt/c` on
  WSL2). This is what makes the cross-platform performance claim real.
- **Line endings**: Shell scripts and other LF-sensitive files MUST use LF line
  endings. The repository MUST enforce this at commit time (e.g. via repo-level
  line-ending attributes), not rely on contributor editor configuration. Files
  committed with CRLF will break inside the Linux dev container.
- **Non-root production**: Production container images MUST run as a non-root
  user. The directive that selects the runtime user MUST be explicit in the
  image definition (not inherited or implicit).
- **Port exposure policy**: Service ports MUST be exposed to the host only for
  local development convenience. Production deployments MUST front services with
  a reverse proxy (e.g. nginx, Traefik, Caddy) rather than expose application
  ports directly.

## Development Workflow & Quality Gates

Every change MUST clear the following gates before merge:

1. **Tests pass**: The project's standard test-run command MUST return green.
2. **Types clean**: The project's strict type-check pass MUST report no errors.
3. **Lint clean**: The project's configured linter MUST report no errors.
4. **Container parity**: Changes are validated inside the canonical containerised
   environment, not on the host. PRs that were tested only on the host MUST
   disclose this.
5. **Spec coverage**: Non-trivial changes link to a `specs/<NNN-feature>/`
   directory produced by spec-kit, including spec, plan, and tasks artifacts.
6. **Lockfiles committed**: All dependency lockfiles (`pnpm-lock.yaml`, `uv.lock`,
   and any other applicable lockfile) MUST be committed alongside the manifest
   change. Un-pinned or lockfile-skipped dependency changes MUST NOT be merged.

The standard inner loop inside the canonical environment exposes the following
capabilities (concrete invocations are listed in *Reference Implementation Notes*
below):

- Start the application stack (app + databases) for local development.
- Tail application logs.
- Run tests, type-check, lint, and format.
- Open a shell in the running application container or its database container.
- Source-control operations (such as `git push`) MUST be performed from inside
  the canonical environment with credentials forwarded from the host (never
  baked into images).

**Sensitive material policy** (enforced at the repository ignore layer):

- `~/.claude/.credentials.json`, `~/.claude.json`, `.claude/.credentials.json`
  MUST NEVER be committed.
- `.env` (real secrets) MUST NEVER be committed; `.env.example` is the canonical
  template.
- `*.pem`, `*.key`, `docker-compose.override.yml` (personal local tweaks) MUST
  NEVER be committed.

## Governance

This constitution supersedes ad-hoc practices. When a workflow, README section,
or external skill conflicts with these rules, the constitution wins until the
document itself is amended.

**Amendment procedure**: Run `/speckit-constitution` with the proposed change.
Update version per semantic versioning:

- **MAJOR**: removing or redefining a principle, or breaking adopter-facing
  contracts (e.g., changing the canonical package manager).
- **MINOR**: adding a new principle or materially expanding existing guidance.
- **PATCH**: clarifications, wording fixes, typo repair, non-semantic refinement.

**Amendment review checklist** (every amendment PR MUST):

1. State the rationale for the change in the PR description.
2. Verify that all existing artifacts under `.specify/specs/*/spec.md` and
   `plan.md` remain consistent with the amended constitution.
3. If conflicts exist, patch the affected specs/plans FIRST and merge those
   patches BEFORE merging the constitution change. The constitution and existing
   specs MUST NOT be inconsistent at any commit.

**Cross-cutting changes**: Any change that affects multiple services, principles,
or workflows MUST update the constitution FIRST and then propagate to code,
templates, and documentation. Code-first cross-cutting changes that
retroactively amend the constitution are prohibited.

**Toolchain pinning**: The spec-kit version is pinned in
`.devcontainer/post-create.sh`. Upgrading spec-kit MUST be a dedicated, isolated
commit (no behavior changes, no other refactors) so the upgrade is independently
reviewable and revertible.

**Compliance review**:

- Every `/speckit-plan` MUST populate the `## Constitution Check` section,
  listing each principle and asserting alignment or justifying deviation.
- Deviations MUST be recorded in the plan's `## Complexity Tracking` table with
  a rejected simpler alternative.
- `/speckit-analyze` performs a non-destructive cross-artifact consistency check
  against this constitution and is recommended after `/speckit-tasks`.

**Runtime AI agent guidance** lives in `CLAUDE.md` at the repo root. When
constitutional rules change, `CLAUDE.md` and any per-feature plan MUST be
reviewed for drift.

## Reference Implementation Notes (non-normative)

The following lists the *current* implementation choices that satisfy the
normative rules above. They are descriptive, not prescriptive — replacing any of
these does NOT amend the constitution as long as the underlying rule still
holds. This section is a navigational aid for new contributors; it MUST NOT be
cited as authority for refusing or accepting changes.

- Standard test/typecheck/lint/format invocations: `make test`,
  `make typecheck`, `make lint`, `make format`.
- Inner-loop entry points: `make up`, `make logs`, `make shell`,
  `make db-shell`.
- Runtime version enforcement: `engines.node` in `package.json`.
- Architecture pinning: `platform:` field in `docker-compose.yml`.
- Image definition file: `Dockerfile` (multi-stage).
- Line-ending enforcement: `.gitattributes`.
- Repository ignore layer: `.gitignore`.
- Linter / formatter configuration: `eslint.config.js`, `.prettierrc.json`.
- Source-control credential forwarding: SSH agent forwarded by the dev
  container.

**Version**: 1.2.2 | **Ratified**: 2026-04-28 | **Last Amended**: 2026-04-28
