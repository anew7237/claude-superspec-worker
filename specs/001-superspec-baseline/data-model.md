# Phase 1 Data Model: SuperSpec Worker Monorepo Baseline

**Date**: 2026-04-30
**Spec**: [spec.md](./spec.md) — see "Key Entities" section
**Plan**: [plan.md](./plan.md)

> **Note**: 本 baseline 為 meta-project,沒有 application-domain data model。本檔規範的是 **process / governance entities** — 規格化 monorepo 自身運作的角色與工件,並標註各自於 monorepo 內的具體存在位置與屬性。

## 1. Adopter

採用此 monorepo 開新專案或加入既有專案的開發者(個人或團隊)。

**Attributes**:
- `host_platform`:`macos-apple-silicon` | `linux-wsl2-ubuntu`(其他主機平台不在支援範圍,FR-001)
- `claude_subscription_tier`:`pro` | `max` | `team` | `enterprise`(每位 contributor 個別持有,FR-007)
- `target_runtime`:`node-only` | `worker-only` | `dual`(三種皆為合格 derivative,FR-018 + Q1 Clarification)
- `first_sdd_experience`:`true` | `false`(影響 onboarding 引導密度,US1)

**Lifecycle**:
1. Clone repo → 2. Reopen-in-Container → 3. 容器內 `claude` (OAuth credential 已 mount,不需重登,US1) → 4. `make up` 啟 Node stack(若 target_runtime 含 node)→ 5. 跑第一個 SDD pipeline(US2 + SC-007)。

## 2. DevContainer Definition

`.devcontainer/` 內描述容器化開發環境的契約集合;Adopter 與容器之間的單一事實來源。

**Attributes**:
- `image_definition`:`Dockerfile` 於 `.devcontainer/Dockerfile`(uv + 系統工具 base;node + claude + git + gh + DooD 由 features 引入)
- `features`:`claude-code:1` + `docker-outside-of-docker:1` + `node:1` + `git:1` + `github-cli:1`
- `mounts`:`~/.claude` (host bind, FR-007)、`~/.claude.json` (host bind)、bash history(named volume)、`${localEnv:SSH_AUTH_SOCK}` → `/ssh-agent` (FR-014)
- `lifecycle_hooks`:`postCreateCommand: bash .devcontainer/post-create.sh`、`postStartCommand: sudo /usr/local/bin/init-firewall.sh || ...`
- `containerEnv`:`LOCAL_WORKSPACE_FOLDER`(host abs path,for DooD)、`COREPACK_ENABLE_DOWNLOAD_PROMPT=0`、`SSH_AUTH_SOCK=/ssh-agent`
- `idempotency`:`postCreateCommand` MUST 多次重建仍正確(`post-create.sh` 內有 `[ ! -d ".specify" ]` 等 guard)

**Invariants**:
- 不烘焙 credentials(FR-007)
- 不 forwardPorts(避免遮蔽 compose port publish)
- 跨平台 byte-equivalent 進入點(FR-001)

## 3. Constitution

`.specify/memory/constitution.md`,專案規範總綱。

**Attributes**:
- `version`:`1.0.0`(SemVer;當前)
- `ratified_date`:`2026-04-30`
- `last_amended_date`:`2026-04-30`
- `core_principles`:5(Test-First / Observability / Container-First Dev+Per-Runtime Deploy / Type Safety / Spec-Driven)
- `sections`:Technology Stack & Constraints / Development Workflow & Quality Gates / Governance / Reference Implementation Notes
- `sync_impact_report`:HTML comment header,記錄 version history + templates requiring updates + follow-up TODOs

**Lifecycle / Amendment**:
- MAJOR:移除/重定義 principle、改 CORE 工具
- MINOR:新增 principle / 段落
- PATCH:wording / typo / 非語意 refinement
- **Amendment review checklist**:rationale + 既有 specs 一致性確認 + 衝突 → 先 patch specs/plans 再 merge constitution

**Relationships**: 凌駕於 README、CLAUDE.md(runtime guidance)、外部 skill 之上;每次修訂須同步 review CLAUDE.md 與 templates。

## 4. Feature Spec Artifact

`specs/NNN-feature-name/` 目錄,SDD pipeline 產出物。

**Attributes**:
- `feature_id`:`NNN`(sequential 三位數;by `.specify/init-options.json` `branch_numbering: "sequential"`)
- `short_name`:descriptive 2-4 詞(action-noun)
- `branch_name`:`<feature_id>-<short_name>`(e.g., `001-superspec-baseline`)
- `artifacts`:`spec.md` (mandatory) / `plan.md` / `tasks.md` / `research.md` / `data-model.md` / `quickstart.md` / `contracts/` / `checklists/`

**State transitions**:
1. `Draft`(於 `/speckit-specify` 後) → 2. `Clarified`(於 `/speckit-clarify` 後;optional) → 3. `Planned`(於 `/speckit-plan` 後,含 Constitution Check) → 4. `Tasks Generated`(於 `/speckit-tasks`) → 5. `Implementing`(於 `/speckit-implement`,含 RED→GREEN→REFACTOR) → 6. `Merged`(after PR review)

**Invariants**:
- 每個 active feature 對應一條 git branch(FR-016)
- `.specify/feature.json` `feature_directory` 指向當前 active feature dir,跨 spec-kit 指令 chain
- `/speckit-implement` 前必有人類 review spec.md + plan.md(FR-013)

## 5. Application Stack (Node)

範例 Hono 應用 + PostgreSQL + Redis 的 reference implementation,於 monorepo 內已落地。

