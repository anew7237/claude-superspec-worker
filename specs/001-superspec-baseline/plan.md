# Implementation Plan: SuperSpec Worker Monorepo Baseline

**Branch**: `001-superspec-baseline` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-superspec-baseline/spec.md`

## Summary

把 `claude-superspec-worker` unified monorepo 當前已實作的開發環境(devcontainer + Spec-Kit + Superpowers + Hono Node baseline + monorepo 結構)規格化為 baseline spec(22 FR / 11 SC / 5 user stories / 12 edge cases / 3 clarifications),並透過本 plan 產出對應的 process model、契約面文件、與 quickstart,作為:

1. 對「現有 monorepo 是否實際達成 baseline 規範」的可審計對照基準(gap analysis)。
2. 後續對 monorepo 任何修改的 anchor — 偏離 baseline 的變更需走憲法修訂或承認 derivative 契約鬆綁。
3. Adopter 的「採用契約」單一事實來源 — 把分散在 README / 憲法 / `.devcontainer/` / `.specify/` / `.docs/` 的隱含承諾收斂成單一 spec。
4. 002-cloudflare-worker 在 plan 階段可直接 cite 的規範 anchor — Worker 端落地時不必重新 derive 觀測 / 品質 / 跨平台 / 隔離規則,只要 reference 001 即可。

**技術取徑**:本 baseline 是 meta-project(對 monorepo 自身的規格),不引入新 application 行為。Phase 0 的 research 聚焦於「現有 monorepo 對 22 FRs 的覆蓋率分析」與「3 個 clarification decisions 的固化」。Phase 1 的 design artifacts 將「規範實體」(Adopter / DevContainer Definition / Constitution / Feature Spec Artifact / Application Stack ×2 / Quality Gate / Toolchain Pin)視為 process entities 建模,並在 `contracts/` 中以介面契約形式凍結 monorepo 對 adopter 暴露的承諾(CLI pipeline、devcontainer、observability、quality gates、sensitive material 五份;每份都同時涵蓋 Node 端的當前狀態與 Worker 端的 forward-declared reservation)。

## Technical Context

**Language/Version**: TypeScript 5.7+(strict mode)。Bash + uv(spec-kit 安裝)。Node.js ≥ 22(由 `package.json` `engines.node` + `.npmrc` `engine-strict=true` 機器強制)。Worker runtime 將跑於 Cloudflare Workers V8 isolate(由 002 落地;在 v1.0.0 ratification 時尚未引入 `wrangler` 與 Workers types)。

**Primary Dependencies**: Node 端 — Hono 4.x + `@hono/node-server`、`pg`(PostgreSQL)、`redis`、`pino`(structured log)、`prom-client`(metrics)。Worker 端(forward-declared,由 002 引入) — Hono(共用)、`wrangler` 3.x、`@cloudflare/workers-types`、`@cloudflare/vitest-pool-workers`。Spec-kit 0.8.1、Anthropic devcontainer feature `claude-code:1`、`docker-outside-of-docker:1`、`node:1`、`git:1`、`github-cli:1`、obra/superpowers skills。

**Storage**: PostgreSQL via `pg`、Redis via `redis`(Node 端 stack)。Worker 端規劃使用 D1(SQL)+ KV(cache),由 002 落地。本 baseline 不引入新 storage,不變更 schema。

**Testing**: vitest 4.x;Node 端測試於 dev container 內透過 `pnpm test` 執行(背後 `vitest run`),Worker 端測試將透過 `@cloudflare/vitest-pool-workers` 驅動 miniflare(由 002 落地,本 baseline 預留結構但無實測)。Baseline 自身的驗證透過「對 22 FRs 的 manual gap analysis」+「在 macOS / WSL2 兩平台跑同一 commit 的 test/lint/typecheck diff 為零」驗證 SC-002。

**Target Platform**: 主機面向 macOS Apple Silicon + Linux WSL2 Ubuntu;dev container 內為 Linux(`debian-slim` 系)。Production deployment 為 per-runtime — Node 端 multi-stage Docker image,Worker 端 `wrangler deploy` 至 Cloudflare edge。Native Windows、Linux desktop 直接跑、雲端 Codespaces 皆排除。

**Project Type**: Monorepo development environment template / scaffold(meta-project — 規格化 monorepo 自身)。

**Performance Goals**:

- Onboarding(乾淨機器 → Node 應用 stack 全綠 healthcheck):首次 build ≤ 15 min;再次 reopen ≤ 3 min(SC-001)。
- Adopter 的第一個自家 feature 走完整 SDD pipeline ≤ 1 hour(SC-007)。
- 任何新 HTTP route 在 Node 端 `/metrics` 1 分鐘內可見(SC-004)。
- Incident 偵測 MTTD ≤ 1 min(SC-010,因 metrics + structured log + healthcheck 就位)。

**Constraints**:

- 跨平台 parity(SC-002,Q2 Clarification):同一 commit 在 Mac / WSL2 上 test/lint/typecheck 結果 100% 等價,涵蓋 **Node 端與 Worker 端**;容器層級非語意性差異(時間戳、路徑前綴)允許,測試級別「同一 test 一邊 pass / 另一邊 fail」即計入 SC-008 配額。
- LF 行尾於 repo 層級強制(由 `.gitattributes` 實作)。
- Production image 非 root 執行;production stage 不含 dev / build / test 工具(Node 端 multi-stage Dockerfile 實作)。
- Build artifact(`node_modules/`、`dist/`、`.vitest-cache/`、`.wrangler/`)從不 bind-mount 跨主機檔案系統 — 用 named volume 或 ignore。
- Claude OAuth credentials = 0 出現於 git history(SC-006)。
- `/speckit-implement` 前必須有「至少一位人類(可為作者本人)」review spec + plan(FR-013)。
- 上游 outage 時 degraded mode:容器內快取繼續工作,新拉外部資源視為阻塞(FR-020)。
- Cross-runtime import ban(FR-022 / SC-011,Q3 Clarification):為 aspirational rule 自 v1.0.0 起;mechanical enforcement(typecheck-level)由 002 落地後正式生效。在此之前 Worker 端不存在,違規空間客觀為 0。
- Single-runtime fork derivative status(FR-018,Q1 Clarification):兩種單一 runtime fork(Node-only / Worker-only)皆為合格 derivative,前提是 `.devcontainer/` + spec-kit pipeline 保留。

**Scale/Scope**:

- Surface files:約 35 個 monorepo-面 檔案(`.devcontainer/` 4 個、`.specify/` 結構若干、根 config 14 個、`Makefile`、`docker-compose.yml`、`Dockerfile`、`.gitignore`、`.gitattributes`、`.npmrc`、`.nvmrc`、`.prettierignore`、`.prettierrc.json`、`tsconfig.json`、`tsconfig.lint.json`、`eslint.config.js`、`pnpm-lock.yaml`、`package.json`)。
- 範例 Node application:`src/node/` 7 檔(`app.ts`、`index.ts`、`db.ts`、`redis.ts`、`logger.ts`、`metrics.ts`、`http-metrics.ts`);`tests/node/` 8 檔(`health.test.ts`、`metrics.test.ts`、`http-metrics.{test,bench,label-shape,opt-out,sc007,regression}.ts`)。
- Reserved Worker structure:`src/worker/`、`src/shared/`、`tests/worker/` 三個路徑於 v1.0.0 為 forward-declared(空 / 不存在);實際內容由 002 引入。
- Spec 工件本身:22 FR、11 SC、5 user stories、12 edge cases、3 clarifications、8 key entities。
- 預計同時 active 的 derivative repos:**未量化**(取決於採用速度;baseline 不對 derivative 數量設目標)。

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

依憲法 v1.0.0 五原則對照本 baseline plan:

| Principle | 對齊狀態 | 證據 / 對應 |
|---|---|---|
| **I. Test-First Development (NON-NEGOTIABLE)** | ✅ 對齊 | 本 baseline 是 meta-project,不新增 application 行為。FR-005 把 TDD 紀律寫進 baseline;範例 Node 應用既有測試已遵守此模式(`tests/node/http-metrics.*.test.ts` 涵蓋 label shape / opt-out / SC-007 等情境)。Plan 不引入未經測試的新行為。Worker 端測試於 002 落地時依同紀律(vitest + miniflare)實作。 |
| **II. Observability by Default** | ✅ 對齊 | Node 端範例應用已實作 `/metrics`、`/health`、pino structured log、http-metrics middleware(`src/node/http-metrics.ts`);FR-006 把此承諾規格化(Node 端完整、Worker 端僅 `/health` + Workers Logs)。Plan 不變更現行觀測契約;觀測機制的 per-runtime 差異已在 spec FR-006 與憲法 Principle II 中明示。 |
| **III. Container-First Development, Per-Runtime Deployment** | ✅ 對齊 | `.devcontainer/` 已就位(devcontainer.json + Dockerfile + post-create.sh + init-firewall.sh);docker-outside-of-docker 已配置;`docker-compose.yml` 編排 Node 端 app + db + redis;`Makefile` 為單一 inner loop 入口。FR-001 / FR-003 / FR-017 把規範固化。Worker 端 production 走 wrangler deploy(由 002 引入),不違反 Container-First Dev 原則 — 因為原則本身已宣告 dev 與 deploy 分離。 |
| **IV. Type Safety End-to-End** | ✅ 對齊 | `tsconfig.json` 已 strict、`tsconfig.lint.json` 給 ESLint 用、`eslint.config.js`(flat config)+ Prettier 3 已配置。FR-008 機器強制 Node ≥ 22(`engine-strict=true`)。雙 tsconfig 拆分(`tsconfig.{node,worker}.json`)由 002 落地,規範於 FR-022;v1.0.0 為 aspirational(Q3 Clarification),不破壞當前 Type Safety。 |
| **V. Spec-Driven Development** | ✅ 對齊 | 本 plan 即 SDD pipeline 的產物 — feature branch `001-superspec-baseline` 由 `before_specify` hook 建立;spec 已通過 quality checklist 16/16;3 題 clarify 已落地;本 plan 含 Constitution Check;`/speckit-implement` 前的人類 review gate 由 FR-013 規範。 |

**結論**:無 violations,Phase 0 可放行。Plan 不引入任何 deviation,因此 Complexity Tracking 留空。

## Project Structure

### Documentation (this feature)

```text
specs/001-superspec-baseline/
├── plan.md                  # 本檔(/speckit-plan 輸出)
├── spec.md                  # /speckit-specify + /speckit-clarify 輸出
├── research.md              # Phase 0 輸出 — 3 個 clarification decisions 固化 + 22 FR gap analysis
├── data-model.md            # Phase 1 輸出 — 規範實體模型(8 entities)
├── quickstart.md            # Phase 1 輸出 — adopter 採用 walkthrough
├── contracts/               # Phase 1 輸出 — monorepo 對 adopter 的契約面
│   ├── cli-pipeline.md      #   SDD pipeline 指令契約
│   ├── devcontainer.md      #   DevContainer reopen-to-ready 契約
│   ├── observability.md     #   /metrics、/health、pino、HTTP_METRICS_ENABLED 契約(per-runtime 分節)
│   ├── quality-gates.md     #   pnpm test / typecheck / lint / format 契約(雙 runtime 涵蓋)
│   └── sensitive-material.md#   .gitignore deny list 與 credential 隔離契約(含 .dev.vars)
├── checklists/
│   └── requirements.md      # spec quality checklist(已產出於 /speckit-specify)
└── tasks.md                 # Phase 2 輸出 — 由 /speckit-tasks 產生(本指令不建)
```

### Source Code (repository root)

本 baseline 是 meta-project,**不引入新 src / tests 結構**。Plan 涵蓋的範圍是 monorepo 面向 adopter 的「契約檔」,既有結構維持不動:

```text
.
├── .claude/                  # 共用 skills + settings(進 git)
├── .devcontainer/            # devcontainer.json / Dockerfile / post-create.sh / init-firewall.sh
├── .docs/                    # 設計文件 / runbook(non-spec 工作筆記;含 cloudflare-worker 設計稿、b-narrow toolchain cleanup design+plan)
├── .specify/                 # constitution / templates / scripts / extensions
│   ├── memory/constitution.md
│   ├── templates/{spec,plan,tasks,checklist,constitution}-template.md
│   ├── scripts/bash/         # check-prerequisites.sh / setup-plan.sh / create-new-feature.sh
│   ├── extensions/git/       # spec-kit git extension
│   └── feature.json          # 由 /speckit-specify 寫入,鎖定 active feature dir
├── specs/                    # 各 feature 的 spec / plan / tasks(spec-kit 產物,於 repo root)
│   └── 001-superspec-baseline/
├── src/
│   ├── node/                 # Node 端應用程式碼(Hono + pg + redis + pino + prom-client)
│   ├── worker/               # 【Reserved by FR-021;由 002 引入】Worker entry + routes
│   └── shared/               # 【Reserved by FR-021;由 002 引入】runtime-agnostic 型別與常數
├── tests/
│   ├── node/                 # Node 端測試(vitest)
│   └── worker/               # 【Reserved;由 002 引入】Worker 端測試(vitest + miniflare)
├── scripts/db-init/          # postgres 第一次啟動的初始化 SQL(放 root)
├── docker-compose.yml        # Node 端 app + db + redis 編排(放 root)
├── Dockerfile                # Node 端 multi-stage:dev + production(放 root)
├── Makefile                  # inner-loop 單一入口(Node 端)
├── package.json              # 單一 manifest 涵蓋兩 runtime;engines.node ≥ 22
├── pnpm-lock.yaml            # 鎖版,必 commit
├── tsconfig.json             # build 用,strict 模式;雙 tsconfig 拆分由 002 落地
├── tsconfig.lint.json        # ESLint 用,extends tsconfig.json
├── eslint.config.js          # ESLint 9 flat config(no-console for src/**/*.ts)
├── .prettierrc.json          # Prettier 3 配置
├── .prettierignore           # 排除 .specify/ / CLAUDE.md / wrangler.jsonc(後者預先,002 引入)
├── .gitattributes            # LF 行尾強制
├── .gitignore                # secret / artifact deny list(含 .dev.vars)
├── .npmrc                    # engine-strict=true
├── .nvmrc                    # 釘 Node 22
├── .env.example              # 環境變數範例
├── CLAUDE.md                 # Claude Code runtime 指引 + Git workflow project override
└── README.md                 # adopter-facing 文件(monorepo dual-runtime layout)
```

**Structure Decision**: Meta-project,沿用既有 monorepo 結構。Plan 的「實作」聚焦於文件產出(plan + research + data-model + contracts + quickstart),以及 `CLAUDE.md` 的 SPECKIT marker 更新指向本 plan。任何對既有 surface files 的修改若被 gap analysis 發現必要(例:某 FR 未被現有 monorepo 完全滿足),會在後續 `/speckit-tasks` 步驟拆成獨立 task,於 `/speckit-implement` 時改動 — 而非在本 plan 階段直接動手。Worker 端的 `src/worker/` / `src/shared/` / `tests/worker/` 三個 reserved 路徑於 v1.0.0 為空(由 002 落地),plan 不在此階段建立 stub。

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

(無 violation;本 baseline 與五原則完全對齊)