**Attributes**:
- `entry_point`:`src/node/index.ts`(由 `@hono/node-server` 啟動,listen `PORT` env,預設 8000)
- `routes_file`:`src/node/app.ts`(`/`、`/health`、`/metrics`)
- `infrastructure_modules`:`src/node/{db,redis,logger,metrics,http-metrics}.ts`
- `tests_directory`:`tests/node/`(8 檔,含 `http-metrics.regression.test.ts` 凍結 SC-004)
- `compose_services`:`app`(Node 22 dev image)、`db`(Postgres 16-alpine)、`redis`(Redis 7-alpine)
- `production_image_user`:`app`(uid/gid 1001,non-root,FR-011)

**Observability surface**:
- `GET /health`:`{status,db,redis}` JSON,503 if degraded
- `GET /metrics`:Prometheus exposition(`process_*`、`nodejs_*` + `http_requests_total` + `http_request_duration_seconds`)
- stdout:single-line JSON via pino(FR-006、SC-009)

**Healthchecks**:
- compose `app` healthcheck:Node 內建 `fetch('http://localhost:8000/health')`
- compose `db` healthcheck:`pg_isready -U app -d app`
- compose `redis` healthcheck:`redis-cli ping | grep -q PONG`

## 6. Application Stack (Worker, Reserved)

`src/worker/` 內 Cloudflare Worker reference;**v1.0.0 ratification 時 reserved 但無內容**,由 002-cloudflare-worker 落地。

**Attributes(forward-declared)**:
- `entry_point`:`src/worker/index.ts`(export default `{ fetch: app.fetch }`)
- `routes`:`/health`、`/d1/now`、`/kv/echo`、`ALL /app-api/*`(passthrough proxy per `.docs/20260430a-cloudflare-worker.md` §4)
- `bindings`:`DB`(D1)、`KV`、`UPSTREAM_URL`(env var)
- `tests_directory`:`tests/worker/`(將透過 `@cloudflare/vitest-pool-workers` 跑 miniflare)
- `deploy_target`:Cloudflare edge via `wrangler deploy`(無 image)

**Reserved 結構義務**:
- v1.0.0 時 path 不存在亦合法,但 `/speckit-tasks` 的 002 plan 必須兌現所有上述 attributes
- src/shared/ 同樣 reserved(runtime-agnostic types)

## 7. Quality Gate

每個 PR merge 前須通過的檢查集合。

**Mandatory gates** (機械強制):
- `pnpm test`:vitest 全綠,Node + Worker 兩 pool 涵蓋(Worker pool 自 002 落地)
- `pnpm typecheck`:`tsc --noEmit` 0 errors
- `pnpm lint`:eslint 0 errors + `prettier --check` 0 failures
- `lockfile committed`:`git status --porcelain pnpm-lock.yaml` 為空 + `Dockerfile` `--frozen-lockfile`

**Advisory gates**(human-attest):
- container parity disclosure(host-only 測試 PR 須揭露)
- spec coverage(`specs/NNN-*/` 齊備或 reviewer 豁免理由 in PR comment)
- toolchain isolation(升級 PR diff 僅動 version_declaration_site + lockfile)
- pre-`/speckit-implement` 人類 review(FR-013)

**Failure modes**(節錄):
- host-pass / container-fail → container parity 缺陷,計入 SC-008 配額(季度 ≤ 1)
- package.json 改動但 lockfile 未更新 → Dockerfile build 階段 `--frozen-lockfile` 直接失敗
- toolchain bump PR 夾帶其他變更 → reviewer 駁回,要求拆 PR

## 8. Toolchain Pin

CORE 工具的版本宣告位置與升級規則。

**Pinned items**:
- `spec-kit`:`.devcontainer/post-create.sh` `SPEC_KIT_VERSION="v0.8.1"`
- `Node`:`.nvmrc`(`22`)+ `package.json` `engines.node: ">=22"`(by `engine-strict`)
- `pnpm`:`package.json` `packageManager: "pnpm@9.12.0+sha512..."`
- `vitest`:`package.json` `devDependencies.vitest: "^4.0.0"`
- `wrangler` / `@cloudflare/workers-types` / `@cloudflare/vitest-pool-workers`:由 002 引入,版本釘於 `package.json`
- `Anthropic devcontainer features`:`devcontainer.json` `features` 條目(`:1` 主版本)

**Upgrade rule**(FR-019):
- 孤立 commit:diff 僅動 version_declaration_site + lockfile,不夾雜其他重構或行為變更
- `git revert <commit>` 應可單獨回退,無需處理交錯衝突
- 升級 commit message 用 `chore(deps)` / `chore(toolchain)` prefix,subject 含 from→to 版本

---

## Relationships(高階)

```
Adopter ──uses──▶ DevContainer Definition
Adopter ──delivers feature via──▶ Feature Spec Artifact
Feature Spec Artifact ──gated by──▶ Quality Gate
Feature Spec Artifact ──conforms to──▶ Constitution
Application Stack (Node) ──tested by──▶ Quality Gate (Tests)
Application Stack (Node) ──exposes──▶ Observability surface
Application Stack (Worker, Reserved) ──forward-declared in──▶ Constitution + spec FR-021
Toolchain Pin ──amended via──▶ isolated commit (FR-019)
Toolchain Pin ──verified by──▶ DevContainer build + CI(CI 為 future feature)
Constitution ──supersedes──▶ README + CLAUDE.md + external skills
```

每條關係的 invariant 已寫入對應實體 attributes / lifecycle 段。
